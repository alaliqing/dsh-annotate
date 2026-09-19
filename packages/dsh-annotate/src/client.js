/**
 * dsh-annotate — Client half.
 *
 * A native RIGHT-SIDEBAR TAB that previews a Same-Origin dev server (see the
 * dsh-app-bridge plugin), lets you pick elements and write notes on them, and
 * hands the result to the composer as one structured block.
 *
 * The shape follows the shipped sidebar contract and the reference design of
 * Codex's in-app browser: the preview lives in the work surface next to the
 * conversation rather than in a floating card, annotation mode turns element
 * hits into comments, ⌘/Ctrl-click submits immediately, and the tab body is a
 * flat column of the page in the conversation's own colours and font sizes.
 *
 * Bundled by build.mjs into the ModuleLoader format; `OVERLAY_SRC` is injected
 * there.
 */
const inject = ['timer']

const CHANNEL_IN = 'dsh-annotate-overlay'
const CHANNEL_OUT = 'dsh-annotate-panel'
const KIND = 'annotate'
const TAB_ID = 'dsh-annotate'
const MARKER = '#f0a05a'
/** Only a first-paint fallback: the host half reports the configured base. */
const FALLBACK_BASE = '/app/'

/** The preview lives on the harness origin (same-origin bridge), under whatever
 *  base the profile configured. */
const sameOriginUrl = (base) => location.origin + normalizeClientBase(base)

function normalizeClientBase(value) {
  const raw = String(value === undefined || value === null || value === '' ? FALLBACK_BASE : value).trim()
  if (!raw || raw === '/') return '/'
  const withLead = raw.startsWith('/') ? raw : '/' + raw
  return withLead.endsWith('/') ? withLead : withLead + '/'
}

