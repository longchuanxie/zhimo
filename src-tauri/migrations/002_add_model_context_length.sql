-- 迁移 002：为 model_providers 添加默认模型上下文窗口大小字段
-- 用于存储模型能力信息，支持上下文自动压缩判断

ALTER TABLE model_providers ADD COLUMN default_model_context_length INTEGER;
