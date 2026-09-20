import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const cache = mkdtempSync(join(tmpdir(),'dsh-annotate-pack-'))
try {
  const [pack] = JSON.parse(execFileSync('npm',['pack','--dry-run','--json','--cache',cache],{cwd:new URL('../packages/dsh-annotate/',import.meta.url),encoding:'utf8'}))
  const files = new Set(pack.files.map(file=>file.path))
  for(const file of ['lib/index.js','lib/client.js','lib/shim.js','lib/overlay.js']) assert(files.has(file),`package missing ${file}`)
  console.log('PASS distribution contains host, client, shim and overlay')
} finally { rmSync(cache,{recursive:true,force:true}) }
