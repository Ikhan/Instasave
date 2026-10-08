import { useCallback, useEffect, useState } from 'react'
import type { ToolStatus } from '../../shared/types'
import { DownloadView } from './components/DownloadView'
import { EngineBanner } from './components/EngineBanner'
import { HistoryView } from './components/HistoryView'
import { SettingsView } from './components/SettingsView'

type Tab = 'download' | 'history' | 'settings'

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'download', label: 'Download' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' }
]

export function App() {
  const [tab, setTab] = useState<Tab>('download')
  const [tool, setTool] = useState<ToolStatus | null>(null)

  const refreshTool = useCallback(async () => {
    try {
      setTool(await window.insta.toolStatus())
    } catch {
      setTool({ installed: false, version: null, ffmpegPath: null })
    }
  }, [])
  useEffect(() => { void refreshTool() }, [refreshTool])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>⬇</span>
          <span>InstaSave</span>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {tool && !tool.installed && <EngineBanner onInstalled={setTool} />}
        {tab === 'download' && <DownloadView engineReady={tool?.installed ?? false} />}
        {tab === 'history' && <HistoryView />}
        {tab === 'settings' && <SettingsView tool={tool} onToolChange={setTool} />}
      </main>

      <footer className="footer">
        Only download content you own or have permission to use. Respect creators&apos; rights.
      </footer>
    </div>
  )
}
