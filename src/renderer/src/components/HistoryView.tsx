import { useEffect, useState } from 'react'
import type { HistoryEntry } from '../../../shared/types'

const fileName = (p: string): string => p.split(/[\\/]/).pop() ?? p

export function HistoryView() {
  const [entries, setEntries] = useState<readonly HistoryEntry[]>([])

  useEffect(() => { void window.insta.getHistory().then(setEntries) }, [])

  const clear = async (): Promise<void> => {
    if (window.confirm('Clear download history? Your downloaded files are not deleted.')) {
      setEntries(await window.insta.clearHistory())
    }
  }

  if (entries.length === 0) return <p className="empty">No downloads yet.</p>

  return (
    <section>
      <div className="section-head">
        <h2>Recent downloads</h2>
        <button className="btn ghost" onClick={clear}>Clear history</button>
      </div>
      <ul className="history">
        {entries.map((e) => (
          <li key={e.id}>
            <span className="badge inline">{e.kind === 'video' ? 'Video' : 'Photo'}</span>
            <div className="history-main">
              <div className="file">{fileName(e.filePath)}</div>
              <div className="muted">@{e.username ?? 'unknown'} · {new Date(e.downloadedAt).toLocaleString()}</div>
            </div>
            <button className="btn ghost small" onClick={() => void window.insta.revealFile(e.filePath)}>
              Show in folder
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
