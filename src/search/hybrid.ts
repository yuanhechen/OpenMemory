import { Database } from '../storage/sqlite.js';
import { EmbeddingProvider } from '../embedding/provider.js';
import { VectorSearch } from './vector.js';
import { KeywordSearch } from './keyword.js';
import { ChunkSearchResult } from '../storage/schema.js';

/**
 * 搜索结果
 */
export interface HybridSearchResult {
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
export interface HybridSearchOptions {
  limit: number;
  minScore: number;
}

/**
 * 搜索配置
 */
export interface SearchConfig {
  maxResults: number;
  minScore: number;
  hybrid: {
    enabled: boolean;
    vectorWeight: number;
    textWeight: number;
    candidateMultiplier: number;
  };
}

/**
 * 混合搜索模块
 */
export class HybridSearch {
  private db: Database;
  private embedder: EmbeddingProvider;
  private vectorSearch: VectorSearch;
  private keywordSearch: KeywordSearch;
  private config: SearchConfig;

  constructor(db: Database, embedder: EmbeddingProvider, config: SearchConfig) {
    this.db = db;
    this.embedder = embedder;
    this.vectorSearch = new VectorSearch(db);
    this.keywordSearch = new KeywordSearch(db);
    this.config = config;
  }

  /**
   * 执行混合搜索
   */
  async search(
    query: string,
    options: HybridSearchOptions
  ): Promise<HybridSearchResult[]> {
    const { limit, minScore } = options;
    const candidateLimit = limit * this.config.hybrid.candidateMultiplier;

    // 1. 生成查询向量
    const queryEmbedding = await this.embedder.generate(query);

    // 2. 并行执行向量搜索和关键词搜索
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch.search(queryEmbedding, candidateLimit),
      this.keywordSearch.search(query, candidateLimit),
    ]);

    // 3. 归一化分数
    const normalizedVector = this.normalizeScores(vectorResults);
    const normalizedKeyword = this.normalizeScores(keywordResults);

    // 4. 合并结果
    const merged = this.mergeResults(
      normalizedVector,
      normalizedKeyword,
      this.config.hybrid.vectorWeight,
      this.config.hybrid.textWeight
    );

    // 5. 过滤和排序
    return merged
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => ({
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        snippet: this.truncateSnippet(r.text, 700),
        score: r.score,
        vectorScore: r.vectorScore,
        textScore: r.textScore,
      }));
  }

  /**
   * 归一化分数到 0-1 范围
   */
  private normalizeScores(
    results: ChunkSearchResult[]
  ): Array<ChunkSearchResult & { normalizedScore: number }> {
    if (results.length === 0) {
      return [];
    }

    const scores = results.map((r) => r.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const range = maxScore - minScore || 1;

    return results.map((r) => ({
      ...r,
      normalizedScore: (r.score - minScore) / range,
    }));
  }

  /**
   * 合并向量和关键词搜索结果
   */
  private mergeResults(
    vectorResults: Array<ChunkSearchResult & { normalizedScore: number }>,
    keywordResults: Array<ChunkSearchResult & { normalizedScore: number }>,
    vectorWeight: number,
    textWeight: number
  ): Array<ChunkSearchResult & { score: number; vectorScore: number; textScore: number }> {
    // 创建 ID 到结果的映射
    const merged = new Map<
      string,
      ChunkSearchResult & { score: number; vectorScore: number; textScore: number }
    >();

    // 处理向量结果
    for (const result of vectorResults) {
      merged.set(result.id, {
        ...result,
        score: result.normalizedScore * vectorWeight,
        vectorScore: result.normalizedScore,
        textScore: 0,
      });
    }

    // 处理关键词结果
    for (const result of keywordResults) {
      const existing = merged.get(result.id);
      if (existing) {
        // 合并分数
        existing.textScore = result.normalizedScore;
        existing.score += result.normalizedScore * textWeight;
      } else {
        merged.set(result.id, {
          ...result,
          score: result.normalizedScore * textWeight,
          vectorScore: 0,
          textScore: result.normalizedScore,
        });
      }
    }

    return Array.from(merged.values());
  }

  /**
   * 截断片段
   */
  private truncateSnippet(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength - 3) + '...';
  }
}
