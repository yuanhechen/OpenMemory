import path from 'node:path';
import fs from 'node:fs/promises';
import { Workspace } from '../core/workspace.js';
import { Database } from '../storage/sqlite.js';
import { EmbeddingProvider } from '../embedding/provider.js';
import { Chunker, hashText } from './chunker.js';

/**
 * 增量同步器
 */
export class Sync {
  private workspace: Workspace;
  private db: Database;
  private embedder: EmbeddingProvider;
  private chunker: Chunker;

  constructor(
    workspace: Workspace,
    db: Database,
    embedder: EmbeddingProvider,
    chunker: Chunker
  ) {
    this.workspace = workspace;
    this.db = db;
    this.embedder = embedder;
    this.chunker = chunker;
  }

  /**
   * 执行完整同步
   */
  async fullSync(): Promise<SyncResult> {
    const result: SyncResult = {
      filesProcessed: 0,
      filesSkipped: 0,
      chunksCreated: 0,
      errors: [],
    };

    const files = await this.workspace.getMarkdownFiles();

    for (const filePath of files) {
      try {
        const syncResult = await this.syncFile(filePath);
        if (syncResult.skipped) {
          result.filesSkipped++;
        } else {
          result.filesProcessed++;
          result.chunksCreated += syncResult.chunksCreated;
        }
      } catch (error) {
        result.errors.push({
          path: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * 同步单个文件
   */
  async syncFile(
    filePath: string
  ): Promise<{ skipped: boolean; chunksCreated: number }> {
    const content = await fs.readFile(filePath, 'utf-8');
    const newHash = hashText(content);

    // 检查是否需要更新
    const existing = await this.db.getFileMeta(filePath);
    if (existing?.hash === newHash) {
      return { skipped: true, chunksCreated: 0 };
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

    return { skipped: false, chunksCreated: chunks.length };
  }

  /**
   * 清理孤立的索引记录
   */
  async cleanOrphans(): Promise<number> {
    // 获取所有现存文件
    const files = new Set(await this.workspace.getMarkdownFiles());

    // 这里需要实现获取所有索引文件路径的方法
    // 暂时返回 0
    return 0;
  }
}

/**
 * 同步结果
 */
export interface SyncResult {
  filesProcessed: number;
  filesSkipped: number;
  chunksCreated: number;
  errors: Array<{ path: string; error: string }>;
}
