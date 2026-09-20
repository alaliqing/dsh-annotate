/**
 * dsh-annotate — Client half.
 *
 * The right-sidebar tab has two faces:
 *
 *  - **list** — the local web servers that are actually running, discovered by
 *    the host half; one click opens one (a lone find opens itself). Nothing to
 *    configure, nothing to type. If nothing is up, it says what to run.
 *  - **page** — the opened page, proxied onto the harness origin so its DOM is
 *    readable, with element picking, comments, live style tweaks and one
 *    structured block into the composer.
 *
 * Bundled by build.mjs into the ModuleLoader format; `OVERLAY_SRC` is injected
 * there.
 */
const inject = ['timer']

const CHANNEL_IN = 'dsh-annotate-overlay'
const CHANNEL_OUT = 'dsh-annotate-panel'
const PAGE_CHANNEL = 'dsh-annotate-page'
const KIND = 'annotate'
const TAB_ID = 'dsh-annotate'
const MARKER = '#f0a05a'

const PANEL_CSS = `
/* A column of the page, not a card over it: no radius, no shadow, no glass —
   the sidebar owns the surface, the tab owns its content insets. */
.dsa-col { display:flex; flex-direction:column; height:100%; min-height:0; color:var(--dsw-alias-label-primary,#e8eaed);
  font:12.5px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
.dsa-bar { display:flex; align-items:center; gap:5px; padding:8px 10px; flex:none;
  border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 9%,transparent); }
.dsa-bar .dsa-url { flex:1; min-width:0; height:26px; padding:0 9px; border-radius:6px; outline:none;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11.5px; color:inherit;
  background:color-mix(in srgb,var(--dsw-alias-bg-base,#0d1117) 38%,transparent);
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 12%,transparent); }
.dsa-bar .dsa-url:focus { border-color:${MARKER}; }
.dsa-ico { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; padding:0; flex:none;
  border:1px solid transparent; border-radius:6px; background:transparent; color:var(--dsw-alias-label-secondary,#9aa0a6); cursor:pointer; }
.dsa-ico:hover:not(:disabled) { background:color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 8%,transparent); color:var(--dsw-alias-label-primary,#e8eaed); }
.dsa-ico:disabled { opacity:.35; cursor:default }
.dsa-ico[data-on="true"] { color:${MARKER}; border-color:color-mix(in srgb,${MARKER} 45%,transparent); background:color-mix(in srgb,${MARKER} 12%,transparent); }
.dsa-ico svg { width:15px; height:15px }
.dsa-send { height:26px; padding:0 10px; border-radius:6px; cursor:pointer; white-space:nowrap; font-size:11.5px; flex:none;
  background:${MARKER}; border:1px solid transparent; color:#20160c; font-weight:600; }
.dsa-send:hover { opacity:.9 }
.dsa-send:disabled { opacity:.42; cursor:default }
.dsa-count { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10.5px; color:var(--dsw-alias-label-secondary,#9aa0a6); padding-inline:2px }

.dsa-notice { flex:none; display:flex; align-items:center; gap:8px; padding:7px 11px; font-size:11.5px; line-height:1.5; color:${MARKER};
  background:color-mix(in srgb,${MARKER} 12%,transparent); border-bottom:1px solid color-mix(in srgb,${MARKER} 30%,transparent); }
.dsa-notice button { all:unset; cursor:pointer; margin-left:auto; color:inherit; opacity:.7; flex:none }
.dsa-notice button:hover { opacity:1 }

/* ---- list face ---- */
.dsa-listwrap { flex:1; min-height:0; overflow:auto }
.dsa-sechead { display:flex; align-items:center; gap:8px; padding:11px 11px 6px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10.5px; letter-spacing:.06em; text-transform:uppercase;
  color:var(--dsw-alias-label-secondary,#9aa0a6) }
.dsa-sechead .dsa-ico { margin-left:auto; width:22px; height:22px }
.dsa-svc { display:flex; align-items:center; gap:10px; width:100%; padding:9px 11px; text-align:left; cursor:pointer;
  background:transparent; border:0; border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 5%,transparent);
  color:inherit; font:inherit }
.dsa-svc:hover { background:color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 4%,transparent) }
.dsa-svc .dot { width:7px; height:7px; border-radius:50%; flex:none; background:#4bbf7a; box-shadow:0 0 0 3px color-mix(in srgb,#4bbf7a 20%,transparent) }
.dsa-svc .copy { flex:1; min-width:0 }
.dsa-svc .copy b { display:block; font-size:12.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.dsa-svc .copy span { display:block; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10.5px;
  color:var(--dsw-alias-label-secondary,#9aa0a6); overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.dsa-svc .go { flex:none; font-size:11px; color:${MARKER}; opacity:0 }
.dsa-svc:hover .go { opacity:1 }

.dsa-openrow { display:flex; gap:6px; align-items:center; padding:10px 11px;
  border-top:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 9%,transparent) }
.dsa-openrow input { flex:1; min-width:0; height:28px; padding:0 9px; border-radius:6px; outline:none; color:inherit;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11.5px;
  background:color-mix(in srgb,var(--dsw-alias-bg-base,#0d1117) 38%,transparent);
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 12%,transparent) }
.dsa-openrow input:focus { border-color:${MARKER} }
.dsa-openrow button { height:28px; padding:0 11px; border-radius:6px; cursor:pointer; font-size:11.5px; flex:none;
  background:${MARKER}; border:0; color:#20160c; font-weight:600 }
.dsa-hintbox { padding:12px 12px 16px; color:var(--dsw-alias-label-secondary,#9aa0a6); font-size:11.5px; line-height:1.6 }
.dsa-hintbox p { margin:0 0 8px }
.dsa-cmd { display:flex; align-items:center; gap:8px; padding:6px 8px; margin-bottom:5px; border-radius:6px;
  background:color-mix(in srgb,var(--dsw-alias-bg-base,#0d1117) 40%,transparent);
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 8%,transparent) }
.dsa-cmd code { flex:1; min-width:0; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px; color:var(--dsw-alias-label-primary,#e8eaed) }
.dsa-cmd button { all:unset; cursor:pointer; font-size:10.5px; color:${MARKER}; flex:none }

.dsa-stage { position:relative; flex:1; min-height:0; background:#fff }
.dsa-frame { width:100%; height:100%; border:0; display:block }
.dsa-stagefoot { position:absolute; left:0; right:0; bottom:0; display:flex; gap:8px; align-items:center;
  padding:3px 8px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10px; letter-spacing:.04em;
  color:rgba(255,255,255,.9); background:linear-gradient(0deg,rgba(0,0,0,.62),transparent); pointer-events:none }
.dsa-stagefoot i { width:6px; height:6px; border-radius:50%; background:${MARKER}; box-shadow:0 0 0 3px color-mix(in srgb,${MARKER} 25%,transparent); flex:none }
.dsa-stagefoot span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap }

.dsa-empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px;
  padding:26px; text-align:center; color:var(--dsw-alias-label-secondary,#9aa0a6);
  background:color-mix(in srgb,var(--dsw-alias-bg-base,#0d1117) 90%,transparent) }
.dsa-empty h4 { margin:0; font-size:13px; color:var(--dsw-alias-label-primary,#e8eaed); font-weight:600 }
.dsa-empty p { margin:0; max-width:330px; font-size:12px; line-height:1.65 }
.dsa-empty code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11.5px; padding:2px 5px; border-radius:4px;
  background:color-mix(in srgb,${MARKER} 14%,transparent); color:${MARKER} }

.dsa-list { flex:none; max-height:40%; min-height:0; overflow:auto;
  border-top:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 9%,transparent) }
.dsa-item { display:flex; gap:9px; padding:9px 11px; border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 5%,transparent) }
.dsa-item:hover { background:color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 4%,transparent) }
.dsa-idx { flex:none; width:19px; height:19px; margin-top:1px; border-radius:50%; background:${MARKER}; color:#20160c;
  font:600 11px/19px ui-monospace,SFMono-Regular,Menlo,monospace; text-align:center }
.dsa-body { flex:1; min-width:0 }
.dsa-meta { display:flex; gap:7px; align-items:baseline; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:10.5px; color:var(--dsw-alias-label-secondary,#9aa0a6) }
.dsa-meta b { color:var(--dsw-alias-label-primary,#e8eaed); font-weight:600 }
.dsa-sel { margin-top:1px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10.5px;
  color:color-mix(in srgb,var(--dsw-alias-label-secondary,#9aa0a6) 88%,transparent);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.dsa-comment { margin-top:3px; font-size:12.5px; line-height:1.6; word-break:break-word }
.dsa-acts { display:flex; gap:4px; align-items:flex-start }
.dsa-mini { width:22px; height:22px; border-radius:6px; border:1px solid transparent; background:transparent; cursor:pointer;
  color:var(--dsw-alias-label-secondary,#9aa0a6) }
.dsa-mini:hover { background:color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 8%,transparent); color:var(--dsw-alias-label-primary,#e8eaed) }
.dsa-mini[data-danger="true"]:hover { color:var(--dsw-alias-state-error-primary,#ff6b6b) }

/* Conversation-header entry, next to the session utilities. */
.dsa-open { display:inline-flex; align-items:center; justify-content:center; gap:6px; height:28px; padding:0 9px;
  border:1px solid transparent; border-radius:7px; background:transparent; cursor:pointer;
  color:var(--dsw-alias-label-secondary,#9aa0a6); font-size:12px }
.dsa-open:hover { background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.14)); color:var(--dsw-alias-label-primary,#e8eaed) }
.dsa-open[data-count="true"] { color:${MARKER} }
.dsa-open svg { width:15px; height:15px; flex:none }

/* Pending-block chips above the composer. */
.dsa-dock { display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:0 2px 6px }
.dsa-chip { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 4px 0 8px; border-radius:20px;
  font-size:11.5px; color:var(--dsw-alias-label-primary,#e8eaed);
  background:color-mix(in srgb,${MARKER} 16%,transparent); border:1px solid color-mix(in srgb,${MARKER} 42%,transparent) }
.dsa-chip .dot { width:6px; height:6px; border-radius:50%; background:${MARKER} }
.dsa-chip button { all:unset; cursor:pointer; width:16px; height:16px; line-height:14px; text-align:center; border-radius:50%;
  color:color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 70%,transparent) }
.dsa-chip button:hover { background:rgba(0,0,0,.22); color:#fff }
.dsa-chip-clear { all:unset; cursor:pointer; font-size:11px; color:var(--dsw-alias-label-secondary,#9aa0a6); padding:0 4px }
.dsa-chip-clear:hover { color:${MARKER} }
`

