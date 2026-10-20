import Link from 'next/link'
import { getCommunities } from '../../../lib/data'
import { MediaForm } from '../../../../components/media-form'

export default async function NewMedia() {
  const communities = await getCommunities()
  return <><Link className="text-link" href="/media">← Media library</Link><div className="page-heading"><div><p className="eyebrow">MAKE SOMETHING NEW</p><h1>A fresh addition.</h1><p className="muted">Upload media with its caption, or ask Gemini to write one. This publishes directly to Melon.</p></div></div><MediaForm communities={communities} /></>
}
