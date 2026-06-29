import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'

/** A poster in the 已看完 section. Resolves title/cover from the store (anime1
 *  byId+meta, or myself myById), links to the detail page, and has a ✕ to unmark. */
export default function WatchedCard({ catId, onUnmark }: { catId: string; onUnmark: () => void }) {
  const nav = useNavigate()
  const isMy = catId.startsWith('my:')
  const a1 = useStore((s) => s.byId[catId])
  const meta = useStore((s) => s.meta[catId])
  const my = useStore((s) => (isMy ? s.myById[catId.slice(3)] : undefined))
  const title = a1?.title || my?.title || catId
  const cover = meta?.cover || my?.cover

  const goDetail = (): void =>
    isMy ? nav(`/myself/anime/${catId.slice(3)}`, { state: { title } }) : nav(`/anime/${catId}`)

  return (
    <div className="shrink-0 w-32">
      <div
        onClick={goDetail}
        className="group relative aspect-[2/3] rounded-lg overflow-hidden bg-panel ring-1 ring-white/5 cursor-pointer hover:ring-white/30 transition"
      >
        {cover ? (
          <img src={cover} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-900" />
        )}
        <span className="absolute top-1 left-1 text-[10px] bg-green-600/85 text-white rounded px-1.5 py-0.5">✓ 已看完</span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onUnmark()
          }}
          title="取消已看完"
          className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white/90 text-sm flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-600/80 transition-opacity"
        >
          ✕
        </button>
      </div>
      <div className="mt-1 text-xs text-zinc-300 truncate">{title}</div>
    </div>
  )
}
