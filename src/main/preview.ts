import { readCapped, safeFetch } from './download'

const ALLOWED_CDN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i
const MAX_PREVIEW_BYTES = 15 * 1024 * 1024
const MAX_CACHE = 60
const cache = new Map<string, string>()

export function isInstagramCdnUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && ALLOWED_CDN.test(u.hostname)
  } catch {
    return false
  }
}

/**
 * Fetches a preview image in the main process and returns it as a data URL.
 * Instagram's CDN refuses hot-linked requests from the renderer, so the renderer can't load it directly.
 */
export async function fetchPreview(url: string): Promise<string> {
  if (!isInstagramCdnUrl(url)) throw new Error('Preview URL is not an Instagram media URL.')
  const cached = cache.get(url)
  if (cached) return cached

  const res = await safeFetch(url, { isAllowed: isInstagramCdnUrl, maxBytes: MAX_PREVIEW_BYTES }, 30_000)
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.startsWith('image/')) throw new Error(`Preview unavailable (HTTP ${res.status}).`)
  const buf = await readCapped(res, MAX_PREVIEW_BYTES)

  const dataUrl = `data:${type};base64,${buf.toString('base64')}`
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string)
  cache.set(url, dataUrl)
  return dataUrl
}
