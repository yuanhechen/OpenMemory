import { OpenMemoryConfig, loadConfig, saveConfig, getDefaultConfig } from './config.js';
import { Workspace } from './workspace.js';
import { Database } from '../storage/sqlite.js';
import { EmbeddingProvider, createEmbeddingProvider } from '../embedding/provider.js';
import { HybridSearch } from '../search/hybrid.js';
import { Chunker } from '../processing/chunker.js';
import { FileWatcher } from '../processing/watcher.js';
import { loadTemplates } from '../templates/loader.js';

/**
 * 搜索结果接口
 */
export interface SearchResult {
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  score: number;
  vectorScore: number;
  textScore: number;
}

/**
 * 搜索选项
 */
export interface SearchOptions {
  limit?: number;
  minScore?: number;
  sources?: ('memory' | 'sessions')[];
}

/**
 * OpenMemory 核心引擎
 */
export class OpenMemory {
  private config: OpenMemoryConfig;
  private workspace: Workspace;
  private db: Database;
  private embedder: EmbeddingProvider;
  private searcher: HybridSearch;
  private chunker: Chunker;
  private watcher?: FileWatcher;
  private initialized = false;

  constructor(config?: Partial<OpenMemoryConfig>) {
    const defaultConfig = getDefaultConfig();
    this.config = { ...defaultConfig, ...config } as OpenMemoryConfig;
    this.workspace = new Workspace(this.config.workspace);
    this.embedder = createEmbeddingProvider(this.config.embedding);
    // 传递嵌入向量维度到数据库
    this.db = new Database(this.config.storage.indexPath, this.embedder.dimensions);
    this.searcher = new HybridSearch(this.db, this.embedder, this.config.search);
    this.chunker = new Chunker(this.config.chunking);
  }

  /**
   * 初始化引擎
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 加载模板
    const templates = await loadTemplates();

    // 初始化工作区
    await this.workspace.initialize(templates);

    // 初始化数据库
    await this.db.initialize();

    // 启动文件监听
    if (this.config.sync.watchEnabled) {
      this.watcher = new FileWatcher(
        this.workspace,
        this.db,
        this.embedder,
        this.chunker,
        this.config.sync.watchDebounceMs
      );
      await this.watcher.start();
    }

    this.initialized = true;
  }

  /**
   * 搜索记忆
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    await this.ensureInitialized();
    
    return this.searcher.search(query, {
      limit: options?.limit ?? this.config.search.maxResults,
      minScore: options?.minScore ?? this.config.search.minScore,
    });
  }

  /**
   * 读取文件
   */
  async get(path: string, startLine?: number, endLine?: number): Promise<string> {
    await this.ensureInitialized();
    return this.workspace.readFile(path, startLine, endLine);
  }

  /**
   * 追加内容到文件
   */
  async append(path: string, content: string): Promise<void> {
    await this.ensureInitialized();
    await this.workspace.appendFile(path, content);
  }

  /**
   * 写入文件
   */
  async write(path: string, content: string): Promise<void> {
    await this.ensureInitialized();
    await this.workspace.writeFile(path, content);
  }

  /**
   * 重建索引
   */
  async reindex(full = false): Promise<{ filesIndexed: number; chunksCreated: number }> {
    await this.ensureInitialized();

    if (full) {
      await this.db.clearAll();
    }

    const files = await this.workspace.getMarkdownFiles();
    let totalChunks = 0;

    for (const file of files) {
      const content = await this.workspace.readFile(
        file.replace(this.workspace.path + '/', '')
      );
      const chunks = await this.chunker.chunk(content, file);
      
      for (const chunk of chunks) {
        const embedding = await this.embedder.generate(chunk.text);
        await this.db.insertChunk({
          ...chunk,
          embedding,
          model: this.embedder.name,
        });
      }
      
      totalChunks += chunks.length;
    }

    return { filesIndexed: files.length, chunksCreated: totalChunks };
  }

  /**
   * 获取状态信息
   */
  async getStatus(): Promise<{
    workspace: string;
    filesIndexed: number;
    totalChunks: number;
    embeddingProvider: string;
    embeddingModel: string;
  }> {
    await this.ensureInitialized();

    const stats = await this.db.getStats();

    return {
      workspace: this.workspace.path,
      filesIndexed: stats.filesCount,
      totalChunks: stats.chunksCount,
      embeddingProvider: this.config.embedding.provider,
      embeddingModel: this.embedder.name,
    };
  }

  /**
   * 获取配置
   */
  getConfig(): OpenMemoryConfig {
    return this.config;
  }

  /**
   * 关闭引擎
   */
  async close(): Promise<void> {
    if (this.watcher) {
      await this.watcher.stop();
    }
    await this.db.close();
    this.initialized = false;
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

/**
 * 创建 OpenMemory 实例
 */
export async function createOpenMemory(
  config?: Partial<OpenMemoryConfig>
): Promise<OpenMemory> {
  const memory = new OpenMemory(config);
  await memory.initialize();
  return memory;
}
