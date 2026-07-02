/* Durability regression test for the electron-store–backed persistence that the
   renderer's playerPrefs.ts / searchHistory.ts mirror into (via store.ts). Proves
   the property the "records lost on unclean shutdown" fix relies on: a synchronous
   .set() is on disk BEFORE the process can die, so it survives a force-kill (the
   "未關機" / power-loss / crash case) — unlike localStorage, which Chromium flushes
   lazily. A writer child sets the same keys the app uses (configName 'anime1-data',
   'prefs' + 'searchHistory') then SIGKILLs itself mid-run; a fresh process reads it
   back. Run: node scripts/persist-verify.mjs */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const confPath = require.resolve('conf') // electron-store's engine (no electron needed)
const ConfMod = require('conf')
const Conf = ConfMod.default || ConfMod

const dir = mkdtempSync(join(tmpdir(), 'anime1-persist-'))

// Writer child: mirror db.setPrefs / db.setSearchHistory, then hard-kill itself —
// no clean shutdown, no flush hook, exactly like a force-quit / power loss.
const writer = `
const M = require(${JSON.stringify(confPath)});
const Conf = M.default || M;
const s = new Conf({ cwd: ${JSON.stringify(dir)}, configName: 'anime1-data', projectName: 'anime1-persist-test' });
s.set('prefs', { volume: 0.42, rate: 1.75 });
s.set('searchHistory', ['進擊的巨人','孤獨搖滾','間諜家家酒']);
process.kill(process.pid, 'SIGKILL');
`
spawnSync(process.execPath, ['-e', writer], { stdio: 'ignore' })

// Fresh process = app restart after the unclean exit. Read what survived.
const s = new Conf({ cwd: dir, configName: 'anime1-data', projectName: 'anime1-persist-test' })
const prefs = s.get('prefs')
const hist = s.get('searchHistory')
rmSync(dir, { recursive: true, force: true })

let fail = 0
const ok = (c, m) => (c ? console.log('  ✓ ' + m) : (fail++, console.log('  ✗ ' + m)))
console.log('persistence durability — synchronous write survives an unclean (SIGKILL) exit')
ok(!!prefs && prefs.volume === 0.42 && prefs.rate === 1.75, 'volume/rate survived force-kill')
ok(Array.isArray(hist) && hist.length === 3, 'search history survived force-kill')
console.log(fail ? `\n${fail} failed ❌` : '\nPASS ✅ records survive an unclean shutdown')
process.exit(fail ? 1 : 0)
