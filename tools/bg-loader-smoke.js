/* 本地验收：把首页内联的 BOOT_JS 抽出来，在一个极简的假 DOM 里跑一遍，
   确认控制流没问题（移动端/减少动效直接放行、四道闸门齐了就揭开、进度只增不减）。
   纯本地调试用，不参与构建，也刻意不放在 scripts/（那里面的 .js 会被 Hexo 当脚本加载）。
   用法：先 npx hexo generate，再 node tools/bg-loader-smoke.js */
const fs = require('fs')
const vm = require('vm')
const path = require('path')

const html = fs.readFileSync(path.join('public', 'index.html'), 'utf8')
const start = html.indexOf('<script>(function () {')
const end = html.indexOf('</script>', start)
if (start === -1 || end === -1) { console.error('FAIL: 内联脚本没找到'); process.exit(1) }
const code = html.slice(start + '<script>'.length, end)

const results = []
function check(name, cond) {
  results.push((cond ? 'PASS  ' : 'FAIL  ') + name)
  if (!cond) process.exitCode = 1
}

function makeEl(tag) {
  const el = {
    tagName: tag,
    children: [],
    attrs: {},
    style: {},
    dataset: {},
    hidden: false,
    textContent: '',
    _listeners: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c) },
      contains(c) { return this._s.has(c) },
      remove(c) { this._s.delete(c) }
    },
    setAttribute(k, v) { this.attrs[k] = v },
    getAttribute(k) { return this.attrs[k] },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn) },
    removeEventListener() {},
    fire(t) { (this._listeners[t] || []).forEach((fn) => fn()) },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c },
    insertBefore(c) { this.children.unshift(c); c.parentNode = this; return c },
    removeChild(c) {
      const i = this.children.indexOf(c)
      if (i >= 0) this.children.splice(i, 1)
      c.parentNode = null
      return c
    }
  }
  el.querySelector = (sel) => el._byClass[sel.replace(/^\./, '')] || null
  el.querySelectorAll = () => []
  el._byClass = {}
  return el
}

function buildLoader() {
  const loader = makeEl('div')
  ;['fill', 'label', 'detail', 'hint', 'skip'].forEach((c) => {
    const child = makeEl(c === 'skip' ? 'button' : c === 'hint' ? 'p' : 'div')
    child.hidden = c === 'hint' || c === 'skip'
    loader._byClass[c] = child
    loader.children.push(child)
  })
  return loader
}

function runScenario(name, opts) {
  return new Promise((resolve) => {
    const loader = buildLoader()
    const body = makeEl('body')
    body.appendChild(loader)          /* drop() 靠 parentNode 判断，必须真挂上去 */
    const header = makeEl('header')
    if (opts.fullPage) header.classList.add('full_page')

    const cssLink = makeEl('link')
    cssLink.sheet = null

    const doc = {
      readyState: 'loading',
      _loadHandlers: [],
      getElementById(id) {
        if (id === 'bg-loader') return loader
        if (id === 'page-header') return header
        return null
      },
      createElement: (t) => (t === 'video' ? FakeVideo() : makeEl(t)),
      querySelector(sel) {
        if (sel.indexOf('css/index.css') >= 0) return cssLink
        return null
      },
      querySelectorAll: () => [],
      addEventListener() {},
      documentElement: makeEl('html')
    }

    const win = {
      matchMedia(q) {
        return { matches: q.indexOf('max-width') >= 0 ? !!opts.mobile : !!opts.reduced }
      },
      addEventListener(t, fn) { if (t === 'load') doc._loadHandlers.push(fn) },
      dispatchEvent() {},
      Event: function (t) { this.type = t }
    }
    win.window = win

    const media = { bufferedEnd: 0, duration: 6.4, readyState: 0, networkState: 2 }

    function FakeVideo() {
      const v = makeEl('video')
      Object.defineProperty(v, 'buffered', {
        get: () => ({
          length: media.bufferedEnd > 0 ? 1 : 0,
          end: () => media.bufferedEnd
        })
      })
      Object.defineProperty(v, 'duration', { get: () => media.duration })
      Object.defineProperty(v, 'readyState', { get: () => media.readyState })
      Object.defineProperty(v, 'networkState', { get: () => media.networkState })
      v.play = () => Promise.resolve()
      v.pause = () => {}
      v.load = () => {}
      return v
    }

    function FakeImage() {
      const img = { src: '', onload: null, onerror: null }
      setTimeout(() => { if (img.onload) img.onload() }, 0)
      return img
    }

    const ctx = {
      document: doc,
      window: win,
      Image: FakeImage,
      MutationObserver: function (cb) { this.observe = () => {}; this.disconnect = () => {} },
      Event: win.Event,
      setTimeout: setTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval,
      Date: Date,
      Math: Math,
      Promise: Promise,
      console: console
    }
    ctx.self = ctx
    vm.createContext(ctx)

    try {
      vm.runInContext(code, ctx, { filename: 'boot.js' })
    } catch (e) {
      check(name + ' / 脚本执行不报错', false)
      console.error('  ' + e.message)
      return resolve({ loader, header, media, doc })
    }
    check(name + ' / 脚本执行不报错', true)

    if (opts.mobile || opts.reduced) {
      setTimeout(() => {
        check(name + ' / 加载页被摘掉', loader.parentNode === null)
        check(name + ' / 没有建 video（不白下素材）', header.children.length === 0)
        resolve({ loader, header, media, doc })
      }, 60)
      return
    }

    check(name + ' / 取消 CSS 兜底动画', loader.style.animation === 'none')

    setTimeout(() => {
      check(name + ' / video 已挂到 header 上', header.children.length === 1)
      const v = header.children[0]
      doc.readyState = 'complete'
      doc._loadHandlers.forEach((fn) => fn())
      cssLink.fire('load')
      v.fire('loadedmetadata')      /* 主题会在这里把 duration 记下来 */
      /* 视频缓冲慢慢涨，中途也应该一直没揭开 */
      media.bufferedEnd = 2.0
      v.fire('progress')
      setTimeout(() => {
        const pill = loader._byClass.label.textContent
        check(name + ' / 未加载完时不揭开（' + pill + '）', !loader.classList.contains('is-off'))
        media.bufferedEnd = 6.4
        media.readyState = 4
        media.networkState = 1
        v.fire('progress')
        setTimeout(() => {
          check(name + ' / 全部加载完后揭开', loader.classList.contains('is-off'))
          check(name + ' / 进度补满 100%', loader._byClass.fill.style.width === '100%')
          check(name + ' / 视频淡入 is-on', v.classList.contains('is-on'))
          resolve({ loader, header, media, doc })
        }, 400)
      }, 100)
    }, 60)
  })
}

;(async () => {
  console.log('--- 场景 1：桌面、正常加载 ---')
  await runScenario('桌面', { fullPage: true })
  console.log('--- 场景 2：移动端 ---')
  await runScenario('移动端', { fullPage: true, mobile: true })
  console.log('--- 场景 3：用户开了减少动态效果 ---')
  await runScenario('减少动效', { fullPage: true, reduced: true })

  console.log('\n' + results.join('\n'))
  console.log('\n' + (process.exitCode ? '有失败项' : '全部通过'))
  process.exit(process.exitCode || 0)
})()
