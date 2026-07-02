/* Unit verification for the renderer's pure logic in src/renderer/src/lib.ts.
   lib.ts imports only TYPES from ./api (erased at compile), so we can esbuild-
   transform it in isolation and exercise the real functions — no live network,
   unlike smoke.mjs / my-smoke.cjs. Run: node scripts/lib-verify.mjs */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import esbuild from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const libPath = join(here, '..', 'src', 'renderer', 'src', 'lib.ts')
const { code } = await esbuild.transform(readFileSync(libPath, 'utf8'), {
  loader: 'ts',
  format: 'esm'
})
const out = join(mkdtempSync(join(tmpdir(), 'libverify-')), 'lib.mjs')
writeFileSync(out, code)
const lib = await import(pathToFileURL(out).href)

let pass = 0
let fail = 0
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
    console.log(`  ✓ ${msg}`)
  } else {
    fail++
    console.log(`  ✗ ${msg}\n      expected ${e}\n      got      ${a}`)
  }
}
function ok(cond, msg) {
  eq(!!cond, true, msg)
}

const { titleCore, recommendedUnified, sampleRecommended } = lib

console.log('titleCore — cross-source identity key')
eq(titleCore('鬼滅之刃（Demon Slayer）'), '鬼滅之刃', 'drops parenthetical English, keeps CJK core')
eq(titleCore('孤獨搖滾！（Bocchi the Rock!）'), '孤獨搖滾', 'strips punctuation + parenthetical')
ok(
  titleCore('孤獨搖滾！（Bocchi the Rock!）') === titleCore('孤獨搖滾!'),
  'same show across sources → equal core'
)
eq(titleCore('鬼滅之刃 第二季'), '鬼滅之刃第二季', 'keeps season marker (CJK)')
ok(titleCore('鬼滅之刃 第二季') !== titleCore('鬼滅之刃'), 'different seasons → different core')
// empty-core edge: pure-symbol/latin titles collapse to '' and would collide.
// Callers must treat '' as "no identity" (Detail/MyselfDetail guard `c ? … : undefined`).
eq(titleCore('!!!'), '', 'pure-symbol title → empty core (must be treated as no-match)')

console.log('recommendedUnified — merge anime1 + myself-exclusive, franchise dedup')
const list = [
  { catId: '1', title: '間諜家家酒', episodes: '', year: '2022', season: '', group: '' },
  { catId: '2', title: '冷門作品', episodes: '', year: '2022', season: '', group: '' } // low votes → filtered
]
const meta = {
  '1': { found: true, score: 8.5, votes: 500 },
  '2': { found: true, score: 9.9, votes: 5 }
}
const myCatalog = [
  { id: 'm1', title: '間諜家家酒 第二季', episodes: 12, views: 0, kind: 'anime', score: 8.0, votes: 400 }, // franchise dup of catId 1
  { id: 'm2', title: '孤獨搖滾！', episodes: 12, views: 0, kind: 'anime', score: 9.0, votes: 600 }, // myself-exclusive
  { id: 'm3', title: '超冷門', episodes: 12, views: 0, kind: 'anime', score: 9.9, votes: 10 } // low votes → filtered
]
const reco = recommendedUnified(list, meta, myCatalog)
const ids = reco.map((it) => ('catId' in it ? `a1:${it.catId}` : `my:${it.id}`))
ok(
  ids.includes('a1:1'),
  'anime1 title with enough votes is included'
)
ok(!ids.includes('my:m1'), 'myself title sharing a franchise with anime1 is dropped (anime1 primary)')
ok(ids.includes('my:m2'), 'myself-exclusive popular title is included')
ok(!ids.includes('my:m3'), 'below-minVotes myself title is filtered out')
ok(!ids.includes('a1:2'), 'below-minVotes anime1 title is filtered out')
// composite score: 孤獨搖滾 (9.0/600) should outrank 間諜家家酒 (8.5/500)
ok(ids.indexOf('my:m2') < ids.indexOf('a1:1'), 'sorted by composite score (higher first)')

console.log('sampleRecommended<T> — generic, works on mixed array, deterministic per seed')
const pool = reco
const s1 = sampleRecommended(pool, 2, 123)
const s2 = sampleRecommended(pool, 2, 123)
eq(s1.length, Math.min(2, pool.length), 'returns n items (or pool size)')
eq(s1, s2, 'same seed → identical result (stable shuffle)')
ok(
  s1.every((it) => pool.includes(it)),
  'every picked item comes from the pool (no fabrication)'
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
