import chokidar, { FSWatcher } from 'chokidar';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Workspace } from '../core/workspace.js';
import { Database } from '../storage/sqlite.js';
import { EmbeddingProvider } from '../embedding/provider.js';
import { Chunker, hashText } from './chunker.js';

/**
 * 文件监听器
 */
export class FileWatcher {
  private workspace: Workspace;
  private db: Database;
  private embedder: EmbeddingProvider;
  private chunker: Chunker;
  private debounceMs: number;
  private watcher?: FSWatcher;
  private pendingSync: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    workspace: Workspace,
    db: Database,
    embedder: EmbeddingProvider,
    chunker: Chunker,
    debounceMs: number
  ) {
    this.workspace = workspace;
    this.db = db;
    this.embedder = embedder;
    this.chunker = chunker;
    this.debounceMs = debounceMs;
  }

  /**
   * 启动文件监听
   */
  async start(): Promise<void> {
    const patterns = [
      path.join(this.workspace.path, '*.md'),
      path.join(this.workspace.path, 'memory', '*.md'),
    ];

    this.watcher = chokidar.watch(patterns, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher.on('add', (filePath) => this.handleFileChange(filePath));
    this.watcher.on('change', (filePath) => this.handleFileChange(filePath));
    this.watcher.on('unlink', (filePath) => this.handleFileDelete(filePath));
  }

  /**
   * 停止文件监听
   */
  async stop(): Promise<void> {
    // 清除所有待处理的同步
    for (const timeout of this.pendingSync.values()) {
      clearTimeout(timeout);
    }
    this.pendingSync.clear();

    // 关闭 watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }
  }

  /**
   * 处理文件变化
   */
  private handleFileChange(filePath: string): void {
    // 防抖处理
    const existing = this.pendingSync.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(async () => {
      this.pendingSync.delete(filePath);
      await this.syncFile(filePath);
    }, this.debounceMs);

    this.pendingSync.set(filePath, timeout);
  }

  /**
   * 处理文件删除
   */
  private async handleFileDelete(filePath: string): Promise<void> {
    // 取消待处理的同步
    const existing = this.pendingSync.get(filePath);
    if (existing) {
      clearTimeout(existing);
      this.pendingSync.delete(filePath);
    }

    // 从索引中删除
    await this.db.deleteChunksByPath(filePath);
    await this.db.deleteFileMeta(filePath);
  }

  /**
   * 同步单个文件
   */
  async syncFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const newHash = hashText(content);

      // 检查是否需要更新
      const existing = await this.db.getFileMeta(filePath);
      if (existing?.hash === newHash) {
        return; // 内容未变，跳过
      }

      // 删除旧 Chunks
      await this.db.deleteChunksByPath(filePath);

      // 重新分块并索引
      const chunks = await this.chunker.chunk(content, filePath);
      
      for (const chunk of chunks) {
        const embedding = await this.embedder.generate(chunk.text);
        await this.db.insertChunk({
          id: '',
          ...chunk,
          embedding,
          model: this.embedder.name,
        });
      }

      // 更新文件元数据
      const stat = await fs.stat(filePath);
      await this.db.updateFileMeta({
        path: filePath,
        hash: newHash,
        mtime: stat.mtimeMs,
        indexedAt: Date.now(),
      });
    } catch (error) {
      console.error(`Failed to sync file ${filePath}:`, error);
    }
  }
}
