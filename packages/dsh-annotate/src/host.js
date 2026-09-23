/**
 * dsh-annotate — Host half.
 *
 * Three jobs in service of one promise: open the sidebar, pick a local web
 * server that is already running, annotate it, send the comments.
 *
 *  1. `detect` — find loopback web servers that are really listening and
 *     answering, with their page titles, plus a hint on how to start one when
 *     nothing is up.
 *  2. A **loopback preview origin**: one ephemeral server per session/app, on
 *     `localhost` or `127.0.0.1` with a hostname different from the harness.
 *     The browser sees the app's own paths, so root-absolute scripts, styles and
 *     SPA routes work with no prefix, while the preview's DOM and web storage
 *     stay isolated from the harness. A shim and the overlay are injected into
 *     every HTML document, WebSocket upgrades are relayed per target, and
 *     cookies are namespaced and partitioned.
 *  3. Optional process control for people who prefer the plugin to start the
 *     server (`command` / `port` / `base`).
 *
 * The client reaches all of it at `POST /__dsh-annotate/api`.
 */

import http from 'node:http'
import https from 'node:https'
import { execFile } from 'node:child_process'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'

export const name = 'dsh-annotate'

export const inject = ['webServer', 'subprocess', 'timer']

const ROUTE = '/__dsh-annotate'
const DEFAULT_PORT = 5180
const DEFAULT_BASE = '/app'
const DEFAULT_COMMAND = 'npm run dev:panel'
const WS_RELAY_PATH = '/__dsh_anno_ws'
const LOG_LIMIT = 400
const PREVIEW_IDLE_MS = 5 * 60_000

/** Ports people actually run dev servers on, probed even when the OS tells us
 *  nothing (no lsof, locked-down container). */
const COMMON_PORTS = [5173, 3000, 4173, 5180, 8080, 8000, 5000, 5500, 9000, 3001, 1234, 4200, 4321, 5174, 6006, 7000, 8001, 8888]

/** COMMON_PORTS is a preference order, not a list of answers: anything absent
 *  from it ranks last and then by port number. */
const commonRank = (port) => {
  const index = COMMON_PORTS.indexOf(port)
  return index === -1 ? COMMON_PORTS.length : index
}

/** Where a built or hand-written page lives, relative to the session workspace,
 *  in the order they are offered. A static page needs no dev server at all. */
const STATIC_DIRS = ['', 'dist', 'build', 'out', 'public']
const STATIC_PAGE_LIMIT = 24
/** Bound on one static response, so a stray large file cannot be buffered into
 *  the proxy's memory. */
const STATIC_FILE_LIMIT = 64 * 1024 * 1024
const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}
const staticMime = (file) => STATIC_MIME[extname(file).toLowerCase()] || 'application/octet-stream'
const isHtmlFile = (file) => /\.html?$/i.test(file)

/** Both paths are absolute and already resolved, so a prefix test is exact. */
function insideRoot(target, root) {
  if (!target || !root) return false
  if (target === root) return true
  return target.startsWith(root.endsWith(sep) ? root : root + sep)
}

/** Dot segments are VCS metadata, environment files and editor state; none of
 *  them belong in a preview, and `..` fails this test too. */
const hasHiddenSegment = (pathname) => pathname.split('/').some((part) => part.startsWith('.'))

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
])

/** Headers that would stop a proxied page from being framed or injected. */
const UNFRAMEABLE = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
])

/** The page shim, shipped next to this file and inlined into every proxied
 *  HTML document. Loaded once; a missing file degrades to no shim. */
const SHIM_SRC = (() => {
  try {
    return readFileSync(new URL('./shim.js', import.meta.url), 'utf8')
  } catch (error) {
    console.warn('dsh-annotate: page shim unavailable —', String((error && error.message) || error))
    return ''
  }
})()

