# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-02-03

### Added

- 🎉 初始版本发布
- 🗂️ 基于 Markdown 文件的记忆存储系统
- 🔍 混合搜索引擎（向量 70% + BM25 30%）
- 💾 SQLite + sqlite-vec 本地向量数据库
- 🤖 Auto-Capture 自动记忆捕获
- 🔍 Auto-Recall 自动记忆召回
- 🔌 多嵌入服务支持
  - Ollama（本地推荐）
  - OpenAI
  - Gemini
  - vLLM（通过 OpenAI 兼容 API）
- 🖥️ CLI 命令行工具
  - `openmemory init` - 初始化工作区
  - `openmemory status` - 查看状态
  - `openmemory search` - 搜索记忆
  - `openmemory doctor` - 诊断问题
  - `openmemory index` - 重建索引
  - `openmemory serve` - 启动 HTTP API
- 🌐 HTTP API 服务
- 📝 工作区模板（MEMORY.md, USER.md, PROJECT.md）
- 📖 完整的设计文档和使用说明

### Technical

- TypeScript 5.9 + ESM 模块
- Node.js >= 20
- better-sqlite3 + sqlite-vec
- 动态向量维度支持（768/1024/1536/3072）

### Tested

- ✅ vLLM 推理服务集成（Qwen3-0.6B）
- ✅ vLLM 嵌入服务集成（Qwen3-Embedding-0.6B, 1024 维）
- ✅ 完整的集成测试通过
