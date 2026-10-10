import type { ProfileProgress } from '../../../../shared/types'

interface ProfileRunPanelProps {
  progress: ProfileProgress
  onStop: () => void
  onOpenFolder: () => void
}

const fileName = (p: string): string => p.split(/[\\/]/).pop() ?? p

const STATUS_TEXT: Readonly<Record<ProfileProgress['status'], string>> = {
  running: 'Downloading…',
  done: 'Finished. Everything is saved.',
  stopped: 'Stopped. Press Start to resume; saved files are skipped.',
  error: 'Stopped with a problem.'
}

export function ProfileRunPanel({ progress, onStop, onOpenFolder }: ProfileRunPanelProps) {
  const running = progress.status === 'running'
  return (
    <div className="run-panel">
      <div className="section-head">
        <h2>@{progress.username}</h2>
        <div className="post-actions">
          {(progress.downloaded > 0 || progress.skipped > 0) && (
            <button className="btn ghost" onClick={onOpenFolder}>Open folder</button>
          )}
          {running && <button className="btn ghost" onClick={onStop}>Stop</button>}
        </div>
      </div>

      <div className="stats">
        <div className="stat"><span className="stat-num">{progress.downloaded}</span>new files downloaded</div>
        <div className="stat"><span className="stat-num">{progress.skipped}</span>already downloaded, skipped</div>
      </div>

      {running && <div className="progress"><div className="bar indeterminate" /></div>}
      <p className={progress.status === 'error' ? 'error-text' : 'muted'}>
        {progress.status === 'error' && progress.error ? progress.error : STATUS_TEXT[progress.status]}
      </p>
      {progress.lastFile && <p className="muted small-text">Last saved: {fileName(progress.lastFile)}</p>}
    </div>
  )
}