const OVERLAY_SRC = (() => {
  try {
    return readFileSync(new URL('./overlay.js', import.meta.url), 'utf8')
  } catch (error) {
    console.warn('dsh-annotate: overlay unavailable —', String((error && error.message) || error))
    return ''
  }
})()
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
function isLocalTarget(url) {
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

const encodeTarget = (origin) => Buffer.from(origin, 'utf8').toString('base64url')
const decodeTarget = (value) => Buffer.from(String(value), 'base64url').toString('utf8')

/** `127.0.0.1:3099` -> 3099, `[::1]:3099` -> 3099, `localhost` -> 0.
 *  `String(host).split(':')[1]` is wrong for bracketed IPv6 literals. */
function hostPort(host) {
  const text = String(host || '')
  const close = text.lastIndexOf(']')
  const colon = text.lastIndexOf(':')
  if (colon === -1 || (close !== -1 && colon < close)) return 0
  const value = Number(text.slice(colon + 1))
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 0
}

/** The origin the browser actually used for this request. Behind a
 *  TLS-terminating reverse proxy the socket is plain http, so an explicit
 *  forwarded scheme wins over the socket. */
function requestOrigin(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
  const scheme = forwarded === 'https' || forwarded === 'http' ? forwarded : req.socket.encrypted ? 'https' : 'http'
  return `${scheme}://${req.headers.host}`
}

const originOf = (value) => {
  try {
    return new URL(value).origin
  } catch (error) {
    void error
    return null
  }
}

/** A preview server must never become a readable gateway for an unrelated page.
 *  Chromium sends fetch metadata; Firefox and Safari send none, so fall back to
 *  the browser's own Origin/Referer. */
function allowedPreviewRequest(req, parentOrigin, previewOrigin) {
  const parents = [parentOrigin, previewOrigin]
  const fetchSite = req.headers['sec-fetch-site']
  const fetchDest = req.headers['sec-fetch-dest']
  if (fetchSite === 'cross-site' && fetchDest !== 'iframe') return false
  // A framed load can legitimately be cross-site (the harness may be on
  // 127.0.0.1 while the preview is on localhost), so it must name its parent.
  if (fetchDest === 'iframe' || fetchSite === 'cross-site') return parents.includes(originOf(req.headers.referer))
  if (fetchSite) return true
  // Browsers that send no fetch metadata still send Origin (for any readable
  // cross-origin request) or Referer. A page from anywhere else is rejected;
  // a request with no provenance at all is local tooling (curl, a test, a
  // health check), which cannot be told apart from a navigation and is allowed.
  const declared = originOf(req.headers.origin) || originOf(req.headers.referer)
  return declared === null || parents.includes(declared)
}

function normalizeBase(value) {
  const raw = String(value === undefined || value === null ? DEFAULT_BASE : value).trim()
  if (!raw || raw === '/') return '/'
  const withLead = raw.startsWith('/') ? raw : '/' + raw
  return withLead.endsWith('/') ? withLead : withLead + '/'
}

/** Process control is off unless a command is configured; when it is on, the
 *  only working directory accepted is an existing absolute directory. */
function existingDirectory(root) {
  if (typeof root !== 'string' || !root || !isAbsolute(root)) return null
  try {
    const real = realpathSync(root)
    return statSync(real).isDirectory() ? real : null
  } catch (error) {
    void error
    return null
  }
}

function resolveCommand(config) {
  if (Array.isArray(config.argv) && config.argv.length > 0) return config.argv.map(String)
  const text = String(config.command === undefined ? DEFAULT_COMMAND : config.command).trim()
  return text.split(/\s+/).filter(Boolean)
}

function readJson(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > limit) {
        reject(new Error('request too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function send(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

/** Run a one-shot command, never throwing. */
function run(file, args, timeout = 4000) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, encoding: 'utf8', maxBuffer: 4_000_000 }, (error, stdout) => {
      resolve(error && !stdout ? '' : String(stdout || ''))
    })
  })
}

/** Loopback TCP listeners, three ways, none of them required. When the tool
 *  knows the owning process, so does the caller: `pids` is what lets a service
 *  be claimed by the workspace it was started from. */
async function listeningPorts() {
  const ports = new Set()
  const pids = new Map()

  // Linux: /proc needs no process spawn, but names no owner either.
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    try {
      const text = await readFile(file, 'utf8')
      for (const line of text.split('\n').slice(1)) {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 4 || parts[3] !== '0A') continue // 0A = LISTEN
        const port = parseInt(parts[1].split(':')[1], 16)
        if (port > 0) ports.add(port)
      }
    } catch (error) {
      void error
    }
  }

  // macOS/BSD: lsof knows the addresses, so loopback-only is decidable, and it
  // is also the only source of the owning PID on either platform.
  const lsof = await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'])
  for (const line of lsof.split('\n')) {
    if (!/LISTEN/.test(line)) continue
    const match = line.match(/(?:127\.0\.0\.1|\*|\[::1\]|localhost):(\d+)/)
    if (!match) continue
    const port = Number(match[1])
    ports.add(port)
    const owner = Number(line.trim().split(/\s+/)[1])
    if (Number.isInteger(owner) && owner > 0) pids.set(port, owner)
  }

  // Anything else: netstat is ubiquitous.
  if (ports.size === 0) {
    const netstat = await run('netstat', ['-an'])
    for (const line of netstat.split('\n')) {
      if (!/LISTEN/.test(line)) continue
      const match = line.match(/[.:](\d+)\s/)
      if (match) ports.add(Number(match[1]))
    }
  }

  return { ports: [...ports].filter((value) => Number.isInteger(value) && value > 0 && value < 65536), pids }
}

function titleOf(html) {
  const match = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)
  return match ? match[1].replace(/\s+/g, ' ').trim() : ''
}

async function probePort(value, timeoutMs) {
  for (const hostname of ['127.0.0.1', '[::1]']) {
    try {
      const res = await fetch(`http://${hostname}:${value}/`, {
        redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'text/html,application/xhtml+xml' },
      })
      const type = String(res.headers.get('content-type') || '')
      if (res.status >= 400 || (type && !type.includes('html'))) { await res.body?.cancel(); continue }
      const html = type.includes('html') ? (await res.text()).slice(0, 120_000) : ''
      if (!type) await res.body?.cancel()
      return { port: value, url: `http://${hostname}:${value}/`, href: res.url,
        title: titleOf(html) || `${hostname}:${value}`, status: res.status }
    } catch { /* Try IPv6 when a dev server listens only on ::1. */ }
  }
  return null
}

/** Where each listening process was started. `/proc` answers without a spawn;
 *  lsof covers macOS and BSD. No answer only means the service cannot be
 *  claimed by a workspace — never that it is unusable. */
