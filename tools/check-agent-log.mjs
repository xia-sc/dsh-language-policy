// Inspect one agent's session log: system prompt shape and instruction sources.
//
// Usage: node tools/check-agent-log.mjs <session.v4.jsonl.zstd>
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g

function readRecords(file) {
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
  const buf = readFileSync(file)
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
  return text
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
}

const file = process.argv[2]
if (!file) {
  console.error('usage: node tools/check-agent-log.mjs <session.v4.jsonl.zstd>')
  process.exit(2)
}

const records = readRecords(file)
const types = {}
for (const record of records) types[record.type] = (types[record.type] ?? 0) + 1
console.log('records:', records.length)
console.log('types:', types)

const sysRecs = records.filter((record) => record.type === 'system/message')
for (const [index, record] of sysRecs.entries()) {
  const prompt = record.data?.message?.content?.[0]?.text ?? ''
  console.log(`system/message[${index}]`, {
    length: prompt.length,
    hasPolicy: prompt.includes('语言策略'),
    hasPersona: prompt.includes('You are a coding agent powered by'),
    hasHarnessIdentity: prompt.includes('You are an AI agent powered by DeepSeek Harness'),
    cjkChars: (prompt.match(CJK) ?? []).length,
  })
}

const instructions = records.filter(
  (record) => record.type === 'user/message' && record.data?.source?.kind === 'agent-instructions',
)
console.log('agent-instructions user messages:', instructions.length)
for (const [index, record] of instructions.entries()) {
  const content = record.data?.content ?? []
  const text = content.map((part) => part?.text ?? '').join('\n')
  console.log(`instructions[${index}]`, {
    baseline: record.data?.source?.baseline,
    length: text.length,
    hasChinesePolicy: text.includes('内部推理一律使用中文') || text.includes('内部推理（思考、规划、分析）一律使用中文'),
    hasAgentsMdMarker: text.includes('全局工作区指令'),
    preview: text.slice(0, 160),
  })
}

const reasoning = []
for (const record of records) {
  if (record.type !== 'assistant/message') continue
  for (const block of record.data?.message?.content ?? []) {
    if (block?.type === 'reasoning' && typeof block.text === 'string') reasoning.push(block.text)
  }
}
const cjk = reasoning.reduce((sum, text) => sum + (text.match(CJK) ?? []).length, 0)
const latin = reasoning.reduce((sum, text) => sum + (text.match(/[A-Za-z]+/g) ?? []).length, 0)
console.log('reasoning blocks:', reasoning.length, {
  cjk,
  latinWords: latin,
  cjkRatio: cjk + latin === 0 ? null : Number((cjk / (cjk + latin)).toFixed(4)),
})
