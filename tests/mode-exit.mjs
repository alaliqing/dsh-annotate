/**
 * Leaving annotation mode must work from every state:
 *   A. Esc while the card is open (focus inside the preview)
 *   B. the 标记 button while the card is open
 *   C. Esc from the panel document (focus on the panel)
 *   D. and marking still resumes, staying in picking after a save
 *
 *   node tests/mode-exit.mjs "http://127.0.0.1:3094/?token=..." [port]
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
const previewFrame = () => page.frames().find((f) => /\/__dsh_anno\//.test(f.url()))
for (let i = 0; i < 20 && !(await frame.locator('#question').count()); i++) await page.waitForTimeout(700)

const marker = page.locator('.dsa-ico[title^="标记模式"]')
const mode = () => marker.getAttribute('data-on')
const cardOpen = () => frame.locator('.dsa-card').count()
const hoverBox = async () => {
  await frame.locator('.card h2').first().hover({ force: true }).catch(() => {})
  await page.waitForTimeout(350)
  return previewFrame().evaluate(() => {
    const el = document.querySelector('.dsa-frame')
    const visible = el && getComputedStyle(el).display !== 'none'
    return {
      visible: Boolean(visible),
      state: el ? el.getAttribute('data-state') : null,
      captureSurface: Boolean(document.querySelector('.dsa-capture')),
    }
  })
}

// enter marking, open a card
await marker.click(SHORT)
await page.waitForTimeout(300)
await frame.locator('#question').click({ force: true, timeout: 5000 })
await page.waitForTimeout(500)
console.log('setup: marker =', await mode(), '| card =', await cardOpen())

// A. Esc with focus inside the preview
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
console.log('A) Esc in preview → marker:', await mode(), '| card:', await cardOpen())

// B. 标记 button while the card is open
await marker.click(SHORT)                     // back to picking
await page.waitForTimeout(300)
await frame.locator('#question').click({ force: true, timeout: 5000 })
await page.waitForTimeout(500)
const cardB = await cardOpen()
await marker.click(SHORT)                     // should LEAVE, not re-arm
await page.waitForTimeout(500)
console.log('B) 标记 while writing → card was', cardB, '| marker:', await mode(), '| card now:', await cardOpen())
console.log('   after leaving (frame hidden + no capture surface expected):', JSON.stringify(await hoverBox()))

// C. Esc with focus in the panel document
await marker.click(SHORT)
await page.waitForTimeout(300)
console.log('C) armed:', await mode())
await page.locator('.dsa-foot').click({ position: { x: 4, y: 4 } }).catch(() => {})
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
console.log('   Esc in panel → marker:', await mode())

// D. resume + save keeps picking
await marker.click(SHORT)
await page.waitForTimeout(300)
await frame.locator('#question').click({ force: true, timeout: 5000 })
await page.waitForTimeout(400)
await frame.locator('.dsa-card textarea').first().click({ force: true }).catch(() => {})
await page.keyboard.type('模式测试', { delay: 2 })
await page.keyboard.press('Enter')
await page.waitForTimeout(600)
console.log('D) after save → marker:', await mode(), '(true = still picking) | annotations:', await page.locator('.dsa-ovhead b').innerText().catch(() => '0'))
await browser.close()
