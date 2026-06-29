import { useEffect, useMemo } from 'react'
import { useStore } from '../store'
import Grid from '../components/Grid'
import type { Anime, MyAnime } from '../api'

export default function MyList() {
  const { byId, myList, myById, loadMyCatalog } = useStore()

  // Load the myself catalog only when the list actually has myself entries.
  const hasMyself = myList.some((id) => id.startsWith('my:'))
  useEffect(() => {
    if (hasMyself) loadMyCatalog()
  }, [hasMyself, loadMyCatalog])

  // Preserve the saved order (newest-added first); each id resolves to an
  // anime1 Anime or a myself MyAnime. Drop entries we can't resolve yet.
  const items = useMemo(
    () =>
      myList
        .map((id): Anime | MyAnime | undefined =>
          id.startsWith('my:') ? myById[id.slice(3)] : byId[id]
        )
        .filter((x): x is Anime | MyAnime => !!x),
    [myList, byId, myById]
  )

  return (
    <div className="pt-24 pb-20">
      <h1 className="px-8 text-2xl font-bold mb-6">
        我的片單 {items.length > 0 && <span className="text-sm font-normal text-zinc-500">{items.length}</span>}
      </h1>
      {items.length ? (
        <Grid items={items} />
      ) : (
        <p className="px-8 text-zinc-400">尚未加入任何動畫。在動畫詳細頁點「＋ 我的片單」即可加入（anime1 與 Myself 都可以）。</p>
      )}
    </div>
  )
}
