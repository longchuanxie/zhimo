# Agent 交互优化执行计划 v1.0

## 1. 任务信息

```text
卡片编号：AGENT-UX-001
任务标题：优化智能助手交互与跨模块协作设计
所属模块：Agent / Editor / Context / Document / Card / Outline / Knowledge
优先级：P0
当前状态：开发中
```

## 2. 需求理解

当前智能助手能力较完整，但主要集中在右侧 Agent 面板中。用户在文档、资料、卡片、大纲等模块中触发写作动作后，常需要切换到面板完成上下文确认、等待回复、采纳、执行待确认操作，写作流程被打断。

优化目标：

- 将 Agent 从“面板中心”调整为“写作对象中心”。
- 保留 ContextPack、AgentRun、PendingAction 的安全链路。
- 降低选区动作和跨模块写入的操作复杂度。
- 避免 UI 组件直接编排卡片、知识、文档等业务 Service。

## 3. 方案设计

### 3.1 第一阶段：命令层收口

新增 `AgentCommandService`，统一承接编辑器选区动作：

```text
选区动作
  ↓
executeSelectionAgentCommand
  ↓
AI 类动作：返回 pending_agent_action，由 UI 打开 Agent 面板并派发
本地写入动作：调用 CardService / KnowledgeService 落地
```

本阶段已覆盖：

- 改写；
- 扩写；
- 缩写/摘要；
- 检查来源；
- 保存为卡片；
- 保存为知识。

### 3.2 第二阶段：内联候选

将文档选区类 AI 结果从“只在右侧面板展示”升级为文档内候选：

```text
选中文本
  ↓
触发 Agent 命令
  ↓
生成候选结果
  ↓
编辑器内显示：替换 / 插入到下方 / 放弃
  ↓
通过 PendingAction 安全落地
```

### 3.3 第三阶段：对象级协作

在大纲、资料、卡片、知识模块增加对象级 Agent 入口：

- 大纲：生成子节点、补写写作目标、起草章节；
- 资料：提炼卡片、检查可引用观点；
- 卡片：扩展、合并、转知识；
- 知识：查冲突、生成修订版本；
- 文档：来源检查、论文格式检查、公式/图表完整性检查。

### 3.4 第四阶段：上下文预览降复杂

将 `ContextPreviewPanel` 从“每次都展示完整上下文清单”调整为按任务风险分层：

```text
轻量任务：默认折叠详情，只展示参考范围摘要
常规任务：保留上下文详情，可手动收起
高影响任务：默认展开详情，并展示发送前风险提示
```

本阶段重点：

- 改写、摘要、格式整理等轻量任务减少确认负担；
- 生成卡片、生成大纲、来源核查等高影响任务保留显式确认；
- 仍保留 ContextPack 创建前的排除项、必选项、压缩提示和 token 预算信息；
- 不绕过既有 `onCreateContextPack` 链路。

## 4. 已完成内容

- 新增 `src/services/agent/AgentCommandService.ts`。
- 改造 `src/components/editor/SelectionFloatingMenu.tsx`，移除组件对 `CardService` / `KnowledgeService` 的直接调用。
- 新增 `src/services/agent/AgentCommandService.test.ts`，覆盖命令转换、卡片创建、知识创建、空选区校验。
- 保持既有 `AgentPanel` pending action 消费链路不变。
- 新增 `agentInlineCandidate` 全局 UI 状态，用于承接文档内候选操作。
- 新增 `src/components/editor/AgentInlineCandidatePanel.tsx`，在编辑器内展示助手候选正文。
- 新增 `src/hooks/useAgentInlineCandidateActions.ts`，通过 `PendingActionService` 执行或拒绝候选操作。
- 改造 `useMessageActions`：文档类采纳生成 `append_document_content` 待确认操作后，同步在当前文档显示候选面板。
- 新增 `src/hooks/useAgentInlineCandidateActions.test.ts`，覆盖候选执行、拒绝和文档刷新事件。
- 扩展 `PendingAgentAction`，支持 `boundObjectType` / `boundObjectId` / `contextScope`，使对象级入口可绑定当前对象。
- 扩展 `AgentCommandService`，新增对象级命令：大纲起草、资料提卡、资料证据核查、卡片扩展、卡片转知识、知识查冲突、知识修订。
- 新增 `src/hooks/useObjectAgentCommand.ts`，页面只提交对象级命令，不直接拼接 prompt 或操作 Agent 面板状态。
- 改造 `AgentPanel`：对象级动作优先查询或创建绑定对象的助手线程。
- 接入对象级入口：
  - `OutlinePage`：大纲节点起草正文；
  - `SourceDetailPage`：助手提卡、核查证据；
  - `CardDetailPage`：助手扩展、转为知识；
  - `KnowledgeDetailPage`：查冲突、助手修订。
