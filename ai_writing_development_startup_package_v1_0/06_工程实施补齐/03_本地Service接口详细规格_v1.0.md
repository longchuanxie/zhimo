# 本地 Service 接口详细规格 v1.0

## 1. 总原则

前端页面和组件不得直接访问数据库、文件系统或模型 API。

统一调用 Service：

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

## 2. 通用返回结构

```ts
type ServiceResult<T> = {
  ok: true
  data: T
} | {
  ok: false
  error: AppError
}

type AppError = {
  code: string
  message: string
  detail?: unknown
  retryable?: boolean
}
```

---

## 3. ProjectService

### listProjects

```ts
listProjects(input?: {
  keyword?: string
  type?: ProjectType
  status?: ProjectStatus
}): Promise<ServiceResult<Project[]>>
```

### createProject

```ts
createProject(input: {
  name: string
  type: 'research' | 'fiction' | 'free_writing'
  description?: string
  writingGoal?: string
  targetReader?: string
  targetWordCount?: number
  styleRules?: string
  forbiddenRules?: string
}): Promise<ServiceResult<Project>>
```

副作用：

```text
创建 Project
创建默认 Outline
写入 operation_logs
```

### getProjectOverview

```ts
getProjectOverview(projectId: string): Promise<ServiceResult<{
  project: Project
  documentCount: number
  sourceCount: number
  cardCount: number
  knowledgeCount: number
  recentDocuments: Document[]
  recentThreads: AgentThread[]
}>>
```

---

## 4. DocumentService

### createDocument

```ts
createDocument(input: {
  projectId: string
  title: string
  outlineNodeId?: string
}): Promise<ServiceResult<Document>>
```

### autosaveDocument

```ts
autosaveDocument(input: {
  projectId: string
  documentId: string
  contentJson: unknown
  plainText: string
  wordCount: number
  clientRevision?: number
}): Promise<ServiceResult<{
  documentId: string
  savedAt: string
  wordCount: number
}>>
```

规则：

```text
自动更新 word_count
自动更新 last_edited_at
不得覆盖比当前更新的服务端版本
```

---

## 5. SourceService

### uploadSource

```ts
uploadSource(input: {
  projectId: string
  filePath: string
  title?: string
  aiUsageAllowed?: boolean
  privacyLevel?: 'local_only' | 'cloud_allowed'
}): Promise<ServiceResult<Source>>
```

副作用：

```text
复制文件到项目 sources 目录
创建 Source
创建 parse_source 任务
```

### createTextSource

```ts
createTextSource(input: {
  projectId: string
  title: string
  rawText: string
  aiUsageAllowed?: boolean
}): Promise<ServiceResult<Source>>
```

### createCardFromSource

```ts
createCardFromSource(input: {
  projectId: string
  sourceId: string
  sourceChunkId?: string
  selectedText: string
  cardType: string
  title?: string
}): Promise<ServiceResult<Card>>
```

---

## 6. CardService

```ts
listCards(input: {
  projectId: string
  type?: string
  status?: CardStatus
  sourceId?: string
  keyword?: string
}): Promise<ServiceResult<Card[]>>

createCard(input: {
  projectId: string
  title: string
  type: string
  content: string
  sourceId?: string
  sourceChunkId?: string
  tags?: string[]
}): Promise<ServiceResult<Card>>

updateCard(input: {
  projectId: string
  cardId: string
  patch: Partial<Card>
}): Promise<ServiceResult<Card>>
```

---

## 7. OutlineService

```ts
getOutline(projectId: string): Promise<ServiceResult<{
  outline: Outline
  nodes: OutlineNode[]
}>>

createOutlineNode(input: {
  projectId: string
  parentId?: string
  title: string
  description?: string
}): Promise<ServiceResult<OutlineNode>>

createDocumentFromNode(input: {
  projectId: string
  nodeId: string
}): Promise<ServiceResult<Document>>
```

---

## 8. KnowledgeService

```ts
listKnowledge(input: {
  projectId: string
  type?: string
  status?: KnowledgeStatus
  keyword?: string
}): Promise<ServiceResult<Knowledge[]>>

createKnowledge(input: {
  projectId: string
  title: string
  type: string
  content: string
  sourceType?: string
  sourceId?: string
  status?: KnowledgeStatus
}): Promise<ServiceResult<Knowledge>>

saveAgentMessageAsKnowledge(input: {
  projectId: string
  messageId: string
  title?: string
  type: string
}): Promise<ServiceResult<Knowledge>>
```

---

## 9. ContextService

### previewContext

```ts
previewContext(input: {
  projectId: string
  threadId?: string
  taskType: AgentTaskType
  boundObjectType: string
  boundObjectId?: string
  selectedText?: string
  userInstruction?: string
}): Promise<ServiceResult<ContextPreview>>
```

### createContextPack

```ts
createContextPack(input: ContextPreview & {
  userConfirmed?: boolean
}): Promise<ServiceResult<ContextPack>>
```

规则：

```text
禁用资料不得进入上下文
已废弃卡片不得进入上下文
已废弃知识不得进入上下文
必须保存快照
```

---

## 10. AgentService

```ts
createThread(input: {
  projectId: string
  agentRole: string
  boundObjectType: string
  boundObjectId?: string
  title?: string
}): Promise<ServiceResult<AgentThread>>

sendMessage(input: {
  projectId: string
  threadId: string
  content: string
  contextPackId?: string
}): Promise<ServiceResult<{
  userMessage: AgentMessage
  run: AgentRun
}>>

saveAssistantMessage(input: {
  projectId: string
  threadId: string
  runId: string
  content: string
  explanation?: AgentExplanation
}): Promise<ServiceResult<AgentMessage>>
```

---

## 11. ModelService

```ts
createProvider(input: {
  name: string
  type: 'openai_compatible'
  baseUrl: string
  apiKey: string
  defaultModelName: string
}): Promise<ServiceResult<ModelProvider>>

testProvider(providerId: string): Promise<ServiceResult<{
  status: 'connected' | 'failed'
  message: string
}>>

callModel(input: {
  modelConfigId: string
  messages: ModelMessage[]
  stream?: boolean
  signal?: AbortSignal
}): Promise<ServiceResult<ModelResult>>
```

---

## 12. ExportService

```ts
createExportTask(input: {
  projectId: string
  exportScope: 'whole_project' | 'current_document' | 'outline_scope'
  exportFormat: 'markdown' | 'word'
  documentIds?: string[]
  outlineNodeIds?: string[]
}): Promise<ServiceResult<ExportTask>>
```

---

## 13. TaskService

```ts
createTask(input: {
  projectId?: string
  taskType: TaskType
  objectType?: string
  objectId?: string
  payload?: unknown
}): Promise<ServiceResult<Task>>

updateTaskProgress(input: {
  taskId: string
  progress: number
  status?: TaskStatus
}): Promise<ServiceResult<Task>>

retryTask(taskId: string): Promise<ServiceResult<Task>>
cancelTask(taskId: string): Promise<ServiceResult<Task>>
```
