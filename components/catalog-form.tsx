'use client'
import { useActionState, useState } from 'react'
import Link from 'next/link'
import { saveCatalog, deleteCatalog, searchRelations } from '../app/(admin)/manage/actions'
import { fieldLabel, type Resource, type CatalogRecord, type RelationOption } from '../app/lib/resources'
import { MediaImage } from './media-image'
function RelationField({name,resource,initial,options,required}:{name:string;resource:string;initial:string;options:RelationOption[];required?:boolean}) {
  const [choices,setChoices] = useState(options)
  const [selected,setSelected] = useState(initial)
  const [query,setQuery] = useState('')
  const [message,setMessage] = useState('')
  const [busy,setBusy] = useState(false)
  async function search() {
    setBusy(true);setMessage('')
    try {setChoices(await searchRelations(resource,query))} catch {setMessage('Could not search related records. Try again.')} finally {setBusy(false)}
  }
  return <><div className="relation-search"><input aria-label={`Search ${fieldLabel(name)}`} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name or ID…" maxLength={200}/><button type="button" className="button secondary small" onClick={search} disabled={busy}>{busy?'Searching…':'Find'}</button></div><select id={name} name={name} value={selected} onChange={e=>setSelected(e.target.value)} required={required}><option value="">{required?'Select a record':'None'}</option>{selected && !choices.some(option=>option.id===selected) && <option value={selected}>Current selection · {selected}</option>}{choices.map(option=><option key={option.id} value={option.id}>{option.label} · {option.id.slice(0,8)}</option>)}</select><p className="field-help">Showing up to 50 matches. Search by name or full ID to find another record.</p>{message && <p role="alert" className="notice">{message}</p>}</>
}
export function CatalogForm({resource,record,options}:{resource:Resource;record?:CatalogRecord;options:Record<string,RelationOption[]>}) {
  const [state,action,pending] = useActionState(saveCatalog,{error:''})
  const [deletion,deleteAction,deleting] = useActionState(deleteCatalog,{error:''})
  const [showDelete,setShowDelete] = useState(false)
  const base = `/manage/${resource.slug}`
  return <div className="editor-grid"><section className="panel"><form action={action}><fieldset disabled={pending||deleting}><input type="hidden" name="resource" value={resource.slug}/>{record && <input type="hidden" name="id" value={record.id}/>}
    {resource.slug==='images' && <><label htmlFor="image">{record?'Replace image (optional)':'Upload image'}</label><input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" required={!record}/><p className="field-help">PNG, JPEG, or WebP · up to 3 MB. Private storage with previews that expire after five minutes.</p></>}
    {resource.fields.map(field=><div key={field.key} className="catalog-field"><label htmlFor={field.key}>{field.label}{field.required?' *':''}</label>{field.type==='boolean'?<select id={field.key} name={field.key} defaultValue={record?.[field.key]===false?'off':'on'}><option value="on">Enabled</option><option value="off">Disabled</option></select>:field.type==='relation'?<RelationField name={field.key} resource={field.relation!} initial={String(record?.[field.key]??'')} options={options[field.key]??[]} required={field.required}/>:field.type==='textarea'?<textarea id={field.key} name={field.key} rows={5} required={field.required} maxLength={field.max} defaultValue={String(record?.[field.key]??'')}/>:<input id={field.key} name={field.key} type={field.type} required={field.required} min={field.min} max={field.max} step={field.step} maxLength={field.max} defaultValue={String(record?.[field.key]??'')}/>} {field.help && <p className="field-help">{field.help}</p>}</div>)}
    {state.error && <p role="alert" className="notice">{state.error}</p>}<div className="form-buttons"><button className="button" disabled={pending}>{pending?'Saving…':record?'Save changes':`Create ${resource.singular.toLowerCase()}`}</button><Link href={base} className="text-link">Cancel</Link></div></fieldset></form></section><aside><section className="panel"><p className="eyebrow">{record?'EXISTING RECORD':'NEW RECORD'}</p>{resource.slug==='images' && record && <MediaImage src={record.image_url} caption={String(record.alt_text||record.name)} className="editor-preview"/>}<p className="muted">{resource.description}</p>{record && <p className="footnote">Record ID<br/><code>{record.id}</code></p>}{resource.slug==='prompt-chain-mix' && <p className="footnote">Chain<br/><Link className="text-link" href={`/manage/prompt-chains/${record?.prompt_chain_id}`}>{String(record?.prompt_chain_id)}</Link></p>}</section>
    {record && resource.mode==='crud' && <section className="panel danger-zone"><p className="eyebrow">PERMANENT DELETION</p><h2>Delete this {resource.singular.toLowerCase()}</h2><p className="muted small-copy">Records referenced elsewhere cannot be deleted until those references are removed.</p>{showDelete?<form action={deleteAction}><fieldset disabled={pending||deleting}><input type="hidden" name="resource" value={resource.slug}/><input type="hidden" name="id" value={record.id}/><label htmlFor="confirmation">Type DELETE to confirm</label><input id="confirmation" name="confirmation" required pattern="DELETE" autoComplete="off"/>{deletion.error && <p className="notice" role="alert">{deletion.error}</p>}<div className="form-buttons"><button className="button danger">{deleting?'Deleting…':'Permanently delete'}</button><button className="text-button" type="button" onClick={()=>setShowDelete(false)}>Cancel</button></div></fieldset></form>:<button className="button secondary danger" type="button" disabled={pending} onClick={()=>setShowDelete(true)}>Delete record</button>}</section>}
  </aside></div>
}
