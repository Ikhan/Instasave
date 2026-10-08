import { useState } from 'react'
import type { ToolStatus } from '../../../shared/types'

interface EngineBannerProps {
  onInstalled: (status: ToolStatus) => void
}

/** Shown on first launch: the yt-dlp engine is downloaded once into the app's data folder. */
export function EngineBanner({ onInstalled }: EngineBannerProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const install = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const res = await window.insta.installTool()
      if (res.ok && res.data) onInstalled(res.data)
      else setError(res.error)
    } catch {
      setError('Installation failed unexpectedly. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="banner">
      <div>
        <strong>One-time setup needed.</strong> InstaSave needs to download its engine (about 35&nbsp;MB) before it
        can fetch posts.
        {error && <div className="error-text">{error}</div>}
      </div>
      <button className="btn primary" onClick={install} disabled={busy}>
        {busy ? 'Installing…' : 'Install engine'}
      </button>
    </div>
  )
}
