import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { api, type Progress } from '../api'
import { becauseYouWatched, dedupeBy, genreList, groupBySeason, recommendedPool, sampleRecommended, sortByScore } from '../lib'
import Hero from '../components/Hero'
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

  // year filter (anime1 list carries year/season)
  const yearOptions = useMemo(() => {
    const ys = new Set<string>()
    for (const a of list) if (a.year) ys.add(a.year)
    return [
      { value: 'all', label: '全部年份' },
      ...[...ys].sort((x, y) => +y - +x).map((y) => ({ value: y, label: `${y} 年` }))
    ]
  }, [list])

  // genre filter (from Bangumi tags; backfills gradually)
  const genreOptions = useMemo(
    () => [{ value: 'all', label: '全部類型' }, ...genreList(list, meta).map((g) => ({ value: g, label: g }))],
    [list, meta]
  )

  // combined year + genre browse (either or both)
  const filtering = year !== 'all' || genre !== 'all'
  const filteredItems = useMemo(() => {
    if (!filtering) return []
    let items = list
    if (year !== 'all') items = items.filter((a) => a.year === year)
    if (genre !== 'all') items = items.filter((a) => (meta[a.catId]?.tags || []).includes(genre))
    return sortByScore(items, meta)
  }, [filtering, year, genre, list, meta])

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

  // Load the myself catalog only if the my-list has myself entries to render.
  const hasMyselfInList = myList.some((id) => id.startsWith('my:'))
  useEffect(() => {
    if (hasMyselfInList) loadMyCatalog()
  }, [hasMyselfInList, loadMyCatalog])

  // Group by season, then sort each season by rating (highest first).
  const groups = useMemo(() => {
    const g = groupBySeason(list)
    return g.map((grp) => ({ ...grp, items: sortByScore(grp.items, meta) }))
  }, [list, meta])

  // Global recommended picks: high score + high view count, reshuffled per seed.
  const recoPool = useMemo(() => recommendedPool(list, meta), [list, meta])
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
  const seen = new Set<string>([...progress.map((p) => p.catId), ...watched])
  const unseenReco = recoPool.filter((a) => !seen.has(a.catId))
  const basePool = unseenReco.length ? unseenReco : recoPool
  const heroPool = basePool.length
    ? basePool.slice(0, 12)
    : ([(continueWatching[0] && byId[continueWatching[0].catId]) || latest[0]].filter(Boolean) as typeof list)
  const hero = heroPool.length ? heroPool[heroIdx % heroPool.length] : undefined

  return (
    <div className="pb-20">
      {hero && (
        <div
          onMouseEnter={() => (heroPausedRef.current = true)}
          onMouseLeave={() => (heroPausedRef.current = false)}
        >
          <Hero key={hero.catId} anime={hero} />
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
