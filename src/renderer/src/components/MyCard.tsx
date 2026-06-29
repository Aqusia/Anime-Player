import { useNavigate } from 'react-router-dom'
import { type MyAnime } from '../api'
import PosterCard from './PosterCard'

/** myself-bbs poster card — wraps the shared <PosterCard> so both sources match.
 *  Passes score/votes along in router state so the detail page can show the
 *  same 綜合評分 without an extra lookup. */
export default function MyCard({ a }: { a: MyAnime }) {
  const nav = useNavigate()
  const epLabel =
    a.episodes > 0 ? (a.kind === 'airing' ? `更新至 ${a.episodes}` : `全 ${a.episodes} 集`) : ''
  const sub = [a.year ? String(a.year) : '', epLabel].filter(Boolean).join(' · ')
  return (
    <PosterCard
      cover={a.cover}
      title={a.title}
      score={a.score}
      votes={a.votes}
      topLeft={a.year ? String(a.year) : undefined}
      sub={sub}
      catId={`my:${a.id}`}
      onClick={() =>
        nav(`/myself/anime/${a.id}`, {
          state: { title: a.title, cover: a.cover, score: a.score, votes: a.votes }
        })
      }
    />
  )
}
