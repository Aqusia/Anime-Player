import { useRef } from 'react'
import { Link } from 'react-router-dom'
import Card from './Card'
import MyCard from './MyCard'
import type { Anime, MyAnime } from '../api'

export default function Row({
  title,
  items,
  to,
  onRefresh
}: {
  title: string
  items: (Anime | MyAnime)[]
  to?: string
  onRefresh?: () => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  if (!items.length) return null

  const scroll = (dir: number) => {
    scroller.current?.scrollBy({ left: dir * 700, behavior: 'smooth' })
  }

  return (
    <section className="mb-8 group/row">
      <div className="flex items-center justify-between px-8 mb-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          {title}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-zinc-400 hover:text-white text-sm"
              title="換一批推薦"
            >
              ↻ 換一批
            </button>
          )}
        </h2>
        {to && (
          <Link to={to} className="text-xs text-zinc-400 hover:text-white">
            查看全部 ›
          </Link>
        )}
      </div>
      <div className="relative">
        <button
          onClick={() => scroll(-1)}
          className="absolute left-0 top-0 bottom-0 z-20 w-10 flex items-center justify-center bg-gradient-to-r from-ink to-transparent text-2xl opacity-0 group-hover/row:opacity-100 transition-opacity"
          aria-label="prev"
        >
          ‹
        </button>
        <div ref={scroller} className="flex gap-3 overflow-x-auto no-scrollbar px-8 pb-2">
          {items.map((it) =>
            'catId' in it ? <Card key={it.catId} anime={it} /> : <MyCard key={`my${it.id}`} a={it} />
          )}
        </div>
        <button
          onClick={() => scroll(1)}
          className="absolute right-0 top-0 bottom-0 z-20 w-10 flex items-center justify-center bg-gradient-to-l from-ink to-transparent text-2xl opacity-0 group-hover/row:opacity-100 transition-opacity"
          aria-label="next"
        >
          ›
        </button>
      </div>
    </section>
  )
}
