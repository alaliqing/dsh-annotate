/**
 * dsh-annotate — Client half.
 *
 * The right-sidebar tab has two faces:
 *
 *  - **list** — the local web servers that are actually running, discovered by
 *    the host half; one click opens one (a lone find opens itself). Nothing to
 *    configure, nothing to type. If nothing is up, it says what to run.
 *  - **page** — the opened page, served from its own isolated loopback preview
 *    origin so its DOM is readable, with element picking, comments and one
 *    structured block into the composer.
 *
 * Bundled by build.mjs into the ModuleLoader format. The overlay is a separate
 * script the host half injects into the previewed document.
 */
const inject = ['timer', 'sessions', 'slots', 'sidebarRight', 'sidebarRightTabs']

const CHANNEL_IN = 'dsh-annotate-overlay'
const CHANNEL_OUT = 'dsh-annotate-panel'
const PAGE_CHANNEL = 'dsh-annotate-page'
const KIND = 'annotate'
const TAB_ID = 'dsh-annotate'
const THEME = dsaTheme()
const MARKER = THEME.marker

// The panel's language is a user preference, kept on the harness origin; the
// injected overlay is told about a change over postMessage.
const LANG_KEY = 'dsh-annotate:lang'
const i18n = dsaI18n((() => {
  try { return localStorage.getItem(LANG_KEY) || '' } catch (error) { void error; return '' }
})())
const t = (key, vars) => i18n.t(key, vars)

/** Host replies carry a stable `code` plus any template values in `detail`;
 *  render that in the panel's language and fall back to the host's own wording. */
const hostMessage = (reply, fallbackKey) => {
  const code = reply && reply.code
  if (code) {
    const text = i18n.t('host.' + code, reply.detail || {})
    if (text !== 'host.' + code) return text
  }
  return (reply && reply.error) || t(fallbackKey)
}

