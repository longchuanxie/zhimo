-- 004: Agent 长期记忆表
-- 用于跨会话记忆召回，存储从对话中提取的关键决策、偏好、事实等
CREATE TABLE IF NOT EXISTS agent_memories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_thread_id TEXT,
  kind TEXT NOT NULL DEFAULT 'fact',
  content TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (source_thread_id) REFERENCES agent_threads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_memories_project_id ON agent_memories(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_kind ON agent_memories(kind);
