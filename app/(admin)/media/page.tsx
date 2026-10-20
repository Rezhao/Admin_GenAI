import Link from 'next/link'
import { getRecords, date } from '../../lib/data'
import type { Media } from '../../lib/types'
import { pageNumber } from '../../lib/validation'
import { Search, Pagination } from '../../../components/page-tools'
import { MediaImage } from '../../../components/media-image'

export default async function MediaLibrary({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; deleted?: string; warning?: string }> }) {
  const params = await searchParams; const query = (params.q ?? '').slice(0,200); const page = pageNumber(params.page)
  const result = await getRecords<Media>('media', query, page)
  return <><div className="page-heading"><div><p className="eyebrow">THE CREATIVE INVENTORY</p><h1>Media, all in one place.</h1><p className="muted">Review, create, and curate the media your community sees.</p></div><Link className="button" href="/media/new">＋ Create media</Link></div>{params.deleted && <p role="status" className="notice success">Media record deleted from Melon.</p>}{params.warning && <p role="alert" className="notice">{params.warning}</p>}<Search value={query} placeholder="Search captions, prompts, or communities…" />
    {result.items.length ? <div className="media-grid">{result.items.map((m) => <article className="media-card" key={m.id}><Link className="media-preview" href={`/media/${m.id}`}><MediaImage src={m.image_url} caption={m.caption} /></Link><div className="media-card-body"><span className="pill">{m.community || 'Unassigned'}</span><h2><Link href={`/media/${m.id}`}>{m.caption}</Link></h2><p className="muted small-copy">{m.author || m.email || 'Unknown author'} · {date(m.created_at)}</p><div className="media-card-footer"><span>↑ {m.upvotes} <span className="muted"> / </span> ↓ {m.downvotes}</span><Link href={`/media/${m.id}`} className="text-link">Manage ↗</Link></div></div></article>)}</div> : <div className="panel empty">No media matches your search. Create a record or try another search.</div>}<Pagination total={result.total} page={page} query={query} path="/media" /></>
}