async function processCwds(pids) {
  const cwds = new Map()
  const rest = []
  for (const pid of pids) {
    try {
      cwds.set(pid, realpathSync(`/proc/${pid}/cwd`))
    } catch (error) {
      void error
      rest.push(pid)
    }
  }
  if (rest.length) {
    const text = await run('lsof', ['-a', '-p', rest.join(','), '-d', 'cwd', '-Fn'])
    let pid = 0
    for (const line of text.split('\n')) {
      if (line.startsWith('p')) pid = Number(line.slice(1))
      else if (line.startsWith('n') && pid) cwds.set(pid, line.slice(1))
    }
  }
  return cwds
}

/** Ports the workspace asks for itself — `--port 5180` in a script, `port:` in
 *  a Vite config. A hint only: the port still has to be listening to appear. */
async function declaredProjectPorts(root) {
  const declared = new Set()
  if (!root) return declared
  const sources = []
  try {
    sources.push(await readFile(join(root, 'package.json'), 'utf8'))
  } catch (error) {
    void error
  }
  for (const name of ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs', 'vite.config.cts', 'vite.config.cjs']) {
    try {
      sources.push(await readFile(join(root, name), 'utf8'))
    } catch (error) {
      void error
    }
  }
  for (const text of sources) {
    for (const [, value] of text.matchAll(/--port[=\s]+(\d{2,5})/g)) declared.add(Number(value))
    for (const [, value] of text.matchAll(/\bPORT\s*[:=]\s*['"]?(\d{2,5})/g)) declared.add(Number(value))
    for (const [, value] of text.matchAll(/\bport\s*:\s*(\d{2,5})/g)) declared.add(Number(value))
  }
  return declared
}

/** HTML pages the workspace already contains, so a project that needs no server
 *  — or whose server is not running — can still be annotated. */
async function staticCandidates(root) {
  const pages = []
  if (!root) return pages
  const seen = new Set()
  for (const dir of STATIC_DIRS) {
    const base = dir ? join(root, dir) : root
    let entries
    try {
      entries = await readdir(base, { withFileTypes: true })
    } catch (error) {
      void error
      continue
    }
    const names = entries.filter((entry) => entry.isFile() && isHtmlFile(entry.name)).map((entry) => entry.name)
    names.sort((a, b) => (a.toLowerCase() === 'index.html' ? 0 : 1) - (b.toLowerCase() === 'index.html' ? 0 : 1) || a.localeCompare(b))
    for (const name of names) {
      if (pages.length >= STATIC_PAGE_LIMIT) return pages
      let real
      try {
        real = await realpath(join(base, name))
      } catch (error) {
        void error
        continue
      }
      if (seen.has(real)) continue
      seen.add(real)
      pages.push({ rel: dir ? `${dir}/${name}` : name, path: real })
    }
  }
  return pages
}

/** The file a static request resolves to: inside the root, a regular file, and
 *  never a directory. Symlinks are resolved before the containment test. */
async function existingFile(file, root) {
  let real
  try {
    real = await realpath(file)
  } catch (error) {
    void error
    return null
  }
  if (!insideRoot(real, root)) return null
  try {
    const info = await stat(real)
    if (!info.isFile()) return null
    return { path: real, size: info.size }
  } catch (error) {
    void error
    return null
  }
}

/** Read-only file server for one directory: the loopback origin a static page
 *  needs before the preview proxy can read and inject into it. */
async function serveStatic(req, res, root) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
  } catch (error) {
    void error
    res.writeHead(400)
    res.end()
    return
  }
  if (hasHiddenSegment(pathname)) {
    res.writeHead(403)
    res.end()
    return
  }
  const requested = resolve(root, '.' + (pathname.charAt(0) === '/' ? pathname : '/' + pathname))
  if (!insideRoot(requested, root)) {
    res.writeHead(403)
    res.end()
    return
  }
  // The file itself, then a directory's index, then — for a client-side route
  // with no extension — the root page, which is what keeps an SPA navigable.
  let target = await existingFile(requested, root)
  if (!target) target = await existingFile(join(requested, 'index.html'), root)
  if (!target && !extname(pathname) && String(req.headers.accept || '').includes('html')) {
    target = await existingFile(join(root, 'index.html'), root)
  }
  if (!target) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  if (target.size > STATIC_FILE_LIMIT) {
    res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('file too large for a preview')
    return
  }
  res.writeHead(200, {
    'content-type': staticMime(target.path),
    'content-length': String(target.size),
    'cache-control': 'no-store',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  res.end(await readFile(target.path))
}

/** A `file://` target is previewable only when it is an HTML file inside the
 *  session workspace: nothing outside it may be read, and only a page can be
 *  annotated. */
function resolveFileTarget(raw, root) {
  let url
  try {
    url = new URL(String(raw))
  } catch (error) {
    void error
    return { code: 'notLocalTarget' }
  }
  if (url.protocol !== 'file:' || url.host) return { code: 'notLocalTarget' }
  let path
  try {
    path = realpathSync(decodeURIComponent(url.pathname))
  } catch (error) {
    void error
    return { code: 'staticUnavailable' }
  }
  if (!insideRoot(path, root)) return { code: 'notAllowedFile' }
  let info
  try {
    info = statSync(path)
  } catch (error) {
    void error
    return { code: 'staticUnavailable' }
  }
  if (!info.isFile()) return { code: 'staticUnavailable' }
  if (!isHtmlFile(path)) return { code: 'notHtmlFile' }
  return { dir: dirname(path), name: basename(path) }
}

/** How to start something, read from the session workspace. */
async function startupHint(root) {
  if (!root) return null
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts ? Object.keys(pkg.scripts) : []
    const wanted = ['dev', 'start', 'dev:panel', 'serve', 'preview']
    const picked = wanted.filter((name) => scripts.includes(name))
    if (picked.length === 0) return { runner: null, commands: [] }
    let runner = 'npm'
    let build = (name) => (name === 'start' ? 'npm start' : `npm run ${name}`)
    for (const [file, name, make] of [
      ['pnpm-lock.yaml', 'pnpm', (s) => (s === 'dev' ? 'pnpm dev' : s === 'start' ? 'pnpm start' : `pnpm run ${s}`)],
      ['yarn.lock', 'yarn', (s) => `yarn ${s}`],
      ['bun.lockb', 'bun', (s) => `bun run ${s}`],
      ['bun.lock', 'bun', (s) => `bun run ${s}`],
    ]) {
      try {
        await readFile(join(root, file))
        runner = name
        build = make
        break
      } catch (error) {
        void error
      }
    }
    return { runner, commands: picked.map((name) => ({ script: name, command: build(name) })) }
  } catch (error) {
    void error
    return null
  }
}

export function apply(ctx, config = {}) {
  // ---- optional process control (off unless configured) --------------------
  const configuredCommand = config.command !== undefined || Array.isArray(config.argv)
  const port = Number(config.port) || DEFAULT_PORT
  const base = normalizeBase(config.base)
  const argv = resolveCommand(config)
  const command = argv.join(' ')
  const previewUrl = `http://127.0.0.1:${port}${base}`
  const readyTimeoutMs = Number(config.readyTimeoutMs) || 45_000
  const runs = new Map()

  // ---- proxy ---------------------------------------------------------------
  const probeTimeoutMs = Number(config.detect?.probeTimeoutMs) || 900
  const detectCacheMs = Number(config.detect?.cacheMs) || 2000
  const extraPorts = Array.isArray(config.detect?.extraPorts) ? config.detect.extraPorts.map(Number) : []
  const staticPorts = config.detect?.staticPorts === false ? [] : COMMON_PORTS
  const staticFiles = config.detect?.staticFiles !== false
  const detections = new Map()
  const previews = new Map()
  const previewActivity = new Map()
  const staticServers = new Map()
  let disposed = false

  const closeUnusedStatic = (dir) => {
    if (!dir || [...previewActivity.values()].some((entry) => entry.dir === dir)) return
    const promise = staticServers.get(dir)
    staticServers.delete(dir)
    if (promise) void promise.then((entry) => entry.close()).catch(() => {})
  }
  const closePreview = (key) => {
    const promise = previews.get(key)
    const activity = previewActivity.get(key)
    previews.delete(key)
    previewActivity.delete(key)
    if (promise) void promise.then((entry) => entry.close()).catch(() => {})
    closeUnusedStatic(activity?.dir)
  }
  const reapPreviews = () => {
    const now = Date.now()
    for (const [key, activity] of previewActivity) {
      for (const [lease, until] of activity.leases) {
        if (until <= now) activity.leases.delete(lease)
      }
      if (!activity.leases.size && now - activity.at >= PREVIEW_IDLE_MS) closePreview(key)
    }
  }
  ctx.effect(() => {
    const timer = setInterval(reapPreviews, 30_000)
    timer.unref?.()
    return () => {
      disposed = true
      clearInterval(timer)
      for (const key of previews.keys()) closePreview(key)
      for (const dir of staticServers.keys()) closeUnusedStatic(dir)
    }
  })

  /** One read-only file server per directory, started the first time a page in
   *  it is previewed. It exists so a static file has a loopback origin for the
   *  proxy to read: an iframe cannot be injected through `file://`. */
  const staticServer = async (dir) => {
    let promise = staticServers.get(dir)
    if (!promise) {
      promise = (async () => {
        const server = http.createServer((req, res) => {
          // Only the exact address this server bound may read it, so a
          // DNS-rebinding page cannot reach the workspace through this origin.
          if (req.headers.host !== `127.0.0.1:${server.address().port}`) { res.writeHead(403); res.end(); return }
          void serveStatic(req, res, dir).catch((error) => {
            void error
            try { res.destroy() } catch (inner) { void inner }
          })
        })
        const sockets = new Set()
        server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
        const entry = { origin: `http://127.0.0.1:${server.address().port}`, close() { for (const socket of sockets) socket.destroy(); server.close() } }
        if (disposed) entry.close()
        return entry
      })()
      staticServers.set(dir, promise)
      promise.catch(() => { if (staticServers.get(dir) === promise) staticServers.delete(dir) })
    }
    return promise
  }

  const entryFor = (sid) => {
    const key = sid || '__root__'
    let entry = runs.get(key)
    if (!entry) {
      entry = { sid: key, handle: null, log: [], offsetOut: 0, offsetErr: 0, exited: true, exitCode: null, root: null, starting: false }
      runs.set(key, entry)
    }
    return entry
  }

  const drain = (entry) => {
    if (!entry.handle) return
    try {
      const out = entry.handle.collected.stdout
      const err = entry.handle.collected.stderr
      if (out) {
        const read = out.readFrom(entry.offsetOut)
        entry.offsetOut = read.nextOffset
        if (read.text) entry.log.push(...read.text.split(/\r?\n/).filter((line) => line.trim() !== ''))
      }
      if (err) {
        const read = err.readFrom(entry.offsetErr)
        entry.offsetErr = read.nextOffset
        if (read.text) entry.log.push(...read.text.split(/\r?\n/).filter((line) => line.trim() !== ''))
      }
      if (entry.log.length > LOG_LIMIT) entry.log.splice(0, entry.log.length - LOG_LIMIT)
    } catch (error) {
      void error
    }
  }

  const reachable = async (url) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
      return res.status > 0
    } catch (error) {
      return false
    }
  }

  const start = async (sid, root) => {
    const entry = entryFor(sid)
    if (entry.handle && !entry.exited) return { ok: true, running: true, url: previewUrl, base, port, command }
    if (!configuredCommand) return { ok: false, code: 'noCommand', error: 'no start command configured' }
    if (!root) return { ok: false, code: 'noRoot', error: 'workspace directory unknown' }
    if (entry.starting) return { ok: false, code: 'starting', error: 'a service is already starting for this workspace' }
    if (await reachable(previewUrl)) {
      return { ok: false, code: 'portBusy', error: 'that port is already in use and does not belong to this workspace' }
    }
    entry.root = root
    entry.log = []
    entry.offsetOut = 0
    entry.offsetErr = 0
    entry.exited = false
    entry.exitCode = null
    entry.starting = true
    try {
      entry.handle = ctx.subprocess.spawn({
        argv,
        cwd: root,
        stdio: { stdin: 'ignore', stdout: { maxBytes: 4_000_000 }, stderr: { maxBytes: 4_000_000 } },
        graceMs: 8000,
      })
    } catch (error) {
      entry.exited = true
      entry.starting = false
      return { ok: false, code: 'startFailed', detail: { error: String((error && error.message) || error) }, error: String((error && error.message) || error) }
    }
    entry.handle.done
      .then((out) => {
        entry.exited = true
        entry.exitCode = out && typeof out.exitCode === 'number' ? out.exitCode : null
      })
      .catch(() => {
        entry.exited = true
        entry.exitCode = null
      })

    const deadline = Date.now() + readyTimeoutMs
    while (Date.now() < deadline) {
      drain(entry)
      if (await reachable(previewUrl)) {
        entry.starting = false
        return { ok: true, running: true, url: previewUrl, base, port, command, log: entry.log.slice(-40) }
      }
      if (entry.exited) {
        entry.starting = false
        return { ok: false, code: 'exited', detail: { code: entry.exitCode === null ? '?' : entry.exitCode }, error: 'dev server exited', log: entry.log.slice(-40) }
      }
      await new Promise((resolve) => setTimeout(resolve, 700))
    }
    entry.starting = false
    entry.handle?.terminate()
    entry.exited = true
    return { ok: false, code: 'readyTimeout', detail: { seconds: Math.round(readyTimeoutMs / 1000) }, error: 'timed out waiting for the dev server', log: entry.log.slice(-40) }
  }

  const stop = (sid) => {
    const entry = entryFor(sid)
    if (!entry.handle || entry.exited) return { ok: true, running: false }
    try {
      entry.handle.terminate()
    } catch (error) {
      void error
    }
    entry.exited = true
    entry.handle = null
    entry.log.push('· stopped')
    return { ok: true, running: false }
  }

  const detect = async (sid, args, req) => {
    const key = sid || '__root__'
    const cached = detections.get(key)
    if (!args?.force && cached && Date.now() - cached.at < detectCacheMs) return cached.value

    const root = existingDirectory(args && args.root)
    const selfPort = hostPort(req.headers.host)
    const previewPorts = new Set((await Promise.all([...previews.values()])).map((entry) => Number(new URL(entry.origin).port)))
    for (const entry of await Promise.all(staticServers.values())) previewPorts.add(Number(new URL(entry.origin).port))
    const { ports: found, pids } = await listeningPorts()
    const declared = await declaredProjectPorts(root)
    const cwds = await processCwds([...new Set(pids.values())])
    // A service belongs to the workspace when the process listening on it was
    // started inside that workspace.
    const owned = new Set([...pids].filter(([, pid]) => insideRoot(cwds.get(pid), root)).map(([port]) => port))
    const candidates = [...new Set([...found, ...extraPorts, ...staticPorts])]
      .filter((value) => Number.isInteger(value) && value > 0 && value < 65536 && value !== selfPort && !previewPorts.has(value))
      .sort((a, b) => commonRank(a) - commonRank(b) || a - b)

    const probed = []
    for (let i = 0; i < candidates.length; i += 16) {
      probed.push(...await Promise.all(candidates.slice(i, i + 16).map((value) => probePort(value, probeTimeoutMs))))
    }
    // The workspace's own services first, then the ports it asks for, then the
    // common-port preference: one list, in the order people want to see it.
    const services = probed.filter(Boolean)
      .map((service) => ({ ...service, project: owned.has(service.port), declared: declared.has(service.port) }))
      .sort((a, b) => Number(b.project) - Number(a.project) || Number(b.declared) - Number(a.declared) || commonRank(a.port) - commonRank(b.port) || a.port - b.port)
    const value = {
      ok: true,
      services,
      files: staticFiles ? await staticCandidates(root) : [],
      hint: await startupHint(root),
      scanned: candidates.length,
      at: Date.now(),
    }
    detections.set(key, { at: Date.now(), value })
    return value
  }

  const handler = async (req, res) => {
    if (req.headers.origin && req.headers.origin !== requestOrigin(req)) { send(res, 403, { ok: false, code: 'originNotAllowed', error: 'origin not allowed' }); return }
    if (req.method !== 'POST') {
      send(res, 405, { ok: false, code: 'methodNotAllowed', error: 'method not allowed' })
      return
    }
    try {
      const body = await readJson(req)
      const method = body && body.method
      const args = (body && body.args) || {}
      const sid = args.sid
      if (disposed) return send(res, 503, { ok: false, error: 'plugin is shutting down' })
      const entry = entryFor(sid)
      drain(entry)
      if (method === 'state') {
        return send(res, 200, {
          ok: true,
          running: Boolean(entry.handle && !entry.exited),
          starting: entry.starting,
          url: previewUrl,
          base,
          command: configuredCommand ? command : null,
          autoStart: configuredCommand,
          root: entry.root,
          port,
          log: entry.log.slice(-60),
          exitCode: entry.exitCode,
        })
      }
      if (method === 'preview') {
        reapPreviews()
        const raw = String(args.url || '')
        let target
        let suffix
        let dir = null
        let fileRoot = null
        if (/^file:/i.test(raw)) {
          const resolved = resolveFileTarget(raw, existingDirectory(args.root))
          if (resolved.code) return send(res, 400, { ok: false, code: resolved.code, error: 'that file cannot be previewed' })
          const server = await staticServer(resolved.dir)
          dir = resolved.dir
          // The page's own directory is the static root, so its relative scripts
          // and styles resolve exactly as they do on disk.
          target = new URL(server.origin + '/')
          const fileUrl = new URL(raw)
          fileRoot = new URL('.', fileUrl).href
          suffix = '/' + encodeURIComponent(resolved.name) + fileUrl.search + fileUrl.hash
        } else {
          try { target = new URL(raw) } catch (error) { void error; target = null }
          if (!target || !isLocalTarget(target) || Number(target.port) === hostPort(req.headers.host)) return send(res, 400, { ok: false, code: 'notLocalTarget', error: 'local development services only; Harness itself cannot be previewed' })
          suffix = target.pathname + target.search + target.hash
        }
        const parentOrigin = requestOrigin(req)
        const key = String(sid) + ':' + parentOrigin + ':' + target.origin + ':' + (fileRoot || '')
        if (!previews.has(key)) {
          if (previews.size >= 24) {
            closeUnusedStatic(dir)
            return send(res, 429, { ok: false, code: 'tooManyPreviews', error: 'too many active previews; close another preview and retry' })
          }
          const activity = { at: Date.now(), leases: new Map(), dir, sid }
          previewActivity.set(key, activity)
          const promise = createPreview(target, String(sid || ''), parentOrigin, fileRoot, () => { activity.at = Date.now() })
          previews.set(key, promise)
          promise.catch(() => { if (previews.get(key) === promise) closePreview(key) })
        }
        const activity = previewActivity.get(key)
        activity.at = Date.now()
        if (typeof args.lease === 'string' && args.lease) activity.leases.set(args.lease, Date.now() + PREVIEW_IDLE_MS)
        const entry = await previews.get(key)
        if (disposed) { entry.close(); return send(res, 503, { ok: false, error: 'plugin is shutting down' }) }
        return send(res, 200, { ok: true, url: entry.origin + suffix, origin: entry.origin })
      }
      if (method === 'retainPreview' || method === 'releasePreview') {
        for (const [key, promise] of previews) {
          const activity = previewActivity.get(key)
          if (activity?.sid !== sid || !activity.leases.has(args.lease)) continue
          const preview = await promise
          if (previews.get(key) !== promise || !activity.leases.has(args.lease)) continue
          if (preview.origin !== args.origin) continue
          if (method === 'releasePreview') {
            activity.leases.delete(args.lease)
            if (!activity.leases.size) closePreview(key)
          } else {
            activity.at = Date.now()
            activity.leases.set(args.lease, Date.now() + PREVIEW_IDLE_MS)
          }
          return send(res, 200, { ok: true })
        }
        return send(res, 200, { ok: method === 'releasePreview' })
      }
      if (method === 'detect') return send(res, 200, await detect(sid, args, req))
      if (method === 'start') return send(res, 200, await start(sid, existingDirectory(args.root)))
      if (method === 'stop') return send(res, 200, stop(sid))
      return send(res, 200, { ok: false, error: 'unknown method: ' + String(method) })
    } catch (error) {
      return send(res, 500, { ok: false, error: String((error && error.message) || error) })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler }))
  ctx.effect(() => () => {
    for (const entry of runs.values()) {
      if (entry.handle && !entry.exited) {
        try {
          entry.handle.terminate()
        } catch (error) {
          void error
        }
      }
    }
  })
  ctx.logger?.('dsh-annotate')?.info?.(
    `dsh-annotate: loopback preview origins on demand, ws relay at ${WS_RELAY_PATH}, api ${ROUTE}`
  )
}

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

