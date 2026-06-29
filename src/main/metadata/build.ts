import type { Anime, MetaStatus } from '../types'
import { fetchMeta } from './bangumi'
import { db } from '../store'

const REFRESH_MS = 14 * 24 * 3600 * 1000 // refresh metadata every 14 days
const CONCURRENCY = 3
const SPACING_MS = 250
const TAGS_VER = 1 // bump when the genre-tag filter changes → clears + re-backfills tags

let building = false
let liveDone = 0
let liveTotal = 0

export function getMetaStatus(): MetaStatus {
  return { building, done: liveDone, total: liveTotal, builtAt: db.getMetaBuiltAt() }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Bulk-fetch Bangumi metadata for every anime, newest first.
 * Skips entries already cached unless a 14-day refresh is due.
 * Persists incrementally and reports progress.
 */
export async function buildMetadata(
  list: Anime[],
  onProgress: (s: MetaStatus) => void
): Promise<void> {
  if (building) return
  building = true

  // One-time migration: when the tag filter logic changes, drop existing tags so
  // they get re-fetched clean by the backfill pass below.
  if (db.getMetaTagsVer() !== TAGS_VER) {
    db.clearAllTags()
    db.setMetaTagsVer(TAGS_VER)
  }

  const builtAt = db.getMetaBuiltAt()
  const due = !builtAt || Date.now() - builtAt > REFRESH_MS

  const targets = list.filter((a) => {
    const m = db.getMeta(a.catId)
    if (!m) return true
    // backfill genre tags into entries cached before tags existed (incremental,
    // reuses the same gentle rate-limited pass — no separate crawl needed)
    if (m.found && !m.tags) return true
    return due && Date.now() - m.fetchedAt > REFRESH_MS
  })

  liveDone = 0
  liveTotal = targets.length
  onProgress(getMetaStatus())

  if (!targets.length) {
    if (due) db.setMetaBuiltAt(Date.now())
    building = false
    onProgress(getMetaStatus())
    return
  }

  let idx = 0
  let sinceFlush = 0

  async function worker(): Promise<void> {
    while (idx < targets.length) {
      const a = targets[idx++]
      let res = await fetchMeta(a.title)
      if (res.rateLimited) {
        await sleep(3000)
        res = await fetchMeta(a.title)
      }
      if (res.found || res.definitiveMiss) {
        db.setMetaMem({
          catId: a.catId,
          fetchedAt: Date.now(),
          found: res.found,
          definitiveMiss: res.definitiveMiss,
          cover: res.cover,
          description: res.description,
          score: res.score,
          votes: res.votes,
          rank: res.rank,
          matchedTitle: res.matchedTitle,
          bgmId: res.bgmId,
          tags: res.tags
        })
      }
      liveDone++
      if (++sinceFlush >= 25) {
        db.flushMeta()
        sinceFlush = 0
      }
      if (liveDone % 10 === 0) onProgress(getMetaStatus())
      await sleep(SPACING_MS)
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  db.flushMeta()
  if (due) db.setMetaBuiltAt(Date.now())
  building = false
  onProgress(getMetaStatus())
}
