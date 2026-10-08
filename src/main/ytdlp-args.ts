import type { BrowserName } from '../shared/types'

// --ignore-config: never let a stray yt-dlp.conf on the machine inject options such as --exec.
const COMMON_ARGS = ['--ignore-config', '--no-exec', '--no-warnings', '--no-progress', '--socket-timeout', '20']

function cookieArgs(browser: BrowserName): readonly string[] {
  return browser === 'none' ? [] : ['--cookies-from-browser', browser]
}

/** Args to fetch post metadata as JSON. `--ignore-no-formats-error` keeps photo-only posts working. */
export function buildInfoArgs(url: string, browser: BrowserName): readonly string[] {
  return [...COMMON_ARGS, ...cookieArgs(browser), '-J', '--ignore-no-formats-error', '--', url]
}

/** Args to let yt-dlp download (and merge) a single carousel item, used when no direct file exists. */
export function buildDownloadArgs(
  url: string,
  browser: BrowserName,
  index: number,
  outPath: string,
  ffmpegPath: string | null = null
): readonly string[] {
  return [
    ...COMMON_ARGS, ...cookieArgs(browser),
    ...(ffmpegPath ? ['--ffmpeg-location', ffmpegPath] : []),
    '--playlist-items', String(index),
    '-f', 'bv*+ba/b',
    '--merge-output-format', 'mp4',
    // yt-dlp treats -o as a template; escape % so folder names like "100%" are taken literally.
    '-o', outPath.replace(/%/g, '%%'),
    '--', url
  ]
}

export function binaryAssetName(platform: NodeJS.Platform): string {
  if (platform === 'darwin') return 'yt-dlp_macos'
  if (platform === 'win32') return 'yt-dlp.exe'
  return 'yt-dlp_linux'
}

const ERROR_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/resolve host|network is unreachable|timed out|connection (refused|reset)/i,
    'Could not reach Instagram. Check your internet connection and try again.'],
  [/429|too many requests|rate.?limit/i,
    'Instagram is getting too many requests. Wait a few minutes, or turn on "Use browser login" in Settings.'],
  [/login|log in|registered users|empty media response|not granting access|private/i,
    'This post is private or needs you to be logged in. In Settings, pick the browser where you are logged in to Instagram.'],
  [/cookies? (database|from browser)|could not copy .*cookie|operation not permitted/i,
    'Could not read cookies from your browser. Close the browser and try again, or choose a different browser in Settings.']
]

/** Turns raw yt-dlp stderr into a message a non-technical user can act on. */
export function friendlyError(stderr: string): string {
  const match = ERROR_MAP.find(([re]) => re.test(stderr))
  if (match) return match[1]
  const lastError = stderr.split('\n').reverse().find((l) => l.includes('ERROR'))
  const detail = (lastError ?? stderr).replace(/^ERROR:\s*(\[\w+\]\s*)?/, '').trim()
  return detail ? `Download failed: ${detail.slice(0, 200)}` : 'Download failed for an unknown reason.'
}

/** Extracts the SHA-256 for `asset` from a release's SHA2-256SUMS file. */
export function parseChecksum(sums: string, asset: string): string | null {
  for (const line of sums.split('\n')) {
    const [hash, name] = line.trim().split(/\s+/)
    if (name === asset) return /^[a-f0-9]{64}$/i.test(hash ?? '') ? hash.toLowerCase() : null
  }
  return null
}
