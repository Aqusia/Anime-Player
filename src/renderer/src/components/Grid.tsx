import Card from './Card'
import MyCard from './MyCard'
import type { Anime, MyAnime } from '../api'

/** Wrapping grid of poster cards — accepts both anime1 and myself items. */
export default function Grid({ items }: { items: (Anime | MyAnime)[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-5 px-8">
      {items.map((it) =>
        'catId' in it ? <Card key={it.catId} anime={it} /> : <MyCard key={`my${it.id}`} a={it} />
      )}
    </div>
  )
}
