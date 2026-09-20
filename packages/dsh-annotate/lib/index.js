/**
 * dsh-annotate — Host half.
 *
 * Three jobs in service of one promise: open the sidebar, pick a local web
 * server that is already running, annotate it, send the comments.
 *
 *  1. `detect` — find loopback web servers that are really listening and
 *     answering, with their page titles, plus a hint on how to start one when
 *     nothing is up.
 *  2. A **dynamic loopback proxy** at `<prefix>/<encoded target>/…` so the
 *     picked page becomes Same-Origin with the harness and its DOM is readable
 *     (a cross-origin iframe can never be annotated). HTML gets a `<base>` and a
 *     small shim, upgrades go through one exact relay path, cookies are scoped
 *     per target.
 *  3. Optional process control for people who prefer the plugin to start the
 *     server (`command` / `port` / `base`).
 *
 * The client reaches all of it at `POST /__dsh-annotate/api`.
 */

import http from 'node:http'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const name = 'dsh-annotate'

export const inject = ['webServer', 'subprocess', 'timer']

const ROUTE = '/__dsh-annotate'
const DEFAULT_PORT = 5180
const DEFAULT_BASE = '/app'
const DEFAULT_COMMAND = 'npm run dev:panel'
const DEFAULT_PROXY_PREFIX = '/__dsh_anno'
const WS_RELAY_PATH = '/__dsh_anno_ws'
const LOG_LIMIT = 400

/** Ports people actually run dev servers on, probed even when the OS tells us
 *  nothing (no lsof, locked-down container). */
const COMMON_PORTS = [5173, 3000, 4173, 5180, 8080, 8000, 5000, 5500, 9000, 3001, 1234, 4200, 4321, 5174, 6006, 7000, 8001, 8888]

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

const encodeTarget = (origin) => Buffer.from(origin, 'utf8').toString('base64url')
const decodeTarget = (value) => Buffer.from(String(value), 'base64url').toString('utf8')

function normalizeBase(value) {
  const raw = String(value === undefined || value === null ? DEFAULT_BASE : value).trim()
  if (!raw || raw === '/') return '/'
  const withLead = raw.startsWith('/') ? raw : '/' + raw
  return withLead.endsWith('/') ? withLead : withLead + '/'
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

/** Loopback TCP listeners, three ways, none of them required. */
async function listeningPorts() {
  const ports = new Set()

  // Linux: /proc needs no process spawn.
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

  // macOS/BSD: lsof knows the addresses, so loopback-only is decidable.
  const lsof = await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'])
  for (const line of lsof.split('\n')) {
    if (!/LISTEN/.test(line)) continue
    const match = line.match(/(?:127\.0\.0\.1|\*|\[::1\]|localhost):(\d+)/)
    if (match) ports.add(Number(match[1]))
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

  return [...ports].filter((value) => Number.isInteger(value) && value > 0 && value < 65536)
}

function titleOf(html) {
  const match = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)
  return match ? match[1].replace(/\s+/g, ' ').trim() : ''
}

async function probePort(value, timeoutMs) {
  try {
    const res = await fetch(`http://127.0.0.1:${value}/`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'text/html,application/xhtml+xml' },
    })
    const type = String(res.headers.get('content-type') || '')
    if (res.status >= 400) return null
    if (type && !type.includes('html')) return null
    const html = type.includes('html') ? (await res.text()).slice(0, 120_000) : ''
    return {
      port: value,
      url: `http://127.0.0.1:${value}/`,
      href: res.url,
      title: titleOf(html) || `127.0.0.1:${value}`,
      status: res.status,
    }
  } catch (error) {
    void error
    return null
  }
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
  const proxyPrefix = String(config.proxyPrefix || DEFAULT_PROXY_PREFIX).replace(/\/+$/, '')
  const probeTimeoutMs = Number(config.detect?.probeTimeoutMs) || 900
  const detectCacheMs = Number(config.detect?.cacheMs) || 2000
  const extraPorts = Array.isArray(config.detect?.extraPorts) ? config.detect.extraPorts.map(Number) : []
  const staticPorts = config.detect?.staticPorts === false ? [] : COMMON_PORTS
  const detections = new Map()

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: proxyPrefix,
      handler: (req, res) => proxyHttp(req, res, proxyPrefix),
    })
  )
  ctx.effect(() => ctx.webServer.registerUpgrade({ path: WS_RELAY_PATH, handler: proxyUpgrade }))

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
    if (!configuredCommand) return { ok: false, error: '未配置启动命令（可选功能）' }
    if (!root) return { ok: false, error: '不知道工作区目录，无法启动 dev server' }
    // A dev server may already be listening: adopt it instead of fighting over
    // the port.
    if (await reachable(previewUrl)) {
      entry.root = root
      entry.handle = null
      entry.exited = false
      entry.starting = false
      entry.log.push('· 复用已在运行的 dev server（' + previewUrl + '）')
      return { ok: true, running: true, url: previewUrl, base, port, command, adopted: true, log: entry.log.slice(-20) }
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
      return { ok: false, error: '启动失败: ' + String((error && error.message) || error) }
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
        return { ok: false, error: 'dev server 退出（' + (entry.exitCode === null ? '?' : entry.exitCode) + '）', log: entry.log.slice(-40) }
      }
      await new Promise((resolve) => setTimeout(resolve, 700))
    }
    entry.starting = false
    return { ok: false, error: '等待 dev server 就绪超时（' + Math.round(readyTimeoutMs / 1000) + 's）', log: entry.log.slice(-40) }
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
    entry.log.push('· 已停止')
    return { ok: true, running: false }
  }

  const detect = async (sid, args, req) => {
    const key = sid || '__root__'
    const cached = detections.get(key)
    if (cached && Date.now() - cached.at < detectCacheMs) return cached.value

    const selfPort = Number(String(req.headers.host || '').split(':')[1]) || 0
    const found = await listeningPorts()
    const candidates = [...new Set([...found, ...extraPorts, ...staticPorts])]
      .filter((value) => value !== selfPort && value !== port)
      .sort((a, b) => {
        const ai = COMMON_PORTS.indexOf(a)
        const bi = COMMON_PORTS.indexOf(b)
        if (ai === -1 && bi === -1) return a - b
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })

    const probed = await Promise.all(candidates.slice(0, 24).map((value) => probePort(value, probeTimeoutMs)))
    const value = {
      ok: true,
      services: probed.filter(Boolean),
      hint: await startupHint(args && args.root),
      scanned: candidates.length,
      at: Date.now(),
    }
    detections.set(key, { at: Date.now(), value })
    return value
  }

  const handler = async (req, res) => {
    if (req.method !== 'POST') {
      send(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    try {
      const body = await readJson(req)
      const method = body && body.method
      const args = (body && body.args) || {}
      const sid = args.sid
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
          proxyPrefix,
          root: entry.root,
          port,
          log: entry.log.slice(-60),
          exitCode: entry.exitCode,
        })
      }
      if (method === 'detect') return send(res, 200, await detect(sid, args, req))
      if (method === 'start') return send(res, 200, await start(sid, args.root))
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
    `dsh-annotate: loopback proxy at ${proxyPrefix}/<target>, ws relay at ${WS_RELAY_PATH}, api ${ROUTE}`
  )
}

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

