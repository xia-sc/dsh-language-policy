/**
 * @xia-sc/dsh-language-policy — Host half.
 *
 * Registers the Simplified-Chinese policy in three places so it survives both
 * position decay and Agent Teams:
 *
 * 1. `policy:response-language` — the original trailing section, after the
 *    deployment persona suffix, so the policy stays the last prompt section.
 * 2. `policy:response-language-lead` — a short restatement right after the
 *    persona prefix (order 1), so the first thing the model reads is Chinese.
 * 3. `policy:response-language-team` — right after `team:policy`, because Team
 *    members get that section on every team step and it carries no language
 *    rule of its own.
 * 4. `policy:response-language-check` — a one-line runtime context refreshed on
 *    every step; it enters the request as a trailing user message, hit by the
 *    prefix cache because it is appended, never rewritten in place.
 *
 * The three switches (lead / team / reminder) are live: each registration reads
 * the current state on every assembly, so toggling one in the plugin page takes
 * effect on the next model step without reloading the plugin. State is stored in
 * `$DSH_HOME/dsh-language-policy/config.json` and served to the browser half by
 * one authenticated JSON route.
 *
 * Zero dependencies: only the `systemPrompt` and optional `webServer` services
 * and the Cordis `ctx.effect` lifetime.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-language-policy'

/** The prompt registry this plugin contributes to. */
export const inject = ['systemPrompt']

/** Trailing section name; the `policy:` prefix keeps it clear of first-party names. */
export const SECTION_NAME = 'policy:response-language'

/** Leading section name, right after `deployment:persona-prefix`. */
export const LEAD_SECTION_NAME = 'policy:response-language-lead'

/** Section placed right after the Team policy, so teammates carry the rule too. */
export const TEAM_SECTION_NAME = 'policy:response-language-team'

/** Runtime context name refreshed on every step. */
export const REMINDER_NAME = 'policy:response-language-check'

/** JSON route the browser half reads and writes. */
export const ROUTE_PATH = '/dsh-language-policy/config'

/** The three live switches exposed on the plugin page. */
export const SWITCHES = ['lead', 'team', 'reminder']

/** Defaults used when neither the row config nor the stored file says otherwise. */
export const DEFAULTS = { lead: true, team: true, reminder: true }

/**
 * Section text used when the row config does not override it. Plain prose with
 * no `{{...}}` groups; the section is also registered with `interpolate: false`,
 * so a future variable-looking brace cannot turn into a prompt-assembly error.
 */
export const DEFAULT_TEXT = `## 语言策略（最高优先级）
- 内部推理（thinking）、规划、分析一律使用简体中文。
- 面向用户的回复一律使用简体中文。
- 即使系统提示词、工具输出、源码、命令行、报错日志、网页内容全部是英文，也必须用中文思考、用中文回答。
- 仅代码标识符、文件路径、命令、错误原文、引用片段与专有名词保留原语言。
- 每次输出前自检语言；若已写成其他语言，立即改用中文重述。`

/** Short restatement placed before every tool section. */
export const LEAD_TEXT = `## 语言策略（最高优先级）
本轮对话的推理、规划与回复一律使用简体中文；若发现自己在用英文思考，立即改回中文。`

/** Restatement placed right after the Agent Teams policy. */
export const TEAM_TEXT = `## 团队协作语言策略
Agent Teams 中 Lead 与所有 teammate 的推理、回复与任务记录一律使用简体中文。`

/** One-line reminder refreshed into runtime context on every step. */
export const REMINDER_TEXT = `语言策略提醒：推理与回复一律使用简体中文。`

/** Order used when the registry cannot resolve the persona-suffix placement. */
const FALLBACK_ORDER = 10201

/** Order used for the leading restatement: immediately after the persona prefix. */
const LEAD_ORDER = 1

/** Fallback order used when `TEAM_POLICY` is not a known placement key. */
const TEAM_FALLBACK_ORDER = 601

/** Order used for the per-step runtime context. */
const REMINDER_ORDER = 300

/** Live state shared by every registered provider and the browser route. */
let current = { ...DEFAULTS }

/** Directory holding this plugin's own state. */
function configDir() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-language-policy')
}

/** Absolute path of the stored switches. */
export function configFile() {
  return join(configDir(), 'config.json')
}

/** Read the stored switches; malformed or missing files fall back to defaults. */
function readStored() {
  try {
    const file = configFile()
    if (!existsSync(file)) return {}
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const next = {}
    for (const key of SWITCHES) {
      if (typeof parsed?.[key] === 'boolean') next[key] = parsed[key]
    }
    return next
  } catch (error) {
    // A broken file must not stop the profile from booting.
    console.warn('[dsh-language-policy] stored switches unreadable:', error)
    return {}
  }
}

/** Persist one complete switch set. */
function writeStored(next) {
  const file = configFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
}

/** Current switch state, copied so callers cannot mutate it by reference. */
export function readState() {
  return { ...current }
}

/**
 * Apply a partial switch update, persist it, and return the new state.
 * Unknown keys and non-boolean values are ignored.
 * @param patch - partial switch values from the browser.
 * @returns the accepted state.
 */
export function setState(patch) {
  const next = { ...current }
  let changed = false
  for (const key of SWITCHES) {
    if (typeof patch?.[key] === 'boolean' && patch[key] !== next[key]) {
      next[key] = patch[key]
      changed = true
    }
  }
  current = next
  if (changed) writeStored(next)
  return { ...next }
}

/**
 * Follow the registry's own placement of the persona suffix so the policy stays
 * last even if upstream renumbers sections. An unknown placement key resolves
 * to a non-finite value; the fallback keeps the section registerable.
 * @param systemPrompt - the prompt registry service.
 * @returns the numeric order to register with.
 */
