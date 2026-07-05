// 资料解析类型定义
// 对应任务:#2 PDF/Word 解析
//
// Rust 端解析结果的统一结构,通过 Tauri command 序列化为 JSON 返回前端
// 前端类型定义在 src/types/index.ts 的 ParsedSource / ParsedChunk

use serde::Serialize;

/// 解析后的资料(返回给前端)
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedSource {
    /// 全文文本(用于写入 sources.raw_text)
    pub text: String,
    /// 总页数(PDF 按分页符统计,Word 固定为 1)
    pub page_count: u32,
    /// 按页/段落切分的分片(用于写入 source_chunks 表)
    pub chunks: Vec<ParsedChunk>,
    /// 资料类型
    pub source_type: ParsedSourceType,
    /// 是否使用了 OCR(扫描版 PDF 自动回退时为 true)
    pub ocr_used: bool,
}

/// 单个分片
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedChunk {
    /// 分片文本内容
    pub content: String,
    /// 页码(PDF 从 1 开始,Word 为 null)
    pub page_number: Option<u32>,
    /// 在全文中的起始偏移(字符偏移,用于高亮定位)
    pub start_offset: Option<u64>,
    /// 在全文中的结束偏移
    pub end_offset: Option<u64>,
}

/// 资料类型枚举(与前端 SourceType 子集对应)
#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ParsedSourceType {
    Pdf,
    Word,
}
