// 密钥网关
// 封装 API Key 加密存储，调用 Rust 端 AES-256-GCM 加密
// 对应文档：06_工程实施补齐/01_客户端技术架构详细设计_v1.0.md
// 对应任务：DEV-013
//
// 安全要求：
// - API Key 不明文存储
// - API Key 不写入日志
// - API Key 不进入 Agent 上下文
// - API Key 不进入导出文件
// - API Key 不进入错误提示详情
// - UI 只显示掩码

import { invoke } from '@tauri-apps/api/core'

/// 加密明文密钥
/// 返回 Base64 编码的加密数据
export async function encryptSecret(plaintext: string): Promise<string> {
  return invoke<string>('encrypt_secret', { plaintext })
}

/// 解密密文
/// 输入为 Base64 编码的加密数据
export async function decryptSecret(encrypted: string): Promise<string> {
  return invoke<string>('decrypt_secret', { encrypted })
}

/// 获取应用加密密钥指纹（用于校验密钥是否变化）
export async function getAppKeyFingerprint(): Promise<string> {
  return invoke<string>('get_or_create_app_key')
}

/// 生成 API Key 掩码
/// 只显示前 4 位和后 4 位，中间用 **** 代替
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length <= 8) {
    return '****'
  }
  const prefix = apiKey.substring(0, 4)
  const suffix = apiKey.substring(apiKey.length - 4)
  return `${prefix}****${suffix}`
}
