// 语言策略 —— Client 半侧（Web GUI）。
//
// 只做一件事：在插件页给「首段 / 团队段 / 每步提醒」三个开关一个配置表单。
// 数据经同源 JSON 路由 /dsh-language-policy/config 读写 Host 半侧，切换后
// 下一步装配即生效，不需要重载插件。只用主题 token，不引入任何 Harness Client 包。

window.__ModuleLoader__.load({
  id: '@xia-sc/dsh-language-policy',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const API = '/dsh-language-policy/config'
    const NS = 'xia-sc.dsh-language-policy'
    const KEYS = ['lead', 'team', 'reminder']

    const DICT = {
      zh: {
        nav: '语言策略',
        summary: '首段、团队段、每步提醒',
        title: '语言策略',
        help: '三个开关相互独立；切换后从下一步装配开始生效，不需要重载插件。',
        lead: '首段（persona 之后）',
        leadHelp: '在系统提示词最前面再加一段中文约束。',
        team: '团队段（team:policy 之后）',
        teamHelp: 'Agent Teams 的 Lead 与 teammate 都会读到。',
        reminder: '每步提醒（runtime context）',
        reminderHelp: '每一步追加一行中文提醒；约 30 token/步，长会话会累积。',
        on: '已开启',
        off: '已关闭',
        saving: '正在保存…',
        saved: '已保存',
        failed: '保存失败',
        loadFailed: '读取配置失败，请刷新页面重试',
      },
      en: {
        nav: 'Language policy',
        summary: 'Lead, team, and per-step reminder',
        title: 'Language policy',
        help: 'Each switch is independent; a change applies from the next prompt assembly without reloading the plugin.',
        lead: 'Lead section (after persona)',
        leadHelp: 'Adds a Chinese constraint at the very start of the system prompt.',
        team: 'Team section (after team:policy)',
        teamHelp: 'Every Agent Teams lead and teammate reads it.',
        reminder: 'Per-step reminder (runtime context)',
        reminderHelp: 'Appends one Chinese line per step; about 30 tokens per step, growing with the session.',
        on: 'On',
        off: 'Off',
        saving: 'Saving…',
        saved: 'Saved',
        failed: 'Save failed',
        loadFailed: 'Could not read the configuration. Refresh and try again.',
      },
    }

    const CSS = `
      .langpol{box-sizing:border-box;display:flex;flex-direction:column;gap:16px;padding:4px 0 8px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.6}
      .langpol-help{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .langpol-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2)}
      .langpol-row:last-of-type{border-bottom:0}
      .langpol-copy{min-width:0}
      .langpol-title{font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary)}
      .langpol-desc{margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
      .langpol-switch{position:relative;box-sizing:border-box;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer;transition:background-color 120ms ease}
      .langpol-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}
      .langpol-switch:disabled{opacity:0.6;cursor:default}
      .langpol-switch .knob{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb);transition:transform 120ms ease}
      .langpol-switch[aria-checked="true"] .knob{background:var(--dsw-alias-label-primary-foreground);transform:translateX(16px)}
      .langpol-status{display:flex;align-items:center;gap:8px;min-height:18px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
      .langpol-status.error{color:var(--dsw-alias-state-error-primary)}
      .langpol :focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
      .langpol-switch:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
    `

    let translate = (key) => DICT.zh[key] ?? key

    function Switch({ checked, disabled, label, onChange }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        className: 'langpol-switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-label': label,
        disabled,
        onClick: () => onChange(!checked),
      }, h('span', { className: 'knob', 'aria-hidden': 'true' }))
    }

    function ConfigPage({ view }) {
      const t = translate
      const [state, setState] = React.useState(null)
      const [failed, setFailed] = React.useState(false)
      const [busy, setBusy] = React.useState('')
      const [notice, setNotice] = React.useState(null)

      React.useEffect(() => {
        let alive = true
        fetch(API, { credentials: 'same-origin' })
          .then((response) => response.json())
          .then((payload) => {
            if (!alive) return
            if (payload && payload.ok === true && payload.data) {
              setState(payload.data)
              setFailed(false)
            } else {
              setFailed(true)
            }
          })
          .catch(() => {
            if (alive) setFailed(true)
          })
        return () => {
          alive = false
        }
      }, [])

      async function toggle(key, next) {
        setBusy(key)
        setNotice(null)
        try {
          const response = await fetch(API, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ [key]: next }),
          })
          const payload = await response.json()
          if (payload && payload.ok === true && payload.data) {
            setState(payload.data)
            setNotice(t('saved'))
          } else {
            setNotice(t('failed'))
          }
        } catch {
          setNotice(t('failed'))
        } finally {
          setBusy('')
        }
      }

      if (view === 'summary') {
        const parts = state
          ? KEYS.filter((key) => state[key]).map((key) => t(key))
          : []
        return h('span', null, `${t('summary')}${parts.length ? `：${parts.join(' / ')}` : ''}`)
      }

      if (failed) {
        return h('div', { className: 'langpol', role: 'status' },
          h('style', null, CSS),
          h('p', { className: 'langpol-help langpol-status error' }, t('loadFailed')))
      }

      const rows = KEYS.map((key) => h('div', { className: 'langpol-row', key },
        h('div', { className: 'langpol-copy' },
          h('div', { className: 'langpol-title' }, t(key)),
          h('div', { className: 'langpol-desc' }, t(`${key}Help`))),
        h(Switch, {
          checked: state ? state[key] !== false : true,
          disabled: state === null || busy === key,
          label: t(key),
          onChange: (next) => toggle(key, next),
        })))

      return h('div', { className: 'langpol' },
        h('style', null, CSS),
        h('p', { className: 'langpol-help' }, t('help')),
        rows,
        h('div', {
          className: notice === t('failed') ? 'langpol-status error' : 'langpol-status',
          role: 'status',
        }, busy
          ? t('saving')
          : notice ?? (state === null ? t('saving') : '')))
    }

    function apply(ctx) {
      try {
        const locale = ctx.locale || (typeof ctx.get === 'function' ? ctx.get('locale') : null)
        if (locale && typeof locale.register === 'function') {
          const register = () => locale.register(NS, { zh: DICT.zh, en: DICT.en })
          if (typeof ctx.effect === 'function') ctx.effect(register, 'dsh-language-policy:locale')
          else register()
          const bound = typeof locale.bind === 'function' ? locale.bind(NS) : null
          if (typeof bound === 'function') {
            translate = (key) => {
              try {
                const value = bound(key)
                return typeof value === 'string' && value !== '' ? value : (DICT.zh[key] ?? key)
              } catch {
                return DICT.zh[key] ?? key
              }
            }
          }
        }
      } catch (error) {
        console.warn('[dsh-language-policy] locale registration skipped', error)
      }

      const slots = ctx.slots
      if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return

      // 组合包详情页第一层：配置直接显示在描述与组件列表之间，
      // 不再需要先点进组件行（等价于 cc-studio 的详情页布局）。
      slots.inject('plugins.bundle.config', () => slots.register({
        name: 'plugins.bundle.config',
        key: '@xia-sc/dsh-language-policy',
      }, ConfigPage))
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
