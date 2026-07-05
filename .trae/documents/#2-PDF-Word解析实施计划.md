# #2 PDF/Word 解析实施计划

## 一、任务概述

为资料导入流程增加 PDF / Word 文档解析能力,补齐 B 类轻量五项剩余的复杂项。

### 用户确认的技术选型

| 维度 | 选型 | 说明 |
|---|---|---|
| 解析架构 | Rust 端解析 | 引入 pdf-extract + docx-rs + paddle-ocr-rs crate |
| 调用模式 | 同步解析 | MVP 不引入任务队列,前端 await Tauri command |
| PDF 范围 | 文本型 PDF 优先 + 扫描版自动 OCR | OCR 仅在文本提取失败时触发 |
| OCR 库 | paddle-ocr-rs 0.6.1 | 基于 ONNX Runtime,跨平台成熟 |
| OCR 模型 | PP-OCRv4 轻量模型 | 检测 + 识别两阶段 |
| OCR 触发 | 自动检测触发 | pdf-extract 返回 < 50 字符判定扫描版 |
| 模型分发 | 首次使用时下载 | 从 GitHub Releases 下载到 AppData,~10MB |

### 不在本次范围

- PaddleOCR-VL-1.6 等 0.9B+ 视觉语言大模型(需 GPU,不适合桌面 MVP)
- .doc 旧格式(仅支持 .docx)
- PDF 表格 / 图片版面结构化提取(仅纯文本)
- OCR 结果用户校正 UI(失败直接报错)

---

## 二、现状分析

### 2.1 数据库 schema(已完备,无需迁移)

`src-tauri/migrations/001_initial_schema.sql` 已支持:
- `sources.type` CHECK 含 `'pdf'` / `'word'`
- `sources.raw_text` 存解析后纯文本
- `sources.processing_status` 默认 `'pending'`,状态机含 `'pending'|'parsing'|'parsed'|'summarizing'|'ready'|'failed'`
- `source_chunks.page_number` / `start_offset` / `end_offset` 字段已存在

### 2.2 前端类型(已完备)

`src/types/index.ts`:
- `SourceType` 已含 `'pdf' | 'word'`
- `SourceProcessingStatus` 已含完整状态机
- `SourceChunk` 已含 pageNumber/startOffset/endOffset 字段

### 2.3 当前 importFile 流程(`src/services/source/SourceService.ts`)

```
dialog 选文件(extensions: ['txt','md','markdown'])
  → 检查扩展名
  → readText 读取
  → copyFileTo 复制到项目资料目录
  → insertSource(含 rawText)
  → updateSourceProcessingStatus(sourceId, 'ready', null)  // 直接 ready
  → createChunksFromText 分片(按双换行,每片 ≤2000 字符)
```

### 2.4 Rust 端当前状态(`src-tauri/`)

- `Cargo.toml` 无任何 PDF/Word/OCR 解析依赖
- `src/lib.rs` 仅注册 3 个命令(secret 模块),命令模式 `#[tauri::command] pub fn xxx(app: AppHandle, ...) -> Result<T, String>`
- `AppState` 持有 `app_data_dir: PathBuf`,可用于模型文件存储

### 2.5 错误码现状(`src/constants/errors.ts`)

已有:
- `SOURCE_PARSE_FAILED`「资料解析失败」可重试
- `SOURCE_EMPTY_TEXT`「没有提取到可用文本」不可重试
- `SOURCE_OCR_REQUIRED`「这是扫描件,MVP 暂不支持 OCR」不可重试 ← 文案需更新

需新增:
- `SOURCE_OCR_MODEL_DOWNLOAD_FAILED` 模型下载失败
- `SOURCE_OCR_FAILED` OCR 推理失败

### 2.6 文件网关(`src/services/file/fileGateway.ts`)

已提供:
- `readText(filePath)` 文本读取
- `readBinary(filePath)` 二进制读取(返回 Uint8Array)
- `copyFileTo(source, target)` 复制文件
- `ensureDir(dir)` / `joinPath(...segments)` 路径工具

够用,无需扩展。

---

## 三、架构设计

### 3.1 总体数据流

