import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api, type MyAnime, type MyKind } from '../api'
import { recommendedMy, weightedScoreMy, franchiseKey } from '../lib'
import { useStore } from '../store'
import MyCard from '../components/MyCard'
import MyHero from '../components/MyHero'
import Dropdown from '../components/Dropdown'

const PAGE = 60 // cards revealed per scroll step

export default function MyselfHome() {
  const [catalog, setCatalog] = useState<MyAnime[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [kind, setKind] = useState<MyKind>('completed')
  const [year, setYear] = useState<string>('all')
  const [visible, setVisible] = useState(PAGE)

  const [recoSeed, setRecoSeed] = useState(1)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<MyAnime[] | null>(null)
  const [searching, setSearching] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const recommended = useMemo(
    () => (catalog ? recommendedMy(catalog, 24, recoSeed) : []),
    [catalog, recoSeed]
  )

  // Rotating featured hero — top-rated, franchise-deduped, preferring titles the
  // user hasn't watched. Rotates every 8s, pauses on hover (like anime1 Home).
  const watched = useStore((s) => s.watched)
  const [heroIdx, setHeroIdx] = useState(0)
  const heroPausedRef = useRef(false)
  useEffect(() => {
    const t = setInterval(() => {
      if (!heroPausedRef.current) setHeroIdx((i) => i + 1)
    }, 8000)
    return () => clearInterval(t)
  }, [])
  const heroPool = useMemo(() => {
    if (!catalog) return [] as MyAnime[]
    const seen = new Set(watched)
    const ranked = catalog
      .filter((a) => weightedScoreMy(a) > 0 && !seen.has(`my:${a.id}`))
      .sort((x, y) => weightedScoreMy(y) - weightedScoreMy(x))
    const out: MyAnime[] = []
    const fk = new Set<string>()
    for (const a of ranked) {
      const k = franchiseKey(a.title)
      if (fk.has(k)) continue
      fk.add(k)
      out.push(a)
      if (out.length >= 12) break
    }
    return out
  }, [catalog, watched])
  const hero = heroPool.length ? heroPool[heroIdx % heroPool.length] : null

  // Load the whole catalog ONCE from the cached index — instant, no per-page
  // network (this is what made the old version hang). Refresh when background
  // enrichment finishes so ratings + the year filter appear without a reload.
  useEffect(() => {
    let cancelled = false
    const fetchCatalog = (): void => {
      api
        .myselfCatalog()
        .then((c) => !cancelled && setCatalog(c))
        .catch(() => !cancelled && setFailed(true))
    }
    fetchCatalog()
    const off = api.onMyselfEnriched(fetchCatalog)
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const kindItems = useMemo(() => (catalog || []).filter((a) => a.kind === kind), [catalog, kind])

  // Distinct premiere years present in this tab (newest first), for the year filter.
  const yearOptions = useMemo(() => {
    const ys = new Set<number>()
    for (const a of kindItems) if (a.year && a.year > 0) ys.add(a.year)
    return [
      { value: 'all', label: '全部年份' },
      ...[...ys].sort((x, y) => y - x).map((y) => ({ value: String(y), label: String(y) }))
    ]
  }, [kindItems])

  // Filter by year, then rank by the Bayesian weighted score (rated-and-popular
  // first; obscure high-score titles are tempered by their low vote count).
  const filtered = useMemo(() => {
    const items = year === 'all' ? kindItems : kindItems.filter((a) => String(a.year) === year)
    return [...items].sort((a, b) => weightedScoreMy(b) - weightedScoreMy(a))
  }, [kindItems, year])

  useEffect(() => setVisible(PAGE), [kind, year])

  const loadMore = useCallback(
    () => setVisible((v) => Math.min(v + PAGE, filtered.length)),
    [filtered.length]
  )
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((es) => es[0].isIntersecting && loadMore(), {
      rootMargin: '800px'
    })
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore])

  // debounced full-catalog search
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    const query = q.trim()
    if (query.length < 1) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    debounce.current = setTimeout(() => {
      api
        .myselfSearch(query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 350)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [q])

  const inSearch = q.trim().length >= 1

  return (
    <div className="pt-24 pb-20 px-8">
      <div className="flex items-center justify-between gap-4 mb-1 flex-wrap">
        <h1 className="text-2xl font-bold">
          Myself 動漫 <span className="text-sm font-normal text-zinc-400">完整片庫 · 第二來源</span>
        </h1>
        <div className="relative w-80 max-w-full">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋全站動畫（繁簡、片段名稱都可）…"
            className="w-full bg-white/10 focus:bg-white/15 rounded-lg pl-4 pr-9 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30 placeholder:text-zinc-500"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              title="清除"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-sm"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-zinc-500 mb-5">
        直接搜尋整個 myself-bbs 片庫——支援繁簡互換與模糊比對。或在下方依「連載中／完結」與年份瀏覽。
      </p>

      {inSearch ? (
        <>
          {searching ? (
            <p className="text-zinc-400">搜尋「{q.trim()}」中…</p>
          ) : results && results.length === 0 ? (
            <div className="text-zinc-400 space-y-2">
              <p>Myself 片庫中找不到符合「{q.trim()}」的作品(可能此來源未收錄,或譯名不同)。</p>
              <p>
                試試更短的關鍵字,或到{' '}
                <Link to={`/search?q=${encodeURIComponent(q.trim())}`} className="text-brand hover:underline">
                  統一搜尋（anime1 + Myself）
                </Link>
                。
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-400 mb-4">「{q.trim()}」的搜尋結果（{results?.length ?? 0}）</p>
              <div className="flex flex-wrap gap-x-3 gap-y-5">
                {results?.map((a) => <MyCard key={a.id} a={a} />)}
              </div>
            </>
          )}
        </>
      ) : catalog === null && !failed ? (
        <p className="text-zinc-400">載入片庫中…(首次啟動需建立索引,約 1 分鐘,完成後即可瞬間瀏覽)</p>
      ) : failed ? (
        <p className="text-zinc-400">片庫載入失敗,請稍後重新開啟。</p>
      ) : (
        <>
          {hero && (
            <div
              onMouseEnter={() => (heroPausedRef.current = true)}
              onMouseLeave={() => (heroPausedRef.current = false)}
            >
              <MyHero key={hero.id} a={hero} />
            </div>
          )}
          {recommended.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-lg font-bold">🔥 為你推薦</h2>
                <button
                  onClick={() => setRecoSeed((s) => s + 1)}
                  className="text-xs text-zinc-400 hover:text-white flex items-center gap-1"
                  title="換一批"
                >
                  ↻ 換一批
                </button>
              </div>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
                {recommended.map((a) => (
                  <MyCard key={a.id} a={a} />
                ))}
              </div>
            </section>
          )}

          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {(['completed', 'airing'] as MyKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`px-4 py-1.5 rounded text-sm transition-colors ${
                  k === kind ? 'bg-brand text-white' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {k === 'completed' ? '完結動畫' : '連載中'}
              </button>
            ))}
            {yearOptions.length > 1 && (
              <Dropdown value={year} options={yearOptions} onChange={setYear} className="ml-1" />
            )}
            <span className="ml-auto text-xs text-zinc-500">{filtered.length} 部</span>
          </div>

          {filtered.length === 0 ? (
            <p className="text-zinc-400">這個分類沒有可顯示的作品。</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-3 gap-y-5">
                {filtered.slice(0, visible).map((a) => <MyCard key={a.id} a={a} />)}
              </div>
              {visible < filtered.length && <div ref={sentinel} className="h-12" />}
            </>
          )}
        </>
      )}
    </div>
  )
}
