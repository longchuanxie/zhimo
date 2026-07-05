# ContextPreviewPanel UI 优化设计方案 v1.0

## 1. 概述

### 1.1 设计目标

- **对齐后端策略**：UI 根据任务类型差异化显示上下文项
- **直观展示**：通过 Token 进度条直观显示上下文消耗
- **智能提示**：上下文过大时提醒用户优化
- **分组清晰**：按上下文类型分组，提升可读性

### 1.2 与后端策略对应关系

| 任务类型 | 后端策略范围 | UI 显示策略 |
|----------|-------------|------------|
| rewrite | minimal | 只显示核心项，隐藏额外选项 |
| summarize | minimal | 只显示指令和选区 |
| format_text | minimal | 只显示核心项 |
| generate_card | related | 显示选区 + 文档 + 卡片，可折叠其他 |
| answer_question | related | 显示指令 + 可折叠各类 |
| expand | related | 显示选区 + 卡片/知识，可折叠更多 |
| check_source | whole_project | 显示全项目资料，分类展示 |
| generate_outline | whole_project | 显示大纲结构 + 资料 |

---

## 2. UI 布局设计

### 2.1 整体布局

```
┌────────────────────────────────────────────┐
│  本次参考内容                    [改写]    │  ← 头部：标题 + 任务类型标签
├────────────────────────────────────────────┤
│  ████████████░░░░░░░░░  约 800 tokens    │  ← Token 进度条
│  20%  ·  5 项                               │
├────────────────────────────────────────────┤
│  ▼ 必选（不可排除）                          │  ← 必选项分组
│    🔒 用户指令    改写当前选区...            │
│    🔒 当前选区    原文内容...                │
│    🔒 项目规则    写作风格...                │
├────────────────────────────────────────────┤
│  ▶ 可选                                     │  ← 可选项折叠区
│    ✓ 文档        文档标题...                │
│    ✓ 卡片        卡片标题...                │
│    ✗ 知识        已排除                    │
├────────────────────────────────────────────┤
│  ⚠️ 上下文较大，建议排除不相关内容           │  ← 智能提示（条件显示）
├────────────────────────────────────────────┤
│  [取消]                      [确认并发送]   │  ← 底部操作
└────────────────────────────────────────────┘
```

### 2.2 Token 进度条设计

**计算规则**：
- 建议上限：6000 tokens（约模型上下文 60%）
- 进度条宽度百分比：`min(totalTokens / 6000 * 100, 100)`

**颜色语义**：
| 消耗比例 | 颜色 | 状态 |
|----------|------|------|
| 0-50% | `bg-brand`（品牌蓝） | 正常 |
| 50-80% | `bg-yellow-500`（警告黄） | 适中 |
| 80-100% | `bg-orange-500`（提醒橙） | 较大 |
| >100% | `bg-red-500`（危险红） | 超限 |

---

## 3. 组件结构

### 3.1 组件拆分

```tsx
// ContextPreviewPanel.tsx（主容器）
// ├── Header（头部）
// │   ├── Title
// │   └── TaskTypeBadge
// ├── TokenProgress（Token 进度条）
// │   ├── ProgressBar
// │   └── TokenInfo
// ├── ContextGroups（分组列表）
// │   ├── RequiredGroup（必选项分组）
// │   └── OptionalGroup（可选项分组，可折叠）
// │       └── ContextEntryItem[]
// ├── SmartHint（智能提示）
// └── Footer（底部操作）
```

### 3.2 任务类型配置

```ts
// 任务类型配置
const TASK_TYPE_CONFIG: Record<AgentTaskType, TaskUIConfig> = {
  rewrite: {
    label: '改写',
    color: 'purple',
    showOptional: false,           // 默认隐藏可选项
    expandOptionalByDefault: false,
  },
  summarize: {
    label: '摘要',
    color: 'blue',
    showOptional: false,
    expandOptionalByDefault: false,
  },
  format_text: {
    label: '格式化',
    color: 'gray',
    showOptional: false,
    expandOptionalByDefault: false,
  },
  generate_card: {
    label: '生成卡片',
    color: 'green',
    showOptional: true,
    expandOptionalByDefault: true,
  },
  answer_question: {
    label: '问答',
    color: 'cyan',
    showOptional: true,
    expandOptionalByDefault: false,
  },
  expand: {
    label: '扩写',
    color: 'orange',
    showOptional: true,
    expandOptionalByDefault: false,
  },
  check_source: {
    label: '检查来源',
    color: 'red',
    showOptional: true,
    expandOptionalByDefault: true,
  },
  generate_outline: {
    label: '生成大纲',
    color: 'yellow',
    showOptional: true,
    expandOptionalByDefault: true,
  },
}
```

---

## 4. 分组显示逻辑

### 4.1 分组规则

| 分组 | 包含类型 | 显示规则 |
|------|----------|----------|
| 必选项 | user_instruction, selected_text, project_rules（必选部分） | 始终显示，折叠 |
| 文档组 | document | minimal 模式隐藏，其他模式显示 |
| 资料组 | source, source_chunk | minimal 模式隐藏 |
| 卡片组 | card | minimal 模式隐藏 |
| 知识组 | knowledge | minimal 模式隐藏 |
| 大纲组 | outline_node | 只在 generate_outline 任务显示 |
| 历史组 | previous_message | 按需显示 |

### 4.2 折叠逻辑

```tsx
// minimal 任务：可选项默认折叠或隐藏
const shouldShowOptional = TASK_TYPE_CONFIG[preview.taskType]?.showOptional ?? true
const expandByDefault = TASK_TYPE_CONFIG[preview.taskType]?.expandOptionalByDefault ?? false

// 可选分组
<Collapsible defaultOpen={expandByDefault}>
  {shouldShowOptional && optionalEntries.map(entry => (
    <ContextEntryItem key={entry.refId} ... />
  ))}
</Collapsible>
```

