// 模型设置页
// 对应路由：/settings/models
// 数据映射：ModelService.listProviders + createProvider + updateProvider
//          + testProvider + deleteProvider + listConfigs + upsertConfig
//          + listProviderModels
// 对应任务：DEV-063 / DEV-064 / DEV-065 / DEV-066

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CpuChipIcon,
  PlusIcon,
  ArrowPathIcon,
  TrashIcon,
  PencilSquareIcon,
  ArrowLeftIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import { AppIcon } from '@/components/foundation/AppIcon'
import { EmptyState } from '@/components/foundation/EmptyState'
import { LoadingState } from '@/components/foundation/LoadingState'
import { ErrorState } from '@/components/foundation/ErrorState'
import { StatusTag } from '@/components/foundation/StatusTag'
import {
  Modal,
  ConfirmDialog,
  AlertDialog,
} from '@/components/foundation/Modal'
import { useAsync } from '@/hooks/useAsync'
import {
  listProviders,
  createProvider,
  updateProvider,
  testProvider,
  deleteProvider,
  listConfigs,
  upsertConfig,
  listProviderModels,
} from '@/services/model/ModelService'
import {
  MODEL_TASK_TYPE_LABEL,
  CONNECTION_STATUS_LABEL,
} from '@/constants/status'
import type {
  ModelProvider,
  ModelConfig,
  ModelTaskType,
  ModelInfo,
} from '@/types'
import type { ServiceResult } from '@/types/service'
import { ok } from '@/types/service'

const TASK_TYPES: ModelTaskType[] = [
  'chat',
  'rewrite',
  'expand',
  'summarize',
  'generate_outline',
  'parse_source',
  'generate_card',
]

/// 创建服务商时使用的临时默认模型名
/// 原因:DB schema 中 default_model_name 为 NOT NULL,新建时需占位值
/// 占位值,保存后由第二步「选择默认模型」更新为实际值
const TEMP_DEFAULT_MODEL = 'gpt-4o-mini'

/// 模型列表缓存:避免同一服务商短时间内重复请求 /v1/models
/// TTL 5 分钟,过期后下次查询自动刷新
const modelListCache = new Map<string, { models: ModelInfo[]; ts: number }>()
const MODEL_LIST_CACHE_TTL = 5 * 60 * 1000

/// 带缓存的模型列表查询
/// 命中且未过期直接返回缓存;否则调 listProviderModels 并写入缓存
/// 远程失败或返回空时不写入缓存(保证下次仍会尝试拉取)
async function fetchModelsCached(pid: string): Promise<ServiceResult<ModelInfo[]>> {
  const cached = modelListCache.get(pid)
  if (cached && Date.now() - cached.ts < MODEL_LIST_CACHE_TTL) {
    return ok(cached.models)
  }
  const result = await listProviderModels(pid)
  if (result.ok && result.data.length > 0) {
    modelListCache.set(pid, { models: result.data, ts: Date.now() })
  }
  return result
}

