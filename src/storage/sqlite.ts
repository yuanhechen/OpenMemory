import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3');
type SqliteDatabase = ReturnType<typeof BetterSqlite3>;

import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {
  CREATE_CHUNKS_TABLE,
  CREATE_CHUNKS_FTS_TABLE,
  CREATE_FILE_META_TABLE,
  CREATE_META_TABLE,
  CREATE_INDEXES,
  ChunkRecord,
  FileMetaRecord,
  ChunkSearchResult,
} from './schema.js';

/**
 * SQLite 数据库封装
 */
export class Database {
  private dbPath: string;
  private db?: SqliteDatabase;
  private vecEnabled = false;
  private vectorDimensions: number;

  constructor(dbPath: string, vectorDimensions: number = 768) {
    this.dbPath = dbPath;
    this.vectorDimensions = vectorDimensions;
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    // 确保目录存在
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

    // 打开数据库
    this.db = new BetterSqlite3(this.dbPath);

    // 启用 WAL 模式以提高性能
    this.db.pragma('journal_mode = WAL');

    // 尝试加载 sqlite-vec 扩展
    await this.loadVecExtension();

    // 创建表
    await this.createTables();
  }

  /**
   * 尝试加载 sqlite-vec 扩展
   */
  private async loadVecExtension(): Promise<void> {
    if (!this.db) return;

    try {
      // 尝试加载 sqlite-vec
      // 注意：这需要 sqlite-vec 包被正确安装
      const sqliteVec = require('sqlite-vec');
      sqliteVec.load(this.db);
      this.vecEnabled = true;
    } catch {
      console.warn('Warning: sqlite-vec not available, vector search disabled');
      this.vecEnabled = false;
    }
  }

  /**
   * 创建数据库表
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // 创建主表
    this.db.exec(CREATE_CHUNKS_TABLE);

    // 创建 FTS 表
    this.db.exec(CREATE_CHUNKS_FTS_TABLE);

    // 创建文件元数据表
    this.db.exec(CREATE_FILE_META_TABLE);

    // 创建系统元数据表
    this.db.exec(CREATE_META_TABLE);

    // 创建索引
    this.db.exec(CREATE_INDEXES);

    // 如果 sqlite-vec 可用，创建向量表
    if (this.vecEnabled) {
      try {
        // 检查现有表的维度是否匹配
        const existingTable = this.db.prepare(`
          SELECT sql FROM sqlite_master WHERE type='table' AND name='chunks_vec'
        `).get() as { sql: string } | undefined;
        
        if (existingTable) {
          // 提取现有维度
          const dimMatch = existingTable.sql.match(/FLOAT\[(\d+)\]/);
          const existingDim = dimMatch ? parseInt(dimMatch[1], 10) : 768;
          
          if (existingDim !== this.vectorDimensions) {
            console.log(`Recreating vector table: ${existingDim} -> ${this.vectorDimensions} dimensions`);
            this.db.exec('DROP TABLE IF EXISTS chunks_vec');
            this.db.exec(`
              CREATE VIRTUAL TABLE chunks_vec USING vec0(
                id TEXT PRIMARY KEY,
                embedding FLOAT[${this.vectorDimensions}]
              )
            `);
          }
        } else {
          this.db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
              id TEXT PRIMARY KEY,
              embedding FLOAT[${this.vectorDimensions}]
            )
          `);
        }
      } catch (error) {
        console.warn('Warning: Failed to create vector table:', error);
        this.vecEnabled = false;
      }
    }
  }

  /**
   * 插入 Chunk
   */
  async insertChunk(chunk: ChunkRecord): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    const id = chunk.id || this.generateChunkId(chunk.path, chunk.startLine, chunk.endLine);

    // 插入主表
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chunks 
      (id, path, start_line, end_line, text, hash, embedding, model, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const embeddingBlob = chunk.embedding
      ? Buffer.from(new Float32Array(chunk.embedding).buffer)
      : null;

    stmt.run(
      id,
      chunk.path,
      chunk.startLine,
      chunk.endLine,
      chunk.text,
      chunk.hash,
      embeddingBlob,
      chunk.model,
      chunk.source ?? 'memory',
      chunk.createdAt ?? now,
      now
    );

    // 如果向量可用，插入向量表
    if (this.vecEnabled && chunk.embedding) {
      try {
        const vecStmt = this.db.prepare(`
          INSERT OR REPLACE INTO chunks_vec (id, embedding)
          VALUES (?, ?)
        `);
        vecStmt.run(id, embeddingBlob);
      } catch (error) {
        console.warn('Warning: Failed to insert vector:', error);
      }
    }
  }

