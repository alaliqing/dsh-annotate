import assert from 'node:assert/strict'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPlaywright } from './playwright.mjs'
import { apply } from '../packages/dsh-annotate/lib/index.js'
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const dependencies = process.env.REVIEW_NODE_MODULES || resolve(repo, 'node_modules')
// A minimal CommonJS loader for the test-only React fixture; no production dependency.
const modules = new Map()
function bundle(file) {
  file = resolve(file)
  if (modules.has(file)) return
  const src = readFileSync(file, 'utf8'), deps = {}
  modules.set(file, { src, deps })
  for (const [, name] of src.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
    const target = name.startsWith('.') ? createRequire(file).resolve(name) : require.resolve(name, { paths: [dependencies] })
    deps[name] = target
    bundle(target)
  }
}
const entry = resolve(repo, 'tests/review-fixture.cjs'); bundle(entry)
const fixtureJs = `(function(){const process={env:{NODE_ENV:'production'}};const modules={${[...modules].map(([id,m])=>`${JSON.stringify(id)}:[function(module,exports,require){${m.src}\n},${JSON.stringify(m.deps)}]`).join(',')}};const cache={};function load(id){if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};const [fn,deps]=modules[id];fn(module,module.exports,n=>load(deps[n]));return module.exports}load(${JSON.stringify(entry)})})()`
const routes = [], dispose = []
apply({ effect(fn) { const clean = fn(); if (typeof clean === 'function') dispose.push(clean) }, webServer: { register: r => { routes.push(r) }, registerUpgrade() {} }, timer: {}, subprocess: {} }, { detect: { staticPorts: false } })
const app = http.createServer((req, res) => {
  if (req.url === '/absolute-redirect') { res.writeHead(302, { location: `http://127.0.0.1:${app.address().port}/destination?from=redirect#ready` }); res.end(); return }
  if (req.url.startsWith('/echo')) { res.setHeader('content-type','application/json'); res.end(JSON.stringify({ cookie:req.headers.cookie || '', url:req.url })); return }
  res.setHeader('content-type','text/html; charset=utf-8')
  res.end(`<!doctype html><html><head><title>Review test</title><style>body{margin:0;font:14px system-ui;background:#f6f7f8;color:#202833}main{padding:28px}h1{font-size:25px}.scroller{height:240px;overflow:auto;border:1px solid #ccd3db;background:white;padding:20px}.spacer{height:75px}button{padding:12px 18px;background:#fff;border:1px solid #aab5c2;border-radius:8px}#after{height:1500px}</style></head><body><main><h1>Review workspace</h1><p>Real DOM, nested scrolling and route state</p><div class="scroller"><div class="spacer"></div><button class="hover:bg-blue-500 w-1/2" id="target:one">Review this element</button><div style="height:700px"></div></div><p><button id="route">Open second page</button></p><input id="draft" placeholder="Keep this form value"><div id="after"></div></main><script>document.querySelector('#route').onclick=()=>history.pushState({},'','/second?view=2#details')</script></body></html>`)
})
app.on('upgrade', (req, socket) => {
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n')
  socket.write(Buffer.from([0x81, 2, 111, 107]))
  socket.on('data', () => socket.end())
  socket.on('error', () => socket.destroy())
})
const host = http.createServer((req, res) => {
  if (req.url === '/fixture.js') { res.setHeader('content-type','text/javascript'); res.end(fixtureJs); return }
  if (req.url === '/plugin.js') { res.setHeader('content-type','text/javascript'); res.end(readFileSync(resolve(repo,'packages/dsh-annotate/lib/client.js'))); return }
  const route = routes.find(r => req.url.startsWith(r.path))
  if (route) { route.handler(req,res); return }
  res.setHeader('content-type','text/html; charset=utf-8'); res.end('<!doctype html><html><head><style>body{margin:0;background:#edf0f3;font:14px system-ui;--dsw-alias-label-primary:#202833;--dsw-alias-label-secondary:#637083;--dsw-alias-bg-base:#f8fafc;--dsw-alias-bg-layer-1:#fff}#root{height:100vh;width:100%}</style></head><body><div id="root"></div><script src="/fixture.js"></script><script src="/plugin.js"></script></body></html>')
})
const listen = (server, port=0) => new Promise((r,j)=>{server.once('error',j);server.listen(port,'127.0.0.1',r)})
let browser
const pass = text => console.log('PASS',text)
try {
  await listen(app, Number(process.env.REVIEW_TEST_PORT || 5180)); await listen(host)
  const origin = `http://127.0.0.1:${host.address().port}`, upstream = `http://127.0.0.1:${app.address().port}`
  const api = async(method,args={}) => fetch(origin+'/__dsh-annotate/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,args})}).then(r=>r.json())
  const detection = await api('detect'); assert(detection.services.some(s=>s.port===app.address().port)); pass('default 5180 service is discovered')
  // A workspace of the test's own: a port named in its package.json, an
  // index.html at its root, and a file that must not be previewable.
  const workspace = mkdtempSync(join(tmpdir(),'anno-workspace-'))
  writeFileSync(join(workspace,'index.html'),'<!doctype html><html><head><title>静态页面</title></head><body><h1 id="static-page">项目内的静态页面</h1><script src="./app.js"></script></body></html>')
  writeFileSync(join(workspace,'other.html'),'<!doctype html><html><head><title>第二个静态页面</title></head><body><h1 id="static-page">另一个文件</h1></body></html>')
  writeFileSync(join(workspace,'app.js'),'window.__STATIC_FIXTURE__=true')
  writeFileSync(join(workspace,'notes.txt'),'not a page\n')
  writeFileSync(join(workspace,'package.json'),JSON.stringify({name:'anno-workspace',scripts:{dev:'vite --port '+app.address().port}}))
  const scoped = await api('detect',{root:workspace,sid:'workspace',force:true})
  const declared = scoped.services.find(s=>s.port===app.address().port)
  assert(declared && declared.declared===true); assert(scoped.files.some(f=>f.rel==='index.html'))
  assert.equal(scoped.files[0].rel,'index.html');pass('a workspace port is marked as configured and its static page is listed')
  const other = await api('detect',{root:mkdtempSync(join(tmpdir(),'anno-other-')),sid:'other',force:true})
  assert(other.services.every(s=>!s.project));pass('an unrelated workspace claims no service')
  const staticUrl = 'file://' + join(workspace,'index.html')
  const staticPreview = await api('preview',{url:staticUrl,root:workspace,sid:'workspace'})
  assert.equal(staticPreview.ok,true)
  const staticHtml = await (await fetch(staticPreview.url)).text()
  assert(staticHtml.includes('项目内的静态页面') && staticHtml.includes('__DSH_ANNO__') && staticHtml.includes(JSON.stringify(staticUrl)))
  pass('a workspace HTML file previews with the annotation overlay and its own address')
  const staticAsset = await fetch(staticPreview.origin + '/app.js')
  assert.equal(staticAsset.headers.get('content-type'),'text/javascript; charset=utf-8');pass('a static preview serves its relative assets')
  assert.equal((await fetch(staticPreview.origin + '/%2e%2e%2f%2e%2e%2fetc%2fpasswd')).status,403)
  assert.equal((await fetch(staticPreview.origin + '/.env')).status,403);pass('traversal and dotfiles are refused')
  assert.equal((await api('preview',{url:'file://' + join(workspace,'notes.txt'),root:workspace,sid:'workspace'})).code,'notHtmlFile')
  assert.equal((await api('preview',{url:'file:///etc/hosts',root:workspace,sid:'workspace'})).code,'notAllowedFile')
  assert.equal((await api('preview',{url:staticUrl,sid:'workspace'})).code,'notAllowedFile')
  assert.equal((await api('preview',{url:'file:///etc/hosts',root:'/tmp',sid:'workspace'})).code,'notAllowedFile');pass('only HTML inside the workspace can be previewed')
  assert.equal((await api('preview',{url:'http://example.com',sid:'x'})).ok,false)
  assert.equal((await fetch(origin+'/__dsh-annotate/api',{method:'POST',headers:{origin:'http://127.0.0.2:9999'},body:'{}'})).status,403); pass('external targets and cross-origin API writes rejected')
  const secure = await api('preview',{url:'https://127.0.0.1:' + app.address().port,sid:'tls-check'})
  const secureResponse = await fetch(secure.url);assert.equal(secureResponse.status,502);assert(!(await secureResponse.text()).includes('Protocol "https:" not supported'));pass('HTTPS failures are handled without protocol exceptions')
  const { chromium } = await loadPlaywright(); browser = await chromium.launch({channel:'chromium'})
  // The panel follows the browser language, so a zh-CN context is what makes
  // the Chinese assertions below the default-resolution path under test.
  const context = await browser.newContext({viewport:{width:520,height:840},locale:'zh-CN'})
  const page = await context.newPage(); const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER ERROR',e.message)});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});page.on('requestfailed',r=>console.log('REQUEST FAILED',r.url(),r.failure()))
  await page.goto(origin)
  mkdirSync(resolve(repo,'tests/shots'),{recursive:true})
  // Documentation shot: the discovery list, before anything is opened. The
  // suite doubles as the screenshot generator; see CONTRIBUTING.md.
  await page.locator('.dsa-svc').first().waitFor({timeout:15000}).catch(()=>{})
  await page.screenshot({path:resolve(repo,'tests/shots/review-list.png')})
  const open = async()=>{
    if (await page.locator('.dsa-openrow input').count()) { await page.locator('.dsa-openrow input').fill(upstream); await page.locator('.dsa-openrow input').press('Enter') }
    else { await page.locator('.dsa-url').fill(upstream); await page.locator('.dsa-url').press('Enter') }
    await page.waitForFunction(()=>document.querySelector('iframe') && !document.querySelector('.dsa-empty'),null,{timeout:10000}).catch(async e=>{console.log('PAGE',await page.locator('body').innerText());console.log('FRAMES',page.frames().map(f=>f.url()));throw e})
    return page.frames().find(f=>f.url().startsWith('http://localhost:'))
  }
  let frame = await open(); assert(frame)
  assert.equal(await frame.evaluate(()=>location.pathname),'/')
  assert.equal(await frame.evaluate(()=>{try{return !!parent.document.body}catch{return false}}),false);pass('preview preserves paths and cannot read Harness DOM')
  const network = await frame.evaluate(async (target) => {
    document.cookie = 'review_cookie=kept; Path=/'
    const echo = await fetch(target + '/echo').then(r=>r.json())
    const socket = await new Promise(resolve => {
      const ws = new WebSocket(target.replace(/^http/,'ws') + '/ws')
      const timer = setTimeout(()=>{ws.close();resolve('timeout')},2500)
      ws.onmessage = event => {clearTimeout(timer);resolve(event.data);ws.close()}
      ws.onerror = () => {clearTimeout(timer);resolve('error')}
    })
    return {echo,socket,cookie:document.cookie}
  },upstream)
  assert.equal(network.echo.cookie,'review_cookie=kept');assert.equal(network.socket,'ok');assert.equal(network.cookie,'review_cookie=kept');pass('absolute fetch, cookie round-trip, and WebSocket upgrade')
  const marker=page.locator('button[title^="标记模式"]')
  const pick=async(text)=>{
    if(await marker.getAttribute('aria-pressed')==='false') await marker.click()
    await frame.locator('[id="target:one"]').click({force:true})
    await frame.locator('.dsa-card textarea').fill(text)
  }
  await pick('保持按钮与说明对齐')
  await frame.locator('.dsa-card textarea').evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})))
  assert.equal(await frame.locator('.dsa-card').count(),1); pass('IME Enter keeps editor open')
  await frame.locator('.dsa-card textarea').press('Enter'); await frame.waitForFunction(()=>document.querySelectorAll('.dsa-pin').length===1)
  const geometry=()=>frame.evaluate(()=>{const pin=document.querySelector('.dsa-pin'), el=document.getElementById('target:one');return {pin:parseFloat(pin.style.top),el:el.getBoundingClientRect().top,hidden:pin.hidden}})
  assert.deepEqual(await frame.locator('.dsa-pin').evaluate(el=>({w:el.offsetWidth,h:el.offsetHeight})),{w:20,h:20});
  const before=await geometry();assert(Math.abs(before.pin-before.el)<1)
  // Pins are repositioned on the animation frame after a scroll or layout
  // change, and real wheel input is animated by Chromium. Wait for the pin to
  // agree with its live element instead of guessing a fixed delay.
  const settled=()=>frame.waitForFunction(()=>{
    const pin=document.querySelector('.dsa-pin'),el=document.getElementById('target:one')
    if(!pin||!el)return false
    return pin.hidden||Math.abs(parseFloat(pin.style.top)-el.getBoundingClientRect().top)<1
  },null,{timeout:5000})
  // Real wheel over the capture surface, not synthetic scrollTop only.
  await frame.locator('[id="target:one"]').hover({force:true});await page.mouse.wheel(0,35)
  await frame.waitForFunction(()=>document.querySelector('.scroller').scrollTop>0)
  await settled();let after=await geometry();assert(Math.abs(after.pin-after.el)<1);assert(after.el<before.el);pass('real nested wheel in picking mode keeps marker attached')
  await frame.evaluate(()=>window.scrollTo({top:30,behavior:'instant'}));await settled();after=await geometry();assert(after.hidden||Math.abs(after.pin-after.el)<1);assert(after.el<before.el);pass('window scrolling keeps marker attached')
  await frame.evaluate(()=>document.querySelector('.spacer').style.height='95px');await settled();after=await geometry();assert(after.hidden||Math.abs(after.pin-after.el)<1);pass('layout changes without scroll re-anchor marker')
  await frame.evaluate(()=>document.querySelector('.scroller').scrollTop=400)
  await frame.waitForFunction(()=>{const pin=document.querySelector('.dsa-pin');return !pin||pin.hidden},null,{timeout:5000})
  assert.equal((await geometry()).hidden,true);pass('clipped markers are hidden')
  await frame.evaluate(()=>{document.querySelector('.scroller').scrollTop=0;window.scrollTo(0,0)})
  await marker.click();await frame.locator('#draft').fill('keep me');await frame.locator('#route').click();await page.waitForTimeout(120)
  assert.equal(await frame.locator('.dsa-pin').count(),0)
  await pick('第二页批注');await frame.locator('.dsa-card textarea').press('Enter');await page.waitForTimeout(100)
  await page.locator('button[title="后退"]').click();await page.waitForTimeout(200)
  assert.equal(await frame.locator('#draft').inputValue(),'keep me');assert.equal(await frame.locator('.dsa-pin').getAttribute('title'),'保持按钮与说明对齐');pass('SPA annotations separated; back preserves form and restores previous comments')
  await page.evaluate(()=>{reviewTest.fail=true;reviewTest.delay=250;reviewTest.setDraft('unsent unrelated draft')})
  await page.locator('.dsa-send').click();assert.equal(await page.locator('.dsa-send').isDisabled(),true)
  await page.waitForFunction(()=>document.querySelector('.dsa-notice')?.textContent.includes('发送失败'))
  assert.equal(await frame.locator('.dsa-pin').count(),1);assert.equal(await page.evaluate(()=>reviewTest.getDraft()),'unsent unrelated draft');pass('rejected send preserves comments and unrelated draft')
  await page.evaluate(()=>{reviewTest.fail=false})
  await page.locator('.dsa-send').click();await page.waitForFunction(()=>document.querySelector('.dsa-notice')?.textContent.includes('会话已接收'))
  assert.equal(await frame.locator('.dsa-pin').count(),0);assert.equal(await page.evaluate(()=>reviewTest.calls.length),2);pass('accepted send clears only submitted comments')
  await pick('待补充的批注');await frame.locator('.dsa-card textarea').press('Enter');await page.waitForTimeout(80)
  await page.locator('.dsa-secondary').click();assert((await page.evaluate(()=>reviewTest.getDraft())).includes('待补充的批注'));assert.equal(await page.evaluate(()=>reviewTest.calls.length),2);pass('explicit attach combines with draft without sending')
  await pick('会话 A 私有');await frame.locator('.dsa-card textarea').press('Enter');await page.waitForTimeout(100)
  await page.evaluate(()=>reviewTest.switchSession('review-b'));frame=await open();assert.equal(await frame.locator('.dsa-pin').count(),0);pass('annotations isolated between sessions')
  await page.evaluate(()=>reviewTest.switchSession('review-a'));frame=await open();await page.waitForTimeout(100);assert.equal(await frame.locator('.dsa-pin').getAttribute('title'),'会话 A 私有')
  await page.setViewportSize({width:420,height:740});await page.waitForTimeout(120)
  const toolbarSpacing=await page.evaluate(()=>{
    const selectors=['.dsa-width','.dsa-review-toggle','.dsa-bar > button[title="回到本地服务列表"]','.dsa-helpwrap']
    const boxes=selectors.map(selector=>document.querySelector(selector)?.getBoundingClientRect()).filter(Boolean)
    return boxes.every((box,index)=>index===0||boxes[index-1].right<=box.left)
  })
  assert.equal(toolbarSpacing,true);pass('toolbar controls do not overlap at compact desktop width')
  mkdirSync(resolve(repo,'tests/shots'),{recursive:true});await page.screenshot({path:resolve(repo,'tests/shots/review-compact-toolbar.png')})
  await page.setViewportSize({width:340,height:740});await page.waitForTimeout(120)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.locator('.dsa-review-toggle').click()
  const reviewLayout=await page.evaluate(()=>{
    const bar=document.querySelector('.dsa-bar')?.getBoundingClientRect()
    const drawer=document.querySelector('.dsa-review-panel')?.getBoundingClientRect()
    const stage=document.querySelector('.dsa-stage')?.getBoundingClientRect()
    return {
      toggleInToolbar:Boolean(document.querySelector('.dsa-bar .dsa-review-toggle')),
      reviewUiInPreview:Boolean(document.querySelector('.dsa-stage .dsa-review-toggle, .dsa-stage .dsa-review-panel')),
      drawerAfterToolbar:Boolean(bar&&drawer&&drawer.top>=bar.bottom-1),
      previewAfterDrawer:Boolean(drawer&&stage&&stage.top>=drawer.bottom-1),
    }
  })
  assert.deepEqual(reviewLayout,{toggleInToolbar:true,reviewUiInPreview:false,drawerAfterToolbar:true,previewAfterDrawer:true});pass('toolbar annotation drawer stays outside and above preview')
  await page.screenshot({path:resolve(repo,'tests/shots/review-narrow.png')})
  await page.setViewportSize({width:560,height:880});await page.screenshot({path:resolve(repo,'tests/shots/review-light.png')})
  await page.evaluate(()=>{document.body.style.cssText='--dsw-alias-label-primary:#e9edf3;--dsw-alias-label-secondary:#a0aabd;--dsw-alias-bg-base:#11151b;--dsw-alias-bg-layer-1:#1a202a'});await page.screenshot({path:resolve(repo,'tests/shots/review-dark.png')});pass('narrow layout and light/dark screenshots')
  await pick('尚未提交的编辑草稿')
  await page.waitForTimeout(100)
  await page.locator('button[title="重新载入"]').click()
  await frame.locator('.dsa-card textarea').waitFor()
  await page.waitForTimeout(150)
  assert.equal(await frame.locator('.dsa-card textarea').inputValue(),'尚未提交的编辑草稿');pass('in-progress editor draft survives reload')
  await frame.locator('.dsa-card textarea').press('Escape')
  await frame.waitForFunction(()=>!document.querySelector('.dsa-card'))
  assert.equal(await page.locator('button[title^="标记模式"]').getAttribute('aria-pressed'),'false');pass('Esc leaves marking mode and closes the editor')
  // The panel and the injected overlay switch language together, and the choice
  // is reversible. Drop the dark override first so the documentation shot below
  // shows the light surfaces the panel defaults to.
  await page.evaluate(()=>{document.body.style.cssText=''})
  assert.equal(await page.locator('.dsa-lang').textContent(),'中');pass('language defaults to the browser locale (zh)')
  await page.locator('.dsa-lang').click()
  await page.waitForFunction(()=>document.querySelector('.dsa-bar button[title="Back"]'))
  assert.equal(await page.locator('.dsa-lang').textContent(),'EN')
  assert.equal(await page.locator('.dsa-url').getAttribute('placeholder'),'Address')
  await frame.waitForFunction(()=>{const pin=document.querySelector('.dsa-pin');return pin&&/^Edit annotation/.test(pin.getAttribute('aria-label')||'')})
  await page.screenshot({path:resolve(repo,'tests/shots/review-en.png')})
  pass('language switch re-renders the panel and the injected overlay')
  await page.locator('.dsa-lang').click()
  await page.waitForFunction(()=>document.querySelector('.dsa-bar button[title="后退"]'))
  assert.equal(await page.locator('button[title^="标记模式"]').count(),1);pass('language switch is reversible')
  // The list now belongs to the workspace the panel was told about: its service
  // carries the configured-port tag and its static page is offered directly.
  await page.locator('button[title="回到本地服务列表"]').click()
  await page.evaluate(dir=>window.reviewTest.setWorkspaces([{path:dir,sessionIds:['review-a']}]),workspace)
  await page.waitForTimeout(50)
  await page.locator('.dsa-ico[title="重新检测"]').click().catch(()=>{})
  const fileRow = page.locator('.dsa-file').first()
  await fileRow.waitFor({timeout:10000})
  assert.equal(await page.locator('.dsa-svc',{hasText:upstream}).locator('.dsa-tag').textContent(),'配置端口')
  pass('the workspace service is tagged and its static page is listed')
  await fileRow.click()
  await page.waitForFunction(()=>document.querySelector('iframe')&&!document.querySelector('.dsa-empty'),null,{timeout:10000})
  const staticFrame = page.frames().find(f=>f.url().includes('/index.html'));assert(staticFrame)
  assert.equal(await staticFrame.evaluate(()=>document.querySelector('#static-page').textContent),'项目内的静态页面')
  assert.equal(await staticFrame.evaluate(()=>window.__STATIC_FIXTURE__),true)
  assert((await page.locator('.dsa-url').inputValue()).startsWith('file://'));pass('a listed static page opens, keeps its file address and runs its relative script')
  const openStatic = async (url) => {
    await page.locator('.dsa-url').fill(url)
    await page.locator('.dsa-url').press('Enter')
    await page.waitForFunction(url => {
      const input = document.querySelector('.dsa-url')
      return input?.value === url && !document.querySelector('.dsa-empty')
    }, url)
    const preview = page.frames().find(f => f !== page.mainFrame())
    await preview.waitForFunction(url => window.__dshAnnoState?.().url === url && window.__dshAnnotateReady, url)
    return preview
  }
  const saveStatic = async (preview, comment) => {
    const marking = page.locator('button[title^="标记模式"]')
    if (await marking.getAttribute('aria-pressed') === 'false') await marking.click()
    await preview.locator('#static-page').click({force:true})
    await preview.locator('.dsa-card textarea').fill(comment)
    await preview.locator('.dsa-card textarea').press('Enter')
    await preview.waitForFunction(comment => document.querySelector('.dsa-pin')?.title === comment, comment)
  }
  const firstRoute = staticUrl + '?view=1#/first'
  let staticPage = await openStatic(firstRoute)
  assert.equal(await staticPage.evaluate(() => location.hash), '#/first')
  await saveStatic(staticPage, '第一个文件的批注')
  const secondRoute = 'file://' + join(workspace, 'other.html') + '?view=2#/second'
  staticPage = await openStatic(secondRoute)
  assert.equal(await staticPage.locator('#static-page').textContent(), '另一个文件')
  assert.equal(await staticPage.locator('.dsa-pin').count(), 0)
  await saveStatic(staticPage, '第二个文件的批注')
  staticPage = await openStatic(firstRoute)
  await staticPage.waitForFunction(() => document.querySelector('.dsa-pin')?.title === '第一个文件的批注')
  await staticPage.evaluate(() => { location.hash = '#/another' })
  await page.waitForFunction(url => document.querySelector('.dsa-url')?.value === url, staticUrl + '?view=1#/another')
  await staticPage.waitForFunction(() => !document.querySelector('.dsa-pin'))
  await staticPage.evaluate(() => { location.hash = '#/first' })
  await staticPage.waitForFunction(() => document.querySelector('.dsa-pin')?.title === '第一个文件的批注')
  pass('static files, query strings and hash routes restore only their own annotations')
  const releasedUrl = staticPage.url()
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/__dsh-annotate/api') && response.request().postDataJSON()?.method === 'releasePreview'),
    page.locator('button[title="回到本地服务列表"]').click(),
  ])
  await assert.rejects(fetch(releasedUrl))
  await page.locator('.dsa-file').first().click()
  await page.waitForFunction(() => document.querySelector('iframe') && !document.querySelector('.dsa-empty'))
  staticPage = await openStatic(firstRoute)
  await staticPage.waitForFunction(() => document.querySelector('.dsa-pin')?.title === '第一个文件的批注')
  pass('closing and reopening a panel releases its listener and restores saved annotations')
  await page.locator('.dsa-url').fill(upstream + '/absolute-redirect')
  await page.locator('.dsa-url').press('Enter')
  await page.waitForFunction(url => document.querySelector('.dsa-url')?.value === url && !document.querySelector('.dsa-empty'), upstream + '/destination?from=redirect#ready')
  frame = page.frames().find(f => f.url().includes('/destination'))
  assert(frame && new URL(frame.url()).hostname === 'localhost')
  await pick('跳转后仍可标注')
  await frame.locator('.dsa-card textarea').press('Enter')
  await frame.waitForFunction(() => document.querySelector('.dsa-pin')?.title === '跳转后仍可标注')
  pass('absolute redirects keep the live overlay and element picking')
  await page.locator('.dsa-url').fill('http://127.0.0.1:1/');await page.locator('.dsa-url').press('Enter')
  await page.waitForFunction(()=>document.querySelector('.dsa-empty')?.textContent.includes('预览暂时不可用'))
  assert(await page.getByRole('button',{name:'重试',exact:true}).isVisible());pass('unavailable service shows error and retry')
  assert.deepEqual(errors,[]);pass('no browser runtime exceptions')
} finally {
  await browser?.close();dispose.forEach(fn=>fn());
  for(const server of [host,app]){server.closeAllConnections();await new Promise(r=>server.close(r))}
}
