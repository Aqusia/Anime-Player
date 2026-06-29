import { useNavigate } from 'react-router-dom'
import { type Progress } from '../api'
import { useStore } from '../store'
import { fmtTime, timeAgo } from '../lib'

/** A watch-history entry (latest episode watched of one anime) with resume,
 *  a 已看完 tick (mark watched → moves to the 已看完 section) and remove. */
export default function HistoryCard({
  p,
  onRemove,
  onMarkWatched
}: {
  p: Progress
  onRemove: () => void
  onMarkWatched: () => void
}) {
  const nav = useNavigate()
  const isMy = p.catId.startsWith('my:')
  const meta = useStore((s) => s.meta[p.catId])
  const a1 = useStore((s) => s.byId[p.catId])
  const my = useStore((s) => (isMy ? s.myById[p.catId.slice(3)] : undefined))
  const cover = meta?.cover || my?.cover || p.cover
  const title = a1?.title || my?.title || p.animeTitle
  const pct = p.duration ? Math.min(100, (p.position / p.duration) * 100) : 0
  const done = pct >= 95
  const epLabel = p.episodeNum ? `第 ${p.episodeNum} 話` : p.episodeTitle || '繼續觀看'

  const play = (): void => {
    if (isMy) nav(`/watch/my/${p.catId.slice(3)}/${p.postId}`, { state: { title: p.animeTitle } })
    else nav(`/watch/me/${p.catId}/${p.postId}`)
  }
  const goDetail = (): void =>
    isMy
      ? nav(`/myself/anime/${p.catId.slice(3)}`, { state: { title: p.animeTitle } })
      : nav(`/anime/${p.catId}`)

  return (
    <div className="shrink-0 w-44">
      <div
        onClick={play}
        className="group relative aspect-video rounded-lg overflow-hidden bg-panel ring-1 ring-white/5 cursor-pointer transition-transform duration-200 hover:scale-105 hover:ring-white/30 hover:z-10"
      >
        {cover ? (
          <img
            src={cover}
            alt=""
            className="w-full h-full object-cover blur-[1px] scale-110 opacity-90"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-900" />
        )}
        <div className="absolute inset-0 bg-black/30" />

        {/* remove from history */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          title="從紀錄移除"
          className="absolute top-1.5 right-1.5 z-10 h-6 w-6 rounded-full bg-black/60 text-white/90 text-sm flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-600/80 transition-opacity"
        >
          ✕
        </button>

        {/* tick to mark the whole anime 已看完 (moves it to the 已看完 section) */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onMarkWatched()
          }}
          title="標記為已看完"
          className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1 text-[10px] bg-black/55 text-white/90 rounded px-1.5 py-0.5 hover:bg-green-600/80 transition-colors"
        >
          <span className="inline-block w-2.5 h-2.5 border border-white/70 rounded-[2px]" />
          {done ? '已看完' : '標記已看完'}
        </button>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-11 w-11 rounded-full bg-white/85 text-black flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 px-2 pt-6 pb-2.5 bg-gradient-to-t from-black/90 to-transparent">
          <div className="text-xs font-semibold truncate">{epLabel}</div>
          <div className="text-[10px] text-zinc-300">{timeAgo(p.updatedAt)}</div>
        </div>

        <div className="absolute left-0 right-0 bottom-0 h-1 bg-white/20">
          <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="mt-1.5 px-0.5">
        <button
          onClick={goDetail}
          title="查看動畫介紹"
          className="block w-full text-left text-xs text-zinc-300 truncate hover:text-white hover:underline"
        >
          {title}
        </button>
        <div className="text-[10px] text-zinc-500 truncate">
          {done ? '已看完' : `看到 ${fmtTime(p.position)} / ${fmtTime(p.duration)}`}
        </div>
      </div>
    </div>
  )
}
