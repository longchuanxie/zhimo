// PDF 文本提取
// 对应任务:#2 PDF/Word 解析
//
// 职责:
// - 调用 pdf-extract 提取纯文本
// - 文本过少(< 50 字符)判定为扫描版,返回 Scanned 标记由上层决定是否走 OCR
// - 按 \f (form feed, PDF 分页符)切分页码,构造 ParsedChunk

use std::path::PathBuf;

use super::types::{ParsedChunk, ParsedSource, ParsedSourceType};

/// PDF 提取结果
/// - Text: 成功提取到文本
/// - Scanned: 判定为扫描版,需要 OCR 兜底
pub enum PdfExtractResult {
    Text(ParsedSource),
    /// page_count 字段预留给 OCR 集成时使用(日志/进度提示)
    /// 当前 OCR 未实现,字段未读取,加 #[allow(dead_code)] 避免警告
    #[allow(dead_code)]
    Scanned { page_count: u32 },
}

/// 判定扫描版的文本长度阈值(字符数)
/// pdf-extract 对扫描版 PDF 通常返回空或极少文本
const SCANNED_THRESHOLD: usize = 50;

/// PDF 分页符(form feed, ^L)
/// pdf-extract 在页与页之间插入该字符
const PAGE_SEPARATOR: char = '\u{000C}';

/// 提取 PDF 文本
///
/// 流程:
/// 1. 调 pdf-extract 提取全文
/// 2. 文本 < 50 字符 → 返回 Scanned(由上层决定 OCR)
/// 3. 按 \f 切分页码,每页作为一个 ParsedChunk
pub fn extract_pdf_text(file_path: &str) -> Result<PdfExtractResult, String> {
    let text = pdf_extract::extract_text(PathBuf::from(file_path))
        .map_err(|e| format!("PDF 文本提取失败: {}", e))?;

    let trimmed = text.trim();
    if trimmed.len() < SCANNED_THRESHOLD {
        let page_count = count_pages(&text);
        return Ok(PdfExtractResult::Scanned { page_count });
    }

    let parsed = build_parsed_source(&text);
    Ok(PdfExtractResult::Text(parsed))
}

/// 统计 PDF 页数(按分页符切分)
fn count_pages(text: &str) -> u32 {
    let count = text.split(PAGE_SEPARATOR).count();
    count.max(1) as u32
}

