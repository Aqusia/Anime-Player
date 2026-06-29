// Recent-search history, persisted in localStorage (UI convenience only — no need
// for the main process / electron-store). Most-recent first, deduped, capped.
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

export function addSearchHistory(query: string): string[] {
  const q = query.trim()
  if (!q) return getSearchHistory()
  const next = [q, ...getSearchHistory().filter((x) => x !== q)].slice(0, MAX)
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

export function removeSearchHistory(query: string): string[] {
  const next = getSearchHistory().filter((x) => x !== query)
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

export function clearSearchHistory(): string[] {
  localStorage.removeItem(KEY)
  return []
}
