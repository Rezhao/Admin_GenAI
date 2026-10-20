import Link from 'next/link'
import { requireAdmin } from '../lib/auth'
import { signOut } from '../auth/actions'
import { Nav } from '../../components/nav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin()
  return <div className="shell"><aside className="sidebar"><Link href="/" className="brand">melon<span className="brand-tag">ADMIN</span></Link><p className="sidebar-caption">A fresh look behind the scenes.</p><Nav /><div className="sidebar-bottom"><span className="status-dot" />Connected to Melon<p>Changes here update your live community.</p></div></aside><div className="workspace"><header className="topbar"><span className="topbar-label">Your community, in focus.</span><div className="account"><span className="role">SUPERADMIN</span><span className="account-email">{user.email}</span><form action={signOut}><button className="text-button">Sign out ↗</button></form></div></header><main className="main">{children}</main></div></div>
}