const cookiePrefix = (enc) => `anno_${enc}_`

/** Cookies the browser holds for the harness must never reach the proxied app,
 *  and the app's own cookies must not escape into the harness. */
function splitCookies(header, enc) {
  const prefix = cookiePrefix(enc)
  const forwarded = []
  for (const part of String(header || '').split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    const name = eq === -1 ? '' : trimmed.slice(0, eq)
    if (!name || !name.startsWith(prefix)) continue
    forwarded.push(`${name.slice(prefix.length)}=${trimmed.slice(eq + 1)}`)
  }
  return forwarded.join('; ')
}

/** Namespace the app's cookies and re-scope them to the preview origin.
 *  The preview is plain http on loopback, so `SameSite=None` requires `Secure`
 *  and, in Chromium, partitioned storage. */
function rewriteSetCookie(value, enc, target) {
  const prefix = cookiePrefix(enc)
  const parts = String(value).split(';').map((part) => part.trim())
  const first = parts[0]
  const eq = first.indexOf('=')
  const name = eq === -1 ? first : first.slice(0, eq)
  const payload = eq === -1 ? '' : first.slice(eq + 1)
  const out = [`${prefix}${name}=${payload}`]
  let cookiePath = '/'
  for (const attribute of parts.slice(1)) {
    const lower = attribute.toLowerCase()
    if (lower.startsWith('domain=')) continue
    if (lower.startsWith('path=')) { cookiePath = attribute.slice(5).startsWith('/') ? attribute.slice(5) : '/'; continue }
    if (lower.startsWith('samesite=') || lower === 'secure' || lower === 'partitioned') continue
    out.push(attribute)
  }
  out.push(`Path=${cookiePath}`)
  out.push('SameSite=None', 'Secure', 'Partitioned')
  return out.join('; ')
}

