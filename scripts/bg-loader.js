/* 首页的「加载页」：从第一帧就出现，等全部素材真的加载完之后，再一次性切到完整首页。
 *
 * 这个文件独占三件事，都在这里，不再散落到 _config.butterfly.yml：
 *   1. EARLY_CSS   —— 加载页自己的样式，插在 <head> 紧后面，第一帧就用得上；
 *   2. LOADER_HTML —— 加载页的 DOM，插在 <body> 紧后面；
 *   3. BOOT_JS     —— 紧跟着它的内联脚本：起下载、算进度、判定「加载完了」、揭开。
 *
 * 为什么必须用 after_render:html 过滤器、而不是主题的两个注入口：
 *   - inject.head 渲染在 </head> 之前，往里塞 div 只能靠解析器容错挪进 body，
 *     产出的是非法 HTML；
 *   - inject.bottom 渲染在 </body> 之前，网络慢时要等整份 HTML 到齐才轮到它，
 *     顺序会退化成「先看到 header 背景图（视频第一帧），再冒出进度条」。
 *
 * 为什么还要把主题的样式表改成非阻塞加载：
 *   首页 <head> 里那个 /css/index.css 有 205KB，是 render-blocking 的 ——
 *   只要它还没到，浏览器一帧都不画，加载页写得再靠前也没用。
 *   实测这条线在国际链路上要 6-10 秒，那就是用户看到的「一进来先是黑屏」。
 *   所以把首页的 <link rel=stylesheet> 换成 rel=preload + onload 接回样式表：
 *   加载页先画出来，样式表在后台并行下载，等它到位了才揭开首页（见 BOOT_JS 里的 css 闸门），
 *   所以不会出现「没样式的裸首页」。
 *   <noscript> 里补回真正的阻塞样式表：没 JS 就没有加载页，也就不能走这条路。
 *   内页不动 —— 那边没有加载页兜底，保留主题原生的阻塞式加载最稳。
 */

const EARLY_CSS = [
  '<style id="bg-loader-style">',
  /* 样式表还没到位的那一小段空档，底色跟加载页、跟 header 的垫色保持一致，
     免得浏览器默认白底先闪一下。主题 CSS 一到就把这条盖掉。 */
  'html{background:#071916}',
  '#bg-loader{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9000;',
  'display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;',
  'opacity:1;transition:opacity .45s ease;',
  'background:radial-gradient(circle at 50% 42%,#0e2c28 0%,#071916 55%,#030b0a 100%);',
  /* 纯 CSS 兜底：脚本要是压根没跑起来（语法错、被拦），180 秒后自己撤掉，
     不把人永远关在加载页里。脚本一旦跑起来第一件事就是 animation:none 取消它，
     所以正常情况下这条永远不会触发 —— 判定权始终在 BOOT_JS 手里。 */
  'animation:bg-loader-giveup .6s ease 180s forwards}',
  '@media (min-width:769px) and (prefers-reduced-motion:no-preference){#bg-loader{display:flex}}',
  '#bg-loader.is-off{opacity:0;pointer-events:none}',
  '@keyframes bg-loader-giveup{to{opacity:0;visibility:hidden}}',
  '#bg-loader .track{width:220px;max-width:44vw;height:3px;border-radius:3px;',
  'background:rgba(255,255,255,.22);overflow:hidden}',
  '#bg-loader .fill{width:0;height:100%;border-radius:3px;',
  'background:linear-gradient(90deg,#8ff0d0,#d9fff2);transition:width .25s ease}',
  '#bg-loader .label{font-size:12px;line-height:1;letter-spacing:.08em;',
  'color:rgba(255,255,255,.86);text-shadow:0 1px 4px rgba(0,0,0,.5)}',
  '#bg-loader .detail{font-size:11px;line-height:1;letter-spacing:.04em;',
  'color:rgba(255,255,255,.5);text-shadow:0 1px 4px rgba(0,0,0,.5)}',
  '#bg-loader .hint{margin:2px 0 0;font-size:12px;line-height:1.5;letter-spacing:.04em;',
  'color:rgba(255,255,255,.72);text-shadow:0 1px 4px rgba(0,0,0,.5)}',
  '#bg-loader .skip{cursor:pointer;padding:7px 16px;border-radius:999px;',
  'border:1px solid rgba(255,255,255,.32);background:rgba(255,255,255,.06);',
  'color:rgba(255,255,255,.9);font-size:12px;line-height:1;letter-spacing:.04em}',
  '#bg-loader .skip:hover{background:rgba(255,255,255,.14)}',
  '</style>'
].join('\n');

