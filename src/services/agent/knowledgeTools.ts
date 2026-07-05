// 知识库工具已迁移到 ./tools/knowledgeTools.ts
// 此文件保留 re-export 以兼容现有 import（如 AgentService 旧引用）
//
// 新代码请直接从 '@/services/agent/tools/knowledgeTools' 导入

export {
  SEARCH_KNOWLEDGE_TOOL,
  GET_KNOWLEDGE_TOOL,
  CREATE_KNOWLEDGE_TOOL,
  UPDATE_KNOWLEDGE_TOOL,
  KNOWLEDGE_TOOLS,
  ANSWER_QUESTION_TOOLS,
  createKnowledgeToolExecutors,
} from './tools/knowledgeTools'
