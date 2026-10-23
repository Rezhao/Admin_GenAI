import Link from 'next/link'
import { getCatalogResource, listCatalog } from '../../../lib/catalog'
import { fieldLabel } from '../../../lib/resources'
import { pageNumber } from '../../../lib/validation'
import { Search,Pagination } from '../../../../components/page-tools'
import { MediaImage } from '../../../../components/media-image'
export default async function CatalogPage({params,searchParams}:{params:Promise<{resource:string}>;searchParams:Promise<{q?:string;page?:string;deleted?:string;warning?:string}>}) {
  const {resource:slug}=await params
  const resource=await getCatalogResource(slug)
  const search=await searchParams; const query=(search.q??'').slice(0,200); const page=pageNumber(search.page)
  const result=await listCatalog(slug,query,page)
  return <><div className="page-heading"><div><p className="eyebrow">{resource.group}</p><h1>{resource.title}</h1><p className="muted">{resource.description}</p></div>{resource.mode==='crud'?<Link href={`/manage/${slug}/new`} className="button">＋ Add {resource.singular.toLowerCase()}</Link>:<span className="pill">{resource.mode==='read'?'Read-only':'Edit existing entries'}</span>}</div>{search.deleted && <p role="status" className="notice success">Record deleted.</p>}{search.warning && <p role="alert" className="notice">{search.warning}</p>}
  {!result?<section className="panel"><h2>Database setup required</h2><p className="muted">Run supabase/004-generation-admin.sql in the existing Melon Supabase SQL Editor to activate these pages. Existing Melon records are preserved.</p></section>:<><Search value={query} placeholder={`Search ${resource.title.toLowerCase()}…`}/><section className="panel table-panel"><div className="table-scroll"><table><thead><tr>{slug==='images' && <th>Preview</th>}{resource.columns.map(key=><th key={key}>{fieldLabel(key)}</th>)}<th>Record</th></tr></thead><tbody>{result.items.map(record=><tr key={record.id}>{slug==='images' && <td><MediaImage src={record.image_url} caption={String(record.alt_text||record.name)} className="library-thumbnail"/></td>}{resource.columns.map(key=><td className="catalog-cell" key={key}>{typeof record[key]==='boolean'?<span className="pill">{record[key]?'Enabled':'Disabled'}</span>:<span>{record[key]===null||record[key]===undefined?'—':String(record[key])}</span>}</td>)}<td><Link className="text-link" href={`/manage/${slug}/${record.id}`}>{resource.mode==='read'?'View':'Manage'} ↗</Link><code>{record.id.slice(0,8)}…</code></td></tr>)}</tbody></table></div>{!result.items.length && <p className="empty">{query?'No records match your search.':'No records yet. New supporting tables start empty; existing posts remain in Media library.'}</p>}<Pagination total={result.total} page={page} query={query} path={`/manage/${slug}`}/></section></>}
  </>
}
