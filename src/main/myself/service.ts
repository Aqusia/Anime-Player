import { fetchMyAll } from './list'
import { fetchMyDetails } from './details'
import { toSimplified } from '../metadata/convert'
import { fetchMeta } from '../metadata/bangumi'
import { fetchBgmEpisodes, type BgmEp } from '../metadata/bgmEpisodes'
import { hasJapanese } from '../metadata/translate'
import { db } from '../store'
import type { MyAnime, MyDetails } from '../types'

const INDEX_TTL = 7 * 24 * 3600 * 1000 // catalog refreshes weekly
const DETAILS_TTL = 6 * 3600 * 1000 // episode lists refresh every few hours
const ENRICH_VERSION = 2 // bump to re-enrich score/votes catalog-wide (logic changed)
// Community mirror of myself metadata (static, ~2yr stale) — used ONLY to seed
// premiere years in bulk (one request) so we don't fetch 2000+ detail pages.
const REPO_DETAILS = 'https://raw.githubusercontent.com/JacobLinCool/Myself-BBS-API/data/details.json'

/** Normalise for matching: TW→CN, lowercase, strip spaces/punctuation/symbols. */
function norm(s: string): string {
  return toSimplified(s)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
}

/** True if every char of `q` appears in `s` in order (loose subsequence match). */
function subseq(q: string, s: string): boolean {
  let i = 0
  for (let j = 0; j < s.length && i < q.length; j++) if (s[j] === q[i]) i++
  return i === q.length
}

/** Character-bigram (Dice) similarity, for ranking near-misses. */
function dice(a: string, b: string): number {
  if (!a || !b) return 0
  if (a.includes(b) || b.includes(a)) return 1
  const grams = (s: string): Set<string> => {
    const g = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2))
    if (s.length === 1) g.add(s)
    return g
  }
  const A = grams(a)
  const B = grams(b)
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return (2 * inter) / (A.size + B.size)
}

/** Is `bgmTitle` a confident match for `myTitle`? Accept on bigram similarity OR
 *  when their CJK cores contain one another — the latter catches cases where
 *  Bangumi pads the name with English (e.g. 鋼之鍊金術師FA ↔ 钢之炼金术师 FULLMETAL
 *  ALCHEMIST), which would otherwise dip below the dice threshold and lose its rating. */
function cjkCore(s: string): string {
  return norm(s).replace(/[a-z0-9]/g, '')
}
function titlesMatch(myTitle: string, bgmTitle: string): boolean {
  const a = norm(myTitle)
  const b = norm(bgmTitle)
  if (!a || !b) return false
  if (dice(a, b) >= 0.5) return true
  const ca = cjkCore(myTitle)
  const cb = cjkCore(bgmTitle)
  return ca.length >= 3 && cb.length >= 3 && (ca.includes(cb) || cb.includes(ca))
}

/** Composite rank used to order search results — MUST mirror the renderer's
 *  heatScore (src/renderer/src/lib.ts): Bayesian quality blended with log-scaled
 *  popularity. Keep the constants in sync. -1 when unrated. */
function bayesMy(a: MyAnime): number {
  if (!a.score || a.score <= 0) return -1
  const v = a.votes || 0
  if (v <= 0) return a.score
  const M = 150
  const C = 6.3
  const W = 0.35
  const LO = 1.8
  const HI = 4.4
  const quality = (v / (v + M)) * a.score + (M / (v + M)) * C
  const heat = Math.max(0, Math.min(10, ((Math.log10(v + 1) - LO) / (HI - LO)) * 10))
  return (1 - W) * quality + W * heat
}

// ---- full catalog index (used for BOTH browse and search) ----
let memIndex: { at: number; data: MyAnime[] } | null = null
let building: Promise<MyAnime[]> | null = null

async function rebuildIndex(): Promise<MyAnime[]> {
  // completed is the bulk (~2300); airing is the current-season handful.
  const [completed, airing] = await Promise.all([
    fetchMyAll('completed').catch(() => [] as MyAnime[]),
    fetchMyAll('airing').catch(() => [] as MyAnime[])
  ])
  // Carry enrichment (year/score/votes) over from the previous index so a weekly
  // rebuild doesn't throw the work away.
  const prev = new Map<string, { year?: number; score?: number; votes?: number }>()
  for (const a of db.getMyIndex()?.data || [])
    prev.set(a.id, { year: a.year, score: a.score, votes: a.votes })

  // Prefer the airing entry when a title appears in both (fresher ep count).
  const byId = new Map<string, MyAnime>()
  for (const a of completed) byId.set(a.id, a)
  for (const a of airing) byId.set(a.id, a)
  const data = [...byId.values()].map((a) => {
    const p = prev.get(a.id)
    return { ...a, year: a.year ?? p?.year, score: a.score ?? p?.score, votes: a.votes ?? p?.votes }
  })
  if (data.length) {
    memIndex = { at: Date.now(), data }
    db.setMyIndex(data)
  }
  return data
}

