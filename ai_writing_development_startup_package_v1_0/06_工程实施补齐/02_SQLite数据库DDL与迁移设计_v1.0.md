# SQLite 数据库 DDL 与迁移设计 v1.0

## 1. 目标

为 MVP 提供可执行的 SQLite 表结构、索引和迁移规则。

DDL 文件：

```text
06_工程实施补齐/sql/001_initial_schema.sql
```

---

## 2. 设计原则

```text
Project 是聚合根
所有核心对象必须带 project_id
删除默认软删除
AI 调用必须可追溯
ContextPack 必须可回放
API Key 不明文存储
状态枚举保持英文，UI 显示中文
```

---

## 3. 迁移机制

使用：

```text
schema_migrations
```

记录已应用版本。

字段：

```text
version
applied_at
```

启动时流程：

```text
连接 SQLite
  ↓
PRAGMA foreign_keys = ON
  ↓
创建 schema_migrations
  ↓
读取已应用迁移
  ↓
顺序执行未应用 SQL
  ↓
插入迁移记录
```

---

## 4. MVP 初始迁移

```text
001_initial_schema.sql
```

包含：

```text
users
workspaces
projects
documents
sources
source_chunks
cards
outlines
outline_nodes
knowledge
agent_threads
agent_messages
agent_runs
context_packs
model_providers
model_configs
export_tasks
tasks
operation_logs
```

---

## 5. 默认数据

首次启动后写入：

```sql
INSERT OR IGNORE INTO users(id, display_name)
VALUES ('default_user', '默认用户');

INSERT OR IGNORE INTO workspaces(id, name, created_by)
VALUES ('default_workspace', '默认工作空间', 'default_user');
```

---

## 6. JSON 字段说明

SQLite 中以下字段以 JSON 字符串保存：

```text
content_json
keywords
tags
structured_output
explanation
document_ids
source_ids
source_chunk_ids
card_ids
knowledge_ids
outline_node_ids
previous_message_ids
project_rules_snapshot
payload
result
```

前端 / Service 必须负责序列化和反序列化。

---

## 7. 索引策略

高频查询必须有索引：

```text
project_id
workspace_id
status
is_deleted
updated_at
thread_id
source_id
outline_id
```

---

## 8. 软删除策略

以下对象默认软删除：

```text
projects
documents
sources
cards
outline_nodes
knowledge
```

软删除字段：

```text
is_deleted
deleted_at
```

查询默认条件：

```sql
WHERE is_deleted = 0
```

---

## 9. 可维护性要求

新增表必须补充：

```text
DDL
索引
字段说明
状态枚举
Service 映射
迁移版本
测试用例
```
