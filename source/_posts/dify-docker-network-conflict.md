---
title: Dify 部署踩坑：Docker 网段冲突导致校外无法访问
date: 2026-05-11 18:06:37
tags:
  - Docker
  - Dify
  - 网络排查
categories:
  - 折腾记录
---

一台校园网里的服务器，Dify 用 Docker Compose 部署。这篇记录的是两个前后相连的故障：

1. **校外完全访问不了** —— Docker 自动分配的虚拟网段和校园网段撞车，把校外流量的路由「劫持」到了 Docker 网桥上。
2. **按建议改完地址池、删掉冲突路由之后，校外依然访问不了** —— 因为旧的 Compose 网络没有重建，容器还在用那个已经被删掉路由的旧网段，回包被丢弃。

第一个问题解决的是「路由」，第二个问题解决的是「网络」。**只删路由、不重建网络，等于没修完** —— 这是整件事最值得记下来的一点。

<!-- more -->

## 环境

| 项目 | 值 |
| --- | --- |
| 服务器 IP | `172.30.38.36` |
| 校园网段 | `172.30.38.0/24`，网关 `172.30.38.1` |
| 网卡 | `ens7` |
| Dify 部署方式 | Docker Compose，源码路径 `/workspace/dify/docker` |
| Dify 版本 | `langgenius/dify-api:1.13.3` |
| Nginx | `nginx:1.29.8`（跑在容器里） |

## 问题一：校外访问不了，是 Docker 劫持了路由

### 现象

`ip route` 里冒出了两条本不该存在的路由：

```bash
ip route
```

```text
default via 172.30.38.1 dev ens7 proto static metric 100
172.18.0.0/16 dev br-c2d97689e6f0 proto kernel scope link src 172.18.0.1
172.28.0.0/16 dev br-3603dc913a0f proto kernel scope link src 172.28.0.1
172.30.38.0/24 dev ens7 proto kernel scope link src 172.30.38.36 metric 100
192.168.0.0/24 dev docker0 proto kernel scope link src 192.168.0.1 linkdown
192.168.122.0/24 dev virbr0 proto kernel scope link src 192.168.122.1 linkdown
```

症状很有迷惑性：**校内访问完全正常，只有校外访问黑屏、连不上。**

### 原因

- 校内访问 `172.30.38.36` 走的是**直连网段，不经过网关**，所以毫发无伤。
- 校外访问必须经过默认网关 `172.30.38.1`。
- 而 `172.18.0.0/16`、`172.28.0.0/16` 和校园网段 `172.30.38.0/24` 同属 `172.16.0.0/12` 这个大段。**路由匹配时掩码更长（更具体）的条目优先级更高**，于是去往 `172.30.x` 的校外回包被强行引向 Docker 网桥 —— 网桥上当然没有对应目标，流量直接丢包。

这两个网段是哪来的？Docker 创建自定义桥接网络（`br-xxx` 这种名字）时，默认从 `172.16.0.0/12` 里分配子网。**反复 `docker compose down/up -d` 重启 Dify，每次都新建网络，就攒出了好几个撞车的网段。**

> 用 `docker network ls` 可以验证这些 `br-xxx` 网桥确实归属 Docker 的自定义网络。

### 处理

**第一步：临时恢复校外访问** —— 关掉冲突的两个网桥：

```bash
ip link set br-c2d97689e6f0 down
ip link set br-3603dc913a0f down
```

这一步能让校外访问立刻恢复，但**只是止血**：网桥关了，系统里的冲突路由条目还在。

**第二步：删掉残留的冲突路由**

```bash
ip route del 172.18.0.0/16
ip route del 172.28.0.0/16
```

再执行一次 `ip route`，确认 `172.18`、`172.28` 两条已经消失。

**第三步：永久根治** —— 按学校要求改 Docker 默认地址池，改用 `192.168` 网段，同时保留镜像加速配置：

`vi /etc/docker/daemon.json`

```json
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://pypi.tuna.tsinghua.edu.cn/simple"
  ],
  "default-address-pools": [
    { "base": "192.168.100.0/16", "size": 24 }
  ]
}
```

```bash
systemctl daemon-reload
systemctl restart docker
```

**第四步：清理无用的 Docker 网络**

```bash
docker network prune -f
```

**第五步：重启 Dify**

```bash
cd /workspace/dify/docker
docker compose up -d
```

### 验证

`ip route` 里不再有 `172.18`、`172.28` 网段，校外访问 Dify 恢复正常，反复重启容器也不再出问题。Docker 之后新建网络会从 `192.168.100.0/16` 里分配，和校园网的 `172.30.38.0/24` 彻底隔离。

## 问题二：改完之后，依然访问不了

改完地址池、删完路由，本以为收工了。结果 `http://172.30.38.36/` 还是打不开。

### 现象

`curl` 第一次长时间卡住，再来一次直接连接重置：

