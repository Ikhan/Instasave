import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { BrowserName, ProfileInfo, ProfileProgress } from '../shared/types'
import { buildProfileArgs, friendlyProfileError, parseOutputLine } from './gallery-args'
import type { Command } from './process'

/** Written into a profile folder after a full scan finishes, enabling "only new posts" mode next time. */
export const COMPLETE_MARKER = '.instasave-complete'
const MAX_STDERR_CHARS = 20_000
const MEDIA_FILE = /\.(jpe?g|png|webp|heic|mp4|mov|m4v)$/i

export interface ProfileJobOptions {
  readonly username: string
  readonly downloadDir: string
  readonly browser: Exclude<BrowserName, 'none'>
  readonly quick: boolean
}

export interface ProfileJobDeps {
  readonly command: (args: readonly string[]) => Command
  readonly emit: (p: ProfileProgress) => void
  /** How long to wait after Stop before force-killing an engine that ignores it. */
  readonly killGraceMs?: number
}

const DEFAULT_KILL_GRACE_MS = 5_000

export interface ProfileJob {
  /** Asks the engine to stop; `force` kills it immediately (used when the app quits). */
  stop(force?: boolean): void
  readonly done: Promise<ProfileProgress>
}

function killTree(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }).on('error', () => {})
    } else {
      process.kill(-pid, signal)
    }
  } catch {
    // Already exited.
  }
}

function writeCompleteMarker(folder: string): void {
  try {
    writeFileSync(join(folder, COMPLETE_MARKER), new Date().toISOString())
  } catch {
    // Not fatal: the next run simply does a full scan again.
  }
}

export function getProfileInfo(username: string, downloadDir: string): ProfileInfo {
  const folder = join(downloadDir, username)
  if (!existsSync(folder)) return { username, folder, fileCount: 0, complete: false }
  const files = readdirSync(folder)
  return {
    username,
    folder,
    fileCount: files.filter((f) => MEDIA_FILE.test(f)).length,
    complete: files.includes(COMPLETE_MARKER)
  }
}

/** Runs gallery-dl for one profile, streaming per-file progress. Files already on disk are skipped by gallery-dl. */
export function startProfileJob(opts: ProfileJobOptions, deps: ProfileJobDeps): ProfileJob {
  const folder = join(opts.downloadDir, opts.username)
  let state: ProfileProgress = {
    username: opts.username, status: 'running', downloaded: 0, skipped: 0, lastFile: null, folder
  }
  const update = (patch: Partial<ProfileProgress>): ProfileProgress => {
    state = { ...state, ...patch }
    deps.emit(state)
    return state
  }

  let stopRequested = false
  let kill: (signal: NodeJS.Signals) => void = () => {}
  let escalation: NodeJS.Timeout | undefined

  const done = new Promise<ProfileProgress>((settle) => {
    let settled = false
    // 'error' and 'close' can both fire; settle exactly once.
    const resolve = (p: ProfileProgress): void => {
      if (settled) return
      settled = true
      clearTimeout(escalation)
      settle(p)
    }
    update({})
    let cmd: Command
    try {
      cmd = deps.command(buildProfileArgs({ username: opts.username, outDir: folder, browser: opts.browser, quick: opts.quick }))
      mkdirSync(folder, { recursive: true })
    } catch (e: unknown) {
      resolve(update({ status: 'error', error: e instanceof Error ? e.message : 'Could not start the download.' }))
      return
    }

    // Own process group (POSIX), so Stop also ends any helper processes the engine started.
    const detached = process.platform !== 'win32'
    const child = spawn(cmd.bin, cmd.args, { windowsHide: true, detached, env: { ...process.env, ...cmd.env } })
    kill = (signal) => killTree(child.pid, signal)
    let stderr = ''

    createInterface({ input: child.stdout }).on('line', (line) => {
      const event = parseOutputLine(line)
      if (event?.kind === 'downloaded') update({ downloaded: state.downloaded + 1, lastFile: event.path })
      else if (event?.kind === 'skipped') update({ skipped: state.skipped + 1 })
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-MAX_STDERR_CHARS)
    })

    child.on('error', (e) => resolve(update({ status: 'error', error: `Could not start the profile engine: ${e.message}` })))
    child.on('close', (code) => {
      if (stopRequested) return resolve(update({ status: 'stopped' }))
      if (code !== 0) return resolve(update({ status: 'error', error: friendlyProfileError(stderr) }))
      // A full scan that finished and found posts means everything is on disk; later runs can stop early.
      if (!opts.quick && state.downloaded + state.skipped > 0) writeCompleteMarker(folder)
      resolve(update({ status: 'done' }))
    })
  })

  return {
    stop: (force = false) => {
      stopRequested = true
      if (force) return kill('SIGKILL')
      kill('SIGTERM')
      clearTimeout(escalation)
      escalation = setTimeout(() => kill('SIGKILL'), deps.killGraceMs ?? DEFAULT_KILL_GRACE_MS)
      escalation.unref()
    },
    done
  }
}
