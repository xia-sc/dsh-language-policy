# @xia-sc/dsh-language-policy

[![npm version](https://img.shields.io/npm/v/@xia-sc/dsh-language-policy.svg)](https://www.npmjs.com/package/@xia-sc/dsh-language-policy)
[![license](https://img.shields.io/npm/l/@xia-sc/dsh-language-policy.svg)](LICENSE)
[![publish](https://github.com/xia-sc/dsh-language-policy/actions/workflows/publish.yml/badge.svg)](https://github.com/xia-sc/dsh-language-policy/actions/workflows/publish.yml)

一个只做一件事的 **Host-only DSH bundle**：把一条简体中文语言策略钉在系统提示词的**最末尾**，让模型的内部推理（reasoning）和用户回复保持中文。

- 零依赖（只用 `systemPrompt` 服务和 Cordis 的 `ctx.effect` 生命周期）
- 不覆盖任何上游配置，纯追加
- 全局 section：主 agent、Agent Teams 的 teammate、subagent 都会带上

## 为什么需要它

中文用户使用 DSH 时，模型内部的思考会周期性地变成英文，`~/.dsh/AGENTS.md` 里写「内部推理一律使用中文」也压不住长会话漂移。根本原因不在规则丢失：

1. 系统提示词本身是纯英文的，而且很长（约 7.8K 字符 / 23 段，仅 1 段中文）；
2. `AGENTS.md` 被注入成 **user 角色**的 `<system-reminder>`，框架文案明确写了它只是 guidance，**不覆盖 system/developer/user 指令**；
3. `AGENTS.md` 只在会话开始注入一次（`baseline: true`），长会话中被稀释到很远的位置；
4. 模型在「深度排障」类长推理任务里会回归英文训练分布（实测两个排障会话思考中文占比只有 4% / 9%，其余会话 75%–99%）。

把同一条策略以 **system 角色、最后一段** 的形式注入，才能在优先级和位置上同时压住这个漂移。

## 工作原理

插件在 `apply()` 里向 `ctx.systemPrompt` 注册一个 section：

| 字段 | 值 | 说明 |
|---|---|---|
| `name` | `policy:response-language` | `policy:` 前缀避免与第一方 section 撞名 |
| `order` | `getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX') + 1` | 跟随上游段落顺序，落在系统提示词最后；取不到时回退 `10201` |
| `interpolate` | `false` | 策略是纯文本，不参与 `{{变量}}` 插值，避免装配报错 |
| `text` | 见 `index.js` 的 `DEFAULT_TEXT` | 可用 `config.text` 覆盖 |

选择「运行时插件」而不是「patch 里覆盖 `system-prompt` 的 config」的原因：后者要复述 `personaPrefix`，相当于把上游文案复制一份，上游一改就会被旧副本盖回去；本插件只追加，上游怎么改都不受影响。

## 安装

任选其一（都需要 `plugin_manager`）：

```
install_bundle -> target: <本仓库克隆目录的绝对路径>   # 本地目录
install_bundle -> target: @xia-sc/dsh-language-policy  # 发布 npm 后
```

本地目录安装时，`plugin_manager` 会把该绝对路径以 `link:` 形式写进 profile 的 `dependencies`，所以仓库目录不要移动或删除。安装会写 profile 的 `package.json`（`dependencies` + `dsh.profile.bundles`）并立即生效。**新开一个会话**即可验证；已存在的会话要等下一轮重新装配系统提示词。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | `false` 时完全不注册 section，用于 A/B 对照 |
| `text` | 内置默认文本 | 覆盖默认语言策略文本 |

要临时关掉，在 profile 的 bundle 行上加 config（`cordis.patch.yml` 里的注释有示例）：

```yaml
- id: dsh-language-policy
  name: '@xia-sc/dsh-language-policy'
  config:
    enabled: false
```

## 验证

### 静态检查（不启动 DSH）

```powershell
node --check index.js
node test/smoke.mjs
```

`test/smoke.mjs` 断言：三个导出形态、默认文本关键字、section 名/order/`interpolate`、`enabled` 与 `text` 开关、order 回退、patch 只 `insert` 不 `override`、manifest 的 locale/icon 资源。

### 提示词落地检查

新会话发一句话，然后解压该会话日志，确认系统提示词里出现了策略文本、且上游 `personaPrefix` 没被动过：

```js
// 用法: node check.mjs %USERPROFILE%\.dsh\sessions\<workspace>\<session-id>\session.v4.jsonl.zstd
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const buf = readFileSync(process.argv[2])
let text = ''
let off = 0
for (;;) {
  const idx = buf.indexOf(magic, off)
  if (idx < 0) break
  try { text += zstdDecompressSync(buf.subarray(idx)).toString('utf8') } catch {}
  off = idx + 4
}
const recs = text.split('\n').filter(Boolean).map((line) => JSON.parse(line))
const sys = recs.find((record) => record.type === 'system/message')
const prompt = sys?.data?.message?.content?.[0]?.text ?? ''
console.log({
  hasPolicy: prompt.includes('语言策略'),
  hasPersona: prompt.includes('You are a coding agent powered by'),
  length: prompt.length,
})
```

### 验证记录（2026-11-04，DSH desktop 0.2.1-rc.5）

本地目录安装后，当前会话的下一轮请求重新装配了系统提示词（会话日志 `system/message` 实测）：

| 记录 | 字符数 | 含策略 | 含上游 persona |
|---|---|---|---|
| 安装前（会话开始） | 7785 | 否 | 是 |
| 安装后 | 7974 | 是 | 是 |

7974 − 7785 = 189 = 策略文本 187 字符 + 段落分隔符 2 字符：上游提示词逐字未变，只追加了本段。策略位于 23 个 section 之后；其后只有 DSH 自身的 runtime-context 快照（当前环境、MCP 等），该快照按架构总是排在最后。

### 效果对照（A/B）：实测结果

2026-11-04 在本机 desktop 0.2.1-rc.5 上做了 2 组 × 3 样本对照。按需求把原计划的「方案 A」换成「只靠 AGENTS.md」，两组唯一差异是系统提示词里那 189 字符的策略段（6121 − 5932），题目、模型、AGENTS.md 基线、宿主全部相同：

| 组 | 三次样本中文占比 | 均值 | 极差 |
|---|---|---|---|
| 仅 AGENTS.md | 79.2% / 74.3% / 49.2% | 67.5% | 30.0pp |
| AGENTS.md + 插件 | 77.6% / 77.6% / 76.3% | 77.2% | 1.3pp |

结论：AGENTS.md 本身有效（两次都在 74–79%），但长推理会出现英文漂移（一次掉到 49.2%）；插件把占比稳定在 76–78% 的窄带内，主要收益是**压低漂移的尾部风险**，而不是把均值从 0 拉到 100。n=3 属小样本，不构成统计显著性结论。完整方法、统计口径、会话 id 与复现命令见 [tools/experiment-report.md](tools/experiment-report.md)。

## 兼容性

| DSH 版本 | 状态 | 说明 |
|---|---|---|
| 0.2.1-rc.5 | ✅ 已实测 | 安装、提示词注入、A/B 实验均在该版本完成 |
| 0.2.2-rc.1 | ✅ 已实测 | 2026-11-05 验证：插件行 `enabled: true` / `fiberPhase: active`；新会话系统提示词 8012 字符、含策略段且 persona 与 AGENTS.md 均在；`DEPLOYMENT_PERSONA_SUFFIX` 仍为 10200，`order = 10201` 依旧落在提示词末尾；`section()` / `getSectionOrder()` 的实现与 0.2.1-rc.5 逐行一致 |

插件依赖的 API 只有三样：`ctx.systemPrompt.section()`、`getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX')`、`ctx.effect()`；不 import 任何 DSH 包，因此不受 cordis 4.0 → 4.1 升级影响。`engines.dsh` 声明为 `>=0.2.1-rc.5 <0.3.0-0`，覆盖这两个版本及后续 0.2.x。

已知例外（与版本无关）：`minimal` preset 的 persona 使用 `complete: true`，会整体覆盖系统提示词，本插件段在该 preset 下不生效；`standard` / `ptc` / `cordis` / `cc` 都是拼装式，正常生效。

## 边界

- **不承诺 100% 中文思考**：长推理仍可能漂移，提示词只能提高概率。
- 压缩摘要的英文指令硬编码在上游（`compaction-basic` 的 summarizer），插件改不了。
- `locale: zh` 只影响界面，不影响模型提示词；本插件补的就是这一块。

## 发布（维护者）

发布走 GitHub Actions + npm Trusted Publishing（OIDC），不需要长期 npm token，也不需要把 token 存进仓库 secret：

1. 升版本并在 `CHANGELOG.md` 记一条：`npm version patch --no-git-tag-version`（或手改 `package.json`）；
2. 提交并推送 `main`；
3. 打与版本一致的 tag 并推送：`git tag vX.Y.Z` + `git push origin vX.Y.Z`；
4. `.github/workflows/publish.yml` 会跑测试、校验 tag 与 `package.json` 版本一致，然后用 OIDC 发布；provenance 由 npm 自动生成。

失败时用 `gh run view <run-id> --log` 看日志；workflow 也支持手动 `workflow_dispatch`（手动触发时跳过 tag 校验）。首次发布前需要在 npm 包设置里配置 Trusted Publisher（Publisher `GitHub Actions` / `xia-sc` / `dsh-language-policy` / `publish.yml`）。

## 文件

| 文件 | 作用 |
|---|---|
| `index.js` | 插件本体（`name` / `inject` / `apply`） |
| `cordis.patch.yml` | 只 `insert` 一行插件行 |
| `locale/{en,zh}.json` | Plugin Manager / Settings 显示用的标题与描述 |
| `icon.svg` | 插件面板图标（原创） |
| `test/smoke.mjs` | 静态冒烟检查 |
| `CHANGELOG.md` | 变更记录 |
| `.github/workflows/publish.yml` | tag 触发的 OIDC 发布 workflow |
| `tools/` | 实验与验证脚本（不进 npm 包）：reasoning 中文占比统计、会话日志检查、实验题目与报告 |

## License

MIT
