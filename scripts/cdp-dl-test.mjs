// Drive the real packaged app via Chrome DevTools Protocol to test the
// full download -> local-playback loop. Requires the app launched with
// --remote-debugging-port=9222.
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

const CAT = '1880'

const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
if (!page) throw new Error('no page target')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (d.id && pending.has(d.id)) {
    const { res, rej } = pending.get(d.id)
    pending.delete(d.id)
    d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result)
  }
}
const send = (method, params) =>
  new Promise((res, rej) => {
    const i = ++id
    pending.set(i, { res, rej })
    ws.send(JSON.stringify({ id: i, method, params }))
  })
await new Promise((r) => (ws.onopen = r))
await send('Runtime.enable')
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
}

const eps = await ev(`window.api.episodes('${CAT}')`)
console.log('episodes fetched:', eps.length)
const e0 = eps[0]
const payload = {
  catId: CAT,
  title: 'CDP test',
  episodes: [{ postId: e0.postId, title: e0.title, episodeNum: 1, apireq: e0.apireq }]
}
await ev(`window.api.downloadStart(${JSON.stringify(payload)})`)
console.log('download started for postId', e0.postId)

const file = path.join(os.homedir(), 'AppData/Roaming/anime1-netflix/downloads', CAT, e0.postId + '.mp4')
let ok = false
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 2000))
  const dl = await ev(`window.api.downloadAll()`)
  const ep = dl[CAT]?.episodes?.[e0.postId]
  const pct = ep?.total ? Math.round((ep.bytes / ep.total) * 100) : 0
  process.stdout.write(`\r  status=${ep?.status} ${pct}%   `)
  if (ep?.status === 'done') {
    ok = true
    break
  }
  if (ep?.status === 'error') break
}
console.log('')
console.log('file on disk:', fs.existsSync(file), fs.existsSync(file) ? (fs.statSync(file).size / 1e6).toFixed(1) + ' MB' : '')

const url = await ev(
  `window.api.streamUrl(${JSON.stringify({ catId: CAT, postId: e0.postId, apireq: e0.apireq })})`
)
console.log('streamUrl after download:', url, '->', url.includes('/file/') ? 'LOCAL ✓' : 'still online ✗')
console.log(ok ? '\nDOWNLOAD TEST PASSED' : '\nDOWNLOAD TEST INCOMPLETE')
ws.close()