```
用户点击「导入资料」
  ↓
dialog 选文件(扩展名: txt/md/markdown/pdf/docx)
  ↓
SourceService.importFile
  ↓ (按扩展名分流)
  ├─ txt/md/markdown → readText → 走原流程
  └─ pdf/docx        → copyFileTo → insertSource(status='pending')
                                  → updateStatus('parsing')
                                  → invoke('parse_source_file', { filePath, enableOcr: true })
                                  → 成功: updateStatus('parsed') + 写 raw_text + 分片 → updateStatus('ready')
                                  → 失败: updateStatus('failed', errorMsg)
```

### 3.2 Rust 端模块结构

```
src-tauri/src/
  lib.rs                     (注册新命令)
  source_parser/
    mod.rs                   (模块入口 + parse_source_file 命令)
    types.rs                 (请求/响应类型)
    pdf.rs                   (PDF 文本提取)
    docx.rs                  (Word docx 解析)
    ocr.rs                   (OCR 集成 + 模型下载)
    model_downloader.rs      (OCR 模型文件下载与缓存)
```

### 3.3 前端模块结构

```
src/services/source/
  SourceService.ts           (importFile 改造,接入解析)
  SourceParser.ts            (新增,Tauri command 封装)

src/constants/
  errors.ts                  (更新 SOURCE_OCR_REQUIRED 文案,新增 OCR 错误码)
```

---

## 四、具体改造点

### 4.1 Rust 端依赖引入(`src-tauri/Cargo.toml`)

新增依赖:

```toml
# 文档解析
pdf-extract = "0.7"                # PDF 文本提取(纯文本型 PDF)
docx-rs = "0.4"                    # Word .docx 解析
paddle-ocr-rs = "0.6"              # PaddleOCR PP-OCRv4 推理(基于 ONNX Runtime)

# PDF 渲染为图片(扫描版 OCR 前置)
pdfium-render = "0.8"              # 基于 Google PDFium 的 PDF 渲染

# 图像处理
image = "0.25"                     # 图片格式转换 / 灰度化

# 模型下载
reqwest = { version = "0.12", features = ["blocking", "json"] }

# 异步运行时(模型下载用)
tokio = { version = "1", features = ["rt-multi-thread", "macros", "fs"] }

# 临时文件
tempfile = "3"
```

**说明**:
- `pdfium-render` 需要在打包时附带 PDFium native 库,跨平台需测试(Windows 用 pdfium.dll)
- `paddle-ocr-rs` 依赖 ONNX Runtime,打包后增加 ~50MB 体积
- `tokio` 仅用于模型下载异步 IO,不污染主线程

### 4.2 Rust 端类型定义(`src-tauri/src/source_parser/types.rs` 新建)

```rust
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct ParseSourceRequest {
    pub file_path: String,
    pub enable_ocr: bool,
}

#[derive(Serialize)]
pub struct ParsedSource {
    pub text: String,
    pub page_count: u32,
    pub chunks: Vec<ParsedChunk>,
    pub source_type: ParsedSourceType,
    pub ocr_used: bool,
}

#[derive(Serialize)]
pub struct ParsedChunk {
    pub content: String,
    pub page_number: Option<u32>,
    pub start_offset: Option<u64>,
    pub end_offset: Option<u64>,
}

#[derive(Serialize)]
pub enum ParsedSourceType {
    Pdf,
    Word,
}
```

### 4.3 Rust 端 PDF 解析(`src-tauri/src/source_parser/pdf.rs` 新建)

**职责**:
1. 调 `pdf-extract::extract_text(file_path)` 提取纯文本
2. 若文本长度 < 50 字符,判定为扫描版,返回 `ScannedPdf` 标记
3. 按 `\f`(form feed,PDF 分页符)切分页码,构造 ParsedChunk
4. OCR 流程由上层 mod.rs 协调

**核心函数**:
```rust
pub enum PdfExtractResult {
    Text(ParsedSource),
    Scanned { page_count: u32 },
}

pub fn extract_pdf_text(file_path: &str) -> Result<PdfExtractResult, String> {
    // 1. pdf-extract 提取
    // 2. 文本 < 50 字符 → Scanned
    // 3. 否则按 \f 切页,构造 chunks
}
```

### 4.4 Rust 端 Word 解析(`src-tauri/src/source_parser/docx.rs` 新建)

