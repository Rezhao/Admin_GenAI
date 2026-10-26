import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCatalogResource,getCatalogRecord,relationOptions,recordContext } from '../../../../lib/catalog'
import { type RelationOption } from '../../../../lib/resources'
import { uuidPattern } from '../../../../lib/validation'
import { CatalogForm } from '../../../../../components/catalog-form'
import { RecordInspector,RecordMetadata } from '../../../../../components/record-inspector'
export default async function RecordPage({params,searchParams}:{params:Promise<{resource:string;id:string}>;searchParams:Promise<{saved?:string;warning?:string}>}) {
  const {resource:slug,id}=await params
  const resource=await getCatalogResource(slug)
  if (!uuidPattern.test(id)) notFound()
  const record=await getCatalogRecord(slug,id)
  const context=await recordContext(slug,id)
  const search=await searchParams
  const options:Record<string,RelationOption[]>={}
  if(resource.mode!=='read') await Promise.all(resource.fields.filter(field=>field.relation).map(async field=>{options[field.key]=await relationOptions(field.relation!)}))
  return <><Link href={`/manage/${slug}`} className="text-link">← {resource.title}</Link><div className="page-heading"><div><p className="eyebrow">{resource.mode==='read'?'RECORD DETAILS':'EDIT RECORD'}</p><h1>{resource.singular}</h1></div><span className="pill">{resource.mode==='read'?'Read-only':'Live database'}</span></div>{search.saved && <p className="notice success" role="status">Changes saved.</p>}{search.warning && <p className="notice" role="alert">{search.warning}</p>}{record.source && record.source!=='live' && <p className="notice">Imported from a saved post. Caption text is available; original model, chain, token counts, and timing were not recorded.</p>}{resource.mode!=='read'?<CatalogForm resource={resource} record={record} options={options} metadata={<RecordMetadata record={record} labels={context?.labels}/>}/>:<RecordInspector slug={slug} record={record} context={context}/>}</>
}
