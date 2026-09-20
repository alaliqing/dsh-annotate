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
const inject = ['timer', 'sessions']

const CHANNEL_IN = 'dsh-annotate-overlay'
const CHANNEL_OUT = 'dsh-annotate-panel'
const PAGE_CHANNEL = 'dsh-annotate-page'
const KIND = 'annotate'
const TAB_ID = 'dsh-annotate'
const MARKER = '#f0a05a'

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
/* A column of the page, not a card over it: no radius, no shadow, no glass —
   the sidebar owns the surface, the tab owns its content insets. */
.dsa-col { display:flex; flex-direction:column; height:100%; min-height:0; color:var(--dsw-alias-label-primary,#e8eaed);
  font:12.5px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
.dsa-bar { position:relative; z-index:3; display:flex; align-items:center; gap:5px; padding:8px 10px; flex:none;
  border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 9%,transparent); }
/* The primary action lives at the bottom, away from the top edge. */
.dsa-foot { display:flex; align-items:center; gap:6px; padding:8px 10px; flex:none;
  border-top:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 9%,transparent);
  background:color-mix(in srgb,var(--dsw-alias-bg-base,#0d1117) 16%,transparent) }
.dsa-foot .dsa-count { margin-left:auto; padding-inline:6px }
.dsa-helpwrap { position:relative; display:inline-flex }
.dsa-help { position:absolute; right:0; top:31px; z-index:9; width:268px; padding:10px 12px;
  border-radius:10px; border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 14%,transparent);
  background:var(--dsw-alias-bg-layer-1,#1b1f26); box-shadow:0 12px 34px rgba(0,0,0,.3);
  font-size:11.5px; line-height:1.6; color:var(--dsw-alias-label-secondary,#9aa0a6) }
.dsa-help b { display:block; margin:7px 0 2px; font-size:10px; letter-spacing:.06em; text-transform:uppercase;
  color:var(--dsw-alias-label-primary,#e8eaed) }
.dsa-help b:first-child { margin-top:0 }
.dsa-help p { margin:0 }
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
/* Text button: the language switch is its own label, so no icon sizing. */
.dsa-lang { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10px; letter-spacing:.02em }
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

/* Review management belongs to the panel chrome, never on top of the app. */
.dsa-review-toggle { position:relative; width:30px; min-width:30px; padding:0 }
.dsa-review-toggle .dsa-review-badge { position:absolute; top:-5px; right:-5px; min-width:15px; height:15px; padding:0 3px;
  box-sizing:border-box; border-radius:8px; text-align:center; box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1,#181d25);
  font:700 9px/15px ui-monospace,SFMono-Regular,Menlo,monospace; color:#20160c; background:${MARKER} }
.dsa-review-panel { flex:none; max-height:min(42%,360px); overflow:auto;
  border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 10%,transparent);
  background:var(--dsw-alias-bg-layer-1,#1b1f26); box-shadow:0 8px 20px rgba(0,0,0,.12) }
.dsa-review-panel .dsa-item:last-child { border-bottom:0 }
.dsa-list { flex:none; max-height:40%; min-height:0; overflow:auto;
  border-top:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 9%,transparent) }
/* No annotations, no row: the hint lives behind the ? instead. */
.dsa-list:empty { display:none; border-top:0 }
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
/* Review-tool rhythm: clear hierarchy, quiet surfaces, consistent targets. */
.dsa-global-notice { position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:12px 18px;border-radius:10px;background:#202833;color:#fff;box-shadow:0 4px 18px #0003;font:13px/1.5 system-ui;max-width:calc(100vw - 32px) }
.dsa-col { container-type:inline-size; background:var(--dsw-alias-bg-base,#11151b); font-size:13px }
.dsa-bar { padding:10px; gap:4px; background:var(--dsw-alias-bg-layer-1,#181d25) }
.dsa-ico { width:30px; height:30px; border-radius:7px }
.dsa-bar .dsa-url { height:32px; font-size:12px }
.dsa-foot { padding:10px; gap:6px; min-height:53px; background:var(--dsw-alias-bg-layer-1,#181d25) }
.dsa-foot > .dsa-ico:first-child { width:auto; padding:0 9px; gap:5px; font-size:12px; border-color:color-mix(in srgb,currentColor 18%,transparent) }
.dsa-send, .dsa-secondary { min-height:32px; border-radius:7px; font-size:12px; padding:0 10px }
.dsa-secondary { color:inherit; background:transparent; border:1px solid color-mix(in srgb,currentColor 20%,transparent); cursor:pointer; white-space:nowrap }
.dsa-secondary:disabled { opacity:.4; cursor:default }
.dsa-width { flex:0 0 82px; width:82px; height:30px; padding:0 22px 0 8px; box-sizing:border-box; font-size:11px;
  background:transparent; color:inherit; border:1px solid color-mix(in srgb,currentColor 15%,transparent); border-radius:6px }
.dsa-stage { overflow:hidden; background:var(--dsw-alias-bg-layer-1,#181d25) }
.dsa-frame { background:white }
.dsa-stagefoot { display:none }
.dsa-col button:focus-visible, .dsa-col select:focus-visible { outline:2px solid ${MARKER}; outline-offset:2px }
.dsa-sechead { font-size:12px; font-weight:600; line-height:1.5; letter-spacing:0; text-transform:none; padding:18px 14px 10px }
.dsa-svc { width:calc(100% - 20px); margin:0 10px 7px; padding:12px; border:1px solid color-mix(in srgb,currentColor 10%,transparent); border-radius:10px }
.dsa-svc:hover { border-color:color-mix(in srgb,${MARKER} 45%,transparent) }
.dsa-svc .dot { box-shadow:none; width:6px; height:6px }
.dsa-svc .copy span { margin-top:3px }
.dsa-svc .go { opacity:.65 }
.dsa-openrow { padding:12px; gap:8px }
.dsa-openrow input, .dsa-openrow button { height:34px }
.dsa-hintbox { padding:16px; line-height:1.8 }
.dsa-help { width:min(290px,calc(100cqw - 24px)); line-height:1.75 }
.dsa-mini { width:28px; height:28px }
.dsa-meta b { overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px }
.dsa-notice { padding:9px 12px; font-size:12px; flex-wrap:wrap }
.dsa-empty { gap:12px; background:var(--dsw-alias-bg-base,#11151b) }
@container (max-width:380px) { .dsa-width { display:none } .dsa-foot { flex-wrap:wrap } .dsa-foot .dsa-count { margin-left:auto } .dsa-secondary { margin-left:auto } .dsa-bar { padding:8px 6px } }
@media (prefers-reduced-motion:reduce) { .dsa-col * { transition:none!important; animation:none!important } }

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
  review: 'M5 5.5h14v10H10l-5 4z',
  chevron: 'M7.4 10 12 14.6 16.6 10',
  help: 'M12 4a4 4 0 0 1 4 4c0 2-1.3 2.9-2.3 3.6-.7.5-1 .9-1 1.6v.4h-2v-.6c0-1.5.7-2.3 1.8-3.1.8-.5 1.4-1 1.4-1.9A1.9 1.9 0 0 0 12 6a1.9 1.9 0 0 0-2 1.8H8A3.9 3.9 0 0 1 12 4zm0 12.1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z',
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
    (ann.component ? t('payload.component') + ann.component : ''))
  const anchors = []
  if (ann.role && ann.role !== ann.tag) anchors.push('role=' + ann.role)
  if (ann.ariaLabel) anchors.push('aria-label="' + ann.ariaLabel + '"')
  if (ann.alt) anchors.push('alt="' + ann.alt + '"')
  if (ann.name) anchors.push('name=' + ann.name)
  if (ann.testId) anchors.push(ann.testId)
  if (anchors.length) lines.push(t('payload.semantics') + anchors.join(' · '))
  if (ann.componentChain && ann.componentChain.length > 1) lines.push(t('payload.componentChain') + ann.componentChain.join(' > '))
  lines.push(t('payload.selector') + ann.selector +
    (typeof ann.selectorMatches === 'number' ? t('payload.selectorMatches', { count: ann.selectorMatches }) : ''))
  lines.push(t('payload.geometry') + ann.rect.w + '×' + ann.rect.h + ' @ (' + ann.rect.x + ', ' + ann.rect.y + ')' +
    (ann.placement ? t('payload.viewportZone', { zone: ann.placement.zone, x: ann.placement.x, y: ann.placement.y }) : ''))
  const styles = styleSummary(ann.styles)
  if (styles) lines.push(t('payload.styles') + styles)
  if (ann.text) lines.push(t('payload.text') + ann.text)
  lines.push(t('payload.comment') + ann.comment)
  return lines.join('\n')
}

function payloadBlock(annotations, page, viewport) {
  if (!annotations.length) return ''
  const head = t('payload.head', { page: page, w: viewport.w, h: viewport.h, count: annotations.length })
  return head + '\n' + annotations.map((ann, i) => payloadOf(ann, i)).join('\n\n')
}


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
          helpOpen: false,
          listOpen: false,
          sending: false,
          loading: false,
          error: null,
          previewOrigin: '',
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

  const flash = (panel, message) => {
    // A toast replaces any previous one, so the undo affordance it carried must
    // go with it.
    panel.model.set({ notice: message, undoAvailable: false })
    if (panel.noticeTimer) clearTimeout(panel.noticeTimer)
    panel.noticeTimer = setTimeout(() => panel.model.set({ notice: null }), 6000)
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
    if (!isLoopback(parsed.hostname) || parsed.origin === location.origin) {
      flash(panel, t('notice.notLocal'))
      return false
    }
    const request = (panel.openRequest || 0) + 1
    panel.openRequest = request
    panel.model.set({ loading: true, error: null, view: 'page', input: url })
    const preview = await api('preview', { sid: panel.sid, url })
    if (panel.openRequest !== request) return false
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
      history: history.slice(-40),
      index: Math.min(history.length - 1, 39),
      mode: 'idle',
      annotations: readAnnotations(panel, url),
      page: parsed.pathname,
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
      hint: res.hint || null,
      scanned: res.scanned || 0,
      detect: 'idle',
    })
    const current = panel.model.get()
    if (auto && current.view === 'list' && !current.url && (res.services || []).length === 1) {
      openUpstream(panel, res.services[0].url, { push: true })
      flash(panel, t('notice.autoOpened'))
    }
  }

  const annotationKey = (panel, url) => 'dsh-review:v2:' + encodeURIComponent(panel.sid) + ':' + encodeURIComponent(url)
  const readAnnotations = (panel, url) => {
    try { const value = JSON.parse(localStorage.getItem(annotationKey(panel, url)) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
  }
  const writeAnnotations = (panel, url, annotations) => {
    try { localStorage.setItem(annotationKey(panel, url), JSON.stringify(annotations)) }
    catch { flash(panel, t('notice.storageUnavailable')) }
  }
  const sendAll = async (panel, setDraft, options) => {
    const state = panel.model.get()
    if (!state.annotations.length || state.sending) return false
    if (state.mode === 'writing') { flash(panel, t('notice.finishEditing')); return false }
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
    panel.model.set({ sending: true })
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
      flash(panel, t('notice.sendFailed', { error: String(error.message || error) }))
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
      if (!state.helpOpen) return undefined
      const close = () => panel.model.set({ helpOpen: false })
      const timer = setTimeout(() => document.addEventListener('mousedown', close), 0)
      return () => {
        clearTimeout(timer)
        document.removeEventListener('mousedown', close)
      }
    }, [panel, state.helpOpen])

    React.useEffect(() => {
      const onMessage = (event) => {
        const frame = frameRef
        if (!frame || event.source !== frame.contentWindow || event.origin !== panel.model.get().previewOrigin) return
        const data = event.data
        if (!data) return
        if (data.source === CHANNEL_IN) {
          if (data.type === 'ready' || data.type === 'changed') {
            const current = panel.model.get()
            const pageUrl = data.url || current.url
            if (data.type === 'ready') {
              let draft = null
              try { draft = JSON.parse(localStorage.getItem(annotationKey(panel, pageUrl) + ':draft') || 'null') } catch {}
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
            try { localStorage.setItem(annotationKey(panel, data.url || panel.model.get().url) + ':draft', JSON.stringify(data.draft)) } catch { flash(panel, t('notice.draftUnavailable')) }
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
          const current = panel.model.get()
          if (data.url === current.url) return
          const expected = panel.historyTarget
          const isTraversal = expected !== undefined && current.history[expected] === data.url
          const history = isTraversal ? current.history : current.history.slice(0, current.index + 1).concat([data.url])
          panel.historyTarget = undefined
          panel.model.set({ url: data.url, input: data.url, history: history.slice(-40), index: isTraversal ? expected : Math.min(history.length - 1, 39), annotations: readAnnotations(panel, data.url), mode: 'idle', listOpen: false })
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
      panel.model.set({ view: 'list', mode: 'idle', notice: null, loading: false, error: null, listOpen: false, helpOpen: false })
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
          { className: 'dsa-notice', role: 'status', 'aria-live': 'polite' },
          state.notice,
          state.undoAvailable ? React.createElement('button', { type: 'button', onClick: () => { notify('undo'); panel.model.set({ undoAvailable: false, notice: null }) } }, t('notice.undo')) : null,
          React.createElement('button', { type: 'button', title: t('notice.dismiss'), onClick: () => panel.model.set({ notice: null }) }, '✕')
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
              { className: 'dsa-svc', type: 'button', key: service.port, onClick: () => openUpstream(panel, service.url) },
              React.createElement('span', { className: 'dot' }),
              React.createElement(
                'span',
                { className: 'copy' },
                React.createElement('b', null, service.title || service.url),
                React.createElement('span', null, service.url)
              ),
              React.createElement('span', { className: 'go' }, t('list.open'))
            )
          ),
          !services.length && state.detect !== 'busy'
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

    return React.createElement(
      'div',
      { className: 'dsa-col' },
      notice,
      React.createElement(
        'div',
        { className: 'dsa-bar' },
        React.createElement('button', { className: 'dsa-ico', type: 'button', title: t('page.back'), disabled: state.index <= 0, onClick: () => go(-1) }, React.createElement(Icon, { name: 'back' })),
        React.createElement('button', { className: 'dsa-ico', type: 'button', title: t('page.forward'), disabled: state.index >= state.history.length - 1, onClick: () => go(1) }, React.createElement(Icon, { name: 'forward' })),
        React.createElement('button', { className: 'dsa-ico', type: 'button', title: t('page.reload'), onClick: reload }, React.createElement(Icon, { name: 'refresh' })),
        React.createElement('input', {
          className: 'dsa-url',
          value: state.input,
          spellCheck: false,
          placeholder: t('page.addressPlaceholder'),
          'aria-label': t('list.addressLabel'),
          onChange: (event) => panel.model.set({ input: event.target.value }),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && !event.nativeEvent?.isComposing) openUpstream(panel, event.target.value)
          },
        }),
        React.createElement('select', { className: 'dsa-width', 'aria-label': t('page.widthLabel'), value: state.width, onChange: (event) => panel.model.set({ width: event.target.value }) },
          React.createElement('option', { value: 'fit' }, t('page.widthFit')), React.createElement('option', { value: '390' }, t('page.widthMobile'))),
        React.createElement(
          'button',
          {
            className: 'dsa-ico dsa-review-toggle',
            type: 'button',
            'data-on': state.listOpen ? 'true' : 'false',
            'aria-expanded': state.listOpen,
            'aria-controls': 'dsa-review-panel-' + sessionId,
            'aria-label': annotations.length ? t('page.listToggleLabel', { count: annotations.length }) : t('page.listToggleEmpty'),
            disabled: !annotations.length,
            title: annotations.length
              ? state.listOpen ? t('page.listCollapse') : t('page.listExpand')
              : t('page.listEmpty'),
            onClick: () => panel.model.set({ listOpen: !state.listOpen, helpOpen: false }),
          },
          React.createElement(Icon, { name: 'review' }),
          annotations.length ? React.createElement('span', { className: 'dsa-review-badge' }, annotations.length > 99 ? '99+' : String(annotations.length)) : null
        ),
        React.createElement('button', { className: 'dsa-ico', type: 'button', title: t('page.backToList'), onClick: showList }, React.createElement(Icon, { name: 'list' })),
        React.createElement(
          'span',
          { className: 'dsa-helpwrap' },
          React.createElement(
            'button',
            {
              className: 'dsa-ico',
              type: 'button',
              'data-on': state.helpOpen ? 'true' : 'false',
              title: t('page.help'),
              onClick: () => panel.model.set({ helpOpen: !state.helpOpen, listOpen: false }),
            },
            React.createElement(Icon, { name: 'help' })
          ),
          state.helpOpen
            ? React.createElement(
                'div',
                { className: 'dsa-help' },
                React.createElement('b', null, t('list.helpHeader')),
                React.createElement('p', null, t('list.helpPicking')),
                React.createElement('p', null, t('list.helpEscape')),
                React.createElement('p', null, t('list.helpCmdClick')),
                React.createElement('b', null, t('list.helpSendHeader')),
                React.createElement('p', null, t('list.helpSendList')),
                React.createElement('p', null, t('list.helpSendActions'))
              )
            : null
        ),
        React.createElement(
          'button',
          {
            className: 'dsa-ico dsa-lang',
            type: 'button',
            title: t('panel.languageSwitch', { lang: i18n.nextLabel() }),
            'aria-label': t('panel.language'),
            onClick: () => switchLanguage(panel),
          },
          i18n.label()
        )
      ),
      annotations.length && state.listOpen
        ? React.createElement(
            'div',
            {
              className: 'dsa-review-panel',
              id: 'dsa-review-panel-' + sessionId,
              role: 'region',
              'aria-label': t('page.listAria'),
            },
            annotations.map((ann, index) =>
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
                  React.createElement('button', { className: 'dsa-mini', type: 'button', title: t('page.locate'), onClick: () => notify('focus', { id: ann.id }) }, React.createElement(Icon, { name: 'locate' })),
                  React.createElement('button', { className: 'dsa-mini', type: 'button', 'data-danger': 'true', title: t('page.delete'), onClick: () => { notify('remove', { id: ann.id }); panel.model.set({ undoAvailable: true }); flash(panel, t('notice.deleted')) } }, React.createElement(Icon, { name: 'trash' }))
                )
              )
            )
          )
        : null,
      React.createElement(
        'div',
        { className: 'dsa-stage' },
        state.src ? React.createElement('iframe', {
          className: 'dsa-frame',
          key: state.previewOrigin,
          style: state.width === 'fit' ? undefined : { width: state.width + 'px', maxWidth: '100%', margin: '0 auto' },
          src: state.src,
          title: t('page.previewTitle'),
          sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals',
          ref: (el) => {
            frameRef = el
            panel.frame = el
          },
          onLoad: () => { notify('ping'); notify('lang', { lang: i18n.lang }) },
        }) : null,
        (state.error || state.loading)
          ? React.createElement(
              'div',
              { className: 'dsa-empty' },
              React.createElement('h4', null, state.error ? t('page.unavailable') : t('page.loading')),
              React.createElement('p', null, state.error || t('page.loadingHint')),
              state.error ? React.createElement('button', { className: 'dsa-send', type: 'button', onClick: () => openUpstream(panel, state.input) }, t('page.retry')) : null
            )
          : null,
        React.createElement('div', { className: 'dsa-stagefoot' }, React.createElement('i'), React.createElement('span', null, state.url))
      ),
      React.createElement(
        'div',
        { className: 'dsa-foot' },
        React.createElement(
          'button',
          {
            className: 'dsa-ico',
            type: 'button',
            'data-on': state.mode === 'picking' ? 'true' : 'false',
            title: t('page.markTitle'),
            'aria-pressed': state.mode !== 'idle',
            disabled: state.loading || !!state.error || state.sending,
            onClick: toggleMode,
          },
          React.createElement(Icon, { name: 'marker' }), React.createElement('span', null, state.mode === 'idle' ? t('page.mark') : t('page.marking'))
        ),
        React.createElement('button', { className: 'dsa-ico', type: 'button', title: t('page.openExternal'), onClick: () => window.open(state.url, '_blank', 'noopener') }, React.createElement(Icon, { name: 'external' })),
        React.createElement('span', { className: 'dsa-count' }, annotations.length ? t('page.unit', { count: annotations.length }) : ''),
        React.createElement('button', { className: 'dsa-secondary', type: 'button', disabled: !annotations.length || state.sending, onClick: () => sendAll(panel, inputActions?.setDraft, { submit: false }) }, t('page.attach')),
        React.createElement(
          'button',
          {
            className: 'dsa-send',
            type: 'button',
            disabled: !annotations.length || state.sending,
            title: t('page.sendHint'),
            onClick: (event) => sendAll(panel, inputActions && inputActions.setDraft, { submit: !(event.altKey || event.metaKey) }),
          },
          state.sending ? t('page.sending') : t('page.send')
        )
      ),
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
        title: t('panel.headerTitle'),
        onClick: openAnnotate,
      },
      React.createElement(Icon, { name: 'marker' }),
      React.createElement('span', null, count ? t('panel.headerLabelCount', { count: count }) : t('panel.headerLabel'))
    )
  }

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
  contribute('conversation.session.header.utilities', 'annotate-open', HeaderButton, t('panel.tabTitle'))
  contribute('conversation.input.dock', 'annotate-dock', Dock)

  // ⌘⇧B mirrors Codex's in-app browser; ⌘⇧A stays as an alias.
  const onKeyDown = (event) => {
    if (event.key === 'Escape' && activePanel) {
      if (activePanel.model.get().helpOpen) {
        activePanel.model.set({ helpOpen: false })
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
