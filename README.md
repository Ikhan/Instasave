# InstaSave

A desktop app (Electron + React + TypeScript) for downloading Instagram photos, videos, reels and carousels.

## Features

- Paste a post, reel or carousel link, preview every item, and choose which ones to save
- HD video: separate video and audio streams are merged with ffmpeg, if it's installed
- Per-item progress bars and a download history with "Show in folder"
- Optional "Use browser login": reads your Instagram cookies from Chrome, Safari, Firefox, Edge or Brave, for private accounts you follow or when Instagram blocks anonymous requests
- One-click engine update for when Instagram changes something and downloads stop working

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
