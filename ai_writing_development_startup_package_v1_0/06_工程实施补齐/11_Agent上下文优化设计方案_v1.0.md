# Agent 上下文优化设计方案 v1.0

## 1. 背景与目标

### 1.1 当前问题

当前 `previewContext` 对所有任务类型使用相同的上下文组装逻辑：
- 无论什么任务，都尝试加载全项目文档/资料/卡片/知识/大纲
- 上下文条目数量和 token 消耗与任务类型无关
- 导致：
  - 改写/摘要等轻量任务消耗过多 token
  - 检查来源/生成大纲等重量任务可能上下文不足
  - LLM 受到无关信息干扰

### 1.2 优化目标

根据任务类型差异化组装上下文：
- 轻量任务（改写/摘要）：最小化上下文，只保留必要项
- 重量任务（检查来源/生成大纲）：最大化上下文，全项目搜索
- 平衡任务（扩写/问答）：适度上下文，按相关性筛选

---

## 2. 上下文类型分类

### 2.1 上下文条目类型

| 类型 | 说明 | 典型 token/条 |
|------|------|---------------|
| `user_instruction` | 用户指令 | 10-200 |
| `selected_text` | 当前选区 | 0-2000 |
| `project_rules` | 项目规则（写作目标/目标读者/风格/禁止） | 50-500 |
| `current_document` | 当前文档全文或摘要 | 100-5000 |
| `source` | 资料摘要 | 100-500 |
| `source_chunk` | 资料片段 | 200-1000 |
| `card` | 卡片内容 | 50-500 |
| `knowledge` | 知识内容 | 50-500 |
| `outline_node` | 大纲节点 | 50-200 |
| `previous_message` | 历史消息摘要 | 100-500 |

### 2.2 上下文范围

| 范围 | 说明 | 适用场景 |
|------|------|----------|
| `minimal` | 只加载必要项 | 改写、摘要、格式化 |
| `current_object` | 当前绑定对象 | 定向任务 |
| `related` | 相关对象（当前文档关联的卡片/资料） | 扩写、问答 |
| `whole_project` | 全项目搜索 | 检查来源、生成大纲、生成卡片 |

---

## 3. 任务上下文策略

### 3.1 策略配置

每种任务类型对应一个上下文策略：

```ts
type ContextStrategy = {
  /// 任务类型
  taskType: AgentTaskType

  /// 上下文范围
  scope: 'minimal' | 'current_object' | 'related' | 'whole_project'

  /// 需要加载的上下文类型及其优先级
  contextTypes: {
    type: ContextEntryKind
    /// 优先级（数字越小越高）
    priority: number
    /// 最大条数（null 表示不限制）
    maxCount?: number
    /// 最大 token（null 表示不限制）
    maxTokens?: number
    /// 是否必须（不可排除）
    required: boolean
  }[]

  /// 截断策略
  truncate: {
    /// 选区文本截断长度（null 表示不截断）
    selectedTextMaxLen?: number
    /// 文档截断长度
    documentMaxLen?: number
    /// 单条上下文截断长度
    entryMaxLen?: number
  }

  /// 上下文摘要策略
  summaryPolicy: 'none' | 'auto' | 'required'
}
```

### 3.2 各任务类型策略

#### 改写（rewrite）

```ts
{
  taskType: 'rewrite',
  scope: 'minimal',
  contextTypes: [
    { type: 'user_instruction', priority: 1, required: true },
    { type: 'selected_text', priority: 2, required: true },
    { type: 'project_rules', priority: 3, required: true }, // 只取风格规则
  ],
  truncate: {
    selectedTextMaxLen: null,     // 保留完整选区
    entryMaxLen: 100,             // 规则截断到 100 字
  },
  summaryPolicy: 'none',
}
```

**理由**：改写只需要知道用户指令、当前文本、项目风格。过多上下文会干扰风格一致性。

#### 扩写（expand）

