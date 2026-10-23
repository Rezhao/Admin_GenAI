import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
const source = stripTypeScriptTypes(await readFile(new URL('../app/lib/resources.ts',import.meta.url),'utf8'),{mode:'transform',disableExperimentalWarning:true})
const {resourceBySlug,resourceInput}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const form = values => { const result = new FormData(); for(const [key,value] of Object.entries(values)) result.set(key,value); return result }
test('signup values are normalized and malformed domains/emails are rejected',()=>{
  assert.equal(resourceInput(resourceBySlug('signup-domains'),form({domain:' Columbia.EDU ',enabled:'on'})).domain,'columbia.edu')
  for(const domain of ['https://columbia.edu','user@columbia.edu','example.com/path','-bad.com','example..com']) assert.throws(()=>resourceInput(resourceBySlug('signup-domains'),form({domain})))
  assert.equal(resourceInput(resourceBySlug('whitelisted-emails'),form({email:' TA@Columbia.edu '})).email,'ta@columbia.edu')
  assert.throws(()=>resourceInput(resourceBySlug('whitelisted-emails'),form({email:'bad email'})))
})
test('chain weights reject invalid numbers, retain zero, and never accept caller-supplied chain IDs',()=>{
  const resource=resourceBySlug('prompt-chain-mix')
  for(const weight of ['NaN','-1','Infinity','1000001']) assert.throws(()=>resourceInput(resource,form({weight})))
  assert.deepEqual(resourceInput(resource,form({weight:'0',enabled:'on',prompt_chain_id:'injected'})),{weight:0,enabled:true})
})
test('references and integer model limits are validated',()=>{
  const resource=resourceBySlug('models')
  assert.throws(()=>resourceInput(resource,form({name:'Model',model_key:'key',provider_id:'bad'})))
  assert.throws(()=>resourceInput(resource,form({name:'Model',model_key:'key',provider_id:'10000000-0000-0000-0000-000000000001',context_window:'1.5'})))
})
test('provider URLs cannot carry credentials or unsupported protocols',()=>{
  for(const base_url of ['http://example.com','javascript:alert(1)','https://name:secret@example.com']) assert.throws(()=>resourceInput(resourceBySlug('providers'),form({name:'Provider',base_url})))
})
