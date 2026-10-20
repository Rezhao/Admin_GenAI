'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '../../lib/auth'
import { validId, mediaInput, imageType } from '../../lib/validation'
import type { Media } from '../../lib/types'

export interface ActionState { error: string }
async function generateCaption(bytes: Uint8Array, mime: string, prompt: string) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('Gemini is not configured. Add GEMINI_API_KEY or enter a caption manually.')
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({ contents: [{ parts: [{ text: `${prompt}\nReturn only one complete short caption, without markdown.` }, { inline_data: { mime_type: mime, data: Buffer.from(bytes).toString('base64') } }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 300 } }),
  })
  if (!response.ok) throw new Error('Gemini could not create a caption. Try again or enter a caption manually.')
  const body = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const caption = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim()
  if (!caption) throw new Error('Gemini returned an empty caption. Try another prompt.')
  return caption
}

export async function saveMedia(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireAdmin()
  let destination = '/media'
  let uploaded: string | null = null
  let saved = false
  try {
    const id = form.get('id') ? validId(form.get('id')) : null
    const generate = form.get('intent') === 'generate'
    const file = form.get('image')
    let bytes: Uint8Array | null = null
    let mime = ''
    let previous: Media | null = null
    if (id) {
      const { data, error } = await supabase.rpc('admin_get_media', { target: id })
      if (error || !data) throw new Error('Media not found.')
      previous = data as Media
    }
    if (file instanceof File && file.size > 0) {
      if (file.size > 8 * 1024 * 1024) throw new Error('Images must be 8 MB or smaller.')
      bytes = new Uint8Array(await file.arrayBuffer())
      mime = imageType(bytes)
    }
    if (!id && !bytes) throw new Error('Choose an image for the new media record.')
    if (generate) {
      if (!bytes) throw new Error('Select an image to generate a new caption.')
      const prompt = String(form.get('prompt') ?? '').trim()
      if (prompt.length < 5 || prompt.length > 2000) throw new Error('Prompt must contain 5–2,000 characters.')
      form.set('caption', await generateCaption(bytes, mime, prompt))
    }
    const input = mediaInput(form)
    if (bytes) {
      const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp'
      uploaded = `${user.id}/admin/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage.from('generated-media').upload(uploaded, bytes, { contentType: mime, upsert: false })
      if (error) throw new Error('Image upload failed. Please try again.')
    }
    const { data: mediaId, error } = await supabase.rpc('admin_save_media', {
      target: id, caption_text: input.caption, prompt_text: input.prompt, target_community: input.community_id, new_image_path: uploaded,
    })
    if (error) throw new Error('Media could not be saved. Check your access and try again.')
    saved = true
    destination = `/media/${validId(mediaId)}?saved=1`
    if (uploaded && previous && previous.image_path !== uploaded) {
      const { data: inUse, error: usageError } = await supabase.rpc('admin_media_path_in_use', { target_path: previous.image_path })
      if (usageError || inUse) {
        if (usageError) destination += `&warning=${encodeURIComponent('Saved, but the old image could not be checked for cleanup.')}`
      } else {
        const { error: cleanupError } = await supabase.storage.from('generated-media').remove([previous.image_path])
        if (cleanupError) destination += `&warning=${encodeURIComponent('Saved, but the previous image remains in storage. Retry cleanup in the Supabase dashboard.')}`
      }
    }
  } catch (error) {
    if (uploaded && !saved) await supabase.storage.from('generated-media').remove([uploaded])
    if (saved) destination += `&warning=${encodeURIComponent('The record was saved. Image cleanup could not complete.')}`
    else return { error: error instanceof Error ? error.message : 'Unable to save media.' }
  }
  revalidatePath('/', 'layout')
  redirect(destination)
}

export async function deleteMedia(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin()
  let destination = '/media?deleted=1'
  let deleted = false
  try {
    const id = validId(form.get('id'))
    if (form.get('confirmation') !== 'DELETE') throw new Error('Type DELETE to confirm permanent deletion.')
    const { data: path, error } = await supabase.rpc('admin_delete_media', { target: id })
    if (error) throw new Error('Media could not be deleted. Check your access and try again.')
    deleted = true
    const { data: inUse, error: usageError } = await supabase.rpc('admin_media_path_in_use', { target_path: path })
    if (!usageError && inUse === false) {
      const { error: cleanupError } = await supabase.storage.from('generated-media').remove([path])
      if (cleanupError) destination += `&warning=${encodeURIComponent('The record was deleted, but its image remains in storage. Retry cleanup in Supabase.')}`
    } else if (usageError) destination += `&warning=${encodeURIComponent('The record was deleted. Its image could not be checked for cleanup.')}`
  } catch (error) {
    if (deleted) destination += `&warning=${encodeURIComponent('The record was deleted. Storage cleanup did not complete.')}`
    else return { error: error instanceof Error ? error.message : 'Unable to delete media.' }
  }
  revalidatePath('/', 'layout')
  redirect(destination)
}