const PANEL_CSS = `
/* A column of the page, not a card over it: no radius, no shadow, no glass —
   the sidebar owns the surface, the tab owns its content insets. */
.dsa-col { display:flex; flex-direction:column; height:100%; min-height:0; color:var(--dsw-alias-label-primary,#e8eaed);
  font:12.5px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
.dsa-bar { display:flex; align-items:center; gap:6px; padding:8px 10px; flex:none;
  border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 9%,transparent); }
.dsa-bar .dsa-url { flex:1; min-width:0; height:26px; padding:0 9px; border-radius:6px; outline:none;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11.5px; color:inherit;
  background:color-mix(in srgb,var(--dsw-alias-bg-base,#0d1117) 38%,transparent);
  border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 12%,transparent); }
.dsa-bar .dsa-url:focus { border-color:${MARKER}; }
.dsa-ico { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; padding:0; flex:none;
  border:1px solid transparent; border-radius:6px; background:transparent; color:var(--dsw-alias-label-secondary,#9aa0a6); cursor:pointer; }
.dsa-ico:hover { background:color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 8%,transparent); color:var(--dsw-alias-label-primary,#e8eaed); }
.dsa-ico[data-on="true"] { color:${MARKER}; border-color:color-mix(in srgb,${MARKER} 45%,transparent); background:color-mix(in srgb,${MARKER} 12%,transparent); }
.dsa-ico svg { width:15px; height:15px }
.dsa-send { height:26px; padding:0 10px; border-radius:6px; cursor:pointer; white-space:nowrap; font-size:11.5px; flex:none;
  background:${MARKER}; border:1px solid transparent; color:#20160c; font-weight:600; }
.dsa-send:hover { opacity:.9 }
.dsa-send:disabled { opacity:.42; cursor:default }
.dsa-status { display:inline-flex; align-items:center; gap:5px; font-size:10.5px; color:var(--dsw-alias-label-secondary,#9aa0a6);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace; white-space:nowrap }
.dsa-status i { width:6px; height:6px; border-radius:50%; background:color-mix(in srgb,var(--dsw-alias-label-secondary,#9aa0a6) 70%,transparent) }
.dsa-status[data-state="running"] i { background:#4bbf7a; box-shadow:0 0 0 3px color-mix(in srgb,#4bbf7a 22%,transparent) }
.dsa-status[data-state="starting"] i { background:${MARKER}; animation:dsa-blink 1s ease-in-out infinite }
.dsa-status[data-state="error"] i { background:var(--dsw-alias-state-error-primary,#ff6b6b) }
@keyframes dsa-blink { 50% { opacity:.35 } }
.dsa-log { flex:none; max-height:150px; display:flex; flex-direction:column;
  border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 9%,transparent) }
.dsa-loghead { display:flex; align-items:center; gap:8px; padding:5px 8px 5px 10px; font-size:10.5px;
  color:var(--dsw-alias-label-secondary,#9aa0a6); border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 6%,transparent) }
.dsa-loghead .dsa-btn { height:22px; padding:0 8px; font-size:11px }
.dsa-log pre { margin:0; padding:6px 10px; overflow:auto; font-size:10.5px; line-height:1.5;
  color:var(--dsw-alias-label-secondary,#9aa0a6); white-space:pre-wrap; word-break:break-all }
.dsa-count { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10.5px; color:var(--dsw-alias-label-secondary,#9aa0a6); padding-inline:2px }

.dsa-notice { flex:none; padding:7px 11px; font-size:11.5px; line-height:1.5; color:${MARKER};
  background:color-mix(in srgb,${MARKER} 12%,transparent); border-bottom:1px solid color-mix(in srgb,${MARKER} 30%,transparent); }

.dsa-stage { position:relative; flex:1; min-height:0; background:#fff }
.dsa-frame { width:100%; height:100%; border:0; display:block }
.dsa-stagefoot { position:absolute; left:0; right:0; bottom:0; display:flex; gap:8px; align-items:center;
  padding:3px 8px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10px; letter-spacing:.06em;
  color:rgba(255,255,255,.88); background:linear-gradient(0deg,rgba(0,0,0,.6),transparent); pointer-events:none }
.dsa-stagefoot i { width:6px; height:6px; border-radius:50%; background:${MARKER}; box-shadow:0 0 0 3px color-mix(in srgb,${MARKER} 25%,transparent) }

.dsa-empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px;
  padding:26px; text-align:center; color:var(--dsw-alias-label-secondary,#9aa0a6);
  background:color-mix(in srgb,var(--dsw-alias-bg-base,#0d1117) 90%,transparent) }
.dsa-empty h4 { margin:0; font-size:13px; color:var(--dsw-alias-label-primary,#e8eaed); font-weight:600 }
.dsa-empty p { margin:0; max-width:330px; font-size:12px; line-height:1.65 }
.dsa-empty code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11.5px; padding:2px 5px; border-radius:4px;
  background:color-mix(in srgb,${MARKER} 14%,transparent); color:${MARKER} }
.dsa-target { position:relative; width:112px; height:70px }
.dsa-target i { position:absolute; width:12px; height:12px; border:2px solid ${MARKER} }
.dsa-target i:nth-child(1){left:0;top:0;border-right:0;border-bottom:0}
.dsa-target i:nth-child(2){right:0;top:0;border-left:0;border-bottom:0}
.dsa-target i:nth-child(3){left:0;bottom:0;border-right:0;border-top:0}
.dsa-target i:nth-child(4){right:0;bottom:0;border-left:0;border-top:0}
.dsa-target::after { content:''; position:absolute; inset:0; border:1px dashed color-mix(in srgb,${MARKER} 55%,transparent) }

.dsa-list { flex:none; max-height:42%; min-height:92px; overflow:auto;
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
  locate: 'M12 2v3m0 14v3M2 12h3m14 0h3M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z',
  trash: 'M6 7h12l-1 13H7zM9 4h6l1 2H8z',
  external: 'M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14zM5 6h5v2H7v9h9v-3h2v5H5z',
  play: 'M8 5.5 18 12 8 18.5z',
  stop: 'M7 7h10v10H7z',
  log: 'M5 6h14v2H5zM5 11h14v2H5zM5 16h9v2H5z',
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
          base: FALLBACK_BASE,
          command: 'npm run dev:panel',
          url: FALLBACK_BASE,
          draftUrl: FALLBACK_BASE,
          annotations: [],
          viewport: { w: 0, h: 0 },
          page: FALLBACK_BASE,
          mode: 'idle',
          cors: false,
          pending: [],
          notice: null,
          status: 'idle', // idle | starting | running | error
          statusText: '',
          log: [],
          logOpen: false,
          root: '',
          hostUrl: '',
        }),
        draftWriter: null,
      }
      panels.set(key, panel)
    }
    return panel
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

  const openAnnotate = () => {
    try {
      if (sidebarRight && typeof sidebarRight.openTab === 'function') sidebarRight.openTab(KIND)
    } catch (error) {
      console.warn('dsh-annotate: could not open the sidebar tab', error)
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

  /** Hand the current annotations to the composer as one structured block. */
  const sendAll = (panel, setDraft) => {
    const state = panel.model.get()
    if (!state.annotations.length) return false
    const writer = setDraft || (panel.draftWriter && panel.draftWriter.setDraft)
    if (!writer) {
      panel.model.set({ notice: '还没找到输入框：先切到一个有输入框的会话，再点这里发送标注。' })
      return false
    }
    const block = payloadBlock(state.annotations, state.page || state.url, state.viewport || { w: 0, h: 0 })
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

  const ensureRunning = async (panel) => {
    const state = panel.model.get()
    if (state.status === 'starting' || state.status === 'running') return
    const root = state.root
    if (!root) {
      panel.model.set({ status: 'error', statusText: '拿不到工作区目录' })
      return
    }
    panel.model.set({ status: 'starting', statusText: '启动：' + panel.model.get().command })
    const started = await api('start', { sid: panel.sid, root: root })
    if (started && started.ok) {
      const base = started.base || panel.model.get().base
      panel.model.set({
        status: 'running',
        statusText: '',
        base: base,
        command: started.command || panel.model.get().command,
        log: started.log || [],
        hostUrl: started.url || panel.model.get().hostUrl,
        url: sameOriginUrl(base),
        draftUrl: sameOriginUrl(base),
      })
    } else {
      panel.model.set({ status: 'error', statusText: (started && started.error) || '启动失败', log: (started && started.log) || [] })
    }
  }

  const refreshHost = async (panel) => {
    const res = await api('state', { sid: panel.sid })
    if (!res || !res.ok) return
    const patch = {
      status: res.running ? 'running' : res.starting ? 'starting' : panel.model.get().status === 'error' ? 'error' : 'idle',
      log: res.log || [],
      hostUrl: res.url || panel.model.get().hostUrl,
    }
    if (res.base) patch.base = res.base
    if (res.command) patch.command = res.command
    panel.model.set(patch)
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
    // `useWorkspaces` is a selector hook (SnapshotSelectorHook), not a plain getter.
    const workspaceItems = props.useWorkspaces ? props.useWorkspaces((snapshot) => snapshot.items) : undefined

    // Zero setup: resolve the session's workspace and bring the dev server up.
    React.useEffect(() => {
      const list = Array.isArray(workspaceItems) ? workspaceItems : []
      const mine = list.find((w) => w && Array.isArray(w.sessionIds) && w.sessionIds.indexOf(sessionId) !== -1)
      const root = (mine && mine.path) || (list[0] && list[0].path) || ''
      if (root && root !== panel.model.get().root) panel.model.set({ root: root })
      if (root) void ensureRunning(panel)
    }, [sessionId, workspaceItems, panel])

    React.useEffect(() => {
      if (!panel.model.get().logOpen) return undefined
      const timer = setInterval(() => void refreshHost(panel), 2500)
      return () => clearInterval(timer)
    }, [panel, state.logOpen])

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
        if (!data || data.source !== CHANNEL_IN) return
        if (data.type === 'ready' || data.type === 'changed') {
          panel.model.set({
            annotations: data.annotations || [],
            viewport: data.viewport || panel.model.get().viewport,
            page: data.path || panel.model.get().page,
          })
        } else if (data.type === 'mode') {
          panel.model.set({ mode: data.mode })
        } else if (data.type === 'send') {
          // ⌘/Ctrl-click in the page: commit, then ship the whole batch.
          sendAll(panel, inputActions && inputActions.setDraft)
        }
      }
      window.addEventListener('message', onMessage)
      return () => window.removeEventListener('message', onMessage)
    }, [panel, inputActions, annotations])

    const sendLogToChat = () => {
      const lines = panel.model.get().log.slice(-60).join('\n')
      if (!lines || !inputActions) return
      const current = String(draft || '')
      inputActions.setDraft((current ? current.replace(/\s+$/, '') + '\n\n' : '') + 'dev server 日志：\n```\n' + lines + '\n```\n请根据日志判断问题。')
    }

    const cycleServer = async () => {
      const now = panel.model.get()
      if (now.status === 'running') {
        await api('stop', { sid: panel.sid })
        panel.model.set({ status: 'idle', statusText: '' })
      } else {
        await ensureRunning(panel)
      }
    }

    const commitUrl = () => {
      const next = state.draftUrl && state.draftUrl.trim() ? state.draftUrl.trim() : sameOriginUrl(state.base)
      panel.model.set({ url: next, draftUrl: next, cors: false })
    }
    const toggleMode = () => {
      const next = state.mode === 'picking' ? 'idle' : 'picking'
      panel.model.set({ mode: next })
      notify('set-mode', { mode: next })
    }

    return React.createElement(
      'div',
      { className: 'dsa-col' },
      state.notice ? React.createElement('div', { className: 'dsa-notice' }, state.notice) : null,
      React.createElement(
        'div',
        { className: 'dsa-bar' },
        React.createElement('input', {
          className: 'dsa-url',
          value: state.draftUrl,
          spellCheck: false,
          placeholder: sameOriginUrl(state.base),
          title: '预览地址：必须是同源地址（见 README 的同源桥）',
          onChange: (event) => panel.model.set({ draftUrl: event.target.value }),
          onKeyDown: (event) => {
            if (event.key === 'Enter') commitUrl()
          },
        }),
        React.createElement('button', { className: 'dsa-ico', type: 'button', title: '打开地址', onClick: commitUrl }, React.createElement(Icon, { name: 'external' })),
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
        React.createElement(
          'button',
          {
            className: 'dsa-ico',
            type: 'button',
            title: '重新载入预览',
            onClick: () => {
              notify('set-mode', { mode: 'idle' })
              panel.model.set({ url: state.url + (state.url.indexOf('?') === -1 ? '?' : '&') + 'r=' + Date.now(), mode: 'idle' })
            },
          },
          React.createElement(Icon, { name: 'refresh' })
        ),
        React.createElement(
          'span',
          {
            className: 'dsa-status',
            'data-state': state.status,
            title:
              state.statusText ||
              (state.status === 'running'
                ? 'dev server 运行中 · ' + state.hostUrl
                : '点一下启动：' + state.command),
          },
          React.createElement('i'),
          state.status === 'running' ? '运行中' : state.status === 'starting' ? '启动中' : state.status === 'error' ? '出错' : '未运行'
        ),
        React.createElement('button', { className: 'dsa-ico', type: 'button', title: state.status === 'running' ? '停止 dev server' : '启动 dev server', onClick: () => void cycleServer() }, React.createElement(Icon, { name: state.status === 'running' ? 'stop' : 'play' })),
        React.createElement('button', { className: 'dsa-ico', type: 'button', 'data-on': state.logOpen ? 'true' : 'false', title: '日志', onClick: () => { panel.model.set({ logOpen: !state.logOpen }); void refreshHost(panel) } }, React.createElement(Icon, { name: 'log' })),
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
      state.logOpen
        ? React.createElement(
            'div',
            { className: 'dsa-log' },
            React.createElement(
              'div',
              { className: 'dsa-loghead' },
              React.createElement('span', { className: 'dsa-mono' }, 'dev server 日志 · ' + panel.model.get().log.length + ' 行'),
              React.createElement('button', { className: 'dsa-btn', type: 'button', onClick: sendLogToChat }, '日志→对话')
            ),
            React.createElement('pre', { className: 'dsa-mono' }, panel.model.get().log.slice(-40).join('\n') || '（暂无输出）')
          )
        : null,
      React.createElement(
        'div',
        { className: 'dsa-stage' },
        React.createElement('iframe', {
          className: 'dsa-frame',
          key: state.url,
          src: state.url,
          title: '预览',
          sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads',
          ref: (el) => {
            frameRef = el
          },
          onLoad: (event) => injectOverlay(event.currentTarget, panel),
        }),
        state.cors
          ? React.createElement(
              'div',
              { className: 'dsa-empty' },
              React.createElement('div', { className: 'dsa-target' }, React.createElement('i'), React.createElement('i'), React.createElement('i'), React.createElement('i')),
              React.createElement('h4', null, '这个地址跨源，标注层注入不进去'),
              React.createElement(
                'p',
                null,
                '同源策略下跨端口 iframe 的 DOM 读不到。用同源桥预览：profile 里把桥的 target/prefix 指向这个项目，地址填 ',
                React.createElement('code', null, sameOriginUrl(state.base))
              )
            )
          : null,
        React.createElement('div', { className: 'dsa-stagefoot' }, React.createElement('i'), '同源预览 · ' + state.url.replace(/\?.*$/, ''))
      ),
      React.createElement(
        'div',
        { className: 'dsa-list' },
        annotations.length === 0
          ? React.createElement(
              'div',
              { className: 'dsa-empty', style: { position: 'static', background: 'transparent', padding: '18px 16px' } },
              React.createElement('p', null, '还没有标注。点工具栏的标记按钮，在预览里点击元素写批注；⌘/Ctrl+点击可直接发送。')
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
                  React.createElement('div', { className: 'dsa-comment' }, ann.comment),
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
        title: '界面标注（⌘⇧B / ⌘⇧A）：在右侧栏预览并圈选界面元素',
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
            description: () => '在右侧栏预览本地页面，圈选元素写批注，一次发给 DeepSeek',
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
