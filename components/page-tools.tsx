import Link from 'next/link'

export function Search({ value, placeholder }: { value: string; placeholder: string }) {
  return <form className="search" method="get"><label className="sr-only" htmlFor="search">Search records</label><span aria-hidden="true">⌕</span><input id="search" name="q" defaultValue={value} placeholder={placeholder} maxLength={200} type="search" /><button className="button small">Search</button>{value && <Link href="?">Clear</Link>}</form>
}
export function Pagination({ total, page, query, path }: { total: number; page: number; query: string; path: string }) {
  const pages = Math.max(1, Math.ceil(total / 25))
  const href = (p: number) => `${path}?${new URLSearchParams({ q: query, page: String(p) })}`
  return <nav className="pagination" aria-label="Pagination"><span>{total === 0 ? 'No records' : `Showing ${(page-1)*25+1}–${Math.min(page*25,total)} of ${total}`}</span><div>{page > 1 && <Link className="button secondary small" href={href(page-1)}>← Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="button secondary small" href={href(page+1)}>Next →</Link>}</div></nav>
}
