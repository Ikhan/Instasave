import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { downloadToFile, type FetchPolicy } from './download'

const BODY = Buffer.alloc(64 * 1024, 7)
let server: Server
let base = ''
let lastReferer: string | undefined

beforeAll(async () => {
  server = createServer((req, res) => {
    lastReferer = req.headers.referer
    if (req.url === '/ok') {
      res.writeHead(200, { 'content-length': String(BODY.length) })
      res.end(BODY)
    } else if (req.url === '/redirect-out') {
      res.writeHead(302, { location: 'http://evil.example/x' })
      res.end()
    } else if (req.url === '/redirect-in') {
      res.writeHead(302, { location: '/ok' })
      res.end()
    } else if (req.url === '/html') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html>login</html>')
    } else {
      res.writeHead(403)
      res.end()
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((r) => server.close(() => r())))

const local: FetchPolicy = { isAllowed: (u) => new URL(u).hostname === '127.0.0.1', maxBytes: 1024 * 1024 }

const tempFile = (): string => join(mkdtempSync(join(tmpdir(), 'insta-dl-')), 'out.mp4')

describe('downloadToFile', () => {
  it('writes the file, reports progress and sends the Instagram referer', async () => {
    const out = tempFile()
    const fractions: (number | null)[] = []
    await downloadToFile(`${base}/ok`, out, (f) => fractions.push(f), local)
    expect(readFileSync(out).equals(BODY)).toBe(true)
    expect(fractions.at(-1)).toBe(1)
    expect(lastReferer).toBe('https://www.instagram.com/')
    expect(existsSync(`${out}.part`)).toBe(false)
  })

  it('fails on HTTP errors and leaves no partial file', async () => {
    const out = tempFile()
    await expect(downloadToFile(`${base}/missing`, out, () => {}, local)).rejects.toThrow(/403/)
    expect(existsSync(out)).toBe(false)
    expect(existsSync(`${out}.part`)).toBe(false)
  })

  it('rejects HTML responses (e.g. login pages) instead of saving them as media', async () => {
    const out = tempFile()
    await expect(downloadToFile(`${base}/html`, out, () => {}, local)).rejects.toThrow(/not a media file/i)
    expect(existsSync(out)).toBe(false)
  })

  it('follows redirects that stay on allowed hosts', async () => {
    const out = tempFile()
    await downloadToFile(`${base}/redirect-in`, out, () => {}, local)
    expect(readFileSync(out).equals(BODY)).toBe(true)
  })

  it('refuses redirects to hosts outside the allowlist', async () => {
    const out = tempFile()
    await expect(downloadToFile(`${base}/redirect-out`, out, () => {}, local)).rejects.toThrow(/not allowed/i)
    expect(existsSync(out)).toBe(false)
  })

  it('refuses a disallowed starting URL', async () => {
    await expect(downloadToFile('https://evil.example/x', tempFile(), () => {}, local)).rejects.toThrow(/not allowed/i)
  })

  it('aborts files larger than the size limit', async () => {
    const out = tempFile()
    const tiny: FetchPolicy = { ...local, maxBytes: 1000 }
    await expect(downloadToFile(`${base}/ok`, out, () => {}, tiny)).rejects.toThrow(/too large/i)
    expect(existsSync(out)).toBe(false)
    expect(existsSync(`${out}.part`)).toBe(false)
  })
})
