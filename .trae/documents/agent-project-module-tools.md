# Agent 项目操作工具集 — 实施计划（续）

## 背景与目标

为 Agent 提供操作项目本身的服务工具，使其能查询/管理大纲、正文、卡片、知识四个核心模块。

**核心机制**：
- 读工具（list/get/search）→ 直接调用 Service，立即返回结果给模型
- 写工具（create/update/delete/append）→ 不直接落库，收集为"待确认操作"持久化到 `agent_pending_actions` 表，UI 展示供用户确认后才真正执行
- 所有 8 种 AgentTaskType 任务均启用工具

## 当前进度（已完成的基建层）

经代码核验，以下文件已存在且集成完毕，**本计划不再重复实现**：

| 层级 | 文件 | 状态 |
|------|------|------|
| 迁移 | `src-tauri/migrations/007_agent_pending_actions.sql` | ✅ |
| 类型 | `src/types/pendingAction.ts`（+ index.ts 导出） | ✅ |
| Repository | `src/services/database/agentPendingActionRepository.ts` | ✅ |
| 收集器 | `src/services/agent/tools/pendingActionCollector.ts`（+ test） | ✅ |
| 工具辅助 | `src/services/agent/tools/toolHelpers.ts` | ✅ |
| 大纲工具 | `src/services/agent/tools/outlineTools.ts`（5 工具） | ✅ |
| 文档工具 | `src/services/agent/tools/documentTools.ts`（4 工具） | ✅ |
| 卡片工具 | `src/services/agent/tools/cardTools.ts`（5 工具） | ✅ |
| 知识工具 | `src/services/agent/tools/knowledgeTools.ts`（4 工具） | ✅ |
| 工具注册表 | `src/services/agent/tools/toolRegistry.ts` + `index.ts` | ✅ |
| 待确认 Service | `src/services/agent/PendingActionService.ts`（+ test） | ✅ |
| AgentService 集成 | `src/services/agent/AgentService.ts`（line 728-730, 895-923, 960） | ✅ |

AgentService 已完成的关键改造：
- `SendMessageResult` 增加 `pendingActions: PendingToolAction[]` 字段
- 每次对话创建 `PendingActionCollector` + 注入 `ALL_PROJECT_TOOLS` 与 `createAllToolExecutors`
- 工具循环结束后 `collector.drain()` → 逐条 `insertPendingAction` 持久化
- SYSTEM_PROMPT 已补充工具使用说明（查询 vs 写入、待确认机制）

## 剩余工作（UI 层 + 验证）

### 步骤 1：常量 `src/constants/pendingActions.ts`

集中维护待确认操作的状态与工具名中文映射，遵循 `src/constants/status.ts` 的 `Record<Enum, string>` 模式。

```ts
import type { PendingActionStatus } from '@/types'

export const PENDING_ACTION_STATUS_LABEL: Record<PendingActionStatus, string> = {
  pending: '待确认',
  applied: '已执行',
  rejected: '已拒绝',
}

export const PENDING_ACTION_TOOL_LABEL: Record<string, string> = {
  create_outline_node: '创建大纲节点',
  update_outline_node: '更新大纲节点',
  delete_outline_node: '删除大纲节点',
  create_document: '创建文档',
  append_document_content: '追加正文内容',
  create_card: '创建卡片',
  update_card: '更新卡片',
  update_card_status: '更新卡片状态',
  create_knowledge: '创建知识',
  update_knowledge: '更新知识',
}
```

### 步骤 2：Hook `src/hooks/usePendingActions.ts`

封装"按 messageId 加载 + 单条 apply/reject + 批量 applyAll"逻辑，UI 组件只消费此 hook。遵循 `src/hooks/useAsync.ts` 的 ServiceResult 处理风格。

职责：
- 入参 `messageId: string`
- `actions: PendingToolAction[]` 当前列表（按 createdAt 正序）
- `loading: boolean` / `error: AppError | null`
- `applyAction(actionId)` → 调 `applyPendingAction` → 成功后本地更新该条状态为 applied
- `rejectAction(actionId)` → 调 `rejectPendingAction` → 本地更新为 rejected
- `applyAll()` → 调 `applyAllPendingActions` → 重新加载列表
- `refresh()` → 重新拉取列表
- 仅在 `messageId` 变化时重新加载；操作后不整体重拉，仅更新单条以避免列表抖动

调用 PendingActionService 的三个方法：`listPendingActionsByMessageService` / `applyPendingAction` / `rejectPendingAction` / `applyAllPendingActions`。

### 步骤 3：组件 `src/components/agent/PendingActionItem.tsx`

单条待确认操作卡片，遵循 AGENTS.md 组件规范（单一职责、props 类型明确、<250 行、中文 UI、Heroicons）。

