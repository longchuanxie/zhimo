// 数据库迁移模块
// 使用 tauri-plugin-sql 的 Migration 机制管理 SQLite schema
// 迁移按版本顺序执行，已应用的迁移不会重复执行

use tauri_plugin_sql::{Migration, MigrationKind};

/// 返回所有数据库迁移
/// 每个迁移对应一个版本号，按顺序执行
pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "初始建表：users/workspaces/projects/documents/sources 等",
            sql: include_str!("../migrations/001_initial_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "为 model_providers 添加默认模型上下文窗口大小字段",
            sql: include_str!("../migrations/002_add_model_context_length.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "为 context_packs 添加 entries_json 字段",
            sql: include_str!("../migrations/003_add_context_pack_entries.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "新增 agent_memories 表（Agent 长期记忆）",
            sql: include_str!("../migrations/004_add_agent_memories.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "论文写作扩展：参考文献库/引文/图表/公式表 + documents/sources/export_tasks 字段",
            sql: include_str!("../migrations/005_paper_writing.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "放开 export_tasks.export_format CHECK 约束,支持 latex/docx 格式(重建表)",
            sql: include_str!("../migrations/006_relax_export_format_check.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "新增 agent_pending_actions 表（Agent 工具写操作待确认）",
            sql: include_str!("../migrations/007_agent_pending_actions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "新增 agent_thread_states 表（Agent 多轮工作状态）",
            sql: include_str!("../migrations/008_agent_thread_states.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
