export const APP_EVENTS = {
  agentPendingActionsChanged: 'agent-pending-actions-changed',
  documentContentChanged: 'document-content-changed',
  documentCreated: 'document-created',
  outlineChanged: 'outline-changed',
} as const

export type AgentPendingActionsChangedDetail = {
  messageId?: string
}

export type DocumentContentChangedDetail = {
  documentId: string
  source: 'agent_pending_action'
  actionId?: string
  messageId?: string
}

export type DocumentCreatedDetail = {
  projectId: string
  documentId?: string
  outlineNodeId?: string
  source: 'agent_pending_action'
  actionId?: string
  messageId?: string
}

export type OutlineChangedDetail = {
  projectId: string
  outlineNodeId?: string
  source: 'agent_pending_action'
  actionId?: string
  messageId?: string
}
