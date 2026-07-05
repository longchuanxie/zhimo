// 业务对象中文名称映射
// 集中维护所有业务对象的中文显示名称
// 对应文档：02_UX_UI_原型与规范/04_中文优先UI规范_v0.1.md

/// 业务对象中文名称
export const OBJECT_LABELS = {
  project: '项目',
  document: '文档',
  source: '资料',
  sourceChunk: '资料片段',
  card: '卡片',
  outline: '大纲',
  outlineNode: '大纲节点',
  knowledge: '知识',
  agentThread: '助手对话',
  agentMessage: '助手消息',
  agentRun: '生成任务',
  contextPack: '本次参考内容',
  modelProvider: '模型服务商',
  modelConfig: '模型配置',
  exportTask: '导出任务',
  operationLog: '操作记录',
  task: '任务',
  reference: '参考文献',
  citation: '引文',
  figure: '图表',
  equation: '公式',
} as const

export type ObjectKey = keyof typeof OBJECT_LABELS

/// 获取业务对象中文名称
export function getObjectLabel(key: string): string {
  return (OBJECT_LABELS as Record<string, string>)[key] ?? key
}

/// 主导航中文名称
export const NAV_LABELS = {
  projectHome: '项目首页',
  documents: '文档',
  sources: '资料',
  cards: '卡片',
  outline: '大纲',
  knowledge: '知识库',
  agent: '助手对话',
  modelSettings: '模型设置',
  export: '导出',
  taskCenter: '任务中心',
  references: '参考文献',
} as const

/// 通用 UI 文案
export const UI_TEXT = {
  // 通用动作
  create: '新建',
  edit: '编辑',
  delete: '删除',
  save: '保存',
  cancel: '取消',
  confirm: '确认',
  retry: '重试',
  close: '关闭',
  search: '搜索',
  filter: '筛选',
  refresh: '刷新',
  import: '导入',
  export: '导出',
  copy: '复制',
  paste: '粘贴',

  // 状态
  loading: '加载中...',
  empty: '暂无数据',
  error: '出错了',
  saving: '保存中...',
  saved: '已保存',

  // 项目
  createProject: '创建项目',
  createProjectFromDocument: '从文档创建',
  openProject: '打开项目',
  projectSettings: '项目设置',
  selectDocument: '选择文档',
  inferProjectMeta: 'AI 推断项目信息',

  // 资料
  importFile: '导入文件',
  pasteText: '粘贴文本',
  aiUsageAllowed: '允许 AI 使用',

  // Agent
  sendMessage: '发送',
  previewContext: '本次参考内容',
  whySuggested: '为什么这样建议',
  acceptSuggestion: '接受修改',
  rejectSuggestion: '拒绝',
  saveAsCard: '保存为卡片',
  saveAsKnowledge: '保存为知识',

  // 模型
  addProvider: '添加模型服务商',
  testConnection: '测试连接',
  connectionSuccess: '连接成功',
  connectionFailed: '连接失败',

  // 导出
  startExport: '开始导出',
  openFile: '打开文件',
  retryExport: '重试导出',
} as const
