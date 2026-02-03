import crypto from 'node:crypto';

/**
 * 分块选项
 */
export interface ChunkOptions {
  maxTokens: number;
  overlapTokens: number;
  respectHeaders: boolean;
}

/**
 * 分块结果
 */
export interface Chunk {
  text: string;
  path: string;
  startLine: number;
  endLine: number;
  hash: string;
}

/**
 * Markdown 感知分块器
 */
export class Chunker {
  private options: ChunkOptions;

  constructor(options: ChunkOptions) {
    this.options = options;
  }

  /**
   * 对 Markdown 文本进行分块
   */
  async chunk(text: string, filePath: string): Promise<Chunk[]> {
    const lines = text.split('\n');
    const chunks: Chunk[] = [];

    if (this.options.respectHeaders) {
      // 按标题分割成 Sections
      const sections = this.splitByHeaders(lines);
      
      for (const section of sections) {
        const sectionChunks = this.chunkSection(section, filePath);
        chunks.push(...sectionChunks);
      }
    } else {
      // 简单的滑动窗口分块
      const sectionChunks = this.chunkSection(
        { lines, startLine: 1, header: null },
        filePath
      );
      chunks.push(...sectionChunks);
    }

    return chunks;
  }

  /**
   * 按标题分割文本
   */
  private splitByHeaders(
    lines: string[]
  ): Array<{ lines: string[]; startLine: number; header: string | null }> {
    const sections: Array<{
      lines: string[];
      startLine: number;
      header: string | null;
    }> = [];

    let currentSection: string[] = [];
    let currentStartLine = 1;
    let currentHeader: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // 检查是否是标题行
      if (/^#{1,6}\s+/.test(line)) {
        // 保存当前 section（如果有内容）
        if (currentSection.length > 0) {
          sections.push({
            lines: currentSection,
            startLine: currentStartLine,
            header: currentHeader,
          });
        }

        // 开始新的 section
        currentSection = [line];
        currentStartLine = lineNumber;
        currentHeader = line;
      } else {
        currentSection.push(line);
      }
    }

    // 保存最后一个 section
    if (currentSection.length > 0) {
      sections.push({
        lines: currentSection,
        startLine: currentStartLine,
        header: currentHeader,
      });
    }

    return sections;
  }

  /**
   * 对单个 Section 进行分块
   */
  private chunkSection(
    section: { lines: string[]; startLine: number; header: string | null },
    filePath: string
  ): Chunk[] {
    const chunks: Chunk[] = [];
    const { lines, startLine, header } = section;
    
    const text = lines.join('\n');
    const estimatedTokens = this.estimateTokens(text);

    // 如果整个 section 在限制内，作为单个 chunk
    if (estimatedTokens <= this.options.maxTokens) {
      if (text.trim().length > 0) {
        chunks.push({
          text: text.trim(),
          path: filePath,
          startLine,
          endLine: startLine + lines.length - 1,
          hash: this.hashText(text),
        });
      }
      return chunks;
    }

    // 需要进一步分割
    const targetTokens = this.options.maxTokens - this.options.overlapTokens;
    let currentChunkLines: string[] = [];
    let currentChunkStartLine = startLine;
    let currentTokens = 0;

    // 如果有标题，添加到每个 chunk 的开头
    const headerPrefix = header ? header + '\n\n' : '';
    const headerTokens = this.estimateTokens(headerPrefix);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineTokens = this.estimateTokens(line);

      // 检查是否需要在代码块边界分割
      if (this.isCodeBlockBoundary(line, currentChunkLines)) {
        // 完成当前代码块后再分割
        currentChunkLines.push(line);
        currentTokens += lineTokens;
        continue;
      }

      // 检查是否会超出限制
      if (
        currentTokens + lineTokens + headerTokens > targetTokens &&
        currentChunkLines.length > 0
      ) {
        // 保存当前 chunk
        const chunkText = (headerPrefix + currentChunkLines.join('\n')).trim();
        if (chunkText.length > 0) {
          chunks.push({
            text: chunkText,
            path: filePath,
            startLine: currentChunkStartLine,
            endLine: startLine + i - 1,
            hash: this.hashText(chunkText),
          });
        }

        // 应用重叠
        const overlapLines = this.getOverlapLines(
          currentChunkLines,
          this.options.overlapTokens
        );
        currentChunkLines = [...overlapLines];
        currentChunkStartLine = startLine + i - overlapLines.length;
        currentTokens = this.estimateTokens(overlapLines.join('\n'));
      }

      currentChunkLines.push(line);
      currentTokens += lineTokens;
    }

    // 保存最后一个 chunk
    if (currentChunkLines.length > 0) {
      const chunkText = (headerPrefix + currentChunkLines.join('\n')).trim();
      if (chunkText.length > 0) {
        chunks.push({
          text: chunkText,
          path: filePath,
          startLine: currentChunkStartLine,
          endLine: startLine + lines.length - 1,
          hash: this.hashText(chunkText),
        });
      }
    }

    return chunks;
  }

  /**
   * 获取重叠的行
   */
  private getOverlapLines(lines: string[], targetTokens: number): string[] {
    const result: string[] = [];
    let tokens = 0;

    for (let i = lines.length - 1; i >= 0; i--) {
      const lineTokens = this.estimateTokens(lines[i]);
      if (tokens + lineTokens > targetTokens) {
        break;
      }
      result.unshift(lines[i]);
      tokens += lineTokens;
    }

    return result;
  }

  /**
   * 检查是否是代码块边界
   */
  private isCodeBlockBoundary(line: string, currentLines: string[]): boolean {
    if (!line.startsWith('```')) {
      return false;
    }

    // 统计当前行之前的代码块标记数
    const codeBlockCount = currentLines.filter((l) =>
      l.startsWith('```')
    ).length;

    // 如果是奇数，说明我们在代码块内，需要等待结束
    return codeBlockCount % 2 === 1;
  }

  /**
   * 估算 Token 数（简化版本，约 4 字符 = 1 token）
   */
  private estimateTokens(text: string): number {
    // 对于中文，大约 1.5 字符 = 1 token
    // 对于英文，大约 4 字符 = 1 token
    // 这里使用一个折中的估算
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 计算文本哈希
   */
  private hashText(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }
}

/**
 * 计算文本哈希（供外部使用）
 */
export function hashText(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}
