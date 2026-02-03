import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { expandPath } from './config.js';

/**
 * 引导文件列表
 */
export const BOOTSTRAP_FILES = ['MEMORY.md', 'USER.md', 'PROJECT.md'] as const;

/**
 * 工作区管理器
 */
export class Workspace {
  readonly path: string;
  readonly memoryDir: string;

  constructor(workspacePath: string) {
    this.path = expandPath(workspacePath);
    this.memoryDir = path.join(this.path, 'memory');
  }

  /**
   * 检查工作区是否已初始化
   */
  async isInitialized(): Promise<boolean> {
    if (!existsSync(this.path)) {
      return false;
    }

    // 检查引导文件
    for (const file of BOOTSTRAP_FILES) {
      if (!existsSync(path.join(this.path, file))) {
        return false;
      }
    }

    return true;
  }

  /**
   * 初始化工作区
   */
  async initialize(templates: Map<string, string>): Promise<void> {
    // 创建工作区目录
    await fs.mkdir(this.path, { recursive: true });

    // 创建 memory 目录
    await fs.mkdir(this.memoryDir, { recursive: true });

    // 创建引导文件
    for (const file of BOOTSTRAP_FILES) {
      const filePath = path.join(this.path, file);
      if (!existsSync(filePath)) {
        const template = templates.get(file) ?? '';
        await fs.writeFile(filePath, template, 'utf-8');
      }
    }
  }

  /**
   * 获取文件的完整路径
   */
  resolvePath(relativePath: string): string {
    return path.join(this.path, relativePath);
  }

  /**
   * 获取所有 Markdown 文件
   */
  async getMarkdownFiles(): Promise<string[]> {
    const files: string[] = [];

    // 获取根目录的 md 文件
    const rootFiles = await fs.readdir(this.path);
    for (const file of rootFiles) {
      if (file.endsWith('.md')) {
        files.push(path.join(this.path, file));
      }
    }

    // 获取 memory 目录的 md 文件
    if (existsSync(this.memoryDir)) {
      const memoryFiles = await fs.readdir(this.memoryDir);
      for (const file of memoryFiles) {
        if (file.endsWith('.md')) {
          files.push(path.join(this.memoryDir, file));
        }
      }
    }

    return files;
  }

  /**
   * 读取文件内容
   */
  async readFile(relativePath: string, startLine?: number, endLine?: number): Promise<string> {
    const fullPath = this.resolvePath(relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');

    if (startLine === undefined && endLine === undefined) {
      return content;
    }

    const lines = content.split('\n');
    const start = Math.max(0, (startLine ?? 1) - 1);
    const end = Math.min(lines.length, endLine ?? lines.length);

    return lines.slice(start, end).join('\n');
  }

  /**
   * 写入文件
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    const dir = path.dirname(fullPath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  /**
   * 追加内容到文件
   */
  async appendFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(relativePath);
    const dir = path.dirname(fullPath);

    await fs.mkdir(dir, { recursive: true });

    if (existsSync(fullPath)) {
      await fs.appendFile(fullPath, content, 'utf-8');
    } else {
      await fs.writeFile(fullPath, content, 'utf-8');
    }
  }

  /**
   * 获取今日日志文件路径
   */
  getTodayLogPath(): string {
    const today = new Date().toISOString().split('T')[0];
    return `memory/${today}.md`;
  }

  /**
   * 检查文件是否存在
   */
  fileExists(relativePath: string): boolean {
    return existsSync(this.resolvePath(relativePath));
  }
}
