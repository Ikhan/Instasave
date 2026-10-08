import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'

const FALLBACK_NAME = 'instagram'
const MAX_SEGMENT_LENGTH = 60

/** Makes a value safe to use as part of a file name (no separators, traversal or reserved chars). */
export function sanitizeSegment(value: string | null): string {
  const cleaned = (value ?? '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/\.{2,}/g, '')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, MAX_SEGMENT_LENGTH)
  return cleaned || FALLBACK_NAME
}

export function buildFileName(username: string | null, shortcode: string, index: number, ext: string): string {
  const safeExt = /^[a-z0-9]{2,4}$/i.test(ext) ? ext.toLowerCase() : 'bin'
  return `${sanitizeSegment(username)}_${sanitizeSegment(shortcode)}_${index}.${safeExt}`
}

/** Returns a path in `dir` that does not exist yet, adding " (n)" before the extension if needed. */
export function uniquePath(dir: string, fileName: string): string {
  const ext = extname(fileName)
  const base = fileName.slice(0, fileName.length - ext.length)
  let candidate = join(dir, fileName)
  for (let n = 1; existsSync(candidate); n++) {
    candidate = join(dir, `${base} (${n})${ext}`)
  }
  return candidate
}
