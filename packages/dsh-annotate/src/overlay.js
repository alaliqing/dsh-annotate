/**
 * dsh-annotate — injected overlay.
 *
 * Runs INSIDE the previewed app document, on its own loopback preview origin.
 * Owns the picking interaction, the pins and the comment card, and keeps the
 * annotation list in localStorage so a reload does not lose the review. Talks to
 * the panel with postMessage only — the panel never reaches into this document,
 * and this file has no dependency on React, which also makes it testable on its
 * own.
 *
 * Design direction: drafting overlay. Hairline measurement frame with corner
 * ticks, monospace readouts, numbered marker pins, and one warm "marker" accent
 * that cannot be confused with the app's own accent colour.
 */
(function () {
  var CHANNEL = 'dsh-annotate-overlay'
  var HOST = 'dsh-annotate-panel'
  var STORE_PREFIX = 'dsh-annotate:v2:'
  var session = String(window.__DSH_ANNO_SESSION__ || 'standalone')
  var currentPage = location.pathname + location.search + location.hash
  var liveElements = new Map()
  var undo = null
  var THEME = dsaTheme()
  var MARKER = THEME.marker
  var undoDraft = null

  if (window.__dshAnnotateReady) return
  window.__dshAnnotateReady = true

  // The panel owns the language preference and pushes changes over postMessage;
  // until it says otherwise, follow the browser. `dsaI18n` is prepended to this
  // file by build.mjs.
  var i18n = dsaI18n((window.__DSH_ANNO__ && window.__DSH_ANNO__.lang) || '')
  var t = function (key, vars) { return i18n.t(key, vars) }

  var state = {
    mode: 'idle', // 'idle' | 'picking' | 'writing'
    hover: null,
    selected: null,
    savedDraft: null,
    drafting: null, // { id, selector, ... , comment }
    viewing: null, // id of the read-only comment currently open
    sendOnCommit: false, // ⌘/Ctrl-click submits the batch right away
    annotations: [],
    anchor: null, // element for the open card
  }

  // ---------------------------------------------------------------- utilities

  function isDark() {
    try {
      var bg = getComputedStyle(document.body).backgroundColor || ''
      var m = bg.match(/rgba?\(([^)]+)\)/)
      if (!m) return true
      var parts = m[1].split(',').map(Number)
      var l = (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255
      var alpha = parts.length > 3 ? parts[3] : 1
      if (alpha < 0.2) return true
      return l < 0.5
    } catch (e) {
      return true
    }
  }

  function css() {
    var dark = isDark()
    var palette = dark ? THEME.dark : THEME.light
    var ink = palette.ink
    var muted = palette.muted
    var panelBg = palette.surface
    var hair = palette.line
    var fieldBg = palette.field
    return [
      // Viewport-fixed: apps often scroll an inner container, where document
      // coordinates never change and absolutely-placed pins would sit still.
      '.dsa-layer{position:fixed;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;overflow:visible;background:transparent;z-index:2147483000;pointer-events:none;',
      'font:12px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:' + ink + '}',
      '.dsa-layer *{box-sizing:border-box}.dsa-layer::backdrop{display:none}',
      '.dsa-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}',
      // Clicks are intercepted at window capture; leave hit testing and wheel
      // gestures on the real app so the browser keeps its native scroll path.
      '.dsa-capture{position:absolute;inset:0;z-index:1;pointer-events:none}',
      'html[data-dsa-mode] body,html[data-dsa-mode] body *{cursor:crosshair!important}',
      // measurement frame
      '.dsa-frame{position:absolute;z-index:3;pointer-events:none;border:1px solid ' + MARKER + ';',
      'background:color-mix(in srgb,' + MARKER + ' 8%,transparent);transition:opacity .12s ease}',
      '.dsa-frame[data-state="hover"]{border-style:dashed;opacity:.85}',
      '.dsa-frame i{position:absolute;width:7px;height:7px;border:1px solid ' + MARKER + ';background:' + panelBg + '}',
      '.dsa-frame i:nth-child(1){left:-4px;top:-4px}.dsa-frame i:nth-child(2){right:-4px;top:-4px}',
      '.dsa-frame i:nth-child(3){left:-4px;bottom:-4px}.dsa-frame i:nth-child(4){right:-4px;bottom:-4px}',
      // hover readout
      '.dsa-readout{position:absolute;z-index:4;pointer-events:none;display:flex;gap:8px;align-items:center;',
      'padding:3px 7px;border:1px solid ' + hair + ';border-radius:3px;background:' + panelBg + ';',
      'box-shadow:0 6px 20px -12px rgba(0,0,0,.6);white-space:nowrap;max-width:min(560px,80vw);overflow:hidden}',
      '.dsa-readout b{color:' + MARKER + ';font-weight:600}',
      '.dsa-readout span{color:' + muted + '}',
      // Pins have a quiet 20px visual and a 32px pointer target.
      '.dsa-pin{appearance:none;padding:0;min-width:0;min-height:0;max-width:none;max-height:none;display:block;position:absolute;z-index:5;pointer-events:auto;border-radius:50%;color:#20160c;text-align:center;cursor:pointer;transform-origin:center}',
      '.dsa-pin:hover{transform:scale(1.08)}.dsa-pin[hidden]{display:none!important}',
      '.dsa-layer button:focus-visible{outline:2px solid ' + THEME.focus + ';outline-offset:2px}',
      '.dsa-pin[data-open="true"]{outline:2px solid ' + MARKER + ';outline-offset:1px}',
      '.dsa-card{position:absolute;z-index:6;pointer-events:auto;color:' + ink + ';background:' + panelBg + ';scrollbar-width:thin;scrollbar-color:' + muted + ' transparent}',
      '.dsa-card header{display:flex;align-items:center}',
      '.dsa-card header .dsa-clip{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsa-card header button{all:unset;cursor:pointer;text-align:center;border-radius:4px}',
      '.dsa-card header button:hover{background:' + fieldBg + ';color:' + ink + '}',
      '.dsa-card textarea{display:block;width:100%;border:0;outline:none;background:transparent;color:inherit}',
      '.dsa-card footer{display:flex;align-items:center}',
      '.dsa-comment-text{white-space:pre-wrap;overflow-wrap:anywhere}',
      '.dsa-btn{all:unset;cursor:pointer;border-radius:4px}',
      '.dsa-btn:hover{background:' + fieldBg + ';color:' + ink + '}',
      '.dsa-pin{width:32px;height:32px;margin:-16px 0 0 -16px;border:0;background:transparent;box-shadow:none;font:600 10px/32px ' + THEME.sans + '}',
      '.dsa-pin::before{content:"";position:absolute;inset:6px;z-index:-1;border-radius:50%;background:' + MARKER + ';box-shadow:0 0 0 2px ' + panelBg + ',0 2px 6px #0002}',
      '.dsa-card{width:min(' + THEME.cardWidth + 'px,calc(100vw - 20px));max-height:calc(100vh - 16px);overflow:auto;border:1px solid ' + hair + ';border-radius:14px;backdrop-filter:none;box-shadow:0 10px 30px #0002,0 2px 6px #0001;animation:none}',
      '.dsa-card header{padding:9px 10px 0;border-bottom:0;gap:6px}',
      '.dsa-card header button{flex:none;position:relative;width:24px;height:24px;line-height:24px;color:' + muted + '}',
      '.dsa-card header button[data-act="close"]::before{content:"";position:absolute;inset:-4px}',
      '.dsa-card header .dsa-target{display:inline-flex;align-items:center;gap:5px;max-width:calc(100% - 30px);width:auto;height:auto;min-height:22px;line-height:1.5;padding:2px 6px;border-radius:5px;color:' + ink + ';background:' + fieldBg + ';font-size:10px}',
      '.dsa-target .dsa-clip{color:inherit;min-width:0;max-width:100%;font-family:' + THEME.sans + '}',
      '.dsa-number{flex:none;color:' + (dark ? MARKER : THEME.markerInk) + '}',
      '.dsa-details{margin:7px 11px 0;padding:5px 0 8px;border-bottom:1px solid ' + hair + ';color:' + muted + ';font:10px/1.7 ' + THEME.mono + ';overflow-wrap:anywhere}',
      '.dsa-details[hidden]{display:none!important}',
      '.dsa-card textarea{min-height:58px;max-height:180px;resize:none;padding:10px 12px 5px;font:13px/1.7 ' + THEME.sans + '}',
      '.dsa-card:focus-within{border-color:' + (dark ? '#777777' : '#bfc7cd') + '}',
      '.dsa-card footer{border-top:0;padding:2px 10px 9px;gap:7px;min-height:39px}',
      '.dsa-card footer .dsa-hint{margin-left:auto;flex:none;font:10px ' + THEME.sans + '}',
      '.dsa-comment-card{outline:none}.dsa-comment-card textarea{cursor:text;padding-bottom:12px}',
      '.dsa-btn{padding:3px 5px;font:11px/1.5 ' + THEME.sans + ';color:' + muted + ';border:0}',
      '.dsa-btn.primary{display:inline-flex;align-items:center;justify-content:center;flex:none;width:30px;height:30px;padding:0;border:0;border-radius:50%;background:' + palette.action + ';color:' + palette.onAction + '}',
      '.dsa-btn.primary:hover{background:' + palette.action + ';color:' + palette.onAction + '}',
      '.dsa-btn.primary:disabled{opacity:.3;cursor:default}',
      '.dsa-btn svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}',
      '@media(prefers-reduced-motion:reduce){.dsa-layer *{animation:none!important;transition:none!important}}',
    ].join('')
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  function clip(text, max) {
    var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim()
    return t.length > max ? t.slice(0, max - 1) + '…' : t
  }

  /** Prefer a stable authored hook when the app has one. */
  function testIdOf(el) {
    var attrs = ['data-testid', 'data-test', 'data-test-id', 'data-qa']
    for (var i = 0; i < attrs.length; i++) {
      var value = el.getAttribute && el.getAttribute(attrs[i])
      if (value) return attrs[i] + '=' + value
    }
    return null
  }

  /** Short, stable, human-readable path: body > main > section.hero > button.cta */
  function selectorOf(el) {
    var parts = []
    var node = el
    var guard = 0
    while (node && node.nodeType === 1 && node !== document.documentElement && guard++ < 12) {
      var tag = node.tagName.toLowerCase()
      if (node.id) {
        parts.unshift(tag + '#' + CSS.escape(node.id))
        break
      }
      var cls = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2)
      var sameTag = node.parentElement
        ? Array.prototype.filter.call(node.parentElement.children, function (c) {
            return c.tagName === node.tagName
          })
        : []
      var nth = sameTag.length > 1 ? ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')' : ''
      parts.unshift(tag + (cls.length ? '.' + cls.map(function (value) { return CSS.escape(value) }).join('.') : '') + nth)
      if (parts.length > 5) break
      node = node.parentElement
    }
    return parts.join(' > ')
  }

  /** Component chain (up to three names), when the app runs a dev build. */
  function componentChainOf(el) {
    var chain = []
    try {
      var key = Object.keys(el).filter(function (k) {
        return k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0
      })[0]
      if (!key) return chain
      var fiber = el[key]
      var guard = 0
      while (fiber && guard++ < 40 && chain.length < 3) {
        var type = fiber.type
        var name = typeof type === 'function' ? type.displayName || type.name : type && type.displayName
        if (name && !/^[a-z]/.test(name) && chain.indexOf(name) === -1) chain.push(name)
        fiber = fiber.return
      }
    } catch (e) {
      /* dev-only nicety */
    }
    return chain
  }

  /** Where the element sits in the viewport, coarse and readable. */
  function placementOf(rect) {
    var cx = (rect.left + rect.width / 2) / Math.max(1, window.innerWidth)
    var cy = (rect.top + rect.height / 2) / Math.max(1, window.innerHeight)
    var col = cx < 0.34 ? 'Left' : cx > 0.66 ? 'Right' : 'Center'
    var row = cy < 0.34 ? 'Top' : cy > 0.66 ? 'Bottom' : 'Middle'
    return {
      x: Math.round(cx * 100),
      y: Math.round(cy * 100),
      zone: t('zone.' + row.toLowerCase() + col),
    }
  }

  /** How many elements the generated selector actually matches: 1 means the
   *  annotation is unambiguous, >1 or 0 must be told to the agent. */
  function selectorMatches(selector) {
    try {
      return document.querySelectorAll(selector).length
    } catch (e) {
      return -1
    }
  }

  /** Nearest React component name, when the app runs a dev build. */
  function componentOf(el) {
    try {
      var key = Object.keys(el).filter(function (k) {
        return k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0
      })[0]
      if (!key) return null
      var fiber = el[key]
      var guard = 0
      while (fiber && guard++ < 24) {
        var type = fiber.type
        var name = typeof type === 'function' ? type.displayName || type.name : type && type.displayName
        if (name && !/^[a-z]/.test(name)) return name
        fiber = fiber.return
      }
    } catch (e) {
      /* dev-only nicety */
    }
    return null
  }

  function stylesOf(el) {
    var out = {}
    try {
      var cs = getComputedStyle(el)
      var keys = ['display', 'position', 'gap', 'padding', 'margin', 'width', 'height',
        'font-size', 'font-weight', 'line-height', 'color', 'background-color', 'border-radius',
        'border-width', 'box-shadow', 'opacity', 'z-index']
      for (var i = 0; i < keys.length; i++) {
        var v = cs.getPropertyValue(keys[i])
        if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px') out[keys[i]] = v
      }
    } catch (e) {
      /* cross-origin would have failed earlier */
    }
    return out
  }

  function detailOf(el) {
    var rect = el.getBoundingClientRect()
    var selector = selectorOf(el)
    var chain = componentChainOf(el)
    return {
      selector: selector,
      selectorMatches: selectorMatches(selector),
      testId: testIdOf(el),
      component: chain[0] || componentOf(el),
      componentChain: chain,
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      ariaLabel: el.getAttribute('aria-label') || null,
      alt: el.getAttribute('alt') || null,
      name: el.getAttribute('name') || null,
      type: el.getAttribute('type') || null,
      tag: el.tagName.toLowerCase(),
      classes: (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 4),
      text: clip(el.textContent || '', 120),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      // Pins live in document space: mixing a viewport rect with the scroll
      // offset at render time makes them drift instead of following the element.
      doc: {
        x: Math.round(rect.x + window.scrollX),
        y: Math.round(rect.y + window.scrollY),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      placement: placementOf(rect),
      page: location.pathname + location.search,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      styles: stylesOf(el),
    }
  }

  // -------------------------------------------------------------- persistence

  function storeKey() {
    return STORE_PREFIX + encodeURIComponent(session) + ':' + currentPage
  }

  function load() {
    try {
      var raw = localStorage.getItem(storeKey())
      var list = raw ? JSON.parse(raw) : []
      return Array.isArray(list) ? list : []
    } catch (e) {
      return []
    }
  }

  function save() {
    try {
      localStorage.setItem(storeKey(), JSON.stringify(state.annotations))
    } catch (e) {
      post('warning', { message: t('overlay.saveFailed') })
    }
  }

  // ------------------------------------------------------------------- render

  var root = document.createElement('div')
  var mounted = false
  var pendingHostMessages = []
  root.className = 'dsa-layer'
  var styleEl = document.createElement('style')
  var capture = document.createElement('div')
  capture.className = 'dsa-capture'
  var pinLayer = document.createElement('div')
  var frame = document.createElement('div')
  frame.className = 'dsa-frame'
  frame.innerHTML = '<i></i><i></i><i></i><i></i>'
  var readout = document.createElement('div')
  readout.className = 'dsa-readout dsa-mono'
  var card = null

  function mount() {
    if (mounted) return
    styleEl.textContent = css()
    root.appendChild(styleEl)
    root.appendChild(pinLayer)
    root.appendChild(frame)
    root.appendChild(readout)
    document.documentElement.appendChild(root)
    // The top layer escapes transformed app roots and their clipping contexts.
    if (typeof root.showPopover === 'function') {
      root.setAttribute('popover', 'manual')
      root.showPopover()
    }
    mounted = true
    render()
    post('ready', { annotations: state.annotations, path: location.pathname })
    var pending = pendingHostMessages
    pendingHostMessages = []
    pending.forEach(handleHostMessage)
  }

  function mountCapture() {
    var active = state.mode !== 'idle'
    if (active && capture.parentNode !== root) root.insertBefore(capture, pinLayer)
    if (!active && capture.parentNode === root) root.removeChild(capture)
    if (active) document.documentElement.setAttribute('data-dsa-mode', state.mode)
    else document.documentElement.removeAttribute('data-dsa-mode')
  }

  /** The inert overlay leaves the real app in the browser's hit-test tree. */
  function elementAt(x, y) {
    var el = document.elementFromPoint(x, y)
    if (!el || el === root || root.contains(el)) return null
    return el
  }

  // Measurements only live for one update. Shared clipping ancestors are read
  // once per frame, and no cached rectangle survives a scroll or layout change.
  var measurements = null
  function withMeasurements(callback) {
    var previous = measurements
    measurements = previous || new WeakMap()
    try { return callback() } finally { measurements = previous }
  }

  function measurement(el) {
    if (!measurements) return {}
    var value = measurements.get(el)
    if (!value) { value = {}; measurements.set(el, value) }
    return value
  }

  function rectOf(el) {
    var value = measurement(el)
    if (!value.rect) value.rect = el.getBoundingClientRect()
    return value.rect
  }

  function setStyle(el, key, value) {
    if (el.style[key] !== value) el.style[key] = value
  }

  function render() {
    if (!mounted) return
    var dark = isDark()
    root.setAttribute('data-dark', dark ? '1' : '0')
    mountCapture()
    renderFrame()
    renderPins()
  }

  function framePosition() {
    var target = state.selected || state.hover
    var visible = visibleRect(target)
    if (!visible) return null
    var rect = visible.rect
    var component = componentOf(target)
    var content =
      '<b>' + esc(target.tagName.toLowerCase()) + '</b>' +
      (target.getAttribute('class') ? '<span>.' + esc(clip(target.getAttribute('class'), 28).split(' ')[0]) + '</span>' : '') +
      (component ? '<span>· ' + esc(component) + '</span>' : '') +
      '<span>· ' + Math.round(rect.width) + '×' + Math.round(rect.height) + '</span>'
    var top = rect.top - 26
    // A pin is anchored to the element's top edge, so a readout directly above
    // it would sit on the marker; lift it clear instead of stacking two labels.
    var annotated = state.annotations.some(function (ann) {
      var el = elementFor(ann)
      if (!el || !el.isConnected) return false
      var other = rectOf(el)
      return Math.abs(other.left + other.width / 2 - (rect.left + rect.width / 2)) < 2 &&
        Math.abs(other.top - rect.top) < 2
    })
    if (annotated) top -= 24
    var left = Math.max(4, rect.left)
    if (top < 4) {
      // No room above: prefer the element's right side (usually open canvas),
      // and only fall back to below when the right edge is too close too.
      if (window.innerWidth - rect.right > 240) {
        left = rect.right + 8
        top = rect.top - 2
      } else {
        top = rect.bottom + 6
      }
    }
    return { rect: rect, content: content, left: left, top: top, selected: !!state.selected }
  }

  function renderFrame(position) {
    if (arguments.length === 0) position = withMeasurements(framePosition)
    if (!position) {
      setStyle(frame, 'display', 'none')
      setStyle(readout, 'display', 'none')
      return
    }
    var rect = position.rect
    var nextState = position.selected ? 'selected' : 'hover'
    if (frame.getAttribute('data-state') !== nextState) frame.setAttribute('data-state', nextState)
    setStyle(frame, 'display', 'block')
    setStyle(frame, 'left', rect.left + 'px')
    setStyle(frame, 'top', rect.top + 'px')
    setStyle(frame, 'width', rect.width + 'px')
    setStyle(frame, 'height', rect.height + 'px')
    setStyle(readout, 'display', state.mode === 'writing' || state.viewing ? 'none' : 'flex')
    if (readout.innerHTML !== position.content) readout.innerHTML = position.content
    setStyle(readout, 'left', position.left + 'px')
    setStyle(readout, 'top', position.top + 'px')
  }

  function cardPosition() {
    if (!card || !state.anchor || !state.anchor.isConnected) return null
    var rect = rectOf(state.anchor)
    var width = card.offsetWidth || 304
    var height = card.offsetHeight || 168
    var gap = 12
    // Never cover the element being annotated: dock to its right, then left,
    // then below/above — the first side with room wins.
    var left
    if (window.innerWidth - rect.right >= width + gap) left = rect.right + gap
    else if (rect.left >= width + gap) left = rect.left - width - gap
    else left = Math.min(rect.left, window.innerWidth - width - 8)
    var top = rect.top
    if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8)
    return { left: Math.max(8, left), top: Math.max(8, top) }
  }

  function anchorCard(position) {
    if (arguments.length === 0) position = withMeasurements(cardPosition)
    if (!card || !position) return
    setStyle(card, 'left', position.left + 'px')
    setStyle(card, 'top', position.top + 'px')
  }

  /** Where a pin belongs right now, in viewport coordinates: the element's live
   *  position, so it travels with the page whether the window or an inner
   *  container scrolls. Falls back to the recorded document position. */
  function elementFor(ann) {
    var cached = liveElements.get(ann.id)
    if (cached && cached.isConnected) return cached
    var el = query(ann.selector)
    // Never attach to an arbitrary lookalike after a component disappears: the
    // match has to be the same kind of element, not just the same selector.
    if (!el) return null
    if (ann.tag && el.tagName.toLowerCase() !== String(ann.tag).toLowerCase()) return null
    liveElements.set(ann.id, el)
    return el
  }

  function clippingBounds(node) {
    if (!node || node === document.documentElement) return { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
    var value = measurement(node)
    if (!value.bounds) {
      var bounds = Object.assign({}, clippingBounds(node.parentElement))
      var style = getComputedStyle(node)
      var clipsX = /(auto|scroll|hidden|clip)/.test(style.overflowX)
      var clipsY = /(auto|scroll|hidden|clip)/.test(style.overflowY)
      var box = clipsX || clipsY ? rectOf(node) : null
      if (clipsX) {
        bounds.left = Math.max(bounds.left, box.left)
        bounds.right = Math.min(bounds.right, box.right)
      }
      if (clipsY) {
        bounds.top = Math.max(bounds.top, box.top)
        bounds.bottom = Math.min(bounds.bottom, box.bottom)
      }
      value.bounds = bounds
    }
    return value.bounds
  }

  function visibleRect(el) {
    if (!el || !el.isConnected) return null
    var rect = rectOf(el)
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= innerHeight ||
        rect.right <= 0 || rect.left >= innerWidth) return null
    var bounds = clippingBounds(el.parentElement)
    if (rect.bottom <= bounds.top || rect.top >= bounds.bottom ||
        rect.right <= bounds.left || rect.left >= bounds.right) return null
    return { rect: rect, bounds: bounds }
  }

  function pinAnchor(ann) {
    var visible = visibleRect(elementFor(ann))
    if (!visible) return null
    var rect = visible.rect, bounds = visible.bounds
    // Hide the flag when its edge is clipped; never leave a floating flag on
    // another component, and never fall back to stale absolute coordinates.
    if (rect.top < bounds.top || rect.top >= bounds.bottom) return null
    return { x: Math.max(bounds.left + 10, Math.min(bounds.right - 10, rect.left + rect.width / 2)), y: rect.top }
  }

  /** Scroll/resize path: move the existing pins, don't rebuild them. */
  function positionPins(anchors) {
    state.annotations.forEach(function (ann, index) {
      var pin = pinLayer.children[index]
      if (!pin) return
      var anchor = anchors[index]
      if (pin.hidden !== !anchor) pin.hidden = !anchor
      if (anchor) {
        setStyle(pin, 'left', anchor.x + 'px')
        setStyle(pin, 'top', anchor.y + 'px')
      }
    })
  }

  function updatePositions() {
    withMeasurements(function () {
      // Read all geometry before changing any overlay styles or markup.
      var anchors = state.annotations.map(pinAnchor)
      var nextFrame = framePosition()
      var nextCard = cardPosition()
      positionPins(anchors)
      renderFrame(nextFrame)
      anchorCard(nextCard)
    })
  }

  function renderPins() {
    pinLayer.innerHTML = ''
    state.annotations.forEach(function (ann, index) {
      var pin = document.createElement('button')
      pin.type = 'button'
      pin.setAttribute('aria-label', t('overlay.viewPin', { n: index + 1, comment: ann.comment }))
      pin.className = 'dsa-pin'
      pin.dataset.id = ann.id
      pin.textContent = String(index + 1)
      pin.title = ann.comment
      var anchor = pinAnchor(ann)
      pin.hidden = !anchor
      if (anchor) {
        pin.style.left = anchor.x + 'px'
        pin.style.top = anchor.y + 'px'
      }
      pin.setAttribute('data-open', state.viewing === ann.id ? 'true' : 'false')
      pin.addEventListener('click', function (event) {
        event.stopPropagation()
        if (state.viewing === ann.id) { closeCard(); return }
        var el = elementFor(ann)
        if (!el) {
          post('missing', { id: ann.id })
          return
        }
        showComment(ann, el)
        post('focus', { id: ann.id })
      })
      pinLayer.appendChild(pin)
    })
    anchorCard()
  }

  function query(selector) {
    try {
      var matches = document.querySelectorAll(selector)
      return matches.length === 1 ? matches[0] : null
    } catch (e) {
      return null
    }
  }

  // ------------------------------------------------------------------ card UI

  function draftIsDirty(draft, text) {
    var original = draft.existing ? String(draft.initialComment || '') : ''
    return draft.existing ? text !== original : !!text.trim()
  }

  function publishDraft(open) {
    if (!card || !state.drafting) return
    var area = card.querySelector('textarea')
    if (!area) return
    var draft = state.drafting
    if (draftIsDirty(draft, area.value)) {
      state.savedDraft = Object.assign({}, draft, { comment: area.value, open: open })
    } else if (state.savedDraft && state.savedDraft.id === draft.id) {
      state.savedDraft = null
    }
    post('draft', { draft: state.savedDraft })
  }

  function focusPin(id) {
    if (!id) return
    var pin = Array.prototype.find.call(pinLayer.querySelectorAll('.dsa-pin'), function (node) { return node.dataset.id === id })
    if (pin && !pin.hidden) pin.focus({ preventScroll: true })
  }

  function closeCard(preserve) {
    if (card && state.drafting && preserve !== 'silent') {
      if (preserve !== false) publishDraft(false)
      else if (state.savedDraft && state.savedDraft.id === state.drafting.id) {
        state.savedDraft = null
        post('draft', { draft: null })
      }
    }
    if (card && card.parentNode) card.parentNode.removeChild(card)
    card = null
    state.drafting = null
    state.viewing = null
    state.anchor = null
    if (state.mode === 'writing') state.mode = 'idle'
    state.selected = null
    render()
    post('mode', { mode: state.mode, count: state.annotations.length })
  }

  function targetLabel(detail) {
    return clip(String(detail.ariaLabel || detail.text || detail.component || detail.tag || '').replace(/\s+/g, ' ').trim(), 60)
  }

  function cardHeader(detail, number) {
    return '<header>' +
      '<button type="button" class="dsa-target" data-act="details" aria-expanded="false" title="' + esc(t('overlay.details')) + '">' +
      (number ? '<span class="dsa-number">' + esc(number) + '</span>' : '') +
      '<span class="dsa-clip">' + esc(targetLabel(detail)) + '</span></button>' +
      '<button type="button" data-act="close" aria-label="' + esc(t('overlay.close')) + '">✕</button></header>' +
      '<div class="dsa-details" hidden>' + esc(detail.selector) + '</div>'
  }

  function bindCardDetails() {
    card.querySelector('[data-act="details"]').addEventListener('click', function (event) {
      var details = card.querySelector('.dsa-details')
      details.hidden = !details.hidden
      event.currentTarget.setAttribute('aria-expanded', String(!details.hidden))
      anchorCard()
    })
  }

  function editComment(ann, el) {
    var draft = state.savedDraft && state.savedDraft.id === ann.id ? state.savedDraft : {
      id: ann.id, detail: ann, comment: ann.comment, initialComment: ann.comment, existing: true,
    }
    openCard(draft, el)
  }

  function showComment(ann, el) {
    setMode('idle')
    state.viewing = ann.id
    state.anchor = el
    card = document.createElement('div')
    card.className = 'dsa-card dsa-comment-card'
    card.setAttribute('role', 'region')
    card.setAttribute('aria-label', t('overlay.viewTitle'))
    card.tabIndex = -1
    card.innerHTML = cardHeader(ann, String(state.annotations.indexOf(ann) + 1)) +
      '<textarea class="dsa-comment-text" readonly aria-label="' + esc(t('overlay.commentLabel')) + '" title="' + esc(t('overlay.editHint')) + '"></textarea>'
    var area = card.querySelector('textarea')
    area.value = ann.comment
    card.querySelector('[data-act="close"]').addEventListener('click', function () { closeCard() })
    area.addEventListener('focus', function () {
      if (state.viewing === ann.id) editComment(ann, el)
    })
    bindCardDetails()
    root.appendChild(card)
    area.style.height = Math.min(180, Math.max(58, area.scrollHeight)) + 'px'
    renderPins()
    anchorCard()
    // Keep the text unfocused until the user clicks it or tabs into it.
    card.focus({ preventScroll: true })
  }

  function openCard(draft, el, sendOnCommit) {
    if (state.savedDraft && state.savedDraft.id !== draft.id) {
      post('warning', { message: t('overlay.finishDraft') })
      return
    }
    // Reuse the read-only field so the browser keeps the clicked caret position.
    var viewedCard = state.viewing === draft.id ? card : null
    if (!viewedCard) closeCard()
    state.viewing = null
    if (state.savedDraft && state.savedDraft.id === draft.id) draft = state.savedDraft
    var original = draft.existing ? state.annotations.find(function (ann) { return ann.id === draft.id }) : null
    draft = Object.assign({}, draft, { initialComment: draft.initialComment === undefined ? (original ? original.comment : '') : draft.initialComment })
    state.drafting = draft
    state.sendOnCommit = !!sendOnCommit
    state.mode = 'writing'
    state.anchor = el
    state.selected = el
    mountCapture()
    post('mode', { mode: state.mode })
    card = viewedCard || document.createElement('div')
    card.className = 'dsa-card'
    card.setAttribute('role', 'region')
    card.setAttribute('aria-label', t('overlay.editTitle'))
    if (!viewedCard) card.innerHTML = cardHeader(draft.detail) +
      '<textarea aria-label="' + esc(t('overlay.commentLabel')) + '" placeholder="' + esc(t('overlay.placeholder')) + '"></textarea>'
    card.insertAdjacentHTML('beforeend', '<footer><button type="button" class="dsa-btn" data-act="cancel">' + esc(t('overlay.cancel')) + '</button>' +
      '<span class="dsa-hint">' + esc(t('overlay.hint')) + '</span>' +
      '<button type="button" class="dsa-btn primary" data-act="save" aria-label="' + esc(t('overlay.save')) + '" title="' + esc(t('overlay.save')) + '">' +
      '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20V4m-6 6 6-6 6 6"/></svg></button></footer>')
    var area = card.querySelector('textarea')
    if (area.value !== (draft.comment || '')) area.value = draft.comment || ''
    area.readOnly = false
    area.removeAttribute('title')
    var saveButton = card.querySelector('[data-act="save"]')
    saveButton.disabled = !area.value.trim()
    area.addEventListener('input', function () {
      saveButton.disabled = !area.value.trim()
      area.style.height = 'auto'
      area.style.height = Math.min(180, Math.max(58, area.scrollHeight)) + 'px'
      publishDraft(true)
      anchorCard()
    })
    if (!viewedCard) card.querySelector('[data-act="close"]').addEventListener('click', function () { closeCard() })
    card.querySelector('[data-act="cancel"]').addEventListener('click', function () { closeCard(false) })
    saveButton.addEventListener('click', commit)
    if (!viewedCard) bindCardDetails()
    area.addEventListener('keydown', function (event) {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        commit()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        var id = state.drafting && state.drafting.id
        setMode('idle')
        focusPin(id)
      }
    })
    if (!viewedCard) root.appendChild(card)
    area.style.height = Math.min(180, Math.max(58, area.scrollHeight)) + 'px'
    anchorCard()
    area.focus({ preventScroll: true })
    post('drafting', { id: draft.id, selector: draft.detail.selector })
    publishDraft(true)
  }

  /** Follow the panel's language and re-render. A card that is already open is
   *  rebuilt from the same draft, so nothing typed is lost. */
  function setLang(next) {
    if (!next || i18n.set(next) !== next) return
    var viewed = state.viewing && state.annotations.find(function (ann) { return ann.id === state.viewing })
    var viewedAnchor = state.anchor
    renderPins()
    render()
    if (card && state.drafting && state.anchor) {
      var draft = Object.assign({}, state.drafting, { comment: card.querySelector('textarea').value })
      openCard(draft, state.anchor)
    }
    if (viewed && viewedAnchor) showComment(viewed, viewedAnchor)
  }

  function commit() {
    if (!card || !state.drafting || !state.anchor) return
    var text = card.querySelector('textarea').value.trim()
    if (!text) {
      return
    }
    var draft = state.drafting
    var detail = detailOf(state.anchor)
    if (draft.existing) {
      state.annotations = state.annotations.map(function (ann) {
        return ann.id === draft.id
          ? Object.assign({}, ann, detail, { comment: text })
          : ann
      })
    } else {
      state.annotations = state.annotations.concat([
        Object.assign({ id: draft.id, comment: text, createdAt: Date.now() }, detail),
      ])
    }
    liveElements.set(draft.id, state.anchor)
    save()
    if (state.savedDraft && state.savedDraft.id === draft.id) state.savedDraft = null
    post('draft', { draft: state.savedDraft })
    state.drafting = null
    var ship = state.sendOnCommit
    state.sendOnCommit = false
    setMode(ship ? 'idle' : 'picking')
    renderPins()
    post('changed', { annotations: state.annotations })
    if (ship) post('send', { annotations: state.annotations })
  }

  // ------------------------------------------------------------------ picking

  function pick(event) {
    if (state.mode === 'writing') {
      event.preventDefault()
      event.stopImmediatePropagation()
      closeCard()
      return
    }
    if (state.mode !== 'picking') return
    if (state.busy) return
    var el = elementAt(event.clientX, event.clientY)
    if (!el) {
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    state.selected = el
    state.hover = null
    state.mode = 'writing'
    post('mode', { mode: state.mode, count: state.annotations.length })
    // Codex parity: ⌘/Ctrl-click means "write it and ship it".
    render()
    var detail = detailOf(el)
    var draft = state.savedDraft && state.savedDraft.detail.selector === detail.selector ? state.savedDraft : { id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), detail: detail, comment: '' }
    openCard(draft, el, event.metaKey || event.ctrlKey)
  }

  var pointer = null
  function onMove(event) {
    if (state.mode !== 'picking') return
    pointer = { x: event.clientX, y: event.clientY }
    var el = elementAt(event.clientX, event.clientY)
    if (el === state.hover) return
    state.hover = el
    onViewportChange()
  }

  function setMode(mode) {
    state.mode = mode
    if (mode !== 'writing') {
      state.selected = null
      state.hover = null
      pointer = null
      closeCard()
    }
    render()
    post('mode', { mode: state.mode, count: state.annotations.length })
  }

  function post(type, payload) {
    if (type === 'ready' && !mounted) return
    var target = window.__DSH_ANNO__ && window.__DSH_ANNO__.parentOrigin
    if (!target) return
    try {
      parent.postMessage(
        Object.assign(
          { source: CHANNEL, type: type, url: window.__dshAnnoState ? window.__dshAnnoState().url : location.href, viewport: { w: window.innerWidth, h: window.innerHeight } },
          payload || {}
        ),
        target
      )
    } catch (e) {
      /* the panel is gone */
    }
  }

  window.addEventListener('message', function (event) {
    // Source alone is not enough: any window that can reach this frame could
    // claim it. The message must also come from the harness origin.
    if (event.source !== parent || event.origin !== (window.__DSH_ANNO__ && window.__DSH_ANNO__.parentOrigin)) return
    var data = event.data
    if (!data || data.source !== HOST) return
    // Head-injected previews can receive mode and draft restoration before the
    // body is parsed. Apply those messages only after the layer has its children.
    if (!mounted) { pendingHostMessages.push(data); return }
    handleHostMessage(data)
  }, false)

  function handleHostMessage(data) {
    if (data.type === 'busy') { state.busy = data.value; return }
    if (data.type === 'lang') { setLang(data.lang); return }
    if (data.type === 'restore') {
      state.annotations = Array.isArray(data.annotations) ? data.annotations : []
      liveElements.clear()
      save(); renderPins()
      state.savedDraft = data.draft && data.draft.detail && typeof data.draft.comment === 'string' ? data.draft : null
      if (state.savedDraft && state.savedDraft.existing && state.savedDraft.initialComment === undefined) {
        var original = state.annotations.find(function (ann) { return ann.id === state.savedDraft.id })
        state.savedDraft.initialComment = original ? original.comment : ''
      }
      if (state.savedDraft && !draftIsDirty(state.savedDraft, state.savedDraft.comment)) {
        state.savedDraft = null
        post('draft', { draft: null })
      }
      if (state.savedDraft) {
        var target = query(state.savedDraft.detail.selector)
        if (target && state.savedDraft.open !== false) openCard(state.savedDraft, target)
      }
      return
    }
    if (data.type === 'navigate') { history.go(data.delta); return }
    if (data.type === 'reload') { location.reload(); return }
    if (data.type === 'set-mode') setMode(data.mode)
    // The panel cannot always know whether a card is open; let the overlay —
    // which owns the mode — decide what "toggle" means right now.
    if (data.type === 'toggle-mode') setMode(state.mode === 'idle' ? 'picking' : 'idle')
    else if (data.type === 'resume-draft') {
      if (state.savedDraft) {
        var target = query(state.savedDraft.detail.selector)
        if (target) { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); openCard(state.savedDraft, target) }
        else post('missing', { id: state.savedDraft.id })
      }
    } else if (data.type === 'discard-draft') {
      if (state.drafting && state.savedDraft && state.drafting.id === state.savedDraft.id) closeCard(false)
      state.savedDraft = null
      post('draft', { draft: null })
    } else if (data.type === 'focus' || data.type === 'view' || data.type === 'edit') {
      var ann = state.annotations.filter(function (a) {
        return a.id === data.id
      })[0]
      var el = ann ? elementFor(ann) : null
      if (!el) post('missing', { id: data.id })
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        if (data.type === 'view') showComment(ann, el)
        else if (data.type === 'edit') editComment(ann, el)
        else { state.selected = el; renderFrame() }
      }
    } else if (data.type === 'undo') {
      if (undo) { state.annotations.push(undo); undo = null; if (undoDraft) { state.savedDraft = undoDraft; undoDraft = null; post('draft', { draft: state.savedDraft }) } save(); renderPins(); post('changed', { annotations: state.annotations }) }
    } else if (data.type === 'remove') {
      undo = state.annotations.find(function (a) { return a.id === data.id }) || null
      if (state.viewing === data.id || (state.drafting && state.drafting.id === data.id)) closeCard()
      undoDraft = state.savedDraft && state.savedDraft.id === data.id ? state.savedDraft : null
      if (undoDraft) { state.savedDraft = null; post('draft', { draft: null }) }
      state.annotations = state.annotations.filter(function (a) {
        return a.id !== data.id
      })
      save()
      renderPins()
      post('changed', { annotations: state.annotations })
    } else if (data.type === 'clear') {
      setMode('idle')
      var removed = new Set(data.ids || state.annotations.map(function (a) { return a.id }))
      state.annotations = state.annotations.filter(function (a) { return !removed.has(a.id) })
      save()
      renderPins()
      post('changed', { annotations: state.annotations })
    } else if (data.type === 'ping') {
      post('ready', { annotations: state.annotations, path: location.pathname })
    }
  }

  function isAppEvent(event) {
    return state.mode !== 'idle' && !root.contains(event.target)
  }
  window.addEventListener('mousemove', onMove, { capture: true, passive: true })
  window.addEventListener('click', function (event) {
    if (isAppEvent(event)) pick(event)
  }, true)
  // Keep app press handlers, links, focus and text selection from firing while
  // picking. Pointer defaults remain available for native touch scrolling.
  ;['pointerdown', 'pointerup'].forEach(function (type) {
    window.addEventListener(type, function (event) {
      if (type === 'pointerdown' && !root.contains(event.target)) post('interact')
      if (isAppEvent(event)) event.stopImmediatePropagation()
    }, true)
  })
  ;['mousedown', 'mouseup', 'dblclick', 'auxclick'].forEach(function (type) {
    window.addEventListener(type, function (event) {
      if (!isAppEvent(event)) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }, true)
  })
  window.addEventListener('contextmenu', function (event) {
    if (!isAppEvent(event)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    setMode('idle')
  }, true)
  window.addEventListener('click', function (event) {
    if (state.viewing && card && !card.contains(event.target) && !pinLayer.contains(event.target)) closeCard()
  }, true)
  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && state.viewing) { var id = state.viewing; closeCard(); focusPin(id); return }
    if (event.key === 'Escape' && !card) setMode('idle')
  }, true)
  /** Re-anchor stored annotations to their live elements: layout can shift
   *  under a pin (content growing above it, a route change, a resize). */
  function resyncAnchors() {
    var changed = false
    state.annotations = state.annotations.map(function (ann) {
      var el = elementFor(ann)
      if (!el || !el.isConnected) return ann
      var rect = el.getBoundingClientRect()
      var doc = {
        x: Math.round(rect.x + window.scrollX),
        y: Math.round(rect.y + window.scrollY),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      }
      if (ann.doc && Math.abs(ann.doc.x - doc.x) < 1 && Math.abs(ann.doc.y - doc.y) < 1) return ann
      changed = true
      return Object.assign({}, ann, { doc: doc })
    })
    if (changed) save()
  }

  // Capture phase: scroll events from inner containers do not bubble, but they
  // are delivered to window listeners registered for capture.
  var viewportChanged = false
  function onViewportChange() {
    viewportChanged = true
  }
  window.addEventListener('scroll', onViewportChange, { capture: true, passive: true })
  window.addEventListener('resize', function () {
    resyncAnchors()
    renderFrame()
    renderPins()
  })

  function changePage() {
    var next = location.pathname + location.search + location.hash
    if (next === currentPage) return
    save()
    closeCard('silent')
    state.savedDraft = null
    currentPage = next
    state.annotations = load()
    state.hover = null
    state.selected = null
    liveElements.clear()
    undo = null
    setMode('idle')
    post('ready', { annotations: state.annotations })
  }
  ;['pushState', 'replaceState'].forEach(function (method) {
    var original = history[method]
    history[method] = function () {
      var result = original.apply(this, arguments)
      changePage()
      return result
    }
  })
  window.addEventListener('popstate', changePage)
  window.addEventListener('hashchange', changePage)

  // Layout/transform animations do not necessarily emit scroll or resize.
  // Use one geometry pass for scrolling and animation; unchanged markup and
  // styles are left alone. Browsers pause rAF while the preview is backgrounded.
  function trackAnchors() {
    if (viewportChanged && state.mode === 'picking' && pointer) state.hover = elementAt(pointer.x, pointer.y)
    if (viewportChanged || state.hover || state.selected || state.annotations.length || card) updatePositions()
    viewportChanged = false
    requestAnimationFrame(trackAnchors)
  }
  requestAnimationFrame(trackAnchors)
  state.annotations = load()
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
