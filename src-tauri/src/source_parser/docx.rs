// Word .docx 文档解析
// 对应任务:#2 PDF/Word 解析 + 项目从外部文档导入
//
// 职责:
// - 用 docx-rs 读取 .docx 文件(read_docx 接受 &[u8])
// - 遍历 document.children → Paragraph → Run → Text,拼接段落文本
// - Word 无分页概念,page_count 固定为 1,所有 chunk 的 page_number = None
// - extract_docx_structured:保留标题/列表/表格/富文本结构,产出 StructuredDoc

use std::fs;

use docx_rs::{read_docx, DocumentChild, ParagraphChild, RunChild};

use super::structured::{
    estimate_word_count, DocxRun, StructuredDoc, StructuredDocFormat, StructuredDocNode,
};
use super::types::{ParsedChunk, ParsedSource, ParsedSourceType};

/// 单个分片最大字符数(与前端 splitIntoChunks 保持一致)
const MAX_CHUNK_SIZE: usize = 2000;

/// 提取 .docx 文本
///
/// 流程:
/// 1. 读取文件为字节数组
/// 2. 调 docx_rs::read_docx 解析
/// 3. 遍历 DocumentChild::Paragraph → ParagraphChild::Run → RunChild::Text
/// 4. 按 MAX_CHUNK_SIZE 切分分片
pub fn extract_docx_text(file_path: &str) -> Result<ParsedSource, String> {
    let bytes = fs::read(file_path)
        .map_err(|e| format!("读取 docx 文件失败: {}", e))?;
    let docx = read_docx(&bytes)
        .map_err(|e| format!("解析 docx 失败: {}", e))?;

    // 收集所有非空段落
    let mut paragraphs: Vec<String> = Vec::new();
    for doc_child in &docx.document.children {
        if let DocumentChild::Paragraph(para) = doc_child {
            let mut text = String::new();
            for para_child in &para.children {
                if let ParagraphChild::Run(run) = para_child {
                    for run_child in &run.children {
                        if let RunChild::Text(t) = run_child {
                            text.push_str(&t.text);
                        }
                    }
                }
            }
            if !text.trim().is_empty() {
                paragraphs.push(text);
            }
        }
    }

    let full_text = paragraphs.join("\n\n");
    if full_text.trim().is_empty() {
        return Err("docx 文件没有可提取的文本".into());
    }

    let chunks = split_into_chunks(&full_text);

    Ok(ParsedSource {
        text: full_text,
        page_count: 1,
        chunks,
        source_type: ParsedSourceType::Word,
        ocr_used: false,
    })
}

/// 按段落 + 长度切分 chunks(与前端 splitIntoChunks 逻辑一致)
fn split_into_chunks(text: &str) -> Vec<ParsedChunk> {
    let paragraphs: Vec<&str> = text.split("\n\n").filter(|p| !p.trim().is_empty()).collect();
    let mut chunks: Vec<ParsedChunk> = Vec::new();
    let mut current = String::new();
    let mut start_offset: u64 = 0;

    for paragraph in paragraphs {
        let sep = if current.is_empty() { "" } else { "\n\n" };
        let candidate_len = current.len() + sep.len() + paragraph.len();
        if !current.is_empty() && candidate_len > MAX_CHUNK_SIZE {
            let end_offset = start_offset + current.len() as u64;
            chunks.push(ParsedChunk {
                content: current.trim().to_string(),
                page_number: None,
                start_offset: Some(start_offset),
                end_offset: Some(end_offset),
            });
            start_offset = end_offset + "\n\n".len() as u64;
            current = paragraph.to_string();
        } else {
            current.push_str(sep);
            current.push_str(paragraph);
        }
    }

    if !current.trim().is_empty() {
        let end_offset = start_offset + current.len() as u64;
        chunks.push(ParsedChunk {
            content: current.trim().to_string(),
            page_number: None,
            start_offset: Some(start_offset),
            end_offset: Some(end_offset),
        });
    }

    chunks
}

// ============ 结构化解析(项目从外部文档导入) ============

