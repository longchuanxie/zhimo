# 修复计划：Agent 提交大纲层级问题 & 大纲状态无法修改

## 0. 当前实现状态

经代码核查，本计划中的大部分代码改动**已经落盘**，当前处于**待验证**阶段：
- `src/services/outline/OutlineService.ts` 已修复 depth 计算，并已实现 `createOutlineNodesFromMarkdown`。
- `src/services/agent/tools/outlineTools.ts` 已新增 `create_outline_nodes_from_markdown` 工具定义与执行器，并加入 `OUTLINE_TOOLS`。
- `src/services/agent/PendingActionService.ts` 已增加 `create_outline_nodes_from_markdown` 路由。
- `src/features/outline/OutlinePage.tsx` 已在大纲节点上增加状态下拉选择器。
- `src/services/outline/OutlineService.test.ts`、`src/services/agent/tools/outlineTools.test.ts`、`src/services/agent/PendingActionService.test.ts` 已补充对应测试。

本计划当前重点是**复核代码正确性**与**运行验证命令**（typecheck + 单元测试）。

## 1. Summary

当前存在两个问题：
1. **Agent 提交的大纲结构层级异常**：Agent 只能通过 `create_outline_node` 逐个创建节点，难以维护 `parentId`，导致生成的大纲趋向扁平，甚至把标题与描述拆成同级节点。
2. **大纲节点状态无法修改**：UI 仅展示状态标签，没有给用户手动流转状态（草稿 → 写作中 → 已完成/已归档）的入口。

本计划通过以下方式修复：
- 新增 `create_outline_nodes_from_markdown` 工具，让 Agent 一次性提交完整 Markdown 大纲，由后端统一解析层级。
- 修复 `createOutlineNode` 中 depth 计算的优先级歧义。
- 在大纲页节点上增加状态下拉选择器。
- 补充单元测试覆盖层级解析、批量创建路由、状态修改。

## 2. Current State Analysis

### 2.1 关键文件
- `src/services/agent/tools/outlineTools.ts`：现有 5 个大纲工具，均为单节点操作。
- `src/services/outline/OutlineService.ts`：
  - `createOutlineNode`：逐节点创建，depth 计算代码存在 `??` 与 `+` 优先级歧义。
  - `createOutlineNodesFromMarkdown`：已支持从 Markdown `#` / `-` / `1.` 解析层级，但仅被 `useMessageActions.ts` 的 generate_outline 任务采纳流程使用，Agent 工具无法直接调用。
- `src/services/agent/PendingActionService.ts`：按 `toolName` 路由到业务 Service，目前无 Markdown 批量创建路由。
- `src/features/outline/OutlinePage.tsx`：树形展示节点，状态仅显示 `StatusTag`，无修改交互。
- `src/services/database/outlineRepository.ts`：`updateOutlineNode` 已支持 `status` 字段更新。
- `src/constants/status.ts`：`OUTLINE_NODE_STATUS_LABEL` 已定义 4 种状态中文映射。

### 2.2 问题根因
1. **层级问题根因**：
   - Agent 单节点工具要求调用方显式传入 `parentId`。Agent 在创建多个节点时，除非先创建父节点再拿到 ID 创建子节点，否则无法表达层级。
   - 现有 Markdown 解析能力没有被暴露给 Agent 工具。
   - `createOutlineNode` 的 depth 计算：`(await findOutlineNodeById(input.parentId))?.depth ?? 0 + 1`，由于 `??` 优先级低于 `+`，实际解析为 `(parent?.depth) ?? 1`，逻辑正确但可读性差，容易误导后续维护。

2. **状态修改根因**：
   - `OutlinePage.tsx` 的 `OutlineNodeItem` 只渲染 `<StatusTag>`，没有下拉或按钮触发 `updateOutlineNodeService({ nodeId, patch: { status } })`。

## 3. Proposed Changes

### 3.1 修复 `createOutlineNode` depth 计算歧义
**文件**：`src/services/outline/OutlineService.ts`
**改动**：
```ts
// 修改前
const depth = input.parentId
  ? (await findOutlineNodeById(input.parentId))?.depth ?? 0 + 1
  : 0

// 修改后
let depth = 0
if (input.parentId) {
  const parent = await findOutlineNodeById(input.parentId)
  depth = parent ? parent.depth + 1 : 0
}
```
**原因**：消除优先级歧义，并在 parentId 指向不存在的节点时降级为根节点（避免创建出 depth 异常的孤立节点）。

### 3.2 新增 Agent 工具 `create_outline_nodes_from_markdown`
**文件**：`src/services/agent/tools/outlineTools.ts`
**改动**：
- 新增 `CREATE_OUTLINE_NODES_FROM_MARKDOWN_TOOL` 工具定义：
  - 参数：`markdown: string`（必填），`replaceExisting: boolean`（可选，默认 false）
  - 描述：一次性从 Markdown 文本批量创建大纲节点，自动识别 `#` / `##` / `-` 缩进 / `1.` 等层级结构。
