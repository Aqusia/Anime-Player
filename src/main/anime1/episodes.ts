import * as cheerio from 'cheerio'
import { getHtml } from './http'
import type { Episode } from '../types'

const CAT_URL = (catId: string) => `https://anime1.me/?cat=${encodeURIComponent(catId)}`

function parsePage(html: string): Episode[] {
  const $ = cheerio.load(html)
  const eps: Episode[] = []
  $('article').each((_, el) => {
    const a = $(el).find('.entry-title a, h1 a, h2 a').first()
    const href = a.attr('href') || ''
    const pm = href.match(/anime1\.me\/(\d+)/)
    const video = $(el).find('video[data-apireq]').first()
    const apireq = video.attr('data-apireq') || ''
    if (pm && apireq) {
      eps.push({ postId: pm[1], title: a.text().trim() || `#${pm[1]}`, apireq })
    }
  })
  return eps
}

function epNum(title: string): number {
  const m = title.match(/\[(\d+(?:\.\d+)?)\]/) || title.match(/(\d+(?:\.\d+)?)\s*(?:話|集)/) || title.match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : 0
}

/** Fetch every episode of an anime (handles WordPress pagination). */
export async function fetchEpisodes(catId: string): Promise<Episode[]> {
  const firstHtml = await getHtml(CAT_URL(catId))
  let eps = parsePage(firstHtml)

  // Discover pagination: find max /page/N/ and a base URL to build the rest.
  const $ = cheerio.load(firstHtml)
  let maxPage = 1
  let base = ''
  $('a.page-numbers, .nav-links a, .pagination a').each((_, a) => {
    const href = $(a).attr('href') || ''
    const m = href.match(/(.*\/)page\/(\d+)\/?/)
    if (m) {
      const n = parseInt(m[2], 10)
      if (n > maxPage) maxPage = n
      base = m[1]
    }
  })

  if (base && maxPage > 1) {
    for (let n = 2; n <= maxPage; n++) {
      try {
        const html = await getHtml(`${base}page/${n}/`)
        eps = eps.concat(parsePage(html))
      } catch {
        /* ignore a failed page */
      }
    }
  }

  // Dedup by postId, then order ascending by episode number.
  const seen = new Set<string>()
  const dedup = eps.filter((e) => (seen.has(e.postId) ? false : (seen.add(e.postId), true)))
  dedup.sort((a, b) => epNum(a.title) - epNum(b.title))
  return dedup
}
