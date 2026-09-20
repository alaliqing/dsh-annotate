/**
 * End-to-end check of the zero-config flow:
 *   open the tab → it lists the local servers that are running → click one →
 *   the page loads through the proxy → annotate it → the block reaches the
 *   composer → back to the list → reopen by typing only a port.
 *
 *   node tests/gui-smoke.mjs "http://127.0.0.1:3098/?token=..." [port]
 */
import { loadPlaywright } from './playwright.mjs'

const { chromium } = await loadPlaywright()
const harness = process.argv[2]
if (!harness) {
  console.error('usage: node tests/gui-smoke.mjs <harness-url-with-token> [expected-port]')
  process.exit(2)
}
const wantPort = Number(process.argv[3] ?? 5199)
const SHORT = { timeout: 5000 }

const browser = await chromium.launch({ channel: 'chromium' })
const page = await browser.newPage({ viewport: { width: 1600, height: 940 }, deviceScaleFactor: 2 })
page.on('pageerror', (error) => console.log('[pageerror]', error.message))
page.on('console', (message) => {
  if (message.type() === 'error') console.log('[console]', message.text().slice(0, 200))
})

await page.goto(harness, { waitUntil: 'domcontentloaded', timeout: 20000 })
await page.waitForTimeout(1800)
await page.getByRole('button', { name: 'New Session' }).first().click(SHORT).catch(() => {})
await page.waitForTimeout(1000)
await page.locator('text=/New Session/').last().click({ ...SHORT, force: true }).catch(() => {})
await page.waitForTimeout(1000)

// 1. the tab lists what is running — nothing configured, nothing typed
await page.keyboard.press('Meta+Shift+KeyB')
for (let i = 0; i < 20 && !(await page.locator('.dsa-col').count()); i++) await page.waitForTimeout(500)
console.log('tab open:', await page.locator('.dsa-col').count())
for (let i = 0; i < 20 && !(await page.locator('.dsa-svc').count()); i++) await page.waitForTimeout(700)
const rows = await page.locator('.dsa-svc').allInnerTexts()
console.log('discovered:', JSON.stringify(rows.map((row) => row.replace(/\s+/g, ' '))))

// 2. one click opens it through the proxy
const row = page.locator('.dsa-svc', { hasText: `:${wantPort}` }).first()
if (!(await row.count())) {
  console.log(`FAIL  no discovered service on :${wantPort}`)
  await browser.close()
  process.exit(1)
}
await row.click()
await page.waitForTimeout(2500)
const frame = page.frameLocator('iframe.dsa-frame')
let ready = 0
for (let i = 0; i < 20 && !ready; i++) {
  await page.waitForTimeout(700)
  ready = await frame.locator('#question').count()
}
console.log('address bar:', await page.locator('.dsa-bar .dsa-url').first().inputValue())
console.log('footer:', (await page.locator('.dsa-stagefoot').innerText().catch(() => '')).replace(/\s+/g, ' '))
console.log('preview ready:', ready)

// 3. annotate it
if (ready) {
  await page.locator('.dsa-ico[title^="标记模式"]').click(SHORT)
  await page.waitForTimeout(400)
  await frame.locator('#question').click({ force: true, timeout: 5000 })
  await page.waitForTimeout(500)
  console.log('card open:', await frame.locator('.dsa-card').count())
  await frame.locator('.dsa-card textarea').first().click({ force: true, timeout: 5000 }).catch(() => {})
  await page.keyboard.type('这个输入框的 placeholder 偏长，右下按钮贴得太近', { delay: 2 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(700)
  console.log('annotations listed:', await page.locator('.dsa-item').count())

  await page.locator('.dsa-send').click(SHORT).catch(() => {})
  await page.waitForTimeout(900)
  const draft = (await page.locator('[contenteditable=true]').first().innerText().catch(() => '')).trim()
  console.log('--- payload ---\n' + draft.slice(0, 400))
  console.log('dock chips:', await page.locator('.dsa-chip').count())
}

// 4. back to the list, then reopen by typing only the port
await page.locator('.dsa-ico[title="回到本地服务列表"]').click(SHORT).catch(() => {})
await page.waitForTimeout(1200)
console.log('list again:', await page.locator('.dsa-svc').count())
await page.locator('.dsa-openrow input').fill(String(wantPort))
await page.keyboard.press('Enter')
await page.waitForTimeout(2200)
console.log(
  'typed-port open:',
  await page.locator('iframe.dsa-frame').count(),
  await page.locator('.dsa-bar .dsa-url').first().inputValue()
)

await page.screenshot({ path: 'tests/shots/gui-list-flow.png' })
await browser.close()
