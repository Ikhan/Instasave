import { useState } from 'react'
import type { ProfileEngineStatus } from '../../../../shared/types'

interface ProfileEngineBannerProps {
  status: ProfileEngineStatus
  onInstalled: (status: ProfileEngineStatus) => void
}

export function ProfileEngineBanner({ status, onInstalled }: ProfileEngineBannerProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const install = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const res = await window.insta.installProfileEngine()
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
        <strong>Profile downloads need one more engine.</strong> InstaSave uses gallery-dl to list every post of an
        account ({status.mode === 'python' ? 'installed with your Mac’s Python' : 'about 25 MB'}).
        {status.problem && <div className="error-text">{status.problem}</div>}
        {error && <div className="error-text">{error}</div>}
      </div>
      <button className="btn primary" onClick={install} disabled={busy || status.problem !== null}>
        {busy ? 'Installing…' : 'Install'}
      </button>
    </div>
  )
}