/// 提取 .docx 结构化文档
///
/// 与 extract_docx_text 的区别:
/// - extract_docx_text:仅产出纯文本 + chunks,面向资料(Source)
/// - extract_docx_structured:保留标题/列表/表格/富文本结构,面向正文(Document)
///
/// 支持的结构:
/// - Heading style(Heading1/Heading2/...) → Heading 节点
/// - List style(ListBullet/ListNumber) → BulletList/OrderedList
/// - Table → Table 节点(rows × cells,每 cell 是 Vec<DocxRun>)
/// - 普通段落 → Paragraph 节点(含 bold/italic marks)
/// - 图片(Drawing) → ImagePlaceholder
///
/// 同时输出 plain_text(用于 AI 推断)和 word_count
pub fn extract_docx_structured(file_path: &str) -> Result<StructuredDoc, String> {
    let bytes = fs::read(file_path).map_err(|e| format!("读取 docx 文件失败: {}", e))?;
    let docx = read_docx(&bytes).map_err(|e| format!("解析 docx 失败: {}", e))?;

    let mut nodes: Vec<StructuredDocNode> = Vec::new();
    let mut plain_parts: Vec<String> = Vec::new();

    // 收集连续的列表项,在遇到非列表段落时 flush
    let mut list_items: Vec<Vec<DocxRun>> = Vec::new();
    let mut list_ordered = false;

    for doc_child in &docx.document.children {
        match doc_child {
            DocumentChild::Paragraph(para) => {
                let style_name = para
                    .property
                    .style
                    .as_ref()
                    .map(|s| s.val.clone())
                    .unwrap_or_default();

                // 判断是否为列表项
                if let Some(ordered) = detect_list_style(&style_name) {
                    // 同类列表才能续接;若与前一项类型不同,先 flush
                    if !list_items.is_empty() && list_ordered != ordered {
                        flush_list(&mut nodes, &mut list_items, list_ordered);
                    }
                    list_ordered = ordered;
                    let runs = collect_paragraph_runs(para);
                    let text: String = runs.iter().map(|r| r.text.as_str()).collect();
                    if !text.trim().is_empty() {
                        plain_parts.push(text);
                        list_items.push(runs);
                    }
                    continue;
                }

                // 遇到非列表段落,先 flush 列表
                if !list_items.is_empty() {
                    flush_list(&mut nodes, &mut list_items, list_ordered);
                }

                // 判断是否为标题
                if let Some(level) = detect_heading_level(&style_name) {
                    let runs = collect_paragraph_runs(para);
                    let text: String = runs.iter().map(|r| r.text.as_str()).collect();
                    let text = text.trim().to_string();
                    if !text.is_empty() {
                        plain_parts.push(text.clone());
                        nodes.push(StructuredDocNode::Heading { level, text });
                    }
                    continue;
                }

                // 普通段落
                let runs = collect_paragraph_runs(para);
                let text: String = runs.iter().map(|r| r.text.as_str()).collect();
                if !text.trim().is_empty() {
                    plain_parts.push(text);
                    nodes.push(StructuredDocNode::Paragraph { runs });
                }
            }
            DocumentChild::Table(table) => {
                // 遇到表格,先 flush 列表
                if !list_items.is_empty() {
                    flush_list(&mut nodes, &mut list_items, list_ordered);
                }
                let rows = collect_table_rows(table);
                // 把表格文本也加入 plain_text
                for row in &rows {
                    for cell in row {
                        let s: String = cell.iter().map(|r| r.text.as_str()).collect();
                        if !s.trim().is_empty() {
                            plain_parts.push(s);
                        }
                    }
                }
                if !rows.is_empty() {
                    nodes.push(StructuredDocNode::Table { rows });
                }
            }
            // 其他类型(sectPr 等)忽略
            _ => {}
        }
    }

    // 兜底 flush 列表
    if !list_items.is_empty() {
        flush_list(&mut nodes, &mut list_items, list_ordered);
    }

    let plain_text = plain_parts.join("\n\n");
    let word_count = estimate_word_count(&plain_text);

    Ok(StructuredDoc {
        format: StructuredDocFormat::Word,
        nodes,
        plain_text,
        word_count,
    })
}

