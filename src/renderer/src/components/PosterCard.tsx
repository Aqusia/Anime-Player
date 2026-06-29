import type { ReactNode } from 'react'
import { heatScore } from '../lib'
import { useStore } from '../store'

export interface PosterCardProps {
  cover?: string
  title: string
  /** Bangumi raw score + vote count — combined into the displayed 綜合評分. */
  score?: number
  votes?: number
  /** Small top-left chip (e.g. premiere year). */
  topLeft?: string
  /** Secondary line under the title (e.g. "2023 春 · 全12話"). */
  sub?: string
  /** Optional extra chip in the bottom-left of the poster (e.g. a source tag). */
  badge?: ReactNode
  /** Watch key (anime1 catId, or `my:<id>`) — drives the 已看完 / 觀看中 marker. */
  catId?: string
  onClick: () => void
}

/**
 * Shared poster card used by BOTH sources (anime1 <Card> and myself <MyCard>),
 * so the catalog looks like one app: cover, 綜合評分 ★ top-right, year top-left,
 * hover title overlay, and a title + sub line beneath.
 */
export default function PosterCard({
  cover,
  title,
  score,
  votes,
  topLeft,
  sub,
  badge,
  catId,
  onClick
}: PosterCardProps) {
  const rating = heatScore(score, votes)
  const isWatched = useStore((s) => (catId ? s.watched.includes(catId) : false))
  const prog = useStore((s) => (catId ? s.progressByCat[catId] : undefined))
  // "正在觀看" bar: prefer series progress (episode N of M), else position in the ep.
  const progPct = prog
    ? prog.episodeNum && prog.totalEpisodes
      ? Math.min(100, (prog.episodeNum / prog.totalEpisodes) * 100)
      : prog.duration
        ? Math.min(100, (prog.position / prog.duration) * 100)
        : 0
    : 0
  return (
    <div className="shrink-0 w-40">
      <div
        onClick={onClick}
        className="group relative aspect-[2/3] rounded-lg overflow-hidden bg-panel ring-1 ring-white/5 cursor-pointer transition-transform duration-200 hover:scale-105 hover:ring-white/30 hover:z-10"
      >
        {cover ? (
          <img
            src={cover}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-zinc-700 to-zinc-900">
            <span className="text-sm font-semibold clamp-4">{title}</span>
            {topLeft ? <span className="mt-2 text-[10px] text-zinc-400">{topLeft}</span> : null}
          </div>
        )}

        {rating > 0 && (
          <div className="absolute top-1.5 right-1.5 bg-black/75 text-amber-400 text-xs font-bold rounded px-1.5 py-0.5 backdrop-blur-sm">
            ★ {rating.toFixed(1)}
          </div>
        )}
        {topLeft ? (
          <div className="absolute top-1.5 left-1.5 bg-black/70 text-zinc-200 text-[10px] rounded px-1.5 py-0.5">
            {topLeft}
          </div>
        ) : null}
        {badge ? <div className="absolute bottom-1.5 left-1.5">{badge}</div> : null}

        <div className="absolute inset-x-0 bottom-0 p-2 pt-6 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="text-xs font-medium clamp-2">{title}</div>
        </div>

        {/* watch-status marker, at a glance over the poster */}
        {isWatched ? (
          <div className="absolute inset-x-0 bottom-0 bg-green-600/90 text-white text-[10px] font-medium text-center py-0.5">
            ✓ 已看完
          </div>
        ) : prog ? (
          <>
            <div className="absolute bottom-1.5 left-1.5 bg-brand/90 text-white text-[10px] rounded px-1.5 py-0.5">
              {prog.episodeNum ? `觀看中 ${prog.episodeNum}${prog.totalEpisodes ? `/${prog.totalEpisodes}` : ''}` : '觀看中'}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
              <div className="h-full bg-brand" style={{ width: `${progPct}%` }} />
            </div>
          </>
        ) : null}
      </div>
      <div className="mt-1.5 px-0.5">
        <div className="text-xs text-zinc-300 truncate" title={title}>
          {title}
        </div>
        {sub ? <div className="text-[10px] text-zinc-500 truncate">{sub}</div> : null}
      </div>
    </div>
  )
}
