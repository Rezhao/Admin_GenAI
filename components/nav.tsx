'use client'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {adminSections,sectionForPath} from '../app/lib/navigation'
export function Nav(){
 const path=usePathname(),active=sectionForPath(path)
 return <nav aria-label="Admin navigation">{adminSections.map(section=><Link key={section.id} href={section.links[0].href} aria-current={active?.id===section.id?'page':undefined}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={section.icon}/></svg>{section.label}<span aria-hidden="true">↗</span></Link>)}</nav>
}
