import { fetchAnimeList } from './list'
import { db } from '../store'
import type { Anime } from '../types'

const LIST_TTL = 12 * 3600 * 1000

/** Return the anime list from cache when fresh, otherwise refetch (falling back to stale cache on error). */
export async function getAnimeList(force = false): Promise<Anime[]> {
  const cache = db.getListCache()
  if (!force && cache?.data?.length && Date.now() - cache.fetchedAt < LIST_TTL) {
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
