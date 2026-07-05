# 编码风格规范

## 1. 总体原则

代码必须：

- 简洁；
- 可读；
- 类型明确；
- 边界清晰；
- 可测试；
- 可维护；
- 避免过度抽象；
- 避免组件直接承担业务逻辑。

---

## 2. TypeScript 规范

### 2.1 必须使用显式类型

推荐：

```ts
type ProjectStatus = 'draft' | 'writing' | 'revising' | 'completed' | 'archived'
```

不推荐：

```ts
let status: any
```

禁止滥用：

```ts
any
```

如必须使用，需要写明原因。

---

## 3. React 组件规范

组件必须：

- 单一职责；
- props 类型明确；
- 不直接访问数据库；
- 不直接访问文件系统；
- 不直接调用模型 API；
- 不包含复杂业务编排；
- 用户可见文案中文优先。

示例：

```tsx
type ProjectCardProps = {
  project: Project
  onOpen: (projectId: string) => void
}

export function ProjectCard({ project, onOpen }: ProjectCardProps) {
  return (
    <button onClick={() => onOpen(project.id)}>
      {project.name}
    </button>
  )
}
```

---

## 4. Service 规范

所有数据操作通过 Service。

示例：

```ts
ProjectService.createProject(payload)
DocumentService.autosaveDocument(projectId, documentId, payload)
SourceService.uploadSource(projectId, file)
AgentService.sendMessage(threadId, payload)
ContextService.createContextPack(payload)
```

Service 负责：

- 参数校验；
- 数据库访问；
- 文件访问；
- 错误转换；
- 返回统一结果。

---

## 5. 数据库规范

数据库字段使用：

```text
snake_case
```

示例：

```text
created_at
updated_at
workspace_id
project_id
ai_usage_allowed
```

前端类型可使用：

```text
camelCase
```

需要在数据层做映射。

---

## 6. 错误处理规范

禁止吞掉错误。

必须：

- 记录错误；
- 返回用户可理解的中文提示；
- 保留研发可排查信息；
- 不暴露 API Key；
- 不暴露敏感本地路径。

---

## 7. 中文 UI 规范

所有用户可见文案必须中文优先。

示例：

```text
导入资料
保存为知识
本次参考内容
模型连接失败
```

不推荐：

```text
Import Source
Save as Knowledge
ContextPack
ModelProvider Failed
```

---

## 8. 图标规范

图标使用：

```text
@heroicons/react/24/outline
```

所有图标通过统一组件封装：

```tsx
<AppIcon icon={FolderIcon} />
```

禁止：

- emoji 当正式图标；
- 文字当图标；
- 页面内散落硬编码 SVG；
- 多套图标风格混用。

---

## 9. 样式规范

样式必须统一使用设计 token。

禁止在组件中随意写：

```css
color: #123456;
```

推荐使用：

```css
color: var(--brand);
```

或统一 Tailwind token。

---

## 10. AI 相关编码规范

AI 调用必须：

- 创建 ContextPack；
- 创建 AgentRun；
- 保存 AgentMessage；
- 展示解释摘要；
- 由用户决定是否采纳。

禁止：

- 直接覆盖正文；
- 展示原始思维链；
- 将禁用资料放入上下文；
- 忽略模型调用失败；
- 忽略 token 估算。

