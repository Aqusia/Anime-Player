import type { Anime, Progress } from './api'

export function dedupeBy<T>(arr: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>()
  return arr.filter((x) => {
    const k = key(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export interface SeasonGroup {
  key: string
  label: string
  items: Anime[]
}

const SEASON_ORDER: Record<string, number> = { 冬: 0, 春: 1, 夏: 2, 秋: 3 }

/** Group the (recency-ordered) list into year/season buckets, newest first. */
export function groupBySeason(list: Anime[]): SeasonGroup[] {
  const map = new Map<string, SeasonGroup>()
  for (const a of list) {
    if (!a.year || !a.season) continue
    const key = `${a.year}|${a.season}`
    let g = map.get(key)
    if (!g) {
      g = { key, label: `${a.year} 年 ${a.season}季`, items: [] }
      map.set(key, g)
    }
    g.items.push(a)
  }
  return [...map.values()].sort((x, y) => {
    const [yx, sx] = x.key.split('|')
    const [yy, sy] = y.key.split('|')
    if (yx !== yy) return parseInt(yy) - parseInt(yx)
    return (SEASON_ORDER[sy] ?? 0) - (SEASON_ORDER[sx] ?? 0)
  })
}

import type { MetaLite } from './api'

// ---- Unified "綜合評分" (composite rating) — quality tempered by popularity ----
// One number drives BOTH the ★ shown on cards AND every ranking, so anime1 and
// myself stay consistent. Bangumi's raw score is pure critical quality: a niche
// classic can sit at 9+ on a handful of votes, and a mega-popular show can be
// marked down by a harsh hardcore crowd. The composite folds POPULARITY back in
// so a widely-rated show isn't dragged down, and an obscure title with few
// ratings doesn't outrank everything.
//
//   quality   = Bayesian-tempered Bangumi score (few votes regress toward C)
//   heat      = log-scaled popularity from the rating count (0..10)
//   composite = (1 - POP_WEIGHT)·quality + POP_WEIGHT·heat
//
// Want popularity to count even more? Raise POP_WEIGHT. (Mirror any change in
// src/main/myself/service.ts → bayesMy, which ranks search results.)
const BAYES_M = 150 // votes for confidence; higher regresses low-vote scores harder toward C
const BAYES_C = 6.3 // global Bangumi mean baseline
const POP_WEIGHT = 0.35 // popularity (heat) share of the final number, 0..1
const POP_LO = 1.8 // log10(votes) mapped to heat 0  (~60 votes)
const POP_HI = 4.4 // log10(votes) mapped to heat 10 (~25k votes)

/** Popularity 0..10 from a rating/heat count, log-scaled between two anchors. */
function heatFromVotes(votes: number): number {
  if (!votes || votes <= 0) return 0
  const x = (Math.log10(votes + 1) - POP_LO) / (POP_HI - POP_LO)
  return Math.max(0, Math.min(10, x * 10))
}

/**
 * 綜合評分: a single 0..10 number blending Bangumi critical quality with
 * popularity. Returns -1 when unrated (so it sorts/filters last). When we have a
 * score but no vote count, falls back to the raw score (no popularity signal to
 * blend, so don't unfairly tank it).
 */
export function heatScore(score?: number, votes?: number): number {
  if (!score || score <= 0) return -1
  const v = votes || 0
  if (v <= 0) return score
  const quality = (v / (v + BAYES_M)) * score + (BAYES_M / (v + BAYES_M)) * BAYES_C
  return (1 - POP_WEIGHT) * quality + POP_WEIGHT * heatFromVotes(v)
}

/** Ranking score for an anime1 title (composite). -1 when unrated. */
export function weightedScore(meta?: MetaLite): number {
  if (!meta?.found) return -1
  return heatScore(meta.score, meta.votes)
}

/** Sort a copy of items by weighted score, highest first. */
export function sortByScore(items: Anime[], meta: Record<string, MetaLite>): Anime[] {
  return [...items].sort((a, b) => weightedScore(meta[b.catId]) - weightedScore(meta[a.catId]))
}

/** Distinct genre tags across the catalog, most common first (for the 類型 filter). */
export function genreList(list: Anime[], meta: Record<string, MetaLite>): string[] {
  const freq = new Map<string, number>()
  for (const a of list) for (const t of meta[a.catId]?.tags || []) freq.set(t, (freq.get(t) || 0) + 1)
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)
}

/**
 * Full pool of "recommended" titles — highly rated AND widely watched
 * (>= minVotes), ranked by popularity-weighted score, with seasons of the
 * same franchise collapsed to one entry.
 */
export function recommendedPool(
  items: Anime[],
  meta: Record<string, MetaLite>,
  minVotes = 150
): Anime[] {
  const sorted = items
    .filter((a) => {
      const m = meta[a.catId]
      return !!(m?.found && m.score && m.votes && m.votes >= minVotes)
    })
    .sort((a, b) => weightedScore(meta[b.catId]) - weightedScore(meta[a.catId]))

  const seen = new Set<number | string>()
  const out: Anime[] = []
  for (const a of sorted) {
    const key = meta[a.catId]?.bgmId ?? franchiseKey(a.title)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

// small seeded RNG (mulberry32) so a given seed yields a stable shuffle
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Weighted-random sample of n titles from the top of the pool. Higher-ranked
 * (higher score) titles are more likely, so results stay score-primary but
 * vary each refresh (driven by `seed`).
 */
export function sampleRecommended(pool: Anime[], n: number, seed: number): Anime[] {
  const window = pool.slice(0, Math.max(n * 3, 120))
  const bag = window.map((a, i) => ({ a, w: window.length - i }))
  const rand = rng(seed)
  const picked: Anime[] = []
  while (picked.length < n && bag.length) {
    let total = 0
    for (const o of bag) total += o.w
    let r = rand() * total
    let idx = 0
    for (; idx < bag.length; idx++) {
      r -= bag[idx].w
      if (r <= 0) break
    }
    picked.push(bag.splice(Math.min(idx, bag.length - 1), 1)[0].a)
  }
  return picked
}

// ---- myself ranking (Bangumi score tempered by the number of raters) ----
import type { MyAnime } from './api'

/**
 * Ranking score for a myself title — the SAME composite as anime1 (heatScore),
 * so both sources share one scale. Uses Bangumi votes (not myself's raw view
 * count) as the popularity signal. -1 when unrated.
 */
export function weightedScoreMy(a: MyAnime): number {
  return heatScore(a.score, a.votes)
}

/**
 * Recommended myself titles: ranked by the Bayesian weighted score,
 * franchise-deduped, then weighted-random sampled so the row varies per `seed`.
 */
export function recommendedMy(catalog: MyAnime[], n: number, seed: number): MyAnime[] {
  const sorted = catalog
    .filter((a) => (a.score || 0) > 0)
    .sort((a, b) => weightedScoreMy(b) - weightedScoreMy(a))
  const seen = new Set<string>()
  const pool: MyAnime[] = []
  for (const a of sorted) {
    const k = franchiseKey(a.title)
    if (seen.has(k)) continue
    seen.add(k)
    pool.push(a)
  }
  const window = pool.slice(0, Math.max(n * 3, 120))
  const bag = window.map((a, i) => ({ a, w: window.length - i }))
  const rand = rng(seed)
  const picked: MyAnime[] = []
  while (picked.length < n && bag.length) {
    let total = 0
    for (const o of bag) total += o.w
    let r = rand() * total
    let idx = 0
    for (; idx < bag.length; idx++) {
      r -= bag[idx].w
      if (r <= 0) break
    }
    picked.push(bag.splice(Math.min(idx, bag.length - 1), 1)[0].a)
  }
  return picked
}

/**
 * "你可能也喜歡" for an anime1 title: other titles sharing the most genre tags,
 * ranked by tag overlap then composite score. Falls back to top-rated when the
 * current title has no tags yet (tags backfill gradually). Excludes the same
 * franchise and collapses franchises so one similar show isn't listed five times.
 */
export function relatedAnime(
  current: Anime,
  list: Anime[],
  meta: Record<string, MetaLite>,
  n = 12
): Anime[] {
  const curKey = franchiseKey(current.title)
  const want = new Set(meta[current.catId]?.tags || [])
  const cand = list
    .filter((a) => a.catId !== current.catId && franchiseKey(a.title) !== curKey)
    .map((a) => {
      const tags = meta[a.catId]?.tags || []
      let overlap = 0
      for (const t of tags) if (want.has(t)) overlap++
      return { a, overlap, score: weightedScore(meta[a.catId]) }
    })
    .filter((x) => x.score > 0)
  const useTags = want.size > 0 && cand.some((x) => x.overlap > 0)
  const ranked = (useTags ? cand.filter((x) => x.overlap > 0) : cand).sort(
    (x, y) => y.overlap - x.overlap || y.score - x.score
  )
  const seen = new Set<string>()
  const out: Anime[] = []
  for (const { a } of ranked) {
    const k = String(meta[a.catId]?.bgmId ?? franchiseKey(a.title))
    if (seen.has(k)) continue
    seen.add(k)
    out.push(a)
    if (out.length >= n) break
  }
  return out
}

/**
 * Personalized "因為你看了《X》" rows: for each of the user's most-recent,
 * DISTINCT watched anime1 titles (newest first, franchise-deduped), the
 * genre-related titles they haven't watched yet. Drives the Home personalized
 * shelves. Empty until there's watch history.
 */
export function becauseYouWatched(
  progress: Progress[],
  watched: string[],
  list: Anime[],
  byId: Record<string, Anime>,
  meta: Record<string, MetaLite>,
  maxRows = 3
): { seed: Anime; items: Anime[] }[] {
  const seen = new Set<string>([...progress.map((p) => p.catId), ...watched])
  const rows: { seed: Anime; items: Anime[] }[] = []
  const usedKey = new Set<string>()
  for (const p of progress) {
    // progress is newest-first; take the first distinct franchise per row
    if (rows.length >= maxRows) break
    if (p.catId.startsWith('my:')) continue // anime1 only (related ranks over `list`)
    const seed = byId[p.catId]
    if (!seed) continue
    const k = franchiseKey(seed.title)
    if (usedKey.has(k)) continue
    usedKey.add(k)
    const items = relatedAnime(seed, list, meta, 18).filter((a) => !seen.has(a.catId))
    if (items.length >= 4) rows.push({ seed, items })
  }
  return rows
}

/**
 * "你可能也喜歡" for a myself title — top-rated catalog titles (composite),
 * preferring the same era (±4 yrs), franchise-deduped, excluding the same series.
 * myself has no genre data, so this is era + rating driven, not true style-match.
 */
export function relatedMy(cur: { id: string; title: string; year?: number }, catalog: MyAnime[], n = 12): MyAnime[] {
  const curKey = franchiseKey(cur.title)
  const base = catalog.filter(
    (a) => a.id !== cur.id && franchiseKey(a.title) !== curKey && (a.score || 0) > 0
  )
  const cy = cur.year || 0
  const near = cy ? base.filter((a) => a.year && Math.abs(a.year - cy) <= 4) : []
  const pool = near.length >= n ? near : base
  const ranked = [...pool].sort((a, b) => weightedScoreMy(b) - weightedScoreMy(a))
  const seen = new Set<string>()
  const out: MyAnime[] = []
  for (const a of ranked) {
    const k = franchiseKey(a.title)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(a)
    if (out.length >= n) break
  }
  return out
}

// CJK ranges (incl. kana) used to detect a Chinese/Japanese-leading title.
const CJK_RANGE = '\\u3400-\\u9fff\\u3040-\\u30ff\\uf900-\\ufaff'

/**
 * Normalize a title to a franchise key so seasons / films / arcs collapse
 * together. Steps: drop parenthetical disambiguators ((Sword Art Online II) /
 * (第三季下)); strip season markers (第N季 / Season N / Final Season); strip film
 * & spinoff markers anywhere (劇場版 / OVA / 外傳 / 總集篇…); strip trailing arc
 * names ending in 篇/編/章 (鬼滅之刃 無限列車篇 → 鬼滅之刃). Finally, for a title
 * that STARTS with CJK, keep only the leading CJK core and drop a trailing
 * romaji/English subtitle (刀劍神域 Alicization → 刀劍神域) — this is what groups
 * the SAO seasons. Latin-leading titles (Re:Zero / Fate…) are left intact so
 * distinct shows aren't over-merged; likewise titles distinguished purely by a
 * CJK subtitle (the many 魔法少女X / 光之美少女 series) stay separate.
 */
export function franchiseKey(title: string): string {
  let s = title
    .replace(/[（(【\[][^）)】\]]*[）)】\]]/g, ' ')
    .replace(/第[一二三四五六七八九十百零\d]+[季期部章]/g, ' ')
    .replace(/(?:final\s*)?season\s*\d*/gi, ' ')
    .replace(/\b(?:1st|2nd|3rd|4th|5th)\s*season/gi, ' ')
    .replace(/\bthe\b/gi, ' ')
    .replace(/劇場版|剧场版|電影版|电影版|劇場|剧场|總集篇|总集篇|外傳|外传|番外篇?|特別篇|特别篇|OVA|OAD|ONA/gi, ' ')
    .replace(/(?:\s+(?:sp|tv版|前篇|後篇|后篇|完結篇|完结篇|\S*[篇編章]))+\s*$/giu, ' ')
  const t = s.trim()
  if (new RegExp('^[' + CJK_RANGE + ']').test(t)) {
    const core = t.replace(/[a-zA-Z].*$/, '').trim()
    const cjkLen = (core.match(new RegExp('[' + CJK_RANGE + ']', 'g')) || []).length
    if (cjkLen >= 2) s = core
  }
  return s
    .replace(/[\s:：~～\-—_.!！?？、,，'’"#＃／/]/g, '')
    .toLowerCase()
    .trim()
}

/** Relative time in Traditional Chinese, e.g. "3 天前". */
export function timeAgo(ts: number): string {
  if (!ts) return ''
  const d = Date.now() - ts
  const min = 60000
  const hr = 3600000
  const day = 86400000
  if (d < min) return '剛剛'
  if (d < hr) return `${Math.floor(d / min)} 分鐘前`
  if (d < day) return `${Math.floor(d / hr)} 小時前`
  if (d < day * 30) return `${Math.floor(d / day)} 天前`
  const date = new Date(ts)
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

export function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}
