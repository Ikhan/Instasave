import { useState } from 'react'
import type { PostInfo } from '../../../shared/types'
import { PostView } from './PostView'
import { UrlBar } from './UrlBar'

interface DownloadViewProps {
  engineReady: boolean
}

export function DownloadView({ engineReady }: DownloadViewProps) {
  const [post, setPost] = useState<PostInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPost = async (url: string): Promise<void> => {
    setLoading(true)
    setError(null)
    setPost(null)
    try {
      const res = await window.insta.fetchPost(url)
      if (res.ok && res.data) setPost(res.data)
      else setError(res.error ?? 'Could not fetch this post.')
    } catch {
      setError('Something went wrong while fetching this post. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="download-view">
      <h1 className="title">Download Instagram photos, videos &amp; reels</h1>
      <p className="subtitle">Paste a link to a post, reel or carousel and choose what to save.</p>
      <UrlBar onSubmit={fetchPost} loading={loading} disabled={!engineReady} />
      {error && <div className="alert" role="alert">{error}</div>}
      {loading && <div className="spinner" aria-label="Loading" />}
      {post && <PostView key={post.shortcode} post={post} />}
    </section>
  )
}
