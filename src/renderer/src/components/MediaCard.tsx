import type { DownloadProgress, MediaItem } from '../../../shared/types'
import { usePreview } from '../usePreview'

interface MediaCardProps {
  item: MediaItem
  selected: boolean
  onToggle: () => void
  progress: DownloadProgress | undefined
  disabled: boolean
}

function StatusLine({ progress }: { progress: DownloadProgress }) {
  if (progress.status === 'error') return <div className="status error-text" title={progress.error}>{progress.error}</div>
  if (progress.status === 'done') return <div className="status ok-text">Saved ✓</div>
  if (progress.status === 'queued') return <div className="status">Waiting…</div>
  const pct = progress.fraction === null ? null : Math.round(progress.fraction * 100)
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
      <div className={pct === null ? 'bar indeterminate' : 'bar'} style={pct === null ? undefined : { width: `${pct}%` }} />
    </div>
  )
}

export function MediaCard({ item, selected, onToggle, progress, disabled }: MediaCardProps) {
  const preview = usePreview(item.previewUrl)
  const size = item.width && item.height ? `${item.width}×${item.height}` : null

  return (
    <label className={selected ? 'card selected' : 'card'}>
      <div className="thumb">
        {preview ? <img src={preview} alt={`${item.kind} ${item.index}`} /> : <div className="thumb-placeholder" />}
        <span className="badge">{item.kind === 'video' ? '▶ Video' : 'Photo'}{item.hdAvailable ? ' · HD' : ''}</span>
        <input type="checkbox" className="check" checked={selected} onChange={onToggle} disabled={disabled} />
      </div>
      <div className="card-meta">
        <span>#{item.index}</span>
        {size && <span className="muted">{size}</span>}
      </div>
      {progress && <StatusLine progress={progress} />}
    </label>
  )
}
