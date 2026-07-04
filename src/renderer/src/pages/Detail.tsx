import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { api, type BgmEp, type Episode, type EpDownload, type Meta, type Progress } from '../api'
import { franchiseKey, timeAgo, heatScore, relatedAnime, titleCore } from '../lib'
import Card from '../components/Card'
import HoverPreview from '../components/HoverPreview'
import { DetailSkeleton, EpisodeGridSkeleton } from '../components/Skeleton'

function MeEp({
  catId,
  ep,
  i,
  info,
  p,
  epDl,
  onPlay
}: {
  catId: string
  ep: Episode
  i: number
  info?: BgmEp
  p?: Progress
  epDl?: EpDownload
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
      className="group/ep text-left bg-panel hover:bg-zinc-800 rounded-lg p-3 ring-1 ring-white/5 transition-colors relative"
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
      <div className="text-xs text-zinc-400 truncate">{info?.name || ep.title}</div>
      {pct > 0 && pct < 95 && (
        <div className="absolute left-0 bottom-0 h-1 bg-brand rounded-b" style={{ width: `${pct}%` }} />
      )}

      {hover && (
        <div className="pointer-events-none absolute z-40 left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 max-w-[80vw]">
          <div className="rounded-lg overflow-hidden border border-white/10 shadow-2xl bg-zinc-900">
            <HoverPreview
              resolve={() =>
                api.streamUrl({ catId, postId: ep.postId, apireq: ep.apireq }).then((url) => ({ url, hls: false }))
              }
            />
            <div className="p-3">
              <div className="text-xs font-semibold text-white mb-1">
                第 {i + 1} 話{info?.name ? `　${info.name}` : ''}
              </div>
              <div className="text-[11px] text-zinc-300 clamp-4 leading-relaxed">
                {info?.desc || '（無劇情簡介）'}
              </div>
            </div>
          </div>
        </div>
      )}
    </button>
  )
}

