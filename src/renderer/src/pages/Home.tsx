import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { api, type Anime, type MyAnime, type Progress } from '../api'
import {
  becauseYouWatched,
  dedupeBy,
  genreList,
  groupBySeason,
  primaryYear,
  recommendedUnified,
  sampleRecommended,
  sortByScore,
  titleCore,
  weightedScore,
  weightedScoreMy
} from '../lib'
import Hero from '../components/Hero'
import MyHero from '../components/MyHero'
import Row from '../components/Row'
import ContinueRow from '../components/ContinueRow'
import Grid from '../components/Grid'
import Dropdown from '../components/Dropdown'

const PAGE = 6 // season rows revealed per scroll step

export default function Home() {
  const { list, byId, myList, myById, watched, loadMyCatalog, meta, metaStatus, error, load } = useStore()
  const [params] = useSearchParams()
  const [progress, setProgress] = useState<Progress[]>([])
  const [visible, setVisible] = useState(PAGE)
  const [recoSeed, setRecoSeed] = useState(1)
  const [heroIdx, setHeroIdx] = useState(0)
  const [year, setYear] = useState('all')
  const [genre, setGenre] = useState(params.get('genre') || 'all')
  const sentinel = useRef<HTMLDivElement>(null)
  const heroPausedRef = useRef(false) // pause hero rotation while hovering it

  // let a ?genre= link (e.g. clicking a genre chip on a detail page) drive the filter
  useEffect(() => {
    const g = params.get('genre')
    if (g) setGenre(g)
  }, [params])

  // year filter — UNIFIED across both sources, normalized to the primary year
  // (cross-year "2019/2020" buckets under 2019; myself years included too).
  const myCatalog = useMemo(() => Object.values(myById), [myById])
  const yearOptions = useMemo(() => {
    const ys = new Set<number>()
    for (const a of list) {
      const y = primaryYear(a.year)
      if (y) ys.add(y)
    }
    for (const a of myCatalog) {
      const y = primaryYear(a.year)
      if (y) ys.add(y)
    }
    return [
      { value: 'all', label: '全部年份' },
      ...[...ys].sort((x, y) => y - x).map((y) => ({ value: String(y), label: `${y} 年` }))
    ]
  }, [list, myCatalog])

  // genre filter (from Bangumi tags; backfills gradually) — anime1 only
  const genreOptions = useMemo(
    () => [{ value: 'all', label: '全部類型' }, ...genreList(list, meta).map((g) => ({ value: g, label: g }))],
    [list, meta]
  )

  // combined browse: year (both sources) + genre (anime1 only). When browsing by
  // year alone, anime1 and myself are merged into one composite-sorted grid.
  const filtering = year !== 'all' || genre !== 'all'
  const filteredItems = useMemo<(Anime | MyAnime)[]>(() => {
    if (!filtering) return []
    const y = year === 'all' ? 0 : +year
    let a1 = list
    if (y) a1 = a1.filter((a) => primaryYear(a.year) === y)
    if (genre !== 'all') a1 = a1.filter((a) => (meta[a.catId]?.tags || []).includes(genre))
    // myself has no genre tags, so only merge it for a pure year browse; and drop
    // titles that also exist on anime1 (anime1 is the primary source) so the same
    // show isn't listed twice.
    // empty core = "no identity" (pure-symbol title); never dedup on it, matching
    // the `c ? … : undefined` guard in Detail/MyselfDetail.
    const a1cores = new Set(a1.map((a) => titleCore(a.title)).filter(Boolean))
    const my =
      y && genre === 'all'
        ? myCatalog.filter((a) => {
            if (primaryYear(a.year) !== y) return false
            const c = titleCore(a.title)
            return !c || !a1cores.has(c)
          })
        : []
    const score = (it: Anime | MyAnime): number =>
      'catId' in it ? weightedScore(meta[it.catId]) : weightedScoreMy(it)
    return [...a1, ...my].sort((p, q) => score(q) - score(p))
  }, [filtering, year, genre, list, meta, myCatalog])

  useEffect(() => {
    api.progressList().then(setProgress).catch(() => {})
  }, [])

  // Rotate the home hero through the top recommendations every 8s (was pinned to
  // the single highest-scored title, so it always showed 白箱). Pauses on hover.
  useEffect(() => {
    const t = setInterval(() => {
      if (!heroPausedRef.current) setHeroIdx((i) => i + 1)
    }, 8000)
    return () => clearInterval(t)
  }, [])

  // Load the myself catalog (cached/no-op once loaded) so the unified year browse
  // and the my-list row can render myself titles.
  useEffect(() => {
    loadMyCatalog()
  }, [loadMyCatalog])

  // Group by season, then sort each season by rating (highest first).
  const groups = useMemo(() => {
    const g = groupBySeason(list)
    return g.map((grp) => ({ ...grp, items: sortByScore(grp.items, meta) }))
  }, [list, meta])

  // Recommended picks across BOTH sources (anime1 + myself-exclusive), reshuffled
  // per seed. Drives 為你推薦 and the rotating hero.
  const recoPool = useMemo(() => recommendedUnified(list, meta, myCatalog), [list, meta, myCatalog])
  const recommendedItems = useMemo(
    () => sampleRecommended(recoPool, 40, recoSeed),
    [recoPool, recoSeed]
  )

  // Infinite scroll: reveal more season rows as the sentinel approaches.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisible((v) => Math.min(v + PAGE, groups.length))
      },
      { rootMargin: '600px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [groups.length])

  if (error) {
    return (
      <div className="pt-24 px-8">
        <p className="text-zinc-300 mb-4">載入動畫列表失敗：{error}</p>
        <button onClick={() => load(true)} className="bg-brand px-4 py-2 rounded">
          重試
        </button>
      </div>
    )
  }

  if (!list.length) {
    return <div className="pt-24 px-8 text-zinc-400">載入中…</div>
  }

  // Most-recent unfinished episode per anime (progress list is sorted newest-first).
  // Unified across sources: keep anime1 titles still in the list AND any myself
  // (`my:`) entries (whose covers/titles ride along on the progress record).
  const continueWatching = dedupeBy(
    progress.filter((p) => !p.duration || p.position < p.duration * 0.95),
    (p) => p.catId
  ).filter((p) => p.catId.startsWith('my:') || byId[p.catId])

  const latest = list.slice(0, 24)
  // my-list preserves saved order; resolve each id to an anime1 or myself entry.
  const my = myList
    .map((id) => (id.startsWith('my:') ? myById[id.slice(3)] : byId[id]))
    .filter(Boolean)
  // personalized "因為你看了《X》" shelves from recent watch history
  const personalRows = becauseYouWatched(progress, watched, list, byId, meta)
  // Hero rotates through the top recommendations, preferring titles you haven't
  // watched (any progress OR manually marked 已看完). Falls back to all recos,
  // then to continue-watching / latest before metadata produces recommendations.
  const keyOf = (it: Anime | MyAnime): string => ('catId' in it ? it.catId : `my:${it.id}`)
  const seen = new Set<string>([...progress.map((p) => p.catId), ...watched])
  const unseenReco = recoPool.filter((it) => !seen.has(keyOf(it)))
  const basePool = unseenReco.length ? unseenReco : recoPool
  const heroPool: (Anime | MyAnime)[] = basePool.length
    ? basePool.slice(0, 12)
    : ([(continueWatching[0] && byId[continueWatching[0].catId]) || latest[0]].filter(Boolean) as (Anime | MyAnime)[])
  const hero = heroPool.length ? heroPool[heroIdx % heroPool.length] : undefined

  return (
    <div className="pb-20">
      {hero && (
        <div
          onMouseEnter={() => (heroPausedRef.current = true)}
          onMouseLeave={() => (heroPausedRef.current = false)}
        >
          {'catId' in hero ? <Hero key={hero.catId} anime={hero} /> : <MyHero key={hero.id} a={hero} />}
        </div>
      )}
      <div className="-mt-12 relative z-10">
        <div className="px-8 mb-5 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-zinc-400">瀏覽</span>
          <Dropdown value={year} options={yearOptions} onChange={setYear} />
          <Dropdown value={genre} options={genreOptions} onChange={setGenre} />
          {filtering && (
            <button
              onClick={() => {
                setYear('all')
                setGenre('all')
              }}
              className="text-xs text-zinc-400 hover:text-white"
            >
              清除篩選
            </button>
          )}
        </div>

        {filtering ? (
          <div>
            <h2 className="px-8 text-xl font-bold mb-3">
              {[genre !== 'all' ? genre : '', year !== 'all' ? `${year} 年` : ''].filter(Boolean).join(' · ')}
              {' 作品'} <span className="text-sm font-normal text-zinc-500">{filteredItems.length}</span>
              {(() => {
                const my = filteredItems.filter((it) => !('catId' in it)).length
                return my > 0 ? (
                  <span className="text-sm font-normal text-zinc-500">
                    （anime1 {filteredItems.length - my} · Myself {my}）
                  </span>
                ) : null
              })()}
            </h2>
            {filteredItems.length ? (
              <Grid items={filteredItems} />
            ) : (
              <p className="px-8 text-zinc-400">沒有符合的作品。</p>
            )}
          </div>
        ) : (
          <>
            {recommendedItems.length > 0 && (
              <Row
                title="🔥 為你推薦"
                items={recommendedItems}
                to="/recommend"
                onRefresh={() => setRecoSeed((s) => s + 1)}
              />
            )}
            <ContinueRow items={continueWatching} />
            {personalRows.map((r) => (
              <Row
                key={'byw-' + r.seed.catId}
                title={`因為你看了《${r.seed.title.split(/[（(]/)[0].trim()}》`}
                items={r.items}
              />
            ))}
            <Row title="最新更新" items={latest} />
            {my.length > 0 && <Row title="我的片單" items={my} to="/mylist" />}
            {groups.slice(0, visible).map((g) => (
              <Row
                key={g.key}
                title={g.label}
                items={g.items.slice(0, 24)}
                to={`/season/${encodeURIComponent(g.key)}`}
              />
            ))}
            {visible < groups.length && <div ref={sentinel} className="h-10" />}
          </>
        )}
      </div>

      {metaStatus.building && metaStatus.total > 0 && (
        <div className="fixed bottom-4 right-4 z-50 bg-panel/95 border border-white/10 rounded-lg px-4 py-2 text-xs text-zinc-300 shadow-xl flex items-center gap-2">
          <span className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          評價 / 封面更新中… {metaStatus.done}/{metaStatus.total}
        </div>
      )}
    </div>
  )
}
