import { OpenMemory } from '../core/engine.js';

/**
 * memory_get 工具参数
 */
export interface MemoryGetParams {
  path: string;
  startLine?: number;
  endLine?: number;
}

/**
 * memory_get 工具结果
 */
export interface MemoryGetToolResult {
  content: string;
  path: string;
  lines?: {
    start: number;
    end: number;
  };
}

/**
 * memory_get 工具
 * 读取指定文件的完整内容或特定行范围
 */
export async function memoryGet(
  memory: OpenMemory,
  params: MemoryGetParams
): Promise<MemoryGetToolResult> {
  const { path, startLine, endLine } = params;

  const content = await memory.get(path, startLine, endLine);

  return {
    content,
    path,
    lines: startLine !== undefined ? { start: startLine, end: endLine ?? startLine } : undefined,
  };
}

/**
 * 工具定义（用于 LLM 工具调用）
 */
export const memoryGetToolDefinition = {
  name: 'memory_get',
  description: '读取指定文件的完整内容或特定行范围。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要读取的文件路径，如 "MEMORY.md" 或 "memory/2026-02-03.md"',
      },
      startLine: {
        type: 'number',
        description: '可选：起始行号（从 1 开始）',
      },
      endLine: {
        type: 'number',
        description: '可选：结束行号',
      },
    },
    required: ['path'],
  },
};
