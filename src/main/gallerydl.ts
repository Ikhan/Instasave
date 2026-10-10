import { existsSync } from 'node:fs'
import { chmod, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProfileEngineStatus } from '../shared/types'
import { downloadToFile, readCapped, safeFetch, sha256File } from './download'
import { engineFlavor } from './gallery-args'
import { GITHUB_API_POLICY, GITHUB_DOWNLOAD_POLICY } from './github'
import { isExecutable, run, type Command } from './process'

/** Pinned for the PyPI install (Intel Macs); bump deliberately after checking the release. */
export const GALLERY_DL_VERSION = '1.32.15'
const RELEASE_API = 'https://api.github.com/repos/gdl-org/builds/releases/latest'
const VERSION_TIMEOUT_MS = 120_000
const PIP_TIMEOUT_MS = 10 * 60_000
const MIN_PYTHON: readonly [number, number] = [3, 8]
const LIB_ENV = 'INSTASAVE_GDL_LIB'
/** Runs gallery-dl from the private library folder; the folder comes from the environment, not the code string. */
const PYTHON_BOOT =
  `import os,sys; sys.path.insert(0, os.environ['${LIB_ENV}']); sys.argv[0]='gallery-dl'; ` +
  'from gallery_dl import main; sys.exit(main())'

export const DEFAULT_PYTHONS: readonly string[] = ['/usr/bin/python3', '/opt/homebrew/bin/python3', '/usr/local/bin/python3']

export interface GalleryDl {
  status(): Promise<ProfileEngineStatus>
  install(): Promise<ProfileEngineStatus>
  /** The command to run gallery-dl with `args`. Throws if the engine is not installed. */
  command(args: readonly string[]): Command
}

export interface GalleryDlOptions {
  readonly dataDir: string
  readonly platform: NodeJS.Platform
  readonly arch: string
  readonly pythonCandidates?: readonly string[]
}

interface ReleaseAsset {
  readonly name?: unknown
  readonly digest?: unknown
  readonly browser_download_url?: unknown
}

/** Finds the asset's download URL and SHA-256 digest in a GitHub "latest release" API response. */
export function findReleaseAsset(release: unknown, name: string): { url: string; sha256: string } | null {
  const assets = (release as { assets?: unknown } | null)?.assets
  if (!Array.isArray(assets)) return null
  const asset = (assets as ReleaseAsset[]).find((a) => a.name === name)
  const digest = typeof asset?.digest === 'string' ? /^sha256:([a-f0-9]{64})$/i.exec(asset.digest) : null
  const url = asset?.browser_download_url
  if (!digest || typeof url !== 'string' || !url.startsWith('https://github.com/')) return null
  return { url, sha256: digest[1].toLowerCase() }
}

async function pythonVersionOk(python: string): Promise<boolean> {
  if (!isExecutable(python)) return false
  try {
    const res = await run({ bin: python, args: ['-I', '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'] }, 60_000)
    const [major, minor] = res.stdout.trim().split('.').map(Number)
    return res.code === 0 && (major > MIN_PYTHON[0] || (major === MIN_PYTHON[0] && minor >= MIN_PYTHON[1]))
  } catch {
    return false
  }
}

/** Manages the gallery-dl engine used for whole-profile downloads. */
export function createGalleryDl(opts: GalleryDlOptions): GalleryDl {
  const flavor = engineFlavor(opts.platform, opts.arch)
  const binPath = join(opts.dataDir, 'bin', opts.platform === 'win32' ? 'gallery-dl.exe' : 'gallery-dl')
  const libDir = join(opts.dataDir, 'gallery-dl-lib')
  const pythons = opts.pythonCandidates ?? DEFAULT_PYTHONS
  let python: string | null = null

  const findPython = async (): Promise<string | null> => {
    if (python) return python
    for (const candidate of pythons) {
      if (await pythonVersionOk(candidate)) {
        python = candidate
        return python
      }
    }
    return null
  }

  const isInstalled = (): boolean =>
    flavor.kind === 'binary' ? isExecutable(binPath) : python !== null && existsSync(join(libDir, 'gallery_dl'))

  const command = (args: readonly string[]): Command => {
    if (!isInstalled()) throw new Error('The profile engine is not installed yet. Click "Install" on the Profile tab.')
    if (flavor.kind === 'binary') return { bin: binPath, args }
    return { bin: python as string, args: ['-I', '-c', PYTHON_BOOT, ...args], env: { [LIB_ENV]: libDir } }
  }

  const readVersion = async (): Promise<string | null> => {
    try {
      const res = await run(command(['--version']), VERSION_TIMEOUT_MS)
      return res.code === 0 ? res.stdout.trim() || null : null
    } catch {
      return null
    }
  }

  const status = async (): Promise<ProfileEngineStatus> => {
    const mode = flavor.kind
    if (mode === 'python' && !(await findPython())) {
      return {
        installed: false, version: null, mode,
        problem: 'Python 3 is needed on Intel Macs. Install it from python.org, or run "xcode-select --install" in Terminal.'
      }
    }
    if (!isInstalled()) return { installed: false, version: null, mode, problem: null }
    return { installed: true, version: await readVersion(), mode, problem: null }
  }

  const installBinary = async (asset: string): Promise<void> => {
    const res = await safeFetch(RELEASE_API, GITHUB_API_POLICY, 60_000)
    if (!res.ok) throw new Error('Could not look up the latest profile engine. Check your internet connection.')
    const found = findReleaseAsset(JSON.parse((await readCapped(res, GITHUB_API_POLICY.maxBytes)).toString('utf8')), asset)
    if (!found) throw new Error('Could not find a verified profile engine download for this computer.')

    await mkdir(join(opts.dataDir, 'bin'), { recursive: true })
    const tmpPath = `${binPath}.download`
    try {
      await downloadToFile(found.url, tmpPath, () => {}, GITHUB_DOWNLOAD_POLICY)
      if ((await sha256File(tmpPath)) !== found.sha256) {
        throw new Error('The profile engine download failed its integrity check. Please try again.')
      }
      if (opts.platform !== 'win32') await chmod(tmpPath, 0o755)
      await rename(tmpPath, binPath)
    } finally {
      await rm(tmpPath, { force: true })
    }
  }

  const installPython = async (): Promise<void> => {
    const py = await findPython()
    if (!py) throw new Error('Python 3 was not found. Install it from python.org, then try again.')
    // Install into a fresh folder, then swap, so a failed upgrade never breaks a working engine.
    const tmpDir = `${libDir}.new`
    await rm(tmpDir, { recursive: true, force: true })
    try {
      const res = await run({
        bin: py,
        args: ['-I', '-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--quiet',
          '--target', tmpDir, `gallery-dl==${GALLERY_DL_VERSION}`]
      }, PIP_TIMEOUT_MS)
      if (res.code !== 0) throw new Error('Installing the profile engine failed. Check your internet connection and try again.')
      await rm(libDir, { recursive: true, force: true })
      await rename(tmpDir, libDir)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  }

  const installOnce = async (): Promise<ProfileEngineStatus> => {
    if (flavor.kind === 'binary') await installBinary(flavor.asset)
    else await installPython()
    const result = await status()
    if (!result.installed || !result.version) throw new Error('The profile engine was installed but could not be started.')
    return result
  }

  // Concurrent installs would share temp paths and clobber each other; share one in-flight install instead.
  let inFlight: Promise<ProfileEngineStatus> | null = null
  const install = (): Promise<ProfileEngineStatus> => {
    inFlight ??= installOnce().finally(() => { inFlight = null })
    return inFlight
  }

  return { status, install, command }
}
