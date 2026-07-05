// Markdown 解析为结构化节点
// 对应任务:项目从外部文档导入
//
// 职责:
// - 用 pulldown-cmark 解析 Markdown
// - 映射为 StructuredDocNode(heading/paragraph/list/codeBlock 等)
// - 未识别元素降级为 paragraph
//
// 支持的 Markdown 元素:
// - #/##/###... ###### 标题 → Heading(level 1-6)
// - 普通段落(含 **bold** *italic*) → Paragraph(runs)
// - - / * / + 无序列表 → BulletList
// - 1. / 2. 有序列表 → OrderedList
// - ``` 代码块 → CodeBlock
// - > 引用 → 降级为 Paragraph
// - 表格(GFM) → Table 节点(简化为单元格富文本)

use std::fs;

use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};

use super::structured::{DocxRun, StructuredDoc, StructuredDocFormat, StructuredDocNode};

/// 解析 Markdown 文件为结构化文档
pub fn parse_markdown_file(file_path: &str) -> Result<StructuredDoc, String> {
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("读取 Markdown 文件失败: {}", e))?;
    Ok(parse_markdown_text(&content))
}

/// 解析 Markdown 文本为结构化文档
pub fn parse_markdown_text(content: &str) -> StructuredDoc {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);

    let parser = Parser::new_ext(content, options);
    let nodes = collect_nodes(parser);
    let plain_text = build_plain_text(&nodes);
    let word_count = super::structured::estimate_word_count(&plain_text);

    StructuredDoc {
        format: StructuredDocFormat::Markdown,
        nodes,
        plain_text,
        word_count,
    }
}

/// 节点收集器内部状态
struct Collector {
    nodes: Vec<StructuredDocNode>,
    /// 当前段落正在收集的 runs
    current_runs: Vec<DocxRun>,
    /// bold/italic 标志栈(支持嵌套)
    bold: bool,
    italic: bool,
    /// 当前列表项的 runs(单项)
    list_item_runs: Vec<DocxRun>,
    /// 当前列表的所有项
    list_items: Vec<Vec<DocxRun>>,
    /// 当前列表是否为有序
    list_ordered: bool,
    /// 是否正在收集列表项
    in_list_item: bool,
    /// 当前代码块文本
    code_text: String,
    /// 当前代码块语言
    code_language: Option<String>,
    /// 是否在代码块中(控制 push_text 路由)
    in_code_block: bool,
    /// 表格行
    table_rows: Vec<Vec<Vec<DocxRun>>>,
    /// 当前表格行
    table_current_row: Vec<Vec<DocxRun>>,
    /// 当前单元格 runs
    table_cell_runs: Vec<DocxRun>,
    /// 是否在表头/表格行
    in_table_cell: bool,
}

impl Collector {
    fn new() -> Self {
        Self {
            nodes: Vec::new(),
            current_runs: Vec::new(),
            bold: false,
            italic: false,
            list_item_runs: Vec::new(),
            list_items: Vec::new(),
            list_ordered: false,
            in_list_item: false,
            code_text: String::new(),
            code_language: None,
            in_code_block: false,
            table_rows: Vec::new(),
            table_current_row: Vec::new(),
            table_cell_runs: Vec::new(),
            in_table_cell: false,
        }
    }

    /// 把当前字符作为普通 run 追加到当前目标(段落/列表项/单元格/代码块)
    fn push_text(&mut self, text: &str) {
        if self.in_code_block {
            self.code_text.push_str(text);
            return;
        }
        let run = DocxRun::new(text, self.bold, self.italic);
        if self.in_table_cell {
            self.table_cell_runs.push(run);
        } else if self.in_list_item {
            self.list_item_runs.push(run);
        } else {
            self.current_runs.push(run);
        }
    }

    /// 段落结束:把 current_runs 转为 Paragraph 节点
    fn finish_paragraph(&mut self) {
        if !self.current_runs.is_empty() {
            let runs = std::mem::take(&mut self.current_runs);
            self.nodes.push(StructuredDocNode::Paragraph { runs });
        }
    }

    /// 列表项结束:把 list_item_runs 推入 list_items
    fn finish_list_item(&mut self) {
        let item = std::mem::take(&mut self.list_item_runs);
        self.list_items.push(item);
    }

    /// 列表结束:把 list_items 转为 BulletList/OrderedList 节点
    fn finish_list(&mut self) {
        let items = std::mem::take(&mut self.list_items);
        if items.is_empty() {
            return;
        }
        let node = if self.list_ordered {
            StructuredDocNode::OrderedList { items }
        } else {
            StructuredDocNode::BulletList { items }
        };
        self.nodes.push(node);
    }

