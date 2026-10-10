import type { BrowserName, Result } from '../shared/types'

/** Deterministic name: the same post always maps to the same file, which is how re-runs detect existing files. */
export const PROFILE_FILENAME = '{date:%Y-%m-%d}_{post_shortcode}_{num}.{extension}'
/** In quick mode, stop after this many already-downloaded files in a row (we've reached older posts). */
export const QUICK_SKIP_LIMIT = 30

const USERNAME_RE = /^[a-z0-9._]{1,30}$/
const PROFILE_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com'])
const RESERVED_PATHS = new Set(['p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct'])
const INVALID = 'Please enter an Instagram username (e.g. @nasa) or a profile link.'

function fail(): Result<string> {
  return { ok: false, data: null, error: INVALID }
}

/** Accepts "nasa", "@nasa" or a profile URL; returns the lower-cased username. */
export function parseUsername(raw: string): Result<string> {
  const trimmed = raw.trim()
  let candidate = trimmed.replace(/^@/, '')

  if (/instagram\.com/i.test(trimmed)) {
    try {
      const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
      if (!PROFILE_HOSTS.has(url.hostname)) return fail()
      const first = url.pathname.split('/').filter(Boolean)[0] ?? ''
      if (RESERVED_PATHS.has(first)) return fail()
      candidate = first
    } catch {
      return fail()
    }
  }

  const username = candidate.toLowerCase()
  // Also rules out "..", leading dashes (option injection) and path separators.
  if (!USERNAME_RE.test(username) || /^\.+$/.test(username)) return fail()
  return { ok: true, data: username, error: null }
}

export interface ProfileArgsInput {
  readonly username: string
  readonly outDir: string
  readonly browser: Exclude<BrowserName, 'none'>
  readonly quick: boolean
}

export function buildProfileArgs(input: ProfileArgsInput): readonly string[] {
  return [
    '--config-ignore',
    '--cookies-from-browser', input.browser,
    '-D', input.outDir,
    '-f', PROFILE_FILENAME,
    '-o', `skip=${input.quick ? `abort:${QUICK_SKIP_LIMIT}` : 'true'}`,
    // Use Instagram's single-file videos; DASH merging would need yt-dlp + ffmpeg inside gallery-dl.
    '-o', 'videos=merged',
    // Be gentle: pause between API requests to avoid rate limits and account flags.
    '-o', 'sleep-request=3.0-6.0',
    '--', `https://www.instagram.com/${input.username}/posts/`
  ]
}

export type OutputEvent =
  | { readonly kind: 'downloaded'; readonly path: string }
  | { readonly kind: 'skipped'; readonly path: string }

/** gallery-dl prints one line per file: "# path" when the file already exists, otherwise the path. */
export function parseOutputLine(line: string): OutputEvent | null {
  const text = line.trim()
  if (!text || text.startsWith('[')) return null
  if (text.startsWith('# ')) return { kind: 'skipped', path: text.slice(2) }
  return { kind: 'downloaded', path: text.replace(/^[✔*] /, '') }
}

export type EngineFlavor = { readonly kind: 'binary'; readonly asset: string } | { readonly kind: 'python' }

export function engineFlavor(platform: NodeJS.Platform, arch: string): EngineFlavor {
  if (platform === 'win32') return { kind: 'binary', asset: 'gallery-dl_windows.exe' }
  if (platform === 'linux') return { kind: 'binary', asset: 'gallery-dl_linux' }
  // The official macOS build is Apple Silicon only; Intel Macs run gallery-dl from PyPI with system Python.
  if (platform === 'darwin' && arch === 'arm64') return { kind: 'binary', asset: 'gallery-dl_macos' }
  return { kind: 'python' }
}

const ERROR_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/429|too many requests|rate.?limit|please wait a few minutes/i,
    'Instagram says there have been too many requests. Wait 15–30 minutes, then press Start again; finished files are kept.'],
  [/private account|not following/i,
    'This account is private. You can only download it if your logged-in account follows it.'],
  [/not found|could not be found|does not exist/i,
    'That Instagram account was not found. Check the username.'],
  [/auth|login|log in|cookies/i,
    'Instagram needs you to be logged in. Log in to instagram.com in the browser chosen in Settings, then try again.'],
  [/resolve host|network|timed out|connection/i,
    'Could not reach Instagram. Check your internet connection and try again.']
]

export function friendlyProfileError(stderr: string): string {
  const match = ERROR_MAP.find(([re]) => re.test(stderr))
  if (match) return match[1]
  const lastError = stderr.split('\n').reverse().find((l) => /\[error\]/i.test(l))
  const detail = (lastError ?? stderr).replace(/^\[[^\]]+\]\[error\]\s*/i, '').trim()
  return detail ? `Profile download stopped: ${detail.slice(0, 200)}` : 'Profile download stopped for an unknown reason.'
}
