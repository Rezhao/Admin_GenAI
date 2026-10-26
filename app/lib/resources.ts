export type Field = { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'boolean' | 'email' | 'url' | 'relation'; required?: boolean; max?: number; min?: number; step?: string; relation?: string; help?: string }
export type Resource = { slug: string; title: string; singular: string; group: string; mode: 'read' | 'update' | 'crud'; description: string; columns: string[]; fields: Field[] }
const enabled: Field = { key: 'enabled', label: 'Enabled', type: 'boolean' }
const text = (key: string, label: string, required = true, max = 200): Field => ({ key, label, type: 'text', required, max })
const long = (key: string, label: string, required = true): Field => ({ key, label, type: 'textarea', required, max: 10000 })
const relation = (key: string, label: string, resource: string, required = false): Field => ({ key, label, type: 'relation', relation: resource, required })
export const resources: Resource[] = [
  { slug: 'prompt-chains', title: 'Prompt chains', singular: 'Prompt chain', group: 'Prompt pipeline', mode: 'read', description: 'Inspect the chains configured for your generation pipeline.', columns: ['name','description','created_at'], fields: [] },
  { slug: 'prompt-chain-steps', title: 'Prompt chain steps', singular: 'Chain step', group: 'Prompt pipeline', mode: 'read', description: 'Inspect ordered instructions, model assignments, and temperatures.', columns: ['name','prompt_chain_id','step_order','llm_model_id'], fields: [] },
  { slug: 'prompt-chain-mix', title: 'Prompt chain mix', singular: 'Mix entry', group: 'Prompt pipeline', mode: 'update', description: 'Update selection weights and enabled states. Active weights are relative; a zero weight excludes a chain.', columns: ['prompt_chain_id','weight','enabled'], fields: [{ key: 'weight', label: 'Selection weight', type: 'number', required: true, min: 0, max: 1000000, step: 'any' }, enabled] },
  { slug: 'chain-runs', title: 'Prompt chain runs', singular: 'Prompt chain run', group: 'Prompt pipeline', mode: 'read', description: 'Inspect each execution of a workflow, its saved step configuration, outputs, and model responses.', columns: ['id','prompt_chain_id','status','created_at'], fields: [] },
  { slug: 'term-types', title: 'Term types', singular: 'Term type', group: 'Reference data', mode: 'crud', description: 'Organize vocabulary by part of speech or expression type.', columns: ['name','description','created_at'], fields: [text('name','Type name'),long('description','Description',false)] },
  { slug: 'terms', title: 'Terms', singular: 'Term', group: 'Reference data', mode: 'crud', description: 'Manage caption vocabulary with definitions, term types, usage examples, and priorities. Terms provide reference context for curated examples; adding a term does not automatically inject it into a prompt.', columns: ['term','definition','priority','enabled'], fields: [text('term','Term'),relation('term_type_id','Term type','term-types'),long('definition','Definition'),long('usage_example','Usage example',false),{key:'priority',label:'Priority (0–100)',type:'number',required:true,min:0,max:100,step:'1'},text('category','Category',false),enabled] },
  { slug: 'examples', title: 'AI generation examples', singular: 'Example', group: 'Reference data', mode: 'crud', description: 'Curate prompt and caption pairs with optional image, chain, and term references.', columns: ['prompt','caption','prompt_chain_id','image_id'], fields: [long('prompt','Prompt'),long('caption','Example caption'),relation('image_id','Image','images'),relation('prompt_chain_id','Prompt chain','prompt-chains'),relation('term_id','Term','terms')] },
  { slug: 'providers', title: 'LLM providers', singular: 'Provider', group: 'Reference data', mode: 'crud', description: 'Manage provider names and HTTPS endpoints. Keep API credentials in server environment variables.', columns: ['name','base_url','enabled','created_at','updated_at'], fields: [text('name','Provider name'),{ key:'base_url',label:'HTTPS API endpoint',type:'url',max:2000 },enabled] },
  { slug: 'models', title: 'LLM models', singular: 'Model', group: 'Reference data', mode: 'crud', description: 'Manage model identifiers, providers, and context-window sizes.', columns: ['name','provider_id','model_key','temperature_supported','created_at','updated_at'], fields: [text('name','Display name'),relation('provider_id','Provider','providers',true),text('model_key','API model identifier'),{key:'temperature_supported',label:'Supports temperature',type:'boolean'}, { key:'context_window',label:'Context window (tokens)',type:'number',min:1,max:2147483647,step:'1' },enabled] },
  { slug: 'generation-requests', title: 'Generation requests', singular: 'Generation request', group: 'Generation activity', mode: 'read', description: 'Inspect recorded requests, their status, prompts, and resulting media.', columns: ['prompt','status','source','user_id','generation_id','created_at'], fields: [] },
  { slug: 'llm-responses', title: 'LLM responses', singular: 'LLM response', group: 'Generation activity', mode: 'read', description: 'Inspect recorded outputs, model references, token counts, and latency.', columns: ['response_text','source','generation_request_id','input_tokens','output_tokens','latency_ms'], fields: [] },
  { slug: 'images', title: 'Images', singular: 'Image', group: 'Generation activity', mode: 'crud', description: 'View images from Melon posts and upload private reference images for generation examples.', columns: ['name','alt_text','mime_type','created_at'], fields: [text('name','Image name'),{key:'alt_text',label:'Alternative text',type:'textarea',max:2000}] },
  { slug: 'signup-domains', title: 'Allowed signup domains', singular: 'Signup domain', group: 'Signup access', mode: 'crud', description: 'New accounts must match an enabled domain or an enabled email exception. Existing accounts keep access. Enable the Melon Before User Created hook in Supabase after migration 006; an empty allowlist denies new signups.', columns: ['domain','enabled','notes'], fields: [text('domain','Domain (for example, columbia.edu)',true,253),enabled,{key:'notes',label:'Notes',type:'textarea',max:2000}] },
  { slug: 'whitelisted-emails', title: 'Whitelisted emails', singular: 'Whitelisted email', group: 'Signup access', mode: 'crud', description: 'Enabled exact email addresses can sign up even if their domain is not allowed. Existing accounts keep access. This does not grant admin privileges. Enforcement requires the Melon Before User Created hook in Supabase.', columns: ['email','enabled','notes'], fields: [{key:'email',label:'Email address',type:'email',required:true,max:254},enabled,{key:'notes',label:'Notes',type:'textarea',max:2000}] },
]
export function resourceBySlug(slug: string) { return resources.find(resource => resource.slug === slug) }
export function fieldLabel(key: string) { return key.replace(/_/g,' ').replace(/\b(llm|id|api)\b/gi, word => word.toUpperCase()).replace(/^./, c => c.toUpperCase()) }
export type CatalogRecord = { id: string; created_at?: string; image_url?: string; [key: string]: unknown }
export type RelationOption = { id: string; label: string }
export function resourceInput(resource: Resource, form: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of resource.fields) {
    let value = String(form.get(field.key) ?? '').trim()
    if (field.key === 'domain' || field.type === 'email') value = value.toLowerCase()
    if (field.type === 'boolean') { result[field.key] = form.get(field.key) === 'on'; continue }
    if (!value) { if (field.required) throw new Error(`${field.label} is required.`); result[field.key] = ['alt_text','description'].includes(field.key) ? '' : null; continue }
    if (field.type === 'number') {
      const number = Number(value)
      if (!Number.isFinite(number) || (field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max) || (field.step === '1' && !Number.isInteger(number))) throw new Error(`${field.label} is outside the allowed range.`)
      result[field.key] = number; continue
    }
    if (value.length > (field.max ?? 10000)) throw new Error(`${field.label} is too long.`)
    if (field.type === 'relation' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error(`Choose a valid ${field.label.toLowerCase()}.`)
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Enter a valid email address.')
    if (field.key === 'domain' && !/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) throw new Error('Enter a domain without https://, paths, or an @ sign.')
    if (field.type === 'url') { try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) throw Error() } catch { throw new Error('Enter an HTTPS URL without embedded credentials.') } }
    result[field.key] = value
  }
  return result
}

export function sourceLabel(value: unknown) {
  const labels: Record<string,string> = { live:'Live generation', media_backfill:'Imported saved post', saved_post:'Saved post', saved_caption:'Saved caption' }
  return labels[String(value)] ?? String(value ?? '—')
}