职责：
- 展示：工具名中文标签（PENDING_ACTION_TOOL_LABEL）+ summary + 状态标签（PENDING_ACTION_STATUS_LABEL）
- `pending` 状态显示「执行」「拒绝」两个按钮
- `applied` 显示「已执行」状态标签（绿色/brand）
- `rejected` 显示「已拒绝」状态标签（灰色/default）
- 执行中显示 loading 文案「正在执行...」，按钮禁用
- 失败时显示错误提示（通过 `alertMessage` 或 inline 错误文案）
- props：`action: PendingToolAction`、`onApply: (id) => void`、`onReject: (id) => void`、`processing?: boolean`、`errorMessage?: string | null`

使用 `@/components/foundation/StatusTag` 与 `@/components/foundation/AppIcon`，图标用 `CheckIcon`/`XMarkIcon`/`CommandLineIcon`（Heroicons 24 outline）。

### 步骤 4：组件 `src/components/agent/PendingActionList.tsx` + 测试

列表容器，整合 `usePendingActions` hook 并渲染 `PendingActionItem`。

职责：
- props：`messageId: string`
- 内部调用 `usePendingActions(messageId)`
- 空列表（actions.length === 0）→ 不渲染任何内容（返回 null），避免占位
- 有数据时渲染标题行「待确认操作」+ 列表
- 透传每条的 onApply/onReject/processing/errorMessage
- 「全部执行」按钮（仅当存在 ≥1 条 pending 时显示）

**测试文件** `src/components/agent/PendingActionList.test.tsx`（vitest + @testing-library/react）覆盖：
- 空列表返回 null
- 渲染多条 pending 操作
- 点击「执行」触发 onApply
- 点击「拒绝」触发 onReject
- 全部执行按钮存在性
- applied/rejected 状态不显示操作按钮

mock `@/services/agent/PendingActionService`，遵循 `useMessageActions.test.ts` 的 mock 模式。

### 步骤 5：集成到 `src/components/agent/AgentMessageItem.tsx`

在助手消息内容区（解释区之后、操作条之前）插入 `<PendingActionList messageId={message.id} />`。

修改要点：
- 顶部 import：`import { PendingActionList } from './PendingActionList'`
- 仅 `!isUser` 且助手消息时渲染（用户消息不渲染）
- 位置：在 `{message.explanation && ...}` 块之后、`{!isHandled && ...}` 操作条之前
- 无需新增 props（PendingActionList 自带 messageId，内部自管理状态）

预期插入位置（当前 [AgentMessageItem.tsx](file:///d:/workplace/idea/zhimo/src/components/agent/AgentMessageItem.tsx) 第 106 行之后、第 108 行之前）：

```tsx
{/* 待确认操作列表（写工具收集） */}
<PendingActionList messageId={message.id} />
```

### 步骤 6：类型检查与验证

执行以下命令确认无类型错误：

```powershell
npm run typecheck
```

如有错误，按报错修复（重点检查 PendingActionList/PendingActionItem 的 props 类型、usePendingActions 的 ServiceResult 解构）。

随后运行相关测试：

```powershell
npm test -- --run PendingActionList pendingActionCollector PendingActionService
```

## 假设与决策

1. **不重做已完成的基建层**：经文件核验，DB/类型/Repository/工具集/PendingActionService/AgentService 集成均已就绪，本计划仅补齐 UI 层。
2. **UI 操作后局部更新**：apply/reject 单条后只更新该条 status，不重新拉取整个列表，避免列表闪烁与滚动跳变；applyAll 后重新拉取。
3. **空列表不渲染**：PendingActionList 在无数据时返回 null，AgentMessageItem 无需条件判断。
4. **不引入新 store**：待确认操作的生命周期完全在 `usePendingActions` hook 内管理，无需进入 appStore（消息级临时状态）。
5. **遵循现有常量模式**：状态/工具名映射放 `src/constants/pendingActions.ts`，不散落组件内（满足 AGENTS.md §3.6）。
6. **不修改 AgentMessageList**：集成点在 AgentMessageItem，AgentMessageList 无需改动。
7. **技术债 PA-001 保留**：`append_document_content` 当前仅支持 append 模式，replace_section 模式留作后续，已在 documentTools.ts 注明。

## 验证清单

- [ ] `src/constants/pendingActions.ts` 创建，导出两个 Record
- [ ] `src/hooks/usePendingActions.ts` 创建，覆盖 load/apply/reject/applyAll/refresh
- [ ] `src/components/agent/PendingActionItem.tsx` 创建，<250 行，中文 UI
- [ ] `src/components/agent/PendingActionList.tsx` 创建，空列表返回 null
- [ ] `src/components/agent/PendingActionList.test.tsx` 创建并通过
- [ ] `src/components/agent/AgentMessageItem.tsx` 集成 PendingActionList
- [ ] `npm run typecheck` 通过
- [ ] 相关测试通过
