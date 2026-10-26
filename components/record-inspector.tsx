import Link from 'next/link'
import type { CatalogRecord } from '../app/lib/resources'
import { fieldLabel,sourceLabel } from '../app/lib/resources'
import type { InspectionContext } from '../app/lib/catalog'
import { MediaImage } from './media-image'
const references:Record<string,string>={prompt_chain_id:'prompt-chains',llm_model_id:'models',provider_id:'providers',term_id:'terms',term_type_id:'term-types',image_id:'images',generation_request_id:'generation-requests',prompt_chain_step_id:'prompt-chain-steps'}
export function timestamp(value:unknown) {
  if(!value) return 'Not recorded'
  const date=new Date(String(value))
  return Number.isNaN(date.getTime())?String(value):date.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'})+' UTC'
}
export function Value({name,value,labels={}}:{name:string;value:unknown;labels?:Record<string,string>}) {
  if(value===null||value===undefined||value==='') return <>—</>
  const text=labels[name]||String(value)
  if(references[name]) return <Link className="text-link" href={`/manage/${references[name]}/${value}`}>{text} ↗</Link>
  if(name==='generation_id') return <Link className="text-link" href={`/media/${value}`}>View post ↗</Link>
  if(['user_id','created_by','updated_by'].includes(name)) return <Link className="text-link" href={`/profiles?q=${encodeURIComponent(String(value))}`}>{text} ↗</Link>
  if(name.endsWith('_at')) return <>{timestamp(value)}</>
  if(name==='source') return <>{sourceLabel(value)}</>
  if(typeof value==='boolean') return <>{value?'Yes':'No'}</>
  return <>{typeof value==='object'?JSON.stringify(value,null,2):String(value)}</>
}
export function RecordMetadata({record,labels={}}:{record:CatalogRecord;labels?:Record<string,string>}) {
  return <section className="panel"><p className="eyebrow">RECORD HISTORY</p><dl className="record-details compact-details">{['id','created_at','created_by','updated_at','updated_by'].map(key=><div key={key}><dt>{fieldLabel(key)}</dt><dd>{['created_by','updated_by'].includes(key)&&!record[key]?'Not recorded':<Value name={key} value={record[key]} labels={labels}/>}</dd></div>)}</dl></section>
}
function Prompt({title,text}:{title:string;text:unknown}) {
  if(text===null||text===undefined) return <p className="field-help">{title}: not recorded</p>
  let content=String(text)
  try {content=JSON.stringify(JSON.parse(content),null,2)} catch { /* Plain text is the normal caption response. */ }
  return <details className="prompt-disclosure" open={title==='Model response'}><summary>{title}</summary><pre>{content||'(No additional instructions)'}</pre></details>
}
function Steps({steps,snapshot=false}:{steps:CatalogRecord[];snapshot?:boolean}) {
  return <div className="step-grid">{steps.map((step,index)=><article className="panel step-card" key={step.id||index}><p className="eyebrow">STEP {String(step.step_order??step.order??index+1)}</p><h3>{String(step.name||'Generate caption')}</h3><dl className="record-details compact-details">{[['Model',step.model_name||step.model_key],['API model ID',step.model_key],['Input','Image and text'],['Output','Text'],['Temperature',step.temperature_supported===false?'Unsupported':step.temperature??'Not recorded']].map(([label,value])=><div key={String(label)}><dt>{String(label)}</dt><dd>{String(value??'Not recorded')}</dd></div>)}</dl><Prompt title="System instructions" text={step.system_prompt}/><Prompt title="User prompt template" text={step.user_prompt}/>{!snapshot&&<Link className="text-link" href={`/manage/prompt-chain-steps/${step.id}`}>View step record ↗</Link>}</article>)}</div>
}
export function RecordInspector({slug,record,context}:{slug:string;record:CatalogRecord;context:InspectionContext|null}) {
  const labels=context?.labels??{}
  const request=context?.request
  const snapshots=Array.isArray(request?.execution_plan)?request.execution_plan as CatalogRecord[]:[]
  return <div className="inspector-stack">
    {!context&&<p className="notice">Apply migration 006 to enable the linked record inspector.</p>}
    {context?.chain&&<><section className="panel"><p className="eyebrow">WORKFLOW DEFINITION</p><h2>{String(context.chain.name)}</h2><p>{String(context.chain.description||'')}</p><p className="muted">{context.steps?.length??0} ordered steps · {context.run_count??0} recorded runs</p>{context.mix&&<Link className="button secondary small" href={`/manage/prompt-chain-mix/${context.mix.id}`}>Edit selection weight · {String(context.mix.weight)}</Link>}</section><h2>Ordered chain steps</h2><Steps steps={context.steps??[]}/><section className="panel"><div className="panel-heading"><h2>Recent runs</h2><Link className="text-link" href={`/manage/chain-runs?q=${context.chain.id}`}>View all ↗</Link></div>{context.runs?.length?<div className="table-scroll"><table><thead><tr><th>Run / request ID</th><th>Status</th><th>Created</th><th>Output</th></tr></thead><tbody>{context.runs.map(run=><tr key={run.id}><td><Link className="text-link" href={`/manage/chain-runs/${run.id}`}>{run.id.slice(0,8)}… ↗</Link></td><td>{String(run.status)}</td><td>{timestamp(run.created_at)}</td><td><Value name="generation_id" value={run.generation_id}/></td></tr>)}</tbody></table></div>:<p className="muted">No runs recorded for this workflow yet.</p>}</section></>}
    {request&&<><section className="panel"><p className="eyebrow">{slug==='chain-runs'?'WORKFLOW EXECUTION':'GENERATION REQUEST'}</p><h2>{String(request.status)}</h2><p className="footnote">Run / request ID: <code>{request.id}</code></p><div className="inspection-stats"><div><strong>{context?.media?1:0}</strong><span>Saved posts</span></div><div><strong>{context?.responses?.length??0}</strong><span>Model responses</span></div><div><strong>{snapshots.length}</strong><span>Planned steps</span></div></div><dl className="record-details">{['created_at','completed_at','prompt_chain_id','user_id','community_id','source'].map(key=><div key={key}><dt>{fieldLabel(key)}</dt><dd><Value name={key} value={request[key]} labels={context?.request_labels}/></dd></div>)}<div><dt>User email</dt><dd>{context?.profile?.email||'Not recorded'}</dd></div><div><dt>Caption direction</dt><dd>{String(request.prompt)}</dd></div></dl>{Boolean(request.error_message)&&<p className="notice" role="status">{String(request.error_message)}</p>}{slug!=='generation-requests'&&<Link className="text-link" href={`/manage/generation-requests/${request.id}`}>View generation request ↗</Link>}</section>
    {context?.media&&<section className="panel"><div className="panel-heading"><h2>Image and generated caption</h2><Link className="text-link" href={`/media/${context.media.id}`}>View post ↗</Link></div><MediaImage src={context.media.image_url} caption={String(context.media.caption)} className="request-image"/><p className="generated-caption">{String(context.media.caption)}</p></section>}
    {snapshots.length>0&&<><h2>Workflow configuration snapshot</h2><p className="muted small-copy">Configuration captured when this request began. Later edits to the workflow do not change this snapshot.</p><Steps steps={snapshots} snapshot/></>}
    <h2>LLM responses</h2>{context?.responses?.length?[...context.responses].sort((a,b)=>Number((a.step_snapshot as CatalogRecord|undefined)?.order??999)-Number((b.step_snapshot as CatalogRecord|undefined)?.order??999)).filter(response=>slug!=='llm-responses'||response.id===record.id).map(response=>{
      const step=response.step_snapshot as CatalogRecord|undefined
      return <section className="panel response-card" key={response.id}><div className="panel-heading"><h3>{String(step?.model_key||response.model_name||'Saved caption · original model unknown')}</h3><Link className="text-link" href={`/manage/llm-responses/${response.id}`}>Response record ↗</Link></div><p className="footnote">{timestamp(response.created_at)} · {response.latency_ms===null?'Timing not recorded':`${Number(response.latency_ms)/1000}s`} · {String(response.input_tokens??'—')} input / {String(response.output_tokens??'—')} output tokens</p><p className="footnote">Temperature: {step?.temperature_supported===false?'Unsupported':String(step?.temperature??'Not recorded')}</p><Prompt title="System instructions" text={step?.system_prompt}/><Prompt title="User prompt template" text={step?.user_prompt}/><Prompt title="Submitted prompt (exact combined text)" text={response.submitted_prompt}/><Prompt title="Model response" text={response.response_text}/></section>
    }):<p className="empty">No responses recorded yet.</p>}</>}
    {!request&&!context?.chain&&<section className="panel"><dl className="record-details">{Object.entries(record).filter(([key])=>!['image_url','reference_labels'].includes(key)).map(([key,value])=><div key={key}><dt>{fieldLabel(key)}</dt><dd><Value name={key} value={value} labels={labels}/></dd></div>)}</dl></section>}
    <RecordMetadata record={record} labels={labels}/>
  </div>
}
