import 'server-only'
import { notFound } from 'next/navigation'
import { requireAdmin } from './auth'
import { validId } from './validation'
import { resourceBySlug, type CatalogRecord, type RelationOption } from './resources'
import type { PageResult } from './types'
export async function getCatalogResource(slug: string) {
  await requireAdmin()
  const resource = resourceBySlug(slug)
  if (!resource) notFound()
  return resource
}
export async function listCatalog(slug: string, query: string, page: number) {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('admin_catalog_list', { resource: slug, search_text: query, page_number: page })
  if (error?.code === 'PGRST202') return null
  if (error) throw new Error('Unable to load these records. Check the database migration and connection.')
  const result = data as PageResult<CatalogRecord>
  if (slug === 'images') await Promise.all(result.items.map(async record => {
    const { data } = await supabase.storage.from('admin-images').createSignedUrl(String(record.storage_path),300)
    record.image_url = data?.signedUrl
  }))
  return result
}
export async function getCatalogRecord(slug: string, id: string) {
  const { supabase } = await requireAdmin()
  validId(id)
  const { data,error } = await supabase.rpc('admin_catalog_get',{resource:slug,target:id})
  if (error) throw new Error('Unable to load this record. Apply the generation-admin migration first.')
  if (!data) notFound()
  const record = data as CatalogRecord
  if (slug === 'images') {
    const { data } = await supabase.storage.from('admin-images').createSignedUrl(String(record.storage_path),300)
    record.image_url = data?.signedUrl
  }
  return record
}
export async function relationOptions(slug: string, query = '') {
  const { supabase } = await requireAdmin()
  const { data,error } = await supabase.rpc('admin_catalog_options',{resource:slug,search_text:query.slice(0,200)})
  if (error) throw new Error('Unable to load related records.')
  return data as RelationOption[]
}
export async function catalogStats() {
  const { supabase } = await requireAdmin()
  const { data,error } = await supabase.rpc('admin_catalog_stats')
  if (error?.code === 'PGRST202') return null
  if (error) throw new Error('Unable to load generation statistics.')
  return data as { chains:number; terms:number; examples:number; images:number; post_images?:number; live_requests?:number; imported_requests?:number; requests:number; failed:number; responses:number; tokens:number; mean_latency_ms:number|null; mix:{name:string;weight:number;enabled:boolean}[] }
}
export type InspectionContext = {
  labels?: Record<string,string>; request_labels?: Record<string,string>;
  chain?: CatalogRecord; steps?: CatalogRecord[]; runs?: CatalogRecord[]; run_count?: number; mix?: CatalogRecord;
  request?: CatalogRecord; profile?: {id:string;name:string;email:string};
  media?: CatalogRecord; responses?: CatalogRecord[];
}
export async function recordContext(slug:string,id:string):Promise<InspectionContext|null> {
  const {supabase}=await requireAdmin()
  validId(id)
  const {data,error}=await supabase.rpc('admin_record_context',{resource:slug,target:id})
  if(error?.code==='PGRST202') return null
  if(error) throw new Error('Unable to load related records. Check the admin details migration.')
  const context=data as InspectionContext|null
  if(context?.media?.image_path) {
    const {data}=await supabase.storage.from('generated-media').createSignedUrl(String(context.media.image_path),300)
    context.media.image_url=data?.signedUrl
  }
  return context
}