**职责**:
1. 用 `docx-rs` 读取 .docx 文件
2. 遍历段落,拼接为纯文本(段落间用 `\n\n`)
3. Word 无分页概念,page_count 固定为 1,所有 chunk 的 page_number = None

**核心函数**:
```rust
pub fn extract_docx_text(file_path: &str) -> Result<ParsedSource, String>
```

### 4.5 Rust 端 OCR 集成(`src-tauri/src/source_parser/ocr.rs` 新建)

**职责**:
1. 用 `pdfium-render` 将 PDF 每页渲染为图片(PNG,150 DPI)
2. 调 `paddle-ocr-rs` 对每页图片做 OCR(检测 + 识别)
3. 拼接识别结果,按页构造 ParsedChunk
4. 模型文件由 `model_downloader` 模块保证已就绪

**核心函数**:
```rust
pub fn ocr_pdf(file_path: &str, models_dir: &Path) -> Result<ParsedSource, String>
```

**OCR 流程细节**:
```
1. 检查 models_dir 下 det_model.onnx / rec_model.onnx / cls_model.onnx 是否存在
   → 不存在则调 model_downloader::ensure_models 下载
2. 加载 PaddleOcr 实例(初始化约 2-3 秒)
3. 用 pdfium-render 打开 PDF
4. 遍历每页:
   a. render_page_to_image(page, dpi=150) → DynamicImage
   b. ocr_instance.ocr(image) → Vec<OcrLine>
   c. 拼接 OcrLine 文本,作为该页 chunk 内容
5. 返回 ParsedSource { text: 全文, chunks: 按页, page_count, ocr_used: true }
```

### 4.6 Rust 端模型下载(`src-tauri/src/source_parser/model_downloader.rs` 新建)

**职责**:
1. 检查 AppData/models/ocr/ 目录下模型文件是否存在
2. 不存在则从 GitHub Releases 下载
3. 校验文件 SHA256,失败重试 3 次
4. 下载完成后写入目标路径

**模型文件清单**(基于 PP-OCRv4 中文模型):
- `ch_PP-OCRv4_det_infer.onnx` (~10MB,文本检测)
- `ch_PP-OCRv4_rec_infer.onnx` (~15MB,文本识别)
- `ch_ppocr_mobile_v2.0_cls_infer.onnx` (~1MB,方向分类)
- `ppocr_keys_v1.txt` (~100KB,字符字典)

**下载源**:
- 主源: `https://github.com/PaddlePaddle/PaddleOCR/releases/download/v2.7.0/`
- 备用源(国内): `https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/`

**核心函数**:
```rust
pub fn ensure_models(app_data_dir: &Path) -> Result<PathBuf, String>
```

### 4.7 Rust 端命令入口(`src-tauri/src/source_parser/mod.rs` 新建)

**协调逻辑**:
```rust
pub mod types;
pub mod pdf;
pub mod docx;
pub mod ocr;
pub mod model_downloader;

use tauri::{AppHandle, Manager};

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

fn parse_pdf(app: &AppHandle, file_path: &str, enable_ocr: bool) -> Result<types::ParsedSource, String> {
    match pdf::extract_pdf_text(file_path)? {
        pdf::PdfExtractResult::Text(parsed) => Ok(parsed),
        pdf::PdfExtractResult::Scanned { page_count } => {
            if !enable_ocr {
                return Err("SOURCE_OCR_REQUIRED".to_string());
            }
            let app_data_dir = app.state::<crate::app_state::AppState>()
                .app_data_dir.clone();
            ocr::ocr_pdf(file_path, &app_data_dir)
        }
    }
}
```

### 4.8 Rust 端命令注册(`src-tauri/src/lib.rs` 改造)

在 `mod` 声明区追加:
```rust
mod source_parser;
```

在 `invoke_handler` 宏追加:
```rust
.invoke_handler(tauri::generate_handler![
    secret::encrypt_secret,
    secret::decrypt_secret,
    secret::get_or_create_app_key,
    source_parser::parse_source_file,
])
```

### 4.9 前端错误码扩展(`src/constants/errors.ts` 改造)

更新 `SOURCE_OCR_REQUIRED` 文案:
```ts
SOURCE_OCR_REQUIRED: {
  message: '检测到扫描版 PDF,正在尝试 OCR 识别',
  retryable: true,
  suggestedAction: '首次使用需下载 OCR 模型(~25MB),请稍候',
},
```

