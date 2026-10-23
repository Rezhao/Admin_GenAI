import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCatalogResource,relationOptions } from '../../../../lib/catalog'
import type { RelationOption } from '../../../../lib/resources'
import { CatalogForm } from '../../../../../components/catalog-form'
export default async function NewRecord({params}:{params:Promise<{resource:string}>}) {
  const {resource:slug}=await params
  const resource=await getCatalogResource(slug)
  if(resource.mode!=='crud') notFound()
  const options:Record<string,RelationOption[]>={}
  await Promise.all(resource.fields.filter(field=>field.relation).map(async field=>{options[field.key]=await relationOptions(field.relation!)}))
  return <><Link className="text-link" href={`/manage/${slug}`}>← {resource.title}</Link><div className="page-heading"><div><p className="eyebrow">{resource.group}</p><h1>Add {resource.singular.toLowerCase()}</h1><p className="muted">{resource.description}</p></div></div><CatalogForm resource={resource} options={options}/></>
}
