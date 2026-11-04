/**
 * Static smoke checks — run without starting DSH.
 *
 * Covers the export shape, the registered section (name/order/text/literal), the
 * config switches, order fallbacks, the bundle patch, and the package manifest.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULT_TEXT, SECTION_NAME, apply, inject, name } from '../index.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

let failures = 0

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`ok   ${label}`)
    return
  }
  failures += 1
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
}

/** Minimal stand-in for the prompt registry plus the Cordis effect lifetime. */
function createContext({ order = 10200, throwOnOrder = false } = {}) {
  const sections = []
  const effects = []
  const ctx = {
    systemPrompt: {
      getSectionOrder(key) {
        if (throwOnOrder) throw new Error('unknown placement key')
        return key === 'DEPLOYMENT_PERSONA_SUFFIX' ? order : Number.NaN
      },
      section(section) {
        sections.push(section)
        return () => {}
      },
    },
    effect(callback) {
      const dispose = callback()
      effects.push(dispose)
      return dispose
    },
  }
  return { ctx, sections, effects }
}

// --- exports ---------------------------------------------------------------
check('export name', name === 'dsh-language-policy', name)
check('inject includes systemPrompt', Array.isArray(inject) && inject.includes('systemPrompt'))
check('apply is a function', typeof apply === 'function')
check('section name uses the policy: prefix', SECTION_NAME.startsWith('policy:'))
check('default text names internal reasoning', DEFAULT_TEXT.includes('内部推理'))
check('default text names Simplified Chinese', DEFAULT_TEXT.includes('简体中文'))
check('default text has no template groups', !DEFAULT_TEXT.includes('{{'))

// --- registration ----------------------------------------------------------
const registered = createContext()
apply(registered.ctx)
check('registers exactly one section', registered.sections.length === 1, String(registered.sections.length))
const section = registered.sections[0] ?? {}
check('registered section name', section.name === SECTION_NAME)
check('registered order is persona-suffix + 1', section.order === 10201, String(section.order))
check('registered text is the default policy', section.text === DEFAULT_TEXT)
check('registered section is literal', section.interpolate === false)
check('registration is wrapped in one effect', registered.effects.length === 1)

const disabled = createContext()
apply(disabled.ctx, { enabled: false })
check('enabled:false registers nothing', disabled.sections.length === 0)

const custom = createContext()
apply(custom.ctx, { text: '自定义策略文本' })
check('config.text replaces the default', custom.sections[0]?.text === '自定义策略文本')

const blank = createContext()
apply(blank.ctx, { text: '   ' })
check('blank config.text falls back to the default', blank.sections[0]?.text === DEFAULT_TEXT)

const unknown = createContext({ order: Number.NaN })
apply(unknown.ctx)
check('unknown placement key falls back to 10201', unknown.sections[0]?.order === 10201)

const throwing = createContext({ throwOnOrder: true })
apply(throwing.ctx)
check('throwing placement lookup falls back to 10201', throwing.sections[0]?.order === 10201)

// --- bundle patch ----------------------------------------------------------
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
check('patch inserts a row', /^\s*-\s*insert:/m.test(patch))
check('patch inserts this package', patch.includes('@xia-sc/dsh-language-policy'))
check('patch uses exactly one insert block', (patch.match(/^\s*-\s*insert:/gm) ?? []).length === 1)
check('patch never overrides a row', !/^\s*-\s*override:/m.test(patch))
check('patch never mentions the system-prompt package', !patch.includes('@deepseek-ai/dsh-system-prompt'))

// --- manifest --------------------------------------------------------------
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
check('manifest declares the bundle patch', pkg?.dsh?.bundle?.patch === './cordis.patch.yml')
check('manifest has no runtime dependencies', !pkg.dependencies || Object.keys(pkg.dependencies).length === 0)
check('manifest lists a dsh engine range', typeof pkg?.engines?.dsh === 'string')
check(
  'manifest exports locale resources and the icon',
  pkg?.exports?.['./locale/*.json'] === './locale/*.json' && pkg?.exports?.['./icon'] === './icon.svg',
)
check('manifest files include runtime files, locales and icon', [
  'index.js',
  'cordis.patch.yml',
  'locale/*.json',
  'icon.svg',
].every((entry) => pkg.files?.includes(entry)))

for (const locale of ['en', 'zh']) {
  const parsed = JSON.parse(readFileSync(join(root, 'locale', `${locale}.json`), 'utf8'))
  check(
    `locale/${locale}.json has meta title and description`,
    typeof parsed?.meta?.title === 'string' && typeof parsed?.meta?.description === 'string',
  )
}

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed`)
  process.exit(1)
}
console.log('\nall smoke checks passed')
