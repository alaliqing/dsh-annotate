/** Check payload boundaries without DOM/browser dependencies. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const client = readFileSync(new URL('../packages/dsh-annotate/src/client.js', import.meta.url), 'utf8')
const catalog = readFileSync(new URL('../packages/dsh-annotate/src/i18n.js', import.meta.url), 'utf8')
const functions = client.slice(client.indexOf('function compactText('), client.indexOf('function annotationLabel('))
const format = lang => new Function('lang', catalog + '\nconst t = dsaI18n(lang).t;\n' + functions + '\nreturn payloadBlock')(lang)
const note = {
  tag: 'button', selector: 'button#save', selectorMatches: 1, comment: 'Disable until the form changes.',
  ariaLabel: 'Save changes', text: 'A much longer label from the app', component: 'SaveButton',
  componentChain: ['SaveButton', 'SettingsForm', 'SettingsPage'],
  testId: 'data-testid="save"', role: 'button',
  rect: { x: 640, y: 512, w: 96, h: 32 }, viewport: { w: 1440, h: 900 },
  styles: { display: 'flex', padding: '8px 16px', 'font-size': '14px', color: 'rgb(1,2,3)' },
}
const page = 'http://127.0.0.1:5173/settings?tab=general#form'
for (const lang of ['en', 'zh']) {
  const payload = format(lang)
  const compact = payload([note], page, note.viewport)
  assert.equal(compact.split('\n').length, 3)
  assert(compact.includes(page) && compact.includes(note.comment) && compact.includes(note.selector))
  assert(!compact.includes('SettingsPage') && !compact.includes('8px 16px') && !compact.includes('1440'))
  assert(!compact.includes('verify target') && !compact.includes('需核对'))
  for (const selectorMatches of [0, 3, -1, undefined]) {
    const ambiguous = payload([{ ...note, selectorMatches }], page, note.viewport)
    assert(ambiguous.includes(lang === 'zh' ? '需核对' : 'verify target'))
    assert(ambiguous.includes(note.testId) && ambiguous.includes('SaveButton'))
    assert(ambiguous.includes('96×32 @ (640, 512)') && ambiguous.includes('1440×900'))
    assert(!ambiguous.includes('8px 16px') && !ambiguous.includes('SettingsPage'))
  }
  const missing = payload([{ comment: 'Find the icon', tag: 'svg' }], page, note.viewport)
  assert(missing.includes(lang === 'zh' ? '无选择器' : 'no selector'))
  const comment = 'A complete multi-line note\n' + '不要截断这段批注'.repeat(50)
  const long = payload([{ ...note, comment, ariaLabel: 'Long target '.repeat(30) }], page, note.viewport)
  assert(long.includes(comment.replace(/\n/g, '\n   ')))
  assert(long.length < comment.length + 230, 'target labels must stay bounded')
  assert.equal(payload([], page, note.viewport), '')
}
console.log('PASS compact bilingual payloads preserve notes and exact URLs; ambiguous targets retain verification context')