- 新增 `src/hooks/useObjectAgentCommand.test.ts`，覆盖对象级命令派发。
- 改造 `src/components/agent/ContextPreviewPanel.tsx`，新增轻量、常规、高影响三类详情模式。
- 新增上下文摘要条，轻量任务默认折叠详情，高影响任务默认展开并展示风险提示。
- 新增紧凑上下文列表，轻量任务先展示前 4 条参考内容和剩余数量。
- 保留详细模式下的 token 预算、压缩提示、必选/可选分组、排除项和智能提示。
- 新增 `src/components/agent/ContextPreviewPanel.test.tsx`，覆盖轻量任务默认折叠、展开详情、高影响任务风险提示和排除项提交。
- 新增 `src/services/agent/AgentMessageSaveService.ts`，承接助手消息另存为卡片/知识，以及消息采纳状态回填。
- 改造 `src/components/agent/useMessageActions.ts`，移除对 `CardService` / `KnowledgeService` 的直接调用，Hook 只负责交互调度、刷新和提示。
- 新增 `src/services/agent/AgentMessageSaveService.test.ts`，覆盖卡片保存、知识保存、创建失败、状态回填失败和标题提取。
- 扩展 `src/components/agent/useMessageActions.test.ts`，覆盖另存成功刷新与失败提示。
- 移除 `appStore` 中旧的 `agentInsertText` 状态和 `Editor` 中直接插入正文的监听效果，正文采纳统一通过 `PendingAction` 与内联候选落地。
- 新增 `src/services/agent/AgentObjectResultService.ts`，按对象绑定线程聚合最近已采纳/已保存的助手消息。
- 新增 `src/components/agent/ObjectAgentResultPanel.tsx`，在对象详情页展示“助手成果”。
- 接入对象级成果展示：
  - `SourceDetailPage`：展示当前资料的助手提卡、证据核查等已采纳成果；
  - `CardDetailPage`：展示当前卡片的扩展、转知识等已采纳成果；
  - `KnowledgeDetailPage`：展示当前知识的查冲突、修订等已采纳成果；
  - `OutlinePage`：通过节点行入口打开大纲节点助手成果抽屉。