/** Return the catalog index, building (or refreshing if stale) as needed. */
export async function ensureMyIndex(force = false): Promise<MyAnime[]> {
  if (!force && memIndex && Date.now() - memIndex.at < INDEX_TTL) return memIndex.data
  if (!force) {
    const cached = db.getMyIndex()
    if (cached && Date.now() - cached.fetchedAt < INDEX_TTL) {
      memIndex = { at: cached.fetchedAt, data: cached.data }
      return cached.data
    }
  }
  if (building) return building
  building = rebuildIndex().finally(() => {
    building = null
  })
  return building
}

/**
 * Search the whole myself-bbs catalog by title. Handles TW/CN, prefix/substring
 * and loose (subsequence + bigram) matches so partial or differently-written
 * names still surface — the site's own search is far less forgiving.
 */
export async function searchMy(query: string): Promise<MyAnime[]> {
  const q = norm(query)
  if (!q) return []
  const index = await ensureMyIndex()

  // "strong" = the query text actually appears (exact/prefix/substring/subseq);
  // "weak" = a fuzzy (typo) Dice match only. We return weak matches ONLY when
  // there are no strong ones, so a real query never gets polluted by fuzzy noise
  // (e.g. searching a title that simply isn't in the catalog returns nothing,
  // instead of unrelated near-bigram hits).
  const strong: { a: MyAnime; score: number }[] = []
  const weak: { a: MyAnime; score: number }[] = []
  for (const a of index) {
    const t = norm(a.title)
    if (!t) continue
    if (t === q) strong.push({ a, score: 1000 })
    else if (t.startsWith(q)) strong.push({ a, score: 600 })
    else if (t.includes(q)) strong.push({ a, score: 400 })
    else if (q.includes(t)) strong.push({ a, score: 320 })
    else if (q.length >= 2 && subseq(q, t)) strong.push({ a, score: 150 })
    else if (q.length >= 2) {
      const d = dice(q, t)
      if (d >= 0.5) weak.push({ a, score: Math.round(d * 100) })
    }
  }

  // Match relevance first (exact > substring …), then by Bayesian rating so the
  // best-rated matches lead and obscure high-raw-score titles don't jump ahead.
  const pool = strong.length ? strong : weak
  pool.sort((x, y) => y.score - x.score || bayesMy(y.a) - bayesMy(x.a))
  return pool.slice(0, 60).map((s) => s.a)
}

// ---- browse: the whole catalog, instant from the cached index ----
export function getMyCatalog(): Promise<MyAnime[]> {
  return ensureMyIndex()
}

// ---- per-episode synopses (Bangumi) ----
// Resolve the Bangumi subject id for a myself title, then reuse the shared
// episode-list fetcher. bgmId is cached per myself id (0 = looked up, no match).

/** Strip generic season/format markers so matching keys on the DISTINCTIVE name.
 *  Without this, two titles that merely share "Final Season" / "完結篇" score a
 *  high bigram similarity off the shared English/marker text and mis-match
 *  (e.g. 進擊的巨人 The Final Season ↔ 我的英雄學院 FINAL SEASON). */
