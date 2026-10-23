import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCatalogResource,getCatalogRecord,relationOptions } from '../../../../lib/catalog'
import { fieldLabel, type RelationOption } from '../../../../lib/resources'
import { uuidPattern } from '../../../../lib/validation'
import { CatalogForm } from '../../../../../components/catalog-form'
const references: Record<string,string>={prompt_chain_id:'prompt-chains',llm_model_id:'models',provider_id:'providers',term_id:'terms',image_id:'images',generation_request_id:'generation-requests',prompt_chain_step_id:'prompt-chain-steps'}
export default async function RecordPage({params,searchParams}:{params:Promise<{resource:string;id:string}>;searchParams:Promise<{saved?:string;warning?:string}>}) {
  const {resource:slug,id}=await params
  const resource=await getCatalogResource(slug)
  if (!uuidPattern.test(id)) notFound()
  const record=await getCatalogRecord(slug,id)
  const search=await searchParams
  const options:Record<string,RelationOption[]>={}
  if(resource.mode!=='read') await Promise.all(resource.fields.filter(field=>field.relation).map(async field=>{options[field.key]=await relationOptions(field.relation!)}))
  return <><Link href={`/manage/${slug}`} className="text-link">← {resource.title}</Link><div className="page-heading"><div><p className="eyebrow">{resource.mode==='read'?'RECORD DETAILS':'EDIT RECORD'}</p><h1>{resource.singular}</h1></div><span className="pill">{resource.mode==='read'?'Read-only':'Live database'}</span></div>{search.saved && <p className="notice success" role="status">Changes saved.</p>}{search.warning && <p className="notice" role="alert">{search.warning}</p>}{resource.mode!=='read'?<CatalogForm resource={resource} record={record} options={options}/>:<section className="panel"><dl className="record-details">{Object.entries(record).map(([key,value])=><div key={key}><dt>{fieldLabel(key)}</dt><dd>{value===null?'—':references[key]&&value?<Link className="text-link" href={`/manage/${references[key]}/${value}`}>{String(value)} ↗</Link>:key==='generation_id'&&value?<Link className="text-link" href={`/media/${value}`}>{String(value)} ↗</Link>:key==='user_id'&&value?<Link className="text-link" href={`/profiles?q=${encodeURIComponent(String(value))}`}>{String(value)} ↗</Link>:typeof value==='object'?JSON.stringify(value,null,2):String(value)}</dd></div>)}</dl></section>}</>
}