function injectStyles(text) {
  const el = document.createElement('style')
  el.setAttribute('data-dsh-annotate', '')
  el.textContent = text
  document.head.appendChild(el)
  return () => el.remove()
}

const ICONS = {
  marker: 'M3 17.2 14.4 5.8a2 2 0 0 1 2.8 0l1 1a2 2 0 0 1 0 2.8L6.8 21H3z',
  refresh: 'M13.6 4.2a6.8 6.8 0 1 0 6.4 8.5h-2a4.8 4.8 0 1 1-4.4-6.5V9l4-3.4z',
  back: 'M14.5 5 7.5 12l7 7',
  forward: 'M9.5 5l7 7-7 7',
  list: 'M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z',
  locate: 'M12 2v3m0 14v3M2 12h3m14 0h3M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z',
  trash: 'M6 7h12l-1 13H7zM9 4h6l1 2H8z',
  external: 'M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14zM5 6h5v2H7v9h9v-3h2v5H5z',
}

function Icon(props) {
  return React.createElement(
    'svg',
    { viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' },
    React.createElement('path', { d: ICONS[props.name] })
  )
}

const STYLE_KEYS = ['display', 'position', 'gap', 'padding', 'margin', 'font-size', 'font-weight', 'line-height',
  'color', 'background-color', 'border-radius', 'box-shadow', 'width', 'height']

function styleSummary(styles) {
  return STYLE_KEYS.filter((key) => styles && styles[key]).map((key) => key + ':' + styles[key]).join('; ')
}

function payloadOf(ann, index) {
  const lines = []
  lines.push('#' + (index + 1) + ' ' + ann.tag + (ann.classes && ann.classes.length ? '.' + ann.classes[0] : '') +
    (ann.component ? '  组件:' + ann.component : ''))
  const anchors = []
  if (ann.role && ann.role !== ann.tag) anchors.push('role=' + ann.role)
  if (ann.ariaLabel) anchors.push('aria-label="' + ann.ariaLabel + '"')
  if (ann.alt) anchors.push('alt="' + ann.alt + '"')
  if (ann.name) anchors.push('name=' + ann.name)
  if (ann.testId) anchors.push(ann.testId)
  if (anchors.length) lines.push('   语义: ' + anchors.join(' · '))
  if (ann.componentChain && ann.componentChain.length > 1) lines.push('   组件链: ' + ann.componentChain.join(' > '))
  lines.push('   选择器: ' + ann.selector +
    (typeof ann.selectorMatches === 'number' ? '（命中 ' + ann.selectorMatches + ' 个元素）' : ''))
  lines.push('   位置/尺寸: ' + ann.rect.w + '×' + ann.rect.h + ' @ (' + ann.rect.x + ', ' + ann.rect.y + ')' +
    (ann.placement ? ' · 视口 ' + ann.placement.zone + '（' + ann.placement.x + '%W × ' + ann.placement.y + '%H）' : ''))
  const styles = styleSummary(ann.styles)
  if (styles) lines.push('   当前样式: ' + styles)
  if (ann.styleEdits) {
    const edits = Object.keys(ann.styleEdits)
      .map((key) => key + ' ' + (ann.styleEdits[key].from || '(未设置)') + ' → ' + ann.styleEdits[key].to)
      .join('; ')
    if (edits) lines.push('   样式改动（已在页面上预览）: ' + edits)
  }
  if (ann.text) lines.push('   文本: ' + ann.text)
  lines.push('   批注: ' + ann.comment)
  return lines.join('\n')
}

function payloadBlock(annotations, page, viewport) {
  if (!annotations.length) return ''
  const head = '🎯 界面标注 · ' + page + ' · 视口 ' + viewport.w + '×' + viewport.h + '（' + annotations.length + ' 条）'
  return head + '\n' + annotations.map((ann, i) => payloadOf(ann, i)).join('\n\n')
}

const encodeTarget = (origin) => btoa(origin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Accept what people actually type: `5173`, `:5173`, `localhost:3000/x`, a URL. */
function normalizeAddress(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  let candidate = raw
  if (/^\d+$/.test(candidate)) candidate = `http://127.0.0.1:${candidate}/`
  else if (candidate.startsWith(':')) candidate = `http://127.0.0.1${candidate}`
  else if (!/^[a-z]+:\/\//i.test(candidate)) candidate = `http://${candidate}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch (error) {
    return null
  }
}

const isLoopback = (hostname) => /^(127\.0\.0\.1|localhost|\[::1\]|::1)$/.test(hostname)


function apply(ctx) {
  const slots = ctx.get('slots')
  if (slots === undefined) return
  const sidebarRightTabs = ctx.get('sidebarRightTabs')
  const sidebarRight = ctx.get('sidebarRight')
  ctx.effect(() => injectStyles(PANEL_CSS))

  const makeModel = (initial) => {
    let state = initial
    const subs = new Set()
    return {
      get: () => state,
      set: (patch) => {
        state = Object.assign({}, state, patch)
        subs.forEach((fn) => fn())
      },
      sub: (fn) => {
        subs.add(fn)
        return () => subs.delete(fn)
      },
    }
  }
  const useSub = (model) => {
    const [, force] = React.useReducer((n) => n + 1, 0)
    React.useEffect(() => model.sub(force), [model])
  }

  const panels = new Map()
  const getPanel = (sid) => {
    const key = sid || '__root__'
    let panel = panels.get(key)
    if (!panel) {
      panel = {
        sid: key,
        model: makeModel({
          view: 'list',
          services: [],
          detect: 'idle',
          scanned: 0,
          hint: null,
          url: '',
          input: '',
          src: '',
          history: [],
          index: -1,
          annotations: [],
          viewport: { w: 0, h: 0 },
          page: '',
          mode: 'idle',
          cors: false,
          pending: [],
          notice: null,
          proxyPrefix: '/__dsh_anno',
          command: null,
          log: [],
          root: '',
        }),
        draftWriter: null,
        noticeTimer: null,
      }
      panels.set(key, panel)
    }
    return panel
  }

  const api = async (method, args) => {
    try {
      const res = await fetch('/__dsh-annotate/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: method, args: args || {} }),
      })
      return await res.json()
    } catch (error) {
      return { ok: false, error: String((error && error.message) || error) }
    }
  }

  let frameRef = null

  const notify = (type, payload) => {
    const frame = frameRef
    if (!frame || !frame.contentWindow) return
    try {
      frame.contentWindow.postMessage(Object.assign({ source: CHANNEL_OUT, type: type }, payload || {}), '*')
    } catch (error) {
      void error
    }
  }

  const openAnnotate = () => {
    try {
      if (sidebarRight && typeof sidebarRight.openTab === 'function') sidebarRight.openTab(KIND)
    } catch (error) {
      console.warn('dsh-annotate: could not open the sidebar tab', error)
    }
  }

  const flash = (panel, message) => {
    panel.model.set({ notice: message })
    if (panel.noticeTimer) clearTimeout(panel.noticeTimer)
    panel.noticeTimer = setTimeout(() => panel.model.set({ notice: null }), 6000)
  }

  const proxyUrlFor = (panel, upstreamUrl) => {
    const url = new URL(upstreamUrl)
    const prefix = panel.model.get().proxyPrefix || '/__dsh_anno'
    return location.origin + prefix + '/' + encodeTarget(url.origin) + url.pathname + url.search + url.hash
  }

  /** Open a page: harness-origin URLs load directly, everything else through the
   *  loopback proxy (which is what makes its DOM readable). */
  const openUpstream = (panel, raw, options) => {
    const push = !options || options.push !== false
    const url = normalizeAddress(raw)
    if (!url) {
      flash(panel, '这个地址看不出来是什么，试试 localhost:5173 或直接输 5173')
      return false
    }
    const parsed = new URL(url)
    const direct = parsed.origin === location.origin
    const state = panel.model.get()
    const history = push ? state.history.slice(0, state.index + 1).concat([url]) : state.history
    panel.model.set({
      view: 'page',
      url: url,
      input: url,
      src: direct ? url : proxyUrlFor(panel, url),
      history: history.slice(-40),
      index: Math.min(history.length - 1, 39),
      mode: 'idle',
      cors: false,
      annotations: state.url === url ? state.annotations : [],
      page: parsed.pathname,
      notice: isLoopback(parsed.hostname) ? null : '非本地地址：代理只是尽力而为（登录态与严格 CSP 可能失效）',
    })
    return true
  }

  const runDetect = async (panel, options) => {
    const auto = !options || options.auto !== false
    const state = panel.model.get()
    panel.model.set({ detect: 'busy' })
    const res = await api('detect', { sid: panel.sid, root: state.root })
    if (!res || !res.ok) {
      panel.model.set({ detect: 'error' })
      flash(panel, '检测失败：' + ((res && res.error) || '未知错误'))
      return
    }
    panel.model.set({
      services: res.services || [],
      hint: res.hint || null,
      scanned: res.scanned || 0,
      detect: 'idle',
    })
    const current = panel.model.get()
    if (auto && !current.url && (res.services || []).length === 1) {
      openUpstream(panel, res.services[0].url, { push: true })
      flash(panel, '检测到 1 个本地服务，已自动打开')
    }
  }

  const injectOverlay = (iframe, panel) => {
    let doc = null
    try {
      doc = iframe.contentDocument
    } catch (error) {
      doc = null
    }
    if (!doc) {
      panel.model.set({ cors: true })
      return
    }
    panel.model.set({ cors: false })
    if (doc.getElementById('dsh-annotate-overlay')) return
    const script = doc.createElement('script')
    script.id = 'dsh-annotate-overlay'
    script.textContent = OVERLAY_SRC
    ;(doc.head || doc.documentElement).appendChild(script)
    notify('ping')
  }

  const sendAll = (panel, setDraft) => {
    const state = panel.model.get()
    if (!state.annotations.length) return false
    const writer = setDraft || (panel.draftWriter && panel.draftWriter.setDraft)
    if (!writer) {
      flash(panel, '还没找到输入框：先切到一个有输入框的会话，再点这里发送标注。')
      return false
    }
    // The page identity that matters is the upstream one, never the proxy path.
    const block = payloadBlock(state.annotations, state.url || state.page, state.viewport || { w: 0, h: 0 })
    const current = String((panel.draftWriter && panel.draftWriter.draft) || '')
    const next = (current ? current.replace(/\s+$/, '') + '\n\n' : '') + block
    writer(next)
    if (panel.draftWriter) panel.draftWriter.draft = next
    panel.model.set({
      pending: state.pending.concat([{ id: 'p' + Date.now().toString(36), count: state.annotations.length, payload: block }]),
      annotations: [],
      mode: 'idle',
      notice: null,
    })
    notify('clear')
    return true
  }

    // --------------------------------------------------------------- tab body

  const AnnotateTab = (props) => {
    const panel = getPanel(props.sessionId)
    useSub(panel.model)
    const state = panel.model.get()
    const annotations = state.annotations
    const draft = props.useInput ? props.useInput((s) => s.draft) : ''
    const sessionId = props.sessionId
    const inputActions = props.inputActions
    const workspaceItems = props.useWorkspaces ? props.useWorkspaces((snapshot) => snapshot.items) : undefined

    React.useEffect(() => {
      const list = Array.isArray(workspaceItems) ? workspaceItems : []
      const mine = list.find((item) => item && Array.isArray(item.sessionIds) && item.sessionIds.indexOf(sessionId) !== -1)
      const root = (mine && mine.path) || (list[0] && list[0].path) || ''
      if (root && root !== panel.model.get().root) panel.model.set({ root: root })
    }, [sessionId, workspaceItems, panel])

    // First look around: what is running right now?
    React.useEffect(() => {
      let cancelled = false
      void (async () => {
        const hostState = await api('state', { sid: sessionId })
        if (cancelled || !hostState || !hostState.ok) return
        panel.model.set({
          proxyPrefix: hostState.proxyPrefix || panel.model.get().proxyPrefix,
          command: hostState.command || null,
          log: hostState.log || [],
        })
        if (!panel.model.get().url) await runDetect(panel, { auto: true })
      })()
      return () => {
        cancelled = true
      }
    }, [panel, sessionId])

    React.useEffect(() => {
      panel.draftWriter = {
        sessionId: sessionId,
        draft: draft,
        setDraft: (value) => inputActions && inputActions.setDraft(value),
      }
    }, [panel, sessionId, draft, inputActions])

    React.useEffect(() => {
      const onMessage = (event) => {
        const frame = frameRef
        if (!frame || event.source !== frame.contentWindow) return
        const data = event.data
        if (!data) return
        if (data.source === CHANNEL_IN) {
          if (data.type === 'ready' || data.type === 'changed') {
            const current = panel.model.get()
            panel.model.set({
              annotations: data.annotations || [],
              viewport: data.viewport || current.viewport,
              // The overlay reports the proxied path; the upstream URL is the
              // one worth keeping, so only fill in when we have nothing.
              page: current.url ? current.page : data.path || current.page,
            })
          } else if (data.type === 'mode') {
            panel.model.set({ mode: data.mode })
          } else if (data.type === 'send') {
            sendAll(panel, inputActions && inputActions.setDraft)
          }
          return
        }
        if (data.source === PAGE_CHANNEL && data.type === 'navigated' && data.url) {
          // SPA route change: follow it in the address bar and remember it.
          const current = panel.model.get()
          if (data.url === current.url) return
          const history = current.history.slice(0, current.index + 1).concat([data.url])
          panel.model.set({ url: data.url, input: data.url, history: history.slice(-40), index: Math.min(history.length - 1, 39) })
        }
      }
      window.addEventListener('message', onMessage)
      return () => window.removeEventListener('message', onMessage)
    }, [panel, inputActions, annotations])

    const go = (delta) => {
      const current = panel.model.get()
      const index = current.index + delta
      if (index < 0 || index >= current.history.length) return
      const url = current.history[index]
      panel.model.set({ index: index, url: url, input: url, src: proxyUrlFor(panel, url), mode: 'idle' })
    }

    const reload = () => {
      const frame = frameRef
      if (frame && frame.contentWindow) {
        try {
          frame.contentWindow.location.reload()
          return
        } catch (error) {
          void error
        }
      }
      panel.model.set({ src: panel.model.get().src })
    }

    const copy = (text) => {
      try {
        void navigator.clipboard.writeText(text)
        flash(panel, '已复制：' + text)
      } catch (error) {
        void error
      }
    }

    const showList = () => {
      panel.model.set({ view: 'list', mode: 'idle', notice: null })
      notify('set-mode', { mode: 'idle' })
      void runDetect(panel, { auto: false })
    }

    const toggleMode = () => {
      const next = state.mode === 'picking' ? 'idle' : 'picking'
      panel.model.set({ mode: next })
      notify('set-mode', { mode: next })
    }

    const notice = state.notice
      ? React.createElement(
          'div',
          { className: 'dsa-notice' },
          state.notice,
          React.createElement('button', { type: 'button', title: '知道了', onClick: () => panel.model.set({ notice: null }) }, '✕')
        )
      : null

    if (state.view === 'list') {
      const services = state.services
      const commands =
        state.hint && state.hint.commands && state.hint.commands.length
          ? state.hint.commands
          : [{ script: 'dev', command: 'npm run dev' }]
      return React.createElement(
        'div',
        { className: 'dsa-col' },
        notice,
        React.createElement(
          'div',
          { className: 'dsa-listwrap' },
          React.createElement(
            'div',
            { className: 'dsa-sechead' },
            state.detect === 'busy'
              ? '正在检测本地服务…'
              : services.length
                ? '检测到 ' + services.length + ' 个本地服务'
                : '没有检测到本地服务',
            React.createElement(
              'button',
              { className: 'dsa-ico', type: 'button', title: '重新检测', disabled: state.detect === 'busy', onClick: () => void runDetect(panel, { auto: false }) },
              React.createElement(Icon, { name: 'refresh' })
            )
          ),
          services.map((service) =>
            React.createElement(
              'button',
              { className: 'dsa-svc', type: 'button', key: service.port, onClick: () => openUpstream(panel, service.url) },
              React.createElement('span', { className: 'dot' }),
              React.createElement(
                'span',
                { className: 'copy' },
                React.createElement('b', null, service.title || service.url),
                React.createElement('span', null, service.url)
              ),
              React.createElement('span', { className: 'go' }, '打开 →')
            )
          ),
          !services.length && state.detect !== 'busy'
            ? React.createElement(
                'div',
                { className: 'dsa-hintbox' },
                React.createElement('p', null, '没有正在运行的本地 web（已扫 ' + (state.scanned || 0) + ' 个端口）。先把它跑起来，再点刷新：'),
                commands.map((entry) =>
                  React.createElement(
                    'div',
                    { className: 'dsa-cmd', key: entry.command },
                    React.createElement('code', null, entry.command),
                    React.createElement('button', { type: 'button', onClick: () => copy(entry.command) }, '复制')
                  )
                ),
                React.createElement('p', { style: { marginTop: '10px' } }, '跑起来后这里会自动出现，点一下就能标注。')
              )
            : null
        ),
        React.createElement(
          'div',
          { className: 'dsa-openrow' },
          React.createElement('input', {
            value: state.input,
            spellCheck: false,
            placeholder: '5173 或 localhost:3000',
            onChange: (event) => panel.model.set({ input: event.target.value }),
            onKeyDown: (event) => {
              if (event.key === 'Enter') openUpstream(panel, event.target.value)
            },
          }),
          React.createElement('button', { type: 'button', onClick: () => openUpstream(panel, state.input) }, '打开')
        )
      )
    }

    return React.createElement(
      'div',
      { className: 'dsa-col' },
      notice,
      React.createElement(
        'div',
        { className: 'dsa-bar' },
        React.createElement('button', { className: 'dsa-ico', type: 'button', title: '后退', disabled: state.index <= 0, onClick: () => go(-1) }, React.createElement(Icon, { name: 'back' })),
        React.createElement('button', { className: 'dsa-ico', type: 'button', title: '前进', disabled: state.index >= state.history.length - 1, onClick: () => go(1) }, React.createElement(Icon, { name: 'forward' })),
        React.createElement('button', { className: 'dsa-ico', type: 'button', title: '重新载入', onClick: reload }, React.createElement(Icon, { name: 'refresh' })),
        React.createElement('input', {
          className: 'dsa-url',
          value: state.input,
          spellCheck: false,
          placeholder: '地址',
          onChange: (event) => panel.model.set({ input: event.target.value }),
          onKeyDown: (event) => {
            if (event.key === 'Enter') openUpstream(panel, event.target.value)
          },
        }),
        React.createElement('button', { className: 'dsa-ico', type: 'button', title: '回到本地服务列表', onClick: showList }, React.createElement(Icon, { name: 'list' }))
      ),
      React.createElement(
        'div',
        { className: 'dsa-bar', style: { paddingTop: 0, borderTop: 0 } },
        React.createElement(
          'button',
          {
            className: 'dsa-ico',
            type: 'button',
            'data-on': state.mode === 'picking' ? 'true' : 'false',
            title: '标记模式：点击元素写批注，⌘/Ctrl+点击立即发送，Esc 退出',
            onClick: toggleMode,
          },
          React.createElement(Icon, { name: 'marker' })
        ),
        React.createElement('button', { className: 'dsa-ico', type: 'button', title: '在系统浏览器打开', onClick: () => window.open(state.url, '_blank', 'noopener') }, React.createElement(Icon, { name: 'external' })),
        React.createElement('span', { className: 'dsa-count' }, annotations.length ? String(annotations.length) : ''),
        React.createElement(
          'button',
          {
            className: 'dsa-send',
            type: 'button',
            disabled: !annotations.length,
            title: '把全部标注作为一段结构化说明写进输入框',
            onClick: () => sendAll(panel, inputActions && inputActions.setDraft),
          },
          '发给 AI'
        )
      ),
      React.createElement(
        'div',
        { className: 'dsa-stage' },
        React.createElement('iframe', {
          className: 'dsa-frame',
          key: state.src,
          src: state.src,
          title: '预览',
          sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals',
          ref: (el) => {
            frameRef = el
          },
          onLoad: (event) => {
            injectOverlay(event.currentTarget, panel)
            try {
              const reported = event.currentTarget.contentWindow.__dshAnnoState
                ? event.currentTarget.contentWindow.__dshAnnoState()
                : null
              if (reported && reported.url && reported.url !== panel.model.get().url) {
                panel.model.set({ url: reported.url, input: reported.url, page: new URL(reported.url).pathname })
              }
            } catch (error) {
              void error
            }
          },
        }),
        state.cors
          ? React.createElement(
              'div',
              { className: 'dsa-empty' },
              React.createElement('h4', null, '这个页面读不到 DOM，标注层注入不进去'),
              React.createElement('p', null, '跨源页面无法标注。回到列表选一个本地服务（本地服务会自动经同源代理打开）。')
            )
          : null,
        React.createElement('div', { className: 'dsa-stagefoot' }, React.createElement('i'), React.createElement('span', null, state.url))
      ),
      React.createElement(
        'div',
        { className: 'dsa-list' },
        annotations.length === 0
          ? React.createElement(
              'div',
              { className: 'dsa-empty', style: { position: 'static', background: 'transparent', padding: '16px' } },
              React.createElement('p', null, '还没有标注。点上面的标记按钮，在页面里点击元素写批注；⌘/Ctrl+点击可直接发送。')
            )
          : annotations.map((ann, index) =>
              React.createElement(
                'div',
                { className: 'dsa-item', key: ann.id },
                React.createElement('div', { className: 'dsa-idx' }, String(index + 1)),
                React.createElement(
                  'div',
                  { className: 'dsa-body' },
                  React.createElement(
                    'div',
                    { className: 'dsa-meta' },
                    React.createElement('b', null, ann.tag + (ann.classes && ann.classes.length ? '.' + ann.classes[0] : '')),
                    ann.component ? React.createElement('span', null, ann.component) : null,
                    React.createElement('span', null, ann.rect.w + '×' + ann.rect.h)
                  ),
                  React.createElement('div', { className: 'dsa-sel' }, ann.selector),
                  React.createElement('div', { className: 'dsa-comment' }, ann.comment)
                ),
                React.createElement(
                  'div',
                  { className: 'dsa-acts' },
                  React.createElement('button', { className: 'dsa-mini', type: 'button', title: '在预览里定位', onClick: () => notify('focus', { id: ann.id }) }, React.createElement(Icon, { name: 'locate' })),
                  React.createElement('button', { className: 'dsa-mini', type: 'button', 'data-danger': 'true', title: '删除这条标注', onClick: () => notify('remove', { id: ann.id }) }, React.createElement(Icon, { name: 'trash' }))
                )
              )
            )
      )
    )
  }

    // ------------------------------------------------------- smaller entries

  const HeaderButton = (props) => {
    const panel = getPanel(props.sessionId)
    useSub(panel.model)
    const count = panel.model.get().annotations.length
    return React.createElement(
      'button',
      {
        className: 'dsa-open',
        type: 'button',
        'data-count': count > 0 ? 'true' : 'false',
        title: '界面标注（⌘⇧B）：列出本地在跑的服务，点开就能标注',
        onClick: openAnnotate,
      },
      React.createElement(Icon, { name: 'marker' }),
      React.createElement('span', null, count ? '标注 ' + count : '标注')
    )
  }

  const Dock = (props) => {
    const panel = getPanel(props.sessionId)
    useSub(panel.model)
    const draft = props.useInput((s) => s.draft)
    const pending = panel.model.get().pending
    if (!pending.length) return null
    return React.createElement(
      'div',
      { className: 'dsa-dock' },
      pending.map((item) =>
        React.createElement(
          'span',
          { className: 'dsa-chip', key: item.id },
          React.createElement('span', { className: 'dot' }),
          '已附 ' + item.count + ' 条标注',
          React.createElement(
            'button',
            {
              type: 'button',
              title: '从输入框移除这段标注',
              onClick: () => {
                const next = String(draft || '').replace(item.payload, '').replace(/\n{3,}/g, '\n\n').trim()
                props.inputActions.setDraft(next)
                panel.model.set({ pending: pending.filter((p) => p.id !== item.id) })
              },
            },
            '✕'
          )
        )
      ),
      React.createElement(
        'button',
        {
          className: 'dsa-chip-clear',
          type: 'button',
          onClick: () => {
            let next = String(draft || '')
            pending.forEach((item) => {
              next = next.replace(item.payload, '')
            })
            props.inputActions.setDraft(next.replace(/\n{3,}/g, '\n\n').trim())
            panel.model.set({ pending: [] })
          },
        },
        '全部移除'
      )
    )
  }

  // ------------------------------------------------------------ registration

  if (sidebarRightTabs && typeof sidebarRightTabs.register === 'function') {
    ctx.effect(() =>
      sidebarRightTabs.register({
        id: TAB_ID,
        kind: KIND,
        priority: 'extension',
        title: () => '界面标注',
        guide: [
          {
            order: 40,
            title: () => '界面标注',
            description: () => '检测本地在跑的 web，点开即可圈选元素写批注，一次发给 DeepSeek',
            icon: (iconProps) => React.createElement(Icon, Object.assign({ name: 'marker' }, iconProps)),
          },
        ],
      })
    )
  } else {
    console.warn('dsh-annotate: sidebarRightTabs is unavailable; the tab cannot register')
  }

  const contribute = (key, id, component, label, extra) => {
    try {
      slots.inject(key, () => slots.register(Object.assign({ name: key, id: id, label: label, order: 12 }, extra), component))
    } catch (error) {
      console.warn('dsh-annotate: slot ' + key + ' unavailable', error)
    }
  }
  contribute('sidebar.right.pane.tab', TAB_ID, AnnotateTab, undefined, { key: TAB_ID })
  contribute('conversation.session.header.utilities', 'annotate-open', HeaderButton, '界面标注')
  contribute('conversation.input.dock', 'annotate-dock', Dock)

  // ⌘⇧B mirrors Codex's in-app browser; ⌘⇧A stays as an alias.
  const onKeyDown = (event) => {
    if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return
    const key = String(event.key).toLowerCase()
    if (key !== 'b' && key !== 'a') return
    event.preventDefault()
    openAnnotate()
  }
  window.addEventListener('keydown', onKeyDown)
  ctx.effect(() => () => window.removeEventListener('keydown', onKeyDown))
}



