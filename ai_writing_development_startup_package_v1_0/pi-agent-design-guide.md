## Pi Agent 设计准则参考

基于 pi-agent 项目（monorepo 架构）的深度代码研读，提炼出以下 agent 设计准则，供后续自行设计 agent 系统时参考。

---

## 一、整体架构：三层分层设计

Pi 的 agent 系统采用严格的分层架构，自底向上分为三层：

**底层 — AI 传输层（pi-ai）**：提供与 LLM 提供商的通信抽象。负责模型定义、API Key 解析、SSE 流式解析、Token 计数。这一层不知道"agent"的存在，只关心"给定消息列表，返回流式响应"。

**中间层 — Agent 核心循环（pi-agent-core）**：实现 agent 的状态机——Turn 循环、工具执行、事件发射、消息队列。这一层不关心具体的 UI 模式或文件系统，只通过注入的 `streamFn` 和 `beforeToolCall` / `afterToolCall` 钩子与外部交互。

**顶层 — Coding Agent（pi-coding-agent）**：具体的产品层。包含 CLI 入口、工具实现（bash/read/edit/write/grep/find/ls）、扩展系统、会话管理、系统提示词组装、上下文压缩、RPC 模式等。

**设计启示**：分层隔离使得每一层可以独立替换。比如要换 LLM 提供商只需改底层，要换 UI（TUI/RPC/Web）只需改顶层，核心循环保持不变。

---

## 二、Agent 核心循环

### 2.1 Turn 生命周期

一个完整的 agent turn 遵循以下流程：

```
用户输入
  → 扩展拦截（input 事件，可 transform/handle）
  → 扩展预处理（before_agent_start，可注入消息、修改系统提示词）
  → agent_start 事件
  → turn_start 事件
  → 上下文变换（transformContext 钩子）
  → 消息格式转换（convertToLlm）
  → 调用 LLM（streamFn）
  → 流式输出：message_start → message_update（逐 token）→ message_end
  → 如果 LLM 请求工具调用：
      → tool_execution_start
      → beforeToolCall 钩子（可扩展拦截/修改参数/阻止执行）
      → tool.execute()
      → tool_execution_update（流式中间结果）
      → tool_execution_end
      → afterToolCall 钩子（可修改返回结果）
      → 将工具结果追加到消息列表
      → turn_end
      → 回到"调用 LLM"开始下一轮
  → 如果 LLM 没有请求工具调用：
      → turn_end
  → agent_end
  → 后处理（自动重试 / 上下文压缩 / 消息队列检查）
```

### 2.2 停止决策

Agent 何时停止由以下逻辑决定：

- LLM 返回 `stopReason: "stop"` 且没有工具调用 → 正常结束
- LLM 返回工具调用 → 执行工具后继续下一轮
- LLM 返回错误 → 判断是否可重试（速率限制、5xx、网络超时等可重试；余额不足、上下文溢出不可重试）
- 上下文溢出 → 触发自动压缩，压缩后若恢复了可用空间则继续
- 消息队列（steering/follow-up）中还有待处理消息 → 继续

### 2.3 消息队列机制

Agent 运行期间，外部可以向运行中的 agent 注入消息，通过两个队列实现：

- **Steering Queue**（引导队列）：中断当前 turn，在下一轮开始前注入
- **Follow-up Queue**（后续队列）：等当前 turn 完成后注入

每个队列支持两种排空模式：`"all"`（一次排空全部）和 `"one-at-a-time"`（每次只排空最老的一条）。

---

## 三、工具系统

### 3.1 Tool 定义接口

每个工具遵循统一的 `ToolDefinition` 契约：

```typescript
interface ToolDefinition<TParams, TDetails, TState> {
    name: string;                    // LLM 调用的工具名
    label: string;                   // 人类可读的 UI 标签
    description: string;             // 给 LLM 的工具描述
    promptSnippet?: string;          // 系统提示词中的一行描述
    promptGuidelines?: string[];     // 系统提示词中的使用指南
    parameters: TParams;             // TypeBox Schema（运行时校验 + TS 类型推导）
    executionMode?: "sequential" | "parallel";  // 执行模式
    prepareArguments?: (args) => TParams;        // 参数预处理器
    execute(toolCallId, params, signal, onUpdate, ctx): Promise<AgentToolResult<TDetails>>;
    renderCall?(args, theme, context): Component;   // TUI 调用展示
    renderResult?(result, options, theme, context): Component;  // TUI 结果展示
}
```