const LOADER_HTML = [
  '<div id="bg-loader" aria-hidden="true">',
  '  <div class="track"><div class="fill"></div></div>',
  '  <div class="label">正在加载 0%</div>',
  '  <div class="detail">正在连接…</div>',
  /* hint / skip 平时 hidden，满足两个条件之一才放出来（干等 20 秒，
     或 8 秒毫无进展）：给一条出路，但绝不自动撤掉加载页 ——
     说了「全部加载完再进首页」就等到底，至于 5 分钟的死局兜底见 BOOT_JS 末尾。 */
  '  <p class="hint" hidden>网络较慢，视频仍在继续加载……</p>',
  '  <button class="skip" type="button" hidden>不等了，直接进入</button>',
  '</div>'
].join('\n');

const BOOT_JS = [
  '(function () {',
  "  var loader = document.getElementById('bg-loader');",
  '  if (!loader) return;',
  "  var fill = loader.querySelector('.fill');",
  "  var label = loader.querySelector('.label');",
  "  var detail = loader.querySelector('.detail');",
  "  var hint = loader.querySelector('.hint');",
  "  var skip = loader.querySelector('.skip');",
  '',
  '  function drop() { if (loader.parentNode) loader.parentNode.removeChild(loader); }',
  '',
  '  /* 移动端和开了「减少动态效果」的人不用加载页，更不该白下那段 10MB 视频。',
  '     判定放在最前面，一个字节都不浪费。 */',
  "  if (window.matchMedia('(max-width: 768px)').matches ||",
  "      window.matchMedia('(prefers-reduced-motion: reduce)').matches) { drop(); return; }",
  '',
  '  /* 脚本活着，就撤掉 CSS 里那条 180 秒兜底动画，判定权收回自己手里 */',
  "  loader.style.animation = 'none';",
  '',
  "  var done = { video: false, poster: false, css: false, page: false };",
  '  var revealed = false;',
  '  var v = null, vDuration = 0;',
  '  var idleSince = 0, lastAdvanceAt = Date.now(), lastPct = -1;',
  '',
  '  /* ---------- 进度 ----------',
  '     视频 9.78MB 是绝对大头，所以它按「已缓冲时长 / 全片时长」实时算；',
  '     海报 410KB、样式表 ~205KB、其余零碎，按体积折算成固定份额。',
  '     权重加起来正好 1。 */',
  '  var W_VIDEO = 0.93, W_POSTER = 0.037, W_CSS = 0.018, W_PAGE = 0.015;',
  '',
  '  function bufferedEnd() {',
  '    try { return v && v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0; }',
  '    catch (e) { return 0; }',
  '  }',
  '',
  '  function ratio() {',
  '    var vid = vDuration > 0 ? Math.min(1, bufferedEnd() / vDuration) : 0;',
  '    return Math.min(0.995, W_VIDEO * vid +',
  '      (done.poster ? W_POSTER : 0) + (done.css ? W_CSS : 0) + (done.page ? W_PAGE : 0));',
  '  }',
  '',
  '  function render() {',
  '    var n = Math.round(ratio() * 100);',
  "    fill.style.width = n + '%';",
  "    label.textContent = '正在加载 ' + n + '%';",
  '    if (vDuration > 0) {',
  '      var end = Math.min(bufferedEnd(), vDuration);',
  "      detail.textContent = '视频缓冲 ' + end.toFixed(1) + ' / ' + vDuration.toFixed(1) + ' 秒';",
  '    }',
  '    /* 只有百分比真的动了才算「有进展」，卡住检测看的是这个 */',
  '    if (n !== lastPct) { lastPct = n; lastAdvanceAt = Date.now(); }',
  '  }',
  '',
  '  function reveal() {',
  '    if (revealed) return;',
  '    revealed = true;',
  '    fill.style.width = ' + "'100%'" + ';',
  "    label.textContent = '正在加载 100%';",
  "    detail.textContent = '';",
  "    hint.hidden = true; skip.hidden = true;",
  '    if (v) {',
  "      v.classList.add('is-on');",
  '      var p = v.play();',
  '      if (p && p.catch) p.catch(function () {});',
  '    }',
  '    /* 先让人看见 100%，再淡出，避免进度条差最后一格就没了 */',
  '    setTimeout(function () {',
  "      loader.classList.add('is-off');",
  '      setTimeout(drop, 900);',
  '    }, 260);',
  '  }',
  '',
  '  /* ---------- 视频 ----------',
  '     判定「加载完」优先看缓冲区间是否覆盖全片；',
  '     浏览器铺满之后会自己停下（networkState === NETWORK_IDLE）并且不再涨，',
  '     这种情况停 2 秒也认它加载完 —— 否则会死在 99% 等到超时。 */',
  '  function videoReady() {',
  '    if (done.video) return true;',
  '    if (!v || !vDuration) return false;',
  '    if (bufferedEnd() >= vDuration - 0.25) { done.video = true; return true; }',
  '    if (v.readyState >= 4 && v.networkState === 1) {',
  '      if (!idleSince) idleSince = Date.now();',
  '      if (Date.now() - idleSince > 2000) { done.video = true; return true; }',
  '    } else { idleSince = 0; }',
  '    return false;',
  '  }',
  '',
  '  function allDone() { videoReady(); return done.video && done.poster && done.css && done.page; }',
  '',
  '  function attach() {',
  "    var header = document.getElementById('page-header');",
  "    if (!header || !header.classList.contains('full_page')) return false;",
  "    v = document.createElement('video');",
  "    v.id = 'bg-video';",
  "    v.src = '/video/bg-loop.mp4';",
  "    v.poster = '/img/bg-poster.jpg';",
  "    v.preload = 'auto';      /* 明确要求把整片拉下来，进度才有得读 */",
  '    v.muted = true;          /* 不静音浏览器不允许自动播放 */',
  '    v.defaultMuted = true;',
  '    v.loop = true;',
  '    v.autoplay = true;',
  '    v.playsInline = true;',
  "    v.setAttribute('playsinline', '');",
  "    v.setAttribute('webkit-playsinline', '');",
  "    v.setAttribute('aria-hidden', 'true');",
  "    v.setAttribute('tabindex', '-1');",
  '    header.insertBefore(v, header.firstChild);',
  '',
  "    v.addEventListener('loadedmetadata', function () { vDuration = v.duration || 0; render(); });",
  "    v.addEventListener('progress', render);",
  "    v.addEventListener('canplay', render);",
  "    v.addEventListener('canplaythrough', render);",
  "    v.addEventListener('playing', render);",
  '    /* 视频拿不到就直接揭开：静态海报还在，不把人挡在外面 */',
  "    v.addEventListener('error', function () { done.video = true; reveal(); });",
  '',
  '    /* 立刻开播（静音、被遮罩盖着看不见）：Chrome 里「正在播放的媒体」是最高优先级，',
  '       这样这 9.78MB 不会被样式表、图片挤到后面；揭开时它已经在正常循环了。 */',
  '    var p = v.play();',
  '    if (p && p.catch) p.catch(function () {});',
  '    return true;',
  '  }',
  '',
  '  /* 这段脚本跑在 <body> 的开头，#page-header 还没被解析出来。',
  '     它就在后面几个字节处，用 MutationObserver 接上几乎不花时间，',
  '     比「先建好再搬家」稳 —— 移动 DOM 里的 <video> 有可能让它重新下载。 */',
  '  if (!attach()) {',
  '    var mo = new MutationObserver(function () { if (attach()) mo.disconnect(); });',
  '    mo.observe(document.documentElement, { childList: true, subtree: true });',
  '    var tries = 0;',
  '    var poll = setInterval(function () {',
  '      if (attach()) { clearInterval(poll); mo.disconnect(); return; }',
  '      if (++tries > 600) {',
  '        clearInterval(poll);',
  '        mo.disconnect();',
  '        done.video = true;   /* 找不到 header：放行，别把人卡住 */',
  '        render();',
  '      }',
  '    }, 16);',
  '  }',
  '',
  '  /* ---------- 海报 ----------',
  '     揭示后 header 的底图就是它，两处用的是同一个 URL，只会发一次请求。 */',
  '  var poster = new Image();',
  '  poster.onload = poster.onerror = function () { done.poster = true; render(); };',
  "  poster.src = '/img/bg-poster.jpg';",
  '',
  '  /* ---------- 样式表 ----------',
  '     由过滤器改成 rel=preload 的那个 /css/index.css。',
  '     它没到位就不揭开，所以不会闪一下没样式的裸首页。 */',
  '  var cssLink = document.querySelector(' + "'" + 'link[rel="preload"][as="style"][href*="/css/index.css"]' + "'" + ');',
  '  function cssLoaded() {',
  '    if (done.css) return;',
  '    done.css = true;',
  '    /* 样式表可能晚于 DOMContentLoaded 才应用，主题 main.js 在 init 那一次',
  '       量到的元素宽度是裸 HTML 的（它只量一次）。它的 resize 回调不会重新量，',
  '       只重跑一遍判定，所以这次 resize 只能让依赖布局的判定重来一次，',
  '       不要指望它修正宽度。菜单项少的站，这点差异看不出来。 */',
  "    if (document.readyState !== 'loading') window.dispatchEvent(new Event('resize'));",
  '    render();',
  '  }',
  '  if (!cssLink) { done.css = true; }',
  '  else if (cssLink.sheet) { cssLoaded(); }',
  '  else {',
  "    cssLink.addEventListener('load', cssLoaded);",
  '    cssLink.addEventListener(\'error\', cssLoaded);',
  '  }',
  '',
  '  /* 极少数浏览器对 <link onload> 支持不好：4 秒后还没接回样式表就手动接回来。',
  '     media 也要一起改成 all —— 否则万一是「媒体查询当时不匹配」，',
  '     改了 rel 也还是不生效，桌面端就永久裸奔了。 */',
  '  setTimeout(function () {',
  '    var ls = document.querySelectorAll(\'link[rel="preload"][as="style"]\');',
  '    for (var i = 0; i < ls.length; i++) {',
  "      ls[i].rel = 'stylesheet';",
  "      ls[i].media = 'all';",
  '    }',
  '  }, 4000);',
  '',
  '  /* ---------- 整页 ----------',
  '     window.load 覆盖剩下的零碎（JS、字体、内嵌图）。',
  '     <video> 不会拖住 load 事件，所以视频那边单独判定。 */',
  "  if (document.readyState === 'complete') { done.page = true; }",
  "  else { window.addEventListener('load', function () { done.page = true; render(); }); }",
  '',
  "  skip.addEventListener('click', function () { reveal(); });",
  '',
  '  /* 出路按钮：默认行为仍然是「等全部加载完」，它只是不让人被进度条困住。',
  '     两个触发条件 —— 干等了 20 秒（正常慢链路，10MB 要几分钟），',
  '     或者 8 秒毫无进展（那是真卡住了）。 */',
  '  var startedAt = Date.now();',
  '  var timer = setInterval(function () {',
  '    render();',
  '    if (allDone()) {',
  '      clearInterval(timer);',
  '      reveal();',
  '      return;',
  '    }',
  '    if (!hint.hidden) return;',
  '    if (Date.now() - startedAt > 20000 || Date.now() - lastAdvanceAt > 8000) {',
  '      hint.hidden = false;',
  '      skip.hidden = false;',
  '    }',
  '  }, 250);',
  '',
  '  /* 真正的死局兜底：5 分钟还没等到，就带着海报先揭开，',
  '     视频之后缓冲好了仍会自己淡入（v 一直挂在 header 上）。 */',
  '  setTimeout(function () { if (!revealed) reveal(); }, 300000);',
  '',
  '  render();',
  '})();'
].join('\n');