/** `/__dsh_anno/<enc>/<rest>?<search>` -> parts, or null when it is not ours. */
function parseProxyPath(proxyPrefix, url) {
  const raw = typeof url === 'string' && url.startsWith('/') ? url : `/${url || ''}`
  const query = raw.indexOf('?')
  const pathname = query === -1 ? raw : raw.slice(0, query)
  const search = query === -1 ? '' : raw.slice(query)
  if (!pathname.startsWith(proxyPrefix + '/')) return null
  const rest = pathname.slice(proxyPrefix.length + 1)
  const slash = rest.indexOf('/')
  const enc = slash === -1 ? rest : rest.slice(0, slash)
  const tail = slash === -1 ? '/' : rest.slice(slash)
  let target
  try {
    target = new URL(decodeTarget(enc))
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return null
  } catch (error) {
    void error
    return null
  }
  return { target, enc, tail, search, prefix: `${proxyPrefix}/${enc}` }
}

const cookiePrefix = (enc) => `anno_${String(enc).slice(0, 10)}_`

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

function rewriteSetCookie(value, enc, target) {
  const prefix = cookiePrefix(enc)
  const parts = String(value).split(';').map((part) => part.trim())
  const first = parts[0]
  const eq = first.indexOf('=')
  const name = eq === -1 ? first : first.slice(0, eq)
  const payload = eq === -1 ? '' : first.slice(eq + 1)
  const out = [`${prefix}${name}=${payload}`]
  for (const attribute of parts.slice(1)) {
    const lower = attribute.toLowerCase()
    if (lower.startsWith('domain=')) continue
    if (lower.startsWith('path=')) continue
    // The proxy is plain http on loopback: a Secure cookie would be dropped.
    if (lower === 'secure' && target.protocol === 'http:') continue
    out.push(attribute)
  }
  out.push(`Path=/__dsh_anno/${enc}/`)
  return out.join('; ')
}

function rewriteLocation(value, target, prefix) {
  if (!value) return value
  if (value.startsWith('/')) return prefix + value
  try {
    const parsed = new URL(value, target.origin)
    if (parsed.origin === target.origin) return prefix + parsed.pathname + parsed.search + parsed.hash
  } catch (error) {
    void error
  }
  return value
}