```ts
{
  taskType: 'expand',
  scope: 'related',
  contextTypes: [
    { type: 'user_instruction', priority: 1, required: true },
    { type: 'selected_text', priority: 2, required: true },
    { type: 'project_rules', priority: 3, required: true },
    { type: 'current_document', priority: 4, maxCount: 1, required: false },
    { type: 'card', priority: 5, maxCount: 5, maxTokens: 2000, required: false },
    { type: 'knowledge', priority: 6, maxCount: 3, maxTokens: 1000, required: false },
  ],
  truncate: {
    selectedTextMaxLen: null,
    documentMaxLen: 2000,
    entryMaxLen: 300,
  },
  summaryPolicy: 'auto',
}
```

**理由**：扩写需要参考资料/卡片/知识，但要控制总量。使用相关性排序取前 N 条。

#### 摘要（summarize）

```ts
{
  taskType: 'summarize',
  scope: 'minimal',
  contextTypes: [
    { type: 'user_instruction', priority: 1, required: true },
    { type: 'selected_text', priority: 2, required: true },
  ],
  truncate: {
    selectedTextMaxLen: 5000,     // 限制在 5000 字内
    entryMaxLen: 200,
  },
  summaryPolicy: 'auto',          // 选区过长时自动摘要
}
```

**理由**：摘要任务只需要原文，过多上下文会导致摘要偏离主题。

#### 检查来源（check_source）

```ts
{
  taskType: 'check_source',
  scope: 'whole_project',
  contextTypes: [
    { type: 'user_instruction', priority: 1, required: true },
    { type: 'selected_text', priority: 2, required: true },
    { type: 'project_rules', priority: 3, required: true },
    { type: 'source', priority: 4, maxCount: 10, maxTokens: 5000, required: false },
    { type: 'card', priority: 5, maxCount: 10, maxTokens: 3000, required: false },
    { type: 'knowledge', priority: 6, maxCount: 5, maxTokens: 2000, required: false },
  ],
  truncate: {
    selectedTextMaxLen: null,
    entryMaxLen: 500,
  },
  summaryPolicy: 'auto',
}
```

**理由**：检查来源需要搜索全项目资料，寻找与当前文本相关的证据。

#### 生成大纲（generate_outline）

```ts
{
  taskType: 'generate_outline',
  scope: 'whole_project',
  contextTypes: [
    { type: 'user_instruction', priority: 1, required: true },
    { type: 'project_rules', priority: 2, required: true }, // 写作目标是关键
    { type: 'outline_node', priority: 3, maxCount: 20, required: false },
    { type: 'source', priority: 4, maxCount: 10, maxTokens: 3000, required: false },
    { type: 'card', priority: 5, maxCount: 10, maxTokens: 2000, required: false },
    { type: 'knowledge', priority: 6, maxCount: 5, maxTokens: 1500, required: false },
  ],
  truncate: {
    selectedTextMaxLen: null,     // 无选区
    documentMaxLen: 1000,
    entryMaxLen: 300,
  },
  summaryPolicy: 'required',
}
```

**理由**：生成大纲需要全项目视角，收集所有可用的素材和已有结构。

#### 生成卡片（generate_card）

```ts
{
  taskType: 'generate_card',
  scope: 'related',
  contextTypes: [
    { type: 'user_instruction', priority: 1, required: true },
    { type: 'selected_text', priority: 2, required: true },
    { type: 'current_document', priority: 3, maxCount: 1, required: false },
    { type: 'card', priority: 4, maxCount: 3, maxTokens: 500, required: false },
  ],
  truncate: {
    selectedTextMaxLen: null,
    documentMaxLen: 1000,
    entryMaxLen: 200,
  },
  summaryPolicy: 'auto',
}
```

**理由**：卡片生成需要从选区和上下文中提取结构化知识，不需要全项目资料。

#### 问答（answer_question）

