/**
 * 自动记忆捕获模块
 * 
 * 基于规则和 LLM 智能识别对话中的重要信息并自动保存
 */

import { Database } from '../storage/sqlite.js';
import { EmbeddingProvider } from '../embedding/provider.js';

/**
 * 记忆类别
 */
export type MemoryCategory = 'preference' | 'decision' | 'entity' | 'fact' | 'other';

/**
 * 捕获的记忆
 */
export interface CapturedMemory {
  content: string;
  category: MemoryCategory;
  source: 'user' | 'assistant';
  timestamp: number;
}

/**
 * 捕获配置
 */
export interface CaptureConfig {
  enabled: boolean;
  maxPerConversation: number;      // 每次对话最多捕获数量
  minTextLength: number;           // 最小文本长度
  maxTextLength: number;           // 最大文本长度
  dedupeThreshold: number;         // 去重相似度阈值
}

/**
 * 默认配置
 */
export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  enabled: true,
  maxPerConversation: 3,
  minTextLength: 10,
  maxTextLength: 500,
  dedupeThreshold: 0.95,
};

/**
 * 记忆触发规则 - 匹配这些模式的文本可能包含重要信息
 */
const MEMORY_TRIGGERS: RegExp[] = [
  // 记住类关键词
  /记住|记下|别忘|remember|zapamatuj/i,
  
  // 偏好类
  /我喜欢|我偏好|我习惯|我倾向|我不喜欢|我讨厌/i,
  /i (like|prefer|hate|love|want|need|always|never)/i,
  /preferuji|radši|nechci/i,
  
  // 决策类
  /我们决定|我决定|我选择|我们选择|我们使用|我们采用/i,
  /we decided|i decided|let's use|we'll use/i,
  
  // 个人信息
  /我(的|是|叫|住|在)|my .+ is/i,
  /我的名字|我叫|call me|my name/i,
  
  // 联系方式
  /\+?\d{10,}/,                           // 电话号码
  /[\w.-]+@[\w.-]+\.\w+/,                 // 邮箱
  
  // 工作/项目相关
  /我(在|从事|负责|开发|做)|i (work|develop|build)/i,
  /项目|project|任务|task/i,
  
  // 强调词
  /重要|关键|必须|一定|always|never|important|must|crucial/i,
];

/**
 * 排除规则 - 匹配这些模式的文本不应该被捕获
 */
const EXCLUDE_PATTERNS: RegExp[] = [
  // 系统生成内容
  /<[^>]+>/,                              // XML/HTML 标签
  /^```[\s\S]*```$/,                      // 代码块
  /<relevant-memories>/i,                 // 已注入的记忆标记
  
  // 过多 emoji
  /[\u{1F300}-\u{1F9FF}]{3,}/u,
  
  // 纯数字或纯符号
  /^[\d\s\-\+\.\,]+$/,
  /^[\W\s]+$/,
];

/**
 * 自动记忆捕获器
 */
export class MemoryCapture {
  private config: CaptureConfig;
  private db: Database;
  private embedder: EmbeddingProvider;
  private capturedCount = 0;

  constructor(
    db: Database,
    embedder: EmbeddingProvider,
    config: Partial<CaptureConfig> = {}
  ) {
    this.config = { ...DEFAULT_CAPTURE_CONFIG, ...config };
    this.db = db;
    this.embedder = embedder;
  }

  /**
   * 重置对话计数器（新对话开始时调用）
   */
  resetConversation(): void {
    this.capturedCount = 0;
  }

  /**
   * 分析文本并捕获记忆
   */
  async capture(
    text: string,
    source: 'user' | 'assistant'
  ): Promise<CapturedMemory | null> {
    if (!this.config.enabled) return null;
    if (this.capturedCount >= this.config.maxPerConversation) return null;

    // 检查是否应该捕获
    if (!this.shouldCapture(text)) return null;

    // 检测类别
    const category = this.detectCategory(text);

    // 提取核心内容
    const content = this.extractContent(text);
    if (!content) return null;

    // 去重检查
    const isDuplicate = await this.checkDuplicate(content);
    if (isDuplicate) return null;

    this.capturedCount++;

    return {
      content,
      category,
      source,
      timestamp: Date.now(),
    };
  }

  /**
   * 判断是否应该捕获
   */
  shouldCapture(text: string): boolean {
    // 长度检查
    if (text.length < this.config.minTextLength) return false;
    if (text.length > this.config.maxTextLength) return false;

    // 排除规则检查
    for (const pattern of EXCLUDE_PATTERNS) {
      if (pattern.test(text)) return false;
    }

    // 触发规则检查
    for (const pattern of MEMORY_TRIGGERS) {
      if (pattern.test(text)) return true;
    }

    return false;
  }

  /**
   * 检测记忆类别
   */
  detectCategory(text: string): MemoryCategory {
    const lowerText = text.toLowerCase();

    // 偏好类
    if (/喜欢|偏好|习惯|倾向|like|prefer|love|hate|want|need/.test(lowerText)) {
      return 'preference';
    }

    // 决策类
    if (/决定|选择|使用|采用|decided|choose|use|adopt/.test(lowerText)) {
      return 'decision';
    }

    // 实体类（联系方式、名称等）
    if (/[\w.-]+@[\w.-]+\.\w+/.test(text) || /\+?\d{10,}/.test(text)) {
      return 'entity';
    }
    if (/我(叫|是|的名字)|my name|call me/.test(lowerText)) {
      return 'entity';
    }

    // 事实类
    if (/是|在|有|做|工作|开发|is|are|have|work|develop/.test(lowerText)) {
      return 'fact';
    }

    return 'other';
  }

  /**
   * 提取核心内容（简化处理）
   */
  extractContent(text: string): string {
    // 移除多余空白
    let content = text.trim().replace(/\s+/g, ' ');

    // 如果太长，尝试提取关键句子
    if (content.length > 200) {
      // 按句子分割，取包含触发词的句子
      const sentences = content.split(/[。.!！?？\n]+/);
      const relevantSentences = sentences.filter(s => 
        MEMORY_TRIGGERS.some(pattern => pattern.test(s))
      );
      
      if (relevantSentences.length > 0) {
        content = relevantSentences.slice(0, 2).join('。');
      } else {
        content = content.slice(0, 200) + '...';
      }
    }

    return content;
  }

  /**
   * 检查是否与已有记忆重复
   */
  async checkDuplicate(content: string): Promise<boolean> {
    try {
      const embedding = await this.embedder.generate(content);
      const similar = await this.db.searchVector(embedding, 1);
      
      if (similar.length > 0 && similar[0].score >= this.config.dedupeThreshold) {
        return true;
      }
    } catch {
      // 如果搜索失败，假设不重复
    }
    
    return false;
  }
}

/**
 * 格式化记忆用于保存到 Markdown
 */
export function formatMemoryForMarkdown(memory: CapturedMemory): string {
  const date = new Date(memory.timestamp).toISOString().split('T')[0];
  const categoryLabels: Record<MemoryCategory, string> = {
    preference: '偏好',
    decision: '决策',
    entity: '信息',
    fact: '事实',
    other: '其他',
  };
  
  return `- [${categoryLabels[memory.category]}] ${memory.content} _(${date})_\n`;
}
