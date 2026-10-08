import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'

/** Apps launched from Finder don't inherit the shell PATH, so also check common install locations. */
const EXTRA_DIRS: Readonly<Partial<Record<NodeJS.Platform, readonly string[]>>> = {
  darwin: ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin'],
  linux: ['/usr/bin', '/usr/local/bin'],
  win32: ['C:\\ffmpeg\\bin']
}

export function defaultSearchDirs(platform: NodeJS.Platform, pathEnv = process.env.PATH ?? ''): readonly string[] {
  return [...pathEnv.split(delimiter).filter(Boolean), ...(EXTRA_DIRS[platform] ?? [])]
}

/** Returns the path to an executable ffmpeg, or null if none is installed. */
export function findFfmpeg(dirs: readonly string[], platform: NodeJS.Platform): string | null {
  const name = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  for (const dir of dirs) {
    const candidate = join(dir, name)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // Not here; keep looking.
    }
  }
  return null
}