/// 判断 style 是否为列表项,返回 Some(true) 表示有序,Some(false) 表示无序
fn detect_list_style(style: &str) -> Option<bool> {
    let lower = style.to_lowercase();
    if lower.starts_with("listnumber") || lower.contains("numbered") {
        Some(true)
    } else if lower.starts_with("listbullet") || lower.contains("bullet") {
        Some(false)
    } else {
        None
    }
}

/// 判断 style 是否为标题,返回标题级别(1-6)
fn detect_heading_level(style: &str) -> Option<u8> {
    let lower = style.to_lowercase();
    // 常见 style:Heading1 / heading 1 / 标题 1
    if let Some(rest) = lower.strip_prefix("heading") {
        let n = rest.trim().parse::<u8>().ok();
        if let Some(n) = n {
            if (1..=6).contains(&n) {
                return Some(n);
            }
        }
    }
    if let Some(rest) = lower.strip_prefix("标题") {
        let n = rest.trim().parse::<u8>().ok();
        if let Some(n) = n {
            if (1..=6).contains(&n) {
                return Some(n);
            }
        }
    }
    None
}

/// 收集 Paragraph 中的 Run,保留 bold/italic 标志
/// 若遇到 Drawing/Image,返回单个 ImagePlaceholder 标记 run(text="[图片]")
fn collect_paragraph_runs(para: &docx_rs::Paragraph) -> Vec<DocxRun> {
    let mut runs: Vec<DocxRun> = Vec::new();
    let mut has_image = false;

    for para_child in &para.children {
        if let ParagraphChild::Run(run) = para_child {
            let bold = run.run_property.bold.is_some();
            let italic = run.run_property.italic.is_some();

            for run_child in &run.children {
                match run_child {
                    RunChild::Text(t) => {
                        if !t.text.is_empty() {
                            runs.push(DocxRun::new(t.text.clone(), bold, italic));
                        }
                    }
                    RunChild::Drawing(_) => {
                        has_image = true;
                    }
                    _ => {}
                }
            }
        }
    }

    if has_image && runs.is_empty() {
        // 仅含图片的段落,插入占位 run,前端转换器再转为 ImagePlaceholder 节点
        runs.push(DocxRun::plain("[图片]"));
    }

    runs
}

/// 收集 Table 的所有行,每行为单元格 Vec<DocxRun>
fn collect_table_rows(table: &docx_rs::Table) -> Vec<Vec<Vec<DocxRun>>> {
    use docx_rs::{TableChild, TableCellContent, TableRowChild};
    let mut rows: Vec<Vec<Vec<DocxRun>>> = Vec::new();
    for row_child in &table.rows {
        // docx-rs 当前 TableChild 仅 TableRow 变体;若未来新增变体,编译将失败并强制审视
        let TableChild::TableRow(row) = row_child;
        let mut cells: Vec<Vec<DocxRun>> = Vec::new();
        for cell_child in &row.cells {
            // TableRowChild 仅 TableCell 变体;同上,新增变体会触发编译错误
            let TableRowChild::TableCell(cell) = cell_child;
            // TableCellContent 是 enum,Paragraph 变体包含段落
            // 把单元格内所有段落拼接为单一 Vec<DocxRun>
            let mut cell_runs: Vec<DocxRun> = Vec::new();
            for content in &cell.children {
                if let TableCellContent::Paragraph(para) = content {
                    let mut runs = collect_paragraph_runs(para);
                    cell_runs.append(&mut runs);
                }
            }
            cells.push(cell_runs);
        }
        rows.push(cells);
    }
    rows
}

/// 把 list_items 转为 BulletList/OrderedList 节点并清空
fn flush_list(
    nodes: &mut Vec<StructuredDocNode>,
    list_items: &mut Vec<Vec<DocxRun>>,
    ordered: bool,
) {
    if list_items.is_empty() {
        return;
    }
    let items = std::mem::take(list_items);
    let node = if ordered {
        StructuredDocNode::OrderedList { items }
    } else {
        StructuredDocNode::BulletList { items }
    };
    nodes.push(node);
}

#[cfg(test)]
mod tests {
    use super::*;

    // ============ split_into_chunks 基础场景 ============

