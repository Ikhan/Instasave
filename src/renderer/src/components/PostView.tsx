import { useEffect, useState } from 'react'
import type { DownloadProgress, PostInfo } from '../../../shared/types'
import { MediaCard } from './MediaCard'

interface PostViewProps {
  post: PostInfo
}

type ProgressMap = Readonly<Record<string, DownloadProgress>>

export function PostView({ post }: PostViewProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(post.items.map((i) => i.id)))
  const [progress, setProgress] = useState<ProgressMap>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => window.insta.onProgress((p) => setProgress((prev) => ({ ...prev, [p.itemId]: p }))), [])

  const toggle = (id: string): void =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allSelected = selected.size === post.items.length
  const toggleAll = (): void => setSelected(allSelected ? new Set() : new Set(post.items.map((i) => i.id)))

  const download = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await window.insta.downloadItems(post, [...selected])
      setMessage(res.ok
        ? { kind: 'ok', text: `Saved ${selected.size} file(s).` }
        : { kind: 'error', text: res.error ?? 'Download failed.' })
    } catch {
      setMessage({ kind: 'error', text: 'Download failed unexpectedly. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="post">
      <div className="post-header">
        <div>
          <div className="username">@{post.username ?? 'unknown'}</div>
          {post.caption && <p className="caption">{post.caption}</p>}
        </div>
        <div className="post-actions">
          {post.items.length > 1 && (
            <button className="btn ghost" onClick={toggleAll} disabled={busy}>
              {allSelected ? 'Select none' : 'Select all'}
            </button>
          )}
          <button className="btn primary" onClick={download} disabled={busy || selected.size === 0}>
            {busy ? 'Downloading…' : `Download ${selected.size} item${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {message && <div className={message.kind === 'ok' ? 'notice' : 'alert'}>{message.text}</div>}

      <div className="grid">
        {post.items.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onToggle={() => toggle(item.id)}
            progress={progress[item.id]}
            disabled={busy}
          />
        ))}
      </div>
    </div>
  )
}
