/**
 * Fixture dev server: the project the annotation plugin previews while you work
 * on the plugin itself.
 *
 * Deliberately dependency-free, and prefix-aware so it can also exercise
 * `dsh-app-bridge` (`--base /app/`). The default preview path does not need the
 * prefix: it serves the app at its own paths on an isolated loopback origin.
 * The server behaves like a real dev server (streaming, POSTs, revalidation,
 * a nested scroll container, an SPA route) so the plugin is exercised for real.
 *
 *   node server.mjs --port 5180 --base /app/
 */
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}
const port = Number(arg('port', process.env.PORT || 5180))
const base = (() => {
  const raw = String(arg('base', process.env.BASE || '/')).trim()
  if (!raw || raw === '/') return '/'
  const withLead = raw.startsWith('/') ? raw : `/${raw}`
  return withLead.endsWith('/') ? withLead : `${withLead}/`
})()

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
}

const json = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
  let path = url.pathname

  // A real dev server serves its own assets under the base; anything outside it
  // is a 404, which is how you notice a wrong base before blaming the overlay.
  if (base !== '/') {
    if (!path.startsWith(base)) return json(res, 404, { error: 'outside base', base })
    path = path.slice(base.length - 1)
  }

  if (path === '/api/echo' && req.method === 'POST') {
    let body = ''
    for await (const chunk of req) body += chunk
    return json(res, 200, { ok: true, received: body.length, echo: body.slice(0, 200) })
  }

  if (path === '/api/stream') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    })
    let n = 0
    const timer = setInterval(() => {
      n += 1
      res.write(`data: tick ${n}\n\n`)
      if (n >= 60) {
        clearInterval(timer)
        res.end()
      }
    }, 500)
    req.on('close', () => clearInterval(timer))
    return undefined
  }

  const relative = path === '/' || path === '' ? 'index.html' : path.replace(/^\/+/, '')
  const root = join(here, 'public')
  const target = join(root, normalize(relative).replace(/^(\.\.[/\\])+/, ''))
  try {
    // Resolve symlinks before the containment check: a link inside public/ must
    // not escape the root, which a plain prefix test cannot see.
    const realRoot = realpathSync(root)
    const real = realpathSync(target)
    if (real !== join(realRoot, 'index.html') && !real.startsWith(realRoot + sep)) {
      return json(res, 403, { error: 'forbidden' })
    }
    const body = await readFile(real)
    res.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(body)
  } catch {
    json(res, 404, { error: 'not found', path: relative })
  }
  return undefined
})

// A WebSocket echo endpoint: dev servers live on their HMR socket, so the proxy
// has to carry an upgrade for real. Dependency-free handshake on purpose.
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key']
  if (!key || !String(req.url).startsWith(`${base === '/' ? '/' : base}ws`)) {
    socket.destroy()
    return
  }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  )
  // Minimal text-frame echo: one frame in, one frame out.
  socket.on('data', (buffer) => {
    const length = buffer[1] & 0x7f
    const masked = (buffer[1] & 0x80) !== 0
    let offset = 2
    let payload = buffer.slice(offset, offset + length)
    if (masked) {
      const mask = buffer.slice(offset, offset + 4)
      offset += 4
      payload = buffer.slice(offset, offset + length)
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]
    }
    const body = Buffer.from(`echo:${payload.toString('utf8')}`, 'utf8')
    const frame = Buffer.concat([Buffer.from([0x81, body.length]), body])
    socket.write(frame)
  })
  socket.on('error', () => socket.destroy())
})

server.listen(port, '127.0.0.1', () => {
  console.log(`fixture dev server: http://127.0.0.1:${port}${base} (base ${base})`)
})
