import { useNavigate } from 'react-router-dom'
import { type Anime } from '../api'
import { useStore } from '../store'
import PosterCard from './PosterCard'

/** anime1 poster card — wraps the shared <PosterCard> with store-backed meta. */
export default function Card({ anime }: { anime: Anime }) {
  const nav = useNavigate()
  const meta = useStore((s) => s.meta[anime.catId])
  const sub = [`${anime.year} ${anime.season}`.trim(), anime.episodes].filter(Boolean).join(' · ')
  return (
    <PosterCard
      cover={meta?.cover}
      title={anime.title}
      score={meta?.score}
      votes={meta?.votes}
      topLeft={anime.year || undefined}
      sub={sub}
      catId={anime.catId}
      onClick={() => nav(`/anime/${anime.catId}`)}
    />
  )
}
