// Dump assistant message content block types (reasoning/text/tool-call) per log.
//
// Usage: node tools/dump-messages.mjs <session.v4.jsonl.zstd>
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const buf = readFileSync(process.argv[2])
let text = ''
let off = 0
for (;;) {
  const idx = buf.indexOf(magic, off)
  if (idx < 0) break
  try {
    text += zstdDecompressSync(buf.subarray(idx)).toString('utf8')
  } catch {}
  off = idx + 4
}
const records = text
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line)
    } catch {
      return null
    }
  })
  .filter(Boolean)

for (const record of records) {
  if (record.type !== 'assistant/message') continue
  const content = record.data?.message?.content ?? []
  const summary = content.map((block) => {
    const type = block?.type ?? '?'
    if (type === 'reasoning' || type === 'text') return `${type}:${(block.text ?? '').length}`
    if (type === 'tool-call') return `tool-call:${block.name}`
    return type
  })
  console.log(`t${record.data?.turn}/s${record.data?.step}`, summary.join(', '))
}
