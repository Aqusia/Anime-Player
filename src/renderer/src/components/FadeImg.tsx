import type { ImgHTMLAttributes } from 'react'

/**
 * <img> that fades in once the file is decoded, so covers don't pop into the
 * grid. Cached images (already complete at mount) show immediately.
 */
export default function FadeImg({ className = '', ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      {...rest}
      decoding="async"
      className={`img-fade ${className}`}
      onLoad={(e) => e.currentTarget.classList.add('loaded')}
      ref={(el) => {
        if (el && el.complete && el.naturalWidth > 0) el.classList.add('loaded')
      }}
    />
  )
}
