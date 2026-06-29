import * as cheerio from 'cheerio'
import { myGetHtml, myAbs } from './http'
import type { MyAnime, MyKind } from '../types'

const FID: Record<MyKind, number> = { airing: 133, completed: 113 }

function parseItems($: cheerio.CheerioAPI, kind: MyKind): MyAnime[] {
  const out: MyAnime[] = []
  $('form > ul > li').each((_, el) => {
    const li = $(el)
    const a = li.find('.ptn > a').first()
    const href = a.attr('href') || ''
    const m = href.match(/thread-(\d+)/)
    if (!m) return
    const title = a.text().trim()
    if (!title) return
    const epText = li.find('.ep_info').text()
    const epMatch = epText.match(/\d+/)
    const views = parseInt(li.find("em[title$='查看']").text().replace(/\D/g, ''), 10) || 0
    out.push({
      id: m[1],
      title,
      cover: myAbs(li.find('img').attr('src')),
      episodes: epMatch ? +epMatch[0] : 0,
      views,
      kind
    })
  })
  return out
}

/** One forum page (20 items). Returns the items and whether a next page exists. */
export async function fetchMyPage(
  kind: MyKind,
  page: number
): Promise<{ items: MyAnime[]; hasNext: boolean }> {
  const html = await myGetHtml(`/forum-${FID[kind]}-${page}.html`)
  const $ = cheerio.load(html)
  return { items: parseItems($, kind), hasNext: $('a.nxt').length > 0 }
}

function dedupe(items: MyAnime[]): MyAnime[] {
  const seen = new Set<string>()
  const out: MyAnime[] = []
  for (const a of items) {
    if (seen.has(a.id)) continue
    seen.add(a.id)
    out.push(a)
  }
  return out
}

/**
 * Fetch the WHOLE list (airing or completed). We read the real last-page number
 * from page 1's pagination and fetch pages 2..last with bounded concurrency, then
 * make one retry pass over any pages that failed — so a flaky page doesn't leave
 * a hole in the search index (completed is ~116 pages / ~2300 titles).
 */
export async function fetchMyAll(kind: MyKind, maxPages = 250): Promise<MyAnime[]> {
  const fid = FID[kind]
  const html = await myGetHtml(`/forum-${fid}-1.html`)
  const $ = cheerio.load(html)
  const all = [...parseItems($, kind)]

  // Highest "forum-<fid>-<N>.html" in the pagination = total page count.
  let last = 1
  const re = new RegExp(`forum-${fid}-(\\d+)\\.html`)
  $('a[href]').each((_, el) => {
    const m = ($(el).attr('href') || '').match(re)
    if (m) last = Math.max(last, +m[1])
  })
  last = Math.min(last, maxPages)
  if (last <= 1) return dedupe(all)

  const pages = Array.from({ length: last - 1 }, (_, i) => i + 2)
  const failed: number[] = []
  const CONCURRENCY = 6
  let idx = 0
  async function worker(): Promise<void> {
    while (idx < pages.length) {
      const p = pages[idx++]
      try {
        all.push(...(await fetchMyPage(kind, p)).items)
      } catch {
        failed.push(p)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  // Gentle sequential retry of pages that failed during the parallel burst.
  for (const p of failed) {
    try {
      all.push(...(await fetchMyPage(kind, p)).items)
    } catch {
      /* give up on this one page — better a near-complete index than none */
    }
  }
  return dedupe(all)
}
