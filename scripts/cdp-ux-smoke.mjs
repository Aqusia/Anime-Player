// UI/UX smoke test — drives the running app via CDP and checks: home render
// (cards + fade-in), skeleton CSS, back-to-top, `/` search focus, and the
// player (playback, OSD feedback, M/S/數字 shortcuts, exit-flush progress save).
//
// Start the app with a debug port first, e.g.:
//   release/win-unpacked/Anime1.exe --remote-debugging-port=9222
// or (dev build):  node_modules/electron/dist/electron.exe . --remote-debugging-port=9222
// If the window is covered by other windows, Chromium's occlusion detection
// marks the page hidden and scroll-driven checks fail — add
// --disable-features=CalculateNativeWinOcclusion when launching.
const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
if (!page) throw new Error('no CDP page target')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const consoleErrors = []
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
    consoleErrors.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
  }
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
await send('Page.enable')
// occluded windows suspend rendering steps (scroll events never fire) — bring
// the window forward so scroll-driven UI behaves like real use
await send('Page.bringToFront')
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pass = 0, fail = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${extra ? ' — ' + extra : ''}`)
  ok ? pass++ : fail++
}

// ---- 1) Home renders
console.log('[1] Home')
await ev(`(()=>{ window.location.hash = '#/'; return true })()`)
let home = {}
for (let i = 0; i < 30; i++) {
  await sleep(1000)
  home = await ev(`(()=>{
    const rows = [...document.querySelectorAll('h2')].map(h=>h.textContent||'')
    const cards = document.querySelectorAll('img.img-fade').length
    const skel = document.querySelectorAll('.skeleton').length
    return { rows: rows.slice(0,6), cards, skel, reco: rows.some(t=>t.includes('為你推薦')) }
  })()`)
  if (home.cards > 10) break
}
check('poster cards rendered (img-fade)', home.cards > 10, `${home.cards} covers`)
check('為你推薦 row present', home.reco)

// fade-in actually completes (covers get .loaded)
const loaded = await ev(`document.querySelectorAll('img.img-fade.loaded').length`)
check('covers faded in (.loaded)', loaded > 5, `${loaded} loaded`)

// ---- 2) skeleton CSS exists
const hasSkeletonCss = await ev(`(()=>{
  for (const sh of document.styleSheets) {
    try { for (const r of sh.cssRules) if (r.selectorText && r.selectorText.includes('.skeleton')) return true } catch {}
  }
  return false
})()`)
check('.skeleton css rule present', hasSkeletonCss)

// ---- 3) back-to-top button appears after scrolling (needs a visible page —
// occluded windows pause rendering steps and scroll events never fire)
const visible = await ev(`document.visibilityState`)
if (visible === 'hidden') {
  console.log('  - 回到頂部 check SKIPPED (window occluded; relaunch with --disable-features=CalculateNativeWinOcclusion and keep it visible)')
} else {
  await ev(`(()=>{ window.scrollTo(0, 2000); return true })()`)
  await sleep(400)
  const btt = await ev(`!!document.querySelector('button[title="回到頂部"]')`)
  check('回到頂部 button appears after scroll', btt)
  await ev(`(()=>{ window.scrollTo(0, 0); return true })()`)
}

// ---- 4) nav search: / focuses input
await ev(`(()=>{ window.dispatchEvent(new KeyboardEvent('keydown', {key:'/', bubbles:true})); return true })()`)
await sleep(200)
const focused = await ev(`document.activeElement && document.activeElement.tagName === 'INPUT'`)
check('/ focuses the search box', focused)
await ev(`(()=>{ document.activeElement && document.activeElement.blur(); return true })()`)

// ---- 5) player: pick a continue-watching/first anime with episodes and play ep1
console.log('[2] Player')
// prefer a multi-episode anime so the 選集 drawer check is representative
const picked = await ev(`(async () => {
  const l = await window.api.list()
  for (const a of l.slice(0, 8)) {
    const eps = await window.api.episodes(a.catId).catch(() => [])
    if (eps.length > 1) return { catId: a.catId, postId: eps[0].postId }
  }
  const eps = await window.api.episodes(l[0].catId)
  return eps[0] ? { catId: l[0].catId, postId: eps[0].postId } : null
})()`)
const animeId = picked?.catId
const ep = picked ? { postId: picked.postId } : null
if (!ep) {
  check('episodes available for player test', false)
} else {
  // remember prior progress so we can restore it afterwards
  const prior = await ev(`window.api.progressOne('${animeId}', '${ep.postId}')`)
  await ev(`(()=>{ window.location.hash = '#/watch/me/${animeId}/${ep.postId}'; return true })()`)
  let st = {}
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    st = await ev(`(()=>{ const v=document.querySelector('video'); return { has:!!v, rs:v?v.readyState:-1, dur:v&&isFinite(v.duration)?+v.duration.toFixed(1):0 } })()`)
    if (st.dur > 0 && st.rs >= 2) break
  }
  check('video playable (readyState>=2, duration>0)', st.dur > 0 && st.rs >= 2, JSON.stringify(st))

  // OSD: ArrowRight → "+10 秒" flash + currentTime advance
  const t0 = await ev(`document.querySelector('video').currentTime`)
  await ev(`(()=>{ window.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight'})); return true })()`)
  await sleep(250)
  const osd1 = await ev(`(()=>{ const el=document.querySelector('.osd-flash'); return el ? el.textContent : null })()`)
  const t1 = await ev(`document.querySelector('video').currentTime`)
  check('→ key: OSD "+10 秒" shown', osd1 === '+10 秒', String(osd1))
  check('→ key: currentTime advanced ~10s', t1 - t0 > 8, `${t0.toFixed(1)} → ${t1.toFixed(1)}`)

  // OSD: m → 靜音
  await ev(`(()=>{ window.dispatchEvent(new KeyboardEvent('keydown', {key:'m'})); return true })()`)
  await sleep(250)
  const osd2 = await ev(`(()=>{ const el=document.querySelector('.osd-flash'); return el ? el.textContent : null })()`)
  const mutedNow = await ev(`document.querySelector('video').muted`)
  check('M key: mutes + OSD', mutedNow === true && osd2 === '靜音', String(osd2))
  await ev(`(()=>{ window.dispatchEvent(new KeyboardEvent('keydown', {key:'m'})); return true })()`)

  // OS media integration: metadata should carry the anime + episode title
  const msTitle = await ev(`navigator.mediaSession.metadata ? navigator.mediaSession.metadata.title : null`)
  check('MediaSession metadata set', !!msTitle, String(msTitle))

  // 選集 drawer: E opens it, lists every episode, highlights the current one
  await ev(`(()=>{ window.dispatchEvent(new KeyboardEvent('keydown', {key:'e'})); return true })()`)
  await sleep(400)
  const epCount = await ev(`window.api.episodes('${animeId}').then(e => e.length)`)
  const drawer = await ev(`(()=>{
    const head = [...document.querySelectorAll('span')].find(s => (s.textContent||'').startsWith('選集'))
    if (!head) return null
    const panel = head.closest('.absolute')
    const items = [...panel.querySelectorAll('.overflow-y-auto button')]
    return { items: items.length, current: items.filter(b => b.className.includes('bg-brand')).length, playing: items.some(b => (b.textContent||'').includes('播放中')) }
  })()`)
  check('選集 drawer opens (E) and lists all eps', !!drawer && drawer.items === epCount, JSON.stringify(drawer))
  check('選集 highlights current episode', !!drawer && drawer.current === 1 && drawer.playing)
  // Esc closes the drawer without leaving the player
  await ev(`(()=>{ window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'})); return true })()`)
  await sleep(300)
  const afterEsc = await ev(`(()=>({ drawer: ![...document.querySelectorAll('span')].some(s => (s.textContent||'').startsWith('選集') && s.closest('.absolute.top-0.right-0')), onWatch: location.hash.includes('/watch/') }))()`)
  check('Esc closes 選集 but stays in player', afterEsc.drawer && afterEsc.onWatch)

  // number key: 5 → 50%
  await ev(`(()=>{ window.dispatchEvent(new KeyboardEvent('keydown', {key:'5'})); return true })()`)
  await sleep(250)
  const half = await ev(`(()=>{ const v=document.querySelector('video'); return Math.abs(v.currentTime - v.duration*0.5) < 2 })()`)
  check('5 key: jumps to 50%', half)

  // exit-flush: seek somewhere distinctive (70% — must stay inside the episode,
  // shorts can be only ~90s long), wait for the seek to land, then leave and
  // read the saved progress
  const target = await ev(`(()=>{ const v=document.querySelector('video'); const t=Math.round(v.duration*0.7); v.currentTime=t; return t })()`)
  for (let i = 0; i < 20; i++) {
    await sleep(200)
    const landed = await ev(`(()=>{ const v=document.querySelector('video'); return !v.seeking && Math.abs(v.currentTime-${target})<3 })()`)
    if (landed) break
  }
  await ev(`(()=>{ window.location.hash = '#/'; return true })()`)
  await sleep(800)
  const saved = await ev(`window.api.progressOne('${animeId}', '${ep.postId}')`)
  check(`progress flushed on exit (~${target}s)`, saved && Math.abs(saved.position - target) < 6, `saved=${saved && saved.position}`)

  // restore prior progress state (avoid polluting the user's data)
  if (prior) {
    await ev(`window.api.setProgress(${JSON.stringify(prior)}).then(()=>true)`)
    console.log('  (restored prior progress record)')
  } else {
    await ev(`window.api.progressRemoveAnime('${animeId}').then(()=>true)`)
    console.log('  (removed test progress record)')
  }
}

// ---- 6) console errors
check('no renderer console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`)
ws.close()
process.exit(fail === 0 ? 0 : 1)
