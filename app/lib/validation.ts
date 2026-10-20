export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validId(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new Error('Invalid record ID.')
  return value
}
export function mediaInput(form: FormData) {
  const caption = String(form.get('caption') ?? '').trim()
  const prompt = String(form.get('prompt') ?? '').trim()
  if (!caption || caption.length > 2000) throw new Error('Caption must contain 1–2,000 characters.')
  if (prompt.length < 5 || prompt.length > 2000) throw new Error('Prompt must contain 5–2,000 characters.')
  return { caption, prompt, community_id: form.get('community_id') ? validId(form.get('community_id')) : null }
}
export function pageNumber(input: unknown) {
  const page = Number(input ?? 1)
  return Number.isInteger(page) && page > 0 && page <= 100000 ? page : 1
}
export function safeReturnPath(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/'
}
export function imageType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'image/webp'
  throw new Error('Upload a valid PNG, JPEG, or WebP image.')
}
