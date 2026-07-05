-- AI 原生写作项目系统 SQLite DDL v1.0
-- MVP: local-first, single-user, no-auth

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('research','fiction','free_writing')),
  description TEXT,
  writing_goal TEXT,
  target_reader TEXT,
  target_word_count INTEGER DEFAULT 0,
  current_word_count INTEGER DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'zh-CN',
  style_rules TEXT,
  forbidden_rules TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL,
  updated_by TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id, is_deleted, updated_at);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'normal',
  content_json TEXT,
  plain_text TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  outline_node_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  summary TEXT,
  last_edited_at TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id, is_deleted, updated_at);
CREATE INDEX IF NOT EXISTS idx_documents_outline_node ON documents(outline_node_id);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pdf','word','markdown','txt','text','web','other')),
  file_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  raw_text TEXT,
  summary_short TEXT,
  summary_long TEXT,
  keywords TEXT,
  ai_usage_allowed INTEGER NOT NULL DEFAULT 1,
  privacy_level TEXT NOT NULL DEFAULT 'local_only',
  processing_status TEXT NOT NULL DEFAULT 'pending',
  source_status TEXT NOT NULL DEFAULT 'active',
  error_message TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sources_project ON sources(project_id, is_deleted, updated_at);
CREATE INDEX IF NOT EXISTS idx_sources_processing ON sources(project_id, processing_status);

CREATE TABLE IF NOT EXISTS source_chunks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  page_number INTEGER,
  start_offset INTEGER,
  end_offset INTEGER,
  embedding_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_source_chunks_source ON source_chunks(source_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_source_chunks_project ON source_chunks(project_id);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  tags TEXT,
  source_id TEXT,
  source_chunk_id TEXT,
  source_document_id TEXT,
  source_agent_message_id TEXT,
  ai_usage_allowed INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES sources(id),
  FOREIGN KEY (source_chunk_id) REFERENCES source_chunks(id),
  FOREIGN KEY (source_document_id) REFERENCES documents(id)
);

CREATE INDEX IF NOT EXISTS idx_cards_project ON cards(project_id, status, is_deleted, updated_at);
CREATE INDEX IF NOT EXISTS idx_cards_source ON cards(source_id, source_chunk_id);

CREATE TABLE IF NOT EXISTS outlines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '默认大纲',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS outline_nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  outline_id TEXT NOT NULL,
  parent_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  sort_order INTEGER NOT NULL DEFAULT 0,
  depth INTEGER NOT NULL DEFAULT 0,
  linked_document_id TEXT,
  target_word_count INTEGER DEFAULT 0,
  current_word_count INTEGER DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (outline_id) REFERENCES outlines(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES outline_nodes(id),
  FOREIGN KEY (linked_document_id) REFERENCES documents(id)
);

CREATE INDEX IF NOT EXISTS idx_outline_nodes_outline ON outline_nodes(outline_id, parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_outline_nodes_project ON outline_nodes(project_id, is_deleted);

CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  source_type TEXT,
  source_id TEXT,
  ai_usage_allowed INTEGER NOT NULL DEFAULT 1,
  confidence REAL,
  version INTEGER NOT NULL DEFAULT 1,
  replaced_by_id TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (replaced_by_id) REFERENCES knowledge(id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_project ON knowledge(project_id, status, is_deleted, updated_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge(source_type, source_id);

CREATE TABLE IF NOT EXISTS agent_threads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  agent_role TEXT NOT NULL,
  bound_object_type TEXT NOT NULL,
  bound_object_id TEXT,
  context_scope TEXT NOT NULL DEFAULT 'current_object',
  thread_summary TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_threads_project ON agent_threads(project_id, bound_object_type, bound_object_id, updated_at);

CREATE TABLE IF NOT EXISTS context_packs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  thread_id TEXT,
  task_type TEXT NOT NULL,
  user_instruction TEXT,
  context_scope TEXT NOT NULL,
  selected_text TEXT,
  document_ids TEXT,
  source_ids TEXT,
  source_chunk_ids TEXT,
  card_ids TEXT,
  knowledge_ids TEXT,
  outline_node_ids TEXT,
  previous_message_ids TEXT,
  project_rules_snapshot TEXT,
  context_summary TEXT,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES agent_threads(id)
);

CREATE INDEX IF NOT EXISTS idx_context_packs_project ON context_packs(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_context_packs_thread ON context_packs(thread_id, created_at);

CREATE TABLE IF NOT EXISTS model_providers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'openai_compatible',
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT,
  api_key_masked TEXT,
  default_model_name TEXT NOT NULL,
  connection_status TEXT NOT NULL DEFAULT 'untested',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE TABLE IF NOT EXISTS model_configs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  model_name TEXT NOT NULL,
  temperature REAL NOT NULL DEFAULT 0.7,
  max_output_tokens INTEGER NOT NULL DEFAULT 4096,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (provider_id) REFERENCES model_providers(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_configs_task ON model_configs(workspace_id, task_type);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  context_pack_id TEXT NOT NULL,
  model_config_id TEXT,
  model_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES agent_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (context_pack_id) REFERENCES context_packs(id),
  FOREIGN KEY (model_config_id) REFERENCES model_configs(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_thread ON agent_runs(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(project_id, status);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  structured_output TEXT,
  explanation TEXT,
  context_pack_id TEXT,
  agent_run_id TEXT,
  adoption_status TEXT NOT NULL DEFAULT 'not_applied',
  saved_as_card_id TEXT,
  saved_as_knowledge_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (thread_id) REFERENCES agent_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (context_pack_id) REFERENCES context_packs(id),
  FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id),
  FOREIGN KEY (saved_as_card_id) REFERENCES cards(id),
  FOREIGN KEY (saved_as_knowledge_id) REFERENCES knowledge(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_thread ON agent_messages(thread_id, created_at);

CREATE TABLE IF NOT EXISTS export_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  export_scope TEXT NOT NULL,
  export_format TEXT NOT NULL CHECK (export_format IN ('markdown','word')),
  document_ids TEXT,
  outline_node_ids TEXT,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_export_tasks_project ON export_tasks(project_id, created_at);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  task_type TEXT NOT NULL,
  object_type TEXT,
  object_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  payload TEXT,
  result TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, task_type, status);

CREATE TABLE IF NOT EXISTS operation_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  object_type TEXT,
  object_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operation_logs_project ON operation_logs(project_id, created_at);

-- 默认数据：MVP 单用户模式
-- 默认用户 default_user，默认工作空间 default_workspace
INSERT OR IGNORE INTO users(id, display_name)
VALUES ('default_user', '默认用户');

INSERT OR IGNORE INTO workspaces(id, name, created_by)
VALUES ('default_workspace', '默认工作空间', 'default_user');
