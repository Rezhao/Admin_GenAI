'use client'
import { useState } from 'react'
export function MediaImage({ src, caption, className = '' }: { src?: string; caption: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string>()
  return src && src !== failedSrc ? (
    // Short-lived Supabase signed URLs cannot use a public optimization cache.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={caption} className={className} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} />
  ) : <div className={`image-placeholder ${className}`}><span aria-hidden="true">▧</span><p>Preview unavailable</p></div>
}
