// 应用全局状态
// 管理 UI 级别状态：设置面板、助手面板、任务中心、编辑器选区等

import { create } from 'zustand'
import type { AgentTaskType, BoundObjectType, ContextScope } from '@/types'

/// 待处理的 Agent 动作（由选区浮动菜单等外部入口触发，AgentPanel 消费后清空）
export type PendingAgentAction = {
  taskType: AgentTaskType
  template: string
  boundObjectType?: BoundObjectType
  boundObjectId?: string
  contextScope?: ContextScope
  threadTitle?: string
  /// 外部对象命令已由用户明确触发时，可自动创建 ContextPack 并发送消息
  autoSubmit?: boolean
} | null

export type AgentInlineCandidate = {
  actionId: string
  messageId: string
  documentId: string
  content: string
  summary: string
  mode: 'append' | 'replace_selection'
  selectedText?: string
} | null

/// 编辑器插入类 Modal 类型(论文写作)
export type EditorModalType =
  | 'citation'
  | 'figure'
  | 'table'
  | 'equation'
  | 'crossReference'
  | 'footnote'
  | null

type AppState = {
  /// 设置面板是否打开
  settingsPanelOpen: boolean
  /// 智能助手面板是否打开
  agentPanelOpen: boolean
  /// 任务中心是否打开
  taskCenterOpen: boolean
  /// 当前编辑器选中文本（用于 Agent 快捷动作）
  selectedText: string
  /// Agent 采纳后显示在编辑器内的候选操作（由 PendingAction 支撑）
  agentInlineCandidate: AgentInlineCandidate
  /// 待处理的 Agent 动作（外部入口触发后由 AgentPanel 消费）
  pendingAgentAction: PendingAgentAction
  /// 当前活动文档 ID（DocumentEditorPage 挂载时设置，用于 Agent 采纳时判断是否有文档可插入）
  activeDocumentId: string | null
  /// 编辑器插入类 Modal(论文写作,EditorToolbar 触发,Editor 渲染)
  editorModal: EditorModalType

  // 动作
  toggleSettingsPanel: () => void
  setSettingsPanelOpen: (open: boolean) => void
  toggleAgentPanel: () => void
  setAgentPanelOpen: (open: boolean) => void
  toggleTaskCenter: () => void
  setTaskCenterOpen: (open: boolean) => void
  setSelectedText: (text: string) => void
  setAgentInlineCandidate: (candidate: AgentInlineCandidate) => void
  setPendingAgentAction: (action: PendingAgentAction) => void
  setActiveDocumentId: (id: string | null) => void
  setEditorModal: (modal: EditorModalType) => void
}

export const useAppStore = create<AppState>((set) => ({
  settingsPanelOpen: false,
  agentPanelOpen: true,
  taskCenterOpen: false,
  selectedText: '',
  agentInlineCandidate: null,
  pendingAgentAction: null,
  activeDocumentId: null,
  editorModal: null,

  toggleSettingsPanel: () => set((s) => ({ settingsPanelOpen: !s.settingsPanelOpen })),
  setSettingsPanelOpen: (open) => set({ settingsPanelOpen: open }),
  toggleAgentPanel: () => set((s) => ({ agentPanelOpen: !s.agentPanelOpen })),
  setAgentPanelOpen: (open) => set({ agentPanelOpen: open }),
  toggleTaskCenter: () => set((s) => ({ taskCenterOpen: !s.taskCenterOpen })),
  setTaskCenterOpen: (open) => set({ taskCenterOpen: open }),
  setSelectedText: (text) => set({ selectedText: text }),
  setAgentInlineCandidate: (candidate) => set({ agentInlineCandidate: candidate }),
  setPendingAgentAction: (action) => set({ pendingAgentAction: action }),
  setActiveDocumentId: (id) => set({ activeDocumentId: id }),
  setEditorModal: (modal) => set({ editorModal: modal }),
}))
