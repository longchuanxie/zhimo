# 主流 Agent 上下文压缩策略研究报告与优化方案

## 1. 摘要

用户要求探索主流 Agent（如 Claude Code、Cursor、Copilot）的上下文压缩策略，然后基于研究发现优化本项目的上下文压缩方案。

## 2. 主流 Agent 上下文压缩策略调研

### 2.1 Claude Code（Anthropic）

**触发机制**：上下文达到 95% 时自动触发 "auto-compact"

**压缩方式**：用 LLM 总结整个用户-代理交互轨迹，生成简洁的摘要替代原始历史

**关键特点**：
- 服务端处理，用户无感知
- 压缩后保留核心决策、承诺、事实和开放问题
- 摘要比重放原始交互更高效，同时维持叙事连贯性

### 2.2 Hermes Agent（Nous Research）

**触发机制**：双层压缩系统
- Agent Compressor：50% 上下文窗口触发
- Gateway Safety Net：85% 上下文窗口触发
- 两个阈值故意错开，避免每轮都压缩

**压缩方式**：可配置的压缩策略，支持自定义保留规则

### 2.3 ACON（微软 + KAIST 研究）

**论文**：[ACON: Optimizing Context Compression for Long-Horizon LLM Agents](https://arxiv.org/pdf/2510.00615v1)

**核心思想**：将环境观察和交互历史压缩成简洁的摘要

**效果**：减少 26-54% 内存使用，同时保持任务性能

### 2.4 通用设计模式

**Head-Tail 模式**（Claude Code + 业界通用）：
```
[系统提示 + 早期对话] → [LLM 总结的中间历史] → [最近 N 轮完整保留]
```

**压缩优先级策略**：
- 必选项：系统提示、最近用户指令
- 可压缩项：旧工具调用结果、完整历史轨迹
- 可丢弃项：重复确认信息、过时观察

## 3. 本项目现状分析

### 3.1 当前压缩机制

**ContextCompactor（已实现）**：
- 基于 modelMaxTokens 估算压缩比例
- 按优先级排除可选条目（card → knowledge → outline_node → source_chunk → source → document）
- 剩余条目文本截断到 150 字
- project_rules 截断到 100 字

**问题**：
1. 只能在 previewContext 时预压缩，无法在调用模型时动态压缩
2. 没有 LLM 驱动的语义压缩，只有启发式截断
3. Agent 对话历史未压缩，多轮对话累积

## 4. 最终推荐方案

### 4.1 方案概述

采用 **分层压缩 + LLM 摘要** 策略：

1. **分层压缩**：在调用模型前，根据上下文大小动态选择压缩级别
2. **LLM 摘要**：当上下文超限时，用 LLM 生成语义摘要替代原始条目
3. **Agent 历史压缩**：多轮对话时，压缩旧消息为摘要

### 4.2 实现细节

#### 改动 1：扩展 ContextCompactor

**文件**：`src/services/context/ContextCompactor.ts`

```typescript
export type CompressionLevel = 'light' | 'medium' | 'aggressive'

// 压缩级别阈值（相对于模型上下文上限）
export const COMPRESSION_THRESHOLDS = {
  light: 0.70,      // 70% 时轻量压缩：排除低优先级
  medium: 0.85,     // 85% 时中度压缩：截断文本
  aggressive: 0.95, // 95% 时激进压缩：LLM 摘要
}

export async function compactContext(
  entries: ContextEntry[],
  modelMaxTokens: number,
  level: CompressionLevel = 'light'
): Promise<ContextEntry[]>
```

#### 改动 2：AgentService 调用前预压缩

**文件**：`src/services/agent/AgentService.ts`

```typescript
// 在 buildModelMessages 前检测上下文大小
async function buildModelMessages(...) {
  const estimatedTokens = estimateCurrentContextSize(messages, contextPack)
  
  // 超过 70% 时触发轻量压缩
  if (estimatedTokens > modelMaxTokens * 0.70) {
    const compressedEntries = await compactContext(entries, modelMaxTokens, 'light')
    entries = compressedEntries
  }
  
  // 超过 85% 时触发中度压缩
  if (estimatedTokens > modelMaxTokens * 0.85) {
    const compressedEntries = await compactContext(entries, modelMaxTokens, 'medium')
    entries = compressedEntries
  }
  
  // ...
}
```

#### 改动 3：新增 LLM 摘要功能

**文件**：`src/services/context/ContextSummarizer.ts`（新建）

```typescript
interface SummarizationResult {
  summary: string
  keyDecisions: string[]
  openQuestions: string[]
  preservedFacts: string[]
}

/**
 * 用 LLM 对上下文条目进行语义压缩
 * 提取关键信息：决策、事实、开放问题
 */
export async function summarizeContextEntries(
  entries: ContextEntry[],
  targetTokenCount: number
): Promise<{ entries: ContextEntry[], summary: string }>
```

#### 改动 4：Agent 对话历史压缩

**文件**：`src/services/agent/AgentService.ts`

```typescript
// 当 thread.messageCount > 20 时，压缩前 10 轮为摘要
async function compressThreadHistory(threadId: string): Promise<void> {
  const messages = await listMessages(threadId)
  
  if (messages.length <= 10) return // 不足 10 条不压缩
  
  const oldMessages = messages.slice(0, Math.floor(messages.length / 2))
  const summary = await summarizeMessages(oldMessages)
  
  // 将摘要作为新条目加入 contextPack
  await appendCompressedHistory(threadId, summary)
}
```

### 4.3 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/context/ContextCompactor.ts` | 修改 | 支持多级压缩 |
| `src/services/context/ContextSummarizer.ts` | 新建 | LLM 摘要功能 |
| `src/services/agent/AgentService.ts` | 修改 | 集成预压缩 + 历史压缩 |
| `src/components/agent/ContextPreviewPanel.tsx` | 修改 | 显示压缩状态 |

## 5. 实施步骤

### Step 1：扩展 ContextCompactor（1h）
- 添加 CompressionLevel 类型
- 实现三级压缩策略

### Step 2：实现 LLM 摘要（3h）
- 创建 ContextSummarizer
- 实现语义压缩提示词
- 集成到压缩流程

### Step 3：AgentService 集成（2h）
- 调用前预压缩检查
- 历史消息压缩逻辑

### Step 4：UI 优化（1h）
- ContextPreviewPanel 显示压缩状态

## 6. 参考资料

1. [ACON: Optimizing Context Compression for Long-Horizon LLM Agents](https://arxiv.org/pdf/2510.00615v1)
2. [Context Engineering - LangChain](https://www.langchain.com/blog/context-engineering-for-agents)
3. [Context Window Management for Long-Running Agents](https://inductivee.com/blog/context-window-management-production)
4. [Context Compression in AI Agents: Hermes vs. Claude Code](https://mem0.ai/blog/how-hermes-and-claude-handle-context-compression-in-real-production-agents)
