/**
 * 压缩结果
 */
export interface CompactResult {
  compacted: boolean;
  reason?: string;
  tokensBefore?: number;
  tokensAfter?: number;
  summary?: string;
}

/**
 * 压缩参数
 */
export interface CompactParams {
  messages: Message[];
  contextWindow: number;
  model: string;
}

/**
 * 消息结构
 */
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 压缩配置
 */
export interface CompactConfig {
  enabled: boolean;
  threshold: number;
  flushBeforeCompact: boolean;
  preserveRecentMessages: number;
}

/**
 * 会话压缩器
 */
export class Compactor {
  private config: CompactConfig;

  constructor(config: CompactConfig) {
    this.config = config;
  }

  /**
   * 检查是否需要压缩
   */
  shouldCompact(messages: Message[], contextWindow: number): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const totalTokens = this.estimateMessagesTokens(messages);
    const threshold = Math.floor(contextWindow * this.config.threshold);

    return totalTokens > threshold;
  }

  /**
   * 执行压缩
   * 注意：实际的摘要生成需要调用 LLM，这里只是框架
   */
  async compact(params: CompactParams): Promise<CompactResult> {
    const { messages, contextWindow } = params;

    // 计算当前 Token 用量
    const totalTokens = this.estimateMessagesTokens(messages);
    const budgetTokens = Math.floor(contextWindow * (1 - this.config.threshold));

    if (totalTokens <= budgetTokens) {
      return { compacted: false, reason: 'Within budget' };
    }

    // 保留最近的消息
    const preserve = this.config.preserveRecentMessages;
    const toCompress = messages.slice(0, -preserve);
    const preserved = messages.slice(-preserve);

    // 生成摘要（这里需要外部 LLM 支持）
    const summary = await this.generateSummary(toCompress);

    // 计算压缩后的 Token
    const summaryTokens = this.estimateTokens(summary);
    const preservedTokens = this.estimateMessagesTokens(preserved);

    return {
      compacted: true,
      tokensBefore: totalTokens,
      tokensAfter: summaryTokens + preservedTokens,
      summary,
    };
  }

  /**
   * 生成摘要
   * 这是一个占位实现，实际需要调用 LLM
   */
  private async generateSummary(messages: Message[]): Promise<string> {
    // 简单的文本提取作为占位
    const content = messages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n');

    return `## Session Summary\n\n${content}`;
  }

  /**
   * 估算消息的 Token 数
   */
  estimateMessagesTokens(messages: Message[]): number {
    return messages.reduce(
      (sum, m) => sum + this.estimateTokens(m.content) + 4, // +4 for role overhead
      0
    );
  }

  /**
   * 估算文本的 Token 数
   */
  private estimateTokens(text: string): number {
    // 简化估算：中文约 1.5 字符/token，英文约 4 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }
}
