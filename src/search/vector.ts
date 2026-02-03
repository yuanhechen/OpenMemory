import { Database } from '../storage/sqlite.js';
import { ChunkSearchResult } from '../storage/schema.js';

/**
 * 向量搜索模块
 */
export class VectorSearch {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * 执行向量搜索
   */
  async search(
    queryEmbedding: number[],
    limit: number
  ): Promise<ChunkSearchResult[]> {
    return this.db.searchVector(queryEmbedding, limit);
  }
}
