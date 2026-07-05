# 项目创建流程优化计划

## 1. Summary

在保留现有 `/projects/new` 手动创建表单的基础上，新增一条 **AI 引导创建** 路径。用户在项目列表页选择"AI 引导创建"后，进入一个对话式引导页。用户先输入一句话描述项目，Agent 基于该描述分节点提问（项目类型/名称 → 目标读者 → 写作目标 → 目标字数 → 风格规则 → 禁止规则 → 确认），逐步完善项目初始化字段，最后调用既有 `ProjectService.createProject` 完成创建并跳转到项目首页。

## 2. Current State Analysis

### 2.1 现有流程
- **入口**：项目列表页 [ProjectListPage.tsx](file:///d:/workplace/idea/zhimo/src/features/project/ProjectListPage.tsx) 的"创建项目"按钮，跳转 `/projects/new`。
- **表单页**：[CreateProjectPage.tsx](file:///d:/workplace/idea/zhimo/src/features/project/CreateProjectPage.tsx) 提供 7 个字段（name/type/description/writingGoal/targetReader/targetWordCount/styleRules/forbiddenRules）。
- **Service**：[ProjectService.ts](file:///d:/workplace/idea/zhimo/src/services/project/ProjectService.ts) 的 `createProject` 校验并写入数据库，同时创建默认大纲。
- **Agent/Model 能力**：[AgentService.ts](file:///d:/workplace/idea/zhimo/src/services/agent/AgentService.ts) 已具备调用模型和上下文管理能力；[ModelService.ts](file:///d:/workplace/idea/zhimo/src/services/model/ModelService.ts) 提供 `callModel` / `callModelDirect` 统一入口。
- **路由**：[App.tsx](file:///d:/workplace/idea/zhimo/src/App.tsx) 中 `/projects/new` 映射到 `CreateProjectPage`。

### 2.2 待解决问题
- 当前创建流程需要用户一次性理解并填写全部字段，对新手不友好。
- 项目类型、风格规则、禁止规则等字段缺乏示例引导。
- 没有利用 Agent 能力将用户的自然语言描述转化为结构化项目配置。

## 3. Proposed Changes

### 3.1 新增路由
**文件**：[App.tsx](file:///d:/workplace/idea/zhimo/src/App.tsx)

- 在 `/projects/new` 同级新增 `/projects/new-guided` 路由，指向新建的 `CreateProjectGuidedPage`。
- 保持 `/projects/new` 不变，作为手动创建入口。

### 3.2 项目列表页入口拆分
**文件**：[ProjectListPage.tsx](file:///d:/workplace/idea/zhimo/src/features/project/ProjectListPage.tsx)

- 将顶部"创建项目"按钮拆分为两种入口：
  - "手动创建" → `/projects/new`
  - "AI 引导创建" → `/projects/new-guided`
- 空状态（EmptyState）的 primaryAction 也同步提供两个选项或默认进入 AI 引导。
- 新增按钮使用 `SparklesIcon` 等 Heroicons 标识 AI 能力，避免文字图标（符合 AGENTS.md 图标规范）。

### 3.3 新增对话式引导页面
**新文件**：`src/features/project/CreateProjectGuidedPage.tsx`

- 页面结构：
  - 顶部：返回项目列表、标题"AI 引导创建项目"。
  - 中部：对话消息列表（用户消息 + Agent 气泡消息）。
  - 底部：输入框 + 快捷选项（当 Agent 提供可选答案时显示）。
- 节点设计（共 7 个节点）：
  1. **欢迎 + 一句话输入**：Agent 邀请用户用一句话描述想写的项目。
  2. **项目类型 + 名称确认**：Agent 根据描述推断项目类型和名称，用户可确认或修改。
  3. **目标读者**：Agent 询问目标读者，提供示例选项和自定义输入。
  4. **写作目标 + 目标字数**：Agent 询问写作目标，并建议合理字数。
  5. **风格规则**：Agent 根据项目类型给出风格规则建议（学术/小说/自由写作）。
  6. **禁止规则**：Agent 给出常见禁止规则示例，用户可多选/自定义。
  7. **确认创建**：展示汇总卡片，用户确认后调用 `createProject`。
- 每个节点维护可编辑的中间状态（`DraftProject`）。
- 支持返回上一步修改。
- 如果用户在某节点只给出简短回答，Agent 负责扩展为规范字段值。
- 错误处理：模型未配置、模型调用失败时给出中文提示并可重试。

### 3.4 新增引导业务 Service
**新文件**：`src/services/project/ProjectOnboardingService.ts`

- 职责：
  - 封装各节点的 Agent prompt。
  - 调用 `ModelService.callModelDirect`（项目尚未创建，无需任务模型配置，使用默认模型）。
  - 解析模型返回为结构化的 `Partial<CreateProjectInput>`。
  - 处理模型调用错误转换。
- 核心函数：
  - `parseInitialDescription(description: string)`：根据一句话描述生成项目类型、名称、描述。
  - `refineField(field: OnboardingField, currentDraft: DraftProject, userInput: string)`：根据节点和用户输入生成/修正对应字段。
  - `buildSummary(draft: DraftProject)`：生成最终确认文案。
- 类型：新增 `OnboardingField`、`OnboardingNode`、`DraftProject` 等类型，集中放在该文件或 `src/types/project.ts`。

### 3.5 复用与扩展现有 Service
**文件**：[ProjectService.ts](file:///d:/workplace/idea/zhimo/src/services/project/ProjectService.ts)

- `createProject` 保持不变，由 `CreateProjectGuidedPage` 在最终节点调用。
- 不需要新增数据库表，引导过程中的草稿仅存在于前端状态。

### 3.6 新增可复用对话 UI 组件（如需要）
**新文件**：`src/components/project/OnboardingChat.tsx`

- 职责单一：渲染对话消息列表、输入框、快捷选项按钮。
- Props 类型明确，可被 Demo/Story 独立渲染。
- 避免在组件内直接调用模型或 Service，仅通过 props 与页面通信。

### 3.7 常量与文案
**文件**：`src/constants/status.ts`（已有）

- 新增 AI 引导相关的用户提示文案常量（可选，若文案较多可新建 `src/constants/onboarding.ts`）。
- 禁止将提示文案散落在页面中。

## 4. Assumptions & Decisions

- **入口决策**：项目列表页拆分为"手动创建"和"AI 引导创建"两个入口，保留原有 `/projects/new` 表单不变。
- **交互决策**：采用对话式（聊天气泡）引导，每节点 Agent 提问并等待用户回复。
- **模型调用决策**：引导阶段项目尚未创建，使用 `ModelService.callModelDirect` 直接调用默认模型，不经过 `AgentThread`/`ContextPack` 流程。
- **节点范围**：覆盖 `CreateProjectInput` 的全部 7 个字段，分 7 个节点完成。
- **状态持久化**：引导草稿仅存于前端 React state，刷新页面后需重新开始。
- **错误处理**：模型未配置、调用失败、解析失败均给出中文提示和重试按钮。
- **可维护性**：
  - 单组件不超过 250 行，`CreateProjectGuidedPage` 负责编排，具体对话 UI 和 Service 逻辑拆分出去。
  - 单函数不超过 80 行。
  - 禁止在页面中直接调用模型，统一通过 `ProjectOnboardingService`。

## 5. Verification Steps

1. **功能验证**：
   - 在项目列表页可见"手动创建"和"AI 引导创建"两个入口。
   - 进入 AI 引导页，输入一句话后 Agent 正确进入节点 2 并给出类型/名称建议。
   - 可前进、后退、修改答案。
   - 最终确认后成功创建项目并跳转到 `/projects/:projectId`。
2. **边界验证**：
   - 模型未配置时给出"请先配置模型服务商"提示。
   - 用户输入为空时给出校验提示。
   - 模型返回无法解析时给出"解析失败，请重试"提示。
3. **回归验证**：
   - 手动创建 `/projects/new` 流程不受影响。
   - 项目列表页空状态、搜索、删除功能正常。
4. **可维护性验证**：
   - `npx tsc --noEmit` 编译通过。
   - 新增文件符合 AGENTS.md 组件/Service 规范。

## 6. Files to Modify / Create

### 修改文件
- [App.tsx](file:///d:/workplace/idea/zhimo/src/App.tsx)：新增 `/projects/new-guided` 路由。
- [ProjectListPage.tsx](file:///d:/workplace/idea/zhimo/src/features/project/ProjectListPage.tsx)：拆分创建入口。

### 新建文件
- `src/features/project/CreateProjectGuidedPage.tsx`：对话式引导页面。
- `src/services/project/ProjectOnboardingService.ts`：引导业务逻辑与 Agent prompt。
- `src/components/project/OnboardingChat.tsx`：可复用对话 UI 组件。
- `src/types/project.ts`（若不存在）或扩展 `src/types/index.ts`：引导相关类型。
- （可选）`src/constants/onboarding.ts`：引导文案常量。
