# 代码可维护性规范

## 1. 总原则

可维护性是 P0 验收项。

功能可用但不可维护，不得合并，不得标记完成。

---

## 2. 代码组织

必须遵守：

```text
页面负责组合
组件负责展示
Hook 负责状态
Service 负责业务
Repository 负责数据
Gateway 负责外部能力
```

---

## 3. 拆分阈值

超过以下阈值必须评估拆分：

| 项 | 阈值 |
|---|---:|
| 单组件 | 250 行 |
| 单函数 | 80 行 |
| 单文件 | 400 行 |
| props 数量 | 12 个 |
| 嵌套层级 | 5 层 |
| 重复逻辑 | 2 次以上 |

---

## 4. 命名要求

命名必须表达业务含义。

推荐：

```text
ContextPackPreview
SourceParseProgress
AgentOutputActions
createDocumentFromOutlineNode
```

不推荐：

```text
Panel
Box
Data
handleClick2
doSomething
```

---

## 5. 技术债记录

技术债必须记录：

```text
编号
位置
原因
影响
后续处理建议
优先级
```

---

## 6. 审核门禁

代码审核必须检查：

- 是否职责单一；
- 是否低耦合；
- 是否避免重复；
- 是否类型明确；
- 是否错误处理统一；
- 是否文案集中管理；
- 是否状态枚举集中管理；
- 是否可测试；
- 是否便于未来替换实现。
