-- 003: ContextPack 存储完整 entries JSON
-- 用于 sendMessage 失败后调用 ContextCompactor 进行结构化压缩
ALTER TABLE context_packs ADD COLUMN entries_json TEXT;
