import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { recommendedPool } from '../lib'
import Grid from '../components/Grid'

export default function Recommend() {
  const list = useStore((s) => s.list)
  const meta = useStore((s) => s.meta)
  const [visible, setVisible] = useState(60)
  const sentinel = useRef<HTMLDivElement>(null)

  const pool = useMemo(() => recommendedPool(list, meta), [list, meta])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(
      (e) => e[0].isIntersecting && setVisible((v) => Math.min(v + 60, pool.length)),
      { rootMargin: '600px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [pool.length])

  return (
    <div className="pt-24 pb-20">
      <h1 className="px-8 text-2xl font-bold mb-1">🔥 為你推薦</h1>
      <p className="px-8 text-sm text-zinc-400 mb-6">
        高分且多人觀看的作品，依評分排序 · 共 {pool.length} 部
      </p>
      <Grid items={pool.slice(0, visible)} />
      {visible < pool.length && <div ref={sentinel} className="h-10" />}
    </div>
  )
}
