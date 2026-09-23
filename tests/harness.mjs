/** Optional real-Harness acceptance test. Requires dsh and pnpm on PATH (or DSH_CLI). */
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { loadPlaywright } from './playwright.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = process.env.DSH_CLI || 'dsh'
const version = execFileSync(cli, ['--version'], { encoding: 'utf8' }).trim()
const cliPath = isAbsolute(cli) ? cli : execFileSync(process.platform === 'win32' ? 'where' : 'which', [cli], { encoding: 'utf8' }).trim().split('\n')[0]
const cliRequire = createRequire(realpathSync(cliPath))
const runtimeVersions = {}
for (const name of ['dsh-web-app', 'dsh-api-session-controller']) {
  const manifest = JSON.parse(await readFile(cliRequire.resolve(`@deepseek-ai/${name}/package.json`), 'utf8'))
  runtimeVersions[name] = manifest.version
}
const temporary = await mkdtemp(join(tmpdir(), 'anno-harness-'))
const workspace = join(temporary, 'workspace')
const requests = []
const responseText = 'Local annotation acceptance check completed.'
const comment = 'Disable this button until the form changes.'
let annotationReceived
const delivered = new Promise((resolve) => { annotationReceived = resolve })
const model = http.createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = raw ? JSON.parse(raw) : {}
  requests.push(body)
  if (JSON.stringify(body.messages || []).includes(comment)) annotationReceived()
  const base = { id: 'local-acceptance', created: 1, model: body.model || 'deepseek-flash' }
  const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
  if (body.stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    for (const delta of [{ role: 'assistant', content: '' }, { content: responseText }]) {
      res.write('data: ' + JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\n')
    }
    res.end('data: ' + JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage }) + '\n\ndata: [DONE]\n\n')
  } else {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: responseText }, finish_reason: 'stop' }], usage }))
  }
})
const env = {
  ...process.env, DSH_HOME: join(temporary, 'home'), DSH_TELEMETRY_DISABLED: '1',
  DSH_ANNOTATE_TEST_API_KEY: 'local-test-only',
}
let harness, browser, page
let logs = ''
try {
  await mkdir(workspace)
  await writeFile(join(workspace, 'index.html'), '<!doctype html><html><head><title>Annotation acceptance</title></head><body><button id="save" style="margin:40px;padding:16px">Save changes</button></body></html>')
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--workspace', 'packages/dsh-annotate', '--pack-destination', temporary, '--cache', join(temporary, 'npm-cache'), '--json'], { cwd: repo, encoding: 'utf8' }))
  execFileSync(cli, ['plugin', '--profile', 'web', 'add', join(temporary, pack.filename)], { cwd: workspace, env, stdio: 'pipe' })
  console.log('PASS real Harness installs the packed plugin into a clean profile')
  await new Promise((resolve, reject) => { model.once('error', reject); model.listen(0, '127.0.0.1', resolve) })
  // Use official browser directory picking in automation, so no native OS
  // chooser appears. Only the model endpoint is simulated; Harness is real.
  await writeFile(join(env.DSH_HOME, 'profiles', 'web', 'cordis.patch.yml'), `
- id: directory-picker
  disabled: true
- id: llm-deepseek
  config:
    baseURL: http://127.0.0.1:${model.address().port}/v1
    apiKeyEnv: DSH_ANNOTATE_TEST_API_KEY
    thinking: disabled
- insert:
    - name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
    - name: dsh-annotate
`)
  harness = spawn(cli, ['web', '--host', '127.0.0.1', '--port', '0', '--no-open'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Harness did not become ready')), 45_000)
    const read = (chunk) => {
      logs += String(chunk)
      const match = logs.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)
      if (match) { clearTimeout(timer); resolve(match[0]) }
    }
    harness.stdout.on('data', read)
    harness.stderr.on('data', read)
    harness.once('error', (error) => { clearTimeout(timer); reject(error) })
    harness.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Harness exited (${code})`)) })
  })
  const { chromium } = await loadPlaywright()
  browser = await chromium.launch({ channel: 'chromium' })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' })
  page.setDefaultTimeout(15_000)
  await page.goto(url)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Choose workspace', exact: true }).click()
  // These controls belong to the real Harness directory browser.
  await page.getByRole('dialog').waitFor()
  await page.getByRole('dialog').getByRole('button', { name: 'Edit path', exact: true }).click()
  const pathInput = page.getByRole('dialog').getByRole('textbox')
  await pathInput.fill(workspace)
  await pathInput.press('Enter')
  await page.getByRole('dialog').getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  const composer = page.locator('[data-composer-input][contenteditable="true"]')
  await composer.fill('Start the annotation acceptance check.')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.getByText(responseText, { exact: true }).first().waitFor()
  await composer.fill('Keep this unrelated draft.')
  await page.locator('.dsa-open').click()
  await page.locator('.dsa-col').waitFor()
  const address = page.locator('.dsa-url, .dsa-openrow input')
  await address.fill(pathToFileURL(join(workspace, 'index.html')).href)
  await address.press('Enter')
  await page.waitForFunction(() => document.querySelector('.dsa-frame') && !document.querySelector('.dsa-empty'))
  const preview = page.frames().find(frame => frame !== page.mainFrame())
  assert(preview)
  await preview.locator('#save').waitFor()
  console.log('PASS real Harness loads the annotation panel and previews its workspace')
  await page.locator('.dsa-foot button[aria-pressed]').click()
  await preview.locator('#save').click({ force: true })
  await preview.locator('.dsa-card textarea').fill(comment)
  await preview.locator('.dsa-card textarea').press('Enter')
  await preview.waitForFunction(() => document.querySelectorAll('.dsa-pin').length === 1)
  await page.locator('.dsa-send').click()
  await page.waitForFunction(() => document.querySelector('.dsa-notice')?.textContent.includes('Conversation accepted'))
  assert.equal(await composer.innerText(), 'Keep this unrelated draft.')
  await preview.waitForFunction(() => !document.querySelector('.dsa-pin'))
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The local model did not receive the annotation')), 15_000)
    delivered.then(() => { clearTimeout(timer); resolve() })
  })
  assert(requests.some(request => JSON.stringify(request.messages || []).includes(comment) && JSON.stringify(request.messages || []).includes('button#save')))
  assert(!requests.some(request => JSON.stringify(request.messages || []).includes('Keep this unrelated draft.')))
  console.log('PASS real Harness accepts the annotation, delivers its context to the local model, and preserves the unrelated draft')
  console.log('VERSIONS', JSON.stringify({ cli: version, ...runtimeVersions, node: process.version, chromium: browser.version(), platform: process.platform, arch: process.arch }))
} catch (error) {
  if (page) {
    console.error((await page.locator('body').innerText().catch(() => '')).slice(-6000))
    await mkdir(join(repo, 'tests', 'shots'), { recursive: true })
    await page.screenshot({ path: join(repo, 'tests', 'shots', 'harness-failure.png') }).catch(() => {})
  }
  console.error(logs.replace(/token=[\w-]+/g, 'token=[redacted]').slice(-4000))
  throw error
} finally {
  await browser?.close()
  if (harness && harness.exitCode === null) {
    await new Promise((resolve) => {
      const timer = setTimeout(() => { harness.kill('SIGKILL'); resolve() }, 4000)
      harness.once('exit', () => { clearTimeout(timer); resolve() })
      harness.kill('SIGTERM')
    })
  }
  model.closeAllConnections()
  await new Promise((resolve) => model.close(resolve))
  await rm(temporary, { recursive: true, force: true })
}
