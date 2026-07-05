-- 005: 论文写作功能扩展
-- 新增参考文献库 / 引文实例 / 图表 / 公式 4 张表
-- 扩展 documents / sources / export_tasks 字段
-- 注:表名使用 bibliographic_references 而非 references,避免与 SQL 保留字 REFERENCES 冲突

-- 1. 扩展 documents 表:论文引用格式配置
ALTER TABLE documents ADD COLUMN citation_style TEXT NOT NULL DEFAULT 'gbt7714_2015';
-- citation_style: 'gbt7714_2015' | 'apa7' | 'ieee' | 'mla9'(MVP 仅实现 gbt7714_2015,其余预留)

-- 2. 扩展 sources 表:书目元数据(材料真实性基础,用于从资料生成参考文献)
ALTER TABLE sources ADD COLUMN bibliographic_metadata TEXT;
-- JSON 结构 BibliographicMetadata: { authors, year, title, container, entryType, volume, issue, pages, publisher, city, doi, isbn, url, accessDate }

-- 3. 扩展 export_tasks 表:导出选项(模板/字体/字号/行距/页边距/是否含图表等)
ALTER TABLE export_tasks ADD COLUMN export_options TEXT;
-- JSON 结构 ExportOptions

-- 4. 参考文献库(项目级,一个 reference 可被多个文档引用)
CREATE TABLE IF NOT EXISTS bibliographic_references (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_id TEXT,                           -- 关联本地导入的资料(可空,允许手动录入)
  citation_key TEXT NOT NULL,               -- BibTeX 风格 key,项目内唯一,如 'smith2020ai'
  entry_type TEXT NOT NULL,                 -- 'journal'|'book'|'conference'|'thesis'|'web'|'other'
  title TEXT NOT NULL,
  authors_json TEXT NOT NULL,               -- JSON: [{name, affiliation?}]
  year INTEGER,
  container TEXT,                           -- 期刊名/书名/会议名
  volume TEXT,
  issue TEXT,
  pages TEXT,
  publisher TEXT,
  city TEXT,
  doi TEXT,
  isbn TEXT,
  url TEXT,
  access_date TEXT,                         -- 电子文献访问日期
  raw_metadata TEXT,                        -- 原始书目 JSON(导入时保留)
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES sources(id),
  UNIQUE(project_id, citation_key)
);

CREATE INDEX IF NOT EXISTS idx_bib_refs_project ON bibliographic_references(project_id, is_deleted, updated_at);
CREATE INDEX IF NOT EXISTS idx_bib_refs_source ON bibliographic_references(source_id);

-- 5. 引文实例(文档内每一次引用行为,关联 reference + 文档位置)
CREATE TABLE IF NOT EXISTS citations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  citation_format TEXT NOT NULL DEFAULT 'numeric', -- 'numeric'|'author_year'
  locator TEXT,                              -- 页码/章节定位,如 'p.123' 或 'ch.4'
  prefix TEXT,                               -- 引文前缀,如 '见'
  suffix TEXT,                               -- 引文后缀,如 '第2版'
  inline_text TEXT,                          -- 解析后的行内显示文本,如 '[1]' 或 '(Smith, 2020)'
  prosemirror_pos INTEGER,                   -- TipTap 文档位置(便于回溯定位)
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (reference_id) REFERENCES bibliographic_references(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_citations_document ON citations(document_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_citations_reference ON citations(reference_id);

-- 6. 图表(figure + table 统一管理,通过 kind 区分)
CREATE TABLE IF NOT EXISTS figures (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('figure','table')),  -- figure=图片,table=表格
  number INTEGER,                           -- 自动编号(figure 与 table 各自独立序列)
  label TEXT,                               -- 用户可指定 label,如 'fig:architecture'
  caption TEXT NOT NULL,                    -- 题注(必填)
  note TEXT,                                -- 注释(可选)
  source_id TEXT,                           -- 来源资料(材料真实性,可空)
  image_path TEXT,                          -- 图片本地路径(figure)
  image_data TEXT,                          -- base64 内联(MVP 简化,小图)
  table_data TEXT,                          -- 表格 TipTap JSON(table)
  prosemirror_pos INTEGER,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES sources(id)
);

CREATE INDEX IF NOT EXISTS idx_figures_document ON figures(document_id, kind, is_deleted);
CREATE INDEX IF NOT EXISTS idx_figures_project ON figures(project_id, kind);

-- 7. 公式(块级公式编号管理;行内公式不入库,直接在 TipTap JSON 中)
CREATE TABLE IF NOT EXISTS equations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  number INTEGER,                           -- 自动编号(公式 1,2,3...)
  label TEXT,                               -- 用户指定 label,如 'eq:euler'
  latex TEXT NOT NULL,                      -- LaTeX 源码
  prosemirror_pos INTEGER,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_equations_document ON equations(document_id, is_deleted);