---

## 5. 智能提示设计

### 5.1 提示条件

| 条件 | 提示文案 | 类型 |
|------|----------|------|
| totalTokens > 8000 | ⚠️ 上下文较大（{totalTokens} tokens），建议排除不相关内容以提升响应质量 | warning |
| totalTokens > 10000 | ⚠️ 上下文过大，可能影响响应速度和生成质量，建议精简 | error |
| optionalCount > 10 | 💡 建议排除不相关的 {optionalCount} 项参考内容 | hint |
| selectedText.length > 3000 | 💡 当前选区较长，已自动截断至 {maxLen} 字 | info |

### 5.2 提示组件

```tsx
type HintType = 'info' | 'warning' | 'error' | 'hint'

type SmartHintProps = {
  type: HintType
  message: string
  onAction?: () => void  // 可选的操作按钮
}

function SmartHint({ type, message, onAction }: SmartHintProps) {
  const config = {
    info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
    warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
    error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
    hint: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600' },
  }
  // ...
}
```

---

## 6. 交互设计

### 6.1 条目操作

| 操作 | 触发条件 | 效果 |
|------|----------|------|
| 排除 | 点击可选条目的复选框 | 条目变灰，内容隐藏，Token 减少 |
| 恢复 | 再次点击已排除条目 | 条目恢复正常，Token 恢复 |
| 查看详情 | 点击条目（可选） | 展开显示完整内容（可折叠） |

### 6.2 快捷操作

| 操作 | 触发条件 | 效果 |
|------|----------|------|
| 排除同类 | 长按分组标题 | 排除该分组所有可选条目 |
| 恢复同类 | 长按分组标题（已排除状态） | 恢复该分组所有条目 |
| 全部展开 | 点击"展开更多" | 展开所有折叠分组 |
| 全部折叠 | 点击"收起" | 折叠所有可选分组 |

---

## 7. 响应式设计

### 7.1 宽度适配

| 宽度 | 布局调整 |
|------|----------|
| >= 400px | 完整布局，分组标题 + 条目 |
| 300-400px | 分组标题简化，条目紧凑显示 |
| < 300px | 隐藏分组标题，条目垂直堆叠 |

### 7.2 面板高度

- 最大高度：`calc(100vh - 200px)`
- 内容区可滚动
- Token 进度条固定在顶部

---

## 8. 实现计划

### 8.1 第一阶段（MVP）

- [ ] Token 进度条组件
- [ ] 任务类型标签
- [ ] 必选项/可选项分组
- [ ] 智能提示（基础版）

### 8.2 第二阶段

- [ ] 可选分组折叠/展开
- [ ] 快捷操作（排除同类）
- [ ] 条目详情展开

### 8.3 第三阶段

- [ ] 响应式布局优化
- [ ] 动画效果
- [ ] 更多智能提示

---

## 9. API 对齐

### 9.1 ContextPreview 类型扩展（可选）

```ts
// 建议在 ContextPreview 中添加 UI 提示字段
interface ContextPreview {
  // ... 现有字段

  // UI 相关（后端计算）
  hint?: {
    type: 'info' | 'warning' | 'error' | 'hint'
    message: string
  }
  groups?: {
    required: ContextEntryKind[]      // 必选类型列表
    optional: ContextEntryKind[]      // 可选类型列表
  }
}
```

### 9.2 前端计算（推荐）

保持后端不变，前端根据 `taskType` 和 `entries` 计算 UI 显示逻辑，更灵活。

```ts
function getGroupedEntries(entries: ContextEntry[], taskType: AgentTaskType) {
  const config = TASK_TYPE_CONFIG[taskType]
  const required = entries.filter(e => e.required)
  const optional = entries.filter(e => !e.required)

  // 根据任务类型进一步分组
  // ...
}
```

---

## 10. 预期效果

### 改写任务

```
┌────────────────────────────────────────────┐
│  本次参考内容                    [改写]    │
├────────────────────────────────────────────┤
│  ██████░░░░░░░░░░░░░░░░░  约 400 tokens  │
│  7%  ·  3 项                               │
├────────────────────────────────────────────┤
│  ▼ 必选（不可排除）                          │
│    🔒 用户指令    请改写当前选区...          │
│    🔒 当前选区    原文内容...                │
│    🔒 项目规则    写作风格...                │
├────────────────────────────────────────────┤
│                    [确认并发送]              │
└────────────────────────────────────────────┘
```

### 检查来源任务

```
┌────────────────────────────────────────────┐
│  本次参考内容               [检查来源]      │
├────────────────────────────────────────────┤
│  ████████████████░░░░░░░  约 4500 tokens  │
│  75%  ·  18 项                             │
├────────────────────────────────────────────┤
│  ▼ 必选（不可排除）                          │
│    🔒 用户指令    检查来源...                │
│    🔒 当前选区    原文内容...                │
│    🔒 项目规则    禁止虚构数据...            │
├────────────────────────────────────────────┤
│  ▼ 资料（3 项）                             │
│    ✓ 资料 A    摘要内容...                  │
│    ✓ 资料 B    摘要内容...                  │
│    ✗ 资料 C    已排除                      │
├────────────────────────────────────────────┤
│  ▼ 卡片（5 项）                             │
│    ✓ 卡片 A    内容...                      │
│    ...                                      │
├────────────────────────────────────────────┤
│  ⚠️ 上下文较大，建议排除不相关内容           │
├────────────────────────────────────────────┤
│  [取消]                      [确认并发送]    │
└────────────────────────────────────────────┘
```
