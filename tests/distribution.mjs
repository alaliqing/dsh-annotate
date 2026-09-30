import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
const packageDir = new URL('../packages/dsh-annotate/',import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', packageDir),'utf8'))
const patch = await readFile(new URL('cordis.patch.yml', packageDir),'utf8')
assert.equal(manifest.dsh?.bundle?.patch,'./cordis.patch.yml')
assert.equal(manifest.peerDependenciesMeta?.['@deepseek-ai/cordis']?.optional,true, 'Harness supplies Cordis; a clean profile must not require a second runtime installation')
assert.equal(manifest.exports?.['./cordis.patch.yml'],'./cordis.patch.yml')
assert.match(patch,/^\s+- id: dsh-annotate\s*\n\s+name: dsh-annotate\s*$/m)
const cache = mkdtempSync(join(tmpdir(),'dsh-annotate-pack-'))
try {
  const [pack] = JSON.parse(execFileSync('npm',['pack','--dry-run','--json','--cache',cache],{cwd:packageDir,encoding:'utf8'}))
  const files = new Set(pack.files.map(file=>file.path))
  for(const file of ['lib/index.js','lib/client.js','lib/shim.js','lib/overlay.js','cordis.patch.yml']) assert(files.has(file),`package missing ${file}`)
  console.log('PASS distribution contains its bundle patch, host, client, shim and overlay')
} finally { rmSync(cache,{recursive:true,force:true}) }
