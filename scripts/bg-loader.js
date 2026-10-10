/* 把首页的加载遮罩插到 body 的最前面。
 *
 * 为什么不用主题现成的两个注入口：
 *   - inject.bottom 渲染在 </body> 之前，网络慢的时候要等整份 HTML 到齐才轮到它，
 *     于是顺序会变成「先看到 header 的背景图（也就是视频的第一帧），再冒出加载条」；
 *   - inject.head 渲染在 </head> 之前，往里放 div 虽然也能被浏览器挪进 body，
 *     但那是靠解析器的容错行为，产出的是非法 HTML。
 * 所以用 after_render:html 过滤器明确插在 body 开始标签之后 ——
 * 它是首屏第一个被绘制的元素，加载页才真正是「一开始就出现」。
 *
 * 只在首页注入（首页的 #page-header 带 full_page 类）。
 * 移动端 / 开了「减少动态效果」的情况由 CSS 的 media query 关掉，不依赖 JS：
 * 遮罩默认就是 display: none，脚本没跑起来只会什么都不显示，不会把人锁在黑屏里。
 */
const LOADER = [
  '<div id="bg-loader" aria-hidden="true">',
  '  <div class="track"><div class="fill"></div></div>',
  '  <div class="label">视频加载中 0%</div>',
  '</div>'
].join('\n');

hexo.extend.filter.register('after_render:html', function (str, data) {
  const header = str.match(/<header[^>]*id="page-header"[^>]*>/);
  const isHome = (data && data.path === 'index.html') ||
    !!(header && header[0].includes('full_page'));
  if (!isHome) return str;
  if (str.includes('id="bg-loader"')) return str;   /* 幂等：重复执行也不会叠加 */

  /* 锚在 </head> 上再吃 body 开始标签，而不是直接全文找那个标签：
     主题配置的注释、文章正文里的代码片段都可能出现同样的字样，
     直接匹配会插错位置。这不是假想 —— 第一次写就是这样插进了 CSS 注释里，
     注入内容自带的 </style> 反而把 <style> 提前截断，整段 CSS 漏成了正文。 */
  return str.replace(/<\/head>(\s*)<body[^>]*>/i, (m, ws) => m + LOADER);
});
