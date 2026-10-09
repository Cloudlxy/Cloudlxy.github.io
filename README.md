# xiaoyu's blog

用 **Hexo + Git + GitHub Pages** 搭建的个人博客。

- 线上地址：<https://cloudlxy.github.io/>
- 源码仓库：<https://github.com/Cloudlxy/Cloudlxy.github.io>
- 本地预览：<http://localhost:4000/>

> 仓库名叫 `Cloudlxy.github.io`（即 `<用户名>.github.io`），属于 GitHub Pages 的**用户站点**，
> 所以网址是**根路径**，没有 `/仓库名` 这一层。

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

打开 <http://localhost:4000/>，`Ctrl+C` 停止。

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
git remote add origin https://github.com/Cloudlxy/Cloudlxy.github.io.git   # 已配置
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

等一两分钟，访问 <https://cloudlxy.github.io/> 即可。

用户站点的仓库**一个账号只能有一个**，`Cloudlxy.github.io` 这个名字不能再给别的仓库用。

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

### 2. `url` / `root` 必须和仓库类型配对

GitHub Pages 分两种，**网址形状完全不同**，`_config.yml` 必须跟着改：

| 仓库名 | 类型 | 网址 | `url` / `root` |
| --- | --- | --- | --- |
| `Cloudlxy.github.io` | 用户站点 | `https://cloudlxy.github.io/` | `https://cloudlxy.github.io` / `/` |
| 其他任意名字（如 `XiaoyuBlog`） | 项目站点 | `https://cloudlxy.github.io/XiaoyuBlog/` | `https://cloudlxy.github.io/XiaoyuBlog` / `/XiaoyuBlog/` |

本站原本叫 `XiaoyuBlog`（项目站点），后来改名为 `Cloudlxy.github.io` 换成根地址，
所以现在是：

```yaml
url: https://cloudlxy.github.io
root: /
```

**改仓库名时一定要同步改这两行。** 写错的表现是页面能打开但**完全没有样式**，
因为 CSS 和图片全部 404 —— 它们还指向旧的 `/XiaoyuBlog/` 路径。

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

### 5. 主题配置只能「加」不能「删」（deepMerge）

`_config.<主题名>.yml` 不是替换主题自带配置，而是**深合并**进去。Hexo 源码里就是这一行：

```js
ctx.theme.config = deepMerge(ctx.theme.config, ctx.config.theme_config)
```

深合并只能新增键、或覆盖同名键的值，**删不掉键**。这个坑真的踩过一次：landscape 主题的
`_config.yml` 里写死了 `Home` / `Archives` 两个菜单项，我们定义中文菜单后，导航变成
`Home / Archives / 首页 / 归档 / 标签 / 分类` 六项、两组重复。当时的解法是加一个
`scripts/theme-menu.js`，在生成前 `delete hexo.theme.config.menu.Home`。

**换成 Butterfly 后这个问题自动消失**，因为 Butterfly 默认的 `menu:` 是空的（整段注释掉），
写什么就显示什么，所以那个脚本已经删掉了。但以后如果换到**默认菜单非空**的主题，
重复还会再出现，届时有两条路：

- 写个 `scripts/` 脚本把多余的键删掉 —— `scripts/` 是 Hexo 官方扩展点，启动时自动加载，
  而且不会被 `npm install` 覆盖
- 或者把主题从 `node_modules` 复制到 `themes/<名字>/`，直接改它自己的 `_config.yml`

### 6. 「标签」「分类」页必须手动创建

Hexo **不会**自动生成 `/tags/` 和 `/categories/` 这两个索引页（它只生成 `tags/<标签名>/`
这类具体页面）。所以导航里如果写了这两个链接，不手动建页面就是 **404** —— 本站就曾经因此
挂过两个死链，而且因为只测了 `/categories/notes/` 这种具体分类页，一直没发现。

建法是创建带 `type` 的页面：

```bash
npx hexo new page tags
```

然后把 `source/tags/index.md` 的 front-matter 补上 `type: tags`（分类页则是 `type: categories`）。
主题会依据这个 `type` 渲染出「全部标签 / 全部分类」列表。

## 换主题

当前用的是 **Butterfly 5.7.0**，配置在 `_config.butterfly.yml`。做法是把主题自带的
`node_modules/hexo-theme-butterfly/_config.yml` 整个复制到根目录再改 —— 这样所有可选项
都带注释摆在手边，而且键名和主题默认配置完全一致，深合并不会出意外。

想换别的主题，以 Fluid 为例：

```bash
npm install hexo-theme-fluid --save
```

然后改 `_config.yml` 里的 `theme: fluid`，再新建 `_config.fluid.yml`。别忘了清理上一个主题
专属的文件（比如 `_config.butterfly.yml`），并按新主题的文档补装它需要的渲染器或插件。

几个主题的现状（2026-10 查证）：**Fluid / Butterfly / NexT / Keep 都在活跃维护**；
**Volantis 6.8.3 要求 Hexo ^8.1.1**（本项目是 7.3，装它会把 Hexo 一起升到大版本，不建议）；
**Stellar 依赖 `sharp` 原生模块**，在受限环境里装容易失败。

## 目录速查

```
├── _config.yml             # 站点总配置（标题、网址、根路径、部署）★改这里
├── _config.butterfly.yml   # 主题配置（从主题自带配置复制而来）
├── scaffolds/              # 新建文章的模板（post / page / draft）
├── source/
│   ├── _posts/             # 文章★写这里
│   ├── tags/index.md       # 「标签」页，靠 type: tags 渲染
│   ├── categories/index.md # 「分类」页，靠 type: categories 渲染
│   ├── favicon.png         # 站点图标（浏览器标签页那个）
│   ├── img/banner.jpg      # 首页背景图
│   └── .nojekyll           # 让 GitHub Pages 跳过 Jekyll，需配合 ignore_hidden: false
├── public/                 # 生成结果（已 gitignore，勿手改）
└── package.json
```

## 下一步可以做的

- 用 GitHub Actions 自动构建，push 源码即自动发布，连 `hexo deploy` 都省了
- 绑定自定义域名并在 Pages 里开启 HTTPS
- 接入评论系统（Twikoo / Giscus / Valine）和统计
- 把图片 CDN 本地化：`npm install hexo-butterfly-extjs`，再把 `third_party_provider` 改成 `local`
