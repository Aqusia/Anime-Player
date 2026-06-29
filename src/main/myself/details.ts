import * as cheerio from 'cheerio'
import { myGetHtmlHedged, myAbs } from './http'
import type { MyDetails, MyEpisode } from '../types'

/** Pull the value after the colon out of an `.info_info` list item. */
function infoVal($li: cheerio.Cheerio<never>): string {
  const txt = $li.text()
  const i = txt.indexOf(':')
  const j = txt.indexOf('：')
  const at = i >= 0 ? i : j
  return at >= 0 ? txt.slice(at + 1).trim() : txt.trim()
}

/** Parse a thread (anime) page: metadata + the episode list. */
export async function fetchMyDetails(id: string): Promise<MyDetails> {
  // Interactive: a user is staring at the detail page. Hedged fetch resolves in
  // ~1-3s on a momentarily-slow source (vs tens of seconds for sequential
  // retries), and rejects in ~14s worst case so the retry button surfaces fast.
  const html = await myGetHtmlHedged(`/thread-${id}-1-1.html`)
  const $ = cheerio.load(html)

  // Title lives in the breadcrumb thread link; strip the "【全 N 集】" suffix.
  const rawTitle = $('#pt a[href^="thread"]').last().text().trim()
  const title = (rawTitle.split(/【/)[0] || rawTitle).trim()

  const cover = myAbs($('.info_img_box > img').attr('src'))
  const description = $('#info_introduction')
    .find('p')
    .map((_, p) => $(p).text().trim())
    .get()
    .filter(Boolean)
    .join('\n\n')
    .trim()

  const infos = $('.info_info ul > li')
  const category = infoVal(infos.eq(0) as never)
    .split(/[/／]/g)
    .map((s) => s.trim())
    .filter(Boolean)
  const premiere = infoVal(infos.eq(1) as never)

  // Episodes: each ".main_list > li" has a name link plus an inner anchor whose
  // data-href is the VPX player URL. TWO formats exist (both handled):
  //   old:   ".../player/play/<tid>/<vid>"  → vid is the episode number
  //   newer: ".../player/<token>"           → an opaque token, used as-is
  // We store the episode "id" (numeric vid OR token) and resolve.ts picks the
  // right WebSocket payload based on whether it's all digits.
  const episodes: MyEpisode[] = []
  const seen = new Set<string>()
  $('.main_list > li').each((_, li) => {
    const $li = $(li)
    const name = $li.find('a').first().text().trim()
    const href = ($li.find("a[data-href*='myself-bbs.com/player']").attr('data-href') || '').trim()
    const at = href.indexOf('/player/')
    if (at < 0) return
    const code = href.slice(at + '/player/'.length).trim() // trims trailing \r too
    if (!code) return
    const playMatch = code.match(/^(?:play\/)?(\d+)\/(\d+)$/)
    const vid = playMatch ? playMatch[2] : code
    if (!vid || seen.has(vid)) return
    seen.add(vid)
    episodes.push({ vid, name: name || `第 ${vid} 集` })
  })

  return { id, title: title || id, cover, description, category, premiere, episodes }
}