export default function Detail() {
  const { catId } = useParams()
  const nav = useNavigate()
  // individual selectors so unrelated store updates (e.g. download progress
  // broadcasts) don't re-render the whole page
  const byId = useStore((s) => s.byId)
  const list = useStore((s) => s.list)
  const myList = useStore((s) => s.myList)
  const watched = useStore((s) => s.watched)
  const toggleMy = useStore((s) => s.toggleMy)
  const toggleWatched = useStore((s) => s.toggleWatched)
  const loaded = useStore((s) => s.loaded)
  const load = useStore((s) => s.load)
  const metaMap = useStore((s) => s.meta)
  const myById = useStore((s) => s.myById)
  const loadMyCatalog = useStore((s) => s.loadMyCatalog)
  const downloads = useStore((s) => (catId ? s.downloads[catId] : undefined))
  const anime = catId ? byId[catId] : undefined

  // same show on the myself source? (lets the user switch 片源)
  useEffect(() => {
    loadMyCatalog()
  }, [loadMyCatalog])
  const myMatch = useMemo(() => {
    const c = anime ? titleCore(anime.title) : ''
    return c ? Object.values(myById).find((m) => titleCore(m.title) === c) : undefined
  }, [myById, anime])

  const [meta, setMeta] = useState<Meta | null>(null)
  const [eps, setEps] = useState<Episode[] | null>(null)
  const [bgmEps, setBgmEps] = useState<BgmEp[]>([])
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [allEps, setAllEps] = useState(false)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded])

  useEffect(() => {
    if (catId) {
      setMeta(null)
      setBgmEps([])
      api.metaGet(catId).then(setMeta).catch(() => {})
    }
  }, [catId])

  // fetch per-episode synopses once we know the Bangumi id
  useEffect(() => {
    if (meta?.bgmId) api.metaEpisodes(meta.bgmId).then(setBgmEps).catch(() => {})
  }, [meta?.bgmId])

  useEffect(() => {
    if (!catId) return
    setEps(null)
    api.episodes(catId).then(setEps).catch(() => setEps([]))
  }, [catId])

  useEffect(() => {
    if (!catId) return
    api.progressList().then((list) => {
      const m: Record<string, Progress> = {}
      for (const p of list) if (p.catId === catId) m[p.postId] = p
      setProgress(m)
    })
  }, [catId, eps])

  // sibling seasons of the same franchise
  const siblings = useMemo(() => {
    if (!anime) return []
    const key = franchiseKey(anime.title)
    return list.filter((a) => a.catId !== anime.catId && franchiseKey(a.title) === key)
  }, [anime?.catId, list])

  // genre-similar recommendations ("你可能也喜歡")
  const related = useMemo(
    () => (anime ? relatedAnime(anime, list, metaMap, 12) : []),
    [anime?.catId, list, metaMap]
  )

  const epByNum = useMemo(() => {
    const m: Record<number, BgmEp> = {}
    for (const e of bgmEps) m[Math.round(e.ep)] = e
    return m
  }, [bgmEps])

  const lastWatched = useMemo(
    () => Object.values(progress).sort((a, b) => b.updatedAt - a.updatedAt)[0],
    [progress]
  )

  const epStates = downloads ? Object.values(downloads.episodes) : []
  const doneCount = epStates.filter((e) => e.status === 'done').length
  const downloading = epStates.some((e) => e.status === 'downloading' || e.status === 'pending')
  const cur = epStates.find((e) => e.status === 'downloading')
  const curPct = cur && cur.total ? Math.round((cur.bytes / cur.total) * 100) : 0

  // deep link / first boot: the list may still be loading — show a skeleton
  // rather than flashing "找不到此動畫"
  if (!anime) return loaded ? <div className="pt-24 px-8 text-zinc-400">找不到此動畫。</div> : <DetailSkeleton />

  const inList = myList.includes(anime.catId)
  const isWatched = watched.includes(anime.catId)
  const bg = meta?.cover
  const lastWatchedNum =
    lastWatched?.episodeNum ?? (eps ? eps.findIndex((e) => e.postId === lastWatched?.postId) + 1 : 0)

  const play = () => {
    if (!eps || !eps.length) return
    nav(`/watch/me/${anime.catId}/${lastWatched ? lastWatched.postId : eps[0].postId}`)
  }
  const startDownload = () => {
    if (!eps || !eps.length || !catId) return
    api.downloadStart({
      catId,
      title: anime.title,
      episodes: eps.map((e, i) => ({ postId: e.postId, title: e.title, episodeNum: i + 1, apireq: e.apireq }))
    })
  }
  const removeDownload = () => catId && api.downloadDelete(catId)

  return (
    <div className="pb-20">
      <div className="relative h-[52vh] min-h-[360px] overflow-hidden">
        {bg ? (
          <>
            <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-50" referrerPolicy="no-referrer" />
            <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover object-top opacity-80" referrerPolicy="no-referrer" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-ink" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/90 to-transparent" />

        <div className="relative h-full flex items-end gap-6 px-8 pb-10">
          {meta?.cover && (
            <img src={meta.cover} alt="" referrerPolicy="no-referrer" className="w-44 rounded-lg shadow-2xl ring-1 ring-white/10 hidden sm:block" />
          )}
          <div className="max-w-2xl">
            <h1 className="text-4xl font-extrabold mb-2">{anime.title}</h1>
            {meta?.matchedTitle && meta.matchedTitle !== anime.title && (
              <div className="text-sm text-zinc-400 mb-1">{meta.matchedTitle}</div>
            )}
            <div className="text-sm text-zinc-300 mb-2 flex items-center gap-3 flex-wrap">
              {heatScore(meta?.score, meta?.votes) > 0 && (
                <span className="text-amber-400 font-bold">
                  ★ {heatScore(meta?.score, meta?.votes).toFixed(1)}
                  {meta?.score ? (
                    <span className="text-zinc-500 font-normal">
                      {' '}· Bangumi {meta.score.toFixed(1)}
                      {meta.votes ? `（${meta.votes} 人）` : ''}
                    </span>
                  ) : null}
                </span>
              )}
              <span>{anime.year} · {anime.season}季 · {anime.episodes}</span>
            </div>
            {meta?.tags && meta.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {meta.tags.slice(0, 6).map((t) => (
                  <button
                    key={t}
                    onClick={() => nav(`/?genre=${encodeURIComponent(t)}`)}
                    title={`瀏覽「${t}」類型`}
                    className="text-[11px] bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white rounded-full px-2 py-0.5 transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            {lastWatched && lastWatchedNum > 0 && (
              <div className="text-xs text-amber-300/90 mb-3">
                上次看到 第 {lastWatchedNum} 話 · {timeAgo(lastWatched.updatedAt)}
              </div>
            )}
            {meta?.description && <p className="text-sm text-zinc-200 clamp-4 mb-4">{meta.description}</p>}
            <div className="flex flex-wrap gap-3 items-center">
              <button onClick={play} disabled={!eps || !eps.length} className="bg-white text-black font-semibold px-7 py-2.5 rounded flex items-center gap-2 hover:bg-zinc-200 disabled:opacity-50">
                ▶ {lastWatched ? '繼續觀看' : '立即觀看'}
              </button>
              <button onClick={() => toggleMy(anime.catId)} className="bg-white/20 px-5 py-2.5 rounded hover:bg-white/30">
                {inList ? '✓ 已加入片單' : '＋ 我的片單'}
              </button>
              <button
                onClick={() => toggleWatched(anime.catId)}
                title="標記為已看完（含在別處看過的）— 看過的不會再出現在首頁推薦輪播"
                className={`px-5 py-2.5 rounded transition-colors ${isWatched ? 'bg-green-600/25 text-green-300 hover:bg-green-600/35' : 'bg-white/20 hover:bg-white/30'}`}
              >
                {isWatched ? '✓ 已看完' : '標記已看完'}
              </button>
              {myMatch && (
                <button
                  onClick={() => nav(`/myself/anime/${myMatch.id}`, { state: { title: myMatch.title } })}
                  title="這部在 Myself 也有，切換片源"
                  className="bg-emerald-600/20 text-emerald-300 px-5 py-2.5 rounded hover:bg-emerald-600/30"
                >
                  ⇄ 在 Myself 觀看
                </button>
              )}
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
                <button onClick={startDownload} disabled={!eps || !eps.length} className="bg-white/20 px-5 py-2.5 rounded hover:bg-white/30 disabled:opacity-50" title="下載整部到本機，離線也能看">
                  ⬇ 下載整部
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* sibling seasons */}
      {siblings.length > 0 && (
        <div className="px-8 mt-6">
          <h2 className="text-xl font-bold mb-3">本系列其他季數</h2>
          <div className="flex flex-wrap gap-x-3 gap-y-5">
            {siblings.map((a) => (
              <Card key={a.catId} anime={a} />
            ))}
          </div>
        </div>
      )}

      {/* episodes with synopsis preview */}
      <div className="px-8 mt-8">
        <h2 className="text-xl font-bold mb-4">劇集列表</h2>
        {eps === null ? (
          <EpisodeGridSkeleton />
        ) : eps.length === 0 ? (
          <p className="text-zinc-400">找不到劇集。</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {(allEps ? eps : eps.slice(0, 30)).map((ep, i) => (
                <MeEp
                  key={ep.postId}
                  catId={anime.catId}
                  ep={ep}
                  i={i}
                  info={epByNum[i + 1]}
                  p={progress[ep.postId]}
                  epDl={downloads?.episodes[ep.postId]}
                  onPlay={() => nav(`/watch/me/${anime.catId}/${ep.postId}`)}
                />
              ))}
            </div>
            {eps.length > 30 && (
              <button onClick={() => setAllEps((s) => !s)} className="mt-4 text-sm text-zinc-400 hover:text-white">
                {allEps ? '收合' : `顯示全部 ${eps.length} 話`}
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
              <Card key={a.catId} anime={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
