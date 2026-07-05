// 占位页面：用于 Phase 1 验证路由和布局
// 后续阶段会替换为真实页面实现

import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/foundation/EmptyState'
import { FolderIcon, PlusIcon } from '@heroicons/react/24/outline'

type PlaceholderPageProps = {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  const navigate = useNavigate()

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-ink mb-4">{title}</h2>
      <EmptyState
        icon={FolderIcon}
        title={`${title}模块开发中`}
        description="这是 Phase 1 底座阶段的占位页面，后续阶段将实现完整功能。"
        primaryAction={{
          label: '返回项目列表',
          icon: PlusIcon,
          onClick: () => navigate('/projects'),
        }}
      />
    </div>
  )
}
