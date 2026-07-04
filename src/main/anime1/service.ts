import { fetchAnimeList } from './list'
import { db } from '../store'
import type { Anime } from '../types'

const LIST_TTL = 12 * 3600 * 1000

let refreshing: Promise<void> | null = null

/**
 * Return the anime list. Stale-while-revalidate: any cached copy is returned
 * IMMEDIATELY (home never blocks on the scrape) and, when past the TTL, a
 * background refresh updates the cache for the next read. Details/episodes are
 * always fetched live anyway, so a slightly stale list is harmless. `force`
 * (the renderer's 重試 button) still refetches synchronously.
 */
export async function getAnimeList(force = false): Promise<Anime[]> {
  const cache = db.getListCache()
  if (!force && cache?.data?.length) {
    if (Date.now() - cache.fetchedAt >= LIST_TTL && !refreshing) {
      refreshing = fetchAnimeList()
        .then((data) => {
          if (data.length) db.setListCache(data)
        })
        .catch(() => {})
        .finally(() => {
          refreshing = null
        })
    }
    return cache.data
  }
  try {
    const data = await fetchAnimeList()
    if (data.length) db.setListCache(data)
    return data
  } catch (err) {
    if (cache?.data?.length) return cache.data
    throw err
  }
}
