# InstaSave

A desktop app (Electron + React + TypeScript) for downloading Instagram photos, videos, reels and carousels.

## Features

- Paste a post, reel or carousel link, preview every item, and choose which ones to save
- HD video: separate video and audio streams are merged with ffmpeg, if it's installed
- Per-item progress bars and a download history with "Show in folder"
- Optional "Use browser login": reads your Instagram cookies from Chrome, Safari, Firefox, Edge or Brave, for private accounts you follow or when Instagram blocks anonymous requests
- One-click engine update for when Instagram changes something and downloads stop working
- **Whole-profile download** (Profile tab): saves every post of an account to `InstaSave/<username>/`.
  Files already on disk are detected and skipped, so you can stop and resume at any time. After one complete
  run, "Only look for new posts" stops as soon as it reaches posts you already have.

## How it works

Fetching uses [yt-dlp](https://github.com/yt-dlp/yt-dlp), an actively maintained downloader that is quickly patched when Instagram changes. On first launch the app downloads the official standalone yt-dlp binary into its data folder and verifies it against the release's `SHA2-256SUMS` before running it.

```
renderer (React UI)  ──IPC──▶  main process
                                 ├─ url.ts            validate/normalize links
                                 ├─ ytdlp.ts          run yt-dlp -J → parse.ts → PostInfo
                                 ├─ download-queue.ts one item at a time (gentle on rate limits)
                                 ├─ download.ts       streamed download, host allowlist on every redirect, size caps
                                 ├─ preview.ts        proxies CDN thumbnails (Instagram blocks hot-linking)
                                 └─ store.ts          settings + history JSON in userData
```

### Profile downloads

Profile downloads use [gallery-dl](https://github.com/mikf/gallery-dl), installed from the Profile tab:

- **Apple Silicon, Windows, Linux:** the official standalone build from `gdl-org/builds`, verified against the
  SHA-256 digest GitHub publishes for the release asset.
- **Intel Macs:** no x64 macOS build exists, so gallery-dl is installed from PyPI into the app's data folder and
  run with the Mac's Python 3 (3.8+; install with `xcode-select --install` or from python.org).

Each file is named `<date>_<shortcode>_<n>.<ext>`. Because the same post always maps to the same file name,
gallery-dl can tell whether a file is already downloaded. If a file exists it is skipped, otherwise it is
downloaded. Deleting a file makes it download again on the next run. Profile downloads need an Instagram login
(Settings → Use browser login) and pause 3–6 s between requests to stay under Instagram's limits.
Videos use Instagram's single-file versions, which are sometimes lower resolution than the HD merge used for single posts.

## Development

```bash
npm install
npm run dev          # run with hot reload
npm test             # unit + integration tests
npm run test:coverage
npm run typecheck
npm run dist:mac     # build release/InstaSave-<version>.dmg
npm run dist:win     # build the Windows installer
```

Optional: `brew install ffmpeg` for HD video merging.

## Notes

- Public posts work without logging in. Private posts need "Use browser login" in Settings, and on macOS Safari also needs Full Disk Access.
- Instagram rate-limits anonymous requests. If you see "too many requests", wait a while or turn on browser login.
- Downloading other people's content may break Instagram's Terms of Service and copyright law. Use it for your own content or with permission.
