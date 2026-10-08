---
title: 你好，世界
date: 2026-10-08 17:43:40
tags:
  - Hexo
  - GitHub Pages
categories:
  - 折腾记录
---

这是本站的第一篇文章。它同时也可以当作一份「备忘」：把 Hexo + Git + GitHub 建站的关键步骤记下来，
以后换电脑或者重建站点时照着做就行。

<!-- more -->

## 整体思路

一句话概括：**Hexo 负责把 Markdown 变成静态网页，Git 负责记录改动，GitHub 负责托管和免费发布。**

```
本地写 Markdown  →  hexo generate  →  public/ 静态文件  →  git push  →  GitHub Pages 上线
```

为什么用静态博客：没有数据库、没有后端、不用服务器，访问速度快，而且 GitHub Pages 免费且自带 HTTPS。

## 目录结构

```
blog/
├── _config.yml            # 站点总配置（标题、网址、部署方式）
├── _config.landscape.yml  # 主题配置
├── scaffolds/             # 新建文章的模板
├── source/
│   ├── _posts/            # 你写的文章都放这里
│   └── favicon.png        # 站点图标
├── themes/                # 自定义主题（本站在用 npm 装的景观主题，所以这里是空的）
└── package.json           # 依赖清单
```

注意 `public/` 是生成出来的，**不要手工修改**，它在 `.gitignore` 里，不进版本库。

## 日常写作流程

新建一篇文章：

```bash
npx hexo new post "文章标题"
```

然后编辑 `source/_posts/文章标题.md`，写完本地预览：

```bash
npx hexo server
```

浏览器打开 <http://localhost:4000/XiaoyuBlog/> 就能看到效果，按 `Ctrl+C` 停止。

发布上线：

```bash
npx hexo clean && npx hexo generate && npx hexo deploy
```

## 两个容易踩的坑

**第一，项目站点的根路径。** 本站地址是 `https://cloudlxy.github.io/XiaoyuBlog/`，
比用户站点多了一层 `/XiaoyuBlog`。所以 `_config.yml` 里必须同时设置：

```yaml
url: https://cloudlxy.github.io/XiaoyuBlog
root: /XiaoyuBlog/
```

`root` 结尾的斜杠不能少，否则 CSS 和图片全部 404，页面会变成没有样式的纯文本。

**第二，文件名尽量用英文。** 文章的文件名会进入永久链接。如果文件名叫 `你好世界.md`，
链接就会变成一长串 `%E4%BD%A0%E5%A5%BD...` 的转义字符。用 `hello-world.md` 这种英文名，
标题仍然可以写中文。

## 接下来

- 换一个更现代的主题，比如 Fluid、Butterfly、NexT
- 绑定自己的域名，并在 GitHub Pages 里开启 HTTPS
- 用 GitHub Actions 自动构建，这样连本地 `hexo deploy` 都省了

路还长，慢慢写。
