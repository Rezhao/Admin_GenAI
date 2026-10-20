import { signIn } from '../auth/actions'

export default async function SignIn({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams
  return <main className="login">
    <div className="login-art" aria-hidden="true"><span className="orbit one" /><span className="orbit two" /><span className="orbit three" /><div className="login-mark">m<span>✳</span></div><p>A little order.<br />A lot of possibility.</p></div>
    <section className="login-panel"><div className="brand">melon<span className="brand-tag">ADMIN</span></div><p className="eyebrow">THE CONTROL ROOM</p><h1>A fresh perspective<br />on your community.</h1><p className="muted">Manage Melon’s media, meet your members, and see what’s resonating.</p>
      {reason && <p role="alert" className="notice">{reason === 'denied' ? 'This Google account does not have superadmin access. Switch accounts or ask the database owner to enable your profile.' : reason === 'setup' ? 'Admin database setup is not complete. Ask the database owner to apply the admin migration.' : 'Google sign-in did not complete. Please try again.'}</p>}
      <form action={signIn}><button className="button google" type="submit"><svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4h5.4a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5ZM12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2 .9-3.4.9-2.6 0-4.9-1.8-5.7-4.2H2.9v2.7A10 10 0 0 0 12 22ZM6.3 13.8A6 6 0 0 1 6 12c0-.6.1-1.2.3-1.8V7.5H2.9A10 10 0 0 0 2 12c0 1.6.3 3.1.9 4.5l3.4-2.7ZM12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.8 9.8 0 0 0 12 2a10 10 0 0 0-9.1 5.5l3.4 2.7A6 6 0 0 1 12 6Z" /></svg>Continue with Google</button></form>
      <p className="security-note">Google sign-in · Superadmins only<br />Access is checked against your live database profile.</p>
    </section></main>
}