    /// 代码块结束:把 code_text 转为 CodeBlock 节点
    fn finish_code_block(&mut self) {
        let text = std::mem::take(&mut self.code_text);
        let language = self.code_language.take();
        if !text.trim().is_empty() {
            self.nodes.push(StructuredDocNode::CodeBlock { language, text });
        }
    }

    /// 单元格结束:把 table_cell_runs 推入 table_current_row
    fn finish_table_cell(&mut self) {
        let cell = std::mem::take(&mut self.table_cell_runs);
        self.table_current_row.push(cell);
    }

    /// 表格行结束:把 table_current_row 推入 table_rows
    fn finish_table_row(&mut self) {
        let row = std::mem::take(&mut self.table_current_row);
        if !row.is_empty() {
            self.table_rows.push(row);
        }
    }

    /// 表格结束:把 table_rows 转为 Table 节点
    fn finish_table(&mut self) {
        let rows = std::mem::take(&mut self.table_rows);
        if !rows.is_empty() {
            self.nodes.push(StructuredDocNode::Table { rows });
        }
    }
}

/// 主收集循环:遍历事件,维护状态机,产出 StructuredDocNode
fn collect_nodes<'a, I: Iterator<Item = Event<'a>>>(parser: I) -> Vec<StructuredDocNode> {
    let mut c = Collector::new();

    for event in parser {
        match event {
            // ===== 块级开始 =====
            Event::Start(Tag::Heading { level, .. }) => {
                // 标题:先结束当前段落
                c.finish_paragraph();
                // 用一个临时"段落"收集 heading 文本,End 时转为 Heading
                // 简化:直接用 current_runs 收集(此时不在列表/表格/代码块中)
                // 通过 setting 一个 heading 标志位区分
                c.bold = false;
                c.italic = false;
                // 暂存 level 到 bold 字段不合适,改用一个独立状态
                // 简化:用一个哨兵节点位置标记,End 时根据 level 转换
                // 这里用 nodes 长度作为标记,End 时取出最后一段 current_runs
                // 但 current_runs 还在收集,End 时再处理
                // 直接用一个临时字段记录 heading level
                heading_start(&mut c, level);
            }
            Event::Start(Tag::Paragraph) => {
                c.bold = false;
                c.italic = false;
            }
            Event::Start(Tag::List(start)) => {
                c.finish_paragraph();
                c.list_ordered = start.is_some();
                c.list_items.clear();
            }
            Event::Start(Tag::Item) => {
                c.in_list_item = true;
                c.bold = false;
                c.italic = false;
            }
            Event::Start(Tag::CodeBlock(lang)) => {
                c.finish_paragraph();
                c.code_text.clear();
                c.in_code_block = true;
                c.code_language = match lang {
                    pulldown_cmark::CodeBlockKind::Fenced(s) => {
                        let trimmed = s.to_string();
                        if trimmed.is_empty() {
                            None
                        } else {
                            Some(trimmed)
                        }
                    }
                    pulldown_cmark::CodeBlockKind::Indented => None,
                };
            }
            Event::Start(Tag::Table(_)) => {
                c.finish_paragraph();
                c.table_rows.clear();
            }
            Event::Start(Tag::TableHead) => {
                c.in_table_cell = true;
            }
            Event::Start(Tag::TableRow) => {
                c.in_table_cell = true;
            }
            Event::Start(Tag::TableCell) => {
                c.table_cell_runs.clear();
                c.bold = false;
                c.italic = false;
            }

            // ===== 块级结束 =====
            Event::End(TagEnd::Heading(level)) => {
                heading_end(&mut c, level);
            }
            Event::End(TagEnd::Paragraph) => {
                c.finish_paragraph();
            }
            Event::End(TagEnd::Item) => {
                c.in_list_item = false;
                c.finish_list_item();
            }
            Event::End(TagEnd::List(_ordered)) => {
                c.finish_list();
            }
            Event::End(TagEnd::CodeBlock) => {
                c.in_code_block = false;
                c.finish_code_block();
            }
            Event::End(TagEnd::TableHead) => {
                c.in_table_cell = false;
                c.finish_table_row();
            }
            Event::End(TagEnd::TableRow) => {
                c.in_table_cell = false;
                c.finish_table_row();
            }
            Event::End(TagEnd::TableCell) => {
                c.finish_table_cell();
            }
            Event::End(TagEnd::Table) => {
                c.finish_table();
            }

            // ===== 行内开始/结束 =====
            Event::Start(Tag::Strong) => {
                c.bold = true;
            }
            Event::End(TagEnd::Strong) => {
                c.bold = false;
            }
            Event::Start(Tag::Emphasis) => {
                c.italic = true;
            }
            Event::End(TagEnd::Emphasis) => {
                c.italic = false;
            }
            Event::Start(Tag::Strikethrough) => {
                // 暂不保留删除线,降级为普通文本
            }
            Event::End(TagEnd::Strikethrough) => {}

            // ===== 文本/符号 =====
            Event::Text(s) => {
                c.push_text(s.as_ref());
            }
            Event::Code(s) => {
                // 行内代码:作为普通文本(暂不支持 marks.code)
                c.push_text(s.as_ref());
            }
            Event::SoftBreak | Event::HardBreak => {
                c.push_text("\n");
            }
            Event::Html(s) => {
                // HTML 降级为纯文本
                c.push_text(s.as_ref());
            }
            Event::FootnoteReference(s) => {
                c.push_text(&format!("[^{}]", s));
            }
            Event::TaskListMarker(_checked) => {
                // 任务列表标记降级为普通文本
                c.push_text("[ ] ");
            }
            Event::InlineHtml(s) => {
                c.push_text(s.as_ref());
            }
            Event::InlineMath(s) | Event::DisplayMath(s) => {
                c.push_text(s.as_ref());
            }
            _ => {}
        }
    }

    // 兜底:刷新未关闭的段落(理论上 pulldown-cmark 会发出 End,但防御性处理)
    c.finish_paragraph();
    c.nodes
}

