# #2 PDF/Word 解析 - 剩余实施计划

## 任务概述

延续此前已批准的 #2 PDF/Word 解析任务,本计划聚焦 **剩余阶段** 的实施与验收。

**已完成部分**(上一轮会话):
- 阶段 1:Rust 端基础解析(`src-tauri/src/source_parser/{mod,pdf,docx,types}.rs`),`cargo check` 已通过
- 阶段 2:前端代码改造(`SourceService.ts` 分流逻辑、`SourceParser.ts` 封装、`types/index.ts` 类型扩展、`constants/errors.ts` 错误码扩展)

**剩余工作**:
- 阶段 2 验证:类型检查、现有测试回归、新增前端单元测试
- 阶段 3:OCR 集成(扫描版 PDF 自动兜底,可降级)
- 阶段 4:集成验收(Rust + 前端联调、手工验收、文档更新)

---

## 当前状态分析

### Rust 端(已完成,待回归验证)

- [src-tauri/src/source_parser/types.rs](file:///d:/workplace/idea/zhimo/src-tauri/src/source_parser/types.rs):`ParsedSource` / `ParsedChunk` / `ParsedSourceType` 类型定义,`#[serde(rename_all = "camelCase")]` 对齐前端
- [src-tauri/src/source_parser/pdf.rs](file:///d:/workplace/idea/zhimo/src-tauri/src/source_parser/pdf.rs):`extract_pdf_text` 返回 `PdfExtractResult::Text` 或 `PdfExtractResult::Scanned`(阈值 50 字符判定扫描版),按 `\u{000C}` 分页符切分 chunks
- [src-tauri/src/source_parser/docx.rs](file:///d:/workplace/idea/zhimo/src-tauri/src/source_parser/docx.rs):`extract_docx_text` 使用 `docx_rs::read_docx(&bytes)` + 遍历 `Document → Paragraph → Run → Text`,按 2000 字符切分
- [src-tauri/src/source_parser/mod.rs](file:///d:/workplace/idea/zhimo/src-tauri/src/source_parser/mod.rs):`#[tauri::command] parse_source_file`,按扩展名分流;扫描版 PDF 阶段 1 返回 `"SOURCE_OCR_REQUIRED"` 错误字符串(阶段 3 在此接入 OCR)
- [src-tauri/src/lib.rs](file:///d:/workplace/idea/zhimo/src-tauri/src/lib.rs):已注册 `mod source_parser;` 和 `source_parser::parse_source_file` 到 invoke_handler

### 前端(代码已完成,待验证)

- [src/services/source/SourceParser.ts](file:///d:/workplace/idea/zhimo/src/services/source/SourceParser.ts):封装 `invoke<ParsedSource>('parse_source_file', ...)`
- [src/services/source/SourceService.ts](file:///d:/workplace/idea/zhimo/src/services/source/SourceService.ts):
  - `SUPPORTED_EXTENSIONS` / `EXTENSION_TO_TYPE` 扩展 `.pdf` / `.docx`
  - `importFile` 重构为分流:`importParsedFile`(PDF/Word 走 Rust)或 `importTextFile`(txt/md 走原流程)
  - `importParsedFile` 状态流转:pending → parsing → parsed → ready / failed
  - `splitIntoChunks`(纯函数)+ `createChunksFromParsed`(写库)拆分,txt/md 与 PDF/Word 共用入库逻辑
  - `getMimeType` 扩展 PDF / docx MIME
- [src/types/index.ts](file:///d:/workplace/idea/zhimo/src/types/index.ts):新增 `ParsedChunk` / `ParsedSource` 接口
- [src/constants/errors.ts](file:///d:/workplace/idea/zhimo/src/constants/errors.ts):新增 `SOURCE_PARSE_FAILED` / `SOURCE_OCR_REQUIRED`(retryable: true)/ `SOURCE_OCR_MODEL_DOWNLOAD_FAILED` / `SOURCE_OCR_FAILED`

### 测试基础设施

- [src/test/setup.ts](file:///d:/workplace/idea/zhimo/src/test/setup.ts):已 mock `@tauri-apps/plugin-sql`、`@tauri-apps/plugin-fs`(memoryFiles)、`@tauri-apps/plugin-dialog`、`@tauri-apps/api/core`(invoke 默认抛错,测试中通过 `vi.mocked(invoke).mockResolvedValue(...)` 配置)
- [src/test/fixtures/sqlMock.ts](file:///d:/workplace/idea/zhimo/src/test/fixtures/sqlMock.ts):内存 SQL 引擎,支持 CREATE/INSERT/SELECT/UPDATE/DELETE
- 现有测试参考:[src/services/project/ProjectService.test.ts](file:///d:/workplace/idea/zhimo/src/services/project/ProjectService.test.ts)(`seedTable` 夹具 + `unwrap` / `unwrapErr` 工具)

---

## 剩余阶段实施方案

### 阶段 2 验证(前端类型检查 + 测试)

#### 步骤 2.1:TypeScript 类型检查

```bash
npx tsc --noEmit
```

**预期**:无错误。若出现类型问题,优先修复 [SourceService.ts](file:///d:/workplace/idea/zhimo/src/services/source/SourceService.ts) 的 import / 变量使用,不放宽类型(禁止 `as any`)。

#### 步骤 2.2:现有测试回归

```bash
npx vitest run
```

**预期**:所有现有测试通过。重点关注 [ProjectService.test.ts](file:///d:/workplace/idea/zhimo/src/services/project/ProjectService.test.ts)(若涉及 source count 夹具),无失败即可。

#### 步骤 2.3:新增前端单元测试 `SourceService.pdf.test.ts`

**文件**:`src/services/source/SourceService.pdf.test.ts`

**测试范围**(覆盖 importParsedFile 全链路):

1. **PDF 文本型导入成功路径**
   - mock `open` 返回 `'/data/test.pdf'`
   - mock `invoke` 返回 `ParsedSource`:`{ text: '...', pageCount: 2, chunks: [...], sourceType: 'pdf', ocrUsed: false }`
   - mock 文件网关:copyFileTo / ensureDir / joinPath 正常
   - 调用 `importFile({ projectId, aiUsageAllowed: true })`
   - 断言:返回 `ok(source)`,source.processingStatus === 'ready',source.type === 'pdf',source_chunks 表有对应记录,processing_status 流转 pending → parsing → parsed → ready

2. **docx 导入成功路径**
   - mock `open` 返回 `'/data/test.docx'`
   - mock `invoke` 返回 `ParsedSource`:`{ sourceType: 'word', pageCount: 1, ocrUsed: false, ... }`
   - 断言:source.type === 'word',source.processingStatus === 'ready'

3. **PDF 扫描版返回 SOURCE_OCR_REQUIRED**
   - mock `invoke` 抛出 `new Error('SOURCE_OCR_REQUIRED')`
   - 断言:返回 `err({ code: 'SOURCE_OCR_REQUIRED', retryable: true })`,source.processingStatus === 'failed',error_message 含 'SOURCE_OCR_REQUIRED'

4. **PDF 解析失败(非 OCR 错误)**
   - mock `invoke` 抛出 `new Error('PDF 文本提取失败: 文件损坏')`
   - 断言:返回 `err({ code: 'SOURCE_PARSE_FAILED', retryable: true })`,source.processingStatus === 'failed'

5. **解析结果为空文本**
   - mock `invoke` 返回 `{ text: '   ', pageCount: 1, chunks: [], sourceType: 'pdf', ocrUsed: false }`
   - 断言:返回 `err({ code: 'SOURCE_EMPTY_TEXT', retryable: false })`,source.processingStatus === 'failed'

6. **txt 文件仍走原流程(回归保护)**
   - mock `open` 返回 `'/data/test.txt'`
   - 不调用 `invoke`(通过 `vi.mocked(invoke).mockClear()` + 断言未被调用)
   - mock `readText` 返回 'Hello'
   - 断言:返回 `ok(source)`,source.type === 'txt',source.rawText === 'Hello',invoke 未被调用

7. **用户取消文件选择**
   - mock `open` 返回 `null`
   - 断言:返回 `err({ code: 'OPERATION_CANCELLED' })`,invoke 未被调用,数据库无新记录

8. **不支持的文件类型**
   - mock `open` 返回 `'/data/test.xls'`
   - 断言:返回 `err({ code: 'FILE_TYPE_UNSUPPORTED' })`,invoke 未被调用

**夹具**:复用 `seedTable` 初始化 `sources` / `source_chunks` 空表,通过 `seedTable('sources', [...])` 添加项目所属 source 数据。

**Mock 配置示例**:
```ts
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
vi.mocked(open).mockResolvedValue('/data/test.pdf' as any)
vi.mocked(invoke).mockResolvedValue({
  text: 'PDF 全文',
  pageCount: 1,
  chunks: [{ content: 'PDF 全文', pageNumber: 1, startOffset: 0, endOffset: 6 }],
  sourceType: 'pdf',
  ocrUsed: false,
})
```

#### 步骤 2.4:运行新增测试

```bash
npx vitest run src/services/source/SourceService.pdf.test.ts
npx vitest run  # 全量回归
```

---

### 阶段 3:OCR 集成(扫描版 PDF 兜底,可降级)

#### 决策回顾

- OCR 库:`paddle-ocr-rs 0.6.1`(基于 ONNX Runtime,纯 Rust 绑定)
- PDF 渲染:`pdfium-render`(基于 Google PDFium,将扫描版 PDF 渲染为图片)
- 图片处理:`image 0.25`(格式转换、灰度化)
- HTTP 下载:`reqwest 0.12`(blocking features,首次使用下载 PaddleOCR ONNX 模型)
- 异步运行时:`tokio 1`(pdfium 渲染与 OCR 推理放在 spawn_blocking)
- 模型分发:首次使用时从 GitHub Releases 下载到 AppData/models/ocr/
- 触发方式:自动检测触发(pdf-extract 返回 < 50 字符判定扫描版)
- 降级策略:模型下载失败 / OCR 推理失败 → 返回 `SOURCE_OCR_REQUIRED` 错误(让前端引导用户后续处理)

#### 步骤 3.1:Cargo.toml 依赖追加

文件:[src-tauri/Cargo.toml](file:///d:/workplace/idea/zhimo/src-tauri/Cargo.toml)

在 `docx-rs = "0.4"` 之后追加:
```toml
# OCR 集成(资料导入 #2 阶段 3,扫描版 PDF 兜底)
pdfium-render = "0.8"           # PDF 渲染为图片(基于 PDFium)
image = { version = "0.25", features = ["jpeg", "png"] }  # 图片处理
paddle-ocr-rs = "0.6"           # PaddleOCR ONNX 推理
reqwest = { version = "0.12", features = ["blocking"] }  # 模型下载
tokio = { version = "1", features = ["rt", "rt-multi-thread"] }  # 异步运行时
```

**注意**:pdfium-render 需要打包 PDFium 动态库。在 `tauri.conf.json` 的 `bundle.externalBin` 或 `resources` 中加入 PDFium 二进制(根据 pdfium-render 文档)。MVP 阶段可先在 build.rs 中下载到 target 目录,发布时再正式打包。

#### 步骤 3.2:新建 `model_downloader.rs`

文件:`src-tauri/src/source_parser/model_downloader.rs`

**职责**:首次使用时下载 PaddleOCR ONNX 模型到 AppData。

**模型清单**(从 PaddleOCR 官方 GitHub Releases 下载):
- `ch_PP-OCRv4_det_infer.onnx`(文本检测,~10MB)
- `ch_PP-OCRv4_rec_infer.onnx`(文本识别,~15MB)
- `ch_ppocr_mobile_v2.0_cls_infer.onnx`(方向分类,~1MB)
- `ppocr_keys_v1.txt`(字符表,~1KB)

**接口**:
```rust
pub fn ensure_ocr_models(app_data_dir: &Path) -> Result<PathBuf, String>
```

- 检查 `app_data_dir/models/ocr/` 是否已有 4 个文件
- 缺失文件则用 reqwest::blocking::get 下载,显示进度(可选,MVP 简化为同步等待)
- 下载失败返回 `"SOURCE_OCR_MODEL_DOWNLOAD_FAILED"` 错误字符串

#### 步骤 3.3:新建 `ocr.rs`

文件:`src-tauri/src/source_parser/ocr.rs`

**职责**:扫描版 PDF → 渲染为图片 → PaddleOCR 识别 → 拼接文本 → 返回 ParsedSource

**接口**:
```rust
pub fn ocr_pdf(
    file_path: &str,
    models_dir: &Path,
) -> Result<ParsedSource, String>
```

**流程**:
1. 用 pdfium-render 打开 PDF
2. 遍历每页,渲染为灰度 PNG(image crate 转换)
3. 调用 paddle-ocr-rs:det(检测文本框)→ cls(方向分类)→ rec(识别文本)
4. 按页拼接文本,每页构造一个 ParsedChunk(page_number = 页码,offset 为字符偏移)
5. 返回 `ParsedSource { text, page_count, chunks, source_type: Pdf, ocr_used: true }`
6. 任何环节失败返回 `"SOURCE_OCR_FAILED"` 错误字符串

#### 步骤 3.4:mod.rs 接入 OCR 兜底

文件:[src-tauri/src/source_parser/mod.rs](file:///d:/workplace/idea/zhimo/src-tauri/src/source_parser/mod.rs)

变更:
1. 取消注释 `pub mod model_downloader;` 和 `pub mod ocr;`
2. 修改 `parse_pdf` 函数:
   ```rust
   fn parse_pdf(
       app: &AppHandle,
       file_path: &str,
       enable_ocr: bool,
   ) -> Result<types::ParsedSource, String> {
       match pdf::extract_pdf_text(file_path)? {
           PdfExtractResult::Text(parsed) => Ok(parsed),
           PdfExtractResult::Scanned { page_count: _ } => {
               if !enable_ocr {
                   return Err("SOURCE_OCR_REQUIRED".to_string());
               }
               // 获取 AppData 目录
               let app_data_dir = app.path().app_data_dir()
                   .map_err(|e| format!("获取 AppData 目录失败: {}", e))?;
               // 确保模型已下载
               let models_dir = model_downloader::ensure_ocr_models(&app_data_dir)?;
               // 调用 OCR
               ocr::ocr_pdf(file_path, &models_dir)
           }
       }
   }
   ```

#### 步骤 3.5:Rust 端编译验证

```bash
cargo check
```

**风险与缓解**:
- pdfium-render 在 Windows 上需要 PDFium DLL。MVP 阶段可在 `build.rs` 中通过 `reqwest::blocking` 下载 PDFium 二进制到 `target/` 目录,运行时通过 `pdfium-render::Pdfium::bind_to_system_dll()` 加载
- paddle-ocr-rs 0.6.1 若 API 不匹配,查阅 crate 文档与示例代码,必要时降级到 0.5 版本
- 若依赖冲突(如 image 0.25 与其他 crate 的旧版本 image),通过 `cargo tree -d` 排查

#### 步骤 3.6:前端错误处理验证

前端 `SourceService.importParsedFile` 已经识别 `SOURCE_OCR_REQUIRED`,但阶段 3 后该错误只会在 `enable_ocr=false` 或 OCR 失败时出现。验证:
- 测试用例 3(PDF 扫描版返回 SOURCE_OCR_REQUIRED)仍通过
- 新增测试:OCR 模型下载失败 → 错误码 `SOURCE_OCR_MODEL_DOWNLOAD_FAILED`
- 新增测试:OCR 推理失败 → 错误码 `SOURCE_OCR_FAILED`

---

### 阶段 4:集成验收

#### 步骤 4.1:Rust 端单元测试(可选,若 ocr 模块易测试)

为 `pdf.rs` 的 `build_parsed_source` / `count_pages` 写单元测试(纯函数,无外部依赖)。OCR 模块因依赖模型文件,不在 CI 中跑,只在本地手工验证。

#### 步骤 4.2:全量测试

```bash
# Rust 端
cd src-tauri && cargo test && cd ..

# 前端
npx tsc --noEmit
npx vitest run
```

**预期**:全部通过。若 cargo test 因 PDFium DLL 缺失失败,可在 CI 中通过 `#[cfg(feature = "ocr")]` 条件编译跳过 OCR 测试。

#### 步骤 4.3:手工验收(Tauri dev 模式)

```bash
npm run tauri dev
```

**验收清单**:
1. **文本型 PDF 导入**:选择一个文本型 PDF(如学术论文),验证:
   - 资料列表出现新条目,类型显示"PDF"
   - 资料详情显示全文,processingStatus 为 ready
   - chunks 列表按页码排序,每页一条
2. **Word 文档导入**:选择一个 .docx 文件,验证:
   - 资料类型显示"Word"
   - 全文按段落拼接,chunks 按段落 + 2000 字符切分
3. **扫描版 PDF 导入(首次)**:选择一个扫描版 PDF,验证:
   - UI 显示"检测到扫描版 PDF,正在尝试 OCR 识别"
   - 显示"首次使用需下载 OCR 模型(~25MB),请稍候"
   - 等待下载完成后,OCR 识别结果写入资料
   - 资料详情显示 ocrUsed 标记(可在 UI 中加一个角标)
4. **扫描版 PDF 导入(已下载模型)**:再次导入扫描版 PDF,验证:
   - 直接走 OCR,无需下载等待
5. **解析失败**:选择一个损坏的 PDF,验证:
   - UI 显示"资料解析失败"中文提示
   - 资料状态为 failed,error_message 写入数据库
6. **取消选择**:在文件选择对话框点取消,验证:
   - UI 无错误提示(优雅处理)
7. **重启客户端数据恢复**:导入 PDF 后重启,验证:
   - 资料记录仍在
   - 资料状态为 ready / failed(与重启前一致)
   - chunks 仍在

#### 步骤 4.4:更新文档

更新 `docs/` 下的相关文档(若存在资料导入相关文档):
- 资料导入流程:新增 PDF / Word 解析路径说明
- 错误码表:确认 `SOURCE_OCR_REQUIRED` / `SOURCE_OCR_MODEL_DOWNLOAD_FAILED` / `SOURCE_OCR_FAILED` 已收录
- 数据流图:补充 Rust 端解析 → 前端 Service → 数据库的路径

#### 步骤 4.5:技术债记录

在 `.trae/documents/技术债.md`(若存在)或新增文件中记录:
- OCR 模型分发:首次下载策略,后续可改为安装时预下载或随应用打包
- PDFium DLL 分发:MVP 阶段在 build.rs 下载,后续应正式打包到 bundle resources
- OCR 性能:paddle-ocr-rs 在 CPU 上推理较慢,后续可考虑 GPU 加速或异步任务化
- 模型版本管理:目前固定 PaddleOCRv4,后续可支持模型升级

---

## 假设与决策

1. **OCR 触发条件**:pdf-extract 返回 < 50 字符判定扫描版。阈值可调,但 50 字符足够覆盖"扫描版 PDF 提取结果几乎为空"的场景
2. **模型下载同步阻塞**:首次 OCR 时前端等待下载完成(约 25MB,正常网络 30 秒内)。MVP 接受此体验,后续可改为后台下载 + 进度条
3. **OCR 推理同步阻塞**:整本 PDF OCR 可能耗时数分钟。MVP 接受阻塞,后续改为异步任务 + 进度提示
4. **pdfium DLL 分发**:MVP 阶段在 build.rs 中下载到 target 目录,不打包到 bundle。这意味着用户首次启动应用时 PDFium 可能缺失(OCR 兜底失败 → 返回 SOURCE_OCR_FAILED)。**这是已知技术债**,阶段 4 文档化记录
5. **OCR 模型缓存**:模型存储在 AppData/models/ocr/,跨项目共享,卸载应用时残留(用户可手动清理)
6. **错误码字符串约定**:Rust 端通过 `Err("SOURCE_OCR_REQUIRED".to_string())` 返回错误码,前端通过 `errorMsg.includes('SOURCE_OCR_REQUIRED')` 识别。**此约定已在阶段 2 实现**,阶段 3 保持一致

---

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| paddle-ocr-rs API 不匹配 | 编译失败 | 查阅 crate 文档,必要时降级到 0.5;最坏情况改用 ocr-rs(MNN 后端) |
| PDFium DLL 在 Windows 缺失 | OCR 兜底失败 | build.rs 自动下载;失败时降级到 SOURCE_OCR_FAILED,前端引导用户 |
| 模型下载网络超时 | 首次 OCR 失败 | 返回 SOURCE_OCR_MODEL_DOWNLOAD_FAILED,提示用户手动放置模型文件 |
| OCR 推理内存占用高 | 大 PDF 可能 OOM | 限制单页渲染分辨率(DPI 200),失败时返回 SOURCE_OCR_FAILED |
| 现有测试回归失败 | 阶段 2 验证受阻 | 优先修复类型问题;若涉及 sqlMock 限制,调整测试夹具而非放宽断言 |

---

## 实施顺序(任务清单)

- [ ] 阶段 2.1:运行 `npx tsc --noEmit`,修复类型错误
- [ ] 阶段 2.2:运行 `npx vitest run`,确认现有测试无回归
- [ ] 阶段 2.3:编写 `src/services/source/SourceService.pdf.test.ts`(8 个测试用例)
- [ ] 阶段 2.4:运行新增测试 + 全量回归
- [ ] 阶段 3.1:Cargo.toml 追加 OCR 相关依赖
- [ ] 阶段 3.2:新建 `src-tauri/src/source_parser/model_downloader.rs`
- [ ] 阶段 3.3:新建 `src-tauri/src/source_parser/ocr.rs`
- [ ] 阶段 3.4:修改 `mod.rs` 接入 OCR 兜底
- [ ] 阶段 3.5:`cargo check` 验证编译
- [ ] 阶段 3.6:前端新增 OCR 错误码测试用例
- [ ] 阶段 4.1:`cargo test` Rust 单元测试
- [ ] 阶段 4.2:`npx tsc --noEmit` + `npx vitest run` 全量验证
- [ ] 阶段 4.3:手工验收(7 项验收清单)
- [ ] 阶段 4.4:更新文档
- [ ] 阶段 4.5:记录技术债

---

## 验证步骤(最终验收)

1. `cd src-tauri && cargo check` — Rust 端编译通过
2. `cd src-tauri && cargo test` — Rust 单元测试通过(OCR 测试可跳过)
3. `npx tsc --noEmit` — 前端类型检查通过
4. `npx vitest run` — 前端全量测试通过(含新增 `SourceService.pdf.test.ts`)
5. `npm run tauri dev` 启动应用,手工执行验收清单 7 项
6. 检查 [src/constants/errors.ts](file:///d:/workplace/idea/zhimo/src/constants/errors.ts) 中 4 个 SOURCE_* 错误码均有对应 UI 提示
7. 检查资料列表 UI 显示 PDF / Word 类型中文标签(应已通过 objectLabels 配置)

---

## 回滚方案

若阶段 3 OCR 集成出现不可解决的依赖冲突或性能问题:

1. **保留阶段 1 + 阶段 2**:文本型 PDF 和 Word 解析已可用,价值已交付
2. **回滚阶段 3**:
   - 删除 `src-tauri/src/source_parser/model_downloader.rs` 和 `ocr.rs`
   - 在 `mod.rs` 中重新注释 `pub mod model_downloader;` 和 `pub mod ocr;`
   - 在 `Cargo.toml` 中删除 OCR 相关依赖
   - `parse_pdf` 保持阶段 1 行为(扫描版直接返回 SOURCE_OCR_REQUIRED)
3. **前端无需改动**:错误处理已覆盖 SOURCE_OCR_REQUIRED,UI 提示"暂不支持 OCR"
4. **文档**:在技术债中记录"OCR 集成待后续迭代"

回滚后功能基线:文本型 PDF + Word 解析可用,扫描版 PDF 友好提示不支持。
