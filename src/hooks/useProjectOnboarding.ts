// 项目 AI 引导创建状态管理 Hook
// 职责：管理节点流转、草稿状态、对话消息、模型调用

import { useState, useEffect, useCallback } from 'react'
import {
  parseInitialDescription,
  refineField,
  buildSummary,
  type OnboardingNode,
  type DraftProject,
} from '@/services/project/ProjectOnboardingService'
import { ONBOARDING_MESSAGES } from '@/constants/onboarding'
import { PROJECT_TYPE_LABEL } from '@/constants/status'
import type { ChatMessage } from '@/components/project/OnboardingChat'

const NODE_SEQUENCE: OnboardingNode[] = [
  'description',
  'typeAndName',
  'targetReader',
  'writingGoal',
  'wordCount',
  'styleRules',
  'forbiddenRules',
  'confirm',
]

const INITIAL_DRAFT: DraftProject = {
  name: '',
  type: 'free_writing',
  description: '',
  writingGoal: '',
  targetReader: '',
  targetWordCount: 0,
  styleRules: '',
  forbiddenRules: '',
}

export type OnboardingState = {
  node: OnboardingNode
  draft: DraftProject
  messages: ChatMessage[]
  input: string
  loading: boolean
  error: { message: string; code?: string } | null
  submitting: boolean
}

export type OnboardingActions = {
  setInput: (value: string) => void
  handleSend: (overrideText?: string) => Promise<void>
  handleBack: () => void
  setError: (error: { message: string; code?: string } | null) => void
  setSubmitting: (value: boolean) => void
  quickOptions: string[]
  placeholder: string
}

export function useProjectOnboarding(): [OnboardingState, OnboardingActions] {
  const [node, setNode] = useState<OnboardingNode>('description')
  const [draft, setDraft] = useState<DraftProject>(INITIAL_DRAFT)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const addAgentMessage = useCallback((content: string, hint?: string) => {
    setMessages((prev) => [
      ...prev,
      { id: generateMessageId(), role: 'agent', content, hint },
    ])
  }, [])

  const addUserMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: generateMessageId(), role: 'user', content },
    ])
  }, [])

  useEffect(() => {
    addAgentMessage(
      ONBOARDING_MESSAGES.welcome,
      ONBOARDING_MESSAGES.welcomeHint,
    )
  }, [addAgentMessage])

  const enterNode = useCallback(
    (nextNode: OnboardingNode, nextDraft: DraftProject) => {
      setNode(nextNode)
      setDraft(nextDraft)
      setInput('')

      switch (nextNode) {
        case 'typeAndName':
          addAgentMessage(
            ONBOARDING_MESSAGES.askTypeAndName(
              nextDraft.name,
              PROJECT_TYPE_LABEL[nextDraft.type],
            ),
          )
          break
        case 'targetReader':
          addAgentMessage(
            ONBOARDING_MESSAGES.askTargetReader,
            ONBOARDING_MESSAGES.askTargetReaderHint,
          )
          break
        case 'writingGoal':
          addAgentMessage(
            ONBOARDING_MESSAGES.askWritingGoal,
            ONBOARDING_MESSAGES.askWritingGoalHint,
          )
          break
        case 'wordCount':
          addAgentMessage(
            ONBOARDING_MESSAGES.askWordCount(nextDraft.targetWordCount),
          )
          break
        case 'styleRules':
          addAgentMessage(
            ONBOARDING_MESSAGES.askStyleRules,
            ONBOARDING_MESSAGES.askStyleRulesHint,
          )
          break
        case 'forbiddenRules':
          addAgentMessage(
            ONBOARDING_MESSAGES.askForbiddenRules,
            ONBOARDING_MESSAGES.askForbiddenRulesHint,
          )
          break
        case 'confirm':
          addAgentMessage(
            `${ONBOARDING_MESSAGES.confirmSummary}\n\n${buildSummary(nextDraft)}`,
          )
          break
      }
    },
    [addAgentMessage],
  )

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const userText = (overrideText ?? input).trim()
      if (!userText || loading || submitting) return

      addUserMessage(userText)
      setInput('')
      setError(null)

      if (node === 'confirm') {
        return
      }

      setLoading(true)

      try {
        if (node === 'description') {
          const result = await parseInitialDescription(userText)
        if (!result.ok) {
          setError({ message: result.error.message, code: result.error.code })
          setLoading(false)
          return
        }
          const nextDraft: DraftProject = {
            ...draft,
            name: result.data.name,
            type: result.data.type,
            description: result.data.description,
            targetWordCount: result.data.suggestedWordCount,
          }
          enterNode('typeAndName', nextDraft)
        } else {
          const field = node as Exclude<OnboardingNode, 'description' | 'confirm'>
        const result = await refineField(field, draft, userText)
        if (!result.ok) {
          setError({ message: result.error.message, code: result.error.code })
          setLoading(false)
          return
        }

          const nextDraft = applyRefinedValue(field, draft, result.data)
          const currentIndex = NODE_SEQUENCE.indexOf(node)
          const nextNode = NODE_SEQUENCE[currentIndex + 1] ?? 'confirm'
          enterNode(nextNode, nextDraft)
        }
      } finally {
        setLoading(false)
      }
    },
    [input, loading, submitting, node, draft, enterNode, addUserMessage],
  )

  const handleBack = useCallback(() => {
    const currentIndex = NODE_SEQUENCE.indexOf(node)
    if (currentIndex <= 0) return
    const prevNode = NODE_SEQUENCE[currentIndex - 1]!
    setNode(prevNode)
    setInput('')
    setError(null)
  }, [node])

  return [
    { node, draft, messages, input, loading, error, submitting },
    {
      setInput,
      handleSend,
      handleBack,
      setError,
      setSubmitting,
      quickOptions: getQuickOptions(node),
      placeholder: getPlaceholder(node),
    },
  ]
}

function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function applyRefinedValue(
  field: Exclude<OnboardingNode, 'description' | 'confirm'>,
  draft: DraftProject,
  result: { value: string | number; suggestedNext?: string },
): DraftProject {
  switch (field) {
    case 'typeAndName': {
      const extra = result.suggestedNext
        ? (JSON.parse(result.suggestedNext) as {
            name?: string
            type?: string
            description?: string
          })
        : {}
      return {
        ...draft,
        name: extra.name ?? String(result.value).slice(0, 30) ?? draft.name,
        type:
          extra.type === 'research' ||
          extra.type === 'fiction' ||
          extra.type === 'free_writing'
            ? extra.type
            : draft.type,
        description: extra.description ?? draft.description,
      }
    }
    case 'targetReader':
      return { ...draft, targetReader: String(result.value) }
    case 'writingGoal':
      return { ...draft, writingGoal: String(result.value) }
    case 'wordCount':
      return { ...draft, targetWordCount: Number(result.value) || 0 }
    case 'styleRules':
      return { ...draft, styleRules: String(result.value) }
    case 'forbiddenRules':
      return { ...draft, forbiddenRules: String(result.value) }
  }
}

function getQuickOptions(node: OnboardingNode): string[] {
  switch (node) {
    case 'typeAndName':
    case 'wordCount':
      return ['接受']
    case 'styleRules':
    case 'forbiddenRules':
      return ['暂无']
    case 'confirm':
      return ['确认']
    default:
      return []
  }
}

function getPlaceholder(node: OnboardingNode): string {
  switch (node) {
    case 'description':
      return '用一句话描述你的写作项目...'
    case 'confirm':
      return '输入「确认」创建项目'
    default:
      return '输入你的回答...'
  }
}