/**
 * Root-absolute URLs (`/src/main.tsx`, `/@vite/client`) are the reason a
 * `<base>` is not enough: URL parsing of an absolute path replaces the whole
 * path, so the base's own path never applies. Dev servers emit these
 * everywhere, so the HTML's static URLs are rewritten here, and an import map
 * (below) covers the module graph that no rewriting can reach.
 */
function rewriteRootUrls(html, prefix) {
  const ATTR = /(\s(?:src|href|action|formaction|poster|data-src)\s*=\s*)(["'])(\/[^"'\s>]*)\2/gi
  return html.replace(ATTR, (match, lead, quote, value) => {
    if (value.startsWith('//') || value.startsWith(prefix)) return match
    return `${lead}${quote}${prefix}${value.slice(1)}${quote}`
  })
}

/** Prefix keys for every top-level path the document uses, so `import` and
 *  dynamic `import()` resolve inside the proxy too. */
function importMapFor(html, prefix) {
  // Dev servers reference these from inside modules, where no HTML rewriting
  // can reach them.
  const imports = {
    '/node_modules/': `${prefix}node_modules/`,
    '/@fs/': `${prefix}@fs/`,
    '/@vite/': `${prefix}@vite/`,
    '/@react-refresh': `${prefix}@react-refresh`,
  }
  const seen = /(?:src|href)\s*=\s*["'](\/[^"'\s>]*)["']/gi
  let match
  while ((match = seen.exec(html))) {
    const path = match[1]
    if (path.startsWith('//')) continue
    const segment = path.slice(1).split('/')[0]
    if (!segment) continue
    if (path.slice(1).includes('/')) imports[`/${segment}/`] = `${prefix}${segment}/`
    else imports[`/${segment}`] = `${prefix}${segment}`
  }
  const key = 'imports'
  const payload = { [key]: imports }
  return `<script type="importmap">${JSON.stringify(payload)}</script>`
}

function injectIntoHtml(html, config) {
  const prefix = config.prefix
  // Read the original document first: after rewriting, every URL is already
  // prefixed and the import map would end up mapping the prefix onto itself.
  const importMap = importMapFor(html, prefix)
  const rewritten = rewriteRootUrls(html, prefix)
  // The import map has to be in place before the first module script runs.
  const head =
    `<script>window.__DSH_ANNO__=${JSON.stringify(config)};</script>` +
    importMap +
    `<script>${SHIM_SRC}</script>`
  const withHead = /<head[^>]*>/i.test(rewritten)
    ? rewritten.replace(/<head[^>]*>/i, (match) => match + head)
    : /<html[^>]*>/i.test(rewritten)
      ? rewritten.replace(/<html[^>]*>/i, (match) => match + head)
      : head + rewritten
  return withHead
}

function proxyHttp(req, res, proxyPrefix) {
  const parsed = parseProxyPath(proxyPrefix, req.url)
  if (!parsed) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('dsh-annotate: malformed proxy path')
    return
  }
  const { target, enc, tail, search, prefix } = parsed
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
      headers.referer = origin + String(value).replace(prefix, '')
      continue
    }
    headers[key] = value
  }
  headers.host = target.host
  headers['accept-encoding'] = 'identity'

  const upstream = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
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
          out.location = rewriteLocation(value, target, prefix)
          continue
        }
        out[key] = value
      }

      if (!type.includes('text/html')) {
        res.writeHead(upstreamRes.statusCode ?? 502, out)
        upstreamRes.pipe(res)
        return
      }

      // HTML: give it a base and the shim before any app script runs.
      const chunks = []
      upstreamRes.on('data', (chunk) => chunks.push(chunk))
      upstreamRes.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8')
        const body = Buffer.from(
          injectIntoHtml(html, { upstream: origin, prefix: `${prefix}/`, relay: WS_RELAY_PATH, enc }),
          'utf8'
        )
        out['content-length'] = String(body.length)
        res.writeHead(upstreamRes.statusCode ?? 200, out)
        res.end(body)
      })
      upstreamRes.on('error', () => res.end())
    }
  )

  upstream.on('error', (error) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' })
    res.end(
      `<body style="font:14px system-ui;padding:24px;color:#666"><h3>无法连接 ${origin}</h3><p>${error.message}</p></body>`
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
  } catch (error) {
    void error
    socket.destroy()
    return
  }

  const headers = {}
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase()
    if (lower === 'host' || HOP_BY_HOP.has(lower)) continue
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

  const upstream = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: targetPath,
    headers,
  })
  upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
    const lines = [`HTTP/1.1 ${upstreamRes.statusCode ?? 101} ${upstreamRes.statusMessage ?? 'Switching Protocols'}`]
    for (const [key, value] of Object.entries(upstreamRes.headers)) {
      if (HOP_BY_HOP.has(key.toLowerCase())) continue
      if (Array.isArray(value)) for (const one of value) lines.push(`${key}: ${one}`)
      else lines.push(`${key}: ${value}`)
    }
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