const PANEL_CSS = `
.dsa-col { --dsa-ink:var(--dsw-alias-label-primary,${THEME.light.ink}); --dsa-muted:var(--dsw-alias-label-secondary,${THEME.light.muted});
  --dsa-surface:var(--dsw-alias-bg-layer-1,${THEME.light.surface}); --dsa-base:var(--dsw-alias-bg-base,${THEME.light.field});
  --dsa-line:color-mix(in srgb,var(--dsa-ink) 12%,transparent); --dsa-hover:color-mix(in srgb,var(--dsa-ink) 5%,transparent);
  display:flex; flex-direction:column; height:100%; min-height:0; min-width:0; position:relative; container-type:inline-size;
  color:var(--dsa-ink); background:var(--dsa-base); font:13px/1.5 ${THEME.sans}; }
.dsa-col { scrollbar-color:color-mix(in srgb,var(--dsa-ink) 25%,transparent) transparent; scrollbar-width:thin }
.dsa-col * { scrollbar-color:inherit; scrollbar-width:thin }
.dsa-col *, .dsa-col *::before, .dsa-col *::after { box-sizing:border-box }
.dsa-col button { font:inherit; cursor:pointer; touch-action:manipulation }
.dsa-col button:disabled { opacity:.35; cursor:default }
.dsa-col button:focus-visible, .dsa-col select:focus-visible, .dsa-col input:focus-visible { outline:2px solid ${THEME.focus}; outline-offset:2px }
.dsa-bar { position:relative; z-index:4; display:flex; align-items:center; gap:6px; min-height:${THEME.toolbarHeight}px; padding:7px 9px; flex:none;
  background:var(--dsa-surface); border-bottom:1px solid var(--dsa-line) }
.dsa-ico { display:inline-flex; align-items:center; justify-content:center; gap:5px; width:32px; height:32px; padding:0; flex:none;
  border:0; border-radius:7px; background:transparent; color:var(--dsa-muted) }
.dsa-ico svg { width:15px; height:15px; flex:none }
.dsa-ico:hover:not(:disabled), .dsa-menu button:hover:not(:disabled), .dsa-mini:hover { background:var(--dsa-hover); color:var(--dsa-ink) }
.dsa-ico[data-on="true"] { background:var(--dsa-hover); color:var(--dsa-ink) }
.dsa-mark { width:auto; padding:0 8px; font-size:12px!important; white-space:nowrap }
.dsa-address { flex:1; min-width:0; display:flex; align-items:center; height:32px; border:1px solid transparent; border-radius:8px;
  background:color-mix(in srgb,var(--dsa-ink) 4%,var(--dsa-surface)); padding-left:9px }
.dsa-address:focus-within { border-color:var(--dsa-line); background:var(--dsa-surface) }
.dsa-url { width:100%; min-width:0; border:0; outline:none!important; background:transparent; color:var(--dsa-muted);
  font:11px ${THEME.mono}; text-overflow:ellipsis; padding:0 }
.dsa-url:focus { color:var(--dsa-ink) }
.dsa-address .dsa-ico { width:30px; height:30px }
.dsa-popover { position:absolute; z-index:8; max-width:calc(100% - 16px); padding:5px; border:1px solid var(--dsa-line); border-radius:12px;
  color:var(--dsa-ink); background:var(--dsa-surface); box-shadow:0 8px 26px #0002; pointer-events:auto }
.dsa-menu { top:43px; right:8px; width:220px; max-height:min(520px,calc(100vh - 80px)); overflow:auto }
.dsa-menu button { display:flex; align-items:center; gap:8px; width:100%; padding:6px 9px; min-height:34px; border:0; border-radius:6px;
  background:transparent; color:inherit; text-align:left; font-size:12px }
.dsa-menu button svg { width:14px; height:14px; color:var(--dsa-muted) }
.dsa-menu button .dsa-menu-value { margin-left:auto; color:var(--dsa-muted); font-size:11px }
.dsa-menu-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 9px; min-height:38px; font-size:12px }
.dsa-width { width:100px; min-width:0; height:30px; border:1px solid var(--dsa-line); border-radius:6px; color:inherit;
  background:var(--dsa-surface); font:11px ${THEME.sans}; padding:0 5px }
.dsa-menu-sep { border-top:1px solid var(--dsa-line); margin:5px 4px }
.dsa-help { padding:8px 9px; font-size:11px; line-height:1.7; color:var(--dsa-muted) }
.dsa-help b { display:block; margin:8px 0 3px; color:var(--dsa-ink); font-size:11px }
.dsa-help b:first-child { margin-top:0 }
.dsa-help p { margin:0 0 5px }
.dsa-stage { position:relative; flex:1; min-height:0; overflow:hidden; background:var(--dsa-base) }
.dsa-frame { width:100%; height:100%; border:0; display:block; background:white }
.dsa-foot { position:absolute; z-index:5; left:50%; bottom:14px; transform:translateX(-50%); display:flex; align-items:center; gap:4px;
  height:44px; max-width:calc(100% - 24px); padding:5px 6px 5px 10px; border:1px solid var(--dsa-line); border-radius:24px;
  background:var(--dsa-surface); box-shadow:0 4px 18px #0002 }
.dsa-review-toggle { display:flex; gap:7px; align-items:center; min-width:0; height:32px; padding:0 5px; border:0; border-radius:6px;
  background:transparent; color:var(--dsa-muted); white-space:nowrap; font-size:12px!important }
.dsa-review-toggle svg { width:14px; height:14px; flex:none }
.dsa-review-toggle:hover { background:var(--dsa-hover); color:var(--dsa-ink) }
.dsa-foot .dsa-ico { width:28px; height:30px }
.dsa-divider { height:15px; border-left:1px solid var(--dsa-line); margin:0 3px }
.dsa-send { display:inline-flex; align-items:center; justify-content:center; flex:none; min-height:32px; padding:0 12px;
  border:0; border-radius:7px; background:var(--dsa-ink); color:var(--dsa-surface); font-size:12px!important }
.dsa-foot .dsa-send { width:32px; height:32px; padding:0; border-radius:50% }
.dsa-send svg { width:15px; height:15px }
.dsa-send:hover:not(:disabled) { opacity:.85 }
.dsa-busy { animation:dsa-pulse 1s ease-in-out infinite; font:700 16px ${THEME.mono} }
@keyframes dsa-pulse { 50% { opacity:.4 } }
.dsa-submit-menu { left:50%; bottom:66px; transform:translateX(-50%); top:auto; width:190px }
.dsa-review-panel { left:50%; bottom:66px; transform:translateX(-50%); width:310px; max-height:min(360px,55%); overflow:auto }
.dsa-item { display:flex; align-items:flex-start; gap:3px; border-bottom:1px solid var(--dsa-line) }
.dsa-item:last-child { border-bottom:0 }
.dsa-note-open { display:flex; align-items:flex-start; flex:1; min-width:0; gap:9px; padding:10px 7px; border:0; border-radius:7px;
  color:inherit; background:transparent; text-align:left; font-size:12px!important; line-height:1.65!important }
.dsa-note-open:hover { background:var(--dsa-hover) }
.dsa-idx { flex:none; width:18px; height:18px; margin-top:1px; border-radius:50%; display:grid; place-items:center; background:color-mix(in srgb,${MARKER} 19%,var(--dsa-surface));
  color:var(--dsa-ink); font:600 9px ${THEME.mono} }
.dsa-body { min-width:0; flex:1; overflow-wrap:anywhere }
.dsa-comment { display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; white-space:pre-wrap }
.dsa-note-target { display:block; margin-top:3px; color:var(--dsa-muted); font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.dsa-draft-label { display:block; color:var(--dsa-muted); font-size:10px; margin-top:3px }
.dsa-mini { display:inline-flex; align-items:center; justify-content:center; width:28px; height:30px; margin:6px 2px 0 0; flex:none; padding:0;
  color:var(--dsa-muted); border:0; border-radius:6px; background:transparent; opacity:.55 }
.dsa-mini svg { width:13px; height:13px }
.dsa-item:hover .dsa-mini, .dsa-item:focus-within .dsa-mini { opacity:1 }
.dsa-mini[data-danger="true"]:hover { color:var(--dsw-alias-state-error-primary,#c25151) }
.dsa-pick-hint { position:absolute; bottom:18px; left:14px; z-index:2; pointer-events:none; color:var(--dsa-muted); font-size:10px }
.dsa-pick-hint[data-batch="true"] { bottom:68px; left:50%; transform:translateX(-50%); white-space:nowrap }
.dsa-notice { display:flex; align-items:center; gap:8px; padding:9px 11px; color:var(--dsa-ink); background:var(--dsa-surface); font-size:12px; line-height:1.6 }
.dsa-toast { position:absolute; left:50%; bottom:68px; transform:translateX(-50%); z-index:9; max-width:calc(100% - 24px); width:max-content;
  border:1px solid var(--dsa-line); border-radius:10px; box-shadow:0 4px 18px #0002 }
.dsa-toast[data-kind="error"] { border-color:color-mix(in srgb,#c25151 45%,var(--dsa-line)) }
.dsa-notice button { display:inline-flex; align-items:center; justify-content:center; flex:none; min-width:28px; min-height:28px; border:0; border-radius:5px; padding:2px 5px; color:inherit; background:transparent; font-size:11px }
.dsa-notice button:hover { background:var(--dsa-hover) }
.dsa-notice .dsa-dismiss { margin-left:auto; color:var(--dsa-muted) }
.dsa-empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px;
  padding:24px; text-align:center; color:var(--dsa-muted); background:var(--dsa-base) }
.dsa-empty h4 { margin:0; font-size:13px; color:var(--dsa-ink); font-weight:600 }
.dsa-empty p { margin:0; max-width:330px; font-size:12px; line-height:1.65 }
.dsa-listwrap { flex:1; min-height:0; overflow:auto }
.dsa-sechead { display:flex; align-items:center; gap:8px; padding:16px 14px 9px; font-size:12px; color:var(--dsa-muted) }
.dsa-sechead .dsa-ico { margin-left:auto }
.dsa-svc { display:flex; align-items:center; gap:10px; width:calc(100% - 20px); margin:0 10px 7px; padding:12px; border:1px solid var(--dsa-line); border-radius:9px;
  background:var(--dsa-surface); color:inherit; text-align:left }
.dsa-svc:hover { border-color:color-mix(in srgb,var(--dsa-ink) 25%,transparent) }
.dsa-svc .dot { width:6px; height:6px; border-radius:50%; flex:none; background:#4b9c72 }
.dsa-svc .copy { flex:1; min-width:0 }
.dsa-svc .copy b { display:block; font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.dsa-svc .copy span { display:block; margin-top:3px; color:var(--dsa-muted); font:10.5px ${THEME.mono}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.dsa-svc .copy .dsa-tag { display:inline-block; margin:0 0 0 6px; font-family:inherit; font-size:9px; vertical-align:1px }
.dsa-svc .go { flex:none; font-size:11px; color:var(--dsa-muted) }
.dsa-tag { display:inline-block; margin-left:6px; padding:1px 5px; border-radius:5px; font-size:9px; vertical-align:1px; color:var(--dsa-muted); background:var(--dsa-hover) }
.dsa-tag.is-project { color:var(--dsa-ink); background:color-mix(in srgb,${MARKER} 17%,transparent) }
.dsa-file .dot { background:#9299a2 }
.dsa-openrow { display:flex; align-items:center; gap:8px; padding:12px; border-top:1px solid var(--dsa-line) }
.dsa-openrow input { min-width:0; flex:1; height:34px; padding:0 9px; border:1px solid var(--dsa-line); border-radius:7px; color:inherit; background:var(--dsa-surface); font:11px ${THEME.mono} }
.dsa-openrow button { height:34px; padding:0 12px; border:0; border-radius:7px; background:var(--dsa-ink); color:var(--dsa-surface); font-size:12px }
.dsa-hintbox { padding:14px; color:var(--dsa-muted); font-size:12px; line-height:1.75 }
.dsa-hintbox p { margin:0 0 8px }
.dsa-cmd { display:flex; align-items:center; gap:8px; padding:7px 9px; margin-bottom:5px; border:1px solid var(--dsa-line); border-radius:7px; background:var(--dsa-surface) }
.dsa-cmd code { min-width:0; flex:1; overflow-wrap:anywhere; font:11px ${THEME.mono} }
.dsa-cmd button { flex:none; border:0; background:transparent; color:inherit; font-size:11px }
.dsa-dock { display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:0 2px 6px }
.dsa-chip { display:inline-flex; align-items:center; gap:6px; min-height:26px; padding:0 4px 0 8px; border-radius:20px; font-size:11.5px;
  color:var(--dsw-alias-label-primary,${THEME.light.ink}); background:color-mix(in srgb,${MARKER} 16%,transparent); border:1px solid color-mix(in srgb,${MARKER} 42%,transparent) }
.dsa-chip .dot { width:6px; height:6px; border-radius:50%; background:${MARKER} }
.dsa-chip button, .dsa-chip-clear { border:0; background:transparent; color:inherit; cursor:pointer; padding:3px 5px; border-radius:50%; font-size:11px }
.dsa-global-notice { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:2147483647; padding:12px 18px; border-radius:10px;
  background:#252525; color:#fff; box-shadow:0 4px 18px #0003; font:13px/1.5 ${THEME.sans}; max-width:calc(100vw - 32px) }
@container (max-width:380px) { .dsa-bar { padding:7px 6px; gap:4px } .dsa-mark { width:32px; padding:0 } .dsa-mark span { display:none } .dsa-url { font-size:10px } .dsa-address { padding-left:7px } .dsa-mini { opacity:.7 } }
@media (pointer:coarse) { .dsa-mini { opacity:1 } }
@media (prefers-reduced-motion:reduce) { .dsa-col * { transition:none!important; animation:none!important } }
`

