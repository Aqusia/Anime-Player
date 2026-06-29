import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, type BgmEp, type EpDownload, type MyDetails, type MyEpisode, type Progress } from '../api'
import { useStore } from '../store'
import { franchiseKey, heatScore, relatedMy, timeAgo } from '../lib'
import HoverPreview from '../components/HoverPreview'
import MyCard from '../components/MyCard'

function MyEp({
  ep,
  i,
  id,
  p,
  epDl,
  info,
  onPlay
}: {
  ep: MyEpisode
  i: number
  id: string
  p?: Progress
  epDl?: EpDownload
  info?: BgmEp
  onPlay: () => void
}) {
  const [hover, setHover] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pct = p && p.duration ? Math.min(100, (p.position / p.duration) * 100) : 0
  const done = pct >= 95
  return (
    <button
      onClick={onPlay}
      onMouseEnter={() => {
        timer.current = setTimeout(() => setHover(true), 200)
      }}
      onMouseLeave={() => {
        if (timer.current) clearTimeout(timer.current)
        setHover(false)
      }}
      className="group/ep relative bg-panel hover:bg-zinc-800 rounded-lg p-3 ring-1 ring-white/5 text-left transition-colors"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-lg font-bold text-zinc-200">第 {i + 1} 話</span>
        <span className="flex items-center gap-1.5">
          {epDl?.status === 'done' && <span className="text-xs text-sky-400" title="已下載">⬇</span>}
          {epDl?.status === 'downloading' && (
            <span className="text-[10px] text-sky-400">{epDl.total ? Math.round((epDl.bytes / epDl.total) * 100) : 0}%</span>
          )}
          {done && <span className="text-xs text-green-400">已看完</span>}
        </span>
      </div>
      <div className="text-xs text-zinc-400 truncate">{ep.name}</div>
      {pct > 0 && pct < 95 && (
        <div className="absolute left-0 bottom-0 h-1 bg-brand rounded-b" style={{ width: `${pct}%` }} />
      )}
      {hover && (
        <div className="pointer-events-none absolute z-40 left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 max-w-[80vw]">
          <div className="rounded-lg overflow-hidden border border-white/15 shadow-2xl bg-zinc-900">
            <HoverPreview resolve={() => api.myselfStreamUrl(id, ep.vid)} />
            <div className="p-3">
              <div className="text-xs font-semibold text-white mb-1 truncate">{ep.name}</div>
              {info?.desc ? (
                <div className="text-[11px] text-zinc-300 clamp-4 leading-relaxed">{info.desc}</div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </button>
  )
}

export default function MyselfDetail() {
  const { id = '' } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const st = loc.state as { title?: string; cover?: string; score?: number; votes?: number } | null
  const [det, setDet] = useState<MyDetails | null>(null)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const [tries, setTries] = useState(0)
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [allEps, setAllEps] = useState(false)
  const dl = useStore((s) => s.downloads[`my:${id}`])
  const myList = useStore((s) => s.myList)
  const toggleMy = useStore((s) => s.toggleMy)
  const watched = useStore((s) => s.watched)
  const toggleWatched = useStore((s) => s.toggleWatched)
  const myById = useStore((s) => s.myById)
  const loadMyCatalog = useStore((s) => s.loadMyCatalog)
  const inList = myList.includes(`my:${id}`)
  const isWatched = watched.includes(`my:${id}`)

  useEffect(() => {
    loadMyCatalog()
  }, [loadMyCatalog])

  useEffect(() => {
    setTries(0)
  }, [id])

  useEffect(() => {
    let alive = true
    setDet(null)
    setFailed(false)
    api.myselfDetails(id).then(
      (d) => alive && setDet(d),
      () => alive && setFailed(true)
    )
    return () => {
      alive = false
    }
  }, [id, reload])

  // The myself source is flaky; rather than dump a "重新載入" button on the user,
  // the loader retries itself (with capped backoff) while they wait on the page.
  useEffect(() => {
    if (!failed) return
    const t = setTimeout(() => {
      setTries((n) => n + 1)
      setReload((n) => n + 1)
    }, Math.min(1500 * 2 ** tries, 8000))
    return () => clearTimeout(t)
  }, [failed, tries])

  useEffect(() => {
    api.progressList().then((list) => {
      const m: Record<string, Progress> = {}
      for (const p of list) if (p.catId === `my:${id}`) m[p.postId] = p
      setProgress(m)
    })
  }, [id, det])

  // Bangumi per-episode synopses (best-effort — resolved + cached in the main proc)
  const [bgmEps, setBgmEps] = useState<BgmEp[]>([])
  useEffect(() => {
    setBgmEps([])
    const t = det?.title || st?.title
    if (!t) return
    api.myselfEpisodes(id, t).then(setBgmEps).catch(() => {})
  }, [id, det?.title])
  const epByNum = useMemo(() => {
    const m: Record<number, BgmEp> = {}
    for (const e of bgmEps) m[Math.round(e.ep)] = e
    return m
  }, [bgmEps])

  const title = det?.title || st?.title || id
  const cover = det?.cover || st?.cover
  const eps = det?.episodes || []
  const play = (vid: string) => nav(`/watch/my/${id}/${vid}`, { state: { title, cover } })

  // 綜合評分 from router state (came from a card) or the cached catalog (direct visit)
  const self = myById[id]
  const rating = st?.score ? heatScore(st.score, st.votes) : self ? heatScore(self.score, self.votes) : -1

  // same-series + "你可能也喜歡", from the cached catalog
  const catalog = useMemo(() => Object.values(myById), [myById])
  const siblings = useMemo(
    () => catalog.filter((a) => a.id !== id && franchiseKey(a.title) === franchiseKey(title)),
    [catalog, id, title]
  )
  const related = useMemo(
    () => relatedMy({ id, title, year: self?.year }, catalog, 12),
    [catalog, id, title, self?.year]
  )

  const lastWatched = useMemo(
    () => Object.values(progress).sort((a, b) => b.updatedAt - a.updatedAt)[0],
    [progress]
  )
  const lastWatchedNum = lastWatched
    ? lastWatched.episodeNum ?? eps.findIndex((e) => e.vid === lastWatched.postId) + 1
    : 0

  const epStates = dl ? Object.values(dl.episodes) : []
  const doneCount = epStates.filter((e) => e.status === 'done').length
  const downloading = epStates.some((e) => e.status === 'downloading' || e.status === 'pending')
  const cur = epStates.find((e) => e.status === 'downloading')
  const curPct = cur && cur.total ? Math.round((cur.bytes / cur.total) * 100) : 0

  const startDownload = (): void => {
    if (!eps.length) return
    api.downloadStart({
      catId: `my:${id}`,
      title,
      cover,
      episodes: eps.map((e, i) => ({ postId: e.vid, title: e.name, episodeNum: i + 1 }))
    })
  }
  const removeDownload = (): void => void api.downloadDelete(`my:${id}`)

  return (
    <div className="pb-20">
      {/* hero — mirrors anime1's Detail so both sources feel like one app */}
      <div className="relative h-[52vh] min-h-[360px] overflow-hidden">
        {cover ? (
          <>
            <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-50" referrerPolicy="no-referrer" />
            <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover object-top opacity-80" referrerPolicy="no-referrer" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-ink" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/90 to-transparent" />

        <div className="relative h-full flex items-end gap-6 px-8 pb-10">
          {cover && (
            <img src={cover} alt="" referrerPolicy="no-referrer" className="w-44 rounded-lg shadow-2xl ring-1 ring-white/10 hidden sm:block" />
          )}
          <div className="max-w-2xl min-w-0">
            <div className="text-xs text-emerald-300 mb-1">Myself 動漫</div>
            <h1 className="text-4xl font-extrabold mb-2">{title}</h1>
            <div className="text-sm text-zinc-300 mb-2 flex items-center gap-3 flex-wrap">
              {rating > 0 && <span className="text-amber-400 font-bold">★ {rating.toFixed(1)}</span>}
              {det && det.category.length > 0 && <span>{det.category.join(' · ')}</span>}
              {det?.premiere && <span>首播 {det.premiere}</span>}
            </div>
            {lastWatched && lastWatchedNum > 0 && (
              <div className="text-xs text-amber-300/90 mb-3">
                上次看到 第 {lastWatchedNum} 話 · {timeAgo(lastWatched.updatedAt)}
              </div>
            )}
            {det?.description && (
              <p className="text-sm text-zinc-200 clamp-4 mb-4 whitespace-pre-line">{det.description}</p>
            )}
            <div className="flex flex-wrap gap-3 items-center">
              <button
                onClick={() => play(lastWatched ? lastWatched.postId : eps[0]?.vid)}
                disabled={!eps.length}
                className="bg-white text-black font-semibold px-7 py-2.5 rounded flex items-center gap-2 hover:bg-zinc-200 disabled:opacity-50"
              >
                ▶ {lastWatched ? '繼續觀看' : '立即觀看'}
              </button>
              <button onClick={() => toggleMy(`my:${id}`)} className="bg-white/20 px-5 py-2.5 rounded hover:bg-white/30">
                {inList ? '✓ 已加入片單' : '＋ 我的片單'}
              </button>
              <button
                onClick={() => toggleWatched(`my:${id}`)}
                title="標記為已看完（含在別處看過的）"
                className={`px-5 py-2.5 rounded transition-colors ${isWatched ? 'bg-green-600/25 text-green-300 hover:bg-green-600/35' : 'bg-white/20 hover:bg-white/30'}`}
              >
                {isWatched ? '✓ 已看完' : '標記已看完'}
              </button>
              {downloading ? (
                <div className="flex items-center gap-2 bg-white/10 px-4 py-2.5 rounded">
                  <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="text-sm">下載中 {doneCount}/{epStates.length}（本集 {curPct}%）</span>
                  <button onClick={removeDownload} className="text-xs text-zinc-300 hover:text-white underline">取消</button>
                </div>
              ) : doneCount > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="bg-green-600/20 text-green-300 px-4 py-2.5 rounded text-sm">✓ 已下載 {doneCount} 集</span>
                  <button onClick={removeDownload} className="bg-white/10 px-4 py-2.5 rounded hover:bg-red-600/30 text-sm">🗑 刪除下載</button>
                </div>
              ) : (
                eps.length > 0 && (
                  <button onClick={startDownload} className="bg-white/20 px-5 py-2.5 rounded hover:bg-white/30" title="下載整部到本機，離線也能看">
                    ⬇ 下載整部
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {siblings.length > 0 && (
        <div className="px-8 mt-6">
          <h2 className="text-xl font-bold mb-3">本系列其他作品</h2>
          <div className="flex flex-wrap gap-x-3 gap-y-5">
            {siblings.map((a) => (
              <MyCard key={a.id} a={a} />
            ))}
          </div>
        </div>
      )}

      <div className="px-8 mt-8">
        <h2 className="text-xl font-bold mb-4">劇集列表</h2>
        {det === null ? (
          <div className="flex items-center gap-3 text-zinc-400">
            <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>{tries > 0 ? '載入劇集中…（Myself 來源較慢,自動重試中）' : '載入劇集中…'}</span>
          </div>
        ) : eps.length === 0 ? (
          <p className="text-zinc-400">找不到劇集。</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {(allEps ? eps : eps.slice(0, 30)).map((ep, i) => (
                <MyEp
                  key={ep.vid}
                  ep={ep}
                  i={i}
                  id={id}
                  p={progress[ep.vid]}
                  epDl={dl?.episodes[ep.vid]}
                  info={epByNum[i + 1]}
                  onPlay={() => play(ep.vid)}
                />
              ))}
            </div>
            {eps.length > 30 && (
              <button onClick={() => setAllEps((s) => !s)} className="mt-4 text-sm text-zinc-400 hover:text-white">
                {allEps ? '收合' : `顯示全部 ${eps.length} 集`}
              </button>
            )}
          </>
        )}
      </div>

      {related.length > 0 && (
        <div className="px-8 mt-10">
          <h2 className="text-xl font-bold mb-3">你可能也喜歡</h2>
          <div className="flex flex-wrap gap-x-3 gap-y-5">
            {related.map((a) => (
              <MyCard key={a.id} a={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
