import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ProfileProgress } from '../shared/types'
import type { Command } from './process'
import { COMPLETE_MARKER, getProfileInfo, startProfileJob } from './profile-job'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'pjob-'))

/** A fake engine: a shell script standing in for gallery-dl. Records the args it was given. */
const fakeEngine = (body: string) => {
  const calls: (readonly string[])[] = []
  return {
    calls,
    command: (args: readonly string[]): Command => {
      calls.push(args)
      return { bin: '/bin/sh', args: ['-c', body] }
    }
  }
}

describe.skipIf(process.platform === 'win32')('startProfileJob', () => {
  it('counts downloaded vs. already-downloaded files and marks a full run complete', async () => {
    const dir = tmp()
    const engine = fakeEngine('echo "# /d/a_1.jpg"; echo "# /d/b_1.jpg"; echo "/d/c_1.jpg"; echo "[instagram][info] note" >&2')
    const events: ProfileProgress[] = []
    const job = startProfileJob(
      { username: 'nasa', downloadDir: dir, browser: 'brave', quick: false },
      { command: engine.command, emit: (p) => events.push(p) }
    )
    const final = await job.done

    expect(final).toMatchObject({ status: 'done', downloaded: 1, skipped: 2, lastFile: '/d/c_1.jpg', folder: join(dir, 'nasa') })
    expect(events[0]).toMatchObject({ status: 'running', downloaded: 0, skipped: 0 })
    expect(existsSync(join(dir, 'nasa', COMPLETE_MARKER))).toBe(true)
    expect(engine.calls[0]).toContain('skip=true')
    expect(engine.calls[0].at(-1)).toBe('https://www.instagram.com/nasa/posts/')
  })

  it('uses quick mode args and does not mark incomplete runs', async () => {
    const dir = tmp()
    const engine = fakeEngine('echo "[instagram][error] HttpError: 429 Too Many Requests" >&2; exit 4')
    const job = startProfileJob(
      { username: 'nasa', downloadDir: dir, browser: 'chrome', quick: true },
      { command: engine.command, emit: () => {} }
    )
    const final = await job.done
    expect(final.status).toBe('error')
    expect(final.error).toMatch(/too many requests/i)
    expect(engine.calls[0]).toContain('skip=abort:30')
    expect(existsSync(join(dir, 'nasa', COMPLETE_MARKER))).toBe(false)
  })

  it('can be stopped, keeping files and reporting "stopped"', async () => {
    const engine = fakeEngine('echo "/d/x_1.jpg"; sleep 30')
    const events: ProfileProgress[] = []
    const job = startProfileJob(
      { username: 'nasa', downloadDir: tmp(), browser: 'brave', quick: false },
      { command: engine.command, emit: (p) => events.push(p) }
    )
    await new Promise((r) => setTimeout(r, 300))
    job.stop()
    const final = await job.done
    expect(final.status).toBe('stopped')
    expect(final.downloaded).toBe(1)
  })

  it('escalates to a hard kill when the engine ignores Stop', async () => {
    const engine = fakeEngine("trap '' TERM; echo \"/d/x_1.jpg\"; sleep 30")
    const job = startProfileJob(
      { username: 'nasa', downloadDir: tmp(), browser: 'brave', quick: false },
      { command: engine.command, emit: () => {}, killGraceMs: 300 }
    )
    await new Promise((r) => setTimeout(r, 300))
    job.stop()
    expect((await job.done).status).toBe('stopped')
  })

  it('does not mark a profile complete when nothing was found', async () => {
    const dir = tmp()
    const job = startProfileJob(
      { username: 'nasa', downloadDir: dir, browser: 'brave', quick: false },
      { command: fakeEngine('exit 0').command, emit: () => {} }
    )
    expect(await job.done).toMatchObject({ status: 'done', downloaded: 0, skipped: 0 })
    expect(existsSync(join(dir, 'nasa', COMPLETE_MARKER))).toBe(false)
  })

  it('still finishes if the completion marker cannot be written', async () => {
    const dir = tmp()
    const folder = join(dir, 'nasa')
    // The engine deletes its own folder, so writing the marker fails.
    const engine = fakeEngine(`echo "/d/x_1.jpg"; rm -rf '${folder}'`)
    const job = startProfileJob(
      { username: 'nasa', downloadDir: dir, browser: 'brave', quick: false },
      { command: engine.command, emit: () => {} }
    )
    expect(await job.done).toMatchObject({ status: 'done', downloaded: 1 })
  })

  it('reports engine startup failures as errors', async () => {
    const job = startProfileJob(
      { username: 'nasa', downloadDir: tmp(), browser: 'brave', quick: false },
      { command: () => { throw new Error('The profile engine is not installed yet.') }, emit: () => {} }
    )
    expect(await job.done).toMatchObject({ status: 'error', error: expect.stringMatching(/not installed/) })
  })
})

describe('getProfileInfo', () => {
  it('reports an empty, incomplete profile when nothing was downloaded yet', () => {
    const dir = tmp()
    expect(getProfileInfo('nasa', dir)).toEqual({ username: 'nasa', folder: join(dir, 'nasa'), fileCount: 0, complete: false })
  })

  it('counts media files (not the marker or partial downloads) and reads the marker', () => {
    const dir = tmp()
    const folder = join(dir, 'nasa')
    mkdirSync(folder)
    for (const f of ['a_1.jpg', 'b_1.mp4', 'c_1.jpg.part', COMPLETE_MARKER]) writeFileSync(join(folder, f), '')
    expect(getProfileInfo('nasa', dir)).toMatchObject({ fileCount: 2, complete: true })
  })
})
