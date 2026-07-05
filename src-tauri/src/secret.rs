// API Key 本地加密存储模块
// 使用 AES-256-GCM 对称加密
// 密钥派生自应用级随机密钥，存储在 AppData 目录
// 安全要求：
// - API Key 不明文存储
// - API Key 不写入日志
// - API Key 不进入错误提示

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::RngCore;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// 加密密钥文件名
const KEY_FILE_NAME: &str = "app.key";
/// 密钥长度：AES-256 需要 32 字节
const KEY_LEN: usize = 32;
/// Nonce 长度：AES-GCM 标准 12 字节
const NONCE_LEN: usize = 12;

/// 初始化加密密钥存储
/// 在应用启动时调用，确保密钥文件存在
pub fn init_secret_store(app: &AppHandle) -> Result<(), String> {
    let key_path = get_key_path(app)?;
    if !key_path.exists() {
        let mut key = [0u8; KEY_LEN];
        rand::thread_rng().fill_bytes(&mut key);
        fs::write(&key_path, key)
            .map_err(|e| format!("写入加密密钥失败: {}", e))?;
    }
    Ok(())
}

/// 获取密钥文件路径
fn get_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取 AppData 目录失败: {}", e))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("创建 AppData 目录失败: {}", e))?;
    Ok(app_data_dir.join(KEY_FILE_NAME))
}

/// 读取加密密钥
fn read_key(app: &AppHandle) -> Result<[u8; KEY_LEN], String> {
    let key_path = get_key_path(app)?;
    let key_bytes = fs::read(&key_path)
        .map_err(|e| format!("读取加密密钥失败: {}", e))?;
    if key_bytes.len() != KEY_LEN {
        return Err("加密密钥长度异常".into());
    }
    let mut key = [0u8; KEY_LEN];
    key.copy_from_slice(&key_bytes);
    Ok(key)
}

/// 加密明文
/// 返回 Base64 编码的 nonce + 密文
#[tauri::command]
pub fn encrypt_secret(app: AppHandle, plaintext: String) -> Result<String, String> {
    let key = read_key(&app)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("初始化加密器失败: {}", e))?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("加密失败: {}", e))?;

    // 拼接 nonce + 密文后 Base64 编码
    let mut combined = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(&combined))
}

/// 解密密文
/// 输入为 Base64 编码的 nonce + 密文
#[tauri::command]
pub fn decrypt_secret(app: AppHandle, encrypted: String) -> Result<String, String> {
    let key = read_key(&app)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("初始化解密器失败: {}", e))?;

    let combined = BASE64
        .decode(encrypted.as_bytes())
        .map_err(|e| format!("Base64 解码失败: {}", e))?;

    if combined.len() < NONCE_LEN {
        return Err("密文格式异常".into());
    }

    let (nonce_bytes, ciphertext) = combined.split_at(NONCE_LEN);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("解密失败: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 解码失败: {}", e))
}

/// 获取或创建应用加密密钥的指纹（用于校验密钥是否变化）
/// 返回密钥前 8 字节的十六进制表示
#[tauri::command]
pub fn get_or_create_app_key(app: AppHandle) -> Result<String, String> {
    init_secret_store(&app)?;
    let key = read_key(&app)?;
    Ok(hex::encode(&key[..8]))
}
