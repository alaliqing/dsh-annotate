/**
 * dsh-annotate — Host half.
 *
 * Runs the previewed project's dev server so the reader never starts it by
 * hand, and reports readiness plus a tail of its log. The client reaches this
 * half through `POST /__dsh-annotate/api`.
 *
 * Everything project-specific is configuration: `command`/`argv` (default
 * `npm run dev:panel`), `port` (5180) and `base` (`/app`). The matching
 * `dsh-app-bridge` mount must use the same port and prefix.
 *
 * Screenshots were deliberately dropped: an annotation already carries the
 * selector, its match count, semantic anchors, the component chain, computed
 * styles and its viewport placement, which identifies the element without a
 * second render that may not match what the reader saw.
 */

export const name = 'dsh-annotate'

export const inject = ['webServer', 'subprocess', 'timer']

const ROUTE = '/__dsh-annotate'
const DEFAULT_PORT = 5180
const DEFAULT_BASE = '/app'
const DEFAULT_COMMAND = 'npm run dev:panel'
const LOG_LIMIT = 400

/** `/app` -> `/app/`, `` -> `/`; the preview URL and the dev server's base must
 *  agree or the app's own asset URLs escape the prefix. */
function normalizeBase(value) {
  const raw = String(value === undefined || value === null ? DEFAULT_BASE : value).trim()
  if (!raw || raw === '/') return '/'
  const withLead = raw.startsWith('/') ? raw : '/' + raw
  return withLead.endsWith('/') ? withLead : withLead + '/'
}

/** Dev-server command: an explicit `argv` wins, otherwise a whitespace-split
 *  `command` string (so profiles can say `node /path/server.mjs --port 5199`). */
function resolveCommand(config) {
  if (Array.isArray(config.argv) && config.argv.length > 0) return config.argv.map(String)
  const text = String(config.command === undefined ? DEFAULT_COMMAND : config.command).trim()
  return text.split(/\s+/).filter(Boolean)
}

/** Playwright driver, run inside the workspace so its own install resolves. */

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
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

export function apply(ctx, config = {}) {
  const port = Number(config.port) || DEFAULT_PORT
  const base = normalizeBase(config.base)
  const argv = resolveCommand(config)
  const command = argv.join(' ')
  const previewUrl = `http://127.0.0.1:${port}${base}`
  const readyTimeoutMs = Number(config.readyTimeoutMs) || 45_000
  const runs = new Map()

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

  const reachable = async () => {
    try {
      const res = await fetch(previewUrl, { method: 'GET', signal: AbortSignal.timeout(1500) })
      return res.status > 0
    } catch (error) {
      return false
    }
  }

  const start = async (sid, root) => {
    const entry = entryFor(sid)
    if (entry.handle && !entry.exited) return { ok: true, running: true, url: previewUrl, base, port, command }
    if (!root) return { ok: false, error: '不知道工作区目录，无法启动 dev server' }
    // A dev server may already be listening (started earlier, or left over from
    // a previous harness run): adopt it instead of fighting over the port.
    if (await reachable()) {
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
        argv: argv,
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

    // Wait until the port answers, so the client can point its iframe there.
    const deadline = Date.now() + readyTimeoutMs
    while (Date.now() < deadline) {
      drain(entry)
      if (await reachable()) {
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
          command,
          root: entry.root,
          port,
          log: entry.log.slice(-60),
          exitCode: entry.exitCode,
        })
      }
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
    `dsh-annotate: ${command} -> ${previewUrl} (control at ${ROUTE})`
  )
}
