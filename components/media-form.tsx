'use client'
import { useActionState, useState } from 'react'
import Link from 'next/link'
import { saveMedia, deleteMedia } from '../app/(admin)/media/actions'
import type { Community, Media } from '../app/lib/types'
import { MediaImage } from './media-image'

export function MediaForm({ media, communities }: { media?: Media; communities: Community[] }) {
  const [state, action, pending] = useActionState(saveMedia, { error: '' })
  const [deletion, deleteAction, deleting] = useActionState(deleteMedia, { error: '' })
  const [showDelete, setShowDelete] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  return <div className="editor-grid"><section className="panel"><form action={action}>
    <fieldset disabled={pending || deleting}>
      {media && <input name="id" type="hidden" value={media.id} />}
      <label htmlFor="image">{media ? 'Replace image (optional)' : 'Image'}</label><input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" required={!media} /><p className="field-help">PNG, JPEG, or WebP · up to 8 MB. Images remain in Melon’s private storage.</p>
      <label htmlFor="community">Community</label><select id="community" name="community_id" defaultValue={media?.community_id ?? ''}><option value="">Unassigned</option>{communities.map((c) => <option key={c.id} value={c.id}>{c.name}{c.visibility === 'private' ? ' (private)' : ''}</option>)}</select>
      <label htmlFor="prompt">AI prompt</label><textarea id="prompt" name="prompt" defaultValue={media?.prompt ?? 'Write a clever, warm caption that sparks a conversation.'} required minLength={5} maxLength={2000} rows={4} />
      <label htmlFor="caption">Caption</label><textarea id="caption" name="caption" defaultValue={media?.caption ?? ''} maxLength={2000} rows={4} placeholder="Enter a caption, or choose Generate & save below." /><p className="field-help">A caption is required when saving manually. Generating replaces this text.</p>
      {state.error && <p className="notice" role="alert">{state.error}</p>}
      <div className="form-buttons"><button className="button" name="intent" value="save" disabled={pending}>{pending ? 'Saving…' : media ? 'Save changes' : 'Create media'}</button><button className="button secondary" name="intent" value="generate" disabled={pending}>{pending ? 'Working…' : '✳ Generate & save'}</button><Link href="/media" className="text-link">Cancel</Link></div>
      {pending && <p role="status" className="field-help">Saving to Melon. AI generation can take a few moments.</p>}
    </fieldset>
  </form></section><aside><section className="panel preview-panel"><p className="eyebrow">{media ? 'CURRENT MEDIA' : 'PUBLISHING TO MELON'}</p>{media ? <MediaImage src={media.image_url} caption={media.caption} className="editor-preview" /> : <div className="new-media-art" aria-hidden="true">✳</div>}<p className="muted small-copy">{media ? 'Changes to the caption, community, or image appear in the same record in Melon. The original author is preserved.' : 'New media is attributed to your admin account. Private community media remains visible only to approved members and superadmins.'}</p>{media && <p className="footnote">Author ID<br /><code>{media.user_id}</code></p>}</section>
    {media && <section className="panel danger-zone"><p className="eyebrow">DANGER ZONE</p><h2>Remove this media</h2><p className="muted small-copy">Permanently removes this post, its votes, and comments from Melon. The image is removed if no other post uses it.</p>{showDelete ? <form action={deleteAction}><input type="hidden" name="id" value={media.id} /><label htmlFor="confirmation">Type DELETE to confirm</label><input id="confirmation" name="confirmation" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" required pattern="DELETE" />{deletion.error && <p role="alert" className="notice">{deletion.error}</p>}<div className="form-buttons"><button className="button danger" disabled={pending || deleting || confirmation !== 'DELETE'}>{deleting ? 'Deleting…' : 'Permanently delete'}</button><button className="text-button" type="button" disabled={deleting} onClick={() => setShowDelete(false)}>Cancel</button></div></form> : <button type="button" className="button secondary danger" disabled={pending} onClick={() => setShowDelete(true)}>Delete media</button>}</section>}
  </aside></div>
}