  /**
   * 删除指定路径的所有 Chunks
   */
  async deleteChunksByPath(filePath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // 获取要删除的 IDs
    const ids = this.db
      .prepare('SELECT id FROM chunks WHERE path = ?')
      .all(filePath) as { id: string }[];

    // 从主表删除
    this.db.prepare('DELETE FROM chunks WHERE path = ?').run(filePath);

    // 从向量表删除
    if (this.vecEnabled && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      try {
        this.db
          .prepare(`DELETE FROM chunks_vec WHERE id IN (${placeholders})`)
          .run(...ids.map((r) => r.id));
      } catch {
        // 忽略向量表删除错误
      }
    }
  }

  /**
   * 向量搜索
   */
  async searchVector(
    queryEmbedding: number[],
    limit: number
  ): Promise<ChunkSearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    if (!this.vecEnabled) {
      return [];
    }

    try {
      const queryBlob = Buffer.from(new Float32Array(queryEmbedding).buffer);

      const results = this.db
        .prepare(
          `
          SELECT 
            c.id,
            c.path,
            c.start_line as startLine,
            c.end_line as endLine,
            c.text,
            vec_distance_cosine(v.embedding, ?) as distance
          FROM chunks_vec v
          JOIN chunks c ON c.id = v.id
          ORDER BY distance ASC
          LIMIT ?
        `
        )
        .all(queryBlob, limit) as Array<ChunkSearchResult & { distance: number }>;

      // 将距离转换为相似度分数 (1 - distance)
      return results.map((r) => ({
        id: r.id,
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        text: r.text,
        score: 1 - r.distance,
      }));
    } catch (error) {
      console.warn('Vector search failed:', error);
      return [];
    }
  }

  /**
   * 关键词搜索 (BM25)
   */
  async searchKeyword(
    query: string,
    limit: number
  ): Promise<ChunkSearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const results = this.db
        .prepare(
          `
          SELECT 
            c.id,
            c.path,
            c.start_line as startLine,
            c.end_line as endLine,
            c.text,
            bm25(chunks_fts) as score
          FROM chunks_fts fts
          JOIN chunks c ON c.id = fts.id
          WHERE chunks_fts MATCH ?
          ORDER BY score ASC
          LIMIT ?
        `
        )
        .all(query, limit) as ChunkSearchResult[];

      // BM25 分数是负数，越小越好，转换为正数
      return results.map((r) => ({
        ...r,
        score: Math.abs(r.score),
      }));
    } catch {
      return [];
    }
  }

  /**
   * 更新文件元数据
   */
  async updateFileMeta(meta: FileMetaRecord): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db
      .prepare(
        `
        INSERT OR REPLACE INTO file_meta (path, hash, mtime, indexed_at)
        VALUES (?, ?, ?, ?)
      `
      )
      .run(meta.path, meta.hash, meta.mtime, meta.indexedAt);
  }

  /**
   * 获取文件元数据
   */
  async getFileMeta(filePath: string): Promise<FileMetaRecord | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db
      .prepare('SELECT * FROM file_meta WHERE path = ?')
      .get(filePath) as FileMetaRecord | undefined;

    return result ?? null;
  }

  /**
   * 删除文件元数据
   */
  async deleteFileMeta(filePath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.prepare('DELETE FROM file_meta WHERE path = ?').run(filePath);
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    filesCount: number;
    chunksCount: number;
    lastSync: number | null;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const filesCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM file_meta').get() as {
        count: number;
      }
    ).count;

    const chunksCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM chunks').get() as {
        count: number;
      }
    ).count;

    const lastSync = (
      this.db
        .prepare('SELECT MAX(indexed_at) as last FROM file_meta')
        .get() as { last: number | null }
    ).last;

    return { filesCount, chunksCount, lastSync };
  }

  /**
   * 清空所有数据
   */
  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec('DELETE FROM chunks');
    this.db.exec('DELETE FROM file_meta');
    
    if (this.vecEnabled) {
      try {
        this.db.exec('DELETE FROM chunks_vec');
      } catch {
        // 忽略错误
      }
    }
  }

  /**
   * 检查是否支持向量搜索
   */
  isVecEnabled(): boolean {
    return this.vecEnabled;
  }

  /**
   * 关闭数据库
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  /**
   * 生成 Chunk ID
   */
  private generateChunkId(
    filePath: string,
    startLine: number,
    endLine: number
  ): string {
    const data = `${filePath}:${startLine}:${endLine}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }
}