```bash
curl -v http://172.30.38.36/
```

```text
*   Trying 172.30.38.36...
* TCP_NODELAY set
* Connected to 172.30.38.36 (172.30.38.36) port 80 (#0)
> GET / HTTP/1.1
> Host: 172.30.38.36
> User-Agent: curl/7.61.1
> Accept: */*
>
(长时间无响应，手动中断)
```

```text
* Recv failure: 连接被对方重设
* Closing connection 0
curl: (56) Recv failure: 连接被对方重设
```

**注意 `Connected ... port 80` 这一行是成功的。** TCP 握手通了，说明不是防火墙、也不是端口没监听，而是 Nginx 拿不到后端的正常响应。

### 排查

**1. 容器和端口都正常**

```bash
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

```text
NAMES                       STATUS                     PORTS
docker-nginx-1              Up 8 minutes               0.0.0.0:80->80/tcp, :::80->80/tcp, 0.0.0.0:443->443/tcp, :::443->443/tcp
docker-api-1                Up 8 minutes               5001/tcp
docker-worker_beat-1        Up 8 minutes               5001/tcp
docker-worker-1             Up 8 minutes               5001/tcp
docker-unstructured-1       Up 8 minutes               8000/tcp
docker-web-1                Up 8 minutes               3000/tcp
docker-sandbox-1            Up 8 minutes (healthy)
docker-plugin_daemon-1      Up 8 minutes               0.0.0.0:5003->5003/tcp, :::5003->5003/tcp
docker-redis-1              Up 8 minutes (healthy)     6379/tcp
docker-ssrf_proxy-1         Up 8 minutes               3128/tcp
docker-weaviate-1           Up 12 minutes
docker-db_postgres-1        Up 12 minutes (healthy)    5432/tcp
```

```bash
ss -tlnp | grep ':80 '
```

```text
LISTEN 0      4096         0.0.0.0:80        0.0.0.0:*    users:(("docker-proxy",pid=3819941,fd=4))
LISTEN 0      4096            [::]:80           [::]:*    users:(("docker-proxy",pid=3819949,fd=4))
```

容器都在跑，宿主机 80 端口由 `docker-proxy` 正常监听。

**2. Nginx 日志干净**

```bash
docker logs docker-nginx-1 --tail 100
```

只有正常的启动 notice（`nginx/1.29.8`、`using the "epoll" event method`、`start worker processes`），**没有任何 error**。Nginx 进程是好的，那问题大概率出在「代理到后端」这一段。

**3. 从 Nginx 容器内部测后端 —— 这里是转折点**

```bash
docker exec -it docker-nginx-1 sh
```

容器内执行：

```bash
curl -v http://web:3000
curl -v http://api:5001/health
```

```text
* Host web:3000 was resolved.
* IPv4: 172.18.0.7
*   Trying 172.18.0.7:3000...
* Connected to web (172.18.0.7) port 3000
> GET / HTTP/1.1
< HTTP/1.1 307 Temporary Redirect
< location: /apps
```

```text
* Host api:5001 was resolved.
* IPv4: 172.18.0.11
* Connected to api (172.18.0.11) port 5001
< HTTP/1.1 200 OK
{"pid": 25, "status": "ok", "version": "1.13.3"}
```

**容器内部一切正常**：web 返回 307 跳 `/apps`，api 健康检查返回 200。但请盯住解析出来的地址 —— **`172.18.0.7`、`172.18.0.11`，正是那个已经被删掉路由的旧网段。**

**4. 确认网络还在用旧子网**

```bash
docker network ls
docker inspect docker-nginx-1 | grep -A 5 "Networks"
```

```text
NETWORK ID     NAME                        DRIVER    SCOPE
0271fa6b25f2   bridge                      bridge    local
c2d97689e6f0   docker_default              bridge    local
717ee911a842   docker_ssrf_proxy_network   bridge    local
```

```text
"Networks": {
    "docker_default": {
        "IPAMConfig": null,
        "Aliases": [
            "docker-nginx-1",
```

Dify 的容器仍然挂在 `docker_default` 上，而**这个网络的子网还是旧的 `172.18.0.0/16`**。原因很简单：改 `default-address-pools` 只影响「以后新建的网络」，不会动已经存在的网络。

**5. 宿主机路由表里已经没有旧网段了**

```bash
ip route
```

```text
default via 172.30.38.1 dev ens7 proto static metric 100
172.30.38.0/24 dev ens7 proto kernel scope link src 172.30.38.36 metric 100
192.168.0.0/24 dev docker0 proto kernel scope link src 192.168.0.1 linkdown
192.168.1.0/24 dev br-717ee911a842 proto kernel scope link src 192.168.1.1
192.168.122.0/24 dev virbr0 proto kernel scope link src 192.168.122.1 linkdown
```

`172.18.0.0/16` 的路由确实没了（`192.168.1.0/24` 是改完地址池后新建的 ssrf_proxy 网络），但 `docker_default` 还抱着旧子网不放。

### 根因：删了路由，却没重建网络

完整链条是这样的：

1. 外部请求到达 Nginx —— 它自己就是 `docker_default` 里的容器，地址是 `172.18.0.x`。
2. Nginx 把请求代理给 `web` / `api`，目标是 **`172.18.0.x`**。
3. 后端在同一个网桥内能正常收到并处理，回复的包源地址是 `172.18.0.x`。
4. 这个回包要出宿主机时，宿主机上**已经没有 `172.18.0.0/16` 的路由**了 → 回包被丢弃，客户端看到的就是连接重置。

所以「容器内部自测全通、从外面访问全挂」是必然的：容器之间通信走的是网桥二层，根本不需要宿主机那条路由；一旦要跨出宿主机，路由缺失的问题就暴露了。

### 修复

**1. 先确认数据是持久化的（删容器前必做）**

```bash
ls -la /workspace/dify/docker/volumes/
```

```text
drwxr-xr-x 13 root root  177 4月  24 17:40 .
drwxr-xr-x  3 root root   18 3月  31 11:50 db
drwxr-xr-x  4 root root   29 3月  31 11:51 certbot
drwxr-xr-x  3 root root   20 3月  31 11:17 myscale
drwxr-xr-x  5 root root  323 4月   7 15:09 weaviate
drwxr-xr-x  3 root root   18 3月  31 11:50 redis
```

数据库、向量库、Redis 都通过 bind mount 落在宿主机目录里，**删容器不会丢数据**。

**2. 停掉并删除占用旧网络的容器**

```bash
docker stop docker-db_postgres-1 docker-weaviate-1
docker rm docker-db_postgres-1 docker-weaviate-1
```

**3. 删掉旧的 `docker_default` 网络**

```bash
docker network rm docker_default
```

```text
docker_default
```

**4. 带 profile 重新拉起 Dify**

```bash
cd /workspace/dify/docker
docker compose --profile postgresql --profile weaviate up -d
```

```text
[+] Running 14/14
 ✔ Network docker_ssrf_proxy_network    Created
 ✔ Network docker_default               Created
 ✔ Container docker-web-1               Started
 ✔ Container docker-db_postgres-1       Healthy
 ✔ Container docker-redis-1             Started
 ...
 ✔ Container docker-nginx-1             Started
```

**5. 验证新子网**

```bash
docker network inspect docker_default | grep Subnet
```

```text
"Subnet": "192.168.3.0/24",
```

`192.168.3.0/24` —— 已经落在我们设定的 `192.168.100.0/16` 地址池里了。

**6. 访问验证**

```bash
curl -v http://172.30.38.36/
```

```text
*   Trying 172.30.38.36...
* Connected to 172.30.38.36 (172.30.38.36) port 80 (#0)
> GET / HTTP/1.1
< HTTP/1.1 307 Temporary Redirect
< Server: nginx/1.29.8
< location: /apps
```

`307 → /apps`，和容器内部自测时后端返回的完全一致 —— **整条链路通了。** 再用 `docker ps` 复查，所有容器稳定运行、无重启。

### 后续优化

Dify 的有状态服务要靠 `--profile` 显式启动，很容易忘。写进 `.env` 一劳永逸：

```bash
echo "COMPOSE_PROFILES=postgresql,weaviate" >> /workspace/dify/docker/.env
```

## 复盘

**时间线**

| 时间 | 事件 |
| --- | --- |
| 5 月 6 日 | 校外无法访问，定位为 Docker 网段与校园网段冲突；关网桥、删路由、改地址池 |
| 5 月 11 日 | 改完仍然无法访问；查明是旧网络没有重建；删除并重建 `docker_default` 后恢复 |

**三条经验**

1. **改 `default-address-pools` 之后必须重建已有网络，只删路由是不够的。** 配置只约束「新建」的网络，已经存在的 `docker_default` 会一直沿用旧子网 —— 而它的路由又被删了，等于人为制造了一个「内部通、外部不通」的僵局。
2. **`docker compose down` 不等于删网络。** 反复 `up/down` 会不断新建自定义桥接网络，每次都从 `172.16.0.0/12` 里抓一段，迟早和真实网段撞上。要么固定地址池，要么显式管理网络。
3. **「容器内部通、外部不通」几乎一定是路由/网络层的问题，而不是应用层。** 本例里 Nginx 日志干净、容器 healthy、端口在监听，所有应用层指标都正常；真正的突破口是容器内 `curl` 打出来的是**已被删除路由的旧网段地址**。

**顺手记一个坑**：`ip link set br-xxx down` 只是关闭网桥，**不会删除系统里残留的冲突路由**，必须再用 `ip route del` 补一刀，否则路由表里那两条记录还在继续劫持流量。