/// 格式化 token 数为可读字符串（如 65536 → "64K"）
function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}K`
  }
  return String(tokens)
}

export function ModelSettingsPage() {
  const navigate = useNavigate()
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<ModelProvider | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // 删除确认 / 删除失败提示
  const [deleteTarget, setDeleteTarget] = useState<ModelProvider | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const {
    state: providersState,
    refresh: refreshProviders,
  } = useAsync<ModelProvider[]>(() => listProviders(), [])

  const {
    state: configsState,
    refresh: refreshConfigs,
  } = useAsync<ModelConfig[]>(() => listConfigs(), [])

  const handleTest = async (provider: ModelProvider) => {
    setTestingId(provider.id)
    setMsg(null)
    const result = await testProvider(provider.id)
    setTestingId(null)

    if (result.ok) {
      setMsg(
        result.data.status === 'connected'
          ? `「${provider.name}」连接成功`
          : `「${provider.name}」连接失败：${result.data.message}`,
      )
      refreshProviders()
    } else {
      setMsg(`连接测试失败：${result.error.message}`)
    }
    setTimeout(() => setMsg(null), 3000)
  }

  const handleDeleteClick = (provider: ModelProvider) => {
    setDeleteTarget(provider)
  }

  const handleDeleteConfirm = async () => {
    const provider = deleteTarget
    if (!provider) return

    setDeletingId(provider.id)
    const result = await deleteProvider(provider.id)
    setDeletingId(null)

    if (result.ok) {
      refreshProviders()
      refreshConfigs()
    } else {
      setDeleteError(`删除失败：${result.error.message}`)
    }
  }

  const handleEdit = (provider: ModelProvider) => {
    setEditingProvider(provider)
    setShowFormModal(true)
  }

  const handleCreate = () => {
    setEditingProvider(null)
    setShowFormModal(true)
  }

  if (providersState.status === 'loading' || configsState.status === 'loading') {
    return <LoadingState message="正在加载模型设置..." />
  }

  if (providersState.status === 'error') {
    return (
      <ErrorState
        error={providersState.error}
        onRetry={refreshProviders}
        title="模型设置加载失败"
      />
    )
  }

  const providers = providersState.data
  const configs = configsState.status === 'success' ? configsState.data : []

  return (
    <div className="h-full flex flex-col">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3 px-8 py-5 border-b border-line">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => navigate('/projects')}
        >
          <AppIcon icon={ArrowLeftIcon} size="sm" />
          返回项目
        </button>
        <div className="h-4 w-px bg-line" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-ink">模型设置</h1>
          <p className="text-sm text-muted mt-1">
            管理 OpenAI-compatible 模型服务商，并为不同任务配置专用模型。API Key 本地加密存储，不会上传。
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={handleCreate}>
          <AppIcon icon={PlusIcon} size="sm" />
          新增服务商
        </button>
      </div>

      {/* 消息提示 */}
      {msg && (
        <div className="mx-8 mt-3 rounded-md bg-brand-soft border border-brand/20 px-4 py-2">
          <p className="text-sm text-brand">{msg}</p>
        </div>
      )}

      <div className="flex-1 overflow-auto px-8 py-6 space-y-8">
        {/* 服务商列表 */}
        <section>
          <h2 className="text-lg font-bold text-ink mb-3">模型服务商</h2>
          {providers.length === 0 ? (
            <EmptyState
              icon={CpuChipIcon}
              title="还没有配置模型服务商"
              description="AI 助手需要通过 OpenAI-compatible 接口调用模型。请配置至少一个服务商，包括名称、Base URL、API Key 和默认模型名。"
              primaryAction={{
                label: '新增服务商',
                icon: PlusIcon,
                onClick: handleCreate,
              }}
              hint="支持任何兼容 OpenAI Chat Completions API 的服务商"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  testing={testingId === provider.id}
                  deleting={deletingId === provider.id}
                  onTest={() => handleTest(provider)}
                  onEdit={() => handleEdit(provider)}
                  onDelete={() => handleDeleteClick(provider)}
                />
              ))}
            </div>
          )}
        </section>

        {/* 任务模型配置 */}
        <section>
          <h2 className="text-lg font-bold text-ink mb-1">任务模型配置</h2>
          <p className="text-sm text-muted mb-3">
            为不同任务类型指定专用模型。未配置的任务将无法调用 AI 助手。
          </p>
          {providers.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-sm text-muted">请先新增至少一个模型服务商</p>
            </div>
          ) : (
            <div className="card divide-y divide-line">
              {TASK_TYPES.map((taskType) => (
                <TaskConfigRow
                  key={taskType}
                  taskType={taskType}
                  providers={providers}
                  config={configs.find((c) => c.taskType === taskType) ?? null}
                  onSaved={() => {
                    refreshConfigs()
                    setMsg('任务模型配置已保存')
                    setTimeout(() => setMsg(null), 2000)
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 新增/编辑服务商弹窗 */}
      {showFormModal && (
        <ProviderFormModal
          provider={editingProvider}
          onClose={() => {
            setShowFormModal(false)
            setEditingProvider(null)
          }}
          onSuccess={() => {
            setShowFormModal(false)
            setEditingProvider(null)
            refreshProviders()
          }}
        />
      )}

      {/* 删除确认弹框 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除服务商"
        description={
          deleteTarget
            ? `确定要删除服务商「${deleteTarget.name}」吗？关联的任务模型配置将一并删除。`
            : ''
        }
        confirmLabel="删除"
        cancelLabel="取消"
        danger
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />

      {/* 删除失败提示弹框 */}
      <AlertDialog
        open={deleteError !== null}
        title="删除失败"
        message={deleteError ?? ''}
        onClose={() => setDeleteError(null)}
      />
    </div>
  )
}

// ============ 子组件：服务商卡片 ============

type ProviderCardProps = {
  provider: ModelProvider
  testing: boolean
  deleting: boolean
  onTest: () => void
  onEdit: () => void
  onDelete: () => void
}

function ProviderCard({
  provider,
  testing,
  deleting,
  onTest,
  onEdit,
  onDelete,
}: ProviderCardProps) {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-ink truncate">
            {provider.name}
          </h3>
          <p className="text-xs text-subtle mt-0.5 truncate">
            {provider.baseUrl}
          </p>
        </div>
        <StatusTag
          status={provider.connectionStatus}
          label={CONNECTION_STATUS_LABEL[provider.connectionStatus]}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-subtle">
        <div>
          <span className="text-muted">默认模型：</span>
          <span className="text-ink">{provider.defaultModelName}</span>
        </div>
        <div>
          <span className="text-muted">API Key：</span>
          <span className="text-ink">
            {provider.apiKeyMasked ?? '未设置'}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-line">
        <div className="flex items-center gap-1">
          {provider.enabled ? (
            <StatusTag status="active" label="已启用" color="brand" />
          ) : (
            <StatusTag status="archived" label="已禁用" color="default" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-secondary"
            onClick={onTest}
            disabled={testing}
          >
            <AppIcon icon={ArrowPathIcon} size="sm" />
            {testing ? '测试中...' : '测试连接'}
          </button>
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={onEdit}
            aria-label="编辑"
          >
            <AppIcon icon={PencilSquareIcon} size="sm" />
          </button>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-danger hover:bg-danger-soft"
            onClick={onDelete}
            disabled={deleting}
            aria-label="删除"
          >
            <AppIcon icon={TrashIcon} size="sm" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ============ 子组件：任务配置行 ============

type TaskConfigRowProps = {
  taskType: ModelTaskType
  providers: ModelProvider[]
  config: ModelConfig | null
  onSaved: () => void
}

function TaskConfigRow({
  taskType,
  providers,
  config,
  onSaved,
}: TaskConfigRowProps) {
  const [providerId, setProviderId] = useState(config?.providerId ?? '')
  const [modelName, setModelName] = useState(config?.modelName ?? '')
  const [temperature, setTemperature] = useState(
    config ? String(config.temperature) : '0.7',
  )
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    config ? String(config.maxOutputTokens) : '4096',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 模型列表（含能力信息，选择服务商后自动拉取）
  const [modelOptions, setModelOptions] = useState<ModelInfo[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  // 模型列表是否拉取失败，失败时回退为手动输入
  const [useManualModelInput, setUseManualModelInput] = useState(false)

  // 当前所选模型的能力信息（用于 maxOutputTokens 校验）
  const selectedModelInfo = modelOptions.find((m) => m.id === modelName) ?? null
  const modelMaxOutput = selectedModelInfo?.maxOutputTokens ?? null

  const fetchModels = async (pid: string) => {
    setModelsLoading(true)
    setModelsError(null)
    const result = await fetchModelsCached(pid)
    setModelsLoading(false)

    if (result.ok && result.data.length > 0) {
      setModelOptions(result.data)
      setUseManualModelInput(false)
    } else {
      // 拉取失败或为空，回退为手动输入
      setModelOptions([])
      setUseManualModelInput(true)
      setModelsError(
        result.ok
          ? '该服务商未返回模型列表，请手动输入模型名称'
          : `模型列表获取失败：${result.error.message}`,
      )
    }
  }

  const handleProviderChange = (pid: string) => {
    setProviderId(pid)
    setModelName('')
    setModelOptions([])
    setModelsError(null)
    setUseManualModelInput(false)
    if (pid) {
      void fetchModels(pid)
    }
  }

  const handleSave = async () => {
    if (!providerId) {
      setError('请选择服务商')
      return
    }
    if (!modelName.trim()) {
      setError('请选择或输入模型名称')
      return
    }

    const tempNum = Number(temperature)
    const maxTokensNum = Number(maxOutputTokens)
    if (Number.isNaN(tempNum) || tempNum < 0 || tempNum > 2) {
      setError('Temperature 必须是 0~2 之间的数字')
      return
    }
    if (Number.isNaN(maxTokensNum) || maxTokensNum <= 0) {
      setError('最大输出 Token 必须是正整数')
      return
    }
    // 与模型实际上限对比校验
    if (modelMaxOutput !== null && maxTokensNum > modelMaxOutput) {
      setError(`不能超过模型最大输出 Token 上限 (${formatTokenCount(modelMaxOutput)})`)
      return
    }

    setSaving(true)
    setError(null)
    const result = await upsertConfig({
      taskType,
      providerId,
      modelName: modelName.trim(),
      temperature: tempNum,
      maxOutputTokens: maxTokensNum,
    })
    setSaving(false)

    if (result.ok) {
      onSaved()
    } else {
      setError(result.error.message)
    }
  }

  return (
    <div className="p-4 grid grid-cols-12 gap-3 items-end">
      <div className="col-span-2">
        <label className="block text-xs font-semibold text-muted mb-1">
          任务类型
        </label>
        <div className="text-sm font-bold text-ink">
          {MODEL_TASK_TYPE_LABEL[taskType]}
        </div>
      </div>

      <div className="col-span-3">
        <label className="block text-xs font-semibold text-muted mb-1">
          服务商
        </label>
        <select
          className="input py-1.5 text-sm"
          value={providerId}
          onChange={(e) => handleProviderChange(e.target.value)}
        >
          <option value="">请选择</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-3">
        <label className="block text-xs font-semibold text-muted mb-1">
          模型名称
          {modelsLoading && (
            <span className="ml-1 text-subtle font-normal">加载中...</span>
          )}
        </label>
        {useManualModelInput ? (
          <input
            type="text"
            className="input py-1.5 text-sm"
            placeholder="例如：gpt-4o-mini"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
          />
        ) : (
          <select
            className="input py-1.5 text-sm"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            disabled={modelsLoading || modelOptions.length === 0}
          >
            <option value="">
              {modelsLoading
                ? '加载中...'
                : modelOptions.length === 0
                  ? '请先选择服务商'
                  : '请选择模型'}
            </option>
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
                （上下文 {m.contextLength ? formatTokenCount(m.contextLength) : '未知'}
                {m.maxOutputTokens ? ` · 输出 ${formatTokenCount(m.maxOutputTokens)}` : ''}）
              </option>
            ))}
          </select>
        )}
        {modelsError && (
          <p className="text-xs text-subtle mt-1">{modelsError}</p>
        )}
      </div>

      <div className="col-span-1">
        <label className="block text-xs font-semibold text-muted mb-1">
          温度
        </label>
        <input
          type="text"
          className="input py-1.5 text-sm"
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
        />
      </div>

      <div className="col-span-2">
        <label className="block text-xs font-semibold text-muted mb-1">
          最大输出
          {modelMaxOutput !== null ? (
            <span className="ml-1 text-subtle font-normal">
              (上限: {formatTokenCount(modelMaxOutput)})
            </span>
          ) : selectedModelInfo ? (
            <span className="ml-1 text-subtle font-normal">(上限未知)</span>
          ) : null}
        </label>
        <input
          type="text"
          className="input py-1.5 text-sm"
          value={maxOutputTokens}
          onChange={(e) => setMaxOutputTokens(e.target.value)}
        />
        {modelMaxOutput !== null && (
          <button
            type="button"
            className="text-xs text-brand hover:underline mt-0.5"
            onClick={() => setMaxOutputTokens(String(Math.floor(modelMaxOutput * 0.75)))}
          >
            使用推荐值 ({formatTokenCount(Math.floor(modelMaxOutput * 0.75))})
          </button>
        )}
      </div>

      <div className="col-span-1 flex justify-end">
        <button
          type="button"
          className="btn-primary px-3 py-1.5"
          onClick={handleSave}
          disabled={saving || !providerId || !modelName.trim()}
        >
          <AppIcon icon={CheckIcon} size="sm" />
          {saving ? '...' : '保存'}
        </button>
      </div>

      {error && (
        <div className="col-span-12 text-xs text-danger">{error}</div>
      )}
    </div>
  )
}

// ============ 子组件：服务商表单弹窗 ============
//
// 两步流程：
// 1. 第一步：填写基本信息（名称、Base URL、API Key），点击"保存并获取模型"
//    - 新建模式：调用 createProvider（defaultModelName 用临时值），保存后进入第二步
//    - 编辑模式：调用 updateProvider 保存基本信息，进入第二步
// 2. 第二步：显示模型列表下拉框，选择默认模型，点击"完成"
//    - 调用 listProviderModels 拉取模型列表
//    - 用户选择后调用 updateProvider 更新 defaultModelName
//    - 模型列表为空或拉取失败时回退为手动输入

type ProviderFormModalProps = {
  provider: ModelProvider | null
  onClose: () => void
  onSuccess: () => void
}

function ProviderFormModal({
  provider,
  onClose,
  onSuccess,
}: ProviderFormModalProps) {
  const isEdit = !!provider

  // 第一步表单字段
  const [name, setName] = useState(provider?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState('')

  // 流程状态：'form' = 第一步（基本信息），'model' = 第二步（选择默认模型）
  const [step, setStep] = useState<'form' | 'model'>('form')
  // 保存后的服务商 ID（用于第二步拉取模型列表与更新默认模型）
  const [savedProviderId, setSavedProviderId] = useState<string | null>(
    provider?.id ?? null,
  )
  // 当前已保存的默认模型名（编辑模式下从 provider 初始化）
  const [defaultModelName, setDefaultModelName] = useState(
    provider?.defaultModelName ?? '',
  )

  // 模型列表（含能力信息）
  const [modelOptions, setModelOptions] = useState<ModelInfo[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  // 模型列表为空或拉取失败时回退为手动输入
  const [useManualModelInput, setUseManualModelInput] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 拉取模型列表
  const fetchModels = async (pid: string) => {
    setModelsLoading(true)
    setModelsError(null)
    const result = await fetchModelsCached(pid)
    setModelsLoading(false)

    if (result.ok && result.data.length > 0) {
      setModelOptions(result.data)
      setUseManualModelInput(false)
    } else {
      // 拉取失败或为空，回退为手动输入
      setModelOptions([])
      setUseManualModelInput(true)
      setModelsError(
        result.ok
          ? '该服务商未返回模型列表，请手动输入默认模型名称'
          : `模型列表获取失败：${result.error.message}`,
      )
    }
  }

  // 第一步：保存基本信息
  const handleSaveBasic = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim() || !baseUrl.trim()) {
      setError('名称、Base URL 不能为空')
      return
    }
    if (!isEdit && !apiKey.trim()) {
      setError('API Key 不能为空')
      return
    }

    setSubmitting(true)
    setError(null)

    const result = isEdit
      ? await updateProvider({
          providerId: provider!.id,
          patch: {
            name: name.trim(),
            baseUrl: baseUrl.trim(),
          },
          apiKey: apiKey === '' ? undefined : apiKey,
        })
      : await createProvider({
          name: name.trim(),
          type: 'openai_compatible',
          baseUrl: baseUrl.trim(),
          apiKey,
          defaultModelName: TEMP_DEFAULT_MODEL,
          defaultModelContextLength: null,
        })

    setSubmitting(false)

    if (result.ok) {
      const pid = result.data.id
      setSavedProviderId(pid)
      setDefaultModelName(result.data.defaultModelName)
      setStep('model')
      void fetchModels(pid)
    } else {
      setError(result.error.message)
    }
  }

  // 第二步：保存默认模型并完成
  const handleFinish = async () => {
    if (!savedProviderId) {
      setError('服务商尚未保存')
      return
    }
    if (!defaultModelName.trim()) {
      setError('请选择或输入默认模型名称')
      return
    }

    // 若默认模型名与已保存的相同，则无需更新
    if (isEdit && defaultModelName.trim() === provider?.defaultModelName) {
      onSuccess()
      return
    }

    setSubmitting(true)
    setError(null)

    // 从模型列表中查找所选模型的能力信息
    const selectedModel = modelOptions.find((m) => m.id === defaultModelName.trim())
    const contextLength = selectedModel?.contextLength ?? null

    const result = await updateProvider({
      providerId: savedProviderId,
      patch: {
        defaultModelName: defaultModelName.trim(),
        defaultModelContextLength: contextLength,
      },
    })

    setSubmitting(false)

    if (result.ok) {
      onSuccess()
    } else {
      setError(result.error.message)
    }
  }

  // 重新拉取模型列表
  const handleRefetchModels = () => {
    if (savedProviderId) {
      void fetchModels(savedProviderId)
    }
  }

  return (
    <Modal
      title={isEdit ? '编辑服务商' : '新增服务商'}
      open
      onClose={onClose}
      maxWidthClass="max-w-lg"
      footer={
        step === 'form' ? (
          <>
            <button type="button" className="btn-secondary" onClick={onClose}>
              取消
            </button>
            <button
              type="submit"
              form="provider-form"
              className="btn-primary"
              disabled={
                submitting ||
                !name.trim() ||
                !baseUrl.trim() ||
                (!isEdit && !apiKey.trim())
              }
            >
              {submitting ? '保存中...' : '保存并获取模型'}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStep('form')}
            >
              上一步
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleFinish}
              disabled={submitting || !defaultModelName.trim()}
            >
              {submitting ? '保存中...' : '完成'}
            </button>
          </>
        )
      }
    >
      {step === 'form' ? (
        <form id="provider-form" onSubmit={handleSaveBasic} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink">
              名称<span className="text-danger ml-1">*</span>
            </label>
            <input
              type="text"
              className="input"
              placeholder="例如：OpenAI 官方"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink">
              Base URL<span className="text-danger ml-1">*</span>
            </label>
            <input
              type="text"
              className="input"
              placeholder="例如：https://api.openai.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <p className="text-xs text-subtle">
              支持 OpenAI-compatible 接口，可带或不带 /v1 后缀
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink">
              API Key
              {!isEdit && <span className="text-danger ml-1">*</span>}
            </label>
            <input
              type="password"
              className="input"
              placeholder={isEdit ? '留空则保持原值' : 'sk-...'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-subtle">
              本地 AES-256-GCM 加密存储，UI 只显示掩码
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-danger-soft border border-danger/20 px-4 py-3">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <p className="text-xs text-subtle">
            保存后将自动获取该服务商的可用模型列表，供你选择默认模型。
          </p>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-semibold text-ink">
                默认模型名称<span className="text-danger ml-1">*</span>
              </label>
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-xs"
                onClick={handleRefetchModels}
                disabled={modelsLoading}
              >
                <AppIcon icon={ArrowPathIcon} size="sm" />
                {modelsLoading ? '加载中...' : '刷新模型列表'}
              </button>
            </div>
            {useManualModelInput ? (
              <input
                type="text"
                className="input"
                placeholder="例如：gpt-4o-mini"
                value={defaultModelName}
                onChange={(e) => setDefaultModelName(e.target.value)}
                maxLength={100}
              />
            ) : (
              <select
                className="input"
                value={defaultModelName}
                onChange={(e) => setDefaultModelName(e.target.value)}
                disabled={modelsLoading || modelOptions.length === 0}
              >
                <option value="">
                  {modelsLoading
                    ? '加载中...'
                    : modelOptions.length === 0
                      ? '暂无模型'
                      : '请选择模型'}
                </option>
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                    （上下文 {m.contextLength ? formatTokenCount(m.contextLength) : '未知'}
                    {m.maxOutputTokens ? ` · 输出 ${formatTokenCount(m.maxOutputTokens)}` : ''}）
                  </option>
                ))}
              </select>
            )}
            {modelsError && (
              <p className="text-xs text-subtle">{modelsError}</p>
            )}
            <p className="text-xs text-subtle">
              该默认模型将作为任务模型配置的推荐初始值，可在下方任务模型配置中按任务单独调整。
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-danger-soft border border-danger/20 px-4 py-3">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
