/**
 * dsh-annotate — injected overlay.
 *
 * Runs INSIDE the previewed (Same-Origin) app document. Owns the picking
 * interaction, the pins and the comment card, and keeps the annotation list in
 * localStorage so a reload does not lose the review. Talks to the panel with
 * postMessage only — the panel never reaches into this document, and this file
 * has no dependency on React, which also makes it testable on its own.
 *
 * Design direction: drafting overlay. Hairline measurement frame with corner
 * ticks, monospace readouts, numbered marker pins, and one warm "marker" accent
 * that cannot be confused with the app's own accent colour.
 */
(function () {
  var CHANNEL = 'dsh-annotate-overlay'
  var HOST = 'dsh-annotate-panel'
  var STORE_PREFIX = 'dsh-annotate:v1:'
  var MARKER = '#f0a05a'

  if (window.__dshAnnotateReady) return
  window.__dshAnnotateReady = true

  var state = {
    mode: 'idle', // 'idle' | 'picking' | 'writing'
    hover: null,
    selected: null,
    drafting: null, // { id, selector, ... , comment }
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
      '.dsa-layer{position:absolute;inset:0;z-index:2147483000;pointer-events:none;',
      'font:12px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:' + ink + '}',
      '.dsa-layer *{box-sizing:border-box}',
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
      '.dsa-pin{position:absolute;z-index:5;pointer-events:auto;width:20px;height:20px;margin:-10px 0 0 -10px;',
      'border-radius:50%;background:' + MARKER + ';color:#20160c;border:1.5px solid ' + panelBg + ';',
      'font:600 11px/17px ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center;cursor:pointer;',
      'box-shadow:0 2px 10px -2px rgba(0,0,0,.55);transform-origin:center;',
      'animation:dsa-pop .18s cubic-bezier(.2,1.4,.4,1)}',
      '.dsa-pin:hover{transform:scale(1.14)}',
      '.dsa-pin[data-open="true"]{outline:2px solid color-mix(in srgb,' + MARKER + ' 45%,transparent);outline-offset:2px}',
      '@keyframes dsa-pop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}',
      // comment card
      '.dsa-card{position:absolute;z-index:6;width:304px;pointer-events:auto;color:' + ink + ';',
      'background:' + panelBg + ';border:1px solid ' + hair + ';border-radius:6px;overflow:hidden;',
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
      '.dsa-card footer{display:flex;align-items:center;gap:8px;padding:6px 8px 8px 10px;border-top:1px solid ' + hair + '}',
      '.dsa-card footer .dsa-hint{flex:1;color:' + muted + ';font-size:10.5px}',
      '.dsa-btn{all:unset;cursor:pointer;padding:4px 10px;border-radius:4px;border:1px solid ' + hair + ';font-size:11.5px}',
      '.dsa-btn:hover{border-color:' + MARKER + ';color:' + MARKER + '}',
      '.dsa-btn.primary{background:' + MARKER + ';border-color:transparent;color:#20160c;font-weight:600}',
      '.dsa-btn.primary:hover{opacity:.88;color:#20160c}',
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
        parts.unshift(tag + '#' + node.id)
        break
      }
      var cls = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2)
      var sameTag = node.parentElement
        ? Array.prototype.filter.call(node.parentElement.children, function (c) {
            return c.tagName === node.tagName
          })
        : []
      var nth = sameTag.length > 1 ? ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')' : ''
      parts.unshift(tag + (cls.length ? '.' + cls.join('.') : '') + nth)
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
    var col = cx < 0.34 ? '左' : cx > 0.66 ? '右' : '中'
    var row = cy < 0.34 ? '上' : cy > 0.66 ? '下' : '中'
    return {
      x: Math.round(cx * 100),
      y: Math.round(cy * 100),
      zone: row + col,
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
    return STORE_PREFIX + location.pathname
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
      /* quota is not worth interrupting a review for */
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
    document.body.appendChild(root)
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
    if (!target || !target.isConnected) {
      frame.style.display = 'none'
      readout.style.display = 'none'
      return
    }
    var rect = target.getBoundingClientRect()
    var sx = window.scrollX
    var sy = window.scrollY
    frame.style.display = 'block'
    frame.setAttribute('data-state', state.selected ? 'selected' : 'hover')
    frame.style.left = rect.left + sx + 'px'
    frame.style.top = rect.top + sy + 'px'
    frame.style.width = rect.width + 'px'
    frame.style.height = rect.height + 'px'

    readout.style.display = 'flex'
    readout.innerHTML =
      '<b>' + esc(target.tagName.toLowerCase()) + '</b>' +
      (target.getAttribute('class') ? '<span>.' + esc(clip(target.getAttribute('class'), 28).split(' ')[0]) + '</span>' : '') +
      (componentOf(target) ? '<span>· ' + esc(componentOf(target)) + '</span>' : '') +
      '<span>· ' + Math.round(rect.width) + '×' + Math.round(rect.height) + '</span>'
    var top = rect.top + sy - 26
    // A pin is anchored to the element's top edge, so a readout directly above
    // it would sit on the marker; lift it clear instead of stacking two labels.
    var annotated = state.annotations.some(function (ann) {
      return Math.abs(ann.rect.x + ann.rect.w / 2 - (rect.left + rect.width / 2)) < 2 &&
        Math.abs(ann.rect.y - rect.top) < 2
    })
    if (annotated) top -= 24
    var left = Math.max(sx + 4, rect.left + sx)
    if (top < sy + 4) {
      // No room above: prefer the element's right side (usually open canvas),
      // and only fall back to below when the right edge is too close too.
      if (window.innerWidth - rect.right > 240) {
        left = rect.right + sx + 8
        top = rect.top + sy - 2
      } else {
        top = rect.bottom + sy + 6
      }
    }
    readout.style.left = left + 'px'
    readout.style.top = top + 'px'
  }

  function anchorCard() {
    if (!card || !state.anchor || !state.anchor.isConnected) return
    var rect = state.anchor.getBoundingClientRect()
    var sx = window.scrollX
    var sy = window.scrollY
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
    card.style.left = Math.max(8, left) + sx + 'px'
    card.style.top = Math.max(8, top) + sy + 'px'
  }

  /** Where a pin belongs, in document coordinates. Annotations captured before
   *  `doc` existed fall back to their (stale) viewport rect plus the scroll
   *  offset that was in effect — best effort, and it self-heals on the next
   *  click, which rewrites the record. */
  function pinAnchor(ann) {
    if (ann.doc) return { x: ann.doc.x + ann.doc.w / 2, y: ann.doc.y }
    return { x: ann.rect.x + window.scrollX + ann.rect.w / 2, y: ann.rect.y + window.scrollY }
  }

  function renderPins() {
    pinLayer.innerHTML = ''
    state.annotations.forEach(function (ann, index) {
      var pin = document.createElement('div')
      pin.className = 'dsa-pin'
      pin.textContent = String(index + 1)
      pin.title = ann.comment
      var anchor = pinAnchor(ann)
      pin.style.left = anchor.x + 'px'
      pin.style.top = anchor.y + 'px'
      pin.setAttribute('data-open', state.drafting && state.drafting.id === ann.id ? 'true' : 'false')
      pin.addEventListener('click', function (event) {
        event.stopPropagation()
        var el = query(ann.selector)
        if (!el) {
          post('missing', { id: ann.id })
          return
        }
        var live = detailOf(el)
        openCard(
          { id: ann.id, detail: Object.assign({}, ann, { doc: live.doc, rect: live.rect }), comment: ann.comment, existing: true },
          el
        )
        post('focus', { id: ann.id })
      })
      pinLayer.appendChild(pin)
    })
    anchorCard()
  }

  function query(selector) {
    try {
      var found = document.querySelector(selector)
      if (found) return found
      // The generated path can go stale after a re-render; retry on the last
      // segment, which is usually enough to place the pin again.
      var tail = selector.split('>').pop().trim()
      return tail ? document.querySelector(tail) : null
    } catch (e) {
      return null
    }
  }

  // ------------------------------------------------------------------ card UI

  function closeCard() {
    if (card && card.parentNode) card.parentNode.removeChild(card)
    card = null
    state.drafting = null
    state.anchor = null
    // Writing is a detour, not a destination: coming back from a card must
    // leave picking armed, so the next element can be annotated right away.
    var resume = state.mode === 'writing'
    state.mode = 'picking'
    state.selected = null
    render()
    if (resume) post('mode', { mode: state.mode, count: state.annotations.length })
  }

  function openCard(draft, el) {
    closeCard()
    state.drafting = draft
    state.anchor = el
    var label = draft.detail.tag + (draft.detail.classes.length ? '.' + draft.detail.classes[0] : '')
    card = document.createElement('div')
    card.className = 'dsa-card'
    card.innerHTML =
      '<header>' +
      '<span class="dsa-tag dsa-mono">' + esc(label) + '</span>' +
      '<span class="dsa-clip dsa-mono">' + esc(draft.detail.selector) + '</span>' +
      '<button type="button" data-act="close" aria-label="关闭">✕</button>' +
      '</header>' +
      '<textarea placeholder="写一句要改什么…（Shift+Enter 换行）"></textarea>' +
      '<footer>' +
      '<span class="dsa-hint dsa-mono">Enter 保存 · Esc 取消</span>' +
      '<button type="button" class="dsa-btn primary" data-act="save">保存</button>' +
      '</footer>'
    var area = card.querySelector('textarea')
    area.value = draft.comment || ''
    card.querySelector('[data-act="close"]').addEventListener('click', closeCard)
    card.querySelector('[data-act="save"]').addEventListener('click', commit)
    area.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        commit()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        closeCard()
        // Esc means "leave annotation mode", not just "close this card".
        setMode('idle')
      }
    })
    root.appendChild(card)
    anchorCard()
    setTimeout(function () {
      area.focus()
    }, 10)
    post('drafting', { id: draft.id, selector: draft.detail.selector })
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
          ? Object.assign({}, ann, { comment: text, rect: detail.rect, doc: detail.doc, selector: detail.selector })
          : ann
      })
    } else {
      state.annotations = state.annotations.concat([
        Object.assign({ id: draft.id, comment: text, createdAt: Date.now() }, detail),
      ])
    }
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
    var el = elementAt(event.clientX, event.clientY)
    if (!el) {
      // Backdrop click while writing: treat it as cancel.
      if (state.mode === 'writing' && card) {
        event.preventDefault()
        event.stopPropagation()
        closeCard()
      }
      return
    }
    event.preventDefault()
    event.stopPropagation()
    state.selected = el
    state.hover = null
    state.mode = 'writing'
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
    try {
      parent.postMessage(
        Object.assign(
          { source: CHANNEL, type: type, viewport: { w: window.innerWidth, h: window.innerHeight } },
          payload || {}
        ),
        '*'
      )
    } catch (e) {
      /* the panel is gone */
    }
  }

  window.addEventListener('message', function (event) {
    var data = event.data
    if (!data || data.source !== HOST) return
    if (data.type === 'set-mode') setMode(data.mode)
    else if (data.type === 'focus') {
      var ann = state.annotations.filter(function (a) {
        return a.id === data.id
      })[0]
      var el = ann ? query(ann.selector) : null
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        state.selected = el
        renderFrame()
      }
    } else if (data.type === 'remove') {
      state.annotations = state.annotations.filter(function (a) {
        return a.id !== data.id
      })
      save()
      renderPins()
      post('changed', { annotations: state.annotations })
    } else if (data.type === 'clear') {
      state.annotations = []
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
  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !card) setMode('idle')
  }, true)
  /** Re-anchor stored annotations to their live elements: layout can shift
   *  under a pin (content growing above it, a route change, a resize). */
  function resyncAnchors() {
    var changed = false
    state.annotations = state.annotations.map(function (ann) {
      var el = query(ann.selector)
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

  window.addEventListener('scroll', function () {
    renderFrame()
    renderPins()
  }, true)
  window.addEventListener('resize', function () {
    renderFrame()
    resyncAnchors()
    renderPins()
  })

  state.annotations = load()
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
  post('ready', { annotations: state.annotations, path: location.pathname })
})()
