/**
 * 自动记忆召回模块
 * 
 * 在对话开始前自动检索相关记忆并注入上下文
 */

import { Database } from '../storage/sqlite.js';
import { ChunkSearchResult } from '../storage/schema.js';
import { EmbeddingProvider } from '../embedding/provider.js';

/**
 * 召回配置
 */
export interface RecallConfig {
  enabled: boolean;
  topK: number;                    // 返回的最大记忆数量
  minScore: number;                // 最低相似度阈值
  contextTemplate: string;         // 上下文模板
}

/**
 * 默认配置
 */
export const DEFAULT_RECALL_CONFIG: RecallConfig = {
  enabled: true,
  topK: 3,
  minScore: 0.3,
  contextTemplate: `<relevant-memories>
The following memories may be relevant to this conversation:
{memories}
</relevant-memories>`,
};

/**
 * 召回结果
 */
export interface RecallResult {
  memories: ChunkSearchResult[];
  context: string;
  isEmpty: boolean;
}

/**
 * 自动记忆召回器
 */
export class MemoryRecall {
  private config: RecallConfig;
  private db: Database;
  private embedder: EmbeddingProvider;

  constructor(
    db: Database,
    embedder: EmbeddingProvider,
    config: Partial<RecallConfig> = {}
  ) {
    this.config = { ...DEFAULT_RECALL_CONFIG, ...config };
    this.db = db;
    this.embedder = embedder;
  }

  /**
   * 根据用户输入召回相关记忆
   */
  async recall(userInput: string): Promise<RecallResult> {
    if (!this.config.enabled) {
      return { memories: [], context: '', isEmpty: true };
    }

    try {
      // 1. 将用户输入向量化
      const embedding = await this.embedder.generate(userInput);

      // 2. 搜索相关记忆
      const results = await this.db.searchVector(embedding, this.config.topK);

      // 3. 过滤低分结果
      const filteredResults = results.filter(r => r.score >= this.config.minScore);

      if (filteredResults.length === 0) {
        return { memories: [], context: '', isEmpty: true };
      }

      // 4. 生成上下文
      const memoriesText = filteredResults
        .map((r, i) => `${i + 1}. [${r.path}] ${r.text} (相关度: ${(r.score * 100).toFixed(0)}%)`)
        .join('\n');

      const context = this.config.contextTemplate.replace('{memories}', memoriesText);

      return {
        memories: filteredResults,
        context,
        isEmpty: false,
      };
    } catch (error) {
      console.error('Memory recall failed:', error);
      return { memories: [], context: '', isEmpty: true };
    }
  }

  /**
   * 生成系统提示词（包含召回的记忆）
   */
  async generateSystemPrompt(
    userInput: string,
    basePrompt: string
  ): Promise<string> {
    const result = await this.recall(userInput);

    if (result.isEmpty) {
      return basePrompt;
    }

    return `${result.context}\n\n${basePrompt}`;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RecallConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * 创建中文版上下文模板
 */
export function createChineseContextTemplate(): string {
  return `<relevant-memories>
以下是可能与本次对话相关的历史记忆：
{memories}
</relevant-memories>`;
}