/// 标题开始:此处仅记录"接下来要收集 heading 文本"
/// 由于 pulldown-cmark 在 Heading 的 Start..End 之间会发出 Text 事件,
/// 我们用 current_runs 收集,End 时再转换。
/// 但 current_runs 也用于 paragraph,所以需要一个标志位区分。
/// 简化:利用一个哨兵,我们临时借用 list_item_runs 字段不合适,
/// 改为在 heading_start 时把一个临时标记节点 push 到 nodes,
/// End 时替换该节点。
fn heading_start(_c: &mut Collector, _level: HeadingLevel) {
    // 当前实现:heading 文本会进入 current_runs,
    // 由于 Start(Heading) 之前已 finish_paragraph(),
    // 在 End(Heading) 之前不会再有 Start(Paragraph),
    // 所以 current_runs 在 End(Heading) 时一定是 heading 的内容。
    // 因此无需额外标记。
}

/// 标题结束:把 current_runs 合并为单一字符串,转为 Heading 节点
fn heading_end(c: &mut Collector, level: HeadingLevel) {
    let runs = std::mem::take(&mut c.current_runs);
    let text: String = runs
        .iter()
        .map(|r| r.text.as_str())
        .collect::<Vec<_>>()
        .join("");
    let text = text.trim().to_string();
    if !text.is_empty() {
        let lvl = match level {
            HeadingLevel::H1 => 1,
            HeadingLevel::H2 => 2,
            HeadingLevel::H3 => 3,
            HeadingLevel::H4 => 4,
            HeadingLevel::H5 => 5,
            HeadingLevel::H6 => 6,
        };
        c.nodes.push(StructuredDocNode::Heading { level: lvl, text });
    }
}