/**
 * The preview server serves the app at its own paths, so no document URL needs
 * rewriting and no import map is needed. Injecting a second import map would in
 * fact be harmful: a document may only have one, and ours would win over the
 * app's. Only the annotation config, the shim and the overlay are added.
 */
function injectIntoHtml(html, config) {
  const head =
    `<script>window.__DSH_ANNO__=${JSON.stringify(config).replace(/</g, '\\u003c')};</script>` +
    `<script>${SHIM_SRC}</script>` +
    (config.isolated ? `<script>${OVERLAY_SRC}</script>` : '')
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (match) => match + head)
    : /<html[^>]*>/i.test(html)
      ? html.replace(/<html[^>]*>/i, (match) => match + head)
      : head + html
}

function proxyHttp(req, res, preview) {
  const incoming = new URL(req.url, 'http://localhost')
  const { target, enc, tail, search } = {
    target: preview.target,
    enc: encodeTarget(preview.target.origin),
    tail: incoming.pathname,
    search: incoming.search,
  }
  const origin = target.origin

  const headers = {}
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase()
    if (lower === 'host' || HOP_BY_HOP.has(lower)) continue
    if (lower === 'accept-encoding') continue // keep bodies readable for rewriting
    if (lower === 'cookie') {
      const forwarded = splitCookies(value, enc)
      if (forwarded) headers.cookie = forwarded
      continue
    }
    if (lower === 'origin') {
      headers.origin = origin
      continue
    }
    if (lower === 'referer') {
      // The preview keeps the app's own paths, so only the origin changes.
      try { const ref = new URL(value); headers.referer = origin + ref.pathname + ref.search } catch (error) { void error }
      continue
    }
    headers[key] = value
  }
  headers.host = target.host
  headers['accept-encoding'] = 'identity'

  const upstream = (target.protocol === 'https:' ? https : http).request(
    {
      protocol: target.protocol,
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: tail + search,
      headers,
    },
    (upstreamRes) => {
      const type = String(upstreamRes.headers['content-type'] || '')
      const out = {}
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        const lower = key.toLowerCase()
        if (HOP_BY_HOP.has(lower)) continue
        if (UNFRAMEABLE.has(lower)) continue
        if (lower === 'content-length' || lower === 'content-encoding') continue
        if (lower === 'set-cookie') {
          out['set-cookie'] = (Array.isArray(value) ? value : [value]).map((one) => rewriteSetCookie(one, enc, target))
          continue
        }
        if (lower === 'location' && typeof value === 'string') {
          // An absolute upstream redirect must stay on the preview origin or
          // the next document will lose the shim and annotation overlay.
          try {
            const destination = new URL(value, origin + tail + search)
            out.location = destination.origin === origin
              ? destination.pathname + destination.search + destination.hash
              : value
          } catch { out.location = value }
          continue
        }
        out[key] = value
      }

      if (!type.includes('text/html')) {
        res.writeHead(upstreamRes.statusCode ?? 502, out)
        upstreamRes.pipe(res)
        return
      }

      // HTML: inject config, shim and overlay before any app script runs.
      const chunks = []
      upstreamRes.on('data', (chunk) => chunks.push(chunk))
      upstreamRes.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8')
        const body = Buffer.from(
          injectIntoHtml(html, { upstream: origin, page: preview.fileRoot ? new URL('.' + tail + search, preview.fileRoot).href : null, fileRoot: preview.fileRoot, prefix: '/', relay: WS_RELAY_PATH, enc, isolated: true, parentOrigin: preview.parentOrigin, session: preview.sid }),
          'utf8'
        )
        out['content-length'] = String(body.length)
        res.writeHead(upstreamRes.statusCode ?? 200, out)
        res.end(body)
      })
      upstreamRes.on('error', () => res.end())
    }
  )

  upstream.setTimeout(15000, () => upstream.destroy(new Error('connection timed out')))
  upstream.on('error', (error) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' })
    res.end(
      `<body style="font:12px ui-monospace,SFMono-Regular,Menlo,monospace;padding:20px;color:#666">${escapeHtml(error.message)}` +
      `<script>parent.postMessage({source:'dsh-annotate-page',type:'error',code:'upstreamUnreachable'},${JSON.stringify(preview.parentOrigin)})</script></body>`
    )
  })
  res.on('close', () => {
    if (!res.writableEnded) upstream.destroy()
  })
  req.pipe(upstream)
}

