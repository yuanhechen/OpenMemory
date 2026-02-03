import { OpenMemory, SearchOptions, SearchResult } from '../core/engine.js';

/**
 * memory_search 工具参数
 */
export interface MemorySearchParams {
  query: string;
  limit?: number;
  minScore?: number;
  sources?: ('memory' | 'sessions')[];
}

/**
 * memory_search 工具结果
 */
export interface MemorySearchToolResult {
  results: SearchResult[];
  totalCount: number;
}

/**
 * memory_search 工具
 * 在所有记忆文件中查找相关内容
 */
export async function memorySearch(
  memory: OpenMemory,
  params: MemorySearchParams
): Promise<MemorySearchToolResult> {
  const { query, limit = 6, minScore = 0.35, sources } = params;

  const results = await memory.search(query, {
    limit,
    minScore,
    sources,
  });

  return {
    results,
    totalCount: results.length,
  };
}

/**
 * 工具定义（用于 LLM 工具调用）
 */
export const memorySearchToolDefinition = {
  name: 'memory_search',
  description: '在所有记忆文件中查找相关内容。返回最相关的文本片段。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询，应该描述你要查找的内容',
      },
      limit: {
        type: 'number',
        description: '返回结果的最大数量，默认 6',
      },
      minScore: {
        type: 'number',
        description: '最低相关度分数阈值，默认 0.35',
      },
    },
    required: ['query'],
  },
};
