# XiaoyuBlog

用 **Hexo + Git + GitHub Pages** 搭建的个人博客。

- 线上地址：<https://cloudlxy.github.io/XiaoyuBlog/>
- 源码仓库：<https://github.com/Cloudlxy/XiaoyuBlog>
- 本地预览：<http://localhost:4000/XiaoyuBlog/>

## 它是怎么工作的

```
本地写 Markdown  →  hexo generate  →  public/ 静态文件  →  hexo deploy  →  gh-pages 分支  →  GitHub Pages
```

两个分支各司其职，**不要手动改 gh-pages 分支**：

| 分支 | 内容 | 谁在写 |
| --- | --- | --- |
| `main` | Hexo 源码（配置、文章、模板） | 你 |
| `gh-pages` | 生成的 `public/` 静态文件 | `hexo deploy` 自动强推 |

## 环境要求

- Node.js ≥ 14（当前开发环境 v22.14.0）
- Git
- npm（本机已配置 npmmirror 镜像，安装更快）

## 本地跑起来

```bash
npm install          # 首次安装依赖
npx hexo server      # 启动本地预览
```

打开 <http://localhost:4000/XiaoyuBlog/>，`Ctrl+C` 停止。

`npx hexo server` 会监听文件变化并自动重新生成，改完 Markdown 刷新浏览器即可。

## 写一篇新文章

```bash
npx hexo new post "文章标题"
```

生成的文件在 `source/_posts/`。**建议用英文文件名**，例如：

```bash
npx hexo new post --path my-first-note "我的第一篇笔记"
```

因为文件名会进入永久链接，中文名会变成 `%E4%BD%A0%E5%A5%BD...` 这样的转义字符。
文件名叫 `my-first-note.md`，标题照样可以写中文。

写完后本地预览确认，然后发布：

```bash
npm run publish      # 等于 hexo clean && hexo generate && hexo deploy
```

## 首次推送到 GitHub

`hexo deploy` 会推 `gh-pages` 分支，但 `main` 分支的源码需要你手动推一次：

```bash
git remote add origin https://github.com/Cloudlxy/XiaoyuBlog.git   # 已配置
git push -u origin main
```

GitHub 早已不支持账号密码推送，需要凭据。本机**已安装 Git Credential Manager**
（系统级 `credential.helper=manager`），所以第一次 `git push` 时会自动弹出浏览器完成
GitHub 授权，之后凭据会被记住，不用反复登录。

如果不想用 GCM，也可以手动用 **Personal Access Token**：

1. 打开 <https://github.com/settings/tokens> → Generate new token (classic)
2. 勾选 `repo` 权限，生成后复制令牌
3. 推送时用户名填 `Cloudlxy`，**密码位置粘贴令牌**

或者装 [GitHub CLI](https://cli.github.com/) 用 `gh auth login` 走浏览器授权。

## 开启 GitHub Pages

推送完成后，在仓库页面设置：

**Settings → Pages → Source** 选择 `Deploy from a branch`，
分支选 **`gh-pages`**，目录选 **`/ (root)`**，保存。

等一两分钟，访问 <https://cloudlxy.github.io/XiaoyuBlog/> 即可。

## 本机踩过的坑

### 1. git 访问 GitHub 报 TLS 错误

```
schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030E)
```

本机 git 默认走 Windows 的 schannel，连 GitHub 会失败；改用 OpenSSL 后端正常：

```bash
git config --global http.sslBackend openssl
```

本仓库已在 `.git/config` 里配置了同样的设置，所以在这个目录里 `git push` 是可以的。

### 2. 项目站点的根路径必须配对

本站属于 **Project Pages**，网址比用户站点多一层 `/XiaoyuBlog`，
所以 `_config.yml` 里必须同时写 `url` 和 `root`：

```yaml
url: https://cloudlxy.github.io/XiaoyuBlog
root: /XiaoyuBlog/
```

`root` 的首尾斜杠都不能少。写错的表现是：页面能打开但**完全没有样式**，
因为 CSS 和图片都 404 了。用 `hexo server` 本地预览时也要带上 `/XiaoyuBlog/` 这一层。

### 3. 中文分类/标签会产生转义网址

用 `category_map` / `tag_map` 把中文映射成英文链接：

```yaml
category_map:
  折腾记录: notes      # → /categories/notes/
```

改 `permalink`、`category_map` 这类会影响网址的配置要趁早，上线之后再改会让旧链接失效。

### 4. 受限环境下的 npm

如果在文件权限受限的环境里遇到 `EPERM`：

```bash
npm install --cache ./.npm-cache --ignore-scripts
```

`--cache` 把缓存放到项目内，`--ignore-scripts` 跳过依赖的安装脚本。
普通桌面环境下不需要这两个参数。

## 换主题

以 Fluid 为例：

```bash
npm install hexo-theme-fluid --save
```

然后改 `_config.yml`：

```yaml
theme: fluid
```

主题配置写在 `_config.fluid.yml`（主题自己的配置文件在 `node_modules` 里，
不要直接改，升级会丢）。其他常用主题：Butterfly、NexT、Volantis。

## 目录速查

```
├── _config.yml            # 站点总配置（网址、根路径、部署）★改这里
├── _config.landscape.yml  # 当前主题配置
├── scaffolds/             # 新建文章的模板（post / page / draft）
├── source/
│   ├── _posts/            # 文章★写这里
│   └── favicon.png        # 站点图标
├── public/                # 生成结果（已 gitignore，勿手改）
└── package.json
```

## 下一步可以做的

- 用 GitHub Actions 自动构建，push 源码即自动发布，连 `hexo deploy` 都省了
- 绑定自定义域名并在 Pages 里开启 HTTPS
- 接入评论系统（Valine / Giscus）和统计（Google Analytics / 百度统计）
- 换一个更适合中文阅读的主题
