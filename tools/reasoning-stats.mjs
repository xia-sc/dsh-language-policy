// Reasoning language statistics for one session log.
//
// Usage: node tools/reasoning-stats.mjs <session.v4.jsonl.zstd> [--detail]
//
// Counts CJK characters against Latin words inside every reasoning block, which
// is the metric the plan uses ("reasoning 块中 CJK 字符 vs 英文单词数").
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g
const LATIN_WORD = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g

function zstdFrames(buf) {
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
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
}

function languageStats(text) {
  const cjk = (text.match(CJK) ?? []).length
  const latinWords = (text.match(LATIN_WORD) ?? []).length
  const total = cjk + latinWords
  return {
    cjk,
    latinWords,
    cjkRatio: total === 0 ? null : cjk / total,
  }
}

function percent(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`
}

const file = process.argv[2]
const detail = process.argv.includes('--detail')
if (!file) {
  console.error('usage: node tools/reasoning-stats.mjs <session.v4.jsonl.zstd> [--detail]')
  process.exit(2)
}

const records = zstdFrames(readFileSync(file))
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

const reasoningBlocks = []
for (const record of records) {
  if (record.type !== 'assistant/message') continue
  const content = record.data?.message?.content
  if (!Array.isArray(content)) continue
  for (const block of content) {
    if (block?.type !== 'reasoning' || typeof block.text !== 'string') continue
    reasoningBlocks.push({
      turn: record.data?.turn,
      step: record.data?.step,
      text: block.text,
    })
  }
}

const totals = { cjk: 0, latinWords: 0, chars: 0 }
if (detail) {
  console.log('turn/step  chars  cjk  latinWords  cjkRatio')
}
for (const block of reasoningBlocks) {
  const s = languageStats(block.text)
  totals.cjk += s.cjk
  totals.latinWords += s.latinWords
  totals.chars += block.text.length
  if (detail) {
    console.log(
      `t${block.turn}/s${block.step}  ${block.text.length}  ${s.cjk}  ${s.latinWords}  ${percent(s.cjkRatio)}`,
    )
  }
}
const total = totals.cjk + totals.latinWords
const summary = {
  file,
  reasoningBlocks: reasoningBlocks.length,
  chars: totals.chars,
  cjk: totals.cjk,
  latinWords: totals.latinWords,
  cjkRatio: total === 0 ? null : totals.cjk / total,
}
if (detail) console.log('')
console.log(JSON.stringify(summary, null, 2))
