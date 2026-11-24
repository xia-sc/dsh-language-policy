/**
 * Static smoke checks — run without starting DSH.
 *
 * Covers the export shape, all three registered sections, the per-step runtime
 * reminder, the live switches and their persistence, the config switches, order
 * fallbacks, the bundle patch, and the package manifest.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Isolate the plugin's own state file before importing it.
const home = mkdtempSync(join(tmpdir(), 'dsh-language-policy-'))
process.env.DSH_HOME = home

const {
  DEFAULT_TEXT,
  LEAD_SECTION_NAME,
  LEAD_TEXT,
  REMINDER_NAME,
  REMINDER_TEXT,
  SECTION_NAME,
  TEAM_SECTION_NAME,
  TEAM_TEXT,
  apply,
  configFile,
  inject,
  name,
  readState,
  setState,
} = await import('../index.js')

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
function createContext({ order = 10200, throwOnOrder = false, teamOrder = Number.NaN } = {}) {
  const sections = []
  const contexts = []
  const effects = []
  const ctx = {
    systemPrompt: {
      getSectionOrder(key) {
        if (throwOnOrder) throw new Error('unknown placement key')
        if (key === 'DEPLOYMENT_PERSONA_SUFFIX') return order
        if (key === 'TEAM_POLICY') return teamOrder
        return Number.NaN
      },
      section(section) {
        sections.push(section)
        return () => {}
      },
      context(context) {
        contexts.push(context)
        return () => {}
      },
    },
    effect(callback) {
      const dispose = callback()
      effects.push(dispose)
      return dispose
    },
  }
  return { ctx, sections, contexts, effects }
}

function byName(list, sectionName) {
  return list.find((entry) => entry.name === sectionName) ?? {}
}

function textOf(entry) {
  return typeof entry.text === 'function' ? entry.text({}) : entry.text
}

// --- exports ---------------------------------------------------------------
check('export name', name === 'dsh-language-policy', name)
check('inject includes systemPrompt', Array.isArray(inject) && inject.includes('systemPrompt'))
check('apply is a function', typeof apply === 'function')
check('section names use the policy: prefix', [
  SECTION_NAME,
  LEAD_SECTION_NAME,
  TEAM_SECTION_NAME,
  REMINDER_NAME,
].every((entry) => entry.startsWith('policy:')))
check('default text names internal reasoning', DEFAULT_TEXT.includes('内部推理'))
check('default text names Simplified Chinese', DEFAULT_TEXT.includes('简体中文'))
check('default text has no template groups', !DEFAULT_TEXT.includes('{{'))
check('lead text has no template groups', !LEAD_TEXT.includes('{{'))
check('team text has no template groups', !TEAM_TEXT.includes('{{'))
check('reminder text has no template groups', !REMINDER_TEXT.includes('{{'))

// --- registration ----------------------------------------------------------
const registered = createContext()
apply(registered.ctx)
check('registers exactly three sections', registered.sections.length === 3, String(registered.sections.length))
check('registers exactly one runtime context', registered.contexts.length === 1, String(registered.contexts.length))
check('one effect per registration', registered.effects.length === 4, String(registered.effects.length))

const trailing = byName(registered.sections, SECTION_NAME)
check('trailing section name', trailing.name === SECTION_NAME)
check('trailing order is persona-suffix + 1', trailing.order === 10201, String(trailing.order))
check('trailing text is the default policy', textOf(trailing) === DEFAULT_TEXT)
check('trailing section is literal', trailing.interpolate === false)

const leading = byName(registered.sections, LEAD_SECTION_NAME)
check('leading order is 1', leading.order === 1, String(leading.order))
check('leading text is the short restatement', textOf(leading) === LEAD_TEXT)
check('leading section is literal', leading.interpolate === false)

const team = byName(registered.sections, TEAM_SECTION_NAME)
check('team order falls back to 601 when TEAM_POLICY is unknown', team.order === 601, String(team.order))
check('team text is the team restatement', textOf(team) === TEAM_TEXT)

const reminder = registered.contexts[0] ?? {}
check('reminder name', reminder.name === REMINDER_NAME)
check('reminder order is 300', reminder.order === 300, String(reminder.order))
check('reminder text is the one-liner', textOf(reminder) === REMINDER_TEXT)
check('reminder is literal', reminder.interpolate === false)

const teamOrdered = createContext({ teamOrder: 600 })
apply(teamOrdered.ctx)
check(
  'team order follows TEAM_POLICY + 1',
  byName(teamOrdered.sections, TEAM_SECTION_NAME).order === 601,
  String(byName(teamOrdered.sections, TEAM_SECTION_NAME).order),
)

const disabled = createContext()
apply(disabled.ctx, { enabled: false })
check('enabled:false registers nothing', disabled.sections.length === 0 && disabled.contexts.length === 0)

const custom = createContext()
apply(custom.ctx, {
  text: '自定义策略文本',
  leadText: '自定义首段',
  teamText: '自定义团队段',
  reminderText: '自定义提醒',
})
check('config.text replaces the trailing policy', textOf(byName(custom.sections, SECTION_NAME)) === '自定义策略文本')
check('config.leadText replaces the leading text', textOf(byName(custom.sections, LEAD_SECTION_NAME)) === '自定义首段')
check('config.teamText replaces the team text', textOf(byName(custom.sections, TEAM_SECTION_NAME)) === '自定义团队段')
check('config.reminderText replaces the reminder', textOf(custom.contexts[0]) === '自定义提醒')

const blank = createContext()
apply(blank.ctx, { text: '   ', leadText: '  ', teamText: '  ', reminderText: '  ' })
check('blank config.text falls back to the default', textOf(byName(blank.sections, SECTION_NAME)) === DEFAULT_TEXT)
check('blank leadText falls back to the default', textOf(byName(blank.sections, LEAD_SECTION_NAME)) === LEAD_TEXT)
check('blank teamText falls back to the default', textOf(byName(blank.sections, TEAM_SECTION_NAME)) === TEAM_TEXT)
check('blank reminderText falls back to the default', textOf(blank.contexts[0]) === REMINDER_TEXT)

// --- live switches ---------------------------------------------------------
const defaults = readState()
check('defaults are on', defaults.lead === true && defaults.team === true && defaults.reminder === true)

setState({ lead: false, team: false, reminder: false })
const switched = createContext()
apply(switched.ctx)
check('lead:false empties the leading section', textOf(byName(switched.sections, LEAD_SECTION_NAME)) === '')
check('team:false empties the team section', textOf(byName(switched.sections, TEAM_SECTION_NAME)) === '')
check('reminder:false empties the reminder', textOf(switched.contexts[0]) === '')
check('trailing stays on while the three switches are off', textOf(byName(switched.sections, SECTION_NAME)) === DEFAULT_TEXT)

setState({ lead: true, team: true, reminder: true })
const restored = createContext()
apply(restored.ctx)
check('switches can be turned back on', textOf(byName(restored.sections, LEAD_SECTION_NAME)) === LEAD_TEXT)

// The live proof: a registration made with lead on must go empty after the
// switch is written, because the text provider reads state on every assembly.
const liveLead = byName(restored.sections, LEAD_SECTION_NAME)
const liveReminder = restored.contexts[0]
check('registration starts with the lead text', textOf(liveLead) === LEAD_TEXT)
setState({ lead: false, reminder: false })
check('existing registration follows the live switch', textOf(liveLead) === '' && textOf(liveReminder) === '')
setState({ lead: true, reminder: true })

setState({ lead: 'yes', unexpected: true })
check('non-boolean and unknown keys are ignored', readState().lead === true && readState().unexpected === undefined)

const stored = JSON.parse(readFileSync(configFile(), 'utf8'))
check('state is persisted as JSON', stored.lead === true && stored.team === true && stored.reminder === true)
check('state file lives under DSH_HOME', configFile().startsWith(home))

const noLead = createContext()
apply(noLead.ctx, { lead: false })
check('row config seeds the switch', textOf(byName(noLead.sections, LEAD_SECTION_NAME)) === '')

const unknown = createContext({ order: Number.NaN })
apply(unknown.ctx)
check('unknown placement key falls back to 10201', byName(unknown.sections, SECTION_NAME).order === 10201)

const throwing = createContext({ throwOnOrder: true })
apply(throwing.ctx)
check('throwing placement lookup falls back to 10201', byName(throwing.sections, SECTION_NAME).order === 10201)
check('throwing team lookup falls back to 601', byName(throwing.sections, TEAM_SECTION_NAME).order === 601)

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
check('manifest declares the client half', pkg?.dsh?.client?.platform === 'web')
check('manifest exports the client entry', pkg?.exports?.['./client'] === './client.js')
check('manifest has no runtime dependencies', !pkg.dependencies || Object.keys(pkg.dependencies).length === 0)
check('manifest lists a dsh engine range', typeof pkg?.engines?.dsh === 'string')
check(
  'manifest exports locale resources and the icon',
  pkg?.exports?.['./locale/*.json'] === './locale/*.json' && pkg?.exports?.['./icon'] === './icon.svg',
)
check('manifest files include runtime files, locales and icon', [
  'index.js',
  'client.js',
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

rmSync(home, { recursive: true, force: true })

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed`)
  process.exit(1)
}
console.log('\nall smoke checks passed')
