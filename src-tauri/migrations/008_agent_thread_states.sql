-- Agent 多轮工作状态
-- 用于记录每个对话线程的当前目标、约束、采纳/拒绝历史与活跃对象

CREATE TABLE IF NOT EXISTS agent_thread_states (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  thread_id TEXT NOT NULL UNIQUE,
  current_goal TEXT,
  current_step TEXT,
  user_constraints TEXT,
  accepted_decisions TEXT,
  rejected_directions TEXT,
  active_document_id TEXT,
  active_outline_node_id TEXT,
  last_context_pack_id TEXT,
  unresolved_questions TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES agent_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (active_document_id) REFERENCES documents(id),
  FOREIGN KEY (active_outline_node_id) REFERENCES outline_nodes(id),
  FOREIGN KEY (last_context_pack_id) REFERENCES context_packs(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_thread_states_project ON agent_thread_states(project_id, updated_at);
