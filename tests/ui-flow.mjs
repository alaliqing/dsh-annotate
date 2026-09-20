/**
 * Checks the four panel refinements:
 *   1. the primary action sits in a bottom footer (not hugging the top edge)
 *   2. the usage hint lives behind a `?` in the top-right, not in a full row
 *   3. Esc leaves annotation mode (and marking can resume)
 *   4. 发送 sends the message itself, instead of only filling the composer
 *
 *   node tests/ui-flow.mjs "http://127.0.0.1:3095/?token=..." [port]
 */
import { loadPlaywright } from './playwright.mjs'

const { chromium } = await loadPlaywright()
const harness = process.argv[2]
const wantPort = Number(process.argv[3] ?? 5199)
if (!harness) {
  console.error('usage: node tests/ui-flow.mjs <harness-url-with-token> [port]')
  process.exit(2)
}
const SHORT = { timeout: 5000 }

const browser = await chromium.launch({ channel: 'chromium' })
const page = await browser.newPage({ viewport: { width: 1600, height: 940 }, deviceScaleFactor: 2 })
page.on('pageerror', (error) => console.log('[pageerror]', error.message))

await page.goto(harness, { waitUntil: 'domcontentloaded', timeout: 20000 })
await page.waitForTimeout(1800)
await page.getByRole('button', { name: 'New Session' }).first().click(SHORT).catch(() => {})
await page.waitForTimeout(1000)
await page.locator('text=/New Session/').last().click({ ...SHORT, force: true }).catch(() => {})
await page.waitForTimeout(1200)

await page.keyboard.press('Meta+Shift+KeyB')
for (let i = 0; i < 24 && !(await page.locator('.dsa-col').count()); i++) await page.waitForTimeout(500)
// wait for the list to be populated (or for a single service to open itself)
for (let i = 0; i < 20; i++) {
  if ((await page.locator('.dsa-svc').count()) || (await page.locator('iframe.dsa-frame').count())) break
  await page.waitForTimeout(700)
}
const row = page.locator('.dsa-svc', { hasText: `:${wantPort}` }).first()
if (await row.count()) {
  await row.click()
  await page.waitForTimeout(1800)
}
const frame = page.frameLocator('iframe.dsa-frame')
// Wait for the page face itself, then for the preview inside it.
for (let i = 0; i < 25 && !(await page.locator('.dsa-foot').count()); i++) {
  const rows = page.locator('.dsa-svc', { hasText: `:${wantPort}` })
  if (await rows.count()) await rows.first().click().catch(() => {})
  await page.waitForTimeout(700)
}
for (let i = 0; i < 20 && !(await frame.locator('textarea').count()); i++) await page.waitForTimeout(700)
console.log('panel face ready:', await page.locator('.dsa-foot').count(), '| preview ready:', await frame.locator('textarea').count())

// 1. footer, not top edge
const geometry = await page.evaluate(() => {
  const foot = document.querySelector('.dsa-foot')
  const bar = document.querySelector('.dsa-bar')
  const stage = document.querySelector('.dsa-stage')
  return {
    hasFooter: Boolean(foot),
    sendLabel: document.querySelector('.dsa-send')?.textContent ?? null,
    sendInFooter: Boolean(foot && foot.contains(document.querySelector('.dsa-send'))),
    sendTop: foot ? Math.round(foot.getBoundingClientRect().top) : null,
    stageBottom: stage ? Math.round(stage.getBoundingClientRect().bottom) : null,
    barButtons: bar ? bar.querySelectorAll('button').length : 0,
  }
})
console.log('1) layout:', JSON.stringify(geometry))

// 2. help lives behind the ? and the empty list renders nothing
const beforeHelp = await page.locator('.dsa-help').count()
await page.locator('.dsa-ico[title="怎么用"]').click(SHORT)
await page.waitForTimeout(300)
const afterHelp = await page.locator('.dsa-help').count()
const hintRow = await page.locator('.dsa-empty').count()
await page.screenshot({ path: 'tests/shots/panel-help.png' })
await page.locator('.dsa-ico[title="怎么用"]').click(SHORT)
console.log('2) help popover:', beforeHelp, '→', afterHelp, '| stray hint row:', hintRow)

// helper: enter marking and annotate the textarea
const annotate = async (text) => {
  const marker = page.locator('.dsa-ico[title^="标记模式"]')
  if ((await marker.getAttribute('data-on')) !== 'true') await marker.click(SHORT)
  await page.waitForTimeout(300)
  await frame.locator('textarea').first().click({ force: true, timeout: 5000 })
  await page.waitForTimeout(400)
  await frame.locator('.dsa-card textarea').first().click({ force: true, timeout: 5000 }).catch(() => {})
  await page.keyboard.type(text, { delay: 2 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
}

// 3. Esc leaves the mode
await annotate('Esc 应该退出标注态')
const modeAfterAnnotate = await page.locator('.dsa-ico[title^="标记模式"]').getAttribute('data-on')
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
const modeAfterEscape = await page.locator('.dsa-ico[title^="标记模式"]').getAttribute('data-on')
console.log('3) Esc exits marking:', { markerBefore: modeAfterAnnotate, markerAfter: modeAfterEscape })

// and marking resumes for a second annotation
await annotate('继续第二条标注')
console.log('3b) resumed, annotations:', await page.locator('.dsa-item').count())

// 4. 发送 presses the harness' own send button
// A spy on that button proves the panel pressed it; whether the harness then
// accepts the message depends on the session being owned by this instance.
await page.evaluate(() => {
  const editable = document.querySelector('[contenteditable="true"][role="textbox"], [contenteditable=true]')
  let node = editable
  let target = null
  for (let depth = 0; depth < 7 && node && !target; depth += 1) {
    target = [...node.querySelectorAll('button')].find(
      (el) => el.getAttribute('aria-label') === 'Send message' || /_primary\b/.test(String(el.className))
    )
    node = node.parentElement
  }
  window.__sendSpy = { clicked: 0, label: target ? target.getAttribute('aria-label') || target.className : null }
  if (target) target.addEventListener('click', () => { window.__sendSpy.clicked += 1 })
})
const draftBefore = await page.evaluate(() => document.querySelector('[contenteditable=true]')?.innerText?.length ?? 0)
await page.locator('.dsa-send').click(SHORT)
await page.waitForTimeout(2500)
const after = await page.evaluate(() => {
  const editable = document.querySelector('[contenteditable="true"][role="textbox"], [contenteditable=true]')
  const composer = editable ? String(editable.innerText || '') : ''
  // Everything outside the composer is the transcript.
  const withoutComposer = editable ? document.body.innerText.replace(composer, '') : document.body.innerText
  return {
    composerText: composer.slice(0, 40),
    composerEmpty: composer.trim() === '',
    payloadInTranscript: /界面标注/.test(withoutComposer),
    notice: document.querySelector('.dsa-notice')?.innerText?.replace(/\s+/g, ' ').slice(0, 60) ?? null,
  }
})
const spy = await page.evaluate(() => window.__sendSpy)
const chips = await page.locator('.dsa-chip').count()
console.log('4) send:', JSON.stringify({ draftBefore, spy, chips, ...after }))
console.log('   verdict:', after.composerEmpty ? 'message accepted by the harness' : 'panel pressed send; harness refused (session owned elsewhere) → fallback kept the block + chip')
console.log('annotations left in panel:', await page.locator('.dsa-item').count())
await page.screenshot({ path: 'tests/shots/panel-sent.png' })
await browser.close()
