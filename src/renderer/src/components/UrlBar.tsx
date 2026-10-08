import { useState, type FormEvent } from 'react'

interface UrlBarProps {
  onSubmit: (url: string) => void
  loading: boolean
  disabled: boolean
}

export function UrlBar({ onSubmit, loading, disabled }: UrlBarProps) {
  const [value, setValue] = useState('')

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (value.trim()) onSubmit(value.trim())
  }

  const paste = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText()
      setValue(text.trim())
      if (text.trim()) onSubmit(text.trim())
    } catch {
      // Clipboard permission denied: the user can still paste manually.
    }
  }

  return (
    <form className="urlbar" onSubmit={submit}>
      <input
        type="url"
        placeholder="https://www.instagram.com/p/…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled || loading}
        spellCheck={false}
        autoFocus
      />
      <button type="button" className="btn ghost" onClick={paste} disabled={disabled || loading}>
        Paste
      </button>
      <button type="submit" className="btn primary" disabled={disabled || loading || !value.trim()}>
        {loading ? 'Fetching…' : 'Fetch'}
      </button>
    </form>
  )
}