    #[test]
    fn split_into_chunks_empty_string_returns_empty() {
        let chunks = split_into_chunks("");
        assert!(chunks.is_empty());
    }

    #[test]
    fn split_into_chunks_whitespace_only_returns_empty() {
        // 纯空白段落被 filter 过滤
        let chunks = split_into_chunks("   \n\n  \n\n ");
        assert!(chunks.is_empty());
    }

    #[test]
    fn split_into_chunks_short_text_single_chunk() {
        let chunks = split_into_chunks("短文本");
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].content, "短文本");
        assert_eq!(chunks[0].page_number, None);
        assert_eq!(chunks[0].start_offset, Some(0));
    }

    #[test]
    fn split_into_chunks_multiple_paragraphs_under_limit_merged() {
        // 多段落总长 < 2000 → 合并为 1 个 chunk
        let text = "第一段\n\n第二段\n\n第三段";
        let chunks = split_into_chunks(text);
        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].content.contains("第一段"));
        assert!(chunks[0].content.contains("第二段"));
        assert!(chunks[0].content.contains("第三段"));
    }

    // ============ split_into_chunks 切分逻辑 ============

    #[test]
    fn split_into_chunks_long_text_splits_into_multiple_chunks() {
        // 构造 > 2000 字符的文本:100 个 32 字符的段落
        let paragraph = "abcdefghijklmnopqrstuvwxyzabcd"; // 30 字符
        let paragraphs: Vec<String> = (0..100).map(|i| format!("{}-{}", paragraph, i)).collect();
        let text = paragraphs.join("\n\n");

        let chunks = split_into_chunks(&text);

        // 应切分为多个 chunk
        assert!(chunks.len() > 1, "长文本应切分为多个 chunk,实际切分为 {}", chunks.len());
        // 每个段落 32 字符,不会超长,所以每个 chunk content <= MAX_CHUNK_SIZE
        for (i, chunk) in chunks.iter().enumerate() {
            assert!(
                chunk.content.len() <= MAX_CHUNK_SIZE,
                "chunk {} 长度 {} 超过上限 {}",
                i,
                chunk.content.len(),
                MAX_CHUNK_SIZE
            );
        }
    }

    #[test]
    fn split_into_chunks_single_paragraph_over_limit_returns_single_chunk() {
        // 单段落 > 2000 字符 → 作为单个 chunk 返回(不强制拆分)
        let long_paragraph = "a".repeat(2500);
        let text = long_paragraph.clone();

        let chunks = split_into_chunks(&text);

        assert_eq!(chunks.len(), 1, "单段落超长应作为单个 chunk 返回");
        assert_eq!(chunks[0].content.len(), 2500);
    }

    #[test]
    fn split_into_chunks_skips_empty_paragraphs() {
        // 包含空白段落应被过滤
        let text = "第一段\n\n  \n\n第二段";
        let chunks = split_into_chunks(text);
        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].content.contains("第一段"));
        assert!(chunks[0].content.contains("第二段"));
    }

    // ============ split_into_chunks offset 连续性 ============

    #[test]
    fn split_into_chunks_offsets_are_sequential() {
        // 验证多 chunk 的 start_offset / end_offset 连续性
        // 使用 ASCII 文本,字节偏移 = 字符偏移,便于断言
        let paragraph = "a".repeat(1500);
        let text = format!("{}\n\n{}\n\n{}", paragraph, paragraph, paragraph);

        let chunks = split_into_chunks(&text);

        assert!(chunks.len() >= 2, "应切分为多个 chunk");
        // 第一个 chunk 从 0 开始
        assert_eq!(chunks[0].start_offset, Some(0));
        // 后续 chunk 的 start_offset = 前一个 end_offset + "\n\n".len() (2)
        for i in 1..chunks.len() {
            let prev_end = chunks[i - 1].end_offset.unwrap();
            let curr_start = chunks[i].start_offset.unwrap();
            assert_eq!(
                curr_start,
                prev_end + "\n\n".len() as u64,
                "chunk {} 起始偏移应等于前一 chunk 结束偏移 + 2(分隔符)",
                i
            );
        }
    }
}
