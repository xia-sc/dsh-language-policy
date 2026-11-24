# Changelog

## 0.2.0 — 2026-11-24

- 插件页配置：新增 `client.js`，以 `plugins.bundle.config`（key 为包名）注册表单，配置直接显示在组合包详情页的描述与组件列表之间，与 cc-studio 等插件同层；表单提供首段、团队段、每步提醒三个开关。Host 侧新增鉴权路由 `/dsh-language-policy/config`（GET/POST）与 `$DSH_HOME/dsh-language-policy/config.json`；三个 section 与每步提醒的 text 改为读实时状态，切换后下一步装配即生效，不重载插件。
- 冒烟测试扩到 65 项，覆盖 live 开关、状态持久化、行配置种子与 manifest 的 client 声明。
- 新增三处覆盖，形成首、中、尾加每步提醒的四层结构：`policy:response-language-lead`（persona 之后，order 1）、`policy:response-language-team`（`team:policy` 之后，order `TEAM_POLICY + 1`，回退 601）、`policy:response-language-check`（每步 runtime context，order 300）。
- 配置新增 `lead`、`team`、`reminder` 三个开关，以及 `leadText`、`teamText`、`reminderText` 三个文本覆盖；`test/smoke.mjs` 扩到 54 项断言。
- 实测缓存（DSH 0.2.3-alpha.2、commandcode/deepseek-v4.1-flash）：静态 section 变化只让每个活跃会话全前缀 miss 一次（当前会话 step 12 `inputTokens 174041 / cacheReadTokens 0`），之后 step 13 恢复命中（`inputTokens 1601 / cacheReadTokens 173952`）；每步 runtime context 追加在末尾，多步子会话 step 2/3 仍命中（`cacheReadTokens 23680 / 24320`）。
- 实测语言效果：对工具类任务的 reasoning 仍无改善——英文 user prompt 下子会话推理仍全英文，即便系统提示同时带三处中文策略和每步提醒。结论是位置与重复不是 reasoning 语言的瓶颈，后续需要 few-shot 或请求级手段，见 README「效果对照」。
- 兼容性验证：DSH desktop 0.2.3-alpha.2（desktop profile 已加载插件行；当前会话 `system/message` 共 24 个 section，末位 `policy:response-language` order 10201、state active，策略文本在场；`DEPLOYMENT_PERSONA_SUFFIX` 仍为 10200，`section()` / `getSectionOrder()` / `ctx.effect()` 签名未变）。v0.2.2-rc.1 → v0.2.3-alpha.1 的 75 条破坏项命中 2 条（章节化 `system/message`、Loader 条目校验），均不需要改运行时代码。见 README「兼容性」。
- 文档：README 的提示词落地检查脚本改为解析 0.2.2-rc.5 起的章节化 `system/message`（按 `source.sections` 的 `contentIndex` 取正文），旧写法取 `content[0]` 会误报「无策略段」。
- 兼容性验证：DSH desktop 0.2.2-rc.1（插件行 active、系统提示词含策略段、`DEPLOYMENT_PERSONA_SUFFIX` 仍为 10200、section API 未变），见 README「兼容性」；无运行时代码改动。

## 0.1.1 — 2026-11-04

- 发布链路改为 GitHub Actions + npm Trusted Publishing（OIDC），发布自动附带 provenance，不再使用长期 npm token。
- README 增加 npm version / license / publish 徽标。
- 无运行时代码变化。

## 0.1.0 — 2026-11-04

- 首个版本：Host-only bundle，通过 `ctx.systemPrompt.section()` 在系统提示词末尾（persona suffix 之后）注入简体中文语言策略。
- 全局 section，主 agent、Agent Teams teammate、subagent 均生效。
- 配置：`enabled`（关掉做 A/B 对照）、`text`（覆盖默认文本）。
- 附带静态冒烟测试（`test/smoke.mjs`）与 A/B 实验工具（`tools/`）。
