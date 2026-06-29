import { useEffect, useRef, useState } from 'react'

export interface Option {
  value: string
  label: string
}

/**
 * Compact dropdown: a single button that opens a themed popover with an optional
 * type-to-filter input and a scrollable option list. Takes far less space than a
 * row of buttons. Closes on select or outside-click.
 */
export default function Dropdown({
  value,
  options,
  onChange,
  searchable = true,
  className = ''
}: {
  value: string
  options: Option[]
  onChange: (v: string) => void
  searchable?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    if (searchable) inputRef.current?.focus()
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, searchable])

  const current = options.find((o) => o.value === value)
  const shown = q.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))
    : options

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-white/10 hover:bg-white/15 rounded-lg px-3 py-1.5 text-sm ring-1 ring-white/10 min-w-[8rem]"
      >
        <span className="truncate">{current?.label ?? '選擇'}</span>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`ml-auto shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-48 max-w-[70vw] rounded-lg bg-zinc-900 border border-white/10 shadow-2xl overflow-hidden">
          {searchable && (
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="輸入篩選…"
              className="w-full bg-zinc-800 px-3 py-2 text-sm outline-none border-b border-white/10 placeholder:text-zinc-500"
            />
          )}
          <div className="max-h-64 overflow-y-auto py-1">
            {shown.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-500">無符合</div>
            ) : (
              shown.map((o) => (
                <button
                  key={o.value}
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                    setQ('')
                  }}
                  className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 ${
                    o.value === value ? 'text-brand font-semibold' : 'text-zinc-200'
                  }`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