- 新增 `src/services/agent/AgentObjectResultService.test.ts` 和 `src/components/agent/ObjectAgentResultPanel.test.tsx`，覆盖成果聚合、空状态与 UI 展示。
- 新增 `src/components/outline/OutlineNodeAgentResultDrawer.tsx`，用于展示单个大纲节点的助手成果、节点状态和关联文档入口。
- 新增 `src/components/outline/OutlineNodeAgentResultDrawer.test.tsx`，覆盖抽屉展示、打开文档、继续起草和关闭回调。
- 新增 `src/hooks/usePendingAgentActionConsumer.ts`，将 `AgentPanel` 中外部 pending action 消费、对象线程选择、项目线程兜底创建和自动预览触发拆出。
- 改造 `src/components/layout/AgentPanel.tsx`，面板不再直接编排 pending action 消费流程，仅提供线程状态、草稿填充、预览触发和错误回调。
- 新增 `src/hooks/usePendingAgentActionConsumer.test.ts`，覆盖对象线程动作、无线程项目兜底创建和线程创建失败错误回传。
- 新增 `src/hooks/useAgentContextWorkflow.ts`，将 `AgentPanel` 中上下文预览、ContextPack 创建、消息发送、取消发送和上下文过大错误处理拆出。
- 改造 `src/components/layout/AgentPanel.tsx`，面板不再直接调用 `previewContext` / `createContextPack` / `sendMessage`，仅连接输入、线程、消息刷新和错误展示。
- 新增 `src/hooks/useAgentContextWorkflow.test.ts`，覆盖预览参数、确认发送成功清理状态、上下文压缩失败保留预览并提示用户排除内容。
- 新增 `src/components/agent/AgentPanelHeader.tsx`，将智能助手标题区、刷新入口和新对话入口拆为纯 UI 组件。
- 新增 `src/components/agent/AgentThreadTabs.tsx`，将多线程切换列表拆为纯 UI 组件，单线程时不渲染额外切换控件。
- 改造 `src/components/layout/AgentPanel.tsx`，面板不再直接维护头部图标和线程按钮渲染细节，仅传入线程状态和交互回调。
- 新增 `src/components/agent/AgentPanelHeader.test.tsx` 和 `src/components/agent/AgentThreadTabs.test.tsx`，覆盖标题操作、多线程切换和单线程空渲染。
- 新增 `src/components/agent/AgentPanelErrorBanner.tsx`，将面板错误提示和 `AppError` 展示格式化拆为独立展示组件。
- 改造 `src/components/layout/AgentPanel.tsx`，面板不再内联错误提示 JSX 和错误文案格式化函数。
- 新增 `src/components/agent/AgentPanelErrorBanner.test.tsx`，覆盖错误码、错误信息、研发详情展示和无错误空渲染。
- 新增 `src/components/agent/AgentConversationArea.tsx`，将消息列表、快捷动作和输入区组合拆为独立对话区组件。
- 改造 `src/components/layout/AgentPanel.tsx`，面板不再直接拼装 `AgentMessageList` / `AgentQuickActions` / `AgentInputArea`，仅传入消息、快捷动作和输入三组配置。
- 新增 `src/components/agent/AgentConversationArea.test.tsx`，覆盖有当前对话时展示消息区/快捷动作/输入区，以及无当前对话时仅展示消息列表空状态入口。
- 新增 `src/hooks/useAgentThreadWorkflow.ts`，将线程列表加载、当前线程选择、消息加载、线程状态加载、新建线程和线程刷新从 `AgentPanel` 中拆出。
- 改造 `src/components/layout/AgentPanel.tsx`，面板不再直接调用 `listThreads` / `createThread` / `listMessages` / `getThreadState`，仅消费线程工作流 hook 暴露的状态与动作。
- 新增 `src/hooks/useAgentThreadWorkflow.test.ts`，覆盖面板打开自动加载线程、创建项目级线程、选择线程清错误、线程加载失败回传错误。
- 扩展 `PendingAgentAction` / `PendingAgentActionDraft`，新增 `autoSubmit` 标记，用于表达对象页已明确触发的 Agent 执行意图。
- 改造 `createObjectAgentAction`，对象级 Agent 命令默认携带 `autoSubmit: true`，避免“让助手起草”等入口停在二次手动发送。
- 改造 `usePendingAgentActionConsumer`，将 `autoSubmit` 透传给上下文发送工作流。
- 改造 `useAgentContextWorkflow`，支持 `prepareSend(..., { autoSubmit: true })` 自动预览上下文、创建 ContextPack 并发送消息，真正写入仍由 Agent 待确认操作拦截。
- 改造 `OutlinePage`，大纲节点“让助手起草”成功后关闭助手成果抽屉并提示“助手已开始”，避免抽屉遮挡右侧 Agent 面板。
- 扩展 `src/hooks/useAgentContextWorkflow.test.ts` / `src/hooks/usePendingAgentActionConsumer.test.ts` / `src/services/agent/AgentCommandService.test.ts` / `src/hooks/useObjectAgentCommand.test.ts`，覆盖对象命令自动提交链路。
- 新增 `src/components/agent/AgentRunProgressBanner.tsx`，在 Agent 面板内统一展示“正在准备参考内容 / 正在发送给助手”的连续状态反馈。
- 改造 `src/components/layout/AgentPanel.tsx`，在错误提示下方接入运行进度提示，自动提交和手动提交都能看到准备与发送状态。
- 改造 `SourceDetailPage` / `CardDetailPage` / `KnowledgeDetailPage` 的对象级 Agent 入口提示文案，从“已打开助手”调整为“助手已开始...”，避免暗示用户还需要二次提交。
- 新增 `src/components/agent/AgentRunProgressBanner.test.tsx`，覆盖准备中、发送中和空闲不渲染三种状态。