```ts
{
  taskType: 'answer_question',
  scope: 'related',
  contextTypes: [
    { type: 'user_instruction', priority: 1, required: true },
    { type: 'project_rules', priority: 2, required: false },
    { type: 'current_document', priority: 3, maxCount: 1, required: false },
    { type: 'card', priority: 4, maxCount: 5, maxTokens: 2000, required: false },
    { type: 'knowledge', priority: 5, maxCount: 5, maxTokens: 2000, required: false },
    { type: 'source', priority: 6, maxCount: 3, maxTokens: 1500, required: false },
  ],
  truncate: {
    entryMaxLen: 400,
  },
  summaryPolicy: 'auto',
}
```

**理由**：问答根据问题类型动态调整，用户可以排除不需要的上下文。

#### 格式化（format_text）

```ts
{
  taskType: 'format_text',
  scope: 'minimal',
  contextTypes: [
    { type: 'user_instruction', priority: 1, required: true },
    { type: 'selected_text', priority: 2, required: true },
    { type: 'project_rules', priority: 3, required: false }, // 只取格式相关规则
  ],
  truncate: {
    selectedTextMaxLen: null,
    entryMaxLen: 100,
  },
  summaryPolicy: 'none',
}
```

**理由**：格式化只需要知道用户想要的格式要求和当前文本。

---

## 4. 实现方案

### 4.1 策略配置表

在 `ContextService.ts` 中定义策略配置：

```ts
const CONTEXT_STRATEGIES: Record<AgentTaskType, ContextStrategy> = {
  rewrite: { /* 见 3.2 */ },
  expand: { /* 见 3.2 */ },
  summarize: { /* 见 3.2 */ },
  check_source: { /* 见 3.2 */ },
  generate_outline: { /* 见 3.2 */ },
  generate_card: { /* 见 3.2 */ },
  answer_question: { /* 见 3.2 */ },
  format_text: { /* 见 3.2 */ },
}
```

### 4.2 策略感知的上下文组装

修改 `previewContext`，根据策略组装上下文：

```ts
export async function previewContext(
  input: PreviewContextInput,
): Promise<ServiceResult<ContextPreview>> {
  const strategy = CONTEXT_STRATEGIES[input.taskType]

  // 1. 按优先级加载各类上下文
  for (const ctxType of strategy.contextTypes.sort((a, b) => a.priority - b.priority)) {
    await loadContextByType(entries, ctxType, input, strategy)
  }

  // 2. 应用截断策略
  applyTruncatePolicy(entries, strategy.truncate)

  // 3. 应用 token 限制
  applyTokenLimit(entries, strategy.contextTypes)

  // ...
}
```

### 4.3 上下文加载函数

```ts
async function loadContextByType(
  entries: ContextEntry[],
  ctxType: ContextStrategy['contextTypes'][0],
  input: PreviewContextInput,
  strategy: ContextStrategy,
): Promise<void> {
  switch (ctxType.type) {
    case 'user_instruction':
      // 始终加载，必选
      break

    case 'selected_text':
      // 有选区才加载
      if (input.selectedText) { /* 添加条目 */ }
      break

    case 'project_rules':
      // 根据策略选择性加载（改写只加载风格规则）
      loadProjectRules(entries, project, strategy, ctxType)
      break

    case 'current_document':
      // 加载当前文档
      if (strategy.scope !== 'minimal') { /* 加载 */ }
      break

    case 'card':
      // 根据策略加载
      if (strategy.scope === 'whole_project') {
        loadAllCards(entries, input, ctxType)
      } else if (strategy.scope === 'related') {
        loadRelatedCards(entries, input, ctxType)
      }
      break

    // ... 其他类型
  }
}
```

### 4.4 Token 限制应用

