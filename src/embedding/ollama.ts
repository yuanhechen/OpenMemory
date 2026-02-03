import { EmbeddingProvider, MODEL_DIMENSIONS } from './provider.js';

/**
 * Ollama 嵌入向量提供者
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  private baseUrl: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.name = model;
    this.dimensions = MODEL_DIMENSIONS[model] ?? 768;
  }

  /**
   * 生成单个文本的嵌入向量
   */
  async generate(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.name,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama embedding failed: ${response.status} ${errorText}`);
    }

    const data = await response.json() as { embedding: number[] };
    return data.embedding;
  }

  /**
   * 批量生成嵌入向量
   */
  async generateBatch(texts: string[]): Promise<number[][]> {
    // Ollama 不支持批量，逐个处理
    const results: number[][] = [];
    
    for (const text of texts) {
      const embedding = await this.generate(text);
      results.push(embedding);
    }
    
    return results;
  }

  /**
   * 检查 Ollama 连接
   */
  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });
      
      if (!response.ok) {
        return false;
      }

      // 检查模型是否可用
      const data = await response.json() as { models: Array<{ name: string }> };
      const modelNames = data.models.map((m) => m.name.split(':')[0]);
      
      return modelNames.includes(this.name);
    } catch {
      return false;
    }
  }

  /**
   * 获取可用模型列表
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });
      
      if (!response.ok) {
        return [];
      }

      const data = await response.json() as { models: Array<{ name: string }> };
      return data.models.map((m) => m.name);
    } catch {
      return [];
    }
  }
}
