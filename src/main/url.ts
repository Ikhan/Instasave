import type { Result } from '../shared/types'

export interface ParsedInstagramUrl {
  readonly shortcode: string
  readonly url: string
}

const ALLOWED_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com'])
const SHORTCODE_RE = /^[A-Za-z0-9_-]{5,64}$/
const POST_TYPES: Readonly<Record<string, string>> = { p: 'p', reel: 'reel', reels: 'reel', tv: 'tv' }

const INVALID = 'Please paste a valid Instagram post, reel or video link (e.g. https://www.instagram.com/p/ABC123/).'

function fail(error: string): Result<ParsedInstagramUrl> {
  return { ok: false, data: null, error }
}

/** Validates an Instagram post/reel/tv link and normalizes it to a canonical URL. */
export function parseInstagramUrl(raw: string): Result<ParsedInstagramUrl> {
  const trimmed = raw.trim()
  if (!trimmed) return fail(INVALID)

  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return fail(INVALID)
  }

  if (!['https:', 'http:'].includes(parsed.protocol) || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return fail(INVALID)
  }

  const segments = parsed.pathname.split('/').filter(Boolean)
  // Supports /p/CODE and /username/p/CODE
  const typeIndex = segments.findIndex((s) => s in POST_TYPES)
  const type = typeIndex >= 0 ? POST_TYPES[segments[typeIndex]] : undefined
  const shortcode = typeIndex >= 0 ? segments[typeIndex + 1] : undefined

  if (!type || !shortcode || !SHORTCODE_RE.test(shortcode)) return fail(INVALID)

  return {
    ok: true,
    data: { shortcode, url: `https://www.instagram.com/${type}/${shortcode}/` },
    error: null
  }
}
