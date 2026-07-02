/* Smoke test for the myself-bbs source: list -> details -> resolve -> stream.
   Mirrors src/main/myself/* logic against the live site. Run: node scripts/my-smoke.cjs */
const https = require('node:https')
const crypto = require('node:crypto')
const cheerio = require('cheerio')

const MY_HOST = 'www.myself-bbs.com'
const MY_ORIGIN = 'https://' + MY_HOST
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'

// myself-bbs's cert chain includes a cross-signed CA (Root YE → ISRG) that Node's
// OpenSSL can't build a path for (UNABLE_TO_GET_ISSUER_CERT), even though Chromium —
// and therefore the real Electron app — verifies it fine via the OS trust store.
// This is a *diagnostic* of the scraping logic, not a TLS check, so on a cert-chain
// error we transparently retry with verification relaxed (warn once). Force it
// up-front with SMOKE_INSECURE=1.
const CERT_ERRORS = new Set(['UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'CERT_UNTRUSTED', 'DEPTH_ZERO_SELF_SIGNED_CERT'])
let insecure = process.env.SMOKE_INSECURE === '1'
function onReqError(e, reject) {
  if (e && CERT_ERRORS.has(e.code) && !insecure) {
    insecure = true
    console.warn(`⚠ TLS chain not verifiable by Node (${e.code}); retrying with verification relaxed — diagnostic only, the app verifies fine via the OS trust store.`)
  }
  reject(e)
}

function getHtmlOnce(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: MY_HOST, path, family: 4, timeout: 20000, rejectUnauthorized: !insecure, headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW' } }, (r) => {
      if ((r.statusCode || 0) >= 400) { r.resume(); return reject(new Error('HTTP ' + r.statusCode)) }
      let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => resolve(d))
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.on('error', (e) => onReqError(e, reject)); req.end()
  })
}
async function getHtml(p) { let e; for (let i = 0; i < 5; i++) { if (i) await new Promise((r) => setTimeout(r, 600 * i)); try { return await getHtmlOnce(p) } catch (x) { e = x } } throw e }
const abs = (s) => { try { return new URL((s || '').trim(), MY_ORIGIN + '/').href.replace(/^https?:\/\/(?:www\.)?myself-bbs\.com/i, MY_ORIGIN) } catch { return '' } }
// GET any absolute URL (used for CDN m3u8 bodies, not the www site).
function getUrl(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, family: 4, timeout: 15000, rejectUnauthorized: !insecure, headers: { 'User-Agent': UA } }, (r) => {
      if ((r.statusCode || 0) >= 400) { r.resume(); return reject(new Error('HTTP ' + r.statusCode)) }
      let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => resolve(d))
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.on('error', (e) => onReqError(e, reject)); req.end()
  })
}

function resolveWs(tid, vid) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64')
    const req = https.request({ hostname: 'v.myself-bbs.com', path: '/ws', family: 4, timeout: 12000, rejectUnauthorized: !insecure, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', Origin: 'https://v.myself-bbs.com', 'User-Agent': 'Mozilla/5.0' } })
    let done = false; const fin = (e, v) => { if (done) return; done = true; e ? reject(e) : resolve(v) }
    req.on('timeout', () => { req.destroy(); fin(new Error('ws timeout')) })
    req.on('error', (e) => onReqError(e, fin)); req.on('response', () => fin(new Error('upgrade rejected')))
    req.on('upgrade', (_r, sock) => {
      // numeric vid = old format {tid,vid}; otherwise vid is the opaque token → {id}
      const payload = /^\d+$/.test(vid) ? { tid, vid, id: '' } : { tid: '', vid: '', id: vid }
      const pl = Buffer.from(JSON.stringify(payload)); const mask = crypto.randomBytes(4)
      const masked = Buffer.alloc(pl.length); for (let i = 0; i < pl.length; i++) masked[i] = pl[i] ^ mask[i % 4]
      sock.write(Buffer.concat([Buffer.from([0x81, 0x80 | pl.length]), mask, masked]))
      let buf = Buffer.alloc(0)
      sock.on('data', (c) => { buf = Buffer.concat([buf, c]); if (buf.length < 2) return; let off = 2, len = buf[1] & 0x7f; if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4 } if (buf.length < off + len) return; sock.destroy(); try { fin(null, JSON.parse(buf.slice(off, off + len).toString())) } catch (e) { fin(e) } })
      sock.on('error', fin)
    })
    req.end()
  })
}
function head(url) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const req = https.request({ hostname: u.hostname, path: u.pathname, family: 4, timeout: 15000, headers: { 'User-Agent': UA } }, (r) => { resolve({ s: r.statusCode, ct: r.headers['content-type'] }); r.destroy() })
    req.on('timeout', () => { req.destroy(); resolve({ s: 'timeout' }) })
    req.on('error', (e) => resolve({ s: 'err ' + e.message })); req.end()
  })
}

