// 工具调用类型定义
// 用于支持 OpenAI-compatible function calling（Tool Use）
//
// 调用流程：
// 1. 请求携带 tools（ToolDefinition[]）告知模型可用工具
// 2. 模型返回 tool_calls（ToolCall[]）表示需要调用哪些工具
// 3. 本地执行工具后将结果以 role='tool' 消息回传
// 4. 模型基于工具结果继续生成最终回复

/// 工具定义（OpenAI function calling 格式）
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    /// JSON Schema 描述参数结构
    parameters: Record<string, unknown>
  }
}

/// 模型请求的工具调用
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    /// JSON 字符串形式的参数
    arguments: string
  }
}

/// 工具执行结果（回传给模型）
export interface ToolResult {
  toolCallId: string
  name: string
  /// JSON 字符串或纯文本
  content: string
}

/// 工具选择策略
/// - 'auto'：模型自行决定是否调用工具
/// - 'none'：禁止调用工具
/// - 指定 function：强制调用某个工具
export type ToolChoice =
  | 'auto'
  | 'none'
  | { type: 'function'; function: { name: string } }

/// 工具执行器接口
/// 接收解析后的参数对象，返回 JSON 字符串或纯文本
export type ToolExecutor = (args: Record<string, unknown>) => Promise<string>
