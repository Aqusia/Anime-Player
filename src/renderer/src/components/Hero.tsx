import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Anime, type Meta } from '../api'
import { useStore } from '../store'
import { heatScore } from '../lib'

export default function Hero({ anime }: { anime: Anime }) {
  const nav = useNavigate()
  const lite = useStore((s) => s.meta[anime.catId])
  const [full, setFull] = useState<Meta | null>(null)

  useEffect(() => {
    setFull(null)
    api.metaGet(anime.catId).then(setFull).catch(() => {})
  }, [anime.catId])

  const prog = useStore((s) => s.progressByCat[anime.catId])
  const bg = lite?.cover || full?.cover
  const desc = full?.description
  const rating = heatScore(lite?.score ?? full?.score, lite?.votes ?? full?.votes)

  // "立即觀看" should actually start playing: resume the last episode if there's
  // progress, else play episode 1 (fall back to the detail page on any failure).
  const playNow = async (): Promise<void> => {
    if (prog) return nav(`/watch/me/${anime.catId}/${prog.postId}`)
    try {
      const eps = await api.episodes(anime.catId)
      if (eps[0]) return nav(`/watch/me/${anime.catId}/${eps[0].postId}`)
    } catch {
      /* fall through to detail */
    }
    nav(`/anime/${anime.catId}`)
  }

  return (
    <div className="hero-fade relative h-[60vh] min-h-[400px] w-full overflow-hidden">
      {bg ? (
        <>
          {/* blurred fill + sharp cover so a portrait image fills a wide hero */}
          <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-60" referrerPolicy="no-referrer" />
          <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover object-top opacity-90" referrerPolicy="no-referrer" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-ink" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink/95 via-ink/30 to-transparent" />
      <div className="relative h-full flex flex-col justify-end px-8 pb-20 max-w-2xl">
        <h1 className="text-5xl font-extrabold mb-3 drop-shadow-lg">{anime.title}</h1>
        <div className="text-sm text-zinc-300 mb-2 flex items-center gap-2">
          {rating > 0 && <span className="text-amber-400 font-bold">★ {rating.toFixed(1)}</span>}
          <span>
            {anime.year} · {anime.season}季 · {anime.episodes}
          </span>
        </div>
        {desc && <p className="text-sm text-zinc-200 clamp-3 mb-5 max-w-xl">{desc}</p>}
        <div className="flex gap-3">
          <button
            onClick={playNow}
            className="bg-white text-black font-semibold px-7 py-2.5 rounded flex items-center gap-2 hover:bg-zinc-200 transition-colors"
          >
            ▶ {prog ? '繼續觀看' : '立即觀看'}
          </button>
          <button
            onClick={() => nav(`/anime/${anime.catId}`)}
            className="bg-white/20 backdrop-blur px-7 py-2.5 rounded hover:bg-white/30 transition-colors"
          >
            詳細資訊
          </button>
        </div>
      </div>
    </div>
  )
}