function injectStyles(text) {
  const el = document.createElement('style')
  el.setAttribute('data-dsh-annotate', '')
  // Claim ownership before other lazy factories inventory untagged styles.
  el.setAttribute('data-plugin', 'dsh-annotate')
  el.setAttribute('data-plugin-css', 'dsh-annotate/panel.css')
  el.textContent = text
  document.head.appendChild(el)
  return () => el.remove()
}

const ICONS = {
  send: 'M12 20V4m-6 6 6-6 6 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  attach: 'm9 14 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7l9-9M7 16l8-8',
  annotation: 'M8 18H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-5l-5 3v-3ZM7 8h10M7 12h6',
  marker: 'M3 17.2 14.4 5.8a2 2 0 0 1 2.8 0l1 1a2 2 0 0 1 0 2.8L6.8 21H3z',
  refresh: 'M13.6 4.2a6.8 6.8 0 1 0 6.4 8.5h-2a4.8 4.8 0 1 1-4.4-6.5V9l4-3.4z',
  back: 'M14.5 5 7.5 12l7 7',
  forward: 'M9.5 5l7 7-7 7',
  list: 'M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z',
  locate: 'M12 2v3m0 14v3M2 12h3m14 0h3M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z',
  trash: 'M6 7h12l-1 13H7zM9 4h6l1 2H8z',
  external: 'M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14zM5 6h5v2H7v9h9v-3h2v5H5z',
  review: 'M5 5.5h14v10H10l-5 4z',
  chevron: 'M7.4 10 12 14.6 16.6 10',
  help: 'M12 4a4 4 0 0 1 4 4c0 2-1.3 2.9-2.3 3.6-.7.5-1 .9-1 1.6v.4h-2v-.6c0-1.5.7-2.3 1.8-3.1.8-.5 1.4-1 1.4-1.9A1.9 1.9 0 0 0 12 6a1.9 1.9 0 0 0-2 1.8H8A3.9 3.9 0 0 1 12 4zm0 12.1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z',
}

