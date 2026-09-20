/**
 * dsh-annotate — page shim.
 *
 * Injected into every proxied HTML document, before any app script. The proxy
 * already gives the page a `<base>` (so relative and root-absolute URLs stay
 * inside the proxy); this covers what `<base>` cannot:
 *
 *  - URLs built from the page's own origin (`fetch(location.origin + '/api')`),
 *    which would otherwise hit the harness root;
 *  - absolute URLs pointing at the real upstream origin, which would leave the
 *    proxy and become cross-origin (and therefore unannotatable);
 *  - WebSocket / EventSource, routed through one relay path because the harness
 *    router only takes exact upgrade paths;
 *  - SPA navigation, reported to the panel so the address bar follows.
 *
 * Everything is wrapped defensively: a broken shim must never break the app.
 */
;(function () {
  var cfg = window.__DSH_ANNO__
  if (!cfg || !cfg.upstream) return

  var PROXIED = location.origin + cfg.prefix // e.g. https://host/__dsh_anno/<enc>/
  var withSlash = cfg.prefix.slice(-1) === '/' ? cfg.prefix : cfg.prefix + '/'

  function proxied(url) {
    if (url.indexOf(PROXIED) === 0) return url
    // Root-absolute paths have to be prefixed here: a base element cannot do it
    // (URL parsing of '/x' replaces the whole path, base included).
    if (url.charAt(0) === '/' && url.charAt(1) !== '/') return withSlash + url.slice(1)
    if (url.indexOf(withSlash) === 0) return url
    if (url.indexOf(cfg.upstream) === 0) return location.origin + withSlash + url.slice(cfg.upstream.replace(/\/$/, '').length + 1)
    if (url.indexOf(location.origin) === 0) return location.origin + withSlash + url.slice(location.origin.length + 1)
    return url
  }

  function toAbsolute(url) {
    try {
      return new URL(url, location.href).href
    } catch (error) {
      return ''
    }
  }

  /** Same-origin (harness) or upstream-origin URLs are ours to rewrite. */
  function needsRewrite(url) {
    var absolute = toAbsolute(url)
    if (!absolute) return false
    if (absolute.indexOf(PROXIED) === 0) return false
    var upstream = cfg.upstream.replace(/\/$/, '')
    if (absolute.indexOf(upstream + '/') === 0 || absolute === upstream) return true
    if (absolute.indexOf(location.origin + '/') === 0) return true
    return false
  }

  // ---- fetch ---------------------------------------------------------------
  if (typeof window.fetch === 'function') {
    var originalFetch = window.fetch
    window.fetch = function (input, init) {
      try {
        if (typeof input === 'string' && needsRewrite(input)) {
          input = proxied(input)
        } else if (input && typeof input === 'object' && input.url && needsRewrite(input.url)) {
          input = new Request(proxied(input.url), input)
        }
      } catch (error) {
        void error
      }
      return originalFetch.call(this, input, init)
    }
  }

  // ---- XMLHttpRequest -----------------------------------------------------
  if (window.XMLHttpRequest && window.XMLHttpRequest.prototype.open) {
    var originalOpen = window.XMLHttpRequest.prototype.open
    window.XMLHttpRequest.prototype.open = function (method, url) {
      var args = Array.prototype.slice.call(arguments)
      try {
        if (typeof url === 'string' && needsRewrite(url)) args[1] = proxied(url)
      } catch (error) {
        void error
      }
      return originalOpen.apply(this, args)
    }
  }

  // ---- EventSource --------------------------------------------------------
  if (window.EventSource) {
    var OriginalEventSource = window.EventSource
    var PatchedEventSource = function (url, config) {
      try {
        if (typeof url === 'string' && needsRewrite(url)) url = proxied(url)
      } catch (error) {
        void error
      }
      return new OriginalEventSource(url, config)
    }
    PatchedEventSource.prototype = OriginalEventSource.prototype
    window.EventSource = PatchedEventSource
  }

  // ---- WebSocket ----------------------------------------------------------
  // The harness only takes exact upgrade paths, so every socket funnels through
  // one relay with its real target in the query string.
  if (window.WebSocket) {
    var OriginalWebSocket = window.WebSocket
    var relayFor = function (url) {
      var absolute = toAbsolute(url)
      var target = ''
      if (absolute.indexOf(location.origin + withSlash) === 0) {
        var rest = absolute.slice((location.origin + withSlash).length)
        target = cfg.upstream.replace(/\/$/, '') + '/' + rest
      } else if (absolute.indexOf(cfg.upstream.replace(/\/$/, '') + '/') === 0 || needsRewrite(url)) {
        var parsed = new URL(absolute, location.href)
        var path = parsed.pathname + parsed.search
        target = cfg.upstream.replace(/\/$/, '') + (path.charAt(0) === '/' ? path : '/' + path)
      } else {
        return url
      }
      var scheme = location.protocol === 'https:' ? 'wss:' : 'ws:'
      return (
        scheme + '//' + location.host + cfg.relay + '?to=' + encodeURIComponent(cfg.enc) + '&path=' + encodeURIComponent(target)
      )
    }
    var PatchedWebSocket = function (url, protocols) {
      var finalUrl = url
      try {
        finalUrl = relayFor(url)
      } catch (error) {
        void error
      }
      return protocols === undefined ? new OriginalWebSocket(finalUrl) : new OriginalWebSocket(finalUrl, protocols)
    }
    PatchedWebSocket.prototype = OriginalWebSocket.prototype
    ;['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (key) {
      PatchedWebSocket[key] = OriginalWebSocket[key]
    })
    window.WebSocket = PatchedWebSocket
  }

  // ---- navigation reporting ----------------------------------------------
  function upstreamHref() {
    var href = location.href
    if (href.indexOf(PROXIED) !== 0) return href
    var rest = href.slice(PROXIED.length)
    return cfg.upstream.replace(/\/$/, '') + '/' + rest
  }

  function report() {
    try {
      window.parent.postMessage({ source: 'dsh-annotate-page', type: 'navigated', url: upstreamHref() }, '*')
    } catch (error) {
      void error
    }
  }

  try {
    // A router pushing '/settings' would otherwise move the document straight
    // out of the proxy (the harness root has no such page).
    var rewriteStateUrl = function (url) {
      if (typeof url !== 'string' || url.charAt(0) !== '/' || url.indexOf('//') === 0) return url
      if (url.indexOf(withSlash) === 0) return url
      return withSlash + url.slice(1)
    }
    var pushState = history.pushState
    history.pushState = function (state, title, url) {
      var result = pushState.call(this, state, title, rewriteStateUrl(url))
      report()
      return result
    }
    var replaceState = history.replaceState
    history.replaceState = function (state, title, url) {
      var result = replaceState.call(this, state, title, rewriteStateUrl(url))
      report()
      return result
    }
    window.addEventListener('popstate', report)
    window.addEventListener('hashchange', report)
    window.addEventListener('load', report)
  } catch (error) {
    void error
  }

  // A tiny surface the panel can poll if a message is missed.
  window.__dshAnnoState = function () {
    return { url: upstreamHref(), upstream: cfg.upstream }
  }
})();
