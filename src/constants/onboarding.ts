// 项目 AI 引导创建文案常量
// 集中维护引导流程中的用户可见文案，避免散落在页面中

export const ONBOARDING_MESSAGES = {
  welcome:
    '你好！我是你的写作助手。请用一句话描述你想写的项目，我会帮你一步步完善项目设定。',
  welcomeHint: '例如：我想写一篇关于人工智能伦理的学术论文，面向普通读者，约 8000 字。',
  askDescription: '请用一句话描述你的写作项目。',
  askTypeAndName: (name: string, typeLabel: string) =>
    `我初步判断这是一个「${typeLabel}」项目，建议名称为「${name}」。如果不合适，请直接修改或告诉我。`,
  askTargetReader: '这个项目主要写给谁看？',
  askTargetReaderHint: '例如：学术评审、大学生、行业从业者、普通读者、青少年等。',
  askWritingGoal: '你希望通过这个项目达成什么目标？',
  askWritingGoalHint: '例如：系统梳理某领域现状、提出新观点、完成课程作业、创作一部小说等。',
  askWordCount: (suggested: number) =>
    `根据你的描述，我建议目标字数约为 ${suggested.toLocaleString()} 字。你可以接受或修改。`,
  askStyleRules: '你希望 AI 助手在写作中遵循哪些风格规则？',
  askStyleRulesHint: '例如：语言正式、避免口语化、段落简洁、多用例子等。',
  askForbiddenRules: '有哪些内容或写法是 AI 助手应该避免的？',
  askForbiddenRulesHint: '例如：不引用未标注来源的数据、不使用第一人称、不虚构案例等。',
  confirmSummary: '项目信息已收集完成，确认后即可创建项目。',
  confirmButton: '确认并创建项目',
  retryButton: '重试',
  backButton: '上一步',
  nextButton: '下一步',
  sendButton: '发送',
} as const

/// 每个引导节点对应的问题提示（用于快捷选项场景）
export const ONBOARDING_NODE_LABELS = {
  welcome: '开始',
  description: '一句话描述',
  typeAndName: '项目类型与名称',
  targetReader: '目标读者',
  writingGoal: '写作目标',
  wordCount: '目标字数',
  styleRules: '风格规则',
  forbiddenRules: '禁止规则',
  confirm: '确认创建',
} as const

/// 模型调用超时（毫秒）
export const ONBOARDING_MODEL_TIMEOUT_MS = 30000