function coreTitle(t: string): string {
  return t
    .replace(/[\[\](){}（）【】]/g, ' ')
    .replace(/第[一二三四五六七八九十百零\d]+[季期部章]/g, ' ')
    .replace(/(?:the\s+)?(?:final\s+)?season\s*\d*/gi, ' ')
    .replace(/\bthe\b/gi, ' ')
    .replace(/劇場版|剧场版|電影版|电影版|總集篇|总集篇|特別篇|特别篇|完結篇|完结篇|前篇|後篇|后篇|外傳|外传|OVA|OAD|ONA/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Find a Bangumi subject id for a myself title — first from anime1's already
 *  cached metadata (zero network), else one Bangumi search. Returns 0 on miss.
 *  Matches on the season-stripped core to avoid shared-marker false positives. */
async function resolveBgmId(title: string): Promise<number> {
  const core = coreTitle(title)
  if (!core) return 0
  for (const a of db.getListCache()?.data || []) {
    const m = db.getMeta(a.catId)
    if (!m?.bgmId) continue
    if (titlesMatch(core, coreTitle(a.title)) || (m.matchedTitle && titlesMatch(core, coreTitle(m.matchedTitle))))
      return m.bgmId
  }
  const m = await fetchMeta(core)
  if (m.found && m.bgmId && m.matchedTitle && titlesMatch(core, coreTitle(m.matchedTitle))) return m.bgmId
  return 0
}

/** Bangumi per-episode names + synopses for a myself title (best-effort, cached). */
export async function getMyEpisodeInfo(id: string, title: string): Promise<BgmEp[]> {
  let bgmId = db.getMyBgm(id)
  if (bgmId === undefined) {
    try {
      bgmId = await resolveBgmId(title)
    } catch {
      bgmId = 0
    }
    db.setMyBgm(id, bgmId)
  }
  if (!bgmId) return []
  const cached = db.getBgmEps(bgmId) as BgmEp[] | undefined
  if (cached) return cached
  const eps = await fetchBgmEpisodes(bgmId)
  // persist only a fully-localized list (see ipc.ts meta:episodes)
  if (eps.length && !eps.some((e) => hasJapanese(e.desc) || hasJapanese(e.name)))
    db.setBgmEps(bgmId, eps)
  return eps
}

// ---- per-anime details (episodes + cover + synopsis) ----
export async function getMyDetails(id: string): Promise<MyDetails> {
  const cached = db.getMyDetails(id)
  if (cached && Date.now() - cached.fetchedAt < DETAILS_TTL) return cached.data
  const data = await fetchMyDetails(id)
  db.setMyDetails(id, data)
  return data
}

// ---- background: enrich the catalog with Bangumi score + premiere year ----
// Unifies the look with anime1 (same ★ ratings) and powers the year filter.
let enriching = false

/**
 * Title→{score,year} map from anime1's ALREADY-fetched Bangumi metadata, so
 * shows that exist in both sources get stars instantly with zero new lookups.
 */
function anime1MetaMap(): Map<string, { score?: number; votes?: number; year?: number }> {
  const map = new Map<string, { score?: number; votes?: number; year?: number }>()
  for (const a of db.getListCache()?.data || []) {
    const m = db.getMeta(a.catId)
    const entry = { score: m?.score, votes: m?.votes, year: +a.year || undefined }
    if (!entry.score && !entry.year) continue
    for (const k of [norm(a.title), m?.matchedTitle ? norm(m.matchedTitle) : '']) {
      if (k && !map.has(k)) map.set(k, entry)
    }
  }
  return map
}

/**
 * Fill `score` (Bangumi rating) and `year` on catalog entries. Best-effort,
 * resumable, persisted, gentle. Phases:
 *  0) Instant seed from anime1's existing Bangumi meta (overlapping shows).
 *  1) Bulk YEAR seed from the community mirror (one request, no myself traffic).
 *  2) Gentle Bangumi top-up for SCORE (+year) on the rest — capped per run.
 * Markers: score >0 = rating, 0 = looked up / no confident match, undefined = not
 * yet tried (so failures retry next session). year: >0 known, 0 tried-none.
 */
export async function enrichMeta(onUpdate?: () => void): Promise<void> {
  if (enriching) return
  enriching = true
  try {
    const index = await ensureMyIndex()

    // When the enrichment logic improves (votes, better title matching), bump
    // ENRICH_VERSION to re-enrich the whole catalog once (year is kept).
    if (db.getMyEnrichVer() !== ENRICH_VERSION) {
      for (const a of index) {
        a.score = undefined
        a.votes = undefined
      }
      db.setMyEnrichVer(ENRICH_VERSION)
    }

    // Phase 0 — instant, no network.
    const a1 = anime1MetaMap()
    if (a1.size) {
      for (const a of index) {
        const hit = a1.get(norm(a.title))
        if (!hit) continue
        if (a.score === undefined && hit.score) {
          a.score = hit.score
          a.votes = hit.votes
        }
        if (!a.year && hit.year) a.year = hit.year
      }
      db.setMyIndex(index)
      onUpdate?.()
    }

    // Phase 1 — bulk year seed from the mirror.
    if (index.some((a) => a.year === undefined)) {
      try {
        const res = await fetch(REPO_DETAILS)
        if (res.ok) {
          const json = (await res.json()) as { data?: { id: number; premiere?: number[] }[] }
          const yearById = new Map<string, number>()
          for (const d of json.data || []) {
            const y = Array.isArray(d.premiere) ? d.premiere[0] : 0
            if (d.id && y > 1950) yearById.set(String(d.id), y)
          }
          for (const a of index) if (a.year === undefined && yearById.has(a.id)) a.year = yearById.get(a.id)
          db.setMyIndex(index)
          onUpdate?.()
        }
      } catch {
        /* mirror unreachable — fine, phase 2 still runs */
      }
    }

    // Phase 2 — Bangumi top-up for everything still unrated (newest first). No cap.
    // On 429 we sleep+retry once and KEEP GOING (don't abort the pass — that was
    // why coverage stalled); anything still rate-limited stays undefined and is
    // retried next session. Resumable + persisted incrementally.
    const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    const todo = index.filter((a) => a.score === undefined).sort((a, b) => +b.id - +a.id)
    let i = 0
    let sinceFlush = 0
    async function worker(): Promise<void> {
      while (i < todo.length) {
        const a = todo[i++]
        try {
          let m = await fetchMeta(a.title)
          if (m.rateLimited) {
            await sleep(3000)
            m = await fetchMeta(a.title)
          }
          if (!m.rateLimited) {
            if (m.found && m.matchedTitle && titlesMatch(a.title, m.matchedTitle)) {
              a.score = m.score || 0
              a.votes = m.votes
              if (!a.year && m.year) a.year = m.year
            } else {
              a.score = 0 // looked up, no confident match
            }
          }
          // still rate-limited after a retry → leave undefined, retry next session
        } catch {
          /* network failure — leave undefined so a later session retries */
        }
        if (++sinceFlush >= 15) {
          sinceFlush = 0
          db.setMyIndex(index)
          onUpdate?.()
        }
        await sleep(280)
      }
    }
    await Promise.all([worker(), worker(), worker()]) // gentle, matches the anime1 build
    db.setMyIndex(index)
    onUpdate?.()
  } finally {
    enriching = false
  }
}
