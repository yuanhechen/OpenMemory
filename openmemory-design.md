# 🧠 openmemory 完整设计文档

**版本**：1.0.0  
**日期**：2026-02-03  
**定位**：透明、本地优先的 LLM 记忆增强引擎

---

## 目录

1. [项目概述](#一项目概述)
2. [系统架构](#二系统架构)
3. [记忆存储设计](#三记忆存储设计)
4. [索引与检索引擎](#四索引与检索引擎)
5. [记忆工具 API](#五记忆工具-api)
   - [自动记忆系统](#54-自动记忆系统-auto-memory)
6. [文本处理](#六文本处理)
7. [会话压缩](#七会话压缩compaction)
8. [文件同步](#八文件同步)
9. [安装与初始化](#九安装与初始化)
10. [CLI 命令](#十cli-命令)
11. [配置规范](#十一配置规范)
12. [与本地 LLM 集成](#十二与本地-llm-集成)
13. [项目结构](#十三项目结构)
14. [开发路线图](#十四开发路线图)

---

## 一、项目概述

### 1.1 背景与动机

当前主流 LLM（包括本地部署的 Ollama、Llama.cpp 等）存在一个核心限制：**无状态性**。每次对话都是全新开始，模型无法"记住"用户的偏好、历史决策和长期积累的知识。

`openmemory` 的目标是为任意 LLM 提供一套**透明、可控、高性能**的记忆系统，其核心设计理念直接继承自 OpenClaw 的最佳工程实践。

### 1.2 核心设计原则

| 原则 | 说明 |
|------|------|
| **记忆即文件** | 记忆是纯 Markdown 文件，用户可读、可编辑、可版本控制 |
| **搜索胜过注入** | Agent 主动检索相关内容，而非将所有内容塞入上下文 |
| **持久胜过会话** | 重要信息以文件形式落盘，压缩无法摧毁已保存的记忆 |
| **混合胜过单一** | 同时使用向量语义搜索和 BM25 关键词搜索 |
| **本地胜过云端** | 零外部依赖，无需付费向量数据库，所有数据留在用户设备 |

### 1.3 与 OpenClaw 的关系

| 特性 | OpenClaw | openmemory |
|------|----------|------------|
| **核心功能** | Agent 运行时 + 记忆 + 多渠道 | 仅记忆模块 |
| **目标用户** | 个人 AI 助手用户 | 本地 LLM 开发者 |
| **依赖关系** | 独立运行 | 可独立运行，也可集成 |
| **人设管理** | SOUL.md, IDENTITY.md | 不涉及 |
| **记忆管理** | 完整实现 | 提取并独立 |

---

## 二、系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户应用层                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ 本地 LLM     │  │  CLI 工具    │  │  HTTP API            │   │
│  │ (Ollama等)   │  │ (openmemory)│  │  (可选)              │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
└─────────┼─────────────────┼─────────────────────┼───────────────┘
          │                 │                     │
          ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    openmemory 核心引擎                           │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    工具层 (Tool Layer)                     │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │  │
│  │  │memory_search│ │ memory_get  │ │ write (via FS)      │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   处理层 (Processing Layer)                │  │
│  │  ┌──────────┐ ┌───────────┐ ┌───────────┐ ┌────────────┐  │  │
│  │  │ Chunker  │ │ Embedder  │ │ Compactor │ │  Watcher   │  │  │
│  │  │(Markdown)│ │ (多后端)  │ │ (摘要压缩)│ │ (文件监听) │  │  │
│  │  └──────────┘ └───────────┘ └───────────┘ └────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   存储层 (Storage Layer)                   │  │
│  │  ┌─────────────────────────┐  ┌─────────────────────────┐ │  │
│  │  │     SQLite Database     │  │    Markdown Files       │ │  │
│  │  │  ┌─────────┐ ┌───────┐  │  │  ┌────────┐ ┌────────┐  │ │  │
│  │  │  │sqlite   │ │ FTS5  │  │  │  │MEMORY  │ │memory/ │  │ │  │
│  │  │  │-vec     │ │(BM25) │  │  │  │.md     │ │*.md    │  │ │  │
│  │  │  └─────────┘ └───────┘  │  │  └────────┘ └────────┘  │ │  │
│  │  └─────────────────────────┘  └─────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流向

```
写入流程:
用户/Agent ──► Markdown 文件 ──► Watcher 监听 ──► Chunker ──► Embedder ──► SQLite

读取流程:
用户/Agent ──► memory_search ──► Hybrid Query (Vector + BM25) ──► 返回 Snippets
```

---

## 三、记忆存储设计

### 3.1 两层记忆系统

| 层级 | 文件位置 | 用途 | 写入时机 |
|------|----------|------|----------|
| **第一层：每日日志** | `memory/YYYY-MM-DD.md` | 临时事实、待办、即时决策 | Agent 随时追加 |
| **第二层：长期知识** | `MEMORY.md` | 持久偏好、重要结论、经验教训 | 手动整理或 Agent 归档 |

### 3.2 引导文件 (Bootstrap Files)

安装时自动生成，每次会话可注入 LLM 的 System Prompt：

| 文件 | 作用 | 是否自动生成 |
|------|------|-------------|
| `MEMORY.md` | 长期记忆：持久偏好、重要结论 | ✅ |
| `USER.md` | 用户画像：LLM 需要了解的用户信息 | ✅ |
| `PROJECT.md` | 项目背景：当前工作的全局上下文 | ✅ |
| `memory/` | 每日日志目录 | ✅ (空目录) |

### 3.3 引导文件模板

#### `MEMORY.md`

```markdown
# MEMORY.md - Long-term Memory

*Your curated knowledge base. Write significant facts, decisions, and lessons here.*

## User Preferences
<!-- Add user preferences as you learn them -->

## Important Decisions
<!-- Record decisions that should persist across sessions -->

## Lessons Learned
<!-- Document mistakes and insights to avoid repeating them -->

---
*Update this file whenever you learn something worth remembering permanently.*
```

#### `USER.md`

```markdown
# USER.md - User Profile

*Information about the person you're helping.*

- **Name:** 
- **Preferred name:** 
- **Timezone:** 
- **Language:** 

## Notes
<!-- What do they care about? What are their habits? -->

---
*The more you know, the better you can help.*
```

#### `PROJECT.md`

```markdown
# PROJECT.md - Current Context

*Describe the current project or task context here.*

## Overview
<!-- What are we working on? -->

## Goals
<!-- What are we trying to achieve? -->

## Constraints
<!-- Any limitations or requirements? -->

---
*Keep this updated as the project evolves.*
```

### 3.4 目录结构

```
~/.openmemory/                    # 状态目录 (State Dir)
├── config.json                   # 配置文件
├── index.db                      # SQLite 索引数据库
├── logs/                         # 日志目录
│   └── openmemory.log
└── cache/                        # 嵌入缓存
    └── embeddings.db

~/.openmemory/workspace/          # 工作区 (Workspace)
├── MEMORY.md                     # 长期记忆
├── USER.md                       # 用户画像
├── PROJECT.md                    # 项目背景
└── memory/                       # 每日日志
    ├── 2026-02-01.md
    ├── 2026-02-02.md
    └── 2026-02-03.md
```

---

## 四、索引与检索引擎

### 4.1 数据库选型

使用 **SQLite** 作为唯一存储后端，集成向量和全文搜索能力：

| 组件 | 技术 | 作用 |
|------|------|------|
| 核心存储 | SQLite | 轻量、零配置、跨平台 |
| 向量搜索 | sqlite-vec | 高性能向量相似度计算 |
| 全文搜索 | FTS5 | BM25 关键词匹配 |

### 4.2 数据库 Schema

```sql
-- 主表：存储所有文本块
CREATE TABLE chunks (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,                  -- 源文件路径
    start_line INTEGER NOT NULL,         -- 起始行号
    end_line INTEGER NOT NULL,           -- 结束行号
    text TEXT NOT NULL,                  -- 原始文本
    hash TEXT NOT NULL,                  -- 内容哈希（增量更新）
    embedding BLOB,                      -- 向量表示 (Float32Array)
    model TEXT NOT NULL,                 -- 嵌入模型标识
    source TEXT DEFAULT 'memory',        -- 来源类型
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 向量索引表 (sqlite-vec)
CREATE VIRTUAL TABLE chunks_vec USING vec0(
    id TEXT PRIMARY KEY,
    embedding FLOAT[768]                 -- 维度根据模型调整
);

-- 全文搜索表 (FTS5)
CREATE VIRTUAL TABLE chunks_fts USING fts5(
    id, path, text, model,
    content='chunks',
    content_rowid='rowid'
);

-- 文件元数据表（增量同步用）
CREATE TABLE file_meta (
    path TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    mtime INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL
);

-- 系统元数据表
CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

### 4.3 嵌入模型抽象层

```typescript
interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  generate(text: string): Promise<number[]>;
  generateBatch(texts: string[]): Promise<number[][]>;
}

// 支持的后端（优先级从高到低）
const PROVIDERS = {
  // 本地优先（推荐）
  ollama: {
    models: ['nomic-embed-text', 'mxbai-embed-large', 'all-minilm'],
    dimensions: [768, 1024, 384],
  },
  
  // 远程备选
  openai: {
    models: ['text-embedding-3-small', 'text-embedding-3-large'],
    dimensions: [1536, 3072],
  },
  gemini: {
    models: ['gemini-embedding-001'],
    dimensions: [768],
  },
};
```

### 4.4 混合检索算法

```typescript
interface SearchResult {
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  score: number;           // 最终混合分数
  vectorScore: number;     // 向量相似度 (0-1)
  textScore: number;       // BM25 归一化分数 (0-1)
}

async function hybridSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
  const queryVector = await embedder.generate(query);
  
  // 1. 向量搜索 (语义相似)
  const vectorResults = await searchVector({
    queryVec: queryVector,
    limit: options.limit * options.candidateMultiplier,
  });
  
  // 2. 关键词搜索 (精确匹配)
  const textResults = await searchKeyword({
    query: query,
    limit: options.limit * options.candidateMultiplier,
  });
  
  // 3. 结果融合 (加权评分)
  const merged = mergeHybridResults({
    vectorResults,
    textResults,
    vectorWeight: options.vectorWeight ?? 0.7,
    textWeight: options.textWeight ?? 0.3,
  });
  
  // 4. 过滤低分结果
  return merged
    .filter(r => r.score >= options.minScore)
    .slice(0, options.limit);
}
```

**评分公式**：

```
FinalScore = (0.7 × VectorScore) + (0.3 × TextScore)
```

**为什么是 70/30？**
- 语义相似性是记忆回忆的主要信号
- BM25 可捕获向量可能遗漏的确切术语（名称、ID、日期）
- 这个比例在 OpenClaw 的生产环境中经过验证

---

## 五、记忆工具 API

### 5.1 memory_search

**用途**：在所有记忆文件中查找相关内容。

```typescript
interface MemorySearchParams {
  query: string;           // 搜索查询
  limit?: number;          // 返回数量 (默认 6)
  minScore?: number;       // 最低分数阈值 (默认 0.35)
  sources?: ('memory' | 'sessions')[];
}

interface MemorySearchResult {
  path: string;            // 文件路径
  startLine: number;       // 起始行
  endLine: number;         // 结束行
  snippet: string;         // 文本片段 (≤700 字符)
  score: number;           // 相关度分数
}
```

**调用示例**：

```json
{
  "tool": "memory_search",
  "params": {
    "query": "用户喜欢的编程语言",
    "limit": 5
  }
}
```

### 5.2 memory_get

**用途**：读取指定文件的完整内容或特定行范围。

```typescript
interface MemoryGetParams {
  path: string;            // 文件路径
  startLine?: number;      // 可选：起始行
  endLine?: number;        // 可选：结束行
}
```

### 5.3 写入策略

**核心原则**：没有专用的 `memory_write` 工具。Agent 使用标准的文件操作写入记忆。

| 内容类型 | 目标文件 |
|----------|----------|
| 日常笔记、"记住这个" | `memory/YYYY-MM-DD.md` |
| 持久事实、偏好、决策 | `MEMORY.md` |
| 项目相关上下文 | `PROJECT.md` |
| 用户信息更新 | `USER.md` |

### 5.4 自动记忆系统 (Auto Memory)

参考 OpenClaw 的设计，openmemory 提供智能的自动记忆捕获和召回机制：

#### 5.4.1 Auto-Capture（自动捕获）

**触发时机**：每次对话交互时（用户输入和助手回复）

**智能过滤规则**：

```typescript
// 触发规则 - 匹配这些模式的文本可能包含重要信息
const MEMORY_TRIGGERS = [
  /记住|记下|别忘|remember/i,           // 记住类关键词
  /我喜欢|我偏好|我习惯|我不喜欢/i,       // 偏好类
  /我们决定|我决定|我选择/i,             // 决策类
  /我(的|是|叫|住|在)|my .+ is/i,       // 个人信息
  /\+?\d{10,}/,                         // 电话号码
  /[\w.-]+@[\w.-]+\.\w+/,               // 邮箱
  /重要|关键|必须|一定|important/i,      // 强调词
];

// 排除规则
const EXCLUDE_PATTERNS = [
  /<[^>]+>/,                            // XML/HTML 标签
  /^```[\s\S]*```$/,                    // 代码块
  /<relevant-memories>/i,               // 已注入的记忆标记
];

function shouldCapture(text: string): boolean {
  // 长度检查
  if (text.length < 10 || text.length > 500) return false;
  
  // 排除检查
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(text)) return false;
  }
  
  // 触发检查
  return MEMORY_TRIGGERS.some(p => p.test(text));
}
```

**分类检测**：

```typescript
type MemoryCategory = 'preference' | 'decision' | 'entity' | 'fact' | 'other';

function detectCategory(text: string): MemoryCategory {
  if (/喜欢|偏好|习惯|like|prefer/.test(text)) return 'preference';
  if (/决定|选择|使用|decided|choose/.test(text)) return 'decision';
  if (/邮箱|电话|姓名|@|email/.test(text)) return 'entity';
  if (/是|在|有|做|工作/.test(text)) return 'fact';
  return 'other';
}
```

**去重机制**：

```typescript
// 相似度 > 95% 的记忆不会重复存储
const existing = await db.searchVector(embedding, 1);
if (existing[0]?.score >= 0.95) {
  return; // 跳过重复
}
```

**限制**：每次对话最多捕获 3 条记忆

#### 5.4.2 Auto-Recall（自动召回）

**触发时机**：每次 Agent 开始处理用户输入前

**流程**：

```typescript
async function autoRecall(userInput: string): Promise<RecallResult> {
  // 1. 将用户提问向量化
  const embedding = await embedder.generate(userInput);
  
  // 2. 搜索相关记忆（top 3，相似度 > 0.3）
  const results = await db.searchVector(embedding, 3);
  const filtered = results.filter(r => r.score >= 0.3);
  
  // 3. 生成上下文
  if (filtered.length === 0) {
    return { isEmpty: true, context: '' };
  }
  
  const memoriesText = filtered
    .map((r, i) => `${i + 1}. [${r.path}] ${r.snippet}`)
    .join('\n');
  
  return {
    isEmpty: false,
    context: `<relevant-memories>
以下是可能与本次对话相关的历史记忆：
${memoriesText}
</relevant-memories>`,
  };
}
```

**使用方式**：

```typescript
// 在发送给 LLM 前，注入记忆上下文
const recall = await autoRecall(userInput);
const systemPrompt = recall.isEmpty 
  ? basePrompt 
  : `${recall.context}\n\n${basePrompt}`;
```

---

## 六、文本处理

### 6.1 Markdown 感知分块器

普通的按字符切分会破坏语义边界。openmemory 的分块器能**识别 Markdown 结构**：

- 优先在标题 (`#`, `##`, `###`) 边界切分
- 保持代码块 (```) 的完整性
- 确保列表项不被中途截断
- 使用滑动窗口重叠防止信息丢失

```typescript
interface ChunkOptions {
  maxTokens: number;       // 每块最大 Token 数 (默认 512)
  overlapTokens: number;   // 重叠 Token 数 (默认 50)
  respectHeaders: boolean; // 是否尊重标题边界 (默认 true)
}

interface Chunk {
  text: string;
  path: string;
  startLine: number;
  endLine: number;
  hash: string;
}

function chunkMarkdown(text: string, options: ChunkOptions): Chunk[] {
  // 1. 按标题分割成 Sections
  const sections = text.split(/^(?=#{1,6}\s+)/m);
  
  // 2. 对每个 Section，如果过长则进一步按段落切分
  // 3. 确保每个分块都携带上下文标题信息
  // 4. 应用重叠窗口
  return chunks;
}
```

---

## 七、会话压缩 (Compaction)

### 7.1 触发条件

- **自动触发**：当对话历史 Token 数超过模型上下文窗口的 60% 时
- **手动触发**：用户执行 `/compact` 命令或调用 API

### 7.2 压缩流程

```typescript
async function compactSession(params: CompactParams): Promise<CompactResult> {
  const { messages, contextWindow, model } = params;
  
  // 1. 计算当前 Token 用量
  const totalTokens = estimateMessagesTokens(messages);
  const budgetTokens = Math.floor(contextWindow * 0.4);
  
  if (totalTokens <= budgetTokens) {
    return { compacted: false, reason: 'Within budget' };
  }
  
  // 2. 记忆刷新：压缩前让 Agent 保存重要内容
  if (config.compaction.flushBeforeCompact) {
    await flushImportantMemories(messages);
  }
  
  // 3. 分阶段摘要
  const summary = await summarizeInStages({
    messages: messages.slice(0, -5), // 保留最近 5 条原文
    model,
    maxChunkTokens: 4000,
  });
  
  // 4. 将摘要写入长期记忆
  await appendToMemory('MEMORY.md', `\n## Session Summary\n${summary}\n`);
  
  return {
    compacted: true,
    tokensBefore: totalTokens,
    tokensAfter: estimateTokens(summary) + estimateMessagesTokens(messages.slice(-5)),
    summary,
  };
}
```

### 7.3 记忆刷新 (Memory Flush)

压缩是有损过程。在压缩前执行"记忆刷新"，让 Agent 主动将重要内容写入 Markdown：

```yaml
compaction:
  flushBeforeCompact: true
  flushPrompt: |
    在压缩前，请检查当前对话中是否有以下内容需要保存：
    1. 重要的用户偏好或决策
    2. 未完成的任务或待办事项
    3. 新学到的经验教训
    如果有，请将其保存到 MEMORY.md 或 memory/今日日期.md
```

---

## 八、文件同步

### 8.1 监听机制

使用 `chokidar` 监听工作区变化：

```typescript
function startWatcher(workspaceDir: string) {
  const watcher = chokidar.watch([
    path.join(workspaceDir, '*.md'),
    path.join(workspaceDir, 'memory', '*.md'),
  ], {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  watcher.on('change', syncFile);
  watcher.on('add', syncFile);
  watcher.on('unlink', removeFromIndex);

  return watcher;
}
```

### 8.2 增量更新策略

```typescript
async function syncFile(filePath: string) {
  const content = await fs.readFile(filePath, 'utf-8');
  const newHash = hashText(content);
  
  // 检查是否需要更新
  const existing = db.get('SELECT hash FROM file_meta WHERE path = ?', [filePath]);
  if (existing?.hash === newHash) {
    return; // 内容未变，跳过
  }
  
  // 删除旧 Chunks
  db.run('DELETE FROM chunks WHERE path = ?', [filePath]);
  
  // 重新分块并索引
  const chunks = chunkMarkdown(content, defaultOptions);
  for (const chunk of chunks) {
    const embedding = await embedder.generate(chunk.text);
    db.run('INSERT INTO chunks (...) VALUES (...)', [...]);
  }
  
  // 更新文件元数据
  db.run('INSERT OR REPLACE INTO file_meta VALUES (?, ?, ?)', 
         [filePath, newHash, Date.now()]);
}
```

---

## 九、安装与初始化

### 9.1 安装方式

| 方式 | 命令 | 适用场景 |
|------|------|---------|
| **一键脚本** | `curl -fsSL https://openmemory.dev/install.sh \| bash` | 新用户 |
| **npm** | `npm install -g openmemory` | Node.js 开发者 |
| **pnpm** | `pnpm add -g openmemory` | 推荐 |
| **源码** | `git clone && pnpm build` | 贡献者 |
| **库引入** | `npm install openmemory` | 集成到项目 |

### 9.2 系统要求

- **Node.js**：≥ 20
- **操作系统**：macOS / Linux / Windows (WSL2 推荐)
- **可选**：Ollama (本地嵌入)

### 9.3 初始化向导

```bash
$ openmemory init

🧠 openmemory init
──────────────────────

? Workspace directory
  › ~/.openmemory/workspace (default)

? Embedding provider
  › Ollama (local, recommended)
    OpenAI (requires API key)
    Gemini (requires API key)
    Skip (configure later)

? Ollama embedding model
  › nomic-embed-text (768 dims, recommended)
    mxbai-embed-large (1024 dims)
    all-minilm (384 dims, fast)

Creating workspace...
  ✓ Created MEMORY.md
  ✓ Created USER.md
  ✓ Created PROJECT.md
  ✓ Created memory/ directory
  ✓ Initialized SQLite index

──────────────────────
✅ openmemory initialized!

Workspace: ~/.openmemory/workspace
Config: ~/.openmemory/config.json
Index: ~/.openmemory/index.db

Next steps:
  openmemory status        # Check status
  openmemory serve         # Start API server

Docs: https://openmemory.dev/docs
```

---

## 十、CLI 命令

### 10.1 命令结构

```
openmemory
├── init                  # 初始化工作区（引导向导）
├── status                # 查看记忆状态
├── search <query>        # 搜索记忆
├── index [--full]        # 重建索引
├── serve [--port 8787]   # 启动 API 服务
├── configure             # 配置向导
├── doctor                # 诊断问题
├── update                # 更新版本
├── export [--output]     # 导出记忆
└── help                  # 帮助
```

### 10.2 命令示例

```bash
# 初始化
openmemory init --workspace ~/my-memory

# 搜索记忆
openmemory search "用户的编程偏好" --limit 10

# 查看状态
openmemory status

# 启动 API 服务
openmemory serve --port 8787

# 诊断
openmemory doctor

# 重建索引
openmemory index --full
```

### 10.3 doctor 输出示例

```bash
$ openmemory doctor

🧠 openmemory doctor
──────────────────────

✓ Config file exists
✓ Workspace directory exists
✓ SQLite index exists
✓ sqlite-vec extension loaded
✓ FTS5 enabled

Embedding provider: ollama
  ✓ Ollama reachable (http://localhost:11434)
  ✓ Model available: nomic-embed-text

Index stats:
  Files indexed: 5
  Chunks: 42
  Last sync: 2026-02-03 10:30:00

──────────────────────
✅ All checks passed
```

---

## 十一、配置规范

### 11.1 配置文件位置

```
~/.openmemory/config.json
```

### 11.2 完整配置结构

```json
{
  "workspace": "~/.openmemory/workspace",
  
  "embedding": {
    "provider": "ollama",
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "model": "nomic-embed-text"
    },
    "openai": {
      "apiKey": "sk-...",
      "model": "text-embedding-3-small"
    },
    "gemini": {
      "apiKey": "...",
      "model": "gemini-embedding-001"
    }
  },
  
  "storage": {
    "indexPath": "~/.openmemory/index.db"
  },
  
  "chunking": {
    "maxTokens": 512,
    "overlapTokens": 50,
    "respectHeaders": true
  },
  
  "search": {
    "maxResults": 6,
    "minScore": 0.35,
    "hybrid": {
      "enabled": true,
      "vectorWeight": 0.7,
      "textWeight": 0.3,
      "candidateMultiplier": 4
    }
  },
  
  "sync": {
    "watchEnabled": true,
    "watchDebounceMs": 1500
  },
  
  "compaction": {
    "enabled": true,
    "threshold": 0.6,
    "flushBeforeCompact": true,
    "preserveRecentMessages": 5
  },
  
  "api": {
    "port": 8787,
    "host": "127.0.0.1"
  }
}
```

### 11.3 配置项说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `workspace` | `~/.openmemory/workspace` | 工作区目录 |
| `embedding.provider` | `ollama` | 嵌入模型提供商 |
| `chunking.maxTokens` | `512` | 每块最大 Token 数 |
| `chunking.overlapTokens` | `50` | 重叠 Token 数 |
| `search.maxResults` | `6` | 搜索返回数量 |
| `search.minScore` | `0.35` | 最低分数阈值 |
| `search.hybrid.vectorWeight` | `0.7` | 向量权重 |
| `search.hybrid.textWeight` | `0.3` | 文本权重 |
| `sync.watchEnabled` | `true` | 是否启用文件监听 |
| `api.port` | `8787` | API 服务端口 |

---

## 十二、与本地 LLM 集成

### 12.1 Ollama 集成示例

```javascript
import { OpenMemory } from 'openmemory';
import { Ollama } from 'ollama';

// 初始化 openmemory
const memory = new OpenMemory({
  workspace: '~/.openmemory/workspace',
  embedding: { provider: 'ollama', model: 'nomic-embed-text' },
});

const ollama = new Ollama();

async function chat(userInput) {
  // 1. 检索相关记忆
  const memories = await memory.search(userInput, { limit: 5 });
  const context = memories.map(m => `[${m.path}]\n${m.snippet}`).join('\n---\n');

  // 2. 构建增强 Prompt
  const systemPrompt = `你是用户的个人助手。以下是相关的历史记忆：

${context}

请基于这些背景知识回答用户的问题。如果需要记住什么，请明确说明。`;

  // 3. 调用 LLM
  const response = await ollama.chat({
    model: 'llama3.2',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput },
    ],
  });

  // 4. 保存本次对话到每日日志
  const today = new Date().toISOString().split('T')[0];
  await memory.append(`memory/${today}.md`, `
## ${new Date().toLocaleTimeString()}
**User**: ${userInput}
**Assistant**: ${response.message.content}
`);

  return response.message.content;
}
```

### 12.2 HTTP API 集成

启动 API 服务后，任何语言都可以调用：

```bash
openmemory serve --port 8787
```

```bash
# 搜索记忆
curl -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"query": "用户偏好", "limit": 5}'

# 读取文件
curl "http://localhost:8787/get?path=MEMORY.md"

# 写入文件
curl -X POST http://localhost:8787/append \
  -H "Content-Type: application/json" \
  -d '{"path": "memory/2026-02-03.md", "content": "新的记忆内容"}'
```

---

## 十三、项目结构

```
openmemory/
├── src/
│   ├── index.ts                # 统一入口
│   ├── client.ts               # HTTP 客户端
│   ├── core/
│   │   ├── engine.ts           # 核心引擎
│   │   ├── config.ts           # 配置加载
│   │   └── workspace.ts        # 工作区管理
│   ├── storage/
│   │   ├── sqlite.ts           # SQLite 连接
│   │   └── schema.ts           # 表结构定义
│   ├── processing/
│   │   ├── chunker.ts          # Markdown 分块器
│   │   ├── watcher.ts          # 文件监听
│   │   └── sync.ts             # 增量同步
│   ├── embedding/
│   │   ├── provider.ts         # 抽象接口
│   │   ├── ollama.ts           # Ollama 实现
│   │   ├── openai.ts           # OpenAI 实现
│   │   └── gemini.ts           # Gemini 实现
│   ├── search/
│   │   ├── vector.ts           # 向量搜索
│   │   ├── keyword.ts          # 关键词搜索
│   │   └── hybrid.ts           # 混合搜索
│   ├── memory/                 # 🆕 自动记忆系统
│   │   ├── index.ts            # 统一导出
│   │   ├── capture.ts          # Auto-Capture 自动捕获
│   │   └── recall.ts           # Auto-Recall 自动召回
│   ├── compaction/
│   │   ├── compactor.ts        # 压缩器
│   │   └── summarizer.ts       # 摘要生成
│   ├── tools/
│   │   ├── memory-search.ts    # memory_search 工具
│   │   └── memory-get.ts       # memory_get 工具
│   ├── api/
│   │   ├── server.ts           # HTTP 服务
│   │   └── routes.ts           # API 路由
│   ├── cli/
│   │   ├── entry.ts            # CLI 入口
│   │   └── commands/           # 各命令实现
│   │       ├── init.ts
│   │       ├── search.ts
│   │       ├── status.ts
│   │       ├── serve.ts
│   │       ├── doctor.ts
│   │       └── index.ts
│   └── templates/
│       └── loader.ts           # 模板加载器
├── templates/                  # 引导文件模板
│   ├── MEMORY.md
│   ├── USER.md
│   └── PROJECT.md
├── examples/                   # 集成示例
│   ├── vllm-integration.ts     # vLLM 基础集成
│   └── auto-memory-integration.ts  # 自动记忆集成
├── tests/
├── openmemory.mjs             # CLI 入口脚本
├── package.json
├── tsconfig.json
└── README.md
```

---

## 十四、开发路线图

### Phase 1：核心功能 (MVP)

- [ ] SQLite + sqlite-vec 存储
- [ ] Markdown 感知分块
- [ ] Ollama 嵌入支持
- [ ] 混合搜索 (Vector + BM25)
- [ ] CLI 工具 (init, search, status)
- [ ] 文件监听同步
- [ ] 引导文件模板

### Phase 2：生态集成

- [ ] HTTP API 服务
- [ ] OpenAI/Gemini 嵌入后端
- [ ] MCP (Model Context Protocol) 适配
- [ ] VS Code 插件
- [ ] Python SDK

### Phase 3：高级特性

- [ ] 多 Agent 隔离支持
- [ ] 自动压缩与记忆刷新
- [ ] 会话生命周期管理
- [ ] 记忆导入/导出
- [ ] Web UI 管理界面

### Phase 4：企业特性

- [ ] 团队共享记忆空间
- [ ] 权限控制
- [ ] 审计日志
- [ ] 加密存储

---

## 附录：与 OpenClaw 的对照表

| 特性 | OpenClaw | openmemory |
|------|----------|------------|
| **核心功能** | Agent + Memory + Channels | Memory Only |
| **安装命令** | `npm i -g openclaw` | `npm i -g openmemory` |
| **初始化** | `openclaw onboard` | `openmemory init` |
| **状态目录** | `~/.openclaw/` | `~/.openmemory/` |
| **工作区** | `~/.openclaw/workspace/` | `~/.openmemory/workspace/` |
| **配置格式** | JSON5 | JSON |
| **引导文件** | AGENTS, SOUL, IDENTITY, USER, TOOLS, MEMORY | MEMORY, USER, PROJECT |
| **服务模式** | Gateway (WebSocket) | HTTP API |
| **记忆存储** | SQLite + sqlite-vec | SQLite + sqlite-vec |
| **混合搜索** | ✅ 70/30 权重 | ✅ 70/30 权重 |
| **文件监听** | chokidar | chokidar |
| **分块算法** | Markdown 感知 | Markdown 感知 |

---

## 附录：package.json

```json
{
  "name": "openmemory",
  "version": "0.1.0",
  "description": "Transparent, local-first memory engine for LLMs",
  "keywords": ["llm", "memory", "rag", "vector-search", "ai"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/openmemory/openmemory"
  },
  
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  
  "bin": {
    "openmemory": "openmemory.mjs"
  },
  
  "exports": {
    ".": "./dist/index.js",
    "./client": "./dist/client.js"
  },
  
  "files": [
    "openmemory.mjs",
    "dist/**",
    "templates/**",
    "README.md",
    "LICENSE"
  ],
  
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli/entry.ts",
    "test": "vitest",
    "lint": "oxlint",
    "format": "oxfmt --write"
  },
  
  "engines": {
    "node": ">=20"
  },
  
  "dependencies": {
    "@clack/prompts": "^0.8.0",
    "better-sqlite3": "^11.0.0",
    "chokidar": "^4.0.0",
    "commander": "^12.0.0"
  },
  
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  },
  
  "optionalDependencies": {
    "sqlite-vec": "^0.1.0"
  }
}
```

---

**文档结束**
