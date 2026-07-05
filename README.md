# 知墨

知墨是一款面向长文本创作的 AI 原生写作项目系统。它采用本地优先的桌面客户端形态，将资料导入、知识整理、大纲组织、正文写作、AI 协作与多格式导出放进同一个项目工作流。

> 当前版本为单用户 MVP，界面与文档以中文为主。项目仍在持续开发中，请勿将其直接用于关键生产数据。

## 核心能力

- 项目管理：创建普通项目、引导式创建项目，以及从已有文档创建项目。
- 文档写作：基于 TipTap 的富文本编辑器，支持自动保存、字数统计、公式、图表、脚注、引用和交叉引用。
- 资料管理：导入并解析纯文本、Markdown、PDF 和 Word 文档，生成可用于写作的资料内容。
- 卡片与大纲：沉淀写作卡片，组织层级大纲，并通过智能助手辅助完善内容。
- 知识库：提取、管理和追踪知识条目及其版本关系。
- AI 协作：通过 OpenAI-compatible 模型服务生成上下文快照、记录执行过程，并由用户决定是否采纳结果。
- 论文写作：管理参考文献、GB/T 7714 格式化、公式、图表和论文完整性检查。
- 内容导出：支持 Markdown、纯文本、Word 和 LaTeX 等格式。
- 本地优先：业务数据保存在本地 SQLite 数据库中，API Key 在本地加密存储。

## 技术栈

- 桌面客户端：Tauri 2
- 前端：React 18、TypeScript、Vite
- 编辑器：TipTap / ProseMirror
- 状态管理：Zustand、TanStack Query
- 样式：Tailwind CSS
- 图标：Heroicons 24px Outline
- 本地数据库：SQLite
- 后端能力：Rust
- 测试：Vitest、Testing Library

## 环境要求

基础开发需要：

- Node.js 18 或更高版本
- npm 9 或更高版本

运行或构建桌面客户端还需要：

- Rust 1.77 或更高版本
- Tauri 2 对应的系统依赖
- Windows 开发环境中的 WebView2

不同操作系统所需的原生依赖有所不同，请参考 [Tauri 前置依赖文档](https://v2.tauri.app/start/prerequisites/)。

## 快速开始

克隆仓库并安装依赖：

```bash
git clone https://github.com/longchuanxie/zhimo.git
cd zhimo
npm install
```

启动桌面客户端：

```bash
npm run dev:tauri
```

只启动前端调试服务器：

```bash
npm run dev
```

前端开发服务器默认运行在 `http://localhost:1420`。只使用浏览器调试时，文件系统、SQLite、系统对话框等 Tauri 原生能力可能不可用。

## 模型配置

知墨通过 OpenAI-compatible 接口接入模型。启动应用后，在“模型设置”中填写服务地址、模型名称和 API Key。

API Key 仅应通过应用内配置：

- 不要写入源码、环境示例或日志；
- 不要提交到 Git；
- 不会加入 Agent 上下文或导出文件；
- UI 中只应显示掩码。

## 常用命令

```bash
# TypeScript 类型检查
npm run typecheck

# 运行全部测试
npm run test

# 监听模式运行测试
npm run test:watch

# 生成覆盖率报告
npm run test:coverage

# 构建前端
npm run build

# 构建桌面安装包
npm run build:tauri
```

## 项目结构

```text
src/
  components/    可复用 UI 组件
  constants/     状态、文案、图标与错误定义
  features/      按业务领域组织的页面与功能
  hooks/         可复用 React 工作流
  services/      数据库、文件、模型与业务服务
  stores/        全局状态
  types/         统一领域类型
  utils/         通用工具
src-tauri/
  migrations/    SQLite 数据库迁移
  src/           Rust 命令与原生能力
  capabilities/  Tauri 权限配置
ai_writing_development_startup_package_v1_0/
                产品、交互、架构与开发规范
```

前端组件不得直接访问数据库、文件系统或模型接口。调用路径应遵循：

```text
页面 / 组件 → Hook / Store → Service → Repository / Gateway → 本地能力
```

## 数据与隐私

- 项目数据默认保存在客户端本地。
- SQLite 数据库、运行日志、构建产物和本地 AppData 不应提交到仓库。
- 在升级或尝试开发版本前，请自行备份重要项目数据。
- AI 功能会把用户确认的上下文发送给所配置的模型服务，请根据服务提供方的隐私政策谨慎使用。

## 开发协作

参与开发前请先阅读 [AGENTS.md](./AGENTS.md)。项目要求所有任务依次经过需求理解、方案设计、编码、代码审核、测试和进度更新，并将可维护性作为与功能正确性同等级的验收标准。

提交信息格式：

```text
type(scope): 中文说明
```

示例：

```text
feat(source): 支持 Markdown 资料导入
fix(agent): 修复上下文快照遗漏
docs(readme): 完善项目使用说明
```

## 当前状态

项目处于 MVP 开发阶段。部分功能和交互仍在持续完善，具体设计、任务拆分和技术债记录可查看仓库内的开发文档。

## 许可证

本项目基于 [GNU General Public License v3.0](./LICENSE) 发布。
