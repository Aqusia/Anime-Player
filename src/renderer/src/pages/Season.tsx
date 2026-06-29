import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '../store'
import { sortByScore } from '../lib'
import Grid from '../components/Grid'

export default function Season() {
  const { key } = useParams()
  const list = useStore((s) => s.list)
  const meta = useStore((s) => s.meta)
  const decoded = decodeURIComponent(key || '')
  const [year, season] = decoded.split('|')

  const items = useMemo(
    () => sortByScore(list.filter((a) => a.year === year && a.season === season), meta),
    [list, meta, year, season]
  )

  return (
    <div className="pt-24 pb-20">
      <h1 className="px-8 text-2xl font-bold mb-6">
        {year} 年 {season}季
        <span className="text-sm text-zinc-400 ml-3">{items.length} 部 · 依評分排序</span>
      </h1>
      <Grid items={items} />
    </div>
  )
}
