import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mock } from 'node:test'
import { apply } from '../packages/dsh-annotate/lib/index.js'

const routes = [], dispose = []
apply({
  effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') dispose.push(cleanup) },
  webServer: { register(route) { routes.push(route) } }, timer: {}, subprocess: {},
}, { detect: { staticPorts: false } })
let upstream
const app = http.createServer((req, res) => {
  const url = new URL(req.url, upstream)
  if (url.pathname === '/redirect') {
    res.writeHead(302, { location: url.searchParams.get('to') })
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end('<html><head><title>Preview tests</title></head><body>Destination</body></html>')
})
const host = http.createServer((req, res) => routes[0].handler(req, res))
const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const configOf = (html) => JSON.parse(html.match(/window\.__DSH_ANNO__=(.*?);<\/script>/)[1])
const closed = (url) => assert.rejects(fetch(url, { signal: AbortSignal.timeout(2000) }))
const pass = (text) => console.log('PASS', text)
let workspace
try {
  await listen(app)
  await listen(host)
  upstream = `http://127.0.0.1:${app.address().port}`
  const origin = `http://127.0.0.1:${host.address().port}`
  const api = async (method, args = {}) => {
    const response = await fetch(origin + '/__dsh-annotate/api', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, args }),
    })
    return { status: response.status, ...await response.json() }
  }
  const release = (preview, sid, lease) => api('releasePreview', { sid, origin: preview.origin, lease })
  workspace = await mkdtemp(join(tmpdir(), 'anno-preview-'))
  for (const name of ['index.html', 'other page.html']) {
    await writeFile(join(workspace, name), `<html><head></head><body>${name}</body></html>`)
  }
  const firstUrl = pathToFileURL(join(workspace, 'index.html')).href
  const secondUrl = pathToFileURL(join(workspace, 'other page.html')).href
  const [first, second] = await Promise.all([
    api('preview', { sid: 'files', root: workspace, url: firstUrl, lease: 'first' }),
    api('preview', { sid: 'files', root: workspace, url: secondUrl + '?view=2#/details', lease: 'second' }),
  ])
  assert.equal(first.origin, second.origin)
  assert.equal(new URL(second.url).search, '?view=2')
  assert.equal(new URL(second.url).hash, '#/details')
  const html = await (await fetch(second.url)).text()
  const config = configOf(html)
  assert.equal(config.page, secondUrl + '?view=2')
  assert(html.includes('<body>other page.html</body>'))
  pass('concurrent static pages keep their own file identity, query and hash')
  const discovery = await api('detect', { sid: 'files', root: workspace, force: true })
  assert(!discovery.services.some((service) => service.url === config.upstream + '/'))
  pass('internal static servers are excluded from discovery')
  await release(first, 'files', 'first')
  assert.equal((await fetch(second.url)).status, 200)
  await release(second, 'files', 'second')
  await closed(second.url)
  await closed(config.upstream)
  pass('the final lease closes both the preview and its unused static server')

  const redirects = await api('preview', { sid: 'redirects', url: upstream, lease: 'redirects' })
  for (const target of [upstream + '/destination?q=1#end', '//' + new URL(upstream).host + '/destination', '/destination', './destination']) {
    const url = redirects.origin + '/redirect?to=' + encodeURIComponent(target)
    const response = await fetch(url, { redirect: 'manual' })
    const location = response.headers.get('location')
    assert.equal(new URL(location, redirects.origin).origin, redirects.origin)
    const followed = await fetch(url)
    assert.equal(new URL(followed.url).origin, redirects.origin)
    assert((await followed.text()).includes('window.__DSH_ANNO__'))
  }
  const external = 'https://example.com/login'
  const response = await fetch(redirects.origin + '/redirect?to=' + encodeURIComponent(external), { redirect: 'manual' })
  assert.equal(response.headers.get('location'), external)
  await release(redirects, 'redirects', 'redirects')
  pass('same-upstream redirects retain the injected preview; external redirects stay explicit')

  const shared = await api('preview', { sid: 'shared', url: upstream, lease: 'window-a' })
  const otherWindow = await api('preview', { sid: 'shared', url: upstream, lease: 'window-b' })
  assert.equal(shared.origin, otherWindow.origin)
  await release(shared, 'wrong-session', 'window-a')
  await release(shared, 'shared', 'unknown-lease')
  await release(shared, 'shared', 'window-a')
  assert.equal((await fetch(otherWindow.url)).status, 200)
  assert.equal((await api('retainPreview', { sid: 'shared', origin: shared.origin, lease: 'window-b' })).ok, true)
  await release(otherWindow, 'shared', 'window-b')
  await closed(shared.url)
  pass('closing one window or an invalid lease cannot close another window’s preview')

  for (let i = 0; i < 30; i++) {
    const preview = await api('preview', { sid: `session-${i}`, url: upstream, lease: 'panel' })
    assert.equal(preview.ok, true)
    await release(preview, `session-${i}`, 'panel')
  }
  pass('more than 24 sequential sessions work without restarting the plugin')
  const active = []
  for (let i = 0; i < 24; i++) active.push(await api('preview', { sid: `active-${i}`, url: upstream, lease: 'panel' }))
  assert(active.every((preview) => preview.ok))
  assert.equal((await api('preview', { sid: 'overflow', url: upstream, lease: 'panel' })).status, 429)
  assert.equal((await fetch(active[0].url)).status, 200)
  await release(active.pop(), 'active-23', 'panel')
  const replacement = await api('preview', { sid: 'replacement', url: upstream, lease: 'panel' })
  assert.equal(replacement.ok, true)
  await release(replacement, 'replacement', 'panel')
  await Promise.all(active.map((preview, i) => release(preview, `active-${i}`, 'panel')))
  pass('the active limit protects open previews and recovers as soon as one closes')

  const abandoned = await api('preview', { sid: 'abandoned', url: upstream, lease: 'crashed-window' })
  const renewed = await api('preview', { sid: 'renewed', url: upstream, lease: 'open-window' })
  const realNow = Date.now.bind(Date)
  let elapsed = 4 * 60_000
  mock.method(Date, 'now', () => realNow() + elapsed)
  assert.equal((await api('retainPreview', { sid: 'renewed', origin: renewed.origin, lease: 'open-window' })).ok, true)
  const live = await api('preview', { sid: 'live', url: upstream, lease: 'live-window' })
  elapsed = 6 * 60_000
  const next = await api('preview', { sid: 'next', url: upstream, lease: 'next-window' })
  await closed(abandoned.url)
  assert.equal((await fetch(live.url)).status, 200)
  assert.equal((await fetch(renewed.url)).status, 200)
  await release(renewed, 'renewed', 'open-window')
  await release(live, 'live', 'live-window')
  await release(next, 'next', 'next-window')
  mock.restoreAll()
  pass('expired crashed-window leases are reclaimed without evicting live windows')
} finally {
  mock.restoreAll()
  dispose.forEach((cleanup) => cleanup())
  for (const server of [host, app]) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  if (workspace) await rm(workspace, { recursive: true, force: true })
}
