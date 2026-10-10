import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { ProfileEngineStatus, ProfileInfo, ProfileProgress, Settings } from '../../../../shared/types'
import { ProfileEngineBanner } from './ProfileEngineBanner'
import { ProfileRunPanel } from './ProfileRunPanel'

interface ProfileViewProps {
  onOpenSettings: () => void
}

export function ProfileView({ onOpenSettings }: ProfileViewProps) {
  const [engine, setEngine] = useState<ProfileEngineStatus | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [input, setInput] = useState('')
  const [info, setInfo] = useState<ProfileInfo | null>(null)
  const [quick, setQuick] = useState(false)
  const [progress, setProgress] = useState<ProfileProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const checkSeq = useRef(0)

  useEffect(() => {
    void window.insta.profileEngineStatus().then(setEngine).catch(() => setEngine(null))
    void window.insta.getSettings().then(setSettings)
    void window.insta.currentProfile().then((p) => {
      if (p) {
        setProgress(p)
        setInput(p.username)
      }
    })
    return window.insta.onProfileProgress(setProgress)
  }, [])

  const running = progress?.status === 'running'
  const needsLogin = settings?.cookiesBrowser === 'none'
  const startBlockedReason = !engine?.installed
    ? 'Install the profile engine first (see the banner above).'
    : needsLogin
      ? 'Choose your browser login in Settings first.'
      : null

  const check = useCallback(async (e?: FormEvent): Promise<void> => {
    e?.preventDefault()
    setError(null)
    setInfo(null)
    const seq = ++checkSeq.current
    const res = await window.insta.profileInfo(input)
    if (seq !== checkSeq.current) return // A newer check or an edit superseded this one.
    if (res.ok && res.data) {
      setInfo(res.data)
      setQuick(res.data.complete)
    } else setError(res.error)
  }, [input])

  const start = async (): Promise<void> => {
    if (!info) return
    setError(null)
    try {
      // Start exactly the profile that was checked (and whose options are shown), not whatever is typed now.
      const res = await window.insta.startProfile(info.username, quick)
      if (!res.ok) setError(res.error)
    } catch {
      setError('Could not start the download. Please try again.')
    }
  }

  return (
    <section>
      <h1 className="title">Download a whole profile</h1>
      <p className="subtitle">
        Saves every post of an account into its own folder. Posts you already downloaded are detected and skipped.
      </p>

      {engine && !engine.installed && <ProfileEngineBanner status={engine} onInstalled={setEngine} />}
      {needsLogin && (
        <div className="banner">
          <div>
            <strong>Instagram login needed.</strong> Profile downloads only work while logged in. Choose the browser
            where you’re logged in to instagram.com.
          </div>
          <button className="btn primary" onClick={onOpenSettings}>Open Settings</button>
        </div>
      )}

      <form className="urlbar" onSubmit={check}>
        <input
          placeholder="@username or https://www.instagram.com/username/"
          value={input}
          onChange={(e) => { setInput(e.target.value); setInfo(null); checkSeq.current++ }}
          disabled={running}
          spellCheck={false}
        />
        <button type="submit" className="btn ghost" disabled={running || !input.trim()}>Check</button>
      </form>

      {error && <div className="alert" role="alert">{error}</div>}

      {info && !running && (
        <div className="setting profile-info">
          <div>
            <h3>@{info.username}</h3>
            <p className="muted">
              {info.fileCount > 0
                ? `${info.fileCount} file(s) already in ${info.folder}. They won’t be downloaded again.`
                : `Nothing downloaded yet. Files will be saved to ${info.folder}.`}
            </p>
            <label className={info.complete ? 'check-row' : 'check-row muted'}>
              <input type="checkbox" checked={quick} disabled={!info.complete} onChange={(e) => setQuick(e.target.checked)} />
              Only look for new posts (faster)
              {!info.complete && ' (available after one complete download)'}
            </label>
          </div>
          <div className="start-col">
            <button className="btn primary" onClick={start} disabled={startBlockedReason !== null}>
              {info.fileCount > 0 ? 'Resume / update' : 'Start'}
            </button>
            {startBlockedReason && (
              <button type="button" className="link-btn" onClick={needsLogin && engine?.installed ? onOpenSettings : undefined}>
                {startBlockedReason}
              </button>
            )}
          </div>
        </div>
      )}

      {progress && (
        <ProfileRunPanel
          progress={progress}
          onStop={() => void window.insta.stopProfile()}
          onOpenFolder={() => void window.insta.openProfileFolder(progress.username)}
        />
      )}

      <p className="muted small-text hint">
        InstaSave pauses a few seconds between requests to avoid Instagram’s limits, so large profiles take a while.
        Only download content you own or have permission to use.
      </p>
    </section>
  )
}
