import Link from 'next/link'
import { getRecords, date } from '../../lib/data'
import type { Rating } from '../../lib/types'
import { pageNumber } from '../../lib/validation'
import { Search, Pagination } from '../../../components/page-tools'

export default async function Ratings({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams; const query = (params.q ?? '').slice(0,200); const page = pageNumber(params.page)
  const result = await getRecords<Rating>('ratings', query, page)
  return <><div className="page-heading"><div><p className="eyebrow">WHAT RESONATES</p><h1>Every reaction counts.</h1><p className="muted">A read-only ledger of Melon’s upvotes and downvotes.</p></div><span className="pill">{result.total} ratings</span></div><Search value={query} placeholder="Search captions, voters, or emails…" /><section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Reaction</th><th>Media</th><th>Member</th><th>Community</th><th>Date (UTC)</th></tr></thead><tbody>{result.items.map((r) => <tr key={`${r.generation_id}-${r.user_id}`}><td><span className={`vote-pill ${r.vote === 1 ? 'up' : 'down'}`}>{r.vote === 1 ? '↑ Upvote' : '↓ Downvote'}</span></td><td className="caption-cell"><Link className="text-link" href={`/media/${r.generation_id}`}>{r.caption}</Link></td><td><strong>{r.voter || 'Unnamed member'}</strong><small>{r.email || r.user_id}</small></td><td>{r.community || 'Unassigned'}</td><td>{date(r.created_at)}</td></tr>)}</tbody></table></div>{!result.items.length && <p className="empty">No ratings match your search.</p>}<Pagination total={result.total} page={page} query={query} path="/ratings" /></section></>
}
