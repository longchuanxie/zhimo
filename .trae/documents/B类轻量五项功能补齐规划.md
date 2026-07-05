# B 类轻量五项功能补齐规划

## Context（背景）

上一轮「项目核心流程缺陷修复与工程质量建设规划」已完成 6 个阶段（A 类缺陷修复 + C 类工程质量），30 个测试通过。本轮处理 B 类能力完整度问题中的 5 项轻量改造，目标是把已有但未接通的能力补齐，让产品在数据统计、Agent 上下文、模型配置、会话管理四个方向达到 MVP 可用状态。

**不在本轮范围**（需 Rust 端协作，单独规划）：#2 PDF/Word 资料解析、#7 异步导出任务队列。

**用户已确认的决策**：
- #4 会话自动命名采用 LLM 生成 ≤12 字标题（失败回退截取首条用户消息前 20 字）
- #8 max token 在 `upsertConfig` 时自动查询模型实际能力并写入配置

---

## 阶段 1：#1 ProjectOverview 聚合统计

**问题**：[ProjectService.ts:264-272](file:///d:/workplace/idea/zhimo/src/services/project/ProjectService.ts) `getProjectOverview` 中 `sourceCount/cardCount/knowledgeCount` 硬编码为 0；`documentCount` 已正确计算。

**改造点**：
- [sourceRepository.ts](file:///d:/workplace/idea/zhimo/src/services/database/sourceRepository.ts) 新增 `countSourcesByProject(projectId)`：`SELECT COUNT(*) FROM sources WHERE project_id=? AND is_deleted=0`
- [cardRepository.ts](file:///d:/workplace/idea/zhimo/src/services/database/cardRepository.ts) 新增 `countCardsByProject(projectId)`：同构
- [knowledgeRepository.ts](file:///d:/workplace/idea/zhimo/src/services/database/knowledgeRepository.ts) 新增 `countKnowledgeByProject(projectId)`：同构
- `ProjectService.getProjectOverview` 把三个 `: 0` 替换为 `await countXxxByProject(projectId)`，保持 `try/catch + fromUnknown`

**测试**：新建 `src/services/project/ProjectService.test.ts`，参考 `ModelService.test.ts` 的 `unwrap/unwrapErr` + `seedTable` 模式。seed 项目 + 各 2 条记录（1 条 `is_deleted=1`），断言三个 count 各为 1；项目不存在时返回 `NOT_FOUND`。

**风险**：低。`getProjectOverview` 多 3 次 DB 查询，单项目首页可接受。

---

## 阶段 2：#6 targetWordCount 入 LLM 上下文

**问题**：[ContextService.ts:519-564](file:///d:/workplace/idea/zhimo/src/services/context/ContextService.ts) `loadProjectRules` 已注入 `writingGoal/targetReader/forbiddenRules/styleRules` 4 条目，但 `targetWordCount`（数值目标）未注入任何条目。

**改造点**：
- `ContextService.loadProjectRules` 在 `writingGoal` 条目之后追加：仅当 `project.targetWordCount > 0` 时 `entries.push(buildRequiredEntry('project_rules', '目标字数', `${project.targetWordCount} 字`, truncateLen))`
- 同文件 `projectRulesSnapshot`（约 403-408 行）：补 `targetWordCount: project.targetWordCount` 字段，保持快照完整
- `AgentService.buildModelMessages`（[AgentService.ts:755-768](file:///d:/workplace/idea/zhimo/src/services/agent/AgentService.ts)）**无需改动**：`contextSummary` 由 `buildContextSummary` 从 `entries` 构造，新条目会自然进入 system 提示

**测试**：新建 `ContextService.test.ts` 或扩展现有测试，mock 项目 `targetWordCount=50000` 调 `previewContext`，断言 entries 中存在 title="目标字数" 且 preview 含"50000 字"的 required 条目；`targetWordCount=0` 时不生成该条目。

**风险**：低。仅追加条目，不改变现有条目顺序与 token 预算逻辑。

---

## 阶段 3：#8 max token 按模型实际设置

**问题**：[ModelService.ts:368](file:///d:/workplace/idea/zhimo/src/services/model/ModelService.ts) `upsertConfig` 中 `maxOutputTokens ?? 4096` 固定默认；`modelGateway.ts:332-354` 已有 `MODEL_CAPABILITY_FALLBACK` 表与 `lookupModelCapability` 但未接入 Service 链路。

**改造点**：
- [modelGateway.ts](file:///d:/workplace/idea/zhimo/src/services/model/modelGateway.ts) 将 `lookupModelCapability`（约 357 行，当前文件内部 function）改为 `export`，供 Service 复用
- `ModelService.upsertConfig`：当 `input.maxOutputTokens` 未传时，新增 `resolveMaxOutputTokens(provider, modelName)` 辅助——先 `try await listProviderModels(provider.id)` 查远程列表中该 modelName 的 `maxOutputTokens`；失败或查不到则 `lookupModelCapability(modelName).maxOutputTokens`；仍为 null 回退 4096。把 368 行替换为 `input.maxOutputTokens ?? await resolveMaxOutputTokens(...)`
- 远程查询失败不抛错，静默回退（保证离线可用）
- `modelGateway.callOpenAICompatible`（231 行 `max_tokens ?? 4096`）保持不变，作为最终兜底

**测试**：扩展 `ModelService.test.ts`——mock `listModels` 返回含 `maxOutputTokens: 16384` 的 `gpt-4o`，`upsertConfig` 不传 maxOutputTokens，断言 config.maxOutputTokens 为 16384；mock listModels 抛错时回退查 fallback 表得 8192（gpt-4o 内置值）或 4096；用户显式传 maxOutputTokens 时优先用用户值。

**风险/技术债**：`upsertConfig` 新增一次远程 `/v1/models` 调用，增加耗时与失败面。技术债 TD-006：未对 listModels 结果做内存缓存（阶段 4 会补）。

---

## 阶段 4：#3 模型列表选择补强

**问题**：[ModelSettingsPage.tsx](file:///d:/workplace/idea/zhimo/src/features/model/ModelSettingsPage.tsx) `ProviderFormModal` + `TaskConfigRow` 已实现两步流程+下拉选择+手填回退，但每次打开 modal 都重复请求 `/v1/models`；`ModelInfo` 显示仅 id；`TEMP_DEFAULT_MODEL='gpt-4o-mini'` 占位味重。

**改造点**：
- `ProviderFormModal.fetchModels`（约 687 行）：新增模块级缓存 `Map<providerId, {models: ModelInfo[], ts: number}>`，命中且未过期（5 分钟）直接用，避免重复请求
- 模型下拉项显示优化：`${id}（上下文 ${contextLength ?? '未知'}）`；若 `maxOutputTokens` 有值追加 `· 输出 ${n}`
- 弱化 `TEMP_DEFAULT_MODEL`：`createProvider` 时若类型允许传空串则改传 `''`；若 `insertProvider` 校验非空，保留占位但加注释"占位值，第二步必更新"，并在 `handleFinish` 校验 `defaultModelName !== TEMP_DEFAULT_MODEL` 阻止用户跳过第二步

**新增文件**：无（缓存用模块级变量，不过度抽象）。

**测试**：组件测试可选；重点用 vitest spy 断言第二次打开同一 provider 的 modal 不触发 `listProviderModels`。需先读 `insertProvider` 校验逻辑确认空串是否允许。

**风险**：低。`TEMP_DEFAULT_MODEL` 改空串前必须确认 Repository 校验。

---

## 阶段 5：#4 会话自动命名

**问题**：[AgentPanel.tsx:149,178](file:///d:/workplace/idea/zhimo/src/components/layout/AgentPanel.tsx) 前端拼"新对话 YYYY-MM-DD HH:MM" 作为 title；`sendMessage` 全程不更新 title；`agentRepository` 仅 `updateThreadSummary` 无 `updateThreadTitle`。

**改造点**：
- [agentRepository.ts](file:///d:/workplace/idea/zhimo/src/services/database/agentRepository.ts) 新增 `updateThreadTitle(id, title)`：参考 `updateThreadSummary`（172 行）模式，`UPDATE agent_threads SET title=?, updated_at=? WHERE id=?`
- `AgentService`：
  - 新增 `renameThread(threadId, title)`：参数校验（title 非空、≤12 字截断）→ `findThreadById` → `updateThreadTitle`，返回 `ServiceResult<AgentThread>`
  - 新增内部 `autoRenameThreadIfNeeded(thread, userMessage, assistantMessage)`：仅当 `thread.messageCount === 1` 且 title 以"新对话"开头时触发；调 `callModelDirect`（chat 任务类型，prompt 要求"生成不超过 12 字的中文标题，只输出标题"）；成功 → `renameThread`；失败 → 回退 `userMessage.content.slice(0, 20)`；`fire-and-forget`（`void ... .catch(() => {})`），不阻塞 sendMessage 返回
  - `sendMessage`（约 619 行 `return ok(...)` 前）插入 `void autoRenameThreadIfNeeded(thread, userMessage, assistantMessage).catch(() => {})`
- `AgentPanel.handleConfirmContextPack`：`sendMessage` 成功后已有 `loadThreads()` 调用，会拉到新 title；自动命名异步未完成时下次 `loadThreads` 自然刷新，无需额外处理
- prompt 常量放 AgentService 顶部常量区，不散落

**测试**：新建 `AgentService.rename.test.ts`——mock `callModelDirect` 返回"角色设定讨论"，`sendMessage` 首回合后 `findThreadById` 的 title 为该值；mock 抛错时回退为用户消息前 20 字；`messageCount > 1` 时不触发（spy 断言 `callModelDirect` 未被调用）。

**风险/技术债**：首回合额外一次 LLM 调用增加成本与延迟（异步不阻塞 UI，但占配额）。技术债 TD-007：自动命名 prompt 与 summarizeMessages 各自调用，未来可合并为一次调用。

---

## 实施顺序

| 顺序 | 阶段 | 依赖 | 风险 |
|---|---|---|---|
| 1 | 阶段 1 ProjectOverview 统计 | 无 | 低 |
| 2 | 阶段 2 targetWordCount 入上下文 | 无 | 低 |
| 3 | 阶段 3 max token 自动查模型能力 | modelGateway export | 中 |
| 4 | 阶段 4 模型列表补强 | 阶段 3 的能力查询思路 | 低 |
| 5 | 阶段 5 会话自动命名 | 跨三层，引入额外 LLM 调用 | 中 |

阶段 1-2 零依赖先落地建立测试模式；阶段 3-4 集中在模型配置层；阶段 5 最复杂放最后以隔离风险。

---

## 验证步骤

每个阶段完成后运行：
```
npx tsc --noEmit
npx vitest run --reporter=verbose
```

端到端验证（最后统一做）：
1. **阶段 1**：项目首页查看 sourceCount/cardCount/knowledgeCount 不再为 0
2. **阶段 2**：Agent 面板"预览上下文"看到"目标字数：N 字"条目
3. **阶段 3**：在模型设置页保存配置后，DB 中 model_configs.max_output_tokens 为模型实际值（非 4096）
4. **阶段 4**：第二次打开同一服务商的模型选择下拉不重复请求（Network 面板观察）
5. **阶段 5**：发送首条消息后，会话列表标题在数秒内从"新对话..."变为 LLM 生成的 ≤12 字标题

---

## 假设与决策

1. **#3 模型列表选择已基本实现**：本轮仅做缓存/显示/占位符补强，不重构架构
2. **#8 远程查询失败静默回退**：保证离线场景可用，错误不抛给用户
3. **#4 自动命名 fire-and-forget**：不阻塞 sendMessage 返回，失败静默回退截取，用户体验更平滑
4. **#2/#7 延后**：需 Rust crate 引入与异步任务模型，单独规划避免本轮风险蔓延

---

## 技术债记录

- **TD-006**：`listModels` 结果未做内存缓存，`upsertConfig` 与 `ProviderFormModal` 各查一次（阶段 4 缓存仅覆盖 UI 层，Service 层未覆盖）
- **TD-007**：会话自动命名与 summarizeMessages 各自调用 LLM，未来可合并为一次调用降低成本
