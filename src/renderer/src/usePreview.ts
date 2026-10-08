import { useEffect, useState } from 'react'

/** Loads a preview image through the main process (Instagram's CDN blocks direct loads). */
export function usePreview(url: string | null): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    window.insta.getPreview(url)
      .then((res) => { if (!cancelled && res.ok) setDataUrl(res.data) })
      .catch(() => { /* Preview is optional; the card keeps its placeholder. */ })
    return () => { cancelled = true }
  }, [url])

  return dataUrl
}