新增错误码:
```ts
SOURCE_OCR_MODEL_DOWNLOAD_FAILED: {
  message: 'OCR 模型下载失败,请检查网络后重试',
  retryable: true,
  suggestedAction: '可将模型文件手动放置到 AppData/models/ocr/ 目录',
},
SOURCE_OCR_FAILED: {
  message: 'OCR 识别失败',
  retryable: true,
},
```

在常量声明区追加:
```ts
export const SOURCE_OCR_MODEL_DOWNLOAD_FAILED = 'SOURCE_OCR_MODEL_DOWNLOAD_FAILED' satisfies ErrorCode
export const SOURCE_OCR_FAILED = 'SOURCE_OCR_FAILED' satisfies ErrorCode
export const SOURCE_PARSE_FAILED = 'SOURCE_PARSE_FAILED' satisfies ErrorCode
export const SOURCE_OCR_REQUIRED = 'SOURCE_OCR_REQUIRED' satisfies ErrorCode
```

### 4.10 前端 SourceParser 封装(`src/services/source/SourceParser.ts` 新建)

```ts
import { invoke } from '@tauri-apps/api/core'
import type { ParsedSource } from '@/types/source'

/// 调用 Rust 端解析 PDF / Word 文件
/// @param filePath 文件绝对路径
/// @param enableOcr 是否启用 OCR(扫描版 PDF 自动回退)
export async function parseSourceFile(
  filePath: string,
  enableOcr: boolean,
): Promise<ParsedSource> {
  return invoke<ParsedSource>('parse_source_file', {
    filePath,
    enableOcr,
  })
}
```

### 4.11 前端类型补充(`src/types/source.ts` 新建或追加到 `src/types/index.ts`)

```ts
export type ParsedSourceType = 'pdf' | 'word'

export interface ParsedChunk {
  content: string
  pageNumber: number | null
  startOffset: number | null
  endOffset: number | null
}

export interface ParsedSource {
  text: string
  pageCount: number
  chunks: ParsedChunk[]
  sourceType: ParsedSourceType
  ocrUsed: boolean
}
```

### 4.12 前端 SourceService.importFile 改造(`src/services/source/SourceService.ts`)

#### 4.12.1 扩展支持类型

```ts
const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.pdf', '.docx']
const EXTENSION_TO_TYPE: Record<string, SourceType> = {
  '.txt': 'txt',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.pdf': 'pdf',
  '.docx': 'word',
}
```

dialog filters:
```ts
filters: [
  {
    name: '文档资料',
    extensions: ['txt', 'md', 'markdown', 'pdf', 'docx'],
  },
],
```

getMimeType 扩展:
```ts
case '.pdf':
  return 'application/pdf'
case '.docx':
  return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
```

#### 4.12.2 分流解析逻辑

在 `importFile` 中,对 pdf/docx 类型走新流程:

