/**
 * 自动记忆系统
 * 
 * 整合 Auto-Capture（自动捕获）和 Auto-Recall（自动召回）功能
 */

export { 
  MemoryCapture, 
  CapturedMemory, 
  MemoryCategory,
  CaptureConfig,
  DEFAULT_CAPTURE_CONFIG,
  formatMemoryForMarkdown,
} from './capture.js';

export { 
  MemoryRecall, 
  RecallConfig,
  RecallResult,
  DEFAULT_RECALL_CONFIG,
  createChineseContextTemplate,
} from './recall.js';

import { Database } from '../storage/sqlite.js';
import { EmbeddingProvider } from '../embedding/provider.js';
import { MemoryCapture, CapturedMemory, CaptureConfig, formatMemoryForMarkdown } from './capture.js';
import { MemoryRecall, RecallConfig, RecallResult, createChineseContextTemplate } from './recall.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/**
 * 自动记忆系统配置
 */
export interface AutoMemoryConfig {
  capture: Partial<CaptureConfig>;
  recall: Partial<RecallConfig>;
  memoryFile: string;              // 长期记忆文件路径（相对于 workspace）
  useChineseTemplate: boolean;     // 使用中文模板
}

/**
 * 默认配置
 */
export const DEFAULT_AUTO_MEMORY_CONFIG: AutoMemoryConfig = {
  capture: {},
  recall: {},
  memoryFile: 'MEMORY.md',
  useChineseTemplate: true,
};

/**
 * 自动记忆系统
 * 
 * 提供一站式的记忆捕获和召回功能
 */
export class AutoMemory {
  private capture: MemoryCapture;
  private recall: MemoryRecall;
  private config: AutoMemoryConfig;
  private workspacePath: string;
  private pendingMemories: CapturedMemory[] = [];

  constructor(
    db: Database,
    embedder: EmbeddingProvider,
    workspacePath: string,
    config: Partial<AutoMemoryConfig> = {}
  ) {
    this.config = { ...DEFAULT_AUTO_MEMORY_CONFIG, ...config };
    this.workspacePath = workspacePath;

    // 初始化捕获器
    this.capture = new MemoryCapture(db, embedder, this.config.capture);

    // 初始化召回器
    const recallConfig = { ...this.config.recall };
    if (this.config.useChineseTemplate && !recallConfig.contextTemplate) {
      recallConfig.contextTemplate = createChineseContextTemplate();
    }
    this.recall = new MemoryRecall(db, embedder, recallConfig);
  }

  /**
   * 开始新对话（重置计数器）
   */
  startConversation(): void {
    this.capture.resetConversation();
    this.pendingMemories = [];
  }

  /**
   * 处理用户输入（召回相关记忆）
   */
  async onUserInput(input: string): Promise<RecallResult> {
    // 同时尝试捕获用户输入中的重要信息
    const captured = await this.capture.capture(input, 'user');
    if (captured) {
      this.pendingMemories.push(captured);
    }

    // 返回召回结果
    return this.recall.recall(input);
  }

  /**
   * 处理助手回复（捕获重要信息）
   */
  async onAssistantReply(reply: string): Promise<CapturedMemory | null> {
    const captured = await this.capture.capture(reply, 'assistant');
    if (captured) {
      this.pendingMemories.push(captured);
    }
    return captured;
  }

  /**
   * 结束对话（保存捕获的记忆）
   */
  async endConversation(): Promise<number> {
    if (this.pendingMemories.length === 0) {
      return 0;
    }

    const memoryPath = join(this.workspacePath, this.config.memoryFile);
    
    // 读取现有内容
    let existingContent = '';
    try {
      existingContent = await fs.readFile(memoryPath, 'utf-8');
    } catch {
      // 文件不存在，创建新文件
      existingContent = '# 长期记忆\n\n';
    }

    // 追加新记忆
    const newMemories = this.pendingMemories
      .map(formatMemoryForMarkdown)
      .join('');

    const updatedContent = existingContent + '\n' + newMemories;
    await fs.writeFile(memoryPath, updatedContent, 'utf-8');

    const count = this.pendingMemories.length;
    this.pendingMemories = [];
    
    return count;
  }

  /**
   * 生成包含记忆的系统提示词
   */
  async generateSystemPrompt(
    userInput: string,
    basePrompt: string
  ): Promise<string> {
    return this.recall.generateSystemPrompt(userInput, basePrompt);
  }

  /**
   * 手动添加记忆
   */
  addMemory(memory: CapturedMemory): void {
    this.pendingMemories.push(memory);
  }

  /**
   * 获取待保存的记忆数量
   */
  getPendingCount(): number {
    return this.pendingMemories.length;
  }
}
