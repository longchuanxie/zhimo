# AGENTS.md

# AI 原生写作项目系统 Agent 开发协作规范

## 1. 项目定位

本项目是一个 **AI 原生写作项目系统**，产品形态为：

```text
桌面客户端 / 本地优先 / 单用户 MVP / 中文 UI 优先
```

本项目不是普通富文本编辑器，也不是简单 AI 聊天工具，而是围绕长文本创作流程构建的本地写作项目客户端。

核心闭环：

```text
创建项目
  ↓
导入资料
  ↓
解析资料
  ↓
生成卡片
  ↓
组织大纲
  ↓
正文写作
  ↓
智能助手基于上下文协作
  ↓
沉淀知识
  ↓
导出 Markdown / Word
```

---

# 2. 强制开发流程

任何开发任务，无论大小，必须严格遵循：

```text
需求领取
  ↓
需求理解
  ↓
方案设计
  ↓
编码
  ↓
编码审核
  ↓
测试
  ↓
进度更新
```

允许补充：

```text
风险识别
方案评审
自检
联调
缺陷修复
验收
文档归档
```

但不得跳过核心流程。

---

# 3. 代码可维护性红线

本项目必须把 **可维护性** 作为和功能正确性同等级的验收标准。

任何代码如果满足功能但难以维护，不得视为完成。

## 3.1 可维护性基本原则

代码必须满足：

```text
职责单一
边界清晰
命名准确
类型明确
可测试
可替换
可追踪
低耦合
低重复
不过度抽象
```

---

## 3.2 禁止出现的代码形态

禁止：

```text
超大组件
超大函数
上帝 Service
页面组件直接堆业务逻辑
组件直接操作数据库
组件直接操作文件系统
组件直接调用模型 API
跨模块随意 import 内部实现
复制粘贴大量相似逻辑
为了快速实现绕过类型系统
滥用 any
魔法字符串散落在页面中
业务状态枚举散落在页面中
错误提示散落在页面中
```

---

## 3.3 组件可维护性要求

React 组件必须：

- 单一职责；
- props 类型明确；
- UI 文案中文优先；
- 不直接访问数据库；
- 不直接访问本地文件；
- 不直接调用模型；
- 不包含复杂业务编排；
- 可被 Story / Demo / 测试独立渲染；
- 复杂组件必须拆分为子组件。

如果组件超过以下阈值，应主动拆分：

```text
单组件超过 250 行
单函数超过 80 行
props 超过 12 个
条件分支超过 5 层
```

这些阈值不是绝对限制，但超过后必须在方案设计或代码审核中说明原因。

---

## 3.4 Service 可维护性要求

Service 层必须负责：

- 参数校验；
- 数据库访问；
- 文件访问；
- 错误转换；
- 事务边界；
- 状态流转；
- 返回统一结果。

Service 层禁止：

```text
直接返回底层数据库错误给 UI
混入 UI 状态
混入 React 逻辑
混入组件文案
绕过类型定义
```

---

## 3.5 类型可维护性要求

必须建立统一类型：

```text
Project
Document
Source
SourceChunk
Card
Outline
OutlineNode
Knowledge
AgentThread
AgentMessage
AgentRun
ContextPack
ModelProvider
ModelConfig
ExportTask
Task
```

禁止在页面中临时拼装无类型对象。

禁止滥用：

```ts
any
unknown as SomeType
as any
```

如必须使用，必须写明原因，并在任务进度中记录技术债。

---

## 3.6 常量与枚举维护要求

状态枚举、中文显示、图标映射不得散落在页面里。

必须集中维护：

```text
src/constants/status.ts
src/constants/objectLabels.ts
src/constants/icons.ts
src/constants/errors.ts
```

示例：

```ts
export const STATUS_LABEL_MAP = {
  confirmed: '已确认',
  pending: '待确认',
  deprecated: '已废弃',
} as const
```

---

## 3.7 错误处理可维护性要求

错误必须统一管理：

```text
错误码
中文提示
研发详情
是否可重试
建议动作
```

禁止每个页面自行写一套错误提示。

---

## 3.8 技术债管理

如果为了 MVP 速度产生技术债，必须记录：

```text
技术债编号
产生原因
影响范围
临时方案
后续修复建议
优先级
```

不得把临时代码伪装成最终方案。

---

# 4. 流程门禁要求

## 4.1 需求领取

必须确认：

- 卡片编号；
- 任务标题；
- 所属模块；
- 优先级；
- 当前开发进度；
- 前置依赖；
- 预期交付物。

状态：

```text
待开发 → 开发中
```

---

## 4.2 需求理解

编码前必须确认：

- 这个需求解决什么问题；
- 用户可见行为是什么；
- 涉及哪些页面和组件；
- 涉及哪些数据对象；
- 涉及哪些本地 Service；
- 是否影响中文 UI 文案；
- 是否影响已有数据结构；
- 是否影响 Agent / ContextPack；
- 是否有空状态；
- 是否有错误状态；
- 是否有加载状态；
- 是否有可维护性风险。