```ts
// 复制文件到项目资料目录(所有类型统一)
const sourcesDir = await getProjectSourcesDir(input.projectId)
await ensureDir(sourcesDir)
const sourceId = generateId()
const targetFileName = `${sourceId}_${fileName}`
const targetPath = await joinPath(sourcesDir, targetFileName)
await copyFileTo(filePath, targetPath)

// 判断是否需要 Rust 端解析
const needsRustParse = sourceType === 'pdf' || sourceType === 'word'

let rawText: string
let chunks: Array<{ content: string; pageNumber: number | null; startOffset: number | null; endOffset: number | null }>

if (needsRustParse) {
  // PDF / Word:先插入 pending 记录,走 Tauri command 解析
  await insertSource({
    id: sourceId,
    projectId: input.projectId,
    title: fileName,
    type: sourceType,
    fileUrl: targetPath,
    fileName,
    fileSize: 0,  // 解析后更新
    mimeType: getMimeType(ext),
    rawText: '',  // 解析后更新
    aiUsageAllowed: input.aiUsageAllowed ?? true,
    privacyLevel: 'local_only',
  })
  await updateSourceProcessingStatus(sourceId, 'parsing', null)

  try {
    const parsed = await parseSourceFile(targetPath, /* enableOcr */ true)
    rawText = parsed.text
    chunks = parsed.chunks
    await updateSourceParsedContent(sourceId, rawText, parsed.pageCount)
    await updateSourceProcessingStatus(sourceId, 'parsed', null)
  } catch (error) {
    await updateSourceProcessingStatus(sourceId, 'failed', String(error))
    return err({
      code: SOURCE_PARSE_FAILED,
      message: `资料解析失败: ${error}`,
      retryable: true,
    })
  }
} else {
  // txt/md/markdown:走原流程
  rawText = await readText(filePath)
  if (!rawText.trim()) {
    return err({ code: SOURCE_EMPTY_TEXT, message: '文件内容为空', retryable: false })
  }
  await insertSource({
    id: sourceId,
    projectId: input.projectId,
    title: fileName,
    type: sourceType,
    fileUrl: targetPath,
    fileName,
    fileSize: rawText.length,
    mimeType: getMimeType(ext),
    rawText,
    aiUsageAllowed: input.aiUsageAllowed ?? true,
    privacyLevel: 'local_only',
  })
  chunks = splitIntoChunks(rawText)
}

// 统一分片入库
await createChunksFromParsed(sourceId, input.projectId, chunks)

// 更新为 ready
await updateSourceProcessingStatus(sourceId, 'ready', null)
```

#### 4.12.3 重构分片函数

将现有 `createChunksFromText` 拆为两层:

```ts
/// 纯文本分片(按段落,每片 ≤2000 字符)
function splitIntoChunks(text: string): Array<{
  content: string
  pageNumber: number | null
  startOffset: number | null
  endOffset: number | null
}> {
  // 复用原 createChunksFromText 的逻辑,但只返回数据,不写库
}

/// 将分片数据写入 source_chunks 表
async function createChunksFromParsed(
  sourceId: string,
  projectId: string,
  chunks: Array<{ content: string; pageNumber: number | null; startOffset: number | null; endOffset: number | null }>,
): Promise<void> {
  for (let i = 0; i < chunks.length; i++) {
    await insertSourceChunk({
      id: generateId(),
      projectId,
      sourceId,
      chunkIndex: i,
      content: chunks[i].content,
      tokenCount: estimateTokens(chunks[i].content),
      pageNumber: chunks[i].pageNumber,
      startOffset: chunks[i].startOffset,
      endOffset: chunks[i].endOffset,
    })
  }
}
```

#### 4.12.4 sourceRepository 补充方法

`src/services/database/sourceRepository.ts` 已有 `updateSourceParsedContent`,确认签名能接收 pageCount 参数。若不能,需扩展:

```ts
export async function updateSourceParsedContent(
  id: EntityId,
  rawText: string,
  pageCount: number,
): Promise<void>
```

---

## 五、测试点

### 5.1 Rust 端测试

**单元测试**(每个模块独立):
- `pdf.rs`:用 `tests/fixtures/sample.pdf`(文本型)验证提取结果
- `pdf.rs`:用 `tests/fixtures/scanned.pdf`(扫描版)验证返回 `Scanned`
- `docx.rs`:用 `tests/fixtures/sample.docx` 验证段落拼接
- `model_downloader.rs`:mock HTTP 请求,验证重试逻辑与 SHA256 校验

**集成测试**:
- `parse_source_file` 命令对文本型 PDF 返回正确文本
- `parse_source_file` 命令对扫描版 PDF(不启用 OCR)返回 SOURCE_OCR_REQUIRED 错误
- `parse_source_file` 命令对 .docx 返回正确文本

### 5.2 前端测试

**SourceService 扩展测试**(`src/services/source/SourceService.pdf.test.ts` 新建):

mock 策略:
- `vi.mock('@/services/source/SourceParser')` mock `parseSourceFile`
- `vi.mock('@tauri-apps/plugin-dialog')` mock `open` 返回固定路径
- 用 `seedTable` 走真实 sourceRepository

