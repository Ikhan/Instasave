import type { MediaItem, PostInfo } from '../shared/types'

/** Shapes of the subset of yt-dlp's JSON output we rely on. All fields are untrusted. */
interface RawFormat {
  readonly format_id?: unknown
  readonly url?: unknown
  readonly width?: unknown
  readonly height?: unknown
}

interface RawThumbnail {
  readonly url?: unknown
  readonly width?: unknown
  readonly height?: unknown
}

interface Picked {
  readonly url: string
  readonly width: number | null
  readonly height: number | null
}

type Dict = Readonly<Record<string, unknown>>

const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v)
const asString = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)
const asNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const isHttpUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//.test(v)

/** Chooses the highest-resolution progressive (single-file, has audio) video format. */
export function pickBestVideoUrl(formats: readonly RawFormat[] | undefined): Picked | null {
  const progressive = (formats ?? [])
    .filter((f) => isHttpUrl(f.url) && !String(f.format_id ?? '').startsWith('dash'))
    .map((f) => ({ url: f.url as string, width: asNumber(f.width), height: asNumber(f.height) }))
  if (progressive.length === 0) return null
  return progressive.reduce((best, f) => ((f.height ?? 0) > (best.height ?? 0) ? f : best))
}

/** True when a DASH stream is taller than the best progressive file (or no progressive file exists). */
export function hasHigherQualityStreams(formats: readonly RawFormat[] | undefined): boolean {
  const dashHeights = (formats ?? [])
    .filter((f) => isHttpUrl(f.url) && String(f.format_id ?? '').startsWith('dash'))
    .map((f) => asNumber(f.height) ?? 0)
  if (dashHeights.length === 0) return false
  const progressive = pickBestVideoUrl(formats)
  return progressive === null || Math.max(...dashHeights) > (progressive.height ?? 0)
}

/** Chooses the largest thumbnail, which for image posts is the full-size photo. */
export function pickBestThumbnail(thumbnails: readonly RawThumbnail[] | undefined): Picked | null {
  const valid = (thumbnails ?? [])
    .filter((t) => isHttpUrl(t.url))
    .map((t) => ({ url: t.url as string, width: asNumber(t.width), height: asNumber(t.height) }))
  if (valid.length === 0) return null
  // yt-dlp orders thumbnails smallest → largest; prefer explicit width, fall back to order.
  return valid.reduce((best, t) => ((t.width ?? 0) >= (best.width ?? 0) ? t : best))
}

function extFromUrl(url: string, fallback: string): string {
  const match = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(new URL(url).pathname)
  return match ? match[1].toLowerCase() : fallback
}

function toMediaItem(entry: Dict, index: number, shortcode: string): MediaItem | null {
  const formats = Array.isArray(entry.formats) ? (entry.formats as RawFormat[]) : []
  const thumbnails = Array.isArray(entry.thumbnails) ? (entry.thumbnails as RawThumbnail[]) : []
  const thumb = pickBestThumbnail(thumbnails)
  const id = `${shortcode}-${index}`

  if (formats.length > 0) {
    const video = pickBestVideoUrl(formats)
    return {
      id, index, kind: 'video',
      url: video?.url ?? null,
      previewUrl: thumb?.url ?? null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      ext: 'mp4',
      hdAvailable: hasHigherQualityStreams(formats)
    }
  }

  if (!thumb) return null
  return {
    id, index, kind: 'image',
    url: thumb.url,
    previewUrl: thumb.url,
    width: thumb.width,
    height: thumb.height,
    ext: extFromUrl(thumb.url, 'jpg'),
    hdAvailable: false
  }
}

/** Converts `yt-dlp -J` output (single post or carousel playlist) into a PostInfo. */
export function parseYtDlpJson(json: unknown, sourceUrl: string, shortcode: string): PostInfo {
  if (!isDict(json)) throw new Error('Unexpected response from downloader.')

  const rawEntries = json._type === 'playlist' && Array.isArray(json.entries) ? json.entries : [json]
  const items = rawEntries
    .filter(isDict)
    .map((entry, i) => toMediaItem(entry, i + 1, shortcode))
    .filter((item): item is MediaItem => item !== null)
    .map((item, i) => ({ ...item, index: i + 1, id: `${shortcode}-${i + 1}` }))

  return {
    sourceUrl,
    shortcode,
    username: asString(json.channel) ?? asString(json.uploader_id),
    caption: asString(json.description),
    items
  }
}