## 5. 测试结果

```text
npm run test -- src/services/agent/AgentCommandService.test.ts
通过：4 tests

npm run test -- src/components/layout/AgentPanel.test.tsx src/services/agent/AgentCommandService.test.ts
通过：7 tests

npm run test -- src/components/agent/useMessageActions.test.ts src/hooks/useAgentInlineCandidateActions.test.ts src/services/agent/AgentCommandService.test.ts src/components/layout/AgentPanel.test.tsx
通过：22 tests

npm run test -- src/services/agent/AgentCommandService.test.ts src/hooks/useObjectAgentCommand.test.ts src/components/layout/AgentPanel.test.tsx
通过：14 tests

npm run typecheck
通过

npm run test
通过：43 test files，246 tests

npm run build
通过：Vite 构建完成；存在 chunk 体积和动态导入提示，不阻塞交付
```

未完成：

```text
npm run lint
失败原因：当前依赖中没有可执行的 eslint，脚本无法启动。
```

## 6. 可维护性审核

已检查：

- 选区组件职责收敛为 UI 派发与显示错误；
- 业务写入集中到 Service；
- 命令类型使用 TypeScript union，不使用 `any`；
- 中文 UI 文案继续保留；
- PendingAction / ContextPack / AgentPanel 原链路未破坏；
- 新增测试覆盖主要分支。
- ContextPreview 降复杂未减少安全确认链路，只调整默认展示密度；
- 风险任务提示集中在任务配置中维护，避免中文风险文案散落。
- `useMessageActions` 不再直接调用卡片/知识业务 Service，另存流程收口到 Agent 服务层；
- 新增服务测试覆盖中间写入失败，避免对象已创建但消息状态未回填时被 UI 吞掉。
- `agentInsertText` 旧直写入口已删除，避免 AI 结果绕过待确认写入链路；
- 对象级成果读取通过 Agent Service/Repository 层完成，页面只渲染聚合结果；
- 资料、卡片、知识详情页已复用同一个 `ObjectAgentResultPanel`，避免重复实现成果列表。
- 大纲节点成果展示独立为抽屉组件，避免把成果列表塞入树节点导致大纲列表复杂化；
- 大纲节点抽屉继续复用 `ObjectAgentResultPanel`，不重复实现对象成果查询。
- `AgentPanel` 的外部动作消费职责已拆到 `usePendingAgentActionConsumer`，降低面板组件中的业务编排密度；
- pending action 消费新增 hook 级测试，避免后续拆分消息发送时破坏外部入口链路。
- `AgentPanel` 的上下文预览与发送职责已拆到 `useAgentContextWorkflow`，AI 调用安全链路仍保持为预览、快照、运行、消息保存；
- 上下文过大、用户取消、发送成功后的状态流转集中在 hook 内维护，避免继续堆在面板组件中。
- `AgentPanel` 头部与线程切换器已拆为纯展示组件，继续降低右侧面板 JSX 密度；
- 线程切换器新增单线程空渲染测试，避免在普通写作场景中增加无意义控件。
- `AgentPanel` 错误提示已拆为纯展示组件，错误展示规则集中维护，避免布局组件继续堆积 UI 细节。
- `AgentPanel` 对话区组合已拆到 `AgentConversationArea`，通过分组 props 控制组件接口复杂度，避免把消息、快捷动作和输入区参数平铺到超过维护阈值。
- `AgentPanel` 线程数据工作流已拆到 `useAgentThreadWorkflow`，页面组件不再直接依赖线程 Service；新建线程后刷新列表时不会覆盖刚选中的新线程。
- 对象页 Agent 入口已从“填入草稿并等待二次提交”调整为“明确触发即自动发送”，仍保留 ContextPack 快照和后续写入待确认链路，避免大纲起草流程割裂。
- 对象页与 Agent 面板之间新增连续状态反馈，用户触发对象级命令后能看到助手正在准备上下文或生成回复，而不是只看到一次性提示。

