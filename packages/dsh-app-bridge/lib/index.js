/**
 * dsh-app-bridge — Host half.
 *
 * Reverse-proxies a local dev server (Vite / Next / anything HTTP) onto the
 * harness origin under a path prefix, including WebSocket upgrades.
 *
 * Why this exists: annotating elements inside an iframe preview requires the
 * previewed document to be Same-Origin with the harness page — the DOM of a
 * cross-origin frame is unreadable, no matter which overlay you inject. A dev
 * server on another port (`localhost:5173`) is therefore un-annotatable, while
 * `http://127.0.0.1:<harness-port>/app/` is not. This bridge is what makes a
 * dev server Same-Origin.
 *
 * Paired with the dev server running under the same prefix
 * (`vite --base=/app/`), so every asset, HMR socket and API path stays inside
 * the bridge and never collides with the harness' own `/api/*` surface.
 */

import http from 'node:http'

export const name = 'dsh-app-bridge'

export const inject = ['webServer']

/** Hop-by-hop headers must not be forwarded (RFC 7230 §6.1). */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
])

function buildHeaders(headers, authority, keepUpgradeHeaders) {
  const out = {}
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase()
    if (lower === 'host') continue
    if (!keepUpgradeHeaders && HOP_BY_HOP.has(lower)) continue
    out[key] = value
  }
  // The upstream dev server resolves its own vhost/routing from Host.
  out.host = authority
  return out
}

function buildResponseHeaders(headers) {
  const out = {}
  for (const [key, value] of Object.entries(headers)) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue
    if (value === undefined) continue
    out[key] = value
  }
  return out
}

function writeHeadLines(statusCode, statusMessage, headers) {
  const lines = [`HTTP/1.1 ${statusCode} ${statusMessage ?? ''}`.trimEnd()]
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) for (const one of value) lines.push(`${key}: ${one}`)
    else lines.push(`${key}: ${value}`)
  }
  return lines.join('\r\n') + '\r\n\r\n'
}

/**
 * The harness' web server hands the route handler the request URL verbatim
 * (no prefix stripping), while other hosts may strip it. Forwarding blindly
 * with `prefix + url` therefore doubles the prefix on the first convention and
 * silently falls back to the dev server's SPA fallback — pages "load" while
 * every asset and API call 404s. Accept both.
 */
function upstreamPath(prefix, url) {
  const path = typeof url === "string" && url.startsWith("/") ? url : `/${url ?? ""}`
  return path === prefix || path.startsWith(`${prefix}/`) ? path : prefix + path
}

function normalizePrefix(value) {
  const trimmed = String(value ?? '/app').replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}` : '/app'
}

export function apply(ctx, config = {}) {
  const target = new URL(config.target ?? 'http://127.0.0.1:5173')
  const prefix = normalizePrefix(config.prefix)
  const authority = target.host
  // A base-prefixed dev server puts its HMR socket on `<base>/` (Vite derives
  // the socket path from `base`), and the webServer API only takes exact
  // upgrade paths, so both spellings are registered.
  const wsPaths = Array.isArray(config.wsPaths) && config.wsPaths.length > 0
    ? config.wsPaths
    : [`${prefix}/`, prefix]

  const logger = ctx.logger?.('app-bridge')
  const log = (message) => logger?.info?.(message)

  const proxyHttp = (req, res) => {
    const upstream = http.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 80,
        method: req.method,
        path: upstreamPath(prefix, req.url),
        headers: buildHeaders(req.headers, authority, false),
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, buildResponseHeaders(upstreamRes.headers))
        // Piped, never buffered: the app streams SSE, and buffering would hold
        // an answer until it finished.
        upstreamRes.pipe(res)
      }
    )
    upstream.on('error', (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      }
      res.end(`app-bridge: ${target.href} unreachable (${error.message})`)
    })
    res.on('close', () => {
      if (!res.writableEnded) upstream.destroy()
    })
    req.pipe(upstream)
  }

  const proxyUpgrade = (req, socket, head) => {
    const upstream = http.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 80,
      method: req.method,
      path: upstreamPath(prefix, req.url),
      headers: buildHeaders(req.headers, authority, true),
    })
    upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
      socket.write(
        writeHeadLines(
          upstreamRes.statusCode ?? 101,
          upstreamRes.statusMessage ?? 'Switching Protocols',
          upstreamRes.headers
        )
      )
      // Bytes each side already read after its handshake belong to the other.
      if (upstreamHead?.length) socket.write(upstreamHead)
      if (head?.length) upstreamSocket.write(head)
      upstreamSocket.pipe(socket)
      socket.pipe(upstreamSocket)
      const close = () => {
        upstreamSocket.destroy()
        socket.destroy()
      }
      upstreamSocket.on('error', close)
      upstreamSocket.on('close', close)
      socket.on('error', close)
      socket.on('close', close)
    })
    upstream.on('response', (upstreamRes) => {
      // The dev server refused the upgrade; relay the refusal verbatim.
      socket.write(
        writeHeadLines(
          upstreamRes.statusCode ?? 400,
          upstreamRes.statusMessage ?? 'Bad Request',
          upstreamRes.headers
        )
      )
      socket.destroy()
    })
    upstream.on('error', () => socket.destroy())
    upstream.end()
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: prefix, handler: proxyHttp }))
  for (const path of wsPaths) {
    ctx.effect(() => ctx.webServer.registerUpgrade({ path, handler: proxyUpgrade }))
  }
  log?.(`proxying ${target.href} at ${prefix}/ (ws: ${wsPaths.join(', ')})`)
}
