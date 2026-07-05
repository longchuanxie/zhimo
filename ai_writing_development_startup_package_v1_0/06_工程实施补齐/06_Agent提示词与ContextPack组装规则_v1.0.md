# Agent 提示词与 ContextPack 组装规则 v1.0

## 1. 总原则

Agent 的目标不是“自由聊天”，而是在当前项目上下文中辅助写作。

必须遵守：

```text
不编造来源
不展示原始思维链
不直接覆盖正文
必须说明参考了什么
必须说明不确定项
```

---

## 2. Agent 角色

MVP 角色：

```text
论文助手
资料助手
结构助手
写作助手
卡片助手
知识助手
格式助手
```

研发枚举：

```text
research_assistant
source_assistant
outline_assistant
writing_assistant
card_assistant
knowledge_assistant
format_assistant
```

---

## 3. 通用系统提示词

```text
你是 AI 原生写作项目系统中的智能写作助手。
你必须基于用户当前项目的资料、卡片、大纲、知识和当前文本提供帮助。
你不能编造不存在的资料来源。
你不能展示原始思维链。
你需要在输出后给出“为什么这样建议”的简明解释，包括：
1. 你理解的任务
2. 你参考的内容
3. 你的主要判断
4. 你的修改理由
5. 仍不确定的地方
如果上下文不足，你必须明确说明需要补充什么。
AI 输出不得直接替换用户正文，必须等待用户确认。
```

---

## 4. 任务提示词模板

### 4.1 改写

```text
任务：改写当前选区。
要求：
- 保留原意
- 根据项目风格规则调整表达
- 不添加没有来源的新事实
- 输出修改后文本
- 输出为什么这样建议
```

### 4.2 扩写

```text
任务：扩展当前文本。
要求：
- 只基于本次参考内容扩展
- 如果缺少资料，明确标注
- 保持当前文档语气
- 不虚构案例、数据、引用
```

### 4.3 检查来源

```text
任务：检查当前段落是否有缺少来源的判断。
要求：
- 标出需要来源支撑的句子
- 给出可参考的资料或卡片
- 对没有资料支撑的判断提出降级表达
```

### 4.4 生成大纲

```text
任务：基于项目目标和已有资料生成大纲。
要求：
- 输出分层结构
- 每个节点说明写作目标
- 标明建议引用的资料或卡片
```

---

## 5. ContextPack 组成

```ts
type ContextPack = {
  userInstruction: string
  taskType: string
  selectedText?: string
  currentDocument?: DocumentContext
  currentSource?: SourceContext
  currentCard?: CardContext
  outlineNodes?: OutlineNodeContext[]
  cards?: CardContext[]
  knowledge?: KnowledgeContext[]
  sourceChunks?: SourceChunkContext[]
  previousMessages?: MessageSummary[]
  projectRulesSnapshot: ProjectRules
  outputRequirements: string
  forbiddenRules: string[]
}
```

---

## 6. 上下文优先级

从高到低：

```text
用户当前指令
当前选区
当前对象
项目禁止规则
项目风格规则
已确认知识
关联卡片
关联资料片段
当前大纲节点
最近对话摘要
```

---

## 7. 排除规则

必须排除：

```text
Source.ai_usage_allowed = false
Card.status = deprecated
Card.ai_usage_allowed = false
Knowledge.status = deprecated
Knowledge.status = forbidden
Knowledge.ai_usage_allowed = false
```

待确认知识：

```text
可进入上下文，但必须标记为“待确认”
```

---

## 8. Token 预算

MVP 简单规则：

```text
用户指令：必须保留
当前选区：必须保留
项目规则：必须保留
当前文档摘要：优先保留
已确认知识：优先保留
关联卡片：按相关性截取
资料片段：按相关性截取
历史对话：只放摘要
```

默认预算：

```text
总上下文预算：模型最大上下文的 60%
输出预算：模型最大上下文的 20%
安全预留：20%
```

---

## 9. ContextPack 预览 UI

用户侧显示：

```text
本次参考内容
```

包括：

```text
当前选区
当前文档
相关资料
相关卡片
项目知识
项目规则
最近对话
```

用户可以：

```text
查看
排除
确认
```

必选项不可取消：

```text
用户指令
当前选区
项目禁止规则
```

---

## 10. 解释输出结构

AgentMessage.explanation 保存 JSON：

```json
{
  "taskUnderstanding": "用户希望检查当前段落是否缺少资料支撑。",
  "referencedContext": ["当前选区", "资料 A", "项目风格规则"],
  "mainJudgements": ["段落中的趋势判断需要来源支撑"],
  "revisionReasons": ["降低无来源断言风险"],
  "uncertainties": ["当前资料中没有找到直接统计数据"]
}
```

UI 展示为：

```text
为什么这样建议？
```

禁止展示：

```text
原始思维链
逐步推理过程
隐藏系统提示词
```