### 3.2 工具执行三阶段

工具执行分为准备、执行、终结三个阶段：

**准备阶段**：查找工具 → `prepareArguments` 参数预处理 → Schema 校验 → `beforeToolCall` 钩子（可阻止执行或修改参数）。

**执行阶段**：调用 `tool.execute()`，传入 `AbortSignal` 和 `onUpdate` 回调。工具的中间更新通过 `onUpdate` 发射为 `tool_execution_update` 事件。

**终结阶段**：`afterToolCall` 钩子可修改返回内容的 `content`、`details`、`isError`、`terminate` 字段。

### 3.3 顺序 vs 并行执行

当 LLM 在一次响应中请求多个工具调用时：

- 如果批次中任何一个工具的 `executionMode` 为 `"sequential"`，整个批次串行执行
- 否则并行执行：准备阶段仍然串行，但 execute 阶段通过 `Promise.all()` 并发运行
- 并行执行时，`tool_execution_end` 按完成顺序发射，但工具结果消息按原始顺序追加（保持 LLM 上下文的一致性）

### 3.4 工具设计模式总结

通过研读 6 个内建工具（bash、read、edit、write、grep、find），提炼出以下通用模式：

**可插拔操作接口**：每个工具定义一个 `XxxOperations` 接口（如 `BashOperations`、`ReadOperations`），提供默认本地实现，允许注入远程实现（SSH、容器等）。这是依赖注入的核心接缝。

**双层工厂函数**：每个工具导出 `createXxxToolDefinition()`（返回完整定义）和 `createXxxTool()`（包装为 AgentTool）。

**错误处理策略**：错误通过 throw 抛出而非编码在返回值中。执行器会将其包装为 `isError: true` 的工具结果。bash 工具还会将已产生的输出附加到错误消息前，让 LLM 同时看到部分输出和失败原因。

**截断与续读提示**：所有工具使用统一的截断系统（`truncateHead` / `truncateTail`），并在截断时附加可操作的续读提示，如"Use offset=501 to continue"或"Use limit=200 for more"。

**Abort Signal 处理**：三种模式——事件监听器（bash，调用 `killProcessTree`）、轮询检查（edit/write，用 `throwIfAborted()` 在异步步骤间检查）、settled 守卫（grep/find，用布尔标志防止重复 resolve）。

**文件变更队列**：edit 和 write 使用 `withFileMutationQueue()` 串行化同一文件的并发写入，防止 LLM 并行工具调用时的竞态条件。

---

## 四、扩展系统

### 4.1 发现与加载

扩展从三个位置自动发现：项目级（`cwd/.pi/extensions/`）、全局级（`agentDir/extensions/`）、以及配置中显式指定的路径。每个扩展是一个 TypeScript 文件，默认导出一个工厂函数 `(pi: ExtensionAPI) => void`。

加载时使用 jiti（TypeScript/ESM 加载器）动态导入，并为扩展提供虚拟模块（typebox、pi-agent-core、pi-ai 等），使扩展可以引用核心包而无需自行安装。

### 4.2 两阶段初始化

扩展加载采用"先占位后绑定"模式：

1. **加载阶段**：所有 action 方法（sendMessage、setModel 等）替换为抛错桩函数，扩展只能做注册操作（注册事件处理器、工具、命令等）
2. **绑定阶段**（`bindCore()`）：注入真实实现，刷新排队中的 provider 注册

这防止了扩展在初始化期间过早调用尚未就绪的服务。

### 4.3 事件系统

约 30 种事件类型覆盖 agent 全生命周期，关键事件包括：

