/**
 * Build both published packages, syntax-check every first-party file, and
 * validate the UI message catalog.
 *
 *   node scripts/check.mjs
 *
 * The build half regenerates `packages/dsh-annotate/lib/*` from `src/`, so a
 * stale committed bundle cannot pass unnoticed, and CI additionally asserts
 * that the regeneration left the working tree clean.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(repo, 'packages', 'dsh-annotate', 'src')
const SKIP = new Set(['node_modules', 'shots', 'fixtures'])
const EXTENSIONS = ['.js', '.mjs', '.cjs']

function collect(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) collect(path, found)
    else if (EXTENSIONS.some((extension) => entry.name.endsWith(extension))) found.push(path)
  }
  return found
}

const check = (command, args) =>
  execFileSync(command, args, { cwd: repo, stdio: 'inherit' })

// 1. Regenerate the committed bundles from source.
check('node', ['packages/dsh-annotate/build.mjs'])

// 2. Parse every first-party file. `--check` never executes them, so browser
//    and Playwright-only code is safe to include.
const files = ['packages', 'scripts', 'tests', 'examples'].flatMap((root) =>
  collect(join(repo, root))
)

let failed = 0
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (error) {
    failed += 1
    console.error(`syntax error: ${file}`)
    console.error(String(error.stderr || error.message).trim())
  }
}

// 3. The message catalog must stay consistent: both languages complete, every
//    literal key present, and every host error code translatable. `dsaI18n` is a
//    plain script rather than a module, so it is loaded the way build.mjs ships it.
const problems = []
try {
  const i18nSource = readFileSync(join(src, 'i18n.js'), 'utf8')
  const dsaI18n = new Function(`${i18nSource}\nreturn dsaI18n`)()
  const english = Object.keys(dsaI18n('en').catalog('en'))
  const chinese = Object.keys(dsaI18n('zh').catalog('zh'))
  const missingZh = english.filter((key) => !chinese.includes(key))
  const missingEn = chinese.filter((key) => !english.includes(key))
  if (missingZh.length) problems.push(`not translated to zh: ${missingZh.join(', ')}`)
  if (missingEn.length) problems.push(`not translated to en: ${missingEn.join(', ')}`)

  const known = new Set(english)
  for (const file of ['client.js', 'overlay.js', 'shim.js', 'host.js']) {
    const text = readFileSync(join(src, file), 'utf8')
    for (const [, key] of text.matchAll(/\bt\('([a-zA-Z][\w.]*)'/g)) {
      if (key.endsWith('.')) continue // a dynamic family, e.g. 'host.' + code
      if (!known.has(key)) problems.push(`${file} uses unknown catalog key "${key}"`)
    }
  }

  const host = readFileSync(join(src, 'host.js'), 'utf8')
  for (const [, code] of host.matchAll(/code:\s*'([A-Za-z]+)'/g)) {
    if (!known.has(`host.${code}`)) problems.push(`host.js code "${code}" has no host.${code} message`)
  }
} catch (error) {
  problems.push(`catalog could not be loaded: ${error.message}`)
}

if (problems.length) {
  failed += problems.length
  for (const problem of problems) console.error(`catalog: ${problem}`)
}

if (failed > 0) {
  console.error(`\n${failed} problem(s) found`)
  process.exit(1)
}
console.log(`check ok: built lib/, parsed ${files.length} files, catalog consistent`)
