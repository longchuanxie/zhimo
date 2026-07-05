// 加载状态组件

export function LoadingState({ message = '加载中...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="h-8 w-8 border-2 border-line border-t-brand rounded-full animate-spin mb-4" />
      <p className="text-sm text-muted">{message}</p>
    </div>
  )
}
