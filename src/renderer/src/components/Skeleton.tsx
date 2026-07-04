/** Shimmering placeholders that mirror the real layout, so loading states feel
 *  like the page is arriving rather than a blank "載入中…" line. */

export function PosterSkeleton() {
  return (
    <div className="shrink-0 w-40">
      <div className="aspect-[2/3] rounded-lg skeleton" />
      <div className="mt-2 h-3 w-3/4 rounded skeleton" />
      <div className="mt-1.5 h-2.5 w-1/2 rounded skeleton" />
    </div>
  )
}

export function PosterGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-5">
      {Array.from({ length: count }, (_, i) => (
        <PosterSkeleton key={i} />
      ))}
    </div>
  )
}

export function RowSkeleton() {
  return (
    <section className="mb-8 px-8">
      <div className="h-5 w-40 rounded skeleton mb-4" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <PosterSkeleton key={i} />
        ))}
      </div>
    </section>
  )
}

/** First-load Home: hero block + two poster rows (matches Hero's 60vh). */
export function HomeSkeleton() {
  return (
    <div className="pb-20">
      <div className="h-[60vh] min-h-[400px] skeleton" />
      <div className="mt-8">
        <RowSkeleton />
        <RowSkeleton />
      </div>
    </div>
  )
}

/** Episode-card grid (Detail / MyselfDetail 劇集列表). */
export function EpisodeGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-[74px] rounded-lg skeleton" />
      ))}
    </div>
  )
}

/** Detail page before the anime list has loaded (deep link / first boot). */
export function DetailSkeleton() {
  return (
    <div className="pb-20">
      <div className="h-[52vh] min-h-[360px] skeleton" />
      <div className="px-8 mt-8">
        <div className="h-6 w-32 rounded skeleton mb-4" />
        <EpisodeGridSkeleton />
      </div>
    </div>
  )
}
