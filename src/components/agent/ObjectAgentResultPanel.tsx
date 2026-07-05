// 对象级助手成果面板
// 在资料、卡片、知识等详情页展示当前对象绑定线程中的已采纳结果。

import {
  CheckCircleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { StatusTag } from '@/components/foundation/StatusTag'
import { useAsync } from '@/hooks/useAsync'
import {
  listAgentObjectResults,
  type AgentObjectResultItem,
} from '@/services/agent/AgentObjectResultService'
import type { BoundObjectType } from '@/types'

type ObjectAgentResultPanelProps = {
  projectId: string
  objectType: BoundObjectType
  objectId: string
}

const RESULT_STATUS_LABEL: Record<AgentObjectResultItem['adoptionStatus'], string> = {
  applied: '已采纳',
  saved_as_card: '已存为卡片',
  saved_as_knowledge: '已存为知识',
}

export function ObjectAgentResultPanel({
  projectId,
  objectType,
  objectId,
}: ObjectAgentResultPanelProps) {
  const { state } = useAsync(
    () => listAgentObjectResults({
      projectId,
      boundObjectType: objectType,
      boundObjectId: objectId,
      limit: 5,
    }),
    [projectId, objectType, objectId],
    { enabled: Boolean(projectId && objectId) },
  )

  if (state.status === 'loading') {
    return (
      <section className="card p-4">
        <PanelTitle />
        <p className="mt-3 text-sm text-subtle">正在整理当前对象的助手成果...</p>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="card p-4">
        <PanelTitle />
        <p className="mt-3 text-sm text-danger">
          助手成果加载失败：{state.error.message}
        </p>
      </section>
    )
  }

  const { items, thread } = state.data

  return (
    <section className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <PanelTitle />
        {thread && (
          <span className="shrink-0 text-xs text-subtle">
            {thread.title}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-subtle">
          暂无已采纳的助手成果。通过上方助手动作生成建议后，采纳结果会沉淀在这里。
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {items.map((item) => (
            <ResultItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}

function PanelTitle() {
  return (
    <div className="flex items-center gap-2">
      <AppIcon icon={SparklesIcon} size="sm" className="text-purple" />
      <div>
        <h2 className="text-sm font-bold text-ink">助手成果</h2>
        <p className="text-xs text-subtle">当前对象最近采纳的建议与沉淀结果</p>
      </div>
    </div>
  )
}

function ResultItem({ item }: { item: AgentObjectResultItem }) {
  return (
    <div className="rounded-md border border-line bg-surface-2/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <StatusTag
          status={item.adoptionStatus}
          label={RESULT_STATUS_LABEL[item.adoptionStatus]}
          color="purple"
          icon={<AppIcon icon={CheckCircleIcon} size="sm" />}
        />
        <span className="text-xs text-subtle">{formatDate(item.createdAt)}</span>
      </div>
      <p className="text-sm leading-relaxed text-ink">
        {item.contentPreview || '（空内容）'}
      </p>
      {(item.savedAsCardId || item.savedAsKnowledgeId) && (
        <p className="mt-2 text-xs text-subtle">
          {item.savedAsCardId && `卡片 ID：${item.savedAsCardId}`}
          {item.savedAsCardId && item.savedAsKnowledgeId && ' · '}
          {item.savedAsKnowledgeId && `知识 ID：${item.savedAsKnowledgeId}`}
        </p>
      )}
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN')
}
