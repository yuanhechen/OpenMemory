import { EmbeddingProvider, MODEL_DIMENSIONS } from './provider.js';

/**
 * OpenAI 兼容的嵌入向量提供者
 * 支持 OpenAI、vLLM、及其他 OpenAI 兼容 API
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, model: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.name = model;
    this.baseUrl = baseUrl ?? 'https://api.openai.com/v1';
    this.dimensions = MODEL_DIMENSIONS[model] ?? 1536;
  }

  /**
   * 生成单个文本的嵌入向量
   */
  async generate(text: string): Promise<number[]> {
    const embeddings = await this.generateBatch([text]);
    return embeddings[0];
  }

  /**
   * 批量生成嵌入向量
   */
  async generateBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.name,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI embedding failed: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // 按索引排序
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }

  /**
   * 检查 API 连接
   */
  async checkConnection(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      
      return response.ok;
    } catch {
      return false;
    }
  }
}
