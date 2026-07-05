# #2 PDF/Word 解析 - 阶段 4 集成验收计划

## 任务概述

延续 #2 PDF/Word 解析任务,本计划聚焦 **阶段 4 集成验收**,基于阶段 3 已回滚的现实调整验收范围。

**已完成状态**:
- 阶段 1:Rust 端基础解析([src-tauri/src/source_parser/](file:///d:/workplace/idea/zhimo/src-tauri/src/source_parser/))
- 阶段 2:前端代码改造 + 验证(`tsc` 通过,`vitest` 58 个测试通过,含新增 8 个 PDF/Word 测试)
- 阶段 3:OCR 集成已回滚(paddle-ocr-rs 0.6.1 与 ort 2.0.0-rc.12 不兼容),技术债 TD-001 已记录
- 阶段 4.5:技术债记录已完成([.trae/documents/技术债.md](file:///d:/workplace/idea/zhimo/.trae/documents/技术债.md))

**剩余工作**:
- 阶段 4.1:Rust 端单元测试(纯函数,建议)
- 阶段 4.2:全量自动化验证
- 阶段 4.3:手工验收(由用户执行)
- 阶段 4.4:文档更新

---

## 当前状态分析

### 代码现状(已对齐回滚状态)

- [src-tauri/src/source_parser/mod.rs](file:///d:/workplace/idea/zhimo/src-tauri/src/source_parser/mod.rs):`parse_source_file` 命令按扩展名分流;扫描版 PDF 返回 `"SOURCE_OCR_REQUIRED"` 错误字符串
- [src-tauri/src/source_parser/pdf.rs](file:///d:/workplace/idea/zhimo/src-tauri/src/source_parser/pdf.rs):`extract_pdf_text` 返回 `Text` 或 `Scanned`(阈值 50 字符);`PdfExtractResult::Scanned.page_count` 加 `#[allow(dead_code)]`(预留 OCR)
- [src-tauri/src/source_parser/docx.rs](file:///d:/workplace/idea/zhimo/src-tauri/src/source_parser/docx.rs):`extract_docx_text` + `split_into_chunks` 纯函数
- [src-tauri/Cargo.toml](file:///d:/workplace/idea/zhimo/src-tauri/Cargo.toml):OCR 依赖已注释,保留 `pdf-extract` 和 `docx-rs`
- [src/services/source/SourceService.ts](file:///d:/workplace/idea/zhimo/src/services/source/SourceService.ts):`importParsedFile` 识别 `SOURCE_OCR_REQUIRED`,`retryable: !isOcrRequired`
- [src/constants/errors.ts](file:///d:/workplace/idea/zhimo/src/constants/errors.ts):`SOURCE_OCR_REQUIRED.retryable=false`(OCR 未实现,重试无意义);`SOURCE_OCR_MODEL_DOWNLOAD_FAILED` / `SOURCE_OCR_FAILED` 标注为预留
- [src/services/source/SourceService.pdf.test.ts](file:///d:/workplace/idea/zhimo/src/services/source/SourceService.pdf.test.ts):8 个测试用例,用例 3 断言 `retryable=false`

### 受 OCR 回滚影响的调整点

| 原计划项 | 调整后 |
|---|---|
| 验收清单第 3 项(扫描版 PDF 首次 OCR) | 改为验证 SOURCE_OCR_REQUIRED 错误提示 |
| 验收清单第 4 项(扫描版 PDF 已下载模型) | 删除(OCR 未实现) |
| 阶段 4.4 错误码表更新 | SOURCE_OCR_MODEL_DOWNLOAD_FAILED / SOURCE_OCR_FAILED 标注为"预留,当前不触发" |

---

## 剩余工作实施方案

### 阶段 4.1:Rust 端单元测试(建议)

**目标**:为 `pdf.rs` 和 `docx.rs` 的纯函数追加单元测试,提升可维护性(符合 AGENTS.md §3.1 可测试要求)。

**文件变更**:
- [src-tauri/src/source_parser/pdf.rs](file:///d:/workplace/idea/zhimo/src-tauri/src/source_parser/pdf.rs):文件末尾追加 `#[cfg(test)] mod tests`
- [src-tauri/src/source_parser/docx.rs](file:///d:/workplace/idea/zhimo/src-tauri/src/source_parser/docx.rs):文件末尾追加 `#[cfg(test)] mod tests`

**测试范围**(仅纯函数,不覆盖依赖文件系统的 `extract_pdf_text` / `extract_docx_text`):

#### pdf.rs 测试用例

1. `count_pages`:
   - 空字符串 → 返回 1(`.max(1)` 兜底)
   - 单页(无 `\u{000C}`)→ 返回 1
   - 3 页(2 个 `\u{000C}`)→ 返回 3
2. `build_parsed_source`:
   - 单页非空文本 → 1 个 chunk,`page_number=1`,`start_offset=0`
   - 多页含空页 → 空页被跳过,仅非空页入 chunks
   - 全空页(理论上不触发,因上层已判定非扫描版)→ 兜底返回 1 个 chunk
3. `extract_pdf_text` 判定逻辑(不实际读文件,通过 mock 路径验证错误传递):
   - 不可读文件路径 → 返回 `Err("PDF 文本提取失败: ...")`

#### docx.rs 测试用例

1. `split_into_chunks`:
   - 短文本(< 2000 字符)→ 1 个 chunk
   - 长文本(> 2000 字符)→ 多个 chunk,每个 `content.len() <= 2000`
   - 多段落(用 `\n\n` 分隔)→ 按段落边界切分,不拆分段落内部
   - 空字符串 → 返回空 Vec
   - 单段落超长(> 2000 字符)→ 作为单个 chunk 返回(不强制拆分)

**注意**:
- 测试不依赖外部 PDF/docx 文件,避免 CI 环境依赖
- `extract_pdf_text` 的文件读取测试仅验证错误路径(不可读文件),不验证成功路径(需真实 PDF)
- 使用 `#[cfg(test)]` 隔离,不影响生产构建

### 阶段 4.2:全量自动化验证

**命令序列**:
```bash
# Rust 端
cd src-tauri && cargo check && cargo test && cd ..

# 前端
npx tsc --noEmit
npx vitest run
```

**预期结果**:
- `cargo check`:无错误,无 warning(已通过阶段 3 回滚验证)
- `cargo test`:Rust 单元测试全部通过(含新增 pdf.rs / docx.rs 测试)
- `npx tsc --noEmit`:无类型错误
- `npx vitest run`:58 个测试全部通过(含 `SourceService.pdf.test.ts` 8 个用例)

**失败处理**:
- 若 cargo test 失败:定位失败的测试用例,修正测试代码或被测函数(优先修测试,不放宽被测逻辑)
- 若 vitest 失败:检查是否为 OCR 回滚引起的回归(如测试用例 3 的 retryable 断言)

### 阶段 4.3:手工验收(由用户执行)

**启动方式**:`npm run tauri dev`

我无法独立完成 GUI 交互,验收清单提供给用户。验收清单已根据 OCR 回滚调整:

| # | 验收项 | 操作 | 预期结果 |
|---|---|---|---|
| 1 | 文本型 PDF 导入 | 选择文本型 PDF(如学术论文) | 资料类型显示"PDF",状态 ready,chunks 按页码排序,每页一条 |
| 2 | Word 文档导入 | 选择 .docx 文件 | 资料类型显示"Word",状态 ready,chunks 按段落+2000 字符切分 |
| 3 | 扫描版 PDF 导入 | 选择扫描版 PDF | UI 显示"检测到扫描版 PDF,暂不支持 OCR 识别",建议动作"可将 PDF 转为文本型,或使用外部 OCR 工具处理后重新导入",状态 failed |
| 4 | 解析失败 | 选择损坏的 PDF | UI 显示"资料解析失败"中文提示,状态 failed |
| 5 | 取消选择 | 文件对话框点取消 | UI 无错误提示,优雅处理 |
| 6 | 重启客户端数据恢复 | 导入 PDF 后重启应用 | 资料记录、processing_status、chunks 均恢复 |
| 7 | 错误提示中文化 | 触发各类错误 | 所有提示均为中文,无英文错误码泄漏到 UI |

### 阶段 4.4:文档更新

#### 文件1:[ai_writing_development_startup_package_v1_0/06_工程实施补齐/12_错误码与中文提示表_v1.0.md](file:///d:/workplace/idea/zhimo/ai_writing_development_startup_package_v1_0/06_工程实施补齐/12_错误码与中文提示表_v1.0.md)

**变更**:
- §4 资料解析错误表:
  - 更新 `SOURCE_OCR_REQUIRED` 中文提示为"检测到扫描版 PDF,暂不支持 OCR 识别"(原为"这是扫描件,MVP 暂不支持 OCR"),可重试=否
  - 追加 `SOURCE_OCR_MODEL_DOWNLOAD_FAILED`(预留,当前不触发):"OCR 模型下载失败,请检查网络后重试",可重试=是
  - 追加 `SOURCE_OCR_FAILED`(预留,当前不触发):"OCR 识别失败",可重试=是
- 在表格下方追加说明:"SOURCE_OCR_MODEL_DOWNLOAD_FAILED 和 SOURCE_OCR_FAILED 为预留错误码,当前阶段(OCR 未实现)不会触发,待后续迭代接入 OCR 后启用"

#### 文件2:[ai_writing_development_startup_package_v1_0/06_工程实施补齐/07_资料解析与切片策略_v1.0.md](file:///d:/workplace/idea/zhimo/ai_writing_development_startup_package_v1_0/06_工程实施补齐/07_资料解析与切片策略_v1.0.md)

**变更**:
- §2 文件支持表:更新"扫描 PDF"行的说明为"MVP 返回 SOURCE_OCR_REQUIRED,后续迭代接入 OCR(详见技术债 TD-001)"
- §3 解析流程:在"按类型提取文本"步骤下方补充说明:
  - TXT/Markdown:前端直接读取文本
  - PDF/Word:前端通过 `invoke('parse_source_file')` 调用 Rust 端 `source_parser` 模块解析
- 新增 §X "Rust 端解析模块"小节:
  - 模块位置:`src-tauri/src/source_parser/`
  - 入口命令:`parse_source_file(file_path, enable_ocr)`
  - 子模块:`pdf.rs`(PDF 文本提取,按 `\u{000C}` 分页)、`docx.rs`(Word 解析,按段落+2000 字符切分)、`types.rs`(序列化类型)
  - 扫描版 PDF 处理:文本 < 50 字符判定为扫描版,返回 `SOURCE_OCR_REQUIRED`(OCR 待后续迭代)
- 新增 §X "错误处理"小节:
  - `SOURCE_PARSE_FAILED`:Rust 端解析异常(如文件损坏),可重试
  - `SOURCE_OCR_REQUIRED`:扫描版 PDF,OCR 未实现,不可重试
  - `SOURCE_EMPTY_TEXT`:解析结果为空文本,不可重试

---

## 假设与决策

1. **Rust 单元测试范围**:仅覆盖纯函数(`count_pages` / `build_parsed_source` / `split_into_chunks`),不覆盖依赖文件系统的函数。理由:CI 环境无真实 PDF/docx 文件,且文件读取逻辑简单
2. **手工验收由用户执行**:我无法独立启动 `tauri dev` 并进行 GUI 交互。验收清单以表格形式提供给用户,用户执行后反馈结果
3. **文档更新原则**:保持原文档结构,仅追加/更新必要内容,不重写。错误码表追加"预留"说明,避免读者误以为 OCR 已实现
4. **OCR 相关文档**:在 `07_资料解析策略.md` 中明确标注"OCR 后置到后续迭代",与 [.trae/documents/技术债.md](file:///d:/workplace/idea/zhimo/.trae/documents/技术债.md) TD-001 呼应
5. **不更新 #2 原计划文件**:`#2-PDF-Word解析-剩余实施计划.md` 保留作为历史记录,本计划文件作为阶段 4 的执行依据

---

## 实施顺序(任务清单)

- [ ] 阶段 4.1:为 [pdf.rs](file:///d:/workplace/idea/zhimo/src-tauri/src/source_parser/pdf.rs) 追加 `count_pages` / `build_parsed_source` 单元测试
- [ ] 阶段 4.1:为 [docx.rs](file:///d:/workplace/idea/zhimo/src-tauri/src/source_parser/docx.rs) 追加 `split_into_chunks` 单元测试
- [ ] 阶段 4.2:运行 `cargo check && cargo test`(Rust 端验证)
- [ ] 阶段 4.2:运行 `npx tsc --noEmit && npx vitest run`(前端验证)
- [ ] 阶段 4.4:更新 [12_错误码与中文提示表_v1.0.md](file:///d:/workplace/idea/zhimo/ai_writing_development_startup_package_v1_0/06_工程实施补齐/12_错误码与中文提示表_v1.0.md)
- [ ] 阶段 4.4:更新 [07_资料解析与切片策略_v1.0.md](file:///d:/workplace/idea/zhimo/ai_writing_development_startup_package_v1_0/06_工程实施补齐/07_资料解析与切片策略_v1.0.md)
- [ ] 阶段 4.3:提供手工验收清单给用户(用户执行)

---

## 验证步骤(最终验收)

1. `cd src-tauri && cargo check` — Rust 端编译通过,无 warning
2. `cd src-tauri && cargo test` — Rust 单元测试全部通过
3. `npx tsc --noEmit` — 前端类型检查通过
4. `npx vitest run` — 前端全量测试通过(58 个测试,含 `SourceService.pdf.test.ts` 8 个用例)
5. 文档更新完成:[12_错误码与中文提示表_v1.0.md](file:///d:/workplace/idea/zhimo/ai_writing_development_startup_package_v1_0/06_工程实施补齐/12_错误码与中文提示表_v1.0.md) 和 [07_资料解析与切片策略_v1.0.md](file:///d:/workplace/idea/zhimo/ai_writing_development_startup_package_v1_0/06_工程实施补齐/07_资料解析与切片策略_v1.0.md)
6. 用户完成手工验收 7 项(阶段 4.3)
7. 任务进度更新:标记 #2 PDF/Word 解析为"已完成"(待手工验收通过后)

---

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Rust 单元测试因 `build_parsed_source` 是私有函数而无法测试 | 阶段 4.1 受阻 | 在 `pdf.rs` 内部 `#[cfg(test)] mod tests` 中测试,可访问私有函数 |
| `cargo test` 因依赖编译失败 | 阶段 4.2 受阻 | 阶段 3 回滚后 `cargo check` 已通过,测试编译应无问题;若失败,定位具体依赖 |
| 文档更新遗漏错误码 | 阶段 4.4 不完整 | 对照 [errors.ts](file:///d:/workplace/idea/zhimo/src/constants/errors.ts) 逐项核对 |
| 用户无扫描版 PDF 样本 | 阶段 4.3 第 3 项无法验收 | 提供替代方案:可跳过此项,或用图片型 PDF 替代 |
| 手工验收发现功能缺陷 | 需要返工 | 优先修复缺陷,更新测试用例,重新验收 |