/// 构造 ParsedSource(按页切分 chunks)
fn build_parsed_source(text: &str) -> ParsedSource {
    let pages: Vec<&str> = text.split(PAGE_SEPARATOR).collect();
    let page_count = pages.len() as u32;

    let mut chunks: Vec<ParsedChunk> = Vec::with_capacity(pages.len());
    let mut full_text = String::new();

    for (idx, page_text) in pages.iter().enumerate() {
        let content = page_text.trim();
        if content.is_empty() {
            continue;
        }

        let page_number = (idx + 1) as u32;
        let start_offset = full_text.len() as u64;
        full_text.push_str(content);
        full_text.push('\n');
        let end_offset = full_text.len() as u64;

        chunks.push(ParsedChunk {
            content: content.to_string(),
            page_number: Some(page_number),
            start_offset: Some(start_offset),
            end_offset: Some(end_offset),
        });
    }

    // 若所有页都为空(理论上不会,因为前面已判定非扫描版),兜底返回全文
    if chunks.is_empty() {
        let content = text.trim().to_string();
        chunks.push(ParsedChunk {
            content: content.clone(),
            page_number: Some(1),
            start_offset: Some(0),
            end_offset: Some(content.len() as u64),
        });
        full_text = content;
    }

    ParsedSource {
        text: full_text.trim().to_string(),
        page_count,
        chunks,
        source_type: ParsedSourceType::Pdf,
        ocr_used: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ============ count_pages 测试 ============

    #[test]
    fn count_pages_empty_string_returns_one() {
        // 空字符串 split 返回 1 个空元素,.max(1) 兜底为 1
        assert_eq!(count_pages(""), 1);
    }

    #[test]
    fn count_pages_single_page_returns_one() {
        assert_eq!(count_pages("单页文本内容"), 1);
    }

    #[test]
    fn count_pages_three_pages_returns_three() {
        // 2 个分页符 → 3 页
        let text = format!("第一页{}第二页{}第三页", PAGE_SEPARATOR, PAGE_SEPARATOR);
        assert_eq!(count_pages(&text), 3);
    }

    // ============ build_parsed_source 测试 ============

    #[test]
    fn build_parsed_source_single_page_non_empty() {
        let parsed = build_parsed_source("单页内容");

        assert_eq!(parsed.page_count, 1);
        assert_eq!(parsed.chunks.len(), 1);
        assert_eq!(parsed.chunks[0].content, "单页内容");
        assert_eq!(parsed.chunks[0].page_number, Some(1));
        assert_eq!(parsed.chunks[0].start_offset, Some(0));
        assert!(!parsed.ocr_used);
        assert_eq!(parsed.text, "单页内容");
    }

    #[test]
    fn build_parsed_source_skips_empty_pages() {
        // 3 页,中间页为纯空白,应被跳过
        let text = format!("第一页{}   {}第三页", PAGE_SEPARATOR, PAGE_SEPARATOR);
        let parsed = build_parsed_source(&text);

        assert_eq!(parsed.page_count, 3);
        // 空白页被跳过,仅 2 个 chunk
        assert_eq!(parsed.chunks.len(), 2);
        // 页码保留原始索引(第 1 页和第 3 页)
        assert_eq!(parsed.chunks[0].page_number, Some(1));
        assert_eq!(parsed.chunks[0].content, "第一页");
        assert_eq!(parsed.chunks[1].page_number, Some(3));
        assert_eq!(parsed.chunks[1].content, "第三页");
    }

    #[test]
    fn build_parsed_source_all_empty_pages_fallback_single_chunk() {
        // 全部为空白页(理论上不会触发,因上层已通过 SCANNED_THRESHOLD 判定)
        // 验证兜底逻辑:返回 1 个 chunk
        let text = format!("  {}  {}  ", PAGE_SEPARATOR, PAGE_SEPARATOR);
        let parsed = build_parsed_source(&text);

        assert_eq!(parsed.page_count, 3);
        assert_eq!(parsed.chunks.len(), 1);
        assert_eq!(parsed.chunks[0].page_number, Some(1));
    }

    #[test]
    fn build_parsed_source_offsets_are_sequential() {
        // 验证多页 chunk 的 start_offset / end_offset 连续性
        let text = format!("甲{}乙{}丙", PAGE_SEPARATOR, PAGE_SEPARATOR);
        let parsed = build_parsed_source(&text);

        assert_eq!(parsed.chunks.len(), 3);
        // 第一个 chunk 从 0 开始
        assert_eq!(parsed.chunks[0].start_offset, Some(0));
        // 后续 chunk 的 start_offset 等于前一个的 end_offset
        for i in 1..parsed.chunks.len() {
            let prev_end = parsed.chunks[i - 1].end_offset.unwrap();
            let curr_start = parsed.chunks[i].start_offset.unwrap();
            assert_eq!(curr_start, prev_end, "chunk {} 起始偏移应等于前一 chunk 结束偏移", i);
        }
    }

    // ============ extract_pdf_text 错误路径测试 ============

    #[test]
    fn extract_pdf_text_nonexistent_file_returns_error() {
        let result = extract_pdf_text("/nonexistent/path/不存在的文件.pdf");
        assert!(result.is_err());
        // 用 err().unwrap() 避免 unwrap_err() 要求 PdfExtractResult: Debug
        let err = result.err().unwrap();
        assert!(
            err.contains("PDF 文本提取失败"),
            "错误消息应包含 'PDF 文本提取失败',实际: {}",
            err
        );
    }
}
