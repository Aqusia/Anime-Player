// Standalone smoke test of the scraping pipeline (mirrors src/main logic).
import * as cheerio from 'cheerio'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const ORIGIN = 'https://anime1.me'

async function getHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: ORIGIN + '/', 'Accept-Language': 'zh-TW,zh;q=0.9' },
    redirect: 'follow'
  })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.text()
}

// 1. List
const listHtml = await getHtml('https://anime1.me/%E5%8B%95%E7%95%AB%E5%88%97%E8%A1%A8')
const $ = cheerio.load(listHtml)
const list = []
const seen = new Set()
$('table tr').each((_, tr) => {
  const tds = $(tr).find('td')
  if (tds.length < 5) return
  const link = $(tds[0]).find('a[href*="cat="]').first()
  const m = (link.attr('href') || '').match(/cat=(\d+)/)
  if (!m || seen.has(m[1])) return
  const title = link.text().trim()
  if (!title) return
  seen.add(m[1])
  list.push({
    catId: m[1],
    title,
    episodes: $(tds[1]).text().trim(),
    year: $(tds[2]).text().trim(),
    season: $(tds[3]).text().trim(),
    group: $(tds[4]).text().trim()
  })
})
console.log('LIST count =', list.length)
console.log('LIST sample =', JSON.stringify(list.slice(0, 3), null, 0))

// 2. Episodes for cat=1880
const catHtml = await getHtml('https://anime1.me/?cat=1880')
const $$ = cheerio.load(catHtml)
const eps = []
$$('article').each((_, el) => {
  const a = $$(el).find('.entry-title a, h1 a, h2 a').first()
  const pm = (a.attr('href') || '').match(/anime1\.me\/(\d+)/)
  const apireq = $$(el).find('video[data-apireq]').first().attr('data-apireq') || ''
  if (pm && apireq) eps.push({ postId: pm[1], title: a.text().trim(), apireq })
})
console.log('EPISODES count =', eps.length)
console.log('EPISODES sample =', eps.slice(0, 3).map((e) => ({ postId: e.postId, title: e.title })))

// 3. Resolve first episode
if (eps.length) {
  const res = await fetch('https://v.anime1.me/api', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      Referer: ORIGIN + '/',
      Origin: ORIGIN,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'd=' + eps[0].apireq
  })
  const cookies = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0])
  const json = await res.json()
  let src = json?.s?.[0]?.src
  if (src?.startsWith('//')) src = 'https:' + src
  console.log('RESOLVE src =', src)
  console.log('RESOLVE cookies =', cookies.length, 'cookies')

  // 4. Fetch first 1MB of video with cookies
  const vr = await fetch(src, {
    headers: {
      'User-Agent': UA,
      Referer: ORIGIN + '/',
      Cookie: cookies.join('; '),
      Range: 'bytes=0-1048575'
    }
  })
  console.log('VIDEO status =', vr.status, 'type =', vr.headers.get('content-type'))
}

// 5. AniList art for first title
const q = `query($s:String){Media(search:$s,type:ANIME){title{native romaji} coverImage{large} genres}}`
const ar = await fetch('https://graphql.anilist.co', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ query: q, variables: { s: list[0]?.title || '進撃の巨人' } })
})
const aj = await ar.json()
console.log('ANILIST status =', ar.status, 'match =', aj?.data?.Media?.title, 'cover =', !!aj?.data?.Media?.coverImage?.large)
