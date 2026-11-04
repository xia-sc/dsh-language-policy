# Changelog

## 0.1.1 — 2026-11-04

- 发布链路改为 GitHub Actions + npm Trusted Publishing（OIDC），发布自动附带 provenance，不再使用长期 npm token。
- README 增加 npm version / license / publish 徽标。
- 无运行时代码变化。

## 0.1.0 — 2026-11-04

- 首个版本：Host-only bundle，通过 `ctx.systemPrompt.section()` 在系统提示词末尾（persona suffix 之后）注入简体中文语言策略。
- 全局 section，主 agent、Agent Teams teammate、subagent 均生效。
- 配置：`enabled`（关掉做 A/B 对照）、`text`（覆盖默认文本）。
- 附带静态冒烟测试（`test/smoke.mjs`）与 A/B 实验工具（`tools/`）。
