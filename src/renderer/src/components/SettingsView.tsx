import { useEffect, useState } from 'react'
import type { BrowserName, Settings, ToolStatus } from '../../../shared/types'

const BROWSER_OPTIONS: ReadonlyArray<{ value: BrowserName; label: string }> = [
  { value: 'none', label: 'Don’t use a login (public posts only)' },
  { value: 'chrome', label: 'Chrome' },
  { value: 'safari', label: 'Safari' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'edge', label: 'Microsoft Edge' },
  { value: 'brave', label: 'Brave' }
]

interface SettingsViewProps {
  tool: ToolStatus | null
  onToolChange: (status: ToolStatus) => void
}

export function SettingsView({ tool, onToolChange }: SettingsViewProps) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [updating, setUpdating] = useState(false)
  const [toolError, setToolError] = useState<string | null>(null)

  useEffect(() => { void window.insta.getSettings().then(setSettings) }, [])

  const updateEngine = async (): Promise<void> => {
    setUpdating(true)
    setToolError(null)
    try {
      const res = await window.insta.installTool()
      if (res.ok && res.data) onToolChange(res.data)
      else setToolError(res.error)
    } catch {
      setToolError('Update failed unexpectedly. Please try again.')
    } finally {
      setUpdating(false)
    }
  }

  if (!settings) return null

  return (
    <section className="settings">
      <div className="setting">
        <div>
          <h3>Download folder</h3>
          <p className="muted path">{settings.downloadDir}</p>
        </div>
        <button className="btn ghost" onClick={async () => setSettings(await window.insta.chooseDownloadDir())}>
          Change…
        </button>
      </div>

      <div className="setting">
        <div>
          <h3>Use browser login</h3>
          <p className="muted">
            Needed for private accounts you follow, and helps if Instagram blocks anonymous requests. InstaSave reads
            your Instagram cookies from the selected browser on this computer; they never leave your machine.
            Safari requires granting Full Disk Access in System Settings.
          </p>
        </div>
        <select
          value={settings.cookiesBrowser}
          onChange={async (e) =>
            setSettings(await window.insta.updateSettings({ cookiesBrowser: e.target.value as BrowserName }))}
        >
          {BROWSER_OPTIONS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      </div>

      <div className="setting">
        <div>
          <h3>HD video (ffmpeg)</h3>
          <p className="muted">
            {tool?.ffmpegPath
              ? `Found at ${tool.ffmpegPath}. Videos are saved in the highest quality available.`
              : 'Not found. Videos still download, but sometimes at lower resolution. For HD, install ffmpeg (on a Mac: "brew install ffmpeg") and restart InstaSave.'}
          </p>
        </div>
      </div>

      <div className="setting">
        <div>
          <h3>Engine (yt-dlp)</h3>
          <p className="muted">
            {tool?.installed ? `Installed · version ${tool.version}` : 'Not installed'}. If downloads suddenly stop
            working, Instagram probably changed something. Update the engine to get the fix.
          </p>
          {toolError && <p className="error-text">{toolError}</p>}
        </div>
        <button className="btn ghost" onClick={updateEngine} disabled={updating}>
          {updating ? 'Updating…' : tool?.installed ? 'Update engine' : 'Install engine'}
        </button>
      </div>
    </section>
  )
}