| 事件 | 用途 | 能力 |
|------|------|------|
| `input` | 用户输入拦截 | 可 transform（修改文本）或 handle（接管处理） |
| `before_agent_start` | agent 启动前 | 可注入自定义消息、替换系统提示词 |
| `context` | 每次 LLM 调用前 | 可变换整个消息数组 |
| `tool_call` | 工具调用前 | 可阻止执行、修改参数 |
| `tool_result` | 工具执行后 | 可修改返回结果 |
| `session_before_compact` | 上下文压缩前 | 可取消或提供自定义压缩结果 |
| `before_provider_request` | HTTP 请求前 | 可修改发送给 LLM 的原始载荷 |

扩展事件支持链式处理：多个扩展依次处理同一事件，每个看到上一个的输出。

### 4.4 过期保护

当会话被替换（newSession、fork、switchSession）时，旧的 `ExtensionContext` 被标记为过期，后续调用会抛出带有描述性信息的错误，而非在过期状态上静默操作。

---

## 五、系统提示词组合

### 5.1 默认结构

系统提示词按以下顺序组装：

1. **角色声明**："You are an expert coding assistant operating inside pi, a coding agent harness."
2. **可用工具列表**：从 `toolSnippets` 中筛选当前激活的工具
3. **使用指南**：动态组装，包括工具特定指南和扩展指南
4. **文档引用路径**：指向 readme、docs、examples
5. **附加系统提示词**（`appendSystemPrompt`，由扩展注入）
6. **项目上下文**：每个 context file 用 XML 标签包裹 `<project_instructions path="...">`
7. **技能列表**：格式化的 skill 描述
8. **当前日期和工作目录**

### 5.2 动态修改

扩展可通过 `before_agent_start` 事件替换整个系统提示词，多个扩展链式处理（每个看到上一个的替换结果）。这使得不同的工作模式（如代码审查模式、文档编写模式）可以完全替换 agent 的行为。

---

## 六、上下文管理与压缩

### 6.1 Token 估算

优先使用 LLM 返回的实际 token 用量数据，对没有实际数据的消息使用 `chars/4` 粗估。图片内容按约 4800 chars 计算。

### 6.2 压缩触发

当 `contextTokens > contextWindow - reserveTokens`（默认 reserve 16384 tokens）时触发压缩。

### 6.3 切割点选择

从最新消息向前累积 token，直到超过 `keepRecentTokens`（默认 20000），找到最近的合法切割点（user/assistant/custom 消息，不切在 toolResult 上）。如果切割落在一个 turn 的中间，检测为"split turn"并额外生成 turn 前缀摘要。

### 6.4 增量摘要

**初始摘要**生成结构化检查点，包含：目标、约束与偏好、进度（已完成/进行中/阻塞）、关键决策、下一步、关键上下文。

**更新摘要**在已有摘要基础上合并新信息，将已完成项从"进行中"移到"已完成"，更新"下一步"。这避免了每次重新生成全部摘要的开销。

摘要和文件操作记录（读取/修改的文件列表）一起存储，压缩后作为上下文的一部分保留。

---

## 七、会话持久化

### 7.1 树状结构

会话不是线性日志，而是**树状事件日志**。每个条目有 `id`、`parentId`、`timestamp`，支持分支、fork 和导航。条目类型包括 message、model_change、thinking_level_change、compaction、branch_summary 等。

### 7.2 上下文重建

从当前叶子节点回溯到根节点，重放路径上的所有条目来重建上下文：收集消息、追踪最新的 model/thinkingLevel/activeTools、应用 compaction 条目（只保留 firstKeptEntryId 之后的消息）。

### 7.3 写入缓冲

运行期间的会话写入不是立即落盘，而是缓冲在 `pendingSessionWrites` 队列中，在 turn_end、agent_end 等关键时刻批量刷盘，保证会话日志的一致性。

---

## 八、流式响应架构

### 8.1 三层流式传递

**Provider 层**：SSE 事件流，逐 token 产出 `AssistantMessageEvent`（start/delta/end 等）。

**Agent Core 层**：将 provider 事件转换为 `AgentEvent`（message_start/update/end），同时在上下文数组中原地更新 partial message，保证上下文始终反映最新流式状态。

