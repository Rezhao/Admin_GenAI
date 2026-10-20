import { getRecords, date } from '../../lib/data'
import type { Profile } from '../../lib/types'
import { pageNumber } from '../../lib/validation'
import { Search, Pagination } from '../../../components/page-tools'

export default async function Profiles({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams; const query = (params.q ?? '').slice(0,200); const page = pageNumber(params.page)
  const result = await getRecords<Profile>('profiles', query, page)
  return <><div className="page-heading"><div><p className="eyebrow">THE PEOPLE BEHIND THE POSTS</p><h1>Meet your community.</h1><p className="muted">Profiles, participation, and account activity. Read-only.</p></div><span className="pill">{result.total} profiles</span></div><Search value={query} placeholder="Search names, emails, or user IDs…" /><section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Member</th><th>Provider / access</th><th>Media</th><th>Votes</th><th>Joined</th><th>Last sign-in</th></tr></thead><tbody>{result.items.map((p) => <tr key={p.id}><td><div className="person"><span className="initials">{(p.first_name?.[0] ?? p.email?.[0] ?? '?').toUpperCase()}{p.last_name?.[0]?.toUpperCase()}</span><div><strong>{[p.first_name,p.last_name].filter(Boolean).join(' ') || 'Unnamed member'}</strong><small>{p.email || 'No email'}</small><code title={p.id}>{p.id.slice(0,8)}…</code></div></div></td><td><span className="pill">{p.provider}</span>{p.is_superadmin && <small className="admin-label">Superadmin</small>}</td><td>{p.media_count}</td><td>{p.vote_count}</td><td>{date(p.created_at)}</td><td>{date(p.last_sign_in_at)}</td></tr>)}</tbody></table></div>{!result.items.length && <p className="empty">No profiles match your search.</p>}<Pagination total={result.total} page={page} query={query} path="/profiles" /></section></>
}
