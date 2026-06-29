import { useNavigate } from 'react-router-dom'
import { api, type MyAnime } from '../api'
import { useStore } from '../store'
import { heatScore } from '../lib'

/** Featured banner for the Myself home — mirrors anime1's <Hero>, but for a
 *  MyAnime (no Bangumi metaGet; uses the catalog's own cover/score). "立即觀看"
 *  resolves episodes and plays (resume if there's progress). */
export default function MyHero({ a }: { a: MyAnime }) {
  const nav = useNavigate()
  const prog = useStore((s) => s.progressByCat[`my:${a.id}`])
  const rating = heatScore(a.score, a.votes)
  const epLabel = a.episodes > 0 ? (a.kind === 'airing' ? `更新至 ${a.episodes} 集` : `全 ${a.episodes} 集`) : ''
  const state = { title: a.title, cover: a.cover }

  const playNow = async (): Promise<void> => {
    if (prog) return nav(`/watch/my/${a.id}/${prog.postId}`, { state })
    try {
      const d = await api.myselfDetails(a.id)
      const vid = d.episodes[0]?.vid
      if (vid) return nav(`/watch/my/${a.id}/${vid}`, { state })
    } catch {
      /* fall through to detail */
    }
    nav(`/myself/anime/${a.id}`, { state: { title: a.title } })
  }

  return (
    <div className="hero-fade relative h-[52vh] min-h-[340px] w-full overflow-hidden rounded-xl mb-8">
      {a.cover ? (
        <>
          <img src={a.cover} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-60" referrerPolicy="no-referrer" />
          <img src={a.cover} alt="" className="absolute inset-0 w-full h-full object-cover object-top opacity-90" referrerPolicy="no-referrer" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-ink" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink/95 via-ink/30 to-transparent" />
      <div className="relative h-full flex flex-col justify-end p-8 max-w-2xl">
        <div className="text-xs text-emerald-300 mb-1">Myself 動漫 · 為你推薦</div>
        <h1 className="text-4xl font-extrabold mb-3 drop-shadow-lg clamp-2">{a.title}</h1>
        <div className="text-sm text-zinc-300 mb-4 flex items-center gap-2">
          {rating > 0 && <span className="text-amber-400 font-bold">★ {rating.toFixed(1)}</span>}
          {a.year ? <span>{a.year}</span> : null}
          {epLabel ? <span>· {epLabel}</span> : null}
        </div>
        <div className="flex gap-3">
          <button
            onClick={playNow}
            className="bg-white text-black font-semibold px-7 py-2.5 rounded flex items-center gap-2 hover:bg-zinc-200 transition-colors"
          >
            ▶ {prog ? '繼續觀看' : '立即觀看'}
          </button>
          <button
            onClick={() => nav(`/myself/anime/${a.id}`, { state: { title: a.title } })}
            className="bg-white/20 backdrop-blur px-7 py-2.5 rounded hover:bg-white/30 transition-colors"
          >
            詳細資訊
          </button>
        </div>
      </div>
    </div>
  )
}
