/**
 * Acceptance test for the zero-config path: a local web server that is running
 * (no base prefix, no configuration) must be discoverable, proxied onto the
 * harness origin, and behave like the real page — including the URL shapes the
 * shim exists for (location.origin-built fetch, absolute WebSocket).
 *
 *   node tests/proxy.mjs "http://127.0.0.1:3098/?token=..."
 */
import { loadPlaywright } from './playwright.mjs'

const { chromium } = await loadPlaywright()
const harness = process.argv[2]
if (!harness) {
  console.error('usage: node tests/proxy.mjs <harness-url-with-token>')
  process.exit(2)
}
const harnessOrigin = new URL(harness).origin
const upstream = process.argv[3] ?? 'http://127.0.0.1:5199'
const enc = Buffer.from(upstream, 'utf8').toString('base64url')
const proxied = `${harnessOrigin}/__dsh_anno/${enc}/`

const browser = await chromium.launch({ channel: 'chromium' })
const page = await browser.newPage()
await page.goto(harness, { waitUntil: 'domcontentloaded' })

const results = {}
results.discovery = await page.evaluate(async () => {
  const res = await fetch('/__dsh-annotate/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method: 'detect', args: {} }),
  })
  return res.json()
})

// Load the proxied page as a real document, with cookies in scope.
const frame = page
await frame.goto(proxied, { waitUntil: 'load' })
await frame.waitForTimeout(600)

results.page = await frame.evaluate(() => ({
  title: document.title,
  config: window.__DSH_ANNO__ ?? null,
  base: document.querySelector('base')?.getAttribute('href') ?? null,
  shimmed: typeof window.__dshAnnoState === 'function',
  stylesApplied: getComputedStyle(document.body).backgroundColor,
}))

// The shim's reason to exist #1: URLs built from location.origin.
results.originFetch = await frame.evaluate(async () => {
  try {
    const res = await fetch(location.origin + '/api/echo', { method: 'POST', body: 'origin-built' })
    return { status: res.status, body: await res.json() }
  } catch (error) {
    return { error: String(error.message || error) }
  }
})

// The shim's reason to exist #2: an absolute WebSocket to the real upstream.
results.socket = await frame.evaluate(
  (target) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: 'timeout' }), 5000)
      try {
        const ws = new WebSocket(target.replace(/^http/, 'ws') + '/ws')
        ws.onopen = () => ws.send('shimmed')
        ws.onmessage = (event) => {
          clearTimeout(timer)
          resolve({ echo: event.data })
        }
        ws.onerror = () => {
          clearTimeout(timer)
          resolve({ error: 'socket error' })
        }
      } catch (error) {
        clearTimeout(timer)
        resolve({ error: String(error.message || error) })
      }
    }),
  upstream
)

// Cookies from the app must survive the proxy, scoped to the target.
results.cookies = (await page.context().cookies(proxied)).map((cookie) => cookie.name)

console.log(JSON.stringify(results, null, 1))

const services = results.discovery?.services ?? []
const found = services.some((service) => service.port === Number(new URL(upstream).port))
const checks = {
  'discovery lists the running server': found,
  'proxied page loaded': results.page.title === 'Annotation fixture',
  'base + shim injected': Boolean(results.page.base) && results.page.shimmed,
  'location.origin fetch rewritten': results.originFetch.body?.echo === 'origin-built',
  'absolute WebSocket relayed': results.socket.echo === 'echo:shimmed',
}
let failed = 0
for (const [name, ok] of Object.entries(checks)) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
}
await browser.close()
process.exit(failed === 0 ? 0 : 1)
