/**
 * openmemory 客户端 - 用于连接 openmemory API 服务
 */

export interface OpenMemoryClientConfig {
  baseUrl: string;
}

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
 * OpenMemory HTTP 客户端
 */
export class OpenMemoryClient {
  private baseUrl: string;

  constructor(config: OpenMemoryClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
  }

  /**
   * 健康检查
   */
  async health(): Promise<{ status: string; version: string }> {
    const response = await fetch(`${this.baseUrl}/health`);
    return response.json() as Promise<{ status: string; version: string }>;
  }

  /**
   * 获取状态
   */
  async status(): Promise<{
    workspace: string;
    filesIndexed: number;
    totalChunks: number;
    embeddingProvider: string;
    embeddingModel: string;
  }> {
    const response = await fetch(`${this.baseUrl}/status`);
    return response.json() as Promise<{
      workspace: string;
      filesIndexed: number;
      totalChunks: number;
      embeddingProvider: string;
      embeddingModel: string;
    }>;
  }

  /**
   * 搜索记忆
   */
  async search(
    query: string,
    options?: { limit?: number; minScore?: number }
  ): Promise<{ results: SearchResult[]; count: number }> {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, ...options }),
    });
    return response.json() as Promise<{ results: SearchResult[]; count: number }>;
  }

  /**
   * 读取文件
   */
  async get(
    path: string,
    options?: { startLine?: number; endLine?: number }
  ): Promise<{ content: string; path: string }> {
    const params = new URLSearchParams({ path });
    if (options?.startLine) params.set('startLine', String(options.startLine));
    if (options?.endLine) params.set('endLine', String(options.endLine));

    const response = await fetch(`${this.baseUrl}/get?${params}`);
    return response.json() as Promise<{ content: string; path: string }>;
  }

  /**
   * 追加内容
   */
  async append(
    path: string,
    content: string
  ): Promise<{ success: boolean; path: string }> {
    const response = await fetch(`${this.baseUrl}/append`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    return response.json() as Promise<{ success: boolean; path: string }>;
  }

  /**
   * 写入文件
   */
  async write(
    path: string,
    content: string
  ): Promise<{ success: boolean; path: string }> {
    const response = await fetch(`${this.baseUrl}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    return response.json() as Promise<{ success: boolean; path: string }>;
  }

  /**
   * 重建索引
   */
  async reindex(
    full = false
  ): Promise<{ filesIndexed: number; chunksCreated: number }> {
    const response = await fetch(`${this.baseUrl}/reindex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full }),
    });
    return response.json() as Promise<{ filesIndexed: number; chunksCreated: number }>;
  }
}

/**
 * 创建客户端实例
 */
export function createClient(
  baseUrl = 'http://127.0.0.1:8787'
): OpenMemoryClient {
  return new OpenMemoryClient({ baseUrl });
}
