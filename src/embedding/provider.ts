import { OpenMemoryConfig } from '../core/config.js';
import { OllamaEmbeddingProvider } from './ollama.js';
import { OpenAIEmbeddingProvider } from './openai.js';
import { GeminiEmbeddingProvider } from './gemini.js';

/**
 * 嵌入向量提供者接口
 */
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  
  /**
   * 生成单个文本的嵌入向量
   */
  generate(text: string): Promise<number[]>;
  
  /**
   * 批量生成嵌入向量
   */
  generateBatch(texts: string[]): Promise<number[][]>;
  
  /**
   * 检查连接是否可用
   */
  checkConnection(): Promise<boolean>;
}

/**
 * 嵌入配置
 */
export interface EmbeddingConfig {
  provider: 'ollama' | 'openai' | 'gemini';
  ollama?: {
    baseUrl: string;
    model: string;
  };
  openai?: {
    apiKey: string;
    model: string;
    baseUrl?: string;  // 自定义 API 地址，支持 vLLM 等兼容服务
  };
  gemini?: {
    apiKey: string;
    model: string;
  };
}

/**
 * 模型维度映射
 */
export const MODEL_DIMENSIONS: Record<string, number> = {
  // Ollama 模型
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'all-minilm': 384,
  
  // OpenAI 模型
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  
  // Gemini 模型
  'gemini-embedding-001': 768,
  
  // Qwen3 Embedding 模型 (vLLM)
  'Qwen3-Embedding-0.6B': 1024,
  'qwen3-embedding-0.6b': 1024,
};

/**
 * 创建嵌入提供者
 */
export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'ollama':
      return new OllamaEmbeddingProvider(
        config.ollama?.baseUrl ?? 'http://localhost:11434',
        config.ollama?.model ?? 'nomic-embed-text'
      );
    
    case 'openai':
      return new OpenAIEmbeddingProvider(
        config.openai?.apiKey ?? '',
        config.openai?.model ?? 'text-embedding-3-small',
        config.openai?.baseUrl
      );
    
    case 'gemini':
      return new GeminiEmbeddingProvider(
        config.gemini?.apiKey ?? '',
        config.gemini?.model ?? 'gemini-embedding-001'
      );
    
    default:
      throw new Error(`Unknown embedding provider: ${config.provider}`);
  }
}