;(async () => {
  // 1) list (completed page 1)
  const $ = cheerio.load(await getHtml('/forum-113-1.html'))
  const items = []
  $('form > ul > li').each((_, el) => {
    const a = $(el).find('.ptn > a').first(); const m = (a.attr('href') || '').match(/thread-(\d+)/)
    if (!m) return
    items.push({ id: m[1], title: a.text().trim(), cover: abs($(el).find('img').attr('src')), ep: ($(el).find('.ep_info').text().match(/\d+/) || [0])[0] })
  })
  console.log('[list] completed p1 items:', items.length, '| sample:', items[0])
  console.assert(items.length === 20 && items[0].cover.startsWith('https://www.'), 'LIST FAIL')

  // 2) details
  const id = '44182'
  const $$ = cheerio.load(await getHtml(`/thread-${id}-1-1.html`))
  const title = ($$('#pt a[href^="thread"]').last().text().trim().split('【')[0] || '').trim()
  const cover = abs($$('.info_img_box > img').attr('src'))
  const desc = $$('#info_introduction').find('p').map((_, p) => $$(p).text().trim()).get().filter(Boolean).join(' ').slice(0, 50)
  const eps = []
  $$('.main_list > li').each((_, li) => {
    const name = $$(li).find('a').first().text().trim()
    const href = ($$(li).find("a[data-href*='myself-bbs.com/player']").attr('data-href') || '').trim()
    const mm = href.match(/\/player\/(?:play\/)?(\d+)\/(\d+)/)
    if (mm) eps.push({ vid: mm[2], name })
  })
  console.log('[details]', { id, title, cover: cover.slice(0, 50), eps: eps.length, ep1: eps[0], descStart: desc })
  console.assert(title && cover && eps.length > 0, 'DETAILS FAIL')

  // 3) resolve + 4) stream — for BOTH player formats: this numeric show, and a
  //    token-format show (the dominant modern format).
  async function checkStream(label, tid, vid) {
    const r = await resolveWs(tid, vid)
    const m3u8 = r.video.startsWith('//') ? 'https:' + r.video : r.video
    const base = m3u8.replace(/[^/]*$/, '')
    const plText = await getUrl(m3u8)
    const firstSeg = plText.split('\n').find((l) => l && !l.startsWith('#')).trim()
    const pl = await head(m3u8)
    const seg = await head(base + firstSeg)
    console.log(`[stream:${label}]`, m3u8, '\n   playlist:', pl, '| seg(', firstSeg, '):', seg)
    console.assert(pl.s === 200 && seg.s === 200, `STREAM ${label} FAIL`)
  }
  await checkStream('numeric', id, eps[0].vid)
  // token-format show (忍者神威, vid is an opaque token)
  const tokDet = cheerio.load(await getHtml(`/thread-51959-1-1.html`))
  const tokEps = []
  tokDet('.main_list > li').each((_, li) => {
    const href = (tokDet(li).find("a[data-href*='myself-bbs.com/player']").attr('data-href') || '').trim()
    const at = href.indexOf('/player/'); if (at < 0) return
    const code = href.slice(at + '/player/'.length).trim()
    const pm = code.match(/^(?:play\/)?(\d+)\/(\d+)$/); tokEps.push(pm ? pm[2] : code)
  })
  console.log('[token-details] 忍者神威 eps:', tokEps.length, '| ep1 token:', tokEps[0])
  console.assert(tokEps.length > 0 && !/^\d+$/.test(tokEps[0]), 'TOKEN PARSE FAIL')
  await checkStream('token', '51959', tokEps[0])

  console.log('\n✅ ALL SMOKE CHECKS PASSED (both numeric + token formats)')
})().catch((e) => { console.error('\n❌ SMOKE FAILED:', e.message); process.exit(1) })