function proxyUpgrade(req, socket, head) {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const enc = url.searchParams.get('to') || ''
  const targetPath = url.searchParams.get('path') || '/'
  let target
  try {
    target = new URL(decodeTarget(enc))
    if (!isLocalTarget(target)) throw new Error('local targets only')
  } catch (error) {
    void error
    socket.destroy()
    return
  }

  const headers = {}
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase()
    if (lower === 'host' || lower === 'authorization' || HOP_BY_HOP.has(lower)) continue
    if (lower === 'cookie') {
      const forwarded = splitCookies(value, enc)
      if (forwarded) headers.cookie = forwarded
      continue
    }
    if (lower === 'origin') {
      headers.origin = target.origin
      continue
    }
    headers[key] = value
  }
  headers.host = target.host
  headers.connection = 'Upgrade'
  headers.upgrade = 'websocket'

  const upstream = (target.protocol === 'https:' ? https : http).request({
    protocol: target.protocol,
    hostname: target.hostname.replace(/^\[|\]$/g, ''),
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: targetPath.startsWith('/') ? targetPath : new URL(targetPath).pathname + new URL(targetPath).search,
    headers,
  })
  upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
    const lines = [`HTTP/1.1 ${upstreamRes.statusCode ?? 101} ${upstreamRes.statusMessage ?? 'Switching Protocols'}`]
    for (const [key, value] of Object.entries(upstreamRes.headers)) {
      if (HOP_BY_HOP.has(key.toLowerCase())) continue
      if (Array.isArray(value)) for (const one of value) lines.push(`${key}: ${one}`)
      else lines.push(`${key}: ${value}`)
    }
    lines.push('connection: Upgrade')
    socket.write(lines.join('\r\n') + '\r\n\r\n')
    if (upstreamHead && upstreamHead.length) socket.write(upstreamHead)
    if (head && head.length) upstreamSocket.write(head)
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
    const lines = [`HTTP/1.1 ${upstreamRes.statusCode ?? 400} ${upstreamRes.statusMessage ?? 'Bad Request'}`]
    for (const [key, value] of Object.entries(upstreamRes.headers)) lines.push(`${key}: ${value}`)
    socket.write(lines.join('\r\n') + '\r\n\r\n')
    socket.destroy()
  })
  upstream.on('error', () => socket.destroy())
  upstream.end()
}

