// 资料解析模块入口
// 对应任务:#2 PDF/Word 解析 + 项目从外部文档导入
//
// 职责:
// - 提供 #[tauri::command] parse_source_file 命令(面向资料 Source)
// - 提供 #[tauri::command] parse_document_structured 命令(面向正文 Document)
// - 按文件扩展名分流到 pdf / docx / markdown 子模块
// - 协调扫描版 PDF 的 OCR 兜底(阶段 3 实现)
//
// 调用流程:
// 前端 invoke('parse_source_file', { filePath, enableOcr })
//   → 按扩展名分流
//   ├─ .pdf  → pdf::extract_pdf_text
//   │          ├─ Text(parsed) → 返回
//   │          └─ Scanned → (阶段 3) ocr::ocr_pdf 或返回 SOURCE_OCR_REQUIRED 错误
//   └─ .docx → docx::extract_docx_text
//
// 前端 invoke('parse_document_structured', { filePath })
//   → 按扩展名分流(返回 StructuredDoc)
//   ├─ .md / .markdown → markdown::parse_markdown_file
//   ├─ .txt            → 直接构造 paragraph 节点
//   ├─ .pdf            → pdf::extract_pdf_text → 转换为 paragraph 节点
//   └─ .docx           → docx::extract_docx_structured

pub mod docx;
pub mod markdown;
pub mod pdf;
pub mod structured;
pub mod types;

// OCR 模块(阶段 3 因 paddle-ocr-rs 0.6.1 与 ort 2.0.0-rc.12 不兼容而暂停)
// 详见技术债文档:#2-OCR集成待后续迭代
// pub mod model_downloader;
// pub mod ocr;

use std::fs;

use tauri::AppHandle;

use self::pdf::PdfExtractResult;
use self::structured::{
    DocxRun, StructuredDoc, StructuredDocFormat, StructuredDocNode,
};

/// 解析资料文件(前端通过 invoke 调用)
///
/// @param app Tauri 应用句柄(用于获取 AppData 目录,OCR 模型存储)
/// @param file_path 文件绝对路径(已复制到项目资料目录)
/// @param enable_ocr 是否启用 OCR(扫描版 PDF 自动回退)
/// @returns ParsedSource 序列化为 JSON 返回前端
#[tauri::command]
pub fn parse_source_file(
    app: AppHandle,
    file_path: String,
    enable_ocr: bool,
) -> Result<types::ParsedSource, String> {
    let ext = std::path::Path::new(&file_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "pdf" => parse_pdf(&app, &file_path, enable_ocr),
        "docx" => docx::extract_docx_text(&file_path),
        _ => Err(format!("不支持的文件类型: .{}", ext)),
    }
}

/// 解析外部文档为结构化内容(前端通过 invoke 调用)
///
/// 用于「从已有文档开始」创建项目流程:
/// 1. 用户选择外部文档(.md/.markdown/.txt/.pdf/.docx)
/// 2. 该命令解析为 StructuredDoc(保留标题/列表/表格/富文本结构)
/// 3. 前端 tiptapConverters 将 StructuredDoc 转为 TipTap JSON
/// 4. AI 推断项目元数据后创建项目 + 首个正文 Document
///
/// @param file_path 文件绝对路径(用户选择,无需先复制到 AppData)
/// @returns StructuredDoc 序列化为 JSON 返回前端
#[tauri::command]
pub fn parse_document_structured(file_path: String) -> Result<StructuredDoc, String> {
    let ext = std::path::Path::new(&file_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "md" | "markdown" => markdown::parse_markdown_file(&file_path),
        "txt" => parse_text_file(&file_path),
        "pdf" => parse_pdf_to_structured(&file_path),
        "docx" => docx::extract_docx_structured(&file_path),
        _ => Err(format!("DOCUMENT_FORMAT_UNSUPPORTED: .{}", ext)),
    }
}

/// PDF 解析协调
///
/// 文本型 PDF 直接返回;扫描版 PDF 返回 SOURCE_OCR_REQUIRED 错误
/// (OCR 集成因 paddle-ocr-rs 与 ort 版本不兼容暂未实现,详见技术债文档)
fn parse_pdf(
    _app: &AppHandle,
    file_path: &str,
    _enable_ocr: bool,
) -> Result<types::ParsedSource, String> {
    match pdf::extract_pdf_text(file_path)? {
        PdfExtractResult::Text(parsed) => Ok(parsed),
        PdfExtractResult::Scanned { page_count: _ } => {
            // OCR 暂未实现:返回 SOURCE_OCR_REQUIRED,前端引导用户
            // 阶段 3 后续迭代:在此接入 ocr::ocr_pdf(file_path, &app_data_dir)
            Err("SOURCE_OCR_REQUIRED".to_string())
        }
    }
}

/// 把 .txt 文件解析为 StructuredDoc
/// 纯文本按双换行拆分为 paragraph 节点,无 marks
fn parse_text_file(file_path: &str) -> Result<StructuredDoc, String> {
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("读取文本文件失败: {}", e))?;

    let mut nodes: Vec<StructuredDocNode> = Vec::new();
    let mut plain_parts: Vec<String> = Vec::new();

    for paragraph in content.split("\n\n") {
        let trimmed = paragraph.trim();
        if trimmed.is_empty() {
            continue;
        }
        plain_parts.push(trimmed.to_string());
        nodes.push(StructuredDocNode::Paragraph {
            runs: vec![DocxRun::plain(trimmed)],
        });
    }

    // 若文档无段落分隔(整段文本),作为单个段落
    if nodes.is_empty() && !content.trim().is_empty() {
        let trimmed = content.trim();
        plain_parts.push(trimmed.to_string());
        nodes.push(StructuredDocNode::Paragraph {
            runs: vec![DocxRun::plain(trimmed)],
        });
    }

    let plain_text = plain_parts.join("\n\n");
    let word_count = structured::estimate_word_count(&plain_text);

    Ok(StructuredDoc {
        format: StructuredDocFormat::Text,
        nodes,
        plain_text,
        word_count,
    })
}

/// PDF 转 StructuredDoc(每页一个 Paragraph 节点)
/// 扫描版 PDF 仍返回 SOURCE_OCR_REQUIRED 错误
fn parse_pdf_to_structured(file_path: &str) -> Result<StructuredDoc, String> {
    let parsed = match pdf::extract_pdf_text(file_path)? {
        PdfExtractResult::Text(parsed) => parsed,
        PdfExtractResult::Scanned { page_count: _ } => {
            return Err("SOURCE_OCR_REQUIRED".to_string());
        }
    };

    let mut nodes: Vec<StructuredDocNode> = Vec::new();
    for chunk in &parsed.chunks {
        let content = chunk.content.trim();
        if content.is_empty() {
            continue;
        }
        nodes.push(StructuredDocNode::Paragraph {
            runs: vec![DocxRun::plain(content)],
        });
    }

    if nodes.is_empty() && !parsed.text.trim().is_empty() {
        nodes.push(StructuredDocNode::Paragraph {
            runs: vec![DocxRun::plain(parsed.text.trim())],
        });
    }

    let word_count = structured::estimate_word_count(&parsed.text);

    Ok(StructuredDoc {
        format: StructuredDocFormat::Pdf,
        nodes,
        plain_text: parsed.text,
        word_count,
    })
}
