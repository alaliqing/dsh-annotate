/**
 * Fixture dev server: the project the annotation plugin previews while you work
 * on the plugin itself.
 *
 * Deliberately dependency-free and prefix-aware, because the two things the
 * bridge + overlay care about are exactly those: everything must live under one
 * base prefix, and the server must behave like a real dev server (streaming,
 * POSTs, revalidation) so the bridge is exercised for real.
 *
 *   node server.mjs --port 5180 --base /app/
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
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
  const target = join(here, 'public', normalize(relative).replace(/^(\.\.[/\\])+/, ''))
  if (!target.startsWith(join(here, 'public') + sep) && target !== join(here, 'public', 'index.html')) {
    return json(res, 403, { error: 'forbidden' })
  }
  try {
    const body = await readFile(target)
    res.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(body)
  } catch {
    json(res, 404, { error: 'not found', path: relative })
  }
  return undefined
})

server.listen(port, '127.0.0.1', () => {
  console.log(`fixture dev server: http://127.0.0.1:${port}${base} (base ${base})`)
})