/** A dedicated loopback origin preserves app paths and separates app DOM and
 * storage from Harness. Nothing outside loopback may be used as an upstream.
 * Servers are keyed by session + app and disposed with the plugin. */
async function createPreview(target, sid, parentOrigin, fileRoot, touch) {
  const hostname = new URL(parentOrigin).hostname === 'localhost' ? '127.0.0.1' : 'localhost'
  // A directory can contain several pages; derive each document's identity
  // from its own path instead of caching the first file opened in this session.
  const preview = { target: new URL(target.origin), sid, parentOrigin, fileRoot }
  const originOfPreview = () => `http://${hostname}:${server.address().port}`
  const server = http.createServer((req, res) => {
    // Only the preview's own hostname is served, so a DNS-rebinding page cannot
    // reach the app through this origin.
    if (req.headers.host !== `${hostname}:${server.address().port}`) { res.writeHead(403); res.end(); return }
    if (!allowedPreviewRequest(req, parentOrigin, originOfPreview())) { res.writeHead(403); res.end(); return }
    touch()
    proxyHttp(req, res, preview)
  })
  const sockets = new Set()
  server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
  server.on('upgrade', (req, socket, head) => {
    if (req.headers.origin !== originOfPreview()) { socket.destroy(); return }
    touch()
    const path = req.url
    req.url = WS_RELAY_PATH + '?to=' + encodeTarget(target.origin) + '&path=' + encodeURIComponent(path)
    proxyUpgrade(req, socket, head)
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, hostname, resolve) })
  return { server, origin: `http://${hostname}:${server.address().port}`, close() { for (const socket of sockets) socket.destroy(); server.close() } }
}