```ts
function applyTokenLimit(
  entries: ContextEntry[],
  contextTypes: ContextStrategy['contextTypes'],
): void {
  // 计算每个类型的 token 配额
  const typeBudgets = new Map<ContextEntryKind, number>()

  for (const ctxType of contextTypes) {
    if (ctxType.maxTokens) {
      typeBudgets.set(ctxType.type, ctxType.maxTokens)
    }
  }

  // 对每个类型按优先级截断
  for (const [type, budget] of typeBudgets) {
    const typeEntries = entries.filter(e => e.kind === type && !e.excluded)
    let currentTokens = 0

    for (const entry of typeEntries) {
      if (currentTokens + entry.tokenEstimate > budget) {
        entry.excluded = true
      } else {
        currentTokens += entry.tokenEstimate
      }
    }
  }

  // 总体 token 限制（可选）
  const MAX_TOTAL_TOKENS = 6000
  let totalTokens = 0
  for (const entry of entries.filter(e => !e.excluded)) {
    if (totalTokens + entry.tokenEstimate > MAX_TOTAL_TOKENS) {
      entry.excluded = true
    } else {
      totalTokens += entry.tokenEstimate
    }
  }
}
```

---

## 5. 用户体验

### 5.1 预览面板优化

根据任务类型，预览面板显示不同的上下文项：

| 任务类型 | 默认显示 | 默认隐藏（可展开） |
|----------|----------|-------------------|
| 改写 | 指令、选区、风格规则 | 无 |
| 扩写 | 指令、选区、相关卡片 | 知识、更多卡片 |
| 摘要 | 指令、选区 | 无 |
| 检查来源 | 指令、选区、推荐资料 | 更多资料/卡片 |
| 生成大纲 | 指令、写作目标、大纲结构 | 资料、卡片、知识 |
| 生成卡片 | 指令、选区 | 相关上下文 |
| 问答 | 指令 | 各类上下文 |

### 5.2 Token 指示器

预览面板顶部显示当前上下文 token 估算：

```
本次参考内容（约 1,250 tokens）
████████░░░░░░░░░░░░░░░░░░░░  21%
```

用户可以直观看到上下文消耗量。

### 5.3 智能提示

当上下文超过建议阈值时，提示用户：

```
⚠️ 当前上下文较大（8,500 tokens），建议排除不相关的资料以提升响应质量。
```

---

## 6. 迁移计划

### 6.1 第一阶段：策略配置（MVP 简化）

定义每种任务类型的策略配置表，不做复杂的动态计算。

### 6.2 第二阶段：截断优化

实现 `applyTruncatePolicy` 和 `applyTokenLimit`。

### 6.3 第三阶段：用户体验

- 预览面板根据任务类型显示不同上下文
- Token 指示器
- 智能提示

---

## 7. 预期效果

| 任务类型 | 优化前 token | 优化后 token | 节省比例 |
|----------|-------------|-------------|---------|
| 改写 | ~5,000 | ~800 | 84% |
| 扩写 | ~5,000 | ~2,500 | 50% |
| 摘要 | ~5,000 | ~500 | 90% |
| 检查来源 | ~5,000 | ~4,000 | 20% |
| 生成大纲 | ~5,000 | ~4,000 | 20% |
| 生成卡片 | ~5,000 | ~1,500 | 70% |
| 问答 | ~5,000 | ~2,000 | 60% |

---

## 8. 附录：类型定义

```ts
type AgentTaskType =
  | 'rewrite'
  | 'expand'
  | 'summarize'
  | 'check_source'
  | 'generate_outline'
  | 'generate_card'
  | 'answer_question'
  | 'format_text'

type ContextEntryKind =
  | 'user_instruction'
  | 'selected_text'
  | 'project_rules'
  | 'document'
  | 'source'
  | 'source_chunk'
  | 'card'
  | 'knowledge'
  | 'outline_node'
  | 'previous_message'

type ContextScope = 'minimal' | 'current_object' | 'related' | 'whole_project'

type ContextStrategy = {
  taskType: AgentTaskType
  scope: ContextScope
  contextTypes: ContextTypeConfig[]
  truncate: TruncatePolicy
  summaryPolicy: 'none' | 'auto' | 'required'
}

type ContextTypeConfig = {
  type: ContextEntryKind
  priority: number
  maxCount?: number
  maxTokens?: number
  required: boolean
}

type TruncatePolicy = {
  selectedTextMaxLen?: number
  documentMaxLen?: number
  entryMaxLen?: number
}
```
