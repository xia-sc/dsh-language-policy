/**
 * @xia-sc/dsh-language-policy — Host half.
 *
 * Registers one extra system-prompt section right after the deployment persona
 * suffix, pinning a Simplified-Chinese reasoning/response policy at the very end
 * of the assembled system prompt. Zero dependencies: only the `systemPrompt`
 * service and the Cordis `ctx.effect` lifetime.
 *
 * Why a runtime section instead of overriding the `system-prompt` row's config:
 * the plugin only appends guidance and never restates upstream persona text, so
 * an upstream rewrite of that text cannot be silently reverted by a stale copy.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-language-policy'

/** The prompt registry this plugin contributes to. */
export const inject = ['systemPrompt']

/** Unique section name; the `policy:` prefix keeps it clear of first-party names. */
export const SECTION_NAME = 'policy:response-language'

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

/** Order used when the registry cannot resolve the persona-suffix placement. */
const FALLBACK_ORDER = 10201

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
 * Register the language-policy section for the lifetime of `ctx`.
 * @param ctx - plugin context; the section is disposed with it.
 * @param config - `enabled: false` skips registration (A/B runs); `text` replaces the default policy.
 * @returns when the section is registered, or immediately when disabled.
 */
export function apply(ctx, config = {}) {
  if (config && config.enabled === false) return
  const text = typeof config.text === 'string' && config.text.trim().length > 0 ? config.text : DEFAULT_TEXT
  const order = resolveOrder(ctx.systemPrompt)
  try {
    ctx.effect(
      () =>
        ctx.systemPrompt.section({
          name: SECTION_NAME,
          order,
          // Preserve the text literally: the policy is prose, not a template.
          interpolate: false,
          text,
        }),
      'dsh-language-policy.section()',
    )
  } catch (error) {
    // Guidance is best-effort: a registration failure must not stop the profile from booting.
    console.warn('[dsh-language-policy] section registration failed:', error)
  }
}
