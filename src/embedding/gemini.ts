import { EmbeddingProvider, MODEL_DIMENSIONS } from './provider.js';

/**
 * Google Gemini 嵌入向量提供者
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.name = model;
    this.dimensions = MODEL_DIMENSIONS[model] ?? 768;
  }

  /**
   * 生成单个文本的嵌入向量
   */
  async generate(text: string): Promise<number[]> {
    const response = await fetch(
      `${this.baseUrl}/models/${this.name}:embedContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: {
            parts: [{ text }],
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini embedding failed: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      embedding: { values: number[] };
    };
    
    return data.embedding.values;
  }

  /**
   * 批量生成嵌入向量
   */
  async generateBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(
      `${this.baseUrl}/models/${this.name}:batchEmbedContents?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            content: {
              parts: [{ text }],
            },
          })),
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini batch embedding failed: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      embeddings: Array<{ values: number[] }>;
    };
    
    return data.embeddings.map((e) => e.values);
  }

  /**
   * 检查 API 连接
   */
  async checkConnection(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`,
        { method: 'GET' }
      );
      
      return response.ok;
    } catch {
      return false;
    }
  }
}