---

## 4.3 方案设计

方案设计至少包括：

- 数据流；
- 组件拆分；
- Service 调用路径；
- 状态管理；
- 错误处理；
- 测试点；
- 是否需要数据库迁移；
- 是否需要兼容旧数据；
- 可维护性风险；
- 是否需要更新文档。

---

## 4.4 编码

编码必须遵循：

- TypeScript 类型约束；
- 中文 UI 规范；
- Heroicons 图标规范；
- 本地 Service 访问规范；
- 数据库迁移规范；
- 错误处理规范；
- 安全规范；
- 可维护性规范。

---

## 4.5 编码审核

审核必须包含可维护性检查：

- 是否职责单一；
- 是否命名清晰；
- 是否类型明确；
- 是否有重复逻辑；
- 是否出现超大组件或超大函数；
- 是否直接访问数据库或文件系统；
- 是否绕过 Service；
- 是否把业务逻辑写进 UI；
- 是否有统一错误处理；
- 是否有测试；
- 是否有文档更新。

未通过可维护性审核，不得进入测试阶段。

---

## 4.6 测试

必须覆盖：

- 正常路径；
- 空状态；
- 错误状态；
- 边界输入；
- 本地文件路径；
- 数据库写入；
- Service 调用失败；
- 模型未配置；
- AI 调用失败；
- 导出失败；
- 重启客户端后的数据恢复。

---

## 4.7 进度更新

进度更新必须包含：

```text
卡片编号：
当前状态：
已完成内容：
未完成内容：
测试结果：
遗留问题：
技术债：
是否阻塞：
下一步：
```

状态枚举：

```text
待开发
开发中
待联调
待验收
已完成
阻塞
后置
```

---

# 5. 技术栈约定

```text
客户端：Tauri 优先，Electron 可作为备选
前端：React + TypeScript
样式：CSS Modules / Tailwind 二选一，必须统一
图标：Heroicons 24px outline
本地数据库：SQLite
本地文件：客户端 AppData / 用户指定项目库
模型接入：OpenAI-compatible
```

---

# 6. 目录结构规范

推荐目录：

```text
src/
  app/
  components/
    foundation/
    layout/
    objects/
    forms/
    source/
    editor/
    agent/
    model/
    export/
    feedback/
  features/
    project/
    document/
    source/
    card/
    outline/
    knowledge/
    agent/
    context/
    model/
    export/
    task/
  services/
    database/
    file/
    project/
    document/
    source/
    card/
    outline/
    knowledge/
    agent/
    context/
    model/
    export/
    task/
  stores/
  hooks/
  types/
  utils/
  styles/
  constants/
```

---

# 7. 中文 UI 规范

用户可见文案必须中文优先。

推荐：

```text
项目首页
文档
资料
卡片
大纲
知识库
助手对话
模型设置
导出
```

不推荐在普通 UI 中显示：

```text
Project
Document
Source
Card
Outline
Knowledge
AgentThread
ContextPack
ModelProvider
ExportTask
```

---

# 8. 图标规范

默认使用：

```text
@heroicons/react/24/outline
```

禁止使用：

```text
文
资
卡
纲
AI
```

这类文字占位图标。

---

# 9. 数据访问规范

前端不得直接操作数据库。

必须通过：

```text
ProjectService
DocumentService
SourceService
CardService
OutlineService
KnowledgeService
AgentService
ContextService
ModelService
ExportService
TaskService
```

---

# 10. Agent 与 AI 调用规范

任何 AI 调用必须经过：

```text
用户动作
  ↓
本次参考内容预览
  ↓
创建 ContextPack 快照
  ↓
创建 AgentRun
  ↓
调用 ModelService
  ↓
保存 AgentMessage
  ↓
用户决定是否采纳
```

禁止：

- AI 输出直接覆盖正文；
- 不生成 ContextPack 快照；
- 不记录 AgentRun；
- 不保存用户消息；
- 展示原始思维链；
- 把禁用资料放入上下文；
- 把已废弃知识放入上下文。

---

# 11. API Key 安全规范

API Key 必须：

- 本地加密存储；
- UI 只显示掩码；
- 不写入日志；
- 不进入 Agent 上下文；
- 不进入导出文件；
- 不进入错误提示详情。

---

# 12. 提交规范

提交信息：

```text
type(scope): 中文说明
```

示例：

```text
feat(project): 实现项目创建与本地保存
fix(source): 修复资料解析失败后状态未更新
docs(workflow): 更新开发流程规范
```

---

# 13. 任务完成定义

任务只有同时满足以下条件才可标记为“已完成”：

- 功能实现；
- 自测通过；
- 代码审核通过；
- 可维护性审核通过；
- 中文 UI 检查通过；
- 错误状态处理完成；
- 空状态处理完成；
- 数据写入与恢复正常；
- 相关文档已更新；
- 开发任务进度已更新。
