-- 006: 放开 export_tasks.export_format CHECK 约束,支持 latex/docx
-- 背景:001_initial_schema.sql 的 CHECK 限制 export_format IN ('markdown','word')
-- SQLite 不支持 ALTER TABLE DROP CONSTRAINT,通过标准重建表流程实现
-- 注意:005 迁移已 ALTER TABLE ADD COLUMN export_options,新表必须包含该列以保留数据
-- 注意:tauri-plugin-sql 已自动为每个迁移包裹事务,禁止使用显式 BEGIN/COMMIT,否则触发嵌套事务错误

-- 1. 创建新表(放宽 CHECK 为 4 种格式,保留 export_options 列)
CREATE TABLE export_tasks_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  export_scope TEXT NOT NULL,
  export_format TEXT NOT NULL CHECK (export_format IN ('markdown','word','latex','docx')),
  document_ids TEXT,
  outline_node_ids TEXT,
  export_options TEXT,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 2. 复制全部数据(含 005 新增的 export_options 列)
INSERT INTO export_tasks_new (
  id, project_id, export_scope, export_format,
  document_ids, outline_node_ids, export_options,
  file_path, status, error_code, error_message,
  created_at, completed_at
)
SELECT
  id, project_id, export_scope, export_format,
  document_ids, outline_node_ids, export_options,
  file_path, status, error_code, error_message,
  created_at, completed_at
FROM export_tasks;

-- 3. 删除旧表(索引随表自动删除)
DROP TABLE export_tasks;

-- 4. 重命名新表为正式表名
ALTER TABLE export_tasks_new RENAME TO export_tasks;

-- 5. 重建索引
CREATE INDEX IF NOT EXISTS idx_export_tasks_project ON export_tasks(project_id, created_at);
