import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
const require = createRequire(import.meta.url)
const asar = require('@electron/asar')

// Repo root = parent of scripts/ (portable — no hard-coded machine path).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASAR = path.join(ROOT, 'release/win-unpacked/resources/app.asar')
const BAK = ASAR + '.bak'
const STAGING = path.join(ROOT, '.asar-staging')

// Why this exists: `npm run dist` (electron-builder) is broken on the dev
// machine (winCodeSign can't create darwin symlinks without Developer Mode).
// This ships a fresh `out/` into the EXISTING packaged app without rebuilding
// the installer: back up app.asar, extract it (keeps bundled prod node_modules),
// swap in out/, repack. Run AFTER `npm run build` (or use `npm run deploy`).

if (!fs.existsSync(ASAR)) {
  console.error('no app.asar at', ASAR, '\nbuild & package once (npm run dist:dir) before using this.')
  process.exit(1)
}

// 1) backup once
if (!fs.existsSync(BAK)) {
  fs.copyFileSync(ASAR, BAK)
  console.log('backed up ->', BAK)
} else console.log('backup already exists, keeping it')

// 2) extract current asar (preserves bundled node_modules + package.json)
if (fs.existsSync(STAGING)) fs.rmSync(STAGING, { recursive: true, force: true })
asar.extractAll(ASAR, STAGING)
console.log('extracted asar -> staging')

// 3) swap in freshly-built out/
fs.rmSync(path.join(STAGING, 'out'), { recursive: true, force: true })
fs.cpSync(path.join(ROOT, 'out'), path.join(STAGING, 'out'), { recursive: true })
console.log('swapped staging/out with fresh build')

// 4) repack
await asar.createPackage(STAGING, ASAR)
const sz = fs.statSync(ASAR).size
console.log('repacked app.asar, size =', (sz / 1e6).toFixed(1), 'MB')

// 5) cleanup staging
fs.rmSync(STAGING, { recursive: true, force: true })
console.log('done')