测试用例:
1. 导入 PDF:dialog 返回 sample.pdf → mock parseSourceFile 返回 ParsedSource → 验证 insertSource / updateSourceProcessingStatus 调用顺序(pending → parsing → parsed → ready)
2. 导入 docx:同上
3. 导入 PDF 解析失败:mock parseSourceFile reject → 验证 status 更新为 failed,返回 SOURCE_PARSE_FAILED
4. 导入扫描版 PDF 且 OCR 失败:mock parseSourceFile reject('SOURCE_OCR_REQUIRED') 或 reject OCR 错误 → 验证错误码
5. 导入 txt:走原流程,不应调用 parseSourceFile
6. 导入空 PDF:mock 返回 text='' → 验证返回 SOURCE_EMPTY_TEXT

### 5.3 手工验收测试

| 场景 | 预期 |
|---|---|
| 导入文本型 PDF | 状态 pending → parsing → parsed → ready,raw_text 有内容,可生成卡片 |
| 导入扫描版 PDF(首次) | 提示下载 OCR 模型,下载完成后 OCR 识别,最终 ready |
| 导入扫描版 PDF(模型已就绪) | 直接 OCR 识别,无下载提示 |
| 导入 .docx | 状态 pending → parsing → parsed → ready,raw_text 有内容 |
| 导入加密 PDF | 返回 SOURCE_PARSE_FAILED,提示「PDF 加密,请先解密」 |
| 导入损坏的 docx | 返回 SOURCE_PARSE_FAILED |
| 导入 .doc 旧格式 | dialog 不允许选择(扩展名过滤),或返回 FILE_TYPE_UNSUPPORTED |
| 重启客户端后资料仍在 | DB 持久化,raw_text 与 chunks 完整 |

---

## 六、假设与决策

### 6.1 假设

1. **pdf-extract 对中文 PDF 支持良好**:pdf-extract 基于 pdf.rs,对嵌入字体的中文 PDF 提取效果取决于字体编码。若字体未嵌入,可能提取乱码 → 这种情况由 OCR 兜底
2. **paddle-ocr-rs 0.6.1 API 稳定**:基于文档示例,API 风格为 `PaddleOcr::new(params)?.ocr(img)`
3. **PDFium 跨平台二进制可用**:pdfium-render 提供 `pdfium-render::binding` 自动下载 native 库,Windows/macOS/Linux 均有预编译
4. **AppData 目录可写**:Tauri 的 `app_data_dir()` 在 Windows 为 `%APPDATA%/<bundle>`,用户有写权限

### 6.2 决策

1. **不引入任务队列**:MVP 同步解析,大文件解析时 UI 显示 loading。后续若解析耗时 >30s 再引入后台任务
2. **OCR 模型不打包到安装包**:避免安装包过大(增加 ~25MB),首次使用时下载
3. **PDF 渲染 DPI = 150**:平衡 OCR 准确率与内存占用(300 DPI 内存占用是 150 的 4 倍)
4. **保留 pdf-extract 失败时的 OCR 兜底**:即使文本提取报错(非空但乱码),也尝试 OCR
5. **不实现 OCR 进度回调**:MVP 阶段 OCR 一次性返回结果,不细分进度。后续可加 Tauri event

---

## 七、风险与缓解

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| paddle-ocr-rs 在 Windows 编译失败 | 阻断 | 提前在干净环境验证编译,若失败改用 ocr-rs(MNN)作为备选 |
| PDFium native 库跨平台问题 | 阻断 | pdfium-render 自带库管理,失败时回退为「仅支持文本型 PDF」 |
| OCR 模型下载源(GitHub)国内访问慢 | 体验差 | 提供百度 CDN 备用源,失败时引导用户手动下载 |
| 大 PDF(>100 页)解析耗时长 | 体验差 | UI 显示进度条(页码 / 总页数),超时阈值 5 分钟 |
| 安装包体积增加 | 体验差 | ONNX Runtime + 依赖增加 ~50MB,在 README 中说明 |
| pdf-extract 对部分 PDF 提取乱码 | 功能降级 | 检测乱码比例(非 ASCII 字符占比),超阈值自动转 OCR |

---

## 八、技术债记录