/// 由结构化节点重建纯文本(用于 AI 推断)
fn build_plain_text(nodes: &[StructuredDocNode]) -> String {
    let mut parts: Vec<String> = Vec::new();
    for node in nodes {
        match node {
            StructuredDocNode::Heading { level: _, text } => {
                parts.push(text.clone());
            }
            StructuredDocNode::Paragraph { runs } => {
                let s: String = runs.iter().map(|r| r.text.as_str()).collect();
                if !s.trim().is_empty() {
                    parts.push(s);
                }
            }
            StructuredDocNode::BulletList { items } | StructuredDocNode::OrderedList { items } => {
                for item in items {
                    let s: String = item.iter().map(|r| r.text.as_str()).collect();
                    if !s.trim().is_empty() {
                        parts.push(s);
                    }
                }
            }
            StructuredDocNode::CodeBlock { language: _, text } => {
                if !text.trim().is_empty() {
                    parts.push(text.clone());
                }
            }
            StructuredDocNode::Table { rows } => {
                for row in rows {
                    for cell in row {
                        let s: String = cell.iter().map(|r| r.text.as_str()).collect();
                        if !s.trim().is_empty() {
                            parts.push(s);
                        }
                    }
                }
            }
            StructuredDocNode::ImagePlaceholder => {
                parts.push("[图片]".to_string());
            }
        }
    }
    parts.join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_heading_h1_to_h3() {
        let md = "# 一级\n\n## 二级\n\n### 三级";
        let doc = parse_markdown_text(md);
        assert_eq!(doc.format, StructuredDocFormat::Markdown);
        assert_eq!(doc.nodes.len(), 3);
        match &doc.nodes[0] {
            StructuredDocNode::Heading { level, text } => {
                assert_eq!(*level, 1);
                assert_eq!(text, "一级");
            }
            other => panic!("expected Heading, got {:?}", other),
        }
        match &doc.nodes[1] {
            StructuredDocNode::Heading { level, text } => {
                assert_eq!(*level, 2);
                assert_eq!(text, "二级");
            }
            other => panic!("expected Heading, got {:?}", other),
        }
        match &doc.nodes[2] {
            StructuredDocNode::Heading { level, text } => {
                assert_eq!(*level, 3);
                assert_eq!(text, "三级");
            }
            other => panic!("expected Heading, got {:?}", other),
        }
    }

    #[test]
    fn parse_paragraph_with_bold_italic() {
        let md = "这是 **加粗** 和 *斜体* 文本";
        let doc = parse_markdown_text(md);
        assert_eq!(doc.nodes.len(), 1);
        match &doc.nodes[0] {
            StructuredDocNode::Paragraph { runs } => {
                assert!(runs.len() >= 3);
                // 至少有一个 bold run 和一个 italic run
                let has_bold = runs.iter().any(|r| r.bold);
                let has_italic = runs.iter().any(|r| r.italic);
                assert!(has_bold, "应包含 bold run: {:?}", runs);
                assert!(has_italic, "应包含 italic run: {:?}", runs);
            }
            other => panic!("expected Paragraph, got {:?}", other),
        }
    }

    #[test]
    fn parse_unordered_list() {
        let md = "- 苹果\n- 香蕉\n- 橙子";
        let doc = parse_markdown_text(md);
        assert_eq!(doc.nodes.len(), 1);
        match &doc.nodes[0] {
            StructuredDocNode::BulletList { items } => {
                assert_eq!(items.len(), 3);
                assert_eq!(items[0][0].text, "苹果");
                assert_eq!(items[1][0].text, "香蕉");
                assert_eq!(items[2][0].text, "橙子");
            }
            other => panic!("expected BulletList, got {:?}", other),
        }
    }

    #[test]
    fn parse_ordered_list() {
        let md = "1. 第一\n2. 第二\n3. 第三";
        let doc = parse_markdown_text(md);
        assert_eq!(doc.nodes.len(), 1);
        match &doc.nodes[0] {
            StructuredDocNode::OrderedList { items } => {
                assert_eq!(items.len(), 3);
                assert_eq!(items[0][0].text, "第一");
                assert_eq!(items[2][0].text, "第三");
            }
            other => panic!("expected OrderedList, got {:?}", other),
        }
    }

    #[test]
    fn parse_code_block_with_language() {
        let md = "```rust\nfn main() {}\n```";
        let doc = parse_markdown_text(md);
        assert_eq!(doc.nodes.len(), 1);
        match &doc.nodes[0] {
            StructuredDocNode::CodeBlock { language, text } => {
                assert_eq!(language.as_deref(), Some("rust"));
                assert!(text.contains("fn main()"));
            }
            other => panic!("expected CodeBlock, got {:?}", other),
        }
    }

    #[test]
    fn parse_table_basic() {
        let md = "| 姓名 | 年龄 |\n| --- | --- |\n| 张三 | 18 |";
        let doc = parse_markdown_text(md);
        // 表格应被识别(至少 1 个节点)
        assert!(!doc.nodes.is_empty(), "表格应至少产出 1 个节点");
        let has_table = doc.nodes.iter().any(|n| matches!(n, StructuredDocNode::Table { .. }));
        assert!(has_table, "应包含 Table 节点: {:?}", doc.nodes);
    }

    #[test]
    fn parse_plain_text_returns_paragraph() {
        let md = "这是一段普通文本。";
        let doc = parse_markdown_text(md);
        assert_eq!(doc.nodes.len(), 1);
        match &doc.nodes[0] {
            StructuredDocNode::Paragraph { runs } => {
                assert_eq!(runs.len(), 1);
                assert_eq!(runs[0].text, "这是一段普通文本。");
            }
            other => panic!("expected Paragraph, got {:?}", other),
        }
    }

    #[test]
    fn parse_empty_returns_empty_nodes() {
        let doc = parse_markdown_text("");
        assert!(doc.nodes.is_empty());
        assert_eq!(doc.word_count, 0);
    }

    #[test]
    fn plain_text_aggregates_all_nodes() {
        let md = "# 标题\n\n段落一。\n\n- 列表项";
        let doc = parse_markdown_text(md);
        let plain = &doc.plain_text;
        assert!(plain.contains("标题"));
        assert!(plain.contains("段落一"));
        assert!(plain.contains("列表项"));
    }

    #[test]
    fn word_count_includes_all_text() {
        let md = "你好世界 hello world";
        let doc = parse_markdown_text(md);
        // 4 中文字符 + 12 其他字符(含 2 空格) = 4 + 12/4 = 4 + 3 = 7
        assert_eq!(doc.word_count, 7);
    }
}
