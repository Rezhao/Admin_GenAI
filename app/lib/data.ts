import 'server-only'
import { notFound } from 'next/navigation'
import { requireAdmin } from './auth'
import { validId } from './validation'
import type { Community, Media, Overview, PageResult, Profile, Rating } from './types'

export async function getOverview() {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('admin_overview')
  if (error) throw new Error('Unable to load dashboard statistics. Check the database migration and connection.')
  return data as Overview
}
export async function getRecords<T extends Profile | Media | Rating>(resource: 'profiles' | 'media' | 'ratings', query: string, page: number) {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('admin_list', { resource, search_text: query.slice(0,200), page_number: page })
  if (error) throw new Error('Unable to load records. Check your database connection.')
  const result = data as PageResult<T>
  if (resource === 'media') {
    await Promise.all(result.items.map(async (item) => {
      const media = item as Media
      const { data: signed } = await supabase.storage.from('generated-media').createSignedUrl(media.image_path, 300)
      media.image_url = signed?.signedUrl
    }))
  }
  return result
}
export async function getMedia(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  validId(id)
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('admin_get_media', { target: id })
  if (error) throw new Error('Unable to load this media record.')
  if (!data) notFound()
  const media = data as Media
  const { data: signed } = await supabase.storage.from('generated-media').createSignedUrl(media.image_path, 300)
  return { ...media, image_url: signed?.signedUrl }
}
export async function getCommunities() {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('admin_communities')
  if (error) throw new Error('Unable to load communities.')
  return data as Community[]
}
export const number = (value: number) => new Intl.NumberFormat('en-US').format(value)
export const date = (value: string | null) => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—'