**UI 层**：AgentEvent 进一步转换为 UI 事件（TUI 渲染组件更新、RPC 协议事件、打印模式的纯文本输出）。

### 8.2 代理流式（Proxy Streaming）

支持通过 HTTP 代理服务器进行流式传输：POST 到 `{proxyUrl}/api/stream`，读取 SSE 响应，客户端从 `ProxyAssistantMessageEvent`（剥离了 partial 字段以节省带宽）重建完整的 AssistantMessage。工具调用参数使用 `parseStreamingJson` 增量解析。

---

## 九、RPC 模式

### 9.1 协议设计

JSON-Lines over stdin/stdout：命令（stdin）为 JSON 对象带 `type` 字段，响应（stdout）为 `{ type: "response", success, data?, error? }`，事件（stdout）为 `AgentSessionEvent` 流。

支持 27 种命令类型，涵盖 prompt、state、model、thinking、compaction、session、messages 等所有操作。

### 9.2 扩展 UI 桥接

RPC 模式通过 `createExtensionUIContext()` 将扩展 UI API（select、confirm、input、editor）桥接到 RPC 协议，使用 UUID 关联的请求/响应对和 signal-based 超时。

### 9.3 Stdout 接管

`takeOverStdout()` 接管 stdout，防止其他代码写入非 JSON 内容污染协议流。背压通过 `waitForRawStdoutBackpressure()` 管理。

---

## 十、设计原则提炼

### 10.1 关注点分离

无状态的 agent-loop 操作快照，有状态的 Agent 类管理生命周期，AgentHarness 添加会话和钩子。每一层只知道下一层的接口。

### 10.2 基于钩子的可扩展性

几乎每个决策点都有钩子：beforeToolCall、afterToolCall、transformContext、convertToLlm、prepareNextTurn。钩子可以观察、变换、阻止或取消操作。

### 10.3 契约式错误处理

流式函数、钩子和转换器"不可抛出"——它们返回安全回退值。循环中的错误被转换为 `stopReason: "error"` 的 assistant 消息，保证循环不会崩溃。

### 10.4 基于队列的并发控制

Steering 和 follow-up 队列允许外部参与者在运行中注入消息，无需中断当前 turn。QueueMode 控制排空粒度。

### 10.5 树状会话

会话形成树而非线性日志，支持分支、fork 和导航，每个分支有独立的摘要来保持上下文连续性。

### 10.6 两阶段初始化

扩展加载时先注入抛错桩函数，绑定阶段再注入真实实现。这分离了发现和运行时绑定，防止在初始化期间调用未就绪的服务。

### 10.7 过期守卫

会话替换后，旧的上下文引用抛出描述性错误而非静默操作在过期状态上，防止扩展在过期的上下文中产生副作用。

### 10.8 可操作的截断

所有工具在截断输出时附加明确的续读提示（如"Use offset=501 to continue"），让 LLM 知道如何获取更多数据，而非困惑于不完整的结果。

---

## 十一、新 Agent 设计清单

设计新 agent 系统时，可按以下清单逐项确认：

1. **分层**：是否将 LLM 通信、agent 循环、产品逻辑分为独立层？
2. **工具定义**：是否有统一的 Tool 接口，包含 Schema 验证、描述、执行模式？
3. **事件系统**：是否在关键决策点暴露了足够的钩子/事件？
4. **流式传递**：流式数据是否从 provider 到 UI 全链路贯通？
5. **上下文管理**：是否有 token 估算、自动压缩、增量摘要？
6. **会话持久化**：是否支持树状结构、分支导航、写入缓冲？
7. **消息队列**：是否支持运行期间注入消息（steering/follow-up）？
8. **扩展系统**：是否支持动态发现、两阶段初始化、过期保护？
9. **错误处理**：是否采用契约式（不抛出、返回安全值）？工具错误是否被包装而非崩溃？
10. **RPC/远程模式**：是否有 JSON-Lines 协议支持外部客户端接入？
11. **文件操作安全**：并发文件写入是否有队列串行化？
12. **截断与续读**：长输出是否截断并给出可操作的续读指引？
