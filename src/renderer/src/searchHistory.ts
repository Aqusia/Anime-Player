// Recent-search history. localStorage is the fast synchronous read cache, but it
// can lose recent writes on an unclean exit, so every write is also mirrored to
// electron-store (durable, synchronous atomic disk write) and reconciled back into
// localStorage on boot. Most-recent first, deduped, capped. See playerPrefs.ts.
import { api } from './api'

const KEY = 'anime1:searchHistory'
const MAX = 12

export function getSearchHistory(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function persist(next: string[]): string[] {
  localStorage.setItem(KEY, JSON.stringify(next))
  void api.searchHistorySet(next).catch(() => {})
  return next
}

export function addSearchHistory(query: string): string[] {
  const q = query.trim()
  if (!q) return getSearchHistory()
  return persist([q, ...getSearchHistory().filter((x) => x !== q)].slice(0, MAX))
}

export function removeSearchHistory(query: string): string[] {
  return persist(getSearchHistory().filter((x) => x !== query))
}

export function clearSearchHistory(): string[] {
  return persist([])
}

// Pull the durable copy back into localStorage at startup. Call once on boot.
export async function reconcileSearchHistory(): Promise<void> {
  try {
    const v = await api.searchHistoryGet()
    if (Array.isArray(v)) localStorage.setItem(KEY, JSON.stringify(v.slice(0, MAX)))
  } catch {
    /* ignore — fall back to whatever localStorage has */
  }
}
