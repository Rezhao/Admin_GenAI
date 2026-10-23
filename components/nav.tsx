'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { resources } from '../app/lib/resources'
const items = [
  { href: '/', name: 'Overview', icon: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z' },
  { href: '/profiles', name: 'People', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0' },
  { href: '/media', name: 'Media library', icon: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M3 17l6-6 4 4 3-3 5 5 M9 7h.01' },
  { href: '/ratings', name: 'Ratings', icon: 'M8 14v7H3v-7z M15 3v18h-5V3z M22 9v12h-5V9z' },
]
export function Nav() {
  const path = usePathname()
  return <nav aria-label="Admin navigation">{items.map((item) => <Link key={item.href} href={item.href} aria-current={(item.href === '/' ? path === '/' : path.startsWith(item.href)) ? 'page' : undefined}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon} /></svg>{item.name}<span>↗</span></Link>)}<Link href="/manage" aria-current={path === '/manage' ? 'page' : undefined}>Generation console<span>↗</span></Link>{Array.from(new Set(resources.map(resource => resource.group))).map(group => <section className="nav-group" key={group}><h2>{group}</h2>{resources.filter(resource => resource.group === group).map(resource => <Link href={`/manage/${resource.slug}`} key={resource.slug} aria-current={path === `/manage/${resource.slug}` || path.startsWith(`/manage/${resource.slug}/`) ? 'page' : undefined}>{resource.title}<span>↗</span></Link>)}</section>)}</nav>
}