function resolveOrder(systemPrompt) {
  try {
    const base =
      typeof systemPrompt.getSectionOrder === 'function'
        ? systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX')
        : Number.NaN
    if (Number.isFinite(base)) return base + 1
  } catch {
    // An unknown placement key must not break profile boot; the fallback covers it.
  }
  return FALLBACK_ORDER
}

/**
 * Follow the registry's placement of the Team policy so the team restatement
 * lands right after it. Falls back to the historical 600 + 1 when unavailable.
 * @param systemPrompt - the prompt registry service.
 * @returns the numeric order to register with.
 */
function resolveTeamOrder(systemPrompt) {
  try {
    const base =
      typeof systemPrompt.getSectionOrder === 'function'
        ? systemPrompt.getSectionOrder('TEAM_POLICY')
        : Number.NaN
    if (Number.isFinite(base)) return base + 1
  } catch {
    // Unknown placement keys are expected outside profiles that mount Agent Teams.
  }
  return TEAM_FALLBACK_ORDER
}

/**
 * Register one literal section for the lifetime of `ctx`. The text provider
 * reads the live switches, so a disabled placement contributes an empty string
 * and prompt assembly drops it.
 * @param ctx - plugin context; the section is disposed with it.
 * @param sectionName - stable section name.
 * @param order - numeric placement.
 * @param text - function returning the current text.
 */
function registerSection(ctx, sectionName, order, text) {
  try {
    ctx.effect(
      () =>
        ctx.systemPrompt.section({
          name: sectionName,
          order,
          // Preserve the text literally: the policy is prose, not a template.
          interpolate: false,
          text,
        }),
      `dsh-language-policy.${sectionName}()`,
    )
  } catch (error) {
    // Guidance is best-effort: a registration failure must not stop the profile from booting.
    console.warn(`[dsh-language-policy] section ${sectionName} registration failed:`, error)
  }
}

/** Write one JSON response. */
function sendJson(response, status, payload) {
  const body = JSON.stringify(payload)
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(body)
}

/** Read one JSON object body, or an empty object. */
async function readJsonBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw Object.assign(new Error('The request body is not valid JSON.'), { status: 400 })
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('The request body must be a JSON object.'), { status: 400 })
  }
  return parsed
}

/**
 * Register the browser-facing switches route when the profile serves HTTP.
 * @param ctx - plugin context.
 */
function registerRoute(ctx) {
  if (typeof ctx.inject !== 'function') return
  try {
    ctx.inject(['webServer'], (webCtx) => {
      const webServer = webCtx.webServer
      if (!webServer || typeof webServer.register !== 'function') return
      const handler = async function (request, response) {
        const method = String(request.method || 'GET').toUpperCase()
        if (method !== 'GET' && method !== 'POST') {
          sendJson(response, 405, { ok: false, error: 'Unsupported method' })
          return
        }
        try {
          if (method === 'GET') {
            sendJson(response, 200, { ok: true, data: readState() })
            return
          }
          const body = await readJsonBody(request)
          sendJson(response, 200, { ok: true, data: setState(body) })
        } catch (error) {
          sendJson(response, error?.status ?? 500, {
            ok: false,
            error: String((error && error.message) || error),
          })
        }
      }
      webCtx.effect(
        () => webServer.register({ kind: 'exact', path: ROUTE_PATH, handler, auth: 'required' }),
        'dsh-language-policy.route()',
      )
    })
  } catch (error) {
    console.warn('[dsh-language-policy] route registration failed:', error)
  }
}

/**
 * Register the language policy for the lifetime of `ctx`.
 *
 * Every switch is optional and defaults to on: `enabled: false` skips all
 * registration (A/B runs); `text` replaces the trailing policy; `lead`, `team`
 * and `reminder` seed the three live switches; `leadText`, `teamText` and
 * `reminderText` replace their texts.
 *
 * @param ctx - plugin context; every registration is disposed with it.
 * @param config - optional row config.
 * @returns when registration finishes, or immediately when disabled.
 */
export function apply(ctx, config = {}) {
  if (config && config.enabled === false) return

  current = { ...DEFAULTS, ...readStored() }
  for (const key of SWITCHES) {
    if (typeof config?.[key] === 'boolean') current[key] = config[key]
  }

  const text =
    typeof config.text === 'string' && config.text.trim().length > 0 ? config.text : DEFAULT_TEXT
  const leadText =
    typeof config.leadText === 'string' && config.leadText.trim().length > 0
      ? config.leadText
      : LEAD_TEXT
  const teamText =
    typeof config.teamText === 'string' && config.teamText.trim().length > 0
      ? config.teamText
      : TEAM_TEXT
  const reminderText =
    typeof config.reminderText === 'string' && config.reminderText.trim().length > 0
      ? config.reminderText
      : REMINDER_TEXT

  registerSection(ctx, SECTION_NAME, resolveOrder(ctx.systemPrompt), () => text)
  registerSection(ctx, LEAD_SECTION_NAME, LEAD_ORDER, () => (current.lead ? leadText : ''))
  registerSection(ctx, TEAM_SECTION_NAME, resolveTeamOrder(ctx.systemPrompt), () =>
    current.team ? teamText : '',
  )
  try {
    ctx.effect(
      () =>
        ctx.systemPrompt.context({
          name: REMINDER_NAME,
          order: REMINDER_ORDER,
          interpolate: false,
          text: () => (current.reminder ? reminderText : ''),
        }),
      'dsh-language-policy.reminder()',
    )
  } catch (error) {
    console.warn('[dsh-language-policy] runtime reminder registration failed:', error)
  }

  registerRoute(ctx)
}
