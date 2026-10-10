import type { FetchPolicy } from './download'

const DOWNLOAD_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'])

const httpsHostIn = (hosts: ReadonlySet<string>) => (url: string): boolean => {
  const u = new URL(url)
  return u.protocol === 'https:' && hosts.has(u.hostname)
}

/** Release asset downloads (github.com redirects to its asset CDN). */
export const GITHUB_DOWNLOAD_POLICY: FetchPolicy = { isAllowed: httpsHostIn(DOWNLOAD_HOSTS), maxBytes: 200 * 1024 * 1024 }

/** GitHub REST API metadata. */
export const GITHUB_API_POLICY: FetchPolicy = { isAllowed: httpsHostIn(new Set(['api.github.com'])), maxBytes: 2 * 1024 * 1024 }
