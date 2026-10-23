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
  { slug: 'terms', title: 'Terms', singular: 'Term', group: 'Reference data', mode: 'crud', description: 'Manage vocabulary, meanings, and categories used in generation examples.', columns: ['term','definition','category','enabled'], fields: [text('term','Term'),long('definition','Definition'),text('category','Category',false),enabled] },
  { slug: 'examples', title: 'AI generation examples', singular: 'Example', group: 'Reference data', mode: 'crud', description: 'Curate prompt and caption pairs with optional image, chain, and term references.', columns: ['prompt','caption','prompt_chain_id','image_id'], fields: [long('prompt','Prompt'),long('caption','Example caption'),relation('image_id','Image','images'),relation('prompt_chain_id','Prompt chain','prompt-chains'),relation('term_id','Term','terms')] },
  { slug: 'providers', title: 'LLM providers', singular: 'Provider', group: 'Reference data', mode: 'crud', description: 'Manage provider names and HTTPS endpoints. Keep API credentials in server environment variables.', columns: ['name','base_url','enabled'], fields: [text('name','Provider name'),{ key:'base_url',label:'HTTPS API endpoint',type:'url',max:2000 },enabled] },
  { slug: 'models', title: 'LLM models', singular: 'Model', group: 'Reference data', mode: 'crud', description: 'Manage model identifiers, providers, and context-window sizes.', columns: ['name','provider_id','model_key','enabled'], fields: [text('name','Display name'),relation('provider_id','Provider','providers',true),text('model_key','API model identifier'),{ key:'context_window',label:'Context window (tokens)',type:'number',min:1,max:2147483647,step:'1' },enabled] },
  { slug: 'generation-requests', title: 'Generation requests', singular: 'Generation request', group: 'Generation activity', mode: 'read', description: 'Inspect recorded requests, their status, prompts, and resulting media.', columns: ['prompt','status','user_id','generation_id','created_at'], fields: [] },
  { slug: 'llm-responses', title: 'LLM responses', singular: 'LLM response', group: 'Generation activity', mode: 'read', description: 'Inspect recorded outputs, model references, token counts, and latency.', columns: ['response_text','generation_request_id','input_tokens','output_tokens','latency_ms'], fields: [] },
  { slug: 'images', title: 'Images', singular: 'Image', group: 'Generation activity', mode: 'crud', description: 'Upload and manage private reference images for generation examples.', columns: ['name','alt_text','mime_type','created_at'], fields: [text('name','Image name'),{key:'alt_text',label:'Alternative text',type:'textarea',max:2000}] },
  { slug: 'signup-domains', title: 'Allowed signup domains', singular: 'Signup domain', group: 'Signup access', mode: 'crud', description: 'Maintain allowed domains. These records do not change Melon’s existing signup policy until the signup flow uses them.', columns: ['domain','enabled','notes'], fields: [text('domain','Domain (for example, columbia.edu)',true,253),enabled,{key:'notes',label:'Notes',type:'textarea',max:2000}] },
  { slug: 'whitelisted-emails', title: 'Whitelisted emails', singular: 'Whitelisted email', group: 'Signup access', mode: 'crud', description: 'Maintain individual signup exceptions. Whitelisting an email does not grant admin privileges.', columns: ['email','enabled','notes'], fields: [{key:'email',label:'Email address',type:'email',required:true,max:254},enabled,{key:'notes',label:'Notes',type:'textarea',max:2000}] },
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
    if (!value) { if (field.required) throw new Error(`${field.label} is required.`); result[field.key] = field.key === 'alt_text' ? '' : null; continue }
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
