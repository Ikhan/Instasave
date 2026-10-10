import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGalleryDl, findReleaseAsset, GALLERY_DL_VERSION } from './gallerydl'
import { run } from './process'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'gdl-'))

function script(path: string, body: string): string {
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

const HASH = 'a'.repeat(64)

describe('findReleaseAsset', () => {
  const release = {
    assets: [
      { name: 'gallery-dl_macos', digest: `sha256:${HASH}`, browser_download_url: 'https://github.com/gdl-org/builds/x' },
      { name: 'no-digest', browser_download_url: 'https://github.com/x' },
      { name: 'evil', digest: `sha256:${HASH}`, browser_download_url: 'https://evil.com/x' }
    ]
  }
  it('returns url and digest for a matching asset', () => {
    expect(findReleaseAsset(release, 'gallery-dl_macos')).toEqual({ url: 'https://github.com/gdl-org/builds/x', sha256: HASH })
  })
  it('rejects assets without a digest, off-GitHub URLs and missing assets', () => {
    expect(findReleaseAsset(release, 'no-digest')).toBeNull()
    expect(findReleaseAsset(release, 'evil')).toBeNull()
    expect(findReleaseAsset(release, 'nope')).toBeNull()
    expect(findReleaseAsset(null, 'x')).toBeNull()
  })
})

describe.skipIf(process.platform === 'win32')('createGalleryDl', () => {
  it('binary mode: not installed until the binary exists, then reports its version', async () => {
    const dataDir = tmp()
    const gdl = createGalleryDl({ dataDir, platform: 'darwin', arch: 'arm64' })
    expect(await gdl.status()).toEqual({ installed: false, version: null, mode: 'binary', problem: null })
    expect(() => gdl.command(['x'])).toThrow(/not installed/)

    mkdirSync(join(dataDir, 'bin'))
    script(join(dataDir, 'bin', 'gallery-dl'), 'echo 1.32.15')
    expect(await gdl.status()).toEqual({ installed: true, version: '1.32.15', mode: 'binary', problem: null })
    expect(gdl.command(['-v'])).toEqual({ bin: join(dataDir, 'bin', 'gallery-dl'), args: ['-v'] })
  })

  it('python mode: explains when no suitable Python is available', async () => {
    const dir = tmp()
    const oldPython = script(join(dir, 'python3'), 'echo 3.6')
    const gdl = createGalleryDl({ dataDir: tmp(), platform: 'darwin', arch: 'x64', pythonCandidates: ['/missing/python3', oldPython] })
    const status = await gdl.status()
    expect(status).toMatchObject({ installed: false, mode: 'python' })
    expect(status.problem).toMatch(/python/i)
  })

  it('python mode: runs gallery-dl from the private library with the library path in the environment', async () => {
    const dataDir = tmp()
    const dir = tmp()
    // Fake python: answers the version probe, otherwise prints the lib env var and its args.
    const py = script(join(dir, 'python3'),
      'case "$*" in *version_info*) echo 3.9;; *) echo "lib=$INSTASAVE_GDL_LIB last=$(eval echo \\${$#})";; esac')
    mkdirSync(join(dataDir, 'gallery-dl-lib', 'gallery_dl'), { recursive: true })

    const gdl = createGalleryDl({ dataDir, platform: 'darwin', arch: 'x64', pythonCandidates: [py] })
    const status = await gdl.status()
    expect(status).toMatchObject({ installed: true, mode: 'python', problem: null })

    const cmd = gdl.command(['--', 'https://www.instagram.com/nasa/posts/'])
    expect(cmd.bin).toBe(py)
    expect(cmd.args.slice(0, 2)).toEqual(['-I', '-c'])
    expect(cmd.env).toEqual({ INSTASAVE_GDL_LIB: join(dataDir, 'gallery-dl-lib') })
    const res = await run(cmd, 10_000)
    expect(res.stdout.trim()).toBe(`lib=${join(dataDir, 'gallery-dl-lib')} last=https://www.instagram.com/nasa/posts/`)
  })

  it('python mode: installs an exact pinned gallery-dl version, and only once when called concurrently', async () => {
    const dataDir = tmp()
    const dir = tmp()
    const log = join(dir, 'pip.log')
    // Fake python: version probe, a slow "pip install" that records its args and creates the package, version.
    const py = script(join(dir, 'python3'), [
      'case "$*" in',
      '  *version_info*) echo 3.9;;',
      `  *"-m pip"*) echo "$*" >> '${log}'; sleep 1; for a in "$@"; do case "$prev" in --target) mkdir -p "$a/gallery_dl";; esac; prev="$a"; done;;`,
      '  *) echo 9.9.9;;',
      'esac'
    ].join('\n'))
    const gdl = createGalleryDl({ dataDir, platform: 'darwin', arch: 'x64', pythonCandidates: [py] })
    const [a, b] = await Promise.all([gdl.install(), gdl.install()])
    expect(a).toMatchObject({ installed: true, version: '9.9.9' })
    expect(b).toEqual(a)
    const calls = readFileSync(log, 'utf8').trim().split('\n')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain(`gallery-dl==${GALLERY_DL_VERSION}`)
  })
})
