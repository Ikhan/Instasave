import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCapped, sha256File } from './download'
import { GITHUB_API_POLICY, GITHUB_DOWNLOAD_POLICY } from './github'

describe('readCapped', () => {
  it('reads a body under the limit', async () => {
    expect((await readCapped(new Response('hello'), 10)).toString()).toBe('hello')
  })
  it('aborts a body over the limit', async () => {
    await expect(readCapped(new Response('x'.repeat(100)), 10)).rejects.toThrow(/too large/i)
  })
  it('handles an empty body', async () => {
    expect((await readCapped(new Response(null), 10)).length).toBe(0)
  })
})

describe('sha256File', () => {
  it('hashes file contents', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'sha-')), 'f')
    writeFileSync(path, 'abc')
    expect(await sha256File(path)).toBe(createHash('sha256').update('abc').digest('hex'))
  })
})

describe('GitHub policies', () => {
  it('allow only HTTPS GitHub release hosts for downloads', () => {
    expect(GITHUB_DOWNLOAD_POLICY.isAllowed('https://github.com/x/y/releases/download/v1/a')).toBe(true)
    expect(GITHUB_DOWNLOAD_POLICY.isAllowed('https://release-assets.githubusercontent.com/a')).toBe(true)
    expect(GITHUB_DOWNLOAD_POLICY.isAllowed('http://github.com/a')).toBe(false)
    expect(GITHUB_DOWNLOAD_POLICY.isAllowed('https://evil.com/a')).toBe(false)
    expect(GITHUB_DOWNLOAD_POLICY.isAllowed('https://api.github.com/a')).toBe(false)
  })
  it('allow only the GitHub API for metadata', () => {
    expect(GITHUB_API_POLICY.isAllowed('https://api.github.com/repos/a/b/releases/latest')).toBe(true)
    expect(GITHUB_API_POLICY.isAllowed('https://github.com/a')).toBe(false)
  })
})
