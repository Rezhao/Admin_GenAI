import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: { default: 'Melon Admin', template: '%s · Melon Admin' }, description: 'The control room for Melon.', robots: { index: false, follow: false } }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
