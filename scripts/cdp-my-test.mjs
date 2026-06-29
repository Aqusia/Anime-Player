// Verify the myself-bbs source end-to-end by driving the running app via CDP:
// IPC (details/search/streamUrl) + real in-app HLS playback through the proxy.
const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result) }
}
const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })) })
await new Promise((r) => (ws.onopen = r))
await send('Runtime.enable')
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const id0 = '51959' // 忍者神威 (13 eps, TOKEN format — the dominant modern format)

// 1) details
const det = await ev(`window.api.myselfDetails('${id0}')`)
console.log('[1] myselfDetails:', det && det.title, '| eps:', det && det.episodes.length, '| cover:', det && !!det.cover, '| ep1:', det && JSON.stringify(det.episodes[0]))

// 2) search (the user's pain point) — partial + traditional
const s1 = await ev(`window.api.myselfSearch('鋼之鍊金術師')`)
console.log('[2] search "鋼之鍊金術師":', s1.length, 'hits | top:', s1.slice(0, 3).map((x) => x.title))
const s2 = await ev(`window.api.myselfSearch('葬送的芙莉蓮')`)
console.log('    search "葬送的芙莉蓮":', s2.length, 'hits | top:', s2.slice(0, 3).map((x) => x.title))

// 3) stream url
const sres = await ev(`window.api.myselfStreamUrl('${id0}','${det.episodes[0].vid}')`)
console.log('[3] myselfStreamUrl ->', JSON.stringify(sres), '| hls:', sres.hls === true ? '✓' : '✗', '| proxy m3u8:', /\/myself\/.*\.m3u8/.test(sres.url) ? '✓' : '✗')

// 4) actually play in-app through the proxy via hls.js
console.log('[4] navigating to player, waiting for hls.js to load frames through the proxy…')
await ev(`(()=>{ window.location.hash = '#/watch/my/${id0}/${det.episodes[0].vid}'; return true })()`)
let ok = false, last = {}
for (let i = 0; i < 30; i++) {
  await sleep(1000)
  last = await ev(`(()=>{ const v=document.querySelector('video'); const e=[...document.querySelectorAll('p')].map(p=>p.textContent).find(t=>t&&t.includes('載入失敗')); return { has:!!v, rs:v?v.readyState:-1, dur:v?(isFinite(v.duration)?+v.duration.toFixed(1):0):0, ct:v?+(v.currentTime||0).toFixed(1):0, errText:e||null } })()`)
  if (last.dur > 0 && last.rs >= 2) { ok = true; break }
  if (last.errText) break
}
console.log('    video state:', JSON.stringify(last))
console.log(ok ? '\n✅ MYSELF PLAYBACK OK — hls.js loaded the stream through the proxy (duration>0, readyState>=2)'
               : '\n❌ playback did not reach ready state — see state above')
ws.close()
