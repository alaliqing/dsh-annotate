/**
 * The four interaction fixes:
 *   1. no style editor anywhere in the card
 *   2. after saving an annotation the hover frame keeps tracking elements
 *   3. pins stay attached to their element when the page scrolls
 *   4. annotations live in a collapsible corner card, not a bottom row
 *
 *   node tests/pins-hover.mjs "http://127.0.0.1:3095/?token=..." [port]
 */
import { loadPlaywright } from './playwright.mjs'

const { chromium } = await loadPlaywright()
const harness = process.argv[2]
const wantPort = Number(process.argv[3] ?? 5199)
const SHORT = { timeout: 5000 }

const browser = await chromium.launch({ channel: 'chromium' })
const page = await browser.newPage({ viewport: { width: 1600, height: 940 }, deviceScaleFactor: 2 })
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
const previewFrame = () => page.frames().find((f) => /\/__dsh_anno\//.test(f.url()))
for (let i = 0; i < 20 && !(await frame.locator('#question').count()); i++) await page.waitForTimeout(700)

const marker = page.locator('.dsa-ico[title^="标记模式"]')
const annotate = async (selector, text) => {
  if ((await marker.getAttribute('data-on')) !== 'true') await marker.click(SHORT)
  await page.waitForTimeout(250)
  await frame.locator(selector).first().click({ force: true, timeout: 5000 })
  await page.waitForTimeout(400)
  await frame.locator('.dsa-card textarea').first().click({ force: true, timeout: 5000 }).catch(() => {})
  await page.keyboard.type(text, { delay: 2 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
}

// 1 + 2: first annotation, then hover must still track
await annotate('#question', '第一条批注')
const cardStyleBits = await frame.locator('[data-act="styles"], .dsa-styles').count()
const modeAfterSave = await marker.getAttribute('data-on')
// hover the second element without clicking
await frame.locator('.card h2').first().hover({ force: true, timeout: 5000 }).catch(() => {})
await page.waitForTimeout(400)
const hoverState = await previewFrame().evaluate(() => {
  const el = document.querySelector('.dsa-frame')
  return el ? { display: getComputedStyle(el).display, state: el.getAttribute('data-state') } : null
})
console.log('1) style editor removed:', cardStyleBits === 0 ? 'yes' : `NO (${cardStyleBits} bits)`)
console.log('2) after save: marker on =', modeAfterSave, '| hover frame =', JSON.stringify(hoverState))

await annotate('.card h2', '第二条批注')
console.log('2b) second annotation accepted:', await page.locator('.dsa-ovhead b').innerText().catch(() => '?'))

// 3: pins follow their element when the page scrolls
const before = await previewFrame().evaluate(() => {
  const pin = document.querySelector('.dsa-pin')
  return { pinTop: Math.round(pin.getBoundingClientRect().top), scrollY: Math.round(window.scrollY) }
})
await previewFrame().evaluate(() => window.scrollBy(0, 220))
await page.waitForTimeout(600)
const after = await previewFrame().evaluate(() => {
  const pin = document.querySelector('.dsa-pin')
  const pinDoc = parseFloat(pin.style.top || '0')
  return { pinTop: Math.round(pin.getBoundingClientRect().top), scrollY: Math.round(window.scrollY), pinDoc }
})
// the pin must move up with the content, i.e. track the scroll
const moved = before.pinTop - after.pinTop
console.log('3) scroll:', { scrolledBy: after.scrollY - before.scrollY, pinMovedBy: moved, pinDocCoord: after.pinDoc })
console.log('   verdict:', Math.abs(moved - (after.scrollY - before.scrollY)) <= 2 ? 'pin follows content' : 'PIN STUCK')

// 4: corner card, collapsed by default
const list = await page.evaluate(() => {
  const bottom = document.querySelector('.dsa-list')
  const corner = document.querySelector('.dsa-ovlist')
  const stage = document.querySelector('.dsa-stage')
  if (!corner) return { corner: false }
  const r = corner.getBoundingClientRect()
  const s = stage.getBoundingClientRect()
  return {
    bottomRow: Boolean(bottom),
    corner: true,
    atTopRight: Math.abs(r.top - s.top) < 14 && Math.abs(r.right - s.right) < 14,
    collapsed: !document.querySelector('.dsa-ovitems'),
    pill: corner.innerText.replace(/\s+/g, ' ').trim(),
  }
})
console.log('4) list:', JSON.stringify(list))
await page.locator('.dsa-ovhead').click(SHORT)
await page.waitForTimeout(400)
console.log('4b) expanded:', await page.locator('.dsa-ovitems .dsa-item').count(), 'items | bottom row gone:', (await page.locator('.dsa-list').count()) === 0)
await page.screenshot({ path: 'tests/shots/panel-corner-list.png' })
await browser.close()
