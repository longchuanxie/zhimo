-- Agent 待确认操作表
-- 对应任务：Agent 项目操作工具集
-- 存储工具循环中收集的写操作意图，用户在消息卡片上确认后才真正调用 Service 落地
--
-- 设计说明：
-- - 一条助手消息可关联多条待确认操作（如一次对话中 agent 提议创建多个大纲节点）
-- - status 流转：pending → applied / rejected
-- - args 以 JSON 字符串存储，apply 时由 PendingActionService 按 toolName 路由解析
-- - 通过 message_id / project_id / thread_id 三重外键保证级联删除

CREATE TABLE IF NOT EXISTS agent_pending_actions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  args TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  FOREIGN KEY (message_id) REFERENCES agent_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES agent_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_message ON agent_pending_actions(message_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_project ON agent_pending_actions(project_id, created_at);
