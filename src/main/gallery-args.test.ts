import { describe, expect, it } from 'vitest'
import {
  buildProfileArgs,
  engineFlavor,
  friendlyProfileError,
  parseOutputLine,
  parseUsername,
  PROFILE_FILENAME
} from './gallery-args'

describe('parseUsername', () => {
  it.each([
    ['nasa', 'nasa'],
    ['@NASA', 'nasa'],
    ['  @nat.geo_1 ', 'nat.geo_1'],
    ['https://www.instagram.com/nasa/', 'nasa'],
    ['instagram.com/nasa?igsh=abc', 'nasa'],
    ['https://www.instagram.com/nasa/reels/', 'nasa']
  ])('accepts %s', (input, expected) => {
    expect(parseUsername(input)).toEqual({ ok: true, data: expected, error: null })
  })

  it.each([
    [''],
    ['@'],
    ['has space'],
    ['../etc'],
    ['a'.repeat(31)],
    ['https://www.instagram.com/p/ABC123/'],
    ['https://evil.com/nasa'],
    ['--exec=rm']
  ])('rejects %s', (input) => {
    const result = parseUsername(input)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/username/i)
  })
})

describe('buildProfileArgs', () => {
  const base = { username: 'nasa', outDir: '/Users/me/Downloads/InstaSave/nasa', browser: 'brave' as const }

  it('builds a full-scan download of the posts tab', () => {
    const args = buildProfileArgs({ ...base, quick: false })
    expect(args).toContain('--config-ignore')
    expect(args[args.indexOf('--cookies-from-browser') + 1]).toBe('brave')
    expect(args[args.indexOf('-D') + 1]).toBe(base.outDir)
    expect(args[args.indexOf('-f') + 1]).toBe(PROFILE_FILENAME)
    expect(args).toContain('skip=true')
    expect(args).toContain('videos=merged')
    expect(args.at(-1)).toBe('https://www.instagram.com/nasa/posts/')
    expect(args.at(-2)).toBe('--')
  })

  it('stops after a run of already-downloaded files in quick mode', () => {
    expect(buildProfileArgs({ ...base, quick: true })).toContain('skip=abort:30')
  })

  it('uses a deterministic filename so existing files can be detected', () => {
    expect(PROFILE_FILENAME).toBe('{date:%Y-%m-%d}_{post_shortcode}_{num}.{extension}')
  })
})

describe('parseOutputLine', () => {
  it('detects skipped (already downloaded) files', () => {
    expect(parseOutputLine('# /d/nasa/2026-01-01_ABC_1.jpg')).toEqual({ kind: 'skipped', path: '/d/nasa/2026-01-01_ABC_1.jpg' })
  })
  it('detects downloaded files, with or without a success mark', () => {
    expect(parseOutputLine('/d/nasa/x.jpg')).toEqual({ kind: 'downloaded', path: '/d/nasa/x.jpg' })
    expect(parseOutputLine('✔ /d/nasa/x.jpg')).toEqual({ kind: 'downloaded', path: '/d/nasa/x.jpg' })
  })
  it('ignores blank and log lines', () => {
    expect(parseOutputLine('')).toBeNull()
    expect(parseOutputLine('[instagram][info] something')).toBeNull()
  })
})

describe('engineFlavor', () => {
  it('uses the standalone binary where one exists', () => {
    expect(engineFlavor('darwin', 'arm64')).toEqual({ kind: 'binary', asset: 'gallery-dl_macos' })
    expect(engineFlavor('win32', 'x64')).toEqual({ kind: 'binary', asset: 'gallery-dl_windows.exe' })
    expect(engineFlavor('linux', 'x64')).toEqual({ kind: 'binary', asset: 'gallery-dl_linux' })
  })
  it('falls back to Python on Intel Macs (no x64 macOS build exists)', () => {
    expect(engineFlavor('darwin', 'x64')).toEqual({ kind: 'python' })
  })
})

describe('friendlyProfileError', () => {
  it.each([
    ['[instagram][error] HttpError: \'429 Too Many Requests\'', /too many requests/i],
    ['[instagram][error] AuthRequired: \'authenticated cookies\' needed', /log in/i],
    ['[instagram][error] Redirect to login page', /log in/i],
    ['[instagram][error] NotFoundError: Requested user could not be found', /not found/i],
    ['[instagram][error] AuthorizationError: This is a private account', /private/i],
    ['[instagram][error] something odd', /something odd/]
  ])('maps %s', (stderr, expected) => {
    expect(friendlyProfileError(stderr)).toMatch(expected)
  })
})