/* 「会看到加载页的人」和「看不到的人」这两个条件，必须和 EARLY_CSS 里
 * #bg-loader 的 display 媒体查询、以及 BOOT_JS 开头那次 matchMedia 判定完全一致。
 * 只要 CSS 被异步化的人 == 看得见加载页的人，就不可能闪出没样式的裸页面；
 * 反过来，看不到加载页的人拿到的仍然是阻塞式样式表，行为和改动前一样。
 * 三处要改一起改。 */
const DESKTOP_MQ = '(min-width:769px) and (prefers-reduced-motion:no-preference)';
const LITE_MQ = '(max-width:768px),(prefers-reduced-motion:reduce)';

/* 首页的 <link rel=stylesheet> → 一异步 + 一阻塞两条互补 link。
 * 返回改写后的 <head> 片段，顺带把 <noscript> 的阻塞版一起补上。 */
function unblockStylesheets(head) {
  const hrefs = [];
  const out = head.replace(/<link\b[^>]*\brel=(["']?)stylesheet\1[^>]*>/gi, (tag) => {
    const m = tag.match(/\bhref=(["'])([^"']*)\1|\bhref=([^\s>]+)/i);
    if (!m) return tag;
    const href = m[2] || m[3];
    if (!href) return tag;
    hrefs.push(href);
    /* 原样留下除 rel / media / onload 之外的属性（href、integrity、crossorigin…） */
    const attrs = tag
      .replace(/^<link\b/i, '')
      .replace(/\s*\brel=(["']?)stylesheet\1/i, '')
      .replace(/\s*\bmedia=(["'])[^"']*\1/i, '')
      .replace(/\s*\bonload=(["'])[^"']*\1/i, '')
      .replace(/\s*\/?>$/, '')
      .trim();
    /* 一个样式表换成两条互补的 link —— 媒体查询在这里当开关用：
         第 1 条：桌面 + 没开减少动效。这正是加载页会显示的那些人。
                 rel=preload 不阻塞渲染，加载页能立刻画出来；到货后 onload 接回样式表。
         第 2 条：其余所有人（窄屏 / 减少动效）。媒体不匹配的样式表既不阻塞渲染
                 也不阻塞脚本，所以对这些人等于没写；一旦匹配（就是他们）就是
                 普通的阻塞式加载 —— 和改动前一模一样，不会闪裸页面。
       两条的媒体查询正好互补，同 URL 的请求会被浏览器合并，不会多下一份。 */
    return '<link rel="preload" as="style" media="' + DESKTOP_MQ + '" ' + attrs +
      ' onload="this.onload=null;this.rel=\'stylesheet\';this.media=\'all\'">' +
      '<link rel="stylesheet" media="' + LITE_MQ + '" ' + attrs + '>';
  });
  if (!hrefs.length) return out;
  const noscript = '<noscript><style>#bg-loader{display:none!important}</style>' +
    hrefs.map((h) => `<link rel="stylesheet" href="${h}">`).join('') +
    '</noscript>';
  /* 传进来的片段到真正的 head 结束标签为止（不含它），所以直接接在末尾即可。
     早先这里写的是 out.replace(/<\/head>/i, ...)，但片段里根本没有那个标签，
     替换永远不命中 —— 表现是 noscript 静默消失，无 JS 的访客会看到裸首页。 */
  return out + noscript;
}

hexo.extend.filter.register('after_render:html', function (str, data) {
  const header = str.match(/<header[^>]*id="page-header"[^>]*>/);
  const isHome = (data && data.path === 'index.html') ||
    !!(header && header[0].includes('full_page'));
  if (!isHome) return str;
  if (str.includes('id="bg-loader"')) return str;   /* 幂等：重复执行也不会叠加 */

  /* <head> 紧后面：加载页的样式必须比任何可能阻塞渲染的东西更早被解析到 */
  let out = str.replace(/<head[^>]*>/i, (m) => m + '\n' + EARLY_CSS);

  /* 只动 <head> 区段里的样式表：文章正文里若出现同名字样，不该被改写。
     head 的结束位置取「<body> 之前的最后一个 </head>」而不是第一个 ——
     这个页面里 head 内的 CSS 注释就可能白纸黑字写着标签名（我们的主题配置注释里
     恰有一个），用第一个会切进注释中间，后面的改写和 noscript 全靠运气。 */
  const headStart = out.indexOf('<head');
  const bodyProbe = out.indexOf('<body');
  const headEnd = out.lastIndexOf('</head>', bodyProbe === -1 ? out.length : bodyProbe);
  if (headStart !== -1 && headEnd > headStart) {
    out = out.slice(0, headStart) +
      unblockStylesheets(out.slice(headStart, headEnd)) +
      out.slice(headEnd);
  }

  /* 加载页的 DOM 和脚本接在 <body ...> 开始标签的紧后面。
     注意 body 的位置要在上面那步之后重新找：noscript 往 head 末尾加了几百字节，
     拿改写前的下标会正好落进 noscript 里，匹配不上，加载页整个插不进去。 */
  const bodyStart = out.indexOf('<body', headEnd);
  const bodyTag = bodyStart === -1 ? null : out.slice(bodyStart).match(/^<body[^>]*>/i);
  if (bodyTag) {
    out = out.slice(0, bodyStart) + bodyTag[0] +
      '\n' + LOADER_HTML + '\n<script>' + BOOT_JS + '</script>' +
      out.slice(bodyStart + bodyTag[0].length);
  }
  return out;
});
