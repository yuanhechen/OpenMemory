import { Message } from './compactor.js';

/**
 * 摘要生成器
 */
export class Summarizer {
  /**
   * 分阶段生成摘要
   * 对于长对话，先分段摘要，再合并
   */
  async summarizeInStages(
    messages: Message[],
    maxChunkTokens: number = 4000
  ): Promise<string> {
    // 将消息分成多个块
    const chunks = this.splitIntoChunks(messages, maxChunkTokens);

    // 对每个块生成摘要
    const chunkSummaries: string[] = [];
    for (const chunk of chunks) {
      const summary = await this.summarizeChunk(chunk);
      chunkSummaries.push(summary);
    }

    // 如果只有一个块，直接返回
    if (chunkSummaries.length === 1) {
      return chunkSummaries[0];
    }

    // 合并所有摘要
    return this.mergeSummaries(chunkSummaries);
  }

  /**
   * 将消息分成多个块
   */
  private splitIntoChunks(
    messages: Message[],
    maxChunkTokens: number
  ): Message[][] {
    const chunks: Message[][] = [];
    let currentChunk: Message[] = [];
    let currentTokens = 0;

    for (const message of messages) {
      const messageTokens = this.estimateTokens(message.content);

      if (currentTokens + messageTokens > maxChunkTokens && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentTokens = 0;
      }

      currentChunk.push(message);
      currentTokens += messageTokens;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * 摘要单个块
   * 这是占位实现，实际需要调用 LLM
   */
  private async summarizeChunk(messages: Message[]): Promise<string> {
    const points: string[] = [];

    for (const message of messages) {
      if (message.role === 'user') {
        // 提取用户的关键问题或请求
        const firstSentence = message.content.split(/[。.!！?？\n]/)[0];
        if (firstSentence.length > 10) {
          points.push(`- 用户: ${firstSentence.slice(0, 100)}`);
        }
      } else if (message.role === 'assistant') {
        // 提取助手的关键回复
        const firstSentence = message.content.split(/[。.!！?？\n]/)[0];
        if (firstSentence.length > 10) {
          points.push(`- 助手: ${firstSentence.slice(0, 100)}`);
        }
      }
    }

    return points.slice(0, 10).join('\n');
  }

  /**
   * 合并多个摘要
   */
  private async mergeSummaries(summaries: string[]): Promise<string> {
    return summaries.join('\n\n---\n\n');
  }

  /**
   * 估算 Token 数
   */
  private estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }
}
