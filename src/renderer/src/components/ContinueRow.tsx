import { useRef } from 'react'
import ContinueCard from './ContinueCard'
import type { Progress } from '../api'

export default function ContinueRow({ items }: { items: Progress[] }) {
  const scroller = useRef<HTMLDivElement>(null)
  if (!items.length) return null

  const scroll = (dir: number) => scroller.current?.scrollBy({ left: dir * 700, behavior: 'smooth' })

  return (
    <section className="mb-8 group/row">
      <div className="flex items-center justify-between px-8 mb-2">
        <h2 className="text-lg font-bold">繼續觀看</h2>
      </div>
      <div className="relative">
        <button
          onClick={() => scroll(-1)}
          className="absolute left-0 top-0 bottom-0 z-20 w-10 flex items-center justify-center bg-gradient-to-r from-ink to-transparent text-2xl opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          ‹
        </button>
        <div ref={scroller} className="flex gap-3 overflow-x-auto no-scrollbar px-8 pb-2">
          {items.map((p) => (
            <ContinueCard key={`${p.catId}_${p.postId}`} p={p} />
          ))}
        </div>
        <button
          onClick={() => scroll(1)}
          className="absolute right-0 top-0 bottom-0 z-20 w-10 flex items-center justify-center bg-gradient-to-l from-ink to-transparent text-2xl opacity-0 group-hover/row:opacity-100 transition-opacity"
        >
          ›
        </button>
      </div>
    </section>
  )
}
