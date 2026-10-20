import Link from 'next/link'
import { getMedia, getCommunities, date } from '../../../lib/data'
import { MediaForm } from '../../../../components/media-form'

export default async function EditMedia({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; warning?: string }> }) {
  const { id } = await params
  const [media, communities, status] = await Promise.all([getMedia(id), getCommunities(), searchParams])
  return <><Link className="text-link" href="/media">← Media library</Link><div className="page-heading"><div><p className="eyebrow">CURATE THE DETAILS</p><h1>Give it a little polish.</h1><p className="muted">Created {date(media.created_at)} · <code>{media.id}</code></p></div></div>{status.saved && <p className="notice success" role="status">Saved. Your changes are live in Melon.</p>}{status.warning && <p className="notice" role="alert">{status.warning}</p>}<MediaForm media={media} communities={communities} /></>
}