- 在 `createOutlineToolExecutors` 中新增执行器：
  - 读取 `markdown` 非空字符串。
  - 调用 `collectPending` 收集待确认操作，args 包含 `projectId`、`markdown`、`replaceExisting`。
- 将新工具加入 `OUTLINE_TOOLS` 数组。
**原因**：让 Agent 能够以自然的大纲 Markdown 格式一次性提交完整结构，避免逐节点维护 parentId 导致的扁平化问题。

### 3.3 在 PendingActionService 注册批量创建路由
**文件**：`src/services/agent/PendingActionService.ts`
**改动**：
- import `createOutlineNodesFromMarkdown`。
- 在 `routeAndExecute` 的 switch 中新增 case：
```ts
case 'create_outline_nodes_from_markdown': {
  const projectId = readRequiredString(args, 'projectId')
  const markdown = readRequiredString(args, 'markdown')
  if (!projectId || !markdown) {
    return err(validationError('projectId 与 markdown 必填'))
  }
  return createOutlineNodesFromMarkdown(projectId, markdown)
}
```
**原因**：让待确认操作能够正确路由到批量创建 Service。

### 3.4 大纲页 UI 增加状态修改入口
**文件**：`src/features/outline/OutlinePage.tsx`
**改动**：
- 新增状态选项数组：
```ts
const STATUS_OPTIONS: Array<{ value: OutlineNodeStatus; label: string }> = [
  { value: 'draft', label: '草稿' },
  { value: 'writing', label: '写作中' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
]
```
- 在 `OutlinePage` 中新增 `handleStatusChange`：
```ts
const handleStatusChange = async (nodeId: string, status: OutlineNodeStatus) => {
  const result = await updateOutlineNodeService({ nodeId, patch: { status } })
  if (result.ok) refresh()
  else setMsg(`状态更新失败：${result.error.message}`)
}
```
- 在 `OutlineNodeItem` 的状态标签位置替换为可点击的下拉选择器（与知识库列表页保持一致）：
  - 用相对定位包裹 `StatusTag` + 透明 `<select>`。
  - 选项为 `STATUS_OPTIONS`，排除当前状态。
  - onChange 调用 `onStatusChange(node.id, e.target.value)`。
- 扩展 `OutlineNodeItemProps` 和递归调用，透传 `onStatusChange`。
**原因**：让用户能直接在大纲树上修改节点状态。

### 3.5 补充测试
**文件**：
- `src/services/outline/OutlineService.test.ts`（如不存在则新建）
- `src/services/agent/PendingActionService.test.ts`（已有，追加 case）
- `src/services/agent/tools/outlineTools.test.ts`（如不存在则新建）

**测试点**：
1. `createOutlineNode` 在传入 parentId 时正确计算 depth = parent.depth + 1。
2. `createOutlineNodesFromMarkdown` 正确解析三级 Markdown 层级并建立父子关系。
3. PendingActionService 能正确路由 `create_outline_nodes_from_markdown`。
4. outlineTools 中 `create_outline_nodes_from_markdown` 执行器收集的待确认操作 args 正确。
5. OutlinePage 的状态选择器调用 `updateOutlineNodeService`（可选，如测试成本过高可仅做组件快照）。

## 4. Assumptions & Decisions

1. **不修改现有 `create_outline_node` 单节点工具**：保留单节点创建能力，新增批量 Markdown 工具作为补充。
2. **`replaceExisting` 默认 false**：先仅实现追加模式，避免误删用户已有大纲。如需覆盖，可在后续迭代中实现清空逻辑。
3. **Markdown 解析规则复用现有 `parseMarkdownOutline`**：不引入新的解析器，降低风险。
4. **状态修改 UI 采用透明 select 覆盖 StatusTag**：与知识库列表页已验证的交互模式保持一致，避免引入新的下拉组件。
5. **不处理状态批量修改**：本次仅解决单节点状态无法修改的问题，批量状态修改不在本计划范围内。

## 5. Verification Steps

1. 运行 `npm run typecheck`，确保 TypeScript 无错误。
2. 运行 `npx vitest run OutlineService PendingActionService outlineTools`，确保新增/更新测试通过。
3. 手动验证：
   - 在 Agent 对话中让 Agent 生成 Markdown 格式大纲，确认产生 `create_outline_nodes_from_markdown` 待确认操作。
   - 执行该待确认操作后，大纲页正确显示层级结构。
   - 在大纲页点击节点状态标签，可切换为其他状态并刷新显示。
