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

插件在 `apply()` 里向 `ctx.systemPrompt` 注册三处 section 和一条每步 runtime context，形成首、中、尾加动态提醒的四层覆盖：

| 位置 | name | order | 作用 |
|---|---|---|---|
| 首 | `policy:response-language-lead` | `1` | 紧跟 persona 之后，模型最先读到中文约束 |
| 中 | `policy:response-language-team` | `TEAM_POLICY + 1`（回退 `601`） | 紧跟 `team:policy`，补上团队段缺失的语言规则 |
| 尾 | `policy:response-language` | `getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX') + 1`（回退 `10201`） | 系统提示词最后一段 |
| 每步 | `policy:response-language-check`（runtime context） | `300` | 一行提醒，作为末尾 user 消息随每一步刷新 |

四处都是 `interpolate: false` 的字面文本。选择「运行时插件」而不是「patch 里覆盖 `system-prompt` 的 config」的原因：后者要复述 `personaPrefix`，相当于把上游文案复制一份，上游一改就会被旧副本盖回去；本插件只追加，上游怎么改都不受影响。

### 缓存影响

- 三处 section 是静态文本：安装或改文本时让每个活跃会话发生**一次**全前缀 miss，之后稳定命中。
- 每步的 runtime context 是**追加**在请求末尾的新 user 消息，不改写历史，所以前缀缓存继续命中；代价是每步约 30 token 的未命中输入，并随步数线性累积。
- 不要在配置里放时间戳、步数或随机值：那会让每次装配都 miss。

## 安装

任选其一（都需要 `plugin_manager`）：

```
install_bundle -> target: <本仓库克隆目录的绝对路径>   # 本地目录
install_bundle -> target: @xia-sc/dsh-language-policy  # 发布 npm 后
```

本地目录安装时，`plugin_manager` 会把该绝对路径以 `link:` 形式写进 profile 的 `dependencies`，所以仓库目录不要移动或删除。安装会写 profile 的 `package.json`（`dependencies` + `dsh.profile.bundles`）并立即生效。**新开一个会话**即可验证；已存在的会话要等下一轮重新装配系统提示词。

## 配置

### 插件页的三个开关

打开 **插件 → 语言策略**，配置表单直接显示在描述下方、组件列表上方（`plugins.bundle.config`），不需要再点进组件行。三个开关互相独立：

| 开关 | 关闭后 |
|---|---|
| 首段（persona 之后） | 不再在系统提示词最前面重复中文约束 |
| 团队段（team:policy 之后） | 不再覆盖 Agent Teams 的团队段 |
| 每步提醒（runtime context） | 不再每步追加一行提醒 |

切换**下一步装配就生效**，不重载插件；状态写在 `$DSH_HOME/dsh-language-policy/config.json`。代价是切换那一步的系统提示词变一次，触发一次全前缀缓存 miss，之后恢复命中。

### 行配置（`cordis.patch.yml`）

行配置仍是这些开关的初始值，并在 `apply` 时覆盖已存文件：

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | `false` 时完全不注册，用于 A/B 对照（改动后需重载） |
| `text` | `DEFAULT_TEXT` | 覆盖尾部策略文本 |
| `lead` | `true` | 首段初值 |
| `team` | `true` | 团队段初值 |
| `reminder` | `true` | 每步提醒初值 |
| `leadText` / `teamText` / `reminderText` | 内置 | 分别覆盖首段、团队段、提醒文本 |

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