## 7. 后续任务

```text
AGENT-UX-002：实现文档内联候选结果面板（已完成）
AGENT-UX-003：将 Agent 采纳结果按目标对象展示（已完成）
AGENT-UX-004：ContextPreview 轻量任务默认折叠，风险任务显式确认（已完成）
AGENT-UX-005：补充大纲/资料/卡片/知识对象级 Agent 入口（已完成）
AGENT-UX-006：收口助手消息另存为卡片/知识服务链路（已完成）
AGENT-UX-007：移除 Editor 中旧的 Agent 直写正文入口（已完成）
AGENT-UX-008：实现大纲节点助手成果抽屉（已完成）
AGENT-UX-009：拆分 AgentPanel pending action 消费逻辑（已完成）
AGENT-UX-010：拆分 AgentPanel 上下文预览与消息发送工作流（已完成）
AGENT-UX-011：拆分 AgentPanel 头部与线程切换器（已完成）
AGENT-UX-012：拆分 AgentPanel 错误提示条（已完成）
AGENT-UX-013：拆分 AgentPanel 消息区与输入区组合（已完成）
AGENT-UX-014：拆分 AgentPanel 线程数据工作流（已完成）
AGENT-UX-015：对象级 Agent 命令明确触发后自动提交（已完成）
AGENT-UX-016：统一对象级 Agent 命令进行中反馈（已完成）
```

## 8. 进度更新

```text
卡片编号：AGENT-UX-001
当前状态：开发中
已完成内容：完成命令层收口、选区浮动菜单改造、文档内联候选面板、对象级 Agent 入口、ContextPreview 降复杂、助手消息另存服务收口、资料/卡片/知识/大纲节点对象级助手成果展示、Editor 旧直写入口清理、AgentPanel pending action 消费拆分、AgentPanel 上下文预览与消息发送工作流拆分、AgentPanel 头部与线程切换器拆分、AgentPanel 错误提示条拆分、AgentPanel 消息区与输入区组合拆分、AgentPanel 线程数据工作流拆分、对象级 Agent 命令明确触发后自动提交、对象级 Agent 命令进行中反馈统一
未完成内容：前端对象页 Agent 入口仍可继续补充结果回流提示与上下文预览查看入口
测试结果：npm run test（43 files / 246 tests）、npm run typecheck、npm run build 通过；npm run lint 因 eslint 缺失未执行
遗留问题：当前目录不是 Git 仓库，无法使用 git diff/status 做变更审阅
技术债：右侧 AgentPanel 仍承担较多职责；构建存在 chunk 体积提示
是否阻塞：否
下一步：统一对象页 Agent 入口的结果回流提示与上下文预览查看入口
```
