import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { type Progress } from '../api'
import { useStore } from '../store'
import { fmtTime, timeAgo } from '../lib'
import FadeImg from './FadeImg'

function ContinueCard({ p, onRemove }: { p: Progress; onRemove?: (p: Progress) => void }) {
  const nav = useNavigate()
  const meta = useStore((s) => s.meta[p.catId])
  const anime = useStore((s) => s.byId[p.catId])
  const cover = meta?.cover || p.cover
  const pct = p.duration ? Math.min(100, (p.position / p.duration) * 100) : 0
  const epLabel = p.episodeNum ? `第 ${p.episodeNum} 話` : p.episodeTitle || '繼續觀看'
  const isMy = p.catId.startsWith('my:')
  const goDetail = () =>
    isMy
      ? nav(`/myself/anime/${p.catId.slice(3)}`, { state: { title: p.animeTitle } })
      : nav(`/anime/${p.catId}`)

  return (
    <div className="shrink-0 w-44">
      <div
        onClick={() =>
          isMy
            ? nav(`/watch/my/${p.catId.slice(3)}/${p.postId}`, { state: { title: p.animeTitle } })
            : nav(`/watch/me/${p.catId}/${p.postId}`)
        }
        className="group relative aspect-video rounded-lg overflow-hidden bg-panel ring-1 ring-white/5 cursor-pointer transition-transform duration-200 hover:scale-105 hover:ring-white/30 hover:z-10"
      >
        {cover ? (
          <FadeImg
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
        {/* play overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-11 w-11 rounded-full bg-white/85 text-black flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove(p)
            }}
            title="從繼續觀看移除（清除本作觀看進度）"
            className="absolute top-1.5 right-1.5 z-10 h-6 w-6 rounded-full bg-black/60 text-zinc-300 hover:text-white hover:bg-black/85 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs"
          >
            ✕
          </button>
        )}
        {/* info */}
        <div className="absolute inset-x-0 bottom-0 px-2 pt-6 pb-2.5 bg-gradient-to-t from-black/90 to-transparent">
          <div className="text-xs font-semibold truncate">{epLabel}</div>
          <div className="text-[10px] text-zinc-300">
            {timeAgo(p.updatedAt)}
            {p.totalEpisodes ? ` · 共 ${p.totalEpisodes} 話` : ''}
          </div>
        </div>
        {/* progress bar */}
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
          {anime?.title || p.animeTitle}
        </button>
        <div className="text-[10px] text-zinc-500 truncate">
          看到 {fmtTime(p.position)} / {fmtTime(p.duration)}
        </div>
      </div>
    </div>
  )
}

export default memo(ContinueCard)
