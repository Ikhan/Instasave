import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024

/** A program plus arguments (and optional extra environment) ready to spawn. */
export interface Command {
  readonly bin: string
  readonly args: readonly string[]
  readonly env?: Readonly<Record<string, string>>
}

export interface RunResult {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

export function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Runs a command to completion, collecting output (capped) and killing it after `timeoutMs`. */
export function run(cmd: Command, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd.bin, cmd.args, { windowsHide: true, env: { ...process.env, ...cmd.env } })
    const out: Buffer[] = []
    const err: Buffer[] = []
    let size = 0
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_OUTPUT_BYTES) child.kill('SIGKILL')
      else target.push(chunk)
    }
    child.stdout.on('data', collect(out))
    child.stderr.on('data', collect(err))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') })
    })
  })
}
