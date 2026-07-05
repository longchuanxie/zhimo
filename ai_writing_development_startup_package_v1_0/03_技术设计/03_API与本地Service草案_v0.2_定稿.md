# API 与本地 Service 草案 v0.2

## 1. 客户端形态说明

MVP 是桌面客户端，本地优先。

因此前端优先调用本地 Service：

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

HTTP API 路径仅作为未来服务化或内部接口参考。

---

## 2. 通用响应

```json
{
  "success": true,
  "data": {},
  "request_id": "req_xxx"
}
```

错误响应：

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "参数校验失败",
    "details": {}
  },
  "request_id": "req_xxx"
}
```

---

## 3. Project

```http
GET /api/v1/projects
POST /api/v1/projects
GET /api/v1/projects/{project_id}
PATCH /api/v1/projects/{project_id}
DELETE /api/v1/projects/{project_id}
GET /api/v1/projects/{project_id}/overview
```

本地 Service：

```text
ProjectService.listProjects
ProjectService.createProject
ProjectService.getProject
ProjectService.updateProject
ProjectService.deleteProject
ProjectService.getProjectOverview
```

---

## 4. Document

```http
GET /api/v1/projects/{project_id}/documents
POST /api/v1/projects/{project_id}/documents
GET /api/v1/projects/{project_id}/documents/{document_id}
PATCH /api/v1/projects/{project_id}/documents/{document_id}
PUT /api/v1/projects/{project_id}/documents/{document_id}/autosave
DELETE /api/v1/projects/{project_id}/documents/{document_id}
```

---

## 5. Source

```http
GET /api/v1/projects/{project_id}/sources
POST /api/v1/projects/{project_id}/sources/text
POST /api/v1/projects/{project_id}/sources/upload
GET /api/v1/projects/{project_id}/sources/{source_id}
PATCH /api/v1/projects/{project_id}/sources/{source_id}
DELETE /api/v1/projects/{project_id}/sources/{source_id}
POST /api/v1/projects/{project_id}/sources/{source_id}/parse
POST /api/v1/projects/{project_id}/sources/{source_id}/summarize
GET /api/v1/projects/{project_id}/sources/{source_id}/chunks
```

---

## 6. Card

```http
GET /api/v1/projects/{project_id}/cards
POST /api/v1/projects/{project_id}/cards
POST /api/v1/projects/{project_id}/sources/{source_id}/cards
GET /api/v1/projects/{project_id}/cards/{card_id}
PATCH /api/v1/projects/{project_id}/cards/{card_id}
DELETE /api/v1/projects/{project_id}/cards/{card_id}
POST /api/v1/projects/{project_id}/cards/{card_id}/outline-nodes
```

---

## 7. Outline

```http
GET /api/v1/projects/{project_id}/outline
GET /api/v1/projects/{project_id}/outline/nodes
POST /api/v1/projects/{project_id}/outline/nodes
PATCH /api/v1/projects/{project_id}/outline/nodes/{node_id}
DELETE /api/v1/projects/{project_id}/outline/nodes/{node_id}
POST /api/v1/projects/{project_id}/outline/nodes/reorder
POST /api/v1/projects/{project_id}/outline/nodes/{node_id}/create-document
POST /api/v1/projects/{project_id}/outline/generate
```

---

## 8. Knowledge

```http
GET /api/v1/projects/{project_id}/knowledge
POST /api/v1/projects/{project_id}/knowledge
GET /api/v1/projects/{project_id}/knowledge/{knowledge_id}
PATCH /api/v1/projects/{project_id}/knowledge/{knowledge_id}
DELETE /api/v1/projects/{project_id}/knowledge/{knowledge_id}
POST /api/v1/projects/{project_id}/agent-messages/{message_id}/save-as-knowledge
POST /api/v1/projects/{project_id}/agent-messages/{message_id}/save-as-card
```

---

## 9. Agent 与 Context

```http
GET /api/v1/projects/{project_id}/agent-threads
POST /api/v1/projects/{project_id}/agent-threads
GET /api/v1/projects/{project_id}/agent-threads/{thread_id}
GET /api/v1/projects/{project_id}/agent-threads/{thread_id}/messages
POST /api/v1/projects/{project_id}/agent-threads/{thread_id}/messages
POST /api/v1/projects/{project_id}/context-packs/preview
POST /api/v1/projects/{project_id}/context-packs
GET /api/v1/projects/{project_id}/context-packs/{context_pack_id}
```

AI 调用链：

```text
用户动作
  ↓
ContextPack 预览
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

---

## 10. Model

```http
GET /api/v1/model-providers
POST /api/v1/model-providers
PATCH /api/v1/model-providers/{provider_id}
DELETE /api/v1/model-providers/{provider_id}
POST /api/v1/model-providers/{provider_id}/test

GET /api/v1/model-configs
POST /api/v1/model-configs
PATCH /api/v1/model-configs/{model_config_id}
DELETE /api/v1/model-configs/{model_config_id}
```

---

## 11. Export

```http
POST /api/v1/projects/{project_id}/exports
GET /api/v1/projects/{project_id}/exports
GET /api/v1/projects/{project_id}/exports/{export_task_id}
GET /api/v1/projects/{project_id}/exports/{export_task_id}/download
POST /api/v1/projects/{project_id}/exports/{export_task_id}/retry
```

---

## 12. 认证说明

MVP 不要求 Authorization Header。

后续 P1/P2 再接入用户认证和工作空间管理。
