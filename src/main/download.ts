import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000
const MAX_REDIRECTS = 5

export const MEDIA_HEADERS: Readonly<Record<string, string>> = {
  'User-Agent': USER_AGENT,
  Referer: 'https://www.instagram.com/'
}

/** Which hosts a request may touch (checked on every redirect hop) and how large the body may be. */
export interface FetchPolicy {
  readonly isAllowed: (url: string) => boolean
  readonly maxBytes: number
}

/** fetch() that re-validates every redirect against the policy instead of following blindly. */
export async function safeFetch(url: string, policy: FetchPolicy, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs)
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!policy.isAllowed(current)) throw new Error('Request to this address is not allowed.')
    const res = await fetch(current, { headers: MEDIA_HEADERS, redirect: 'manual', signal })
    const location = res.headers.get('location')
    if (res.status < 300 || res.status >= 400 || !location) {
      const length = Number(res.headers.get('content-length')) || 0
      if (length > policy.maxBytes) throw new Error('File is too large.')
      return res
    }
    current = new URL(location, current).toString()
  }
  throw new Error('Too many redirects.')
}

function sizeLimiter(maxBytes: number, onChunk: (received: number) => void): Transform {
  let received = 0
  return new Transform({
    transform(chunk: Buffer, _enc, done) {
      received += chunk.length
      if (received > maxBytes) return done(new Error('File is too large.'))
      onChunk(received)
      done(null, chunk)
    }
  })
}

/** Reads a response body into memory, aborting once it exceeds `maxBytes`. */
export async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0)
  const chunks: Buffer[] = []
  await pipeline(Readable.fromWeb(res.body as never), sizeLimiter(maxBytes, () => {}), async function* (source) {
    for await (const chunk of source) chunks.push(chunk as Buffer)
  })
  return Buffer.concat(chunks)
}

/** Streams `url` to `outPath` via a `.part` file, reporting progress as a 0..1 fraction (null if size unknown). */
export async function downloadToFile(
  url: string,
  outPath: string,
  onProgress: (fraction: number | null) => void,
  policy: FetchPolicy
): Promise<void> {
  const partPath = `${outPath}.part`
  const res = await safeFetch(url, policy)
  if (!res.ok || !res.body) throw new Error(`Server responded with HTTP ${res.status}`)
  if ((res.headers.get('content-type') ?? '').includes('text/html')) {
    throw new Error('Instagram returned a web page, not a media file. The link may have expired; fetch the post again.')
  }

  const total = Number(res.headers.get('content-length')) || 0
  let lastReported = -1
  const counter = sizeLimiter(policy.maxBytes, (received) => {
    const fraction = total > 0 ? Math.min(received / total, 1) : null
    // Throttle IPC traffic to whole-percent changes.
    const pct = fraction === null ? -1 : Math.floor(fraction * 100)
    if (fraction === null || pct !== lastReported) {
      lastReported = pct
      onProgress(fraction)
    }
  })

  try {
    await pipeline(Readable.fromWeb(res.body as never), counter, createWriteStream(partPath))
    await rename(partPath, outPath)
    onProgress(1)
  } catch (error: unknown) {
    await rm(partPath, { force: true })
    throw error
  }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}
