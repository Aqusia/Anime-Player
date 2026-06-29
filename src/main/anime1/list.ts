import * as cheerio from 'cheerio'
import { getHtml } from './http'
import type { Anime } from '../types'

// "動畫列表" URL-encoded
const LIST_URL = 'https://anime1.me/%E5%8B%95%E7%95%AB%E5%88%97%E8%A1%A8'

/**
 * Parse the master TablePress table on the anime list page.
 * Columns: 動畫名稱 | 集數 | 年份 | 季節 | 字幕組
 */
export async function fetchAnimeList(): Promise<Anime[]> {
  const html = await getHtml(LIST_URL)
  const $ = cheerio.load(html)
  const out: Anime[] = []
  const seen = new Set<string>()

  $('table tr').each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 5) return
    const link = $(tds[0]).find('a[href*="cat="]').first()
    const href = link.attr('href') || ''
    const m = href.match(/cat=(\d+)/)
    if (!m) return
    const catId = m[1]
    if (seen.has(catId)) return
    const title = link.text().trim()
    if (!title) return
    seen.add(catId)
    out.push({
      catId,
      title,
      episodes: $(tds[1]).text().trim(),
      year: $(tds[2]).text().trim(),
      season: $(tds[3]).text().trim(),
      group: $(tds[4]).text().trim()
    })
  })

  return out
}
