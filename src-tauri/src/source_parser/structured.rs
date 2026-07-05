// 结构化文档类型定义
// 对应任务:项目从外部文档导入
//
// 职责:
// - 定义与前端 TipTap 节点对应的统一结构化节点类型
// - 通过 Tauri command 序列化为 JSON 返回前端
// - 前端 tiptapConverters 将其映射为 TipTap ProseMirror JSON
//
// 与 ParsedSource 的区别:
// - ParsedSource 面向资料(Source)模块,只输出纯文本 + chunks
// - StructuredDoc 面向正文(Document)模块,保留标题/列表/表格/富文本结构

use serde::Serialize;

/// 文档来源格式(用于前端选择转换器)
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum StructuredDocFormat {
    Markdown,
    Word,
    Pdf,
    Text,
}

/// 富文本 run(对应 TipTap text 节点 + marks)
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DocxRun {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
}

/// 结构化节点(对应 TipTap 顶层块级节点)
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StructuredDocNode {
    /// 标题(level: 1-6)
    Heading { level: u8, text: String },
    /// 普通段落(含富文本 runs)
    Paragraph { runs: Vec<DocxRun> },
    /// 无序列表
    BulletList { items: Vec<Vec<DocxRun>> },
    /// 有序列表
    OrderedList { items: Vec<Vec<DocxRun>> },
    /// 代码块(language 为 None 表示未指定)
    CodeBlock { language: Option<String>, text: String },
    /// 表格(简化为单元格富文本,前端转换器进一步映射)
    Table { rows: Vec<Vec<Vec<DocxRun>>> },
    /// 图片占位(技术债 TD-IMPORT-02:docx 图片暂未导入)
    ///
    /// 保留为未来扩展占位符;在 docx 图片导入实现前允许 dead_code。
    #[allow(dead_code)]
    ImagePlaceholder,
}

/// 结构化文档
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StructuredDoc {
    /// 来源格式
    pub format: StructuredDocFormat,
    /// 结构化节点
    pub nodes: Vec<StructuredDocNode>,
    /// 全文纯文本(用于 AI 推断项目元数据)
    pub plain_text: String,
    /// 字数(按字符数粗略统计)
    pub word_count: u64,
}

impl DocxRun {
    /// 构造普通文本 run
    pub fn plain(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            bold: false,
            italic: false,
        }
    }

    /// 构造带 bold/italic 的 run
    pub fn new(text: impl Into<String>, bold: bool, italic: bool) -> Self {
        Self {
            text: text.into(),
            bold,
            italic,
        }
    }
}

/// 粗略统计字数(中文按字符计,英文按 4 字符 ≈ 1 词计)
/// 与前端 estimateTokens 思路一致,但这里产出"字数"用于项目元数据建议
pub fn estimate_word_count(text: &str) -> u64 {
    let chinese_range = '\u{4e00}'..='\u{9fa5}';
    let chinese = text.chars().filter(|c| chinese_range.contains(c)).count();
    let other = text.chars().count() - chinese;
    (chinese + other / 4) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimate_word_count_chinese_only() {
        // 5 个中文字符 → 5 字
        assert_eq!(estimate_word_count("你好世界啊"), 5);
    }

    #[test]
    fn estimate_word_count_english_only() {
        // 8 个英文字符 → 8/4 = 2 字
        assert_eq!(estimate_word_count("abcdefgh"), 2);
    }

    #[test]
    fn estimate_word_count_mixed() {
        // 4 中文 + 8 英文 → 4 + 2 = 6
        assert_eq!(estimate_word_count("你好世界abcdefgh"), 6);
    }

    #[test]
    fn docx_run_plain_constructor() {
        let r = DocxRun::plain("hello");
        assert_eq!(r.text, "hello");
        assert!(!r.bold);
        assert!(!r.italic);
    }

    #[test]
    fn docx_run_new_constructor() {
        let r = DocxRun::new("hi", true, false);
        assert_eq!(r.text, "hi");
        assert!(r.bold);
        assert!(!r.italic);
    }
}
