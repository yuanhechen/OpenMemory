import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 模板文件名列表
 */
const TEMPLATE_FILES = ['MEMORY.md', 'USER.md', 'PROJECT.md'] as const;

/**
 * 内置模板（作为后备）
 */
const BUILTIN_TEMPLATES: Record<string, string> = {
  'MEMORY.md': `# MEMORY.md - Long-term Memory

*Your curated knowledge base. Write significant facts, decisions, and lessons here.*

## User Preferences
<!-- Add user preferences as you learn them -->

## Important Decisions
<!-- Record decisions that should persist across sessions -->

## Lessons Learned
<!-- Document mistakes and insights to avoid repeating them -->

---
*Update this file whenever you learn something worth remembering permanently.*
`,

  'USER.md': `# USER.md - User Profile

*Information about the person you're helping.*

- **Name:** 
- **Preferred name:** 
- **Timezone:** 
- **Language:** 

## Notes
<!-- What do they care about? What are their habits? -->

---
*The more you know, the better you can help.*
`,

  'PROJECT.md': `# PROJECT.md - Current Context

*Describe the current project or task context here.*

## Overview
<!-- What are we working on? -->

## Goals
<!-- What are we trying to achieve? -->

## Constraints
<!-- Any limitations or requirements? -->

---
*Keep this updated as the project evolves.*
`,
};

/**
 * 加载模板文件
 */
export async function loadTemplates(): Promise<Map<string, string>> {
  const templates = new Map<string, string>();

  // 尝试从 templates 目录加载
  const templatesDir = path.resolve(__dirname, '../../templates');

  for (const filename of TEMPLATE_FILES) {
    try {
      const filePath = path.join(templatesDir, filename);
      const content = await fs.readFile(filePath, 'utf-8');
      templates.set(filename, content);
    } catch {
      // 使用内置模板作为后备
      templates.set(filename, BUILTIN_TEMPLATES[filename] ?? '');
    }
  }

  return templates;
}

/**
 * 获取单个模板
 */
export async function getTemplate(filename: string): Promise<string> {
  const templates = await loadTemplates();
  return templates.get(filename) ?? '';
}
