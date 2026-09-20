/**
 * Pins must stay attached to their element for BOTH kinds of scrolling:
 * an inner container (what app shells usually do) and the window.
 *
 *   node tests/pins-scroll.mjs "http://127.0.0.1:3092/?token=..." [port]
 */
import { loadPlaywright } from './playwright.mjs'

const { chromium } = await loadPlaywright()
const harness = process.argv[2]
const wantPort = Number(process.argv[3] ?? 5199)
const SHORT = { timeout: 5000 }

const browser = await chromium.launch({ channel: 'chromium' })
const page = await browser.newPage({ viewport: { width: 1600, height: 940 } })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto(harness, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
await page.getByRole('button', { name: 'New Session' }).first().click(SHORT).catch(() => {})
await page.waitForTimeout(1000)
await page.locator('text=/New Session/').last().click({ ...SHORT, force: true }).catch(() => {})
await page.waitForTimeout(1200)
await page.keyboard.press('Meta+Shift+KeyB')
for (let i = 0; i < 25 && !(await page.locator('iframe.dsa-frame').count()); i++) {
  const row = page.locator('.dsa-svc', { hasText: `:${wantPort}` })
  if (await row.count()) await row.click().catch(() => {})
  await page.waitForTimeout(700)
}
const frame = page.frameLocator('iframe.dsa-frame')
const pf = () => page.frames().find((f) => /\/__dsh_anno\//.test(f.url()))
for (let i = 0; i < 20 && !(await frame.locator('#question').count()); i++) await page.waitForTimeout(700)

const marker = page.locator('.dsa-ico[title^="标记模式"]')
await marker.click(SHORT)
await page.waitForTimeout(300)
// annotate a paragraph inside the inner scroll region
const inner = frame.locator('.scroller p').first()
await inner.click({ force: true, timeout: 5000 })
await page.waitForTimeout(400)
await frame.locator('.dsa-card textarea').first().click({ force: true }).catch(() => {})
await page.keyboard.type('内部滚动测试', { delay: 2 })
await page.keyboard.press('Enter')
await page.waitForTimeout(500)

const probe = () =>
  pf().evaluate(() => {
    const pin = document.querySelector('.dsa-pin')
    const target = document.querySelector('.scroller p')
    if (!pin || !target) return null
    return {
      pinTop: Math.round(pin.getBoundingClientRect().top),
      elTop: Math.round(target.getBoundingClientRect().top),
      gap: Math.round(pin.getBoundingClientRect().top - target.getBoundingClientRect().top),
      innerScroll: Math.round(document.querySelector('.scroller').scrollTop),
      windowScroll: Math.round(window.scrollY),
    }
  })

const before = await probe()
// 1. inner container scroll
await pf().evaluate(() => {
  document.querySelector('.scroller').scrollTop += 40
})
await page.waitForTimeout(500)
const afterInner = await probe()
console.log('inner scroll :', JSON.stringify({ before, after: afterInner }))
console.log('   element moved', before.elTop - afterInner.elTop, '| pin moved', before.pinTop - afterInner.pinTop, '| gap drift', Math.abs(before.gap - afterInner.gap))

// 2. window scroll (regression)
await pf().evaluate(() => window.scrollBy(0, 200))
await page.waitForTimeout(500)
const afterWindow = await probe()
console.log('window scroll:', JSON.stringify(afterWindow))
console.log('   element moved', afterInner.elTop - afterWindow.elTop, '| pin moved', afterInner.pinTop - afterWindow.pinTop, '| gap drift', Math.abs(afterInner.gap - afterWindow.gap))
const okInner = Math.abs(before.gap - afterInner.gap) <= 3
const okWindow = Math.abs(afterInner.gap - afterWindow.gap) <= 3
console.log('verdict:', okInner && okWindow ? 'pin stays attached in both cases' : `STILL OFF (inner ${okInner}, window ${okWindow})`)
await page.screenshot({ path: 'tests/shots/pins-scroll.png' })
await browser.close()
