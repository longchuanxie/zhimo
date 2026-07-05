# 编辑器技术方案：TipTap / ProseMirror v1.0

## 1. 目标

实现面向长文本写作的结构化编辑器，支持：

```text
标题
正文
引用
列表
代码块，P1
脚注，P1
引用标记，P1
选区 AI 操作
自动保存
AI 修改对比
```

---

## 2. 推荐方案

```text
TipTap 作为 React 编辑器封装
ProseMirror 作为底层文档模型
```

原因：

- 结构化 JSON 文档模型；
- 可扩展节点和 mark；
- 适合实现选区操作；
- 与 AI diff / 局部替换更匹配；
- 社区成熟。

---

## 3. 文档存储

Document 表中双存储：

```text
content_json
plain_text
```

### content_json

保存 TipTap JSON。

### plain_text

用于：

- 搜索；
- 字数统计；
- ContextPack 组装；
- 导出；
- 预览。

---

## 4. MVP Schema

节点：

```text
doc
paragraph
heading
blockquote
bulletList
orderedList
listItem
horizontalRule
```

Mark：

```text
bold
italic
code
link
```

P1：

```text
citation
footnote
comment
image
table
```

---

## 5. 自动保存策略

触发条件：

```text
编辑器内容变化
debounce 1000ms
窗口失焦
切换文档
关闭客户端前
```

保存内容：

```ts
{
  contentJson,
  plainText,
  wordCount,
  clientRevision
}
```

---

## 6. 选区数据结构

```ts
type EditorSelection = {
  documentId: string
  from: number
  to: number
  selectedText: string
  surroundingTextBefore?: string
  surroundingTextAfter?: string
}
```

选区 AI 操作必须传入 ContextService。

---

## 7. SelectionFloatingMenu

动作：

```text
改写
扩写
缩写
检查来源
保存为卡片
保存为知识
```

调用链：

```text
用户选中文本
  ↓
打开选区菜单
  ↓
ContextService.previewContext
  ↓
AgentService.sendMessage
  ↓
AIDiffPreview
```

---

## 8. AI 修改应用

AI 修改不得直接覆盖正文。

必须：

```text
生成修改建议
展示修改前后对比
用户点击接受
写回编辑器
自动保存
```

---

## 9. AIDiffPreview

输入：

```ts
type AIDiffPreviewInput = {
  before: string
  after: string
  explanation?: AgentExplanation
}
```

输出动作：

```text
接受修改
拒绝
继续修改
保存为卡片
保存为知识
```

---

## 10. 字数统计

中文建议：

```text
中文字符数 + 英文词数
```

MVP 可先使用简单规则：

```ts
const zhChars = text.match(/[\u4e00-\u9fa5]/g)?.length ?? 0
const nonZhWords = text.replace(/[\u4e00-\u9fa5]/g, ' ').trim().split(/\s+/).filter(Boolean).length
wordCount = zhChars + nonZhWords
```

---

## 11. 可维护性要求

编辑器相关逻辑必须拆分：

```text
Editor.tsx
EditorToolbar.tsx
SelectionFloatingMenu.tsx
AutosaveIndicator.tsx
AIDiffPreview.tsx
useEditorAutosave.ts
useEditorSelection.ts
editorToPlainText.ts
editorWordCount.ts
```

禁止在 DocumentEditorPage 中堆所有逻辑。
