'use client'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {isSectionLinkActive,sectionForPath} from '../app/lib/navigation'
export function SectionNav(){
 const path=usePathname(),section=sectionForPath(path)
 if(!section||section.links.length<2)return null
 return <section className="section-navigation"><div className="section-navigation-heading"><h2>{section.label}</h2><p>{section.description}</p></div><nav aria-label={`${section.label} sections`}>{section.links.map(link=><Link key={link.href} href={link.href} aria-current={isSectionLinkActive(link,path)?'page':undefined}>{link.label}</Link>)}</nav></section>
}
