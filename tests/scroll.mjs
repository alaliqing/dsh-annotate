import assert from 'node:assert/strict'
import http from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPlaywright } from './playwright.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const overlay = readFileSync(resolve(repo, 'packages/dsh-annotate/lib/overlay.js'), 'utf8')
const rows = Array.from({ length: 80 }, (_, index) => `<div class="row" id="row${index}">${index === 0 ? '<button id="pick">Annotate this button</button>' : 'Scroll row ' + index}</div>`).join('')
const nesting = '<div>'.repeat(20) + `<div id="vertical" class="scroller">${rows}</div>` + '</div>'.repeat(20)
const html = `<!doctype html><html><head><title>Native annotation scrolling</title><style>
html{scroll-behavior:smooth}body{margin:24px;background:#f6f7f8;color:#202833;font:15px system-ui}
h1{font-size:24px}.scroller{height:300px;overflow:auto;scroll-behavior:smooth;border:1px solid #999;background:white}
.row{height:40px;box-sizing:border-box;border-bottom:1px solid #ddd;padding:8px 16px}button{padding:3px 12px}
#horizontal{margin-top:24px;height:90px;overflow:auto;scroll-behavior:smooth;border:1px solid #999}
#horizontal div{width:2400px;height:70px;background:repeating-linear-gradient(90deg,#d8e4ed 0 80px,#f7f9fa 80px 160px)}
</style><script>
window.__DSH_ANNO__={parentOrigin:location.origin,lang:'en'};
window.__DSH_ANNO_SESSION__='scroll-regression';
window.pressEvents=[];window.wheelEvents=[];
document.addEventListener('wheel',event=>wheelEvents.push({prevented:event.defaultPrevented,nested:!!event.target.closest('#vertical')}),{passive:true});
</script></head><body><h1>Native annotation scrolling</h1>${nesting}<div id="horizontal"><div>Horizontal scroll</div></div><div style="height:3000px"></div>
<script>for(const type of ['pointerdown','mousedown','click'])document.querySelector('#pick').addEventListener(type,()=>pressEvents.push(type));</script>
<script src="/overlay.js"></script></body></html>`
const server = http.createServer((req, res) => {
  res.setHeader('content-type', req.url === '/overlay.js' ? 'text/javascript' : 'text/html; charset=utf-8')
  res.end(req.url === '/overlay.js' ? overlay : html)
})
let browser
const pass = text => console.log('PASS', text)
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const { chromium } = await loadPlaywright()
  browser = await chromium.launch({ channel: 'chromium' })
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.locator('.dsa-layer').waitFor({ state: 'attached' })
  const mode = async value => {
    await page.evaluate(mode => window.postMessage({ source: 'dsh-annotate-panel', type: 'set-mode', mode }, location.origin), value)
    await page.waitForFunction(mode => !!document.querySelector('.dsa-capture') === (mode !== 'idle'), value)
  }
  const reset = () => page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    for (const id of ['vertical', 'horizontal']) document.getElementById(id).scrollTo({ top: 0, left: 0, behavior: 'instant' })
    wheelEvents.length = 0
  })
  const wheelSeries = async (dx, dy, count = 15) => {
    for (let i = 0; i < count; i++) await page.mouse.wheel(dx, dy)
  }
  for (const value of ['idle', 'picking']) {
    await mode(value)
    await reset()
    const box = await page.locator('#vertical').boundingBox()
    await page.mouse.move(box.x + box.width / 3, box.y + 150)
    await wheelSeries(0, 20)
    await page.waitForFunction(() => document.querySelector('#vertical').scrollTop === 300)
    await wheelSeries(0, -20)
    await page.waitForFunction(() => document.querySelector('#vertical').scrollTop === 0)
    const events = await page.evaluate(() => wheelEvents)
    assert(events.length > 0)
    assert(events.every(event => event.nested && !event.prevented))
    assert.equal(await page.evaluate(() => scrollY), 0)
    pass(`${value}: continuous nested wheel keeps every delta and reaches the app unblocked with scroll-behavior:smooth`)
    await reset()
    await page.mouse.move(1050, 740)
    await wheelSeries(0, 20)
    await page.waitForFunction(() => scrollY === 300)
    await wheelSeries(0, -20)
    await page.waitForFunction(() => scrollY === 0)
    pass(`${value}: continuous window wheel keeps every delta in both directions with scroll-behavior:smooth`)
  }
  await reset()
  const horizontal = await page.locator('#horizontal').boundingBox()
  await page.mouse.move(horizontal.x + 100, horizontal.y + 35)
  await wheelSeries(20, 0)
  await page.waitForFunction(() => document.querySelector('#horizontal').scrollLeft === 300)
  await wheelSeries(-20, 0)
  await page.waitForFunction(() => document.querySelector('#horizontal').scrollLeft === 0)
  pass('picking preserves native horizontal scrolling in both directions')
  await page.evaluate(() => {
    const el = document.querySelector('#vertical')
    el.style.overscrollBehavior = 'contain'
    el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
  })
  const vertical = await page.locator('#vertical').boundingBox()
  await page.mouse.move(vertical.x + 100, vertical.y + 150)
  await page.mouse.wheel(0, 100)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
  assert.equal(await page.evaluate(() => scrollY), 0)
  await page.evaluate(() => { document.querySelector('#vertical').style.overscrollBehavior = 'auto' })
  await page.mouse.wheel(0, 100)
  await page.waitForFunction(() => scrollY === 100)
  pass('picking respects overscroll containment and native chaining at a container boundary')
  await reset()
  await page.locator('#pick').click()
  await page.locator('.dsa-card textarea').fill('Native scrolling still allows annotations')
  assert.deepEqual(await page.evaluate(() => pressEvents), [])
  await page.locator('.dsa-card textarea').press('Enter')
  await page.locator('.dsa-pin').waitFor()
  assert.equal(await page.locator('.dsa-capture').count(), 1)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.dsa-capture'))
  await page.locator('#pick').click()
  assert.deepEqual(await page.evaluate(() => pressEvents), ['pointerdown', 'mousedown', 'click'])
  pass('picking blocks app press handlers, saving resumes picking, and Esc restores normal interaction')
  await mode('picking')
  await page.locator('#pick').click({ button: 'right' })
  await page.waitForFunction(() => !document.querySelector('.dsa-capture'))
  pass('right-click still exits picking')
  await page.evaluate(() => window.postMessage({ source: 'dsh-annotate-panel', type: 'restore', annotations: Array.from({ length: 50 }, (_, index) => ({ id: 'pin' + index, selector: '#row' + index, tag: 'div', comment: 'Note ' + index })) }, location.origin))
  await page.waitForFunction(() => document.querySelectorAll('.dsa-pin').length === 50)
  const budget = await page.evaluate(async () => {
    // Check work per animation frame rather than timings that vary by machine.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const originalRect = Element.prototype.getBoundingClientRect
    const originalStyle = window.getComputedStyle
    let rects = 0, styles = 0, mutations = 0
    Element.prototype.getBoundingClientRect = function (...args) { rects++; return originalRect.apply(this, args) }
    window.getComputedStyle = function (...args) { styles++; return originalStyle.apply(this, args) }
    const observer = new MutationObserver(records => { mutations += records.length })
    observer.observe(document.querySelector('.dsa-layer'), { subtree: true, attributes: true, childList: true })
    for (let frame = 0; frame < 6; frame++) await new Promise(resolve => requestAnimationFrame(resolve))
    observer.disconnect()
    Element.prototype.getBoundingClientRect = originalRect
    window.getComputedStyle = originalStyle
    return { rects: rects / 6, styles: styles / 6, mutations }
  })
  assert(budget.rects < 190, `stationary geometry reads per frame: ${budget.rects}`)
  assert(budget.styles < 190, `stationary style reads per frame: ${budget.styles}`)
  assert.equal(budget.mutations, 0)
  pass(`50 stationary pins share clipping measurements and avoid DOM churn (${budget.rects} rects, ${budget.styles} style reads/frame)`)
  await page.evaluate(() => { document.querySelector('#row0').style.transform = 'translateY(20px)' })
  await page.waitForFunction(() => {
    const pin = document.querySelector('.dsa-pin'), el = document.querySelector('#row0')
    return !pin.hidden && Math.abs(parseFloat(pin.style.top) - el.getBoundingClientRect().top) < 1
  })
  pass('transform changes without scrolling still move the marker with its element')
  mkdirSync(resolve(repo, 'tests/shots'), { recursive: true })
  await page.screenshot({ path: resolve(repo, 'tests/shots/scroll-native.png') })
  assert.deepEqual(errors, [])
  pass('native scroll regression has no browser runtime exceptions')
} finally {
  if (browser) await browser.close()
  await new Promise(resolve => server.close(resolve))
}
