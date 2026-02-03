import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';

/**
 * 配置接口定义
 */
export interface OpenMemoryConfig {
  workspace: string;

  embedding: {
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
  };

  storage: {
    indexPath: string;
  };

  chunking: {
    maxTokens: number;
    overlapTokens: number;
    respectHeaders: boolean;
  };

  search: {
    maxResults: number;
    minScore: number;
    hybrid: {
      enabled: boolean;
      vectorWeight: number;
      textWeight: number;
      candidateMultiplier: number;
    };
  };

  sync: {
    watchEnabled: boolean;
    watchDebounceMs: number;
  };

  compaction: {
    enabled: boolean;
    threshold: number;
    flushBeforeCompact: boolean;
    preserveRecentMessages: number;
  };

  api: {
    port: number;
    host: string;
  };
}

/**
 * 默认配置
 */
export function getDefaultConfig(): OpenMemoryConfig {
  const stateDir = path.join(os.homedir(), '.openmemory');
  
  return {
    workspace: path.join(stateDir, 'workspace'),

    embedding: {
      provider: 'ollama',
      ollama: {
        baseUrl: 'http://localhost:11434',
        model: 'nomic-embed-text',
      },
    },

    storage: {
      indexPath: path.join(stateDir, 'index.db'),
    },

    chunking: {
      maxTokens: 512,
      overlapTokens: 50,
      respectHeaders: true,
    },

    search: {
      maxResults: 6,
      minScore: 0.35,
      hybrid: {
        enabled: true,
        vectorWeight: 0.7,
        textWeight: 0.3,
        candidateMultiplier: 4,
      },
    },

    sync: {
      watchEnabled: true,
      watchDebounceMs: 1500,
    },

    compaction: {
      enabled: true,
      threshold: 0.6,
      flushBeforeCompact: true,
      preserveRecentMessages: 5,
    },

    api: {
      port: 8787,
      host: '127.0.0.1',
    },
  };
}

/**
 * 获取状态目录路径
 */
export function getStateDir(): string {
  return path.join(os.homedir(), '.openmemory');
}

/**
 * 获取配置文件路径
 */
export function getConfigPath(): string {
  return path.join(getStateDir(), 'config.json');
}

/**
 * 展开路径中的 ~ 为用户主目录
 */
export function expandPath(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

/**
 * 加载配置文件
 */
export async function loadConfig(): Promise<OpenMemoryConfig> {
  const configPath = getConfigPath();
  const defaultConfig = getDefaultConfig();

  if (!existsSync(configPath)) {
    return defaultConfig;
  }

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const userConfig = JSON.parse(content) as Partial<OpenMemoryConfig>;
    
    // 深度合并配置
    return deepMerge(defaultConfig, userConfig) as OpenMemoryConfig;
  } catch (error) {
    console.warn(`Warning: Failed to load config from ${configPath}, using defaults`);
    return defaultConfig;
  }
}

/**
 * 保存配置文件
 */
export async function saveConfig(config: OpenMemoryConfig): Promise<void> {
  const stateDir = getStateDir();
  const configPath = getConfigPath();

  // 确保状态目录存在
  await fs.mkdir(stateDir, { recursive: true });

  // 写入配置
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * 深度合并对象
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = (target as Record<string, unknown>)[key];
    
    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        targetValue as object,
        sourceValue as object
      );
    } else if (sourceValue !== undefined) {
      (result as Record<string, unknown>)[key] = sourceValue;
    }
  }
  
  return result;
}
