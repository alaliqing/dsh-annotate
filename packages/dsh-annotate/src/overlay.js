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
  var MARKER = '#f0a05a'

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
    var ink = dark ? '#f2f3f5' : '#16181d'
    var muted = dark ? 'rgba(242,243,245,.62)' : 'rgba(22,24,29,.58)'
    var panelBg = dark ? 'rgba(20,22,27,.86)' : 'rgba(252,252,253,.90)'
    var hair = dark ? 'rgba(255,255,255,.16)' : 'rgba(16,18,22,.14)'
    var fieldBg = dark ? 'rgba(255,255,255,.06)' : 'rgba(16,18,22,.04)'
    return [
      // Viewport-fixed: apps often scroll an inner container, where document
      // coordinates never change and absolutely-placed pins would sit still.
      '.dsa-layer{position:fixed;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;overflow:visible;background:transparent;z-index:2147483000;pointer-events:none;',
      'font:12px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:' + ink + '}',
      '.dsa-layer *{box-sizing:border-box}.dsa-layer::backdrop{display:none}',
      '.dsa-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}',
      // capture surface (only while picking) — swallows app clicks
      '.dsa-capture{position:absolute;inset:0;z-index:1;pointer-events:auto;cursor:crosshair}',
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
      // pins
      '.dsa-pin{appearance:none;padding:0;min-width:0;min-height:0;max-width:none;max-height:none;display:block;position:absolute;z-index:5;pointer-events:auto;width:20px;height:20px;margin:-10px 0 0 -10px;',
      'border-radius:50%;background:' + MARKER + ';color:#20160c;border:1.5px solid ' + panelBg + ';',
      'font:600 11px/17px ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center;cursor:pointer;',
      'box-shadow:0 2px 10px -2px rgba(0,0,0,.55);transform-origin:center;',
      'animation:dsa-pop .18s cubic-bezier(.2,1.4,.4,1)}',
      '.dsa-pin:hover{transform:scale(1.14)}.dsa-pin[hidden]{display:none!important}.dsa-pin:focus-visible{outline:2px solid '+ink+';outline-offset:3px}.dsa-layer button:focus-visible{outline:2px solid '+MARKER+';outline-offset:2px}',
      '.dsa-pin[data-open="true"]{outline:2px solid color-mix(in srgb,' + MARKER + ' 45%,transparent);outline-offset:2px}',
      '@keyframes dsa-pop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}',
      // comment card
      '.dsa-card{position:absolute;z-index:6;width:min(320px,calc(100vw - 16px));pointer-events:auto;color:' + ink + ';',
      'background:' + panelBg + ';border:1px solid ' + hair + ';border-radius:12px;overflow:hidden;',
      'box-shadow:0 24px 60px -28px rgba(0,0,0,.7);backdrop-filter:blur(18px) saturate(160%);',
      'border-left:3px solid ' + MARKER + ';',
      'animation:dsa-rise .16s ease-out}',
      '@keyframes dsa-rise{from{transform:translateY(4px);opacity:0}to{transform:none;opacity:1}}',
      '.dsa-card header{display:flex;align-items:center;gap:8px;padding:7px 8px 7px 10px;border-bottom:1px solid ' + hair + '}',
      '.dsa-card header .dsa-tag{flex:none;color:' + MARKER + ';font-weight:600}',
      '.dsa-card header .dsa-clip{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + muted + '}',
      '.dsa-card header button{all:unset;cursor:pointer;width:20px;height:20px;line-height:18px;text-align:center;border-radius:4px;color:' + muted + '}',
      '.dsa-card header button:hover{background:' + fieldBg + ';color:' + ink + '}',
      '.dsa-card textarea{display:block;width:100%;min-height:62px;max-height:220px;resize:vertical;border:0;outline:none;',
      'padding:9px 10px;background:transparent;color:inherit;font:inherit;font-size:12.5px}',
      '.dsa-comment-text{padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12.5px}',
      '.dsa-card footer{display:flex;align-items:center;gap:8px;padding:6px 8px 8px 10px;border-top:1px solid ' + hair + '}',
      '.dsa-card footer .dsa-hint{flex:1;color:' + muted + ';font-size:10.5px}',
      '.dsa-btn{all:unset;cursor:pointer;padding:4px 10px;border-radius:4px;border:1px solid ' + hair + ';font-size:11.5px}',
      '.dsa-btn:hover{border-color:' + MARKER + ';color:' + MARKER + '}',
      '.dsa-btn.primary{background:' + MARKER + ';border-color:transparent;color:#20160c;font-weight:600}',
      '.dsa-btn.primary:hover{opacity:.88;color:#20160c}',
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
    render()
  }

  function mountCapture() {
    var active = state.mode !== 'idle'
    if (active && capture.parentNode !== root) root.insertBefore(capture, pinLayer)
    if (!active && capture.parentNode === root) root.removeChild(capture)
  }

  /**
   * The capture surface owns the pointer while reviewing, so `event.target` is
   * always the surface itself. Resolve the real element under the cursor by
   * asking the document with our own hit-testing switched off for one call.
   */
  function elementAt(x, y) {
    var previous = capture.style.pointerEvents
    capture.style.pointerEvents = 'none'
    var el = document.elementFromPoint(x, y)
    capture.style.pointerEvents = previous || 'auto'
    if (!el || el === root || root.contains(el)) return null
    return el
  }

  function render() {
    var dark = isDark()
    root.setAttribute('data-dark', dark ? '1' : '0')
    mountCapture()
    renderFrame()
    renderPins()
  }

  function renderFrame() {
    var target = state.selected || state.hover
    if (!target || !target.isConnected || !visibleRect(target)) {
      frame.style.display = 'none'
      readout.style.display = 'none'
      return
    }
    var rect = target.getBoundingClientRect()
    frame.style.display = 'block'
    frame.setAttribute('data-state', state.selected ? 'selected' : 'hover')
    frame.style.left = rect.left + 'px'
    frame.style.top = rect.top + 'px'
    frame.style.width = rect.width + 'px'
    frame.style.height = rect.height + 'px'

    readout.style.display = 'flex'
    readout.innerHTML =
      '<b>' + esc(target.tagName.toLowerCase()) + '</b>' +
      (target.getAttribute('class') ? '<span>.' + esc(clip(target.getAttribute('class'), 28).split(' ')[0]) + '</span>' : '') +
      (componentOf(target) ? '<span>· ' + esc(componentOf(target)) + '</span>' : '') +
      '<span>· ' + Math.round(rect.width) + '×' + Math.round(rect.height) + '</span>'
    var top = rect.top - 26
    // A pin is anchored to the element's top edge, so a readout directly above
    // it would sit on the marker; lift it clear instead of stacking two labels.
    var annotated = state.annotations.some(function (ann) {
      var el = elementFor(ann)
      if (!el || !el.isConnected) return false
      var other = el.getBoundingClientRect()
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
    readout.style.left = left + 'px'
    readout.style.top = top + 'px'
  }

  function anchorCard() {
    if (!card || !state.anchor || !state.anchor.isConnected) return
    var rect = state.anchor.getBoundingClientRect()
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
    card.style.left = Math.max(8, left) + 'px'
    card.style.top = Math.max(8, top) + 'px'
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

  function visibleRect(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return null
    var rect = el.getBoundingClientRect()
    var bounds = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
    for (var node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      var style = getComputedStyle(node)
      var box = node.getBoundingClientRect()
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
        bounds.left = Math.max(bounds.left, box.left)
        bounds.right = Math.min(bounds.right, box.right)
      }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
        bounds.top = Math.max(bounds.top, box.top)
        bounds.bottom = Math.min(bounds.bottom, box.bottom)
      }
    }
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= bounds.top || rect.top >= bounds.bottom ||
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
  function positionPins() {
    state.annotations.forEach(function (ann, index) {
      var pin = pinLayer.children[index]
      if (!pin) return
      var anchor = pinAnchor(ann)
      pin.hidden = !anchor
      if (anchor) {
        pin.style.left = anchor.x + 'px'
        pin.style.top = anchor.y + 'px'
      }
    })
    anchorCard()
  }

  function renderPins() {
    pinLayer.innerHTML = ''
    state.annotations.forEach(function (ann, index) {
      var pin = document.createElement('button')
      pin.type = 'button'
      pin.setAttribute('aria-label', t('overlay.viewPin', { n: index + 1, comment: ann.comment }))
      pin.className = 'dsa-pin'
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

  function closeCard(preserve) {
    if (card && state.drafting && preserve !== true) post('draft', { draft: null })
    if (card && card.parentNode) card.parentNode.removeChild(card)
    card = null
    state.drafting = null
    state.viewing = null
    state.anchor = null
    // Only the footer Mark button arms picking. Closing or saving a card
    // returns the preview to normal interaction.
    if (state.mode === 'writing') state.mode = 'idle'
    state.selected = null
    render()
    post('mode', { mode: state.mode, count: state.annotations.length })
  }

  function showComment(ann, el) {
    setMode('idle')
    state.viewing = ann.id
    state.anchor = el
    card = document.createElement('div')
    card.className = 'dsa-card dsa-comment-card'
    card.innerHTML =
      '<header>' +
      '<span class="dsa-tag dsa-mono">' + esc(String(state.annotations.indexOf(ann) + 1)) + '</span>' +
      '<span class="dsa-clip dsa-mono">' + esc(ann.selector) + '</span>' +
      '<button type="button" data-act="close" aria-label="' + esc(t('overlay.close')) + '">✕</button>' +
      '</header>' +
      '<div class="dsa-comment-text"></div>'
    card.querySelector('.dsa-comment-text').textContent = ann.comment
    card.querySelector('[data-act="close"]').addEventListener('click', closeCard)
    root.appendChild(card)
    renderPins()
    anchorCard()
  }

  function openCard(draft, el) {
    closeCard()
    state.drafting = draft
    state.mode = 'writing'
    state.anchor = el
    mountCapture()
    post('mode', { mode: state.mode })
    var label = draft.detail.tag + (draft.detail.classes.length ? '.' + draft.detail.classes[0] : '')
    card = document.createElement('div')
    card.className = 'dsa-card'
    card.innerHTML =
      '<header>' +
      '<span class="dsa-tag dsa-mono">' + esc(label) + '</span>' +
      '<span class="dsa-clip dsa-mono">' + esc(draft.detail.selector) + '</span>' +
      '<button type="button" data-act="close" aria-label="' + esc(t('overlay.close')) + '">✕</button>' +
      '</header>' +
      '<textarea placeholder="' + esc(t('overlay.placeholder')) + '"></textarea>' +
      '<footer>' +
      '<span class="dsa-hint dsa-mono">' + esc(t('overlay.hint')) + '</span>' +
      '<button type="button" class="dsa-btn primary" data-act="save">' + esc(t('overlay.save')) + '</button>' +
      '</footer>'
    var area = card.querySelector('textarea')
    area.value = draft.comment || ''
    area.addEventListener('input', function () { post('draft', { draft: Object.assign({}, draft, { comment: area.value }) }) })
    card.querySelector('[data-act="close"]').addEventListener('click', closeCard)
    card.querySelector('[data-act="save"]').addEventListener('click', commit)
    area.addEventListener('keydown', function (event) {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        commit()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        // Esc means "leave annotation mode"; setMode closes the card for us.
        setMode('idle')
      }
    })
    root.appendChild(card)
    anchorCard()
    setTimeout(function () {
      area.focus()
    }, 10)
    post('drafting', { id: draft.id, selector: draft.detail.selector })
    if (area.value) post('draft', { draft: Object.assign({}, draft, { comment: area.value }) })
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
      closeCard()
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
    var ship = state.sendOnCommit
    state.sendOnCommit = false
    closeCard()
    renderPins()
    post('changed', { annotations: state.annotations })
    if (ship) post('send', { annotations: state.annotations })
  }

  // ------------------------------------------------------------------ picking

  function pick(event) {
    if (state.mode === 'writing') {
      event.preventDefault()
      event.stopPropagation()
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
    event.stopPropagation()
    state.selected = el
    state.hover = null
    state.mode = 'writing'
    post('mode', { mode: state.mode, count: state.annotations.length })
    // Codex parity: ⌘/Ctrl-click means "write it and ship it".
    state.sendOnCommit = Boolean(event.metaKey || event.ctrlKey)
    render()
    openCard({ id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), detail: detailOf(el), comment: '' }, el)
  }

  function onMove(event) {
    if (state.mode !== 'picking') return
    var el = elementAt(event.clientX, event.clientY)
    if (!el) return
    if (el === state.hover) return
    state.hover = el
    renderFrame()
  }

  function setMode(mode) {
    state.mode = mode
    if (mode !== 'writing') {
      state.selected = null
      state.hover = null
      closeCard()
    }
    render()
    post('mode', { mode: state.mode, count: state.annotations.length })
  }

  function post(type, payload) {
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
    if (data.type === 'busy') { state.busy = data.value; return }
    if (data.type === 'lang') { setLang(data.lang); return }
    if (data.type === 'restore') {
      state.annotations = Array.isArray(data.annotations) ? data.annotations : []
      liveElements.clear()
      save(); renderPins()
      if (data.draft && data.draft.comment) {
        var target = query(data.draft.detail.selector)
        if (target) { state.mode = 'writing'; openCard(data.draft, target) }
      }
      return
    }
    if (data.type === 'navigate') { history.go(data.delta); return }
    if (data.type === 'reload') { location.reload(); return }
    if (data.type === 'set-mode') setMode(data.mode)
    // The panel cannot always know whether a card is open; let the overlay —
    // which owns the mode — decide what "toggle" means right now.
    if (data.type === 'toggle-mode') setMode(state.mode === 'idle' ? 'picking' : 'idle')
    else if (data.type === 'focus') {
      var ann = state.annotations.filter(function (a) {
        return a.id === data.id
      })[0]
      var el = ann ? elementFor(ann) : null
      if (!el) post('missing', { id: data.id })
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        state.selected = el
        renderFrame()
      }
    } else if (data.type === 'undo') {
      if (undo) { state.annotations.push(undo); undo = null; save(); renderPins(); post('changed', { annotations: state.annotations }) }
    } else if (data.type === 'remove') {
      undo = state.annotations.find(function (a) { return a.id === data.id }) || null
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
  }, false)

  capture.addEventListener('mousemove', onMove, true)
  capture.addEventListener('click', pick, true)
  capture.addEventListener('contextmenu', function (event) {
    event.preventDefault()
    setMode('idle')
  }, true)
  window.addEventListener('click', function (event) {
    if (state.viewing && card && !card.contains(event.target) && !pinLayer.contains(event.target)) closeCard()
  }, true)
  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && state.viewing) { closeCard(); return }
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
  var frameQueued = false
  function onViewportChange() {
    if (frameQueued) return
    frameQueued = true
    requestAnimationFrame(function () {
      frameQueued = false
      renderFrame()
      positionPins()
    })
  }
  window.addEventListener('scroll', onViewportChange, true)
  document.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', function () {
    resyncAnchors()
    renderFrame()
    renderPins()
  })

  function changePage() {
    var next = location.pathname + location.search + location.hash
    if (next === currentPage) return
    save()
    closeCard(true)
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

  // Picking captures clicks, but wheel scrolling must still reach the real
  // nested scroller under the pointer rather than the fixed overlay surface.
  capture.addEventListener('wheel', function (event) {
    var node = elementAt(event.clientX, event.clientY)
    var scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1
    var dy = event.deltaY * scale, dx = event.deltaX * scale
    while (node && node !== document.documentElement) {
      var style = getComputedStyle(node)
      var canY = /(auto|scroll)/.test(style.overflowY) && (dy < 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight)
      var canX = /(auto|scroll)/.test(style.overflowX) && (dx < 0 ? node.scrollLeft > 0 : node.scrollLeft + node.clientWidth < node.scrollWidth)
      if ((dy && canY) || (dx && canX)) {
        node.scrollBy(dx, dy); event.preventDefault(); return
      }
      node = node.parentElement
    }
    window.scrollBy(dx, dy)
    event.preventDefault()
  }, { passive: false })

  // Layout/transform animations do not necessarily emit scroll or resize.
  // Keep only the live markers in sync; never rebuild DOM or write storage in
  // this loop. Browsers pause rAF while the preview is in the background.
  function trackAnchors() {
    if (state.annotations.length || card) positionPins()
    if (card) anchorCard()
    requestAnimationFrame(trackAnchors)
  }
  requestAnimationFrame(trackAnchors)
  state.annotations = load()
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
  post('ready', { annotations: state.annotations, path: location.pathname })
})()