function Icon(props) {
  return React.createElement(
    'svg',
    { viewBox: '0 0 24 24', width: 20, height: 20, className: props.className, style: props.style, 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' },
    props.name === 'more'
      ? [5, 12, 19].map((cx) => React.createElement('circle', { key: cx, cx, cy: 12, r: 1.35, fill: 'currentColor', stroke: 'none' }))
      : React.createElement('path', { d: ICONS[props.name] })
  )
}

function compactText(value, max = 64) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

function payloadOf(ann, index, viewport) {
  // Keep the requested change intact. Technical context is a single locator
  // line unless the captured selector needs disambiguation.
  const comment = String(ann.comment || '').replace(/\n/g, '\n   ')
  const lines = [(index + 1) + '. ' + comment]
  const label = compactText(ann.ariaLabel || ann.alt || ann.text || ann.name || ann.component)
  const selector = String(ann.selector || '')
  const unique = !!selector && ann.selectorMatches === 1
  let status = ''
  if (!selector) status = t('payload.selectorMissing')
  else if (ann.selectorMatches > 1) status = t('payload.selectorAmbiguous', { count: ann.selectorMatches })
  else if (ann.selectorMatches === 0) status = t('payload.selectorNotFound')
  else if (ann.selectorMatches === -1) status = t('payload.selectorInvalid')
  else if (!unique) status = t('payload.selectorUnknown')
  lines.push(t('payload.locator') + selector + status + (label ? ' · “' + label + '”' : ''))
  if (!unique) {
    const anchors = [ann.tag || 'element']
    if (ann.role && ann.role !== ann.tag) anchors.push('role=' + ann.role)
    if (ann.testId) anchors.push(ann.testId)
    if (ann.name) anchors.push('name=' + JSON.stringify(compactText(ann.name)))
    if (ann.component) anchors.push('component=' + compactText(ann.component))
    const rect = ann.rect
    if (rect && ['x', 'y', 'w', 'h'].every(key => Number.isFinite(rect[key]))) {
      anchors.push(rect.w + '×' + rect.h + ' @ (' + rect.x + ', ' + rect.y + ')')
    }
    const size = ann.viewport || viewport
    if (size?.w && size?.h) anchors.push(t('payload.viewport', { w: size.w, h: size.h }))
    lines.push(t('payload.verify') + anchors.join(' · '))
  }
  return lines.join('\n')
}

function payloadBlock(annotations, page, viewport) {
  if (!annotations.length) return ''
  const head = t('payload.head', { page, count: annotations.length })
  return head + '\n' + annotations.map((ann, i) => payloadOf(ann, i, viewport)).join('\n\n')
}


function annotationLabel(ann) {
  return String(ann.ariaLabel || ann.text || ann.component || ann.tag || '').replace(/\s+/g, ' ').trim().slice(0, 70)
}

/** Accept what people actually type: `5173`, `:5173`, `localhost:3000/x`, a URL.
 *  A `file://` address passes through for a static page in the workspace; the
 *  host half decides whether that file may be read. */
function normalizeAddress(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  let candidate = raw
  if (/^\d+$/.test(candidate)) candidate = `http://127.0.0.1:${candidate}/`
  else if (candidate.startsWith(':')) candidate = `http://127.0.0.1${candidate}`
  else if (!/^[a-z]+:\/\//i.test(candidate)) candidate = `http://${candidate}`
  try {
    const url = new URL(candidate)
    if (url.protocol === 'file:') return url.host ? null : url.href
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch (error) {
    return null
  }
}

/** The browser has no path-to-URL helper: encode per segment, so a `#` or `?`
 *  in a file name cannot turn into a fragment or query. */
function fileAddressOf(path) {
  return 'file://' + String(path).split('/').map((part, index) => (index === 0 ? '' : encodeURIComponent(part))).join('/')
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
          files: [],
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
          helpOpen: false,
          menuOpen: false,
          sendMenuOpen: false,
          draft: null,
          listOpen: false,
          sending: false,
          loading: false,
          error: null,
          previewOrigin: '',
          previewLease: '',
          width: 'fit',
          pending: [],
          notice: null,
          root: '',
          lang: i18n.lang,
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
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ method: method, args: args || {} }),
      })
      return await res.json()
    } catch (error) {
      return { ok: false, error: String((error && error.message) || error) }
    }
  }

  let frameRef = null
  let activePanel = null

  const notify = (type, payload, panel = activePanel) => {
    const frame = panel?.frame || frameRef
    if (!frame || !frame.contentWindow) return
    // Messages carry the annotation payload, so they are addressed to the
    // preview origin rather than broadcast to '*'.
    let target = panel?.model?.get?.().previewOrigin || ''
    if (!target) {
      try { target = new URL(frame.src).origin } catch (error) { void error }
    }
    if (!target) return
    try {
      frame.contentWindow.postMessage(Object.assign({ source: CHANNEL_OUT, type: type }, payload || {}), target)
    } catch (error) {
      void error
    }
  }

  /** Language is a per-user preference, not per-panel: switching it re-renders
   *  this panel and tells the injected overlay to follow. */
  const switchLanguage = (panel) => {
    const next = i18n.toggle()
    try { localStorage.setItem(LANG_KEY, next) } catch (error) { void error }
    panel.model.set({ lang: next, helpOpen: false })
    notify('lang', { lang: next }, panel)
  }

  const openAnnotate = () => {
    try {
      if (sidebarRight && typeof sidebarRight.openTab === 'function') sidebarRight.openTab(KIND)
    } catch (error) {
      console.warn('dsh-annotate: could not open the sidebar tab', error)
      document.querySelector('.dsa-global-notice')?.remove()
      const notice = document.createElement('div')
      notice.className = 'dsa-global-notice'
      notice.setAttribute('role', 'status')
      notice.textContent = t('panel.noSession')
      document.body.appendChild(notice)
      setTimeout(() => notice.remove(), 6000)
    }
  }

  const flash = (panel, message, options = {}) => {
    // A toast replaces any previous one, so the undo affordance it carried must
    // go with it.
    panel.model.set({ notice: message, noticeKind: options.kind || 'info', undoAvailable: !!options.undo, canRetrySend: !!options.retry })
    if (panel.noticeTimer) clearTimeout(panel.noticeTimer)
    if (!options.retry) panel.noticeTimer = setTimeout(() => panel.model.set({ notice: null }), 6000)
  }

  /** Open a page: harness-origin URLs load directly, everything else through the
   *  loopback proxy (which is what makes its DOM readable). */
  const openUpstream = async (panel, raw, options) => {
    const push = !options || options.push !== false
    const url = normalizeAddress(raw)
    if (!url) {
      flash(panel, t('notice.badAddress'))
      return false
    }
    const parsed = new URL(url)
    const isFile = parsed.protocol === 'file:'
    // A file target is checked by the host against the session workspace.
    if (!isFile && (!isLoopback(parsed.hostname) || parsed.origin === location.origin)) {
      flash(panel, t('notice.notLocal'))
      return false
    }
    const request = (panel.openRequest || 0) + 1
    panel.openRequest = request
    panel.model.set({ loading: true, error: null, view: 'page', input: url })
    const lease = crypto.randomUUID()
    const preview = await api('preview', { sid: panel.sid, url, root: panel.model.get().root, lease, parentOrigin: location.origin })
    if (panel.openRequest !== request) {
      if (preview.ok) void api('releasePreview', { sid: panel.sid, origin: preview.origin, lease })
      return false
    }
    if (!preview.ok) {
      panel.model.set({ loading: false, error: hostMessage(preview, 'notice.previewFailed') })
      return false
    }
    const state = panel.model.get()
    const history = state.previewOrigin !== preview.origin ? [url] : push ? state.history.slice(0, state.index + 1).concat([url]) : state.history
    panel.model.set({
      view: 'page',
      url: url,
      input: url,
      src: preview.url,
      previewOrigin: preview.origin,
      previewLease: lease,
      history: history.slice(-40),
      index: Math.min(history.length - 1, 39),
      mode: 'idle',
      annotations: readAnnotations(panel, url),
      draft: readDraft(panel, url),
      menuOpen: false, sendMenuOpen: false, listOpen: false,
      page: isFile ? '/' + decodeURIComponent(parsed.pathname.split('/').pop() || '') : parsed.pathname,
      notice: null,
    })
    if (state.src === preview.url) notify('ping')
    return true
  }

  const runDetect = async (panel, options) => {
    const auto = !options || options.auto !== false
    // Check and claim the busy flag in that order: reading it after setting it
    // would make the re-entrancy guard a no-op.
    if (panel.model.get().detect === 'busy') return
    panel.model.set({ detect: 'busy' })
    const state = panel.model.get()
    const res = await api('detect', { sid: panel.sid, root: state.root, force: options?.force })
    if (!res || !res.ok) {
      panel.model.set({ detect: 'error' })
      flash(panel, t('notice.detectFailed', { error: hostMessage(res, 'notice.unknownError') }))
      return
    }
    panel.model.set({
      services: res.services || [],
      files: res.files || [],
      hint: res.hint || null,
      scanned: res.scanned || 0,
      detect: 'idle',
    })
    const current = panel.model.get()
    const services = res.services || []
    const files = res.files || []
    // One candidate and nothing open: the zero-configuration promise. A static
    // page only wins when no service is running at all.
    if (auto && current.view === 'list' && !current.url && (services.length === 1 || (!services.length && files.length === 1))) {
      openUpstream(panel, services.length ? services[0].url : fileAddressOf(files[0].path), { push: true })
      flash(panel, t(services.length ? 'notice.autoOpened' : 'notice.autoOpenedFile'))
    }
  }

  const annotationKey = (panel, url) => 'dsh-review:v2:' + encodeURIComponent(panel.sid) + ':' + encodeURIComponent(url)
  const readAnnotations = (panel, url) => {
    try { const value = JSON.parse(localStorage.getItem(annotationKey(panel, url)) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
  }
  const readDraft = (panel, url) => {
    try { return JSON.parse(localStorage.getItem(annotationKey(panel, url) + ':draft') || 'null') } catch { return null }
  }
  const writeAnnotations = (panel, url, annotations) => {
    try { localStorage.setItem(annotationKey(panel, url), JSON.stringify(annotations)) }
    catch { flash(panel, t('notice.storageUnavailable')) }
  }
  const followNavigation = (panel, url) => {
    const current = panel.model.get()
    if (!url || url === current.url) return
    const expected = panel.historyTarget
    const isTraversal = expected !== undefined && current.history[expected] === url
    const history = isTraversal ? current.history : current.history.slice(0, current.index + 1).concat([url])
    panel.historyTarget = undefined
    panel.model.set({ url, input: url, history: history.slice(-40), index: isTraversal ? expected : Math.min(history.length - 1, 39), annotations: readAnnotations(panel, url), draft: readDraft(panel, url), mode: 'idle', listOpen: false, menuOpen: false, sendMenuOpen: false })
  }
  const sendAll = async (panel, setDraft, options) => {
    const state = panel.model.get()
    if (!state.annotations.length || state.sending) return false
    if (state.mode === 'writing' || (state.draft?.existing && state.annotations.some((ann) => ann.id === state.draft.id))) { flash(panel, t('notice.finishEditing')); return false }
    const submit = !options || options.submit !== false
    const block = payloadBlock(state.annotations, state.url, state.viewport)
    const ids = state.annotations.map((ann) => ann.id)
    const clearAccepted = () => {
      const stored = readAnnotations(panel, state.url)
      const accepted = stored.filter((ann) => state.annotations.some((sent) => sent.id === ann.id && sent.comment === ann.comment))
      const acceptedIds = accepted.map((ann) => ann.id)
      const remaining = stored.filter((ann) => !acceptedIds.includes(ann.id))
      writeAnnotations(panel, state.url, remaining)
      if (panel.model.get().url === state.url) {
        panel.model.set({ annotations: remaining, mode: 'idle', listOpen: remaining.length ? panel.model.get().listOpen : false })
        if (activePanel === panel) notify('clear', { ids: acceptedIds })
      }
    }
    if (!submit) {
      const writer = setDraft || panel.draftWriter?.setDraft
      if (!writer) { flash(panel, t('notice.noComposer')); return false }
      const current = String(panel.draftWriter?.draft || '')
      const next = current.includes(block) ? current : (current ? current.trimEnd() + '\n\n' : '') + block
      try { writer(next) } catch { flash(panel, t('notice.attachFailed')); return false }
      if (panel.draftWriter) panel.draftWriter.draft = next
      panel.model.set({ pending: state.pending.concat([{ id: crypto.randomUUID(), count: ids.length, payload: block }]) })
      clearAccepted()
      flash(panel, t('notice.attached'))
      return true
    }
    // Use the session-addressed public controller and its admission receipt.
    // Existing composer drafts and attachments are deliberately untouched.
    const sessions = ctx.get('sessions')
    const scope = sessions?.scope?.(panel.sid)
    const session = scope && sessions.sessionOf(scope)
    if (!session?.prompt) { flash(panel, t('notice.sendUnsupported')); return false }
    panel.model.set({ sending: true, notice: null, canRetrySend: false })
    notify('busy', { value: true }, panel)
    let submission
    try {
      submission = session.beginSubmission({ mode: 'queue', text: block, attachments: [] })
      const result = await session.prompt([{ type: 'text', text: block }], 'queue', undefined, submission.requestId)
      if (!result?.ok || !result.value?.accepted) throw new Error(result?.error?.message || t('notice.notAccepted'))
      clearAccepted()
      flash(panel, t('notice.accepted', { count: ids.length }))
      return true
    } catch (error) {
      submission?.abandon()
      flash(panel, t('notice.sendFailed', { error: String(error.message || error) }), { kind: 'error', retry: true })
      return false
    } finally { panel.model.set({ sending: false }); if (panel.frame) notify('busy', { value: false }, panel) }
  }

    // --------------------------------------------------------------- tab body

  const AnnotateTab = (props) => {
    const panel = getPanel(props.sessionId)
    activePanel = panel
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
        if (cancelled) return
        if (!hostState?.ok) { panel.model.set({ detect: 'error' }); flash(panel, t('notice.pluginUnavailable')); return }
        const current = panel.model.get()
        if (!current.url) await runDetect(panel, { auto: true })
        else if (current.view === 'page') await openUpstream(panel, current.url, { push: false })
      })()
      return () => {
        cancelled = true
        panel.openRequest = (panel.openRequest || 0) + 1
        panel.model.set({ src: '', previewOrigin: '', previewLease: '' })
      }
    }, [panel, sessionId])

    React.useEffect(() => {
      if (state.view !== 'page' || !state.previewLease) return undefined
      const args = { sid: panel.sid, origin: state.previewOrigin, lease: state.previewLease }
      let cancelled = false
      const retain = async () => {
        const result = await api('retainPreview', args)
        // A suspended tab may outlive its lease; reopening restores annotations
        // from the Harness origin instead of leaving a dead iframe behind.
        if (!result.ok && !cancelled) await openUpstream(panel, panel.model.get().url, { push: false })
      }
      const timer = setInterval(retain, 30_000)
      const onVisible = () => { if (!document.hidden) void retain() }
      document.addEventListener('visibilitychange', onVisible)
      return () => {
        cancelled = true
        clearInterval(timer)
        document.removeEventListener('visibilitychange', onVisible)
        void api('releasePreview', args)
      }
    }, [panel, state.view, state.previewOrigin, state.previewLease])

    React.useEffect(() => {
      panel.draftWriter = {
        sessionId: sessionId,
        draft: draft,
        setDraft: inputActions?.setDraft ? (value) => inputActions.setDraft(value) : null,
      }
    }, [panel, sessionId, draft, inputActions])

    React.useEffect(() => {
      if (state.view !== 'list') return undefined
      const timer = setInterval(() => { if (!document.hidden) void runDetect(panel, { auto: false }) }, 5000)
      return () => clearInterval(timer)
    }, [panel, state.view])
    React.useEffect(() => {
      if (!state.loading) return undefined
      const timer = setTimeout(() => panel.model.set({ loading: false, error: t('notice.loadTimeout') }), 18000)
      return () => clearTimeout(timer)
    }, [panel, state.loading, state.src])
    React.useEffect(() => () => { if (activePanel === panel) activePanel = null }, [panel])

    React.useEffect(() => {
      if (!state.menuOpen && !state.listOpen && !state.sendMenuOpen) return undefined
      const close = (event) => {
        if (event.target.closest?.('.dsa-popover, .dsa-popup-trigger')) return
        panel.model.set({ menuOpen: false, helpOpen: false, listOpen: false, sendMenuOpen: false })
      }
      document.addEventListener('pointerdown', close)
      return () => document.removeEventListener('pointerdown', close)
    }, [panel, state.menuOpen, state.listOpen, state.sendMenuOpen])

    React.useEffect(() => {
      const onMessage = (event) => {
        const frame = frameRef
        if (!frame || event.source !== frame.contentWindow || event.origin !== panel.model.get().previewOrigin) return
        const data = event.data
        if (!data) return
        if (data.source === CHANNEL_IN) {
          if (data.type === 'ready' || data.type === 'changed') {
            // Reusing an already loaded iframe only sends ping: there is no
            // new load/navigation event after an HTTP redirect. Follow the
            // overlay's actual URL before restoring or clearing its notes.
            followNavigation(panel, data.url)
            const current = panel.model.get()
            const pageUrl = data.url || current.url
            if (data.type === 'ready') {
              const draft = readDraft(panel, pageUrl)
              panel.model.set({ draft })
              notify('restore', { annotations: readAnnotations(panel, pageUrl), draft })
            }
            else writeAnnotations(panel, pageUrl, data.annotations || [])
            const nextAnnotations = data.type === 'ready' ? readAnnotations(panel, pageUrl) : data.annotations || []
            panel.model.set({
              loading: false,
              error: null,
              mode: data.type === 'ready' ? 'idle' : current.mode,
              annotations: nextAnnotations,
              listOpen: nextAnnotations.length ? current.listOpen : false,
              viewport: data.viewport || current.viewport,
              // The overlay reports the proxied path; the upstream URL is the
              // one worth keeping, so only fill in when we have nothing.
              page: current.url ? current.page : data.path || current.page,
            })
          } else if (data.type === 'draft') {
            panel.model.set({ draft: data.draft || null })
            try { localStorage.setItem(annotationKey(panel, data.url || panel.model.get().url) + ':draft', JSON.stringify(data.draft)) } catch { flash(panel, t('notice.draftUnavailable')) }
          } else if (data.type === 'interact') {
            panel.model.set({ menuOpen: false, sendMenuOpen: false, listOpen: false, helpOpen: false })
          } else if (data.type === 'warning' || data.type === 'missing') {
            flash(panel, data.message || t('notice.elementGone'))
          } else if (data.type === 'mode') {
            panel.model.set({ mode: data.mode })
          } else if (data.type === 'send') {
            sendAll(panel, inputActions && inputActions.setDraft)
          }
          return
        }
        if (data.source === PAGE_CHANNEL && data.type === 'error') { panel.model.set({ loading: false, error: hostMessage({ code: data.code, error: data.message }, 'notice.previewFailed') }); return }
        if (data.source === PAGE_CHANNEL && data.type === 'navigated' && data.url) {
          // SPA route change: follow it in the address bar and remember it.
          followNavigation(panel, data.url)
        }
      }
      window.addEventListener('message', onMessage)
      return () => window.removeEventListener('message', onMessage)
    }, [panel, inputActions, annotations])

    const go = (delta) => {
      const current = panel.model.get()
      const index = current.index + delta
      if (index < 0 || index >= current.history.length) return
      panel.historyTarget = index
      notify('navigate', { delta })
    }

    const reload = () => { panel.model.set({ loading: true, error: null }); notify('reload') }

    const copy = async (text) => {
      try {
        await navigator.clipboard.writeText(text)
        flash(panel, t('list.copied', { text: text }))
      } catch (error) {
        void error
      }
    }

    const showList = () => {
      panel.model.set({ view: 'list', src: '', previewOrigin: '', previewLease: '', mode: 'idle', notice: null, loading: false, error: null, listOpen: false, helpOpen: false, menuOpen: false, sendMenuOpen: false })
      panel.openRequest = (panel.openRequest || 0) + 1
      notify('set-mode', { mode: 'idle' })
      void runDetect(panel, { auto: false })
    }

    /** The overlay owns the mode (it may be mid-card), so ask it to toggle and
     *  let its `mode` message update this button. */
    const toggleMode = () => {
      notify('toggle-mode')
    }

    const notice = state.notice
      ? React.createElement(
          'div',
          { className: 'dsa-notice' + (state.view === 'page' ? ' dsa-toast' : ''), role: state.noticeKind === 'error' ? 'alert' : 'status', 'aria-live': 'polite', 'data-kind': state.noticeKind || 'info' },
          state.notice,
          state.canRetrySend ? React.createElement('button', { type: 'button', disabled: state.sending, onClick: () => sendAll(panel, inputActions?.setDraft) }, t('page.retry')) : null,
          state.undoAvailable ? React.createElement('button', { type: 'button', onClick: () => { notify('undo'); panel.model.set({ undoAvailable: false, notice: null }) } }, t('notice.undo')) : null,
          React.createElement('button', { className: 'dsa-dismiss', type: 'button', title: t('notice.dismiss'), 'aria-label': t('notice.dismiss'), onClick: () => panel.model.set({ notice: null }) }, '✕')
        )
      : null

    if (state.view === 'list') {
      const services = state.services
      const files = state.files
      const commands =
        state.hint && state.hint.commands && state.hint.commands.length
          ? state.hint.commands
          : [{ script: 'dev', command: 'npm run dev' }]
      const tag = (key, extra) => React.createElement('span', { className: 'dsa-tag' + (extra ? ' ' + extra : '') }, t(key))
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
              ? t('list.detecting')
              : services.length
                ? t('list.detected', { count: services.length })
                : t('list.none'),
            React.createElement(
              'button',
              { className: 'dsa-ico', type: 'button', title: t('list.redetect'), disabled: state.detect === 'busy', onClick: () => void runDetect(panel, { auto: false }) },
              React.createElement(Icon, { name: 'refresh' })
            )
          ),
          services.map((service) =>
            React.createElement(
              'button',
              { className: 'dsa-svc' + (service.project ? ' is-project' : ''), type: 'button', key: service.port, onClick: () => openUpstream(panel, service.url) },
              React.createElement('span', { className: 'dot' }),
              React.createElement(
                'span',
                { className: 'copy' },
                React.createElement(
                  'b',
                  null,
                  service.title || service.url,
                  service.project ? tag('list.project', 'is-project') : service.declared ? tag('list.declared') : null
                ),
                React.createElement('span', null, service.url)
              ),
              React.createElement('span', { className: 'go' }, t('list.open'))
            )
          ),
          files.length
            ? React.createElement('div', { className: 'dsa-sechead is-sub' }, t('list.filesHeader', { count: files.length }))
            : null,
          files.map((file) =>
            React.createElement(
              'button',
              { className: 'dsa-svc dsa-file', type: 'button', key: file.path, onClick: () => openUpstream(panel, fileAddressOf(file.path)) },
              React.createElement('span', { className: 'dot' }),
              React.createElement(
                'span',
                { className: 'copy' },
                React.createElement('b', null, file.rel),
                React.createElement('span', null, file.path)
              ),
              React.createElement('span', { className: 'go' }, t('list.open'))
            )
          ),
          !services.length && !files.length && state.detect !== 'busy'
            ? React.createElement(
                'div',
                { className: 'dsa-hintbox' },
                React.createElement('p', null, t('list.emptyHint', { count: state.scanned || 0 })),
                commands.map((entry) =>
                  React.createElement(
                    'div',
                    { className: 'dsa-cmd', key: entry.command },
                    React.createElement('code', null, entry.command),
                    React.createElement('button', { type: 'button', onClick: () => copy(entry.command) }, t('list.copy'))
                  )
                ),
                React.createElement('p', { style: { marginTop: '10px' } }, t('list.autoRefresh'))
              )
            : null
        ),
        React.createElement(
          'div',
          { className: 'dsa-openrow' },
          React.createElement('input', {
            value: state.input,
            spellCheck: false,
            placeholder: t('list.placeholder'),
            'aria-label': t('list.addressLabel'),
            onChange: (event) => panel.model.set({ input: event.target.value }),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !event.nativeEvent?.isComposing) openUpstream(panel, event.target.value)
            },
          }),
          React.createElement('button', { type: 'button', onClick: () => openUpstream(panel, state.input) }, t('list.openButton'))
        )
      )
    }

    const h = React.createElement
    const batchVisible = annotations.length > 0 || !!state.draft
    const closeMenus = () => panel.model.set({ menuOpen: false, helpOpen: false, sendMenuOpen: false, listOpen: false })
    const iconButton = (label, icon, onClick, props) => h('button', Object.assign({
      className: 'dsa-ico', type: 'button', title: label, 'aria-label': label, onClick,
    }, props), h(Icon, { name: icon }))
    const openComment = (ann) => { closeMenus(); notify('view', { id: ann.id }) }
    const resumeDraft = () => { closeMenus(); notify('resume-draft') }
    const draftRow = state.draft ? h('div', { className: 'dsa-item dsa-draft', key: 'draft' },
      h('button', { className: 'dsa-note-open', type: 'button', onClick: resumeDraft, title: t('page.resumeDraft') },
        h('span', { className: 'dsa-idx', 'aria-hidden': true }, '✎'),
        h('span', { className: 'dsa-body' }, h('span', { className: 'dsa-comment' }, state.draft.comment), h('span', { className: 'dsa-draft-label' }, t('page.draft')))),
      iconButton(t('page.discardDraft'), 'trash', () => notify('discard-draft'), { className: 'dsa-mini', 'data-danger': 'true' })) : null

    return h('div', { className: 'dsa-col' },
      h('div', { className: 'dsa-bar' },
        iconButton(t('page.backToList'), 'back', showList),
        h('div', { className: 'dsa-address' },
          h('input', {
            className: 'dsa-url', value: state.input, spellCheck: false, placeholder: t('page.addressPlaceholder'), 'aria-label': t('list.addressLabel'),
            onChange: (event) => panel.model.set({ input: event.target.value }),
            onKeyDown: (event) => { if (event.key === 'Enter' && !event.nativeEvent?.isComposing) { closeMenus(); openUpstream(panel, event.target.value) } },
          }), iconButton(t('page.reload'), 'refresh', () => { closeMenus(); reload() })),
        h('button', {
          className: 'dsa-ico dsa-mark', type: 'button', title: t('page.markTitle'), 'aria-label': t('page.markTitle'),
          'aria-pressed': state.mode !== 'idle', 'data-on': state.mode !== 'idle' ? 'true' : 'false',
          disabled: state.loading || !!state.error || state.sending, onClick: () => { closeMenus(); toggleMode() },
        }, h(Icon, { name: 'marker' }), h('span', null, t('page.mark'))),
        iconButton(t('page.more'), 'more', () => panel.model.set({ menuOpen: !state.menuOpen, listOpen: false, sendMenuOpen: false }), {
          className: 'dsa-ico dsa-popup-trigger', 'aria-expanded': !!state.menuOpen, 'aria-controls': 'dsa-menu-' + sessionId,
        }),
        state.menuOpen ? h('div', { className: 'dsa-popover dsa-menu', id: 'dsa-menu-' + sessionId, role: 'region', 'aria-label': t('page.more') },
          h('button', { type: 'button', title: t('page.back'), disabled: state.index <= 0, onClick: () => { closeMenus(); go(-1) } }, h(Icon, { name: 'back' }), t('page.back')),
          h('button', { type: 'button', title: t('page.forward'), disabled: state.index >= state.history.length - 1, onClick: () => { closeMenus(); go(1) } }, h(Icon, { name: 'forward' }), t('page.forward')),
          h('div', { className: 'dsa-menu-row' }, h('label', { htmlFor: 'dsa-width-' + sessionId }, t('page.widthLabel')),
            h('select', { id: 'dsa-width-' + sessionId, className: 'dsa-width', value: state.width, onChange: (event) => panel.model.set({ width: event.target.value }) },
              h('option', { value: 'fit' }, t('page.widthFit')), h('option', { value: '390' }, t('page.widthMobile')))),
          h('button', { className: 'dsa-lang', type: 'button', title: t('panel.languageSwitch', { lang: i18n.nextLabel() }), 'aria-label': t('panel.languageSwitch', { lang: i18n.nextLabel() }), onClick: () => switchLanguage(panel) },
            t('panel.language'), h('span', { className: 'dsa-menu-value' }, i18n.nextLabel())),
          h('button', { type: 'button', onClick: () => { closeMenus(); window.open(state.url, '_blank', 'noopener') } }, h(Icon, { name: 'external' }), t('page.openExternal')),
          h('div', { className: 'dsa-menu-sep' }),
          h('button', { type: 'button', 'aria-expanded': state.helpOpen, onClick: () => panel.model.set({ helpOpen: !state.helpOpen }) }, h(Icon, { name: 'help' }), t('page.help')),
          state.helpOpen ? h('div', { className: 'dsa-help' },
            h('b', null, t('list.helpHeader')), h('p', null, t('list.helpPicking')), h('p', null, t('list.helpEscape')), h('p', null, t('list.helpCmdClick')),
            h('b', null, t('list.helpSendHeader')), h('p', null, t('list.helpSendList')), h('p', null, t('list.helpSendActions'))) : null) : null),
      h('div', { className: 'dsa-stage' },
        state.src ? h('iframe', {
          className: 'dsa-frame', key: state.previewOrigin,
          style: state.width === 'fit' ? undefined : { width: state.width + 'px', maxWidth: '100%', margin: '0 auto' },
          src: state.src, title: t('page.previewTitle'), sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals',
          ref: (el) => { frameRef = el; panel.frame = el }, onLoad: () => { notify('ping'); notify('lang', { lang: i18n.lang }) },
        }) : null,
        state.error || state.loading ? h('div', { className: 'dsa-empty' },
          h('h4', null, t(state.error ? 'page.unavailable' : 'page.loading')), h('p', null, state.error || t('page.loadingHint')),
          state.error ? h('button', { className: 'dsa-send', type: 'button', onClick: () => openUpstream(panel, state.input) }, t('page.retry')) : null) : null,
        state.mode === 'picking' ? h('div', { className: 'dsa-pick-hint', 'data-batch': batchVisible ? 'true' : 'false' }, t('page.pickHint')) : null,
        batchVisible ? h('div', { className: 'dsa-foot', 'aria-label': t('page.batch') },
          h('button', {
            className: 'dsa-review-toggle dsa-popup-trigger', type: 'button', 'aria-expanded': state.listOpen,
            'aria-controls': 'dsa-review-panel-' + sessionId, 'aria-label': annotations.length ? t('page.listToggleLabel', { count: annotations.length }) : t('page.resumeDraft'),
            title: state.listOpen ? t('page.listCollapse') : t('page.listExpand'),
            onClick: () => { if (!annotations.length && state.draft) resumeDraft(); else panel.model.set({ listOpen: !state.listOpen, sendMenuOpen: false, menuOpen: false }) },
          }, h(Icon, { name: 'review' }), annotations.length ? t('page.batchCount', { count: annotations.length }) : t('page.draft')),
          h('span', { className: 'dsa-divider', 'aria-hidden': true }),
          iconButton(t('page.sendOptions'), 'more', () => panel.model.set({ sendMenuOpen: !state.sendMenuOpen, listOpen: false, menuOpen: false }), { className: 'dsa-ico dsa-popup-trigger', 'aria-expanded': !!state.sendMenuOpen, 'aria-controls': 'dsa-submit-menu-' + sessionId }),
          h('button', { className: 'dsa-send', type: 'button', title: t('page.sendHint'), 'aria-label': t(state.sending ? 'page.sending' : 'page.send'), disabled: !annotations.length || state.sending,
            onClick: (event) => { closeMenus(); sendAll(panel, inputActions?.setDraft, { submit: !(event.altKey || event.metaKey) }) },
          }, state.sending ? h('span', { className: 'dsa-busy', 'aria-hidden': true }, '···') : h(Icon, { name: 'send' }))) : null,
        state.listOpen && batchVisible ? h('div', {
          className: 'dsa-popover dsa-review-panel', id: 'dsa-review-panel-' + sessionId, role: 'region', 'aria-label': t('page.listAria'),
        }, draftRow, annotations.map((ann, index) => h('div', { className: 'dsa-item', key: ann.id },
          h('button', { className: 'dsa-note-open', type: 'button', title: t('page.view'), onClick: () => openComment(ann) },
            h('span', { className: 'dsa-idx', 'aria-hidden': true }, String(index + 1)), h('span', { className: 'dsa-body' },
              h('span', { className: 'dsa-comment' }, ann.comment), h('span', { className: 'dsa-note-target' }, annotationLabel(ann)))),
          iconButton(t('page.delete'), 'trash', () => { notify('remove', { id: ann.id }); flash(panel, t('notice.deleted'), { undo: true }) }, { className: 'dsa-mini', 'data-danger': 'true' })))) : null,
        state.sendMenuOpen ? h('div', { className: 'dsa-popover dsa-menu dsa-submit-menu', id: 'dsa-submit-menu-' + sessionId, role: 'region', 'aria-label': t('page.sendOptions') },
          h('button', { className: 'dsa-secondary', type: 'button', disabled: !annotations.length || state.sending, onClick: () => { closeMenus(); sendAll(panel, inputActions?.setDraft, { submit: false }) } }, h(Icon, { name: 'attach' }), t('page.attach'))) : null,
        notice))
  }

    // ------------------------------------------------------- smaller entries

  const Dock = (props) => {
    const panel = getPanel(props.sessionId)
    useSub(panel.model)
    const draft = props.useInput((s) => s.draft)
    const pending = panel.model.get().pending.filter((item) => String(draft || '').includes(item.payload))
    if (!pending.length) return null
    return React.createElement(
      'div',
      { className: 'dsa-dock' },
      pending.map((item) =>
        React.createElement(
          'span',
          { className: 'dsa-chip', key: item.id },
          React.createElement('span', { className: 'dot' }),
          t('payload.attached', { count: item.count }),
          React.createElement(
            'button',
            {
              type: 'button',
              title: t('payload.removeOne'),
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
        t('payload.removeAll')
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
        title: () => t('panel.tabTitle'),
        guide: [
          {
            order: 40,
            title: () => t('panel.tabTitle'),
            description: () => t('panel.tabDescription'),
            icon: (iconProps) => React.createElement(Icon, Object.assign({ name: 'annotation' }, iconProps)),
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
  contribute('conversation.input.dock', 'annotate-dock', Dock)

  // ⌘⇧B mirrors Codex's in-app browser; ⌘⇧A stays as an alias.
  const onKeyDown = (event) => {
    if (event.key === 'Escape' && activePanel) {
      const state = activePanel.model.get()
      if (state.menuOpen || state.listOpen || state.sendMenuOpen) {
        const surface = event.target.closest?.('.dsa-popover')
        if (surface?.id) document.querySelector('[aria-controls=' + JSON.stringify(surface.id) + ']')?.focus()
        event.preventDefault()
        activePanel.model.set({ menuOpen: false, helpOpen: false, listOpen: false, sendMenuOpen: false })
        return
      }
      activePanel.model.set({ mode: 'idle' })
      notify('set-mode', { mode: 'idle' })
      return
    }
    if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return
    const key = String(event.key).toLowerCase()
    if (key !== 'b' && key !== 'a') return
    event.preventDefault()
    openAnnotate()
  }
  window.addEventListener('keydown', onKeyDown)
  ctx.effect(() => () => window.removeEventListener('keydown', onKeyDown))
}
