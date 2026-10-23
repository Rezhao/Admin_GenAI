'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '../../lib/auth'
import { resourceBySlug, resourceInput } from '../../lib/resources'
import { validId, imageType } from '../../lib/validation'
export interface CatalogState { error: string }
function mutationError(code?: string) {
  if (code === '23503') return 'This record is referenced by another record. Remove or change that reference first.'
  if (code === '23505') return 'A record with these unique values already exists.'
  if (code === '23514' || code === '23502' || code?.startsWith('22')) return 'One or more fields are invalid. Check the required values and ranges.'
  return 'The operation could not be completed. Check the migration, your access, and the selected references.'
}
export async function saveCatalog(_state: CatalogState, form: FormData): Promise<CatalogState> {
  const { supabase,user } = await requireAdmin()
  const resource = resourceBySlug(String(form.get('resource')))
  if (!resource || resource.mode === 'read') return {error:'This resource is read-only.'}
  let uploaded: string | null = null
  let saved = false
  let destination = `/manage/${resource.slug}`
  try {
    const id = form.get('id') ? validId(form.get('id')) : null
    if (!id && resource.mode !== 'crud') throw new Error('New records cannot be created here.')
    const payload = resourceInput(resource,form)
    let oldPath: string | null = null
    if (resource.slug === 'images') {
      if (id) {
        const {data,error} = await supabase.rpc('admin_catalog_get',{resource:'images',target:id})
        if (error || !data) throw new Error('Image not found.')
        oldPath = data.storage_path
      }
      const file = form.get('image')
      if (file instanceof File && file.size > 0) {
        if (file.size > 3*1024*1024) throw new Error('Choose a PNG, JPEG, or WebP image no larger than 3 MB.')
        const bytes = new Uint8Array(await file.arrayBuffer())
        const mime = imageType(bytes)
        const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp'
        uploaded = `${user.id}/${crypto.randomUUID()}.${ext}`
        const {error} = await supabase.storage.from('admin-images').upload(uploaded,bytes,{contentType:mime,upsert:false})
        if (error) throw new Error('The image upload failed. Try again.')
        payload.storage_path = uploaded; payload.mime_type = mime
      } else if (!id) throw new Error('Choose an image to upload.')
    }
    const {data,error} = await supabase.rpc('admin_catalog_save',{resource:resource.slug,target:id,payload})
    if (error) throw new Error(mutationError(error.code))
    saved = true
    destination = `/manage/${resource.slug}/${validId(data)}?saved=1`
    if (uploaded && oldPath && oldPath !== uploaded) {
      const {error} = await supabase.storage.from('admin-images').remove([oldPath])
      if (error) destination += '&warning=The%20record%20was%20saved%20but%20the%20old%20file%20could%20not%20be%20removed.'
    }
  } catch (error) {
    if (uploaded && !saved) await supabase.storage.from('admin-images').remove([uploaded])
    if (!saved) return {error:error instanceof Error ? error.message : 'Unable to save.'}
    destination += '&warning=Saved%2C%20but%20file%20cleanup%20could%20not%20finish.'
  }
  revalidatePath('/', 'layout')
  redirect(destination)
}
export async function deleteCatalog(_state: CatalogState, form: FormData): Promise<CatalogState> {
  const {supabase} = await requireAdmin()
  const resource = resourceBySlug(String(form.get('resource')))
  if (!resource || resource.mode !== 'crud') return {error:'Deletion is not allowed for this resource.'}
  let destination = `/manage/${resource.slug}?deleted=1`
  try {
    if (form.get('confirmation') !== 'DELETE') throw new Error('Type DELETE to confirm.')
    const {data,error} = await supabase.rpc('admin_catalog_delete',{resource:resource.slug,target:validId(form.get('id'))})
    if (error) throw new Error(mutationError(error.code))
    if (resource.slug === 'images') {
      try {
        const {error} = await supabase.storage.from('admin-images').remove([data.storage_path])
        if (error) destination += '&warning=Record%20deleted%2C%20but%20its%20file%20could%20not%20be%20removed.'
      } catch { destination += '&warning=Record%20deleted%2C%20but%20file%20cleanup%20could%20not%20finish.' }
    }
  } catch (error) { return {error:error instanceof Error ? error.message : 'Unable to delete.'} }
  revalidatePath('/', 'layout')
  redirect(destination)
}
export async function searchRelations(slug: string, query: string) {
  const {supabase} = await requireAdmin()
  if (!['providers','models','prompt-chains','terms','images'].includes(slug)) throw new Error('Invalid relation.')
  const {data,error} = await supabase.rpc('admin_catalog_options',{resource:slug,search_text:String(query).slice(0,200)})
  if (error) throw new Error('Related records could not be loaded.')
  return data as {id:string;label:string}[]
}
