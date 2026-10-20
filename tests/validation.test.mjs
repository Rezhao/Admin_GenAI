import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
const source = stripTypeScriptTypes(await readFile(new URL('../app/lib/validation.ts', import.meta.url), 'utf8'), { mode: 'transform', disableExperimentalWarning: true })
const { validId, mediaInput, pageNumber, imageType } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('rejects malformed IDs before database calls', () => {
  assert.throws(() => validId('1 or 1=1'))
  assert.throws(() => validId(null))
  assert.equal(validId('10000000-0000-0000-0000-000000000001'), '10000000-0000-0000-0000-000000000001')
})
test('media validation trims text and rejects blank captions / invalid communities', () => {
  const data = new FormData(); data.set('caption', '   '); data.set('prompt','valid prompt')
  assert.throws(() => mediaInput(data))
  data.set('caption',' A caption '); data.set('community_id','spoofed')
  assert.throws(() => mediaInput(data))
  data.delete('community_id')
  assert.deepEqual(mediaInput(data), { caption:'A caption', prompt:'valid prompt', community_id:null })
})
test('pagination rejects unbounded and noninteger inputs', () => {
  for (const input of ['-5','1.5','Infinity','100001','0','nope']) assert.equal(pageNumber(input),1)
  assert.equal(pageNumber('12'),12)
})
test('image validation checks content signatures, not client filenames or MIME types', () => {
  assert.equal(imageType(new Uint8Array([137,80,78,71,13,10,26,10])), 'image/png')
  assert.equal(imageType(new Uint8Array([255,216,255,224])), 'image/jpeg')
  assert.throws(() => imageType(new TextEncoder().encode('<svg onload="alert(1)">')))
  assert.throws(() => imageType(new TextEncoder().encode('<!doctype html>')))
})