| 编号 | 项 | 产生原因 | 后续修复建议 | 优先级 |
|---|---|---|---|---|
| TD-002 | OCR 模型固定 PP-OCRv4 | MVP 速度 | 后续支持 PP-OCRv5 / PaddleOCR-VL | 低 |
| TD-003 | PDF 解析不保留版面结构 | MVP 速度 | 引入 pdf-table-extract 支持表格 | 中 |
| TD-004 | 不支持 .doc 旧格式 | docx-rs 仅支持 .docx | 引入 libreoffice 命令行转换 | 低 |
| TD-005 | OCR 无进度回调 | MVP 速度 | 用 Tauri event 推送进度 | 中 |
| TD-006 | 解析同步阻塞 | MVP 速度 | 引入 task 表 + 后台 worker | 中(大文件场景) |

---

## 九、实施顺序

### 阶段 1:Rust 端基础解析(无 OCR)

1. 更新 `Cargo.toml` 引入 pdf-extract + docx-rs
2. 新建 `source_parser/types.rs`、`mod.rs`、`pdf.rs`、`docx.rs`
3. 在 `lib.rs` 注册 `parse_source_file` 命令
4. 编写 Rust 单元测试(用 fixtures 文件)
5. 验证:`cargo test` 通过

### 阶段 2:前端接入

1. 更新 `errors.ts`(错误码 + 文案)
2. 新建 `src/types/source.ts`(ParsedSource 类型)
3. 新建 `src/services/source/SourceParser.ts`
4. 改造 `SourceService.importFile`(分流解析、状态流转)
5. 重构 `createChunksFromText` → `splitIntoChunks` + `createChunksFromParsed`
6. 编写前端测试
7. 验证:`npx vitest run` 通过

### 阶段 3:OCR 集成(独立模块,可降级)

1. 更新 `Cargo.toml` 引入 paddle-ocr-rs + pdfium-render + image + reqwest + tokio + tempfile
2. 新建 `source_parser/model_downloader.rs`
3. 新建 `source_parser/ocr.rs`
4. 在 `mod.rs` 的 `parse_pdf` 中接入 OCR 兜底
5. 编写 OCR 集成测试(需真实模型文件,标记为 ignored)
6. 验证:`cargo test -- --ignored` 通过

### 阶段 4:集成与手工验收

1. 启动客户端,导入各类型文件
2. 验证状态流转、错误提示、数据持久化
3. 验证重启后数据完整
4. 更新进度文档

---

## 十、验证步骤

### 10.1 自动化测试

```bash
# Rust 端
cd src-tauri && cargo test

# 前端
npx vitest run src/services/source

# 类型检查
npx tsc --noEmit
```

### 10.2 手工验收清单

- [ ] 导入文本型 PDF,raw_text 有内容,可生成卡片
- [ ] 导入扫描版 PDF,首次触发模型下载,OCR 成功后 raw_text 有内容
- [ ] 导入 .docx,raw_text 有内容
- [ ] 导入加密 PDF,返回友好错误提示
- [ ] 导入 .doc,dialog 不允许选择
- [ ] 解析失败时,status 正确流转到 failed
- [ ] 重启客户端后,资料和 chunks 完整
- [ ] 大 PDF(>50 页)解析时 UI 不卡死(显示 loading)

### 10.3 进度更新模板

```
卡片编号:#2
当前状态:开发中
已完成内容:Rust 端 pdf-extract + docx-rs 接入,前端 importFile 改造
未完成内容:OCR 集成,集成测试
测试结果:Rust 单元测试通过,前端测试通过
遗留问题:OCR 模型下载源稳定性待验证
技术债:TD-002 ~ TD-006
是否阻塞:否
下一步:阶段 3 OCR 集成
```

---

## 十一、文档更新

完成实施后需更新:
- `docs/02_产品需求/资料导入流程.md`(若存在)— 补充 PDF/Word 支持
- `README.md` — 在功能列表中补充 PDF/Word 解析
- `src/constants/errors.ts` 顶部注释 — 补充新增错误码说明

---

## 十二、回滚方案

若 OCR 集成阶段受阻(编译失败 / 模型下载不可用),可独立回滚阶段 3:

1. 在 `Cargo.toml` 注释掉 paddle-ocr-rs / pdfium-render 依赖
2. 在 `source_parser/mod.rs` 的 `parse_pdf` 中,将 OCR 兜底改为直接返回 `SOURCE_OCR_REQUIRED` 错误
3. 前端文案回退为「扫描版 PDF 暂不支持,请转换后重试」

阶段 1、2 的 PDF/Word 文本提取能力不受影响。
