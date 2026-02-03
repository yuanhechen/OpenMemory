/**
 * openmemory - 透明、本地优先的 LLM 记忆增强引擎
 * 
 * @packageDocumentation
 */

// 核心引擎
export { OpenMemory, createOpenMemory, SearchResult, SearchOptions } from './core/engine.js';
export { OpenMemoryConfig, loadConfig, saveConfig, getDefaultConfig } from './core/config.js';
export { Workspace, BOOTSTRAP_FILES } from './core/workspace.js';

// 存储层
export { Database } from './storage/sqlite.js';
export { ChunkRecord, FileMetaRecord, ChunkSearchResult } from './storage/schema.js';

// 处理层
export { Chunker, Chunk, ChunkOptions, hashText } from './processing/chunker.js';
export { FileWatcher } from './processing/watcher.js';
export { Sync, SyncResult } from './processing/sync.js';

// 嵌入模块
export { 
  EmbeddingProvider, 
  EmbeddingConfig, 
  createEmbeddingProvider,
  MODEL_DIMENSIONS,
} from './embedding/provider.js';
export { OllamaEmbeddingProvider } from './embedding/ollama.js';
export { OpenAIEmbeddingProvider } from './embedding/openai.js';
export { GeminiEmbeddingProvider } from './embedding/gemini.js';

// 搜索模块
export { HybridSearch, HybridSearchResult, HybridSearchOptions, SearchConfig } from './search/hybrid.js';
export { VectorSearch } from './search/vector.js';
export { KeywordSearch } from './search/keyword.js';

// 压缩模块
export { Compactor, CompactResult, CompactParams, CompactConfig, Message } from './compaction/compactor.js';
export { Summarizer } from './compaction/summarizer.js';

// 工具
export { 
  memorySearch, 
  MemorySearchParams, 
  MemorySearchToolResult,
  memorySearchToolDefinition,
} from './tools/memory-search.js';
export { 
  memoryGet, 
  MemoryGetParams, 
  MemoryGetToolResult,
  memoryGetToolDefinition,
} from './tools/memory-get.js';

// API 服务
export { APIServer, startAPIServer, ServerConfig } from './api/server.js';

// 模板
export { loadTemplates, getTemplate } from './templates/loader.js';

// 自动记忆系统
export {
  AutoMemory,
  AutoMemoryConfig,
  DEFAULT_AUTO_MEMORY_CONFIG,
  MemoryCapture,
  CapturedMemory,
  MemoryCategory,
  CaptureConfig,
  DEFAULT_CAPTURE_CONFIG,
  formatMemoryForMarkdown,
  MemoryRecall,
  RecallConfig,
  RecallResult,
  DEFAULT_RECALL_CONFIG,
  createChineseContextTemplate,
} from './memory/index.js';