新会话发一句话，然后解压该会话日志，确认系统提示词里出现了策略文本、且上游 `personaPrefix` 没被动过。0.2.2-rc.5 起 `system/message` 改成按 section 分块：正文在 `content[contentIndex]`，归属在 `source.sections`，所以按章节名定位而不是直接取第一块：

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
const message = sys?.data?.message
const blocks = message?.content ?? []
const sections = message?.source?.sections ?? []
const policy = sections.find((section) => section.name === 'policy:response-language')
const policyText = policy?.contentIndex === undefined ? '' : (blocks[policy.contentIndex]?.text ?? '')
const prompt = blocks.map((block) => block?.text ?? '').join('\n\n')
console.log({
  sections: sections.length,
  policyOrder: policy?.order ?? null,
  hasPolicy: policyText.includes('语言策略'),
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

### 效果对照（2026-11-24 微实验）：位置与重复不是 reasoning 语言的杠杆

在 0.2.3-alpha.2 上，把策略扩成首、中、尾三段加每步 runtime 提醒后，用同一系统提示词跑两个子会话，只改 user prompt 语言：

| 子会话 | user prompt | reasoning 中文占比 | 最终回复 |
|---|---|---|---|
| `9d72d333-fc2c-4109-8d9f-bf51fea45c86` | 英文 | 0%（`Simple task: read two files' first lines…`） | 中文 |
| `24b33259-dbe0-4b0b-8ddf-6d56ea552e11` | 中文 | 92.9%（`用户要求读取文件前5行。用 read 工具。`） | 中文 |

结论：reasoning 语言跟 **user 消息的语言与任务类型**走，system 里的中文约束（无论放在首、中、尾还是每步提醒）都不足以翻转它。可见输出保持中文这一点是有效的；内部推理的英文漂移需要请求级手段，不在本插件能力范围内。同一批次里，静态 section 变化让当前会话发生一次全前缀 miss（`inputTokens 174041 / cacheReadTokens 0`），下一轮恢复命中（`1601 / 173952`）；每步提醒追加在末尾，多步子会话 step 2/3 仍命中（`cacheReadTokens 23680 / 24320`）。

## 兼容性

| DSH 版本 | 状态 | 说明 |
|---|---|---|
| 0.2.1-rc.5 | ✅ 已实测 | 安装、提示词注入、A/B 实验均在该版本完成 |
| 0.2.2-rc.1 | ✅ 已实测 | 2026-11-05 验证：插件行 `enabled: true` / `fiberPhase: active`；新会话系统提示词 8012 字符、含策略段且 persona 与 AGENTS.md 均在；`DEPLOYMENT_PERSONA_SUFFIX` 仍为 10200，`order = 10201` 依旧落在提示词末尾；`section()` / `getSectionOrder()` 的实现与 0.2.1-rc.5 逐行一致 |
| 0.2.3-alpha.2 | ✅ 已实测 | 2026-11-23 验证：desktop profile 已加载插件行；当前会话 `system/message` 共 24 个 section，末位为 `policy:response-language`（order 10201、state active、contentIndex 23），策略文本在场；`DEPLOYMENT_PERSONA_SUFFIX` 仍为 10200，`section()` / `getSectionOrder()` / `ctx.effect()` 签名未变。v0.2.2-rc.1 → v0.2.3-alpha.1 的 75 条破坏项里只有 2 条与本插件表面相交（章节化 `system/message`、Loader 条目校验），都不需要改运行时代码 |

插件依赖的 API 只有三样：`ctx.systemPrompt.section()`、`getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX')`、`ctx.effect()`；不 import 任何 DSH 包，因此不受 cordis 小版本升级影响（0.2.3-alpha.2 带的是 cordis 4.2.0-alpha.1，三者签名未变）。`engines.dsh` 声明为 `>=0.2.1-rc.5 <0.3.0-0`，覆盖这三个版本及后续 0.2.x；DSH 按含预发布的方式匹配，`0.2.3-alpha.2` 实测通过。

已知例外（与版本无关）：`minimal` preset 的 persona 使用 `complete: true`，会整体覆盖系统提示词，本插件段在该 preset 下不生效；`standard` / `ptc` / `cordis` / `cc` 都是拼装式，正常生效。

## 边界

- **不承诺 100% 中文思考**：长推理仍可能漂移，提示词只能提高概率；实测 reasoning 语言主要由 user 消息与任务类型决定，system 层的位置和重复不是杠杆。
- **每步提醒有累计成本**：约 30 token/步，长会话里会随步数增长，可用 `reminder: false` 关掉。
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
| `index.js` | 插件本体（`name` / `inject` / `apply`）、三处 section、每步提醒与配置路由 |
| `client.js` | 插件页「配置」表单：三个开关，读写 `/dsh-language-policy/config` |
| `cordis.patch.yml` | 只 `insert` 一行插件行 |
| `locale/{en,zh}.json` | Plugin Manager / Settings 显示用的标题与描述 |
| `icon.svg` | 插件面板图标（原创） |
| `test/smoke.mjs` | 静态冒烟检查 |
| `CHANGELOG.md` | 变更记录 |
| `.github/workflows/publish.yml` | tag 触发的 OIDC 发布 workflow |
| `tools/` | 实验与验证脚本（不进 npm 包）：reasoning 中文占比统计、会话日志检查、实验题目与报告 |

## License

MIT
