import { Database } from '../storage/sqlite.js';
import { ChunkSearchResult } from '../storage/schema.js';

/**
 * 关键词搜索模块 (BM25)
 */
export class KeywordSearch {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * 执行关键词搜索
   */
  async search(query: string, limit: number): Promise<ChunkSearchResult[]> {
    // 预处理查询以适应 FTS5 语法
    const processedQuery = this.preprocessQuery(query);
    return this.db.searchKeyword(processedQuery, limit);
  }

  /**
   * 预处理查询字符串
   */
  private preprocessQuery(query: string): string {
    // 移除特殊字符，保留中文和字母数字
    const cleaned = query
      .replace(/[^\w\u4e00-\u9fff\s]/g, ' ')
      .trim();

    // 对于多个词，使用 OR 连接
    const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
    
    if (words.length === 0) {
      return query;
    }

    if (words.length === 1) {
      return `"${words[0]}"*`;
    }

    // 使用 OR 连接多个词
    return words.map((w) => `"${w}"*`).join(' OR ');
  }
}
