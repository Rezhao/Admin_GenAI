import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const store = await cookies()
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Configure the Melon Supabase URL and anon key before starting the admin app.')
  return createServerClient(url, key, {
    cookieOptions: { name: 'melon-admin-auth' },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)) }
        catch { /* Server Component writes are handled by proxy session refresh. */ }
      },
    },
  })
}

export function appOrigin() {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  const configured = process.env.APP_URL
  if (configured) return new URL(configured).origin
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3001'
  throw new Error('APP_URL must be configured for production OAuth.')
}
