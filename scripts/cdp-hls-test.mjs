// Verify the anime1.cc HLS fix end-to-end by driving the running app via CDP.
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// 1) year range fix
const years = await ev(`window.api.ccYears()`)
console.log('[1] ccYears:', years[0], '...', years[years.length-1], '(total '+years.length+')',
  years.includes('2011') && years.includes('2003') ? '✓ 2003-2012 now included' : '✗ missing old years')

// 2) Rick & Morty S9 episodes + stream url
const animeId = '703357864'
const eps = await ev(`window.api.ccEpisodes('${animeId}')`)
console.log('[2] 瑞克和莫蒂第九季 episodes:', eps.length, '| first epId =', eps[0]?.epId)
const sres = await ev(`window.api.ccStreamUrl('${eps[0].epId}')`)
console.log('[3] ccStreamUrl ->', JSON.stringify(sres))
console.log('    hls flag:', sres.hls === true ? '✓ HLS' : '✗ not flagged hls', '| url has .m3u8:', /\.m3u8/.test(sres.url) ? '✓' : '✗')

// 3) actually play it in-app via hls.js
console.log('[4] navigating app to the player and waiting for hls.js to load frames…')
await ev(`(()=>{ window.location.hash = '#/watch/cc/${animeId}/${eps[0].epId}'; return true })()`)
let ok = false, last = {}
for (let i = 0; i < 30; i++) {
  await sleep(1000)
  last = await ev(`(()=>{ const v=document.querySelector('video'); const e=[...document.querySelectorAll('p')].map(p=>p.textContent).find(t=>t&&t.includes('載入失敗')); return { has:!!v, rs:v?v.readyState:-1, dur:v?(isFinite(v.duration)?+v.duration.toFixed(1):0):0, ct:v?+(v.currentTime||0).toFixed(1):0, paused:v?v.paused:null, errCode:v&&v.error?v.error.code:null, errText:e||null } })()`)
  if (last.dur > 0 && last.rs >= 2) { ok = true; break }
  if (last.errText) break
}
console.log('    video state:', JSON.stringify(last))
console.log(ok ? '\n✅ HLS PLAYBACK OK — hls.js loaded the stream (duration>0, readyState>=2)' :
                 '\n❌ HLS playback did not reach ready state — see state above')
ws.close()
