# 🧠 openmemory

> 透明、本地优先的 LLM 记忆增强引擎

openmemory 为本地部署的 LLM 提供**长期记忆能力**。使用纯 Markdown 文件存储记忆，支持向量语义搜索和 BM25 关键词搜索的混合检索。

## ✨ 特性

- 🗂️ **记忆即文件** - 记忆是纯 Markdown 文件，可读、可编辑、可版本控制
- 🔍 **混合搜索** - 向量语义搜索 (70%) + BM25 关键词搜索 (30%)
- 🏠 **本地优先** - 零外部依赖，无需付费向量数据库，数据留在本地
- ⚡ **轻量高效** - 使用 SQLite + sqlite-vec，无需额外服务
- 🤖 **自动记忆** - 智能识别重要信息，自动捕获和召回
- 🔌 **多嵌入服务** - 支持 Ollama、OpenAI、vLLM 等多种嵌入服务

---

## 📦 安装

```bash
npm install -g openmemory
# 或
pnpm add -g openmemory
```

---

## 🚀 快速开始

### 1. 初始化工作区

```bash
openmemory init
```

### 2. 配置嵌入模型

**方式一：使用 Ollama（推荐本地使用）**

```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 拉取嵌入模型
ollama pull nomic-embed-text
```

**方式二：使用 vLLM 嵌入服务**

```bash
# 启动 vLLM 嵌入服务
python -m vllm.entrypoints.openai.api_server \
  --model Alibaba-NLP/gte-Qwen2-1.5B-instruct \
  --port 8081 \
  --task embedding
```

### 3. 检查状态

```bash
openmemory doctor
```

---

## 🔌 与 vLLM 集成

openmemory 完全支持 vLLM 的推理和嵌入服务。

### 配置示例

```typescript
import { OpenMemory } from 'openmemory';

// 使用 vLLM 嵌入服务（兼容 OpenAI API）
const memory = new OpenMemory({
  embedding: {
    provider: 'openai',  // vLLM 兼容 OpenAI API
    openai: {
      apiKey: 'no-key-needed',  // vLLM 不需要 API key
      model: 'Qwen3-Embedding-0.6B',  // 你的嵌入模型
      baseUrl: 'http://192.168.150.107:8081/v1',  // vLLM 服务地址
    },
  },
});

await memory.initialize();
```

### 基础集成

```typescript
import { OpenMemory } from 'openmemory';

// 初始化记忆系统
const memory = new OpenMemory();
await memory.initialize();

async function chatWithMemory(userInput: string): Promise<string> {
  // 1️⃣ 检索相关记忆
  const memories = await memory.search(userInput, { limit: 5 });
  const context = memories
    .map(m => `[${m.path}] ${m.snippet}`)
    .join('\n---\n');

  // 2️⃣ 构建带记忆的提示词
  const systemPrompt = `你是用户的个人助手。以下是相关的历史记忆：

${context || '暂无相关记忆'}

基于这些背景知识回答问题。`;

  // 3️⃣ 调用 vLLM
  const response = await fetch('http://localhost:8000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'Qwen/Qwen2.5-7B-Instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput },
      ],
    }),
  });
  
  const data = await response.json();
  const reply = data.choices[0].message.content;

  // 4️⃣ 保存对话到每日日志
  const today = new Date().toISOString().split('T')[0];
  await memory.append(`memory/${today}.md`, `
## ${new Date().toLocaleTimeString()}
**用户**: ${userInput}
**助手**: ${reply}
---
`);

  return reply;
}
```

### 完整示例

```bash
# 运行交互式示例
npx tsx examples/vllm-integration.ts

# 运行自动记忆示例
npx tsx examples/auto-memory-integration.ts
```

---

## 🤖 自动记忆系统

openmemory 提供智能的自动记忆捕获和召回机制，参考 OpenClaw 的设计：

### Auto-Capture（自动捕获）

系统在每次对话中智能识别重要信息：

```typescript
// 触发规则示例
const MEMORY_TRIGGERS = [
  /记住|记下|别忘|remember/i,           // 记住类关键词
  /我喜欢|我偏好|我习惯|我不喜欢/i,       // 偏好类
  /我们决定|我决定|我选择/i,             // 决策类
  /我(的|是|叫|住|在)|my .+ is/i,       // 个人信息
  /\+?\d{10,}/,                         // 电话号码
  /[\w.-]+@[\w.-]+\.\w+/,               // 邮箱
  /重要|关键|必须|一定|important/i,      // 强调词
];
```

**过滤规则：**
- 文本长度 < 10 或 > 500 字符 → 跳过
- 包含 `<relevant-memories>` 标签 → 跳过（避免循环）
- 代码块、XML 标签等系统内容 → 跳过

**去重机制：**
```typescript
// 相似度 > 95% 的记忆不会重复存储
const existing = await db.searchVector(embedding, 1);
if (existing[0]?.score >= 0.95) continue;
```

**限制：** 每次对话最多捕获 3 条记忆

### 记忆分类

| 类别 | 触发词示例 |
|------|-----------|
| `preference` | 喜欢、偏好、习惯、讨厌 |
| `decision` | 决定、选择、使用、采用 |
| `entity` | 邮箱、电话、姓名 |
| `fact` | 我是、我在、我做 |

### Auto-Recall（自动召回）

每次对话开始前自动检索相关记忆：

```typescript
import { AutoMemory } from 'openmemory';

// 处理用户输入时自动召回
const recallResult = await autoMemory.onUserInput(userInput);

if (!recallResult.isEmpty) {
  // 自动注入到系统提示词中
  systemPrompt = recallResult.context + '\n\n' + basePrompt;
}

// 上下文格式
// <relevant-memories>
// 以下是可能与本次对话相关的历史记忆：
// 1. [MEMORY.md] 用户叫张三，是前端开发者 (相关度: 85%)
// 2. [memory/2026-02-01.md] 用户喜欢使用 TypeScript (相关度: 72%)
// </relevant-memories>
```

---

## 📁 记忆结构

```
~/.openmemory/workspace/
├── MEMORY.md         # 长期记忆：用户偏好、重要决策
├── USER.md           # 用户画像
├── PROJECT.md        # 项目上下文
└── memory/           # 每日日志
    ├── 2026-02-01.md
    ├── 2026-02-02.md
    └── 2026-02-03.md
```

### 写入策略

| 内容类型 | 目标文件 |
|----------|----------|
| 日常对话、临时笔记 | `memory/YYYY-MM-DD.md` |
| 持久偏好、重要决策 | `MEMORY.md` |
| 项目相关信息 | `PROJECT.md` |
| 用户个人信息 | `USER.md` |

---

## 🛠 CLI 命令

| 命令 | 说明 |
|------|------|
| `openmemory init` | 初始化工作区 |
| `openmemory status` | 查看状态 |
| `openmemory search <query>` | 搜索记忆 |
| `openmemory doctor` | 诊断问题 |
| `openmemory index --full` | 重建索引 |
| `openmemory serve` | 启动 HTTP API |

---

## 🔧 配置

配置文件位于 `~/.openmemory/config.json`：

```json
{
  "workspace": "~/.openmemory/workspace",
  "embedding": {
    "provider": "ollama",
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "model": "nomic-embed-text"
    }
  },
  "search": {
    "maxResults": 6,
    "minScore": 0.35,
    "hybrid": {
      "vectorWeight": 0.7,
      "textWeight": 0.3
    }
  }
}
```

### 使用 vLLM 作为嵌入服务

```json
{
  "embedding": {
    "provider": "openai",
    "openai": {
      "apiKey": "no-key-needed",
      "model": "Qwen3-Embedding-0.6B",
      "baseUrl": "http://192.168.150.107:8081/v1"
    }
  }
}
```

---

## 🌐 HTTP API

启动 API 服务：

```bash
openmemory serve --port 8787
```

### 接口示例

```bash
# 搜索记忆
curl -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"query": "用户偏好", "limit": 5}'

# 读取文件
curl "http://localhost:8787/get?path=MEMORY.md"

# 追加内容
curl -X POST http://localhost:8787/append \
  -H "Content-Type: application/json" \
  -d '{"path": "MEMORY.md", "content": "\n- 新的记忆内容\n"}'
```

---

## 🔗 兼容的服务

### 嵌入服务

| 服务 | 配置 |
|------|------|
| **Ollama** | `provider: 'ollama'` |
| **OpenAI** | `provider: 'openai'` |
| **vLLM** | `provider: 'openai'` + 自定义 `baseUrl` |
| **Gemini** | `provider: 'gemini'` |

### 推理服务

openmemory 可与任何兼容 OpenAI API 的推理服务集成：

| 服务 | API 地址 |
|------|----------|
| **vLLM** | `http://localhost:8000/v1` |
| **Ollama** | `http://localhost:11434/api` |
| **LocalAI** | `http://localhost:8080/v1` |
| **LM Studio** | `http://localhost:1234/v1` |
| **TGI** | `http://localhost:8080/v1` |

---

## 📂 项目结构

```
openmemory/
├── src/
│   ├── index.ts              # 统一入口
│   ├── client.ts             # HTTP 客户端
│   ├── core/                 # 核心模块
│   │   ├── engine.ts         # OpenMemory 引擎
│   │   ├── config.ts         # 配置管理
│   │   └── workspace.ts      # 工作区管理
│   ├── storage/              # 存储层
│   │   ├── sqlite.ts         # SQLite 数据库
│   │   └── schema.ts         # 表结构定义
│   ├── processing/           # 处理层
│   │   ├── chunker.ts        # Markdown 分块
│   │   ├── watcher.ts        # 文件监听
│   │   └── sync.ts           # 增量同步
│   ├── embedding/            # 嵌入模块
│   │   ├── provider.ts       # 抽象接口
│   │   ├── ollama.ts         # Ollama 实现
│   │   ├── openai.ts         # OpenAI/vLLM 实现
│   │   └── gemini.ts         # Gemini 实现
│   ├── search/               # 搜索模块
│   │   ├── hybrid.ts         # 混合搜索
│   │   ├── vector.ts         # 向量搜索
│   │   └── keyword.ts        # 关键词搜索
│   ├── memory/               # 自动记忆系统
│   │   ├── capture.ts        # Auto-Capture
│   │   └── recall.ts         # Auto-Recall
│   ├── compaction/           # 压缩模块
│   ├── tools/                # 工具层
│   ├── api/                  # HTTP API
│   └── cli/                  # CLI 命令
├── examples/                 # 集成示例
│   ├── vllm-integration.ts
│   └── auto-memory-integration.ts
├── templates/                # 引导文件模板
├── test/                     # 测试文件
│   └── integration-test.mjs  # 集成测试
├── package.json
├── tsconfig.json
└── openmemory-design.md      # 设计文档
```

---

## 🛠 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 运行集成测试
node test/integration-test.mjs

# 类型检查
pnpm typecheck
```

---

## 🧪 测试

### 运行集成测试

测试前需要配置 vLLM 服务地址，编辑 `test/integration-test.mjs`：

```javascript
// vLLM 推理服务配置
const VLLM_CONFIG = {
  baseUrl: 'http://192.168.150.107:8080/v1',
  model: 'Qwen3-0.6B',
};

// vLLM 嵌入服务配置
const EMBEDDING_CONFIG = {
  baseUrl: 'http://192.168.150.107:8081/v1',
  model: 'Qwen3-Embedding-0.6B',
};
```

运行测试：

```bash
node test/integration-test.mjs
```

测试项目：
- ✅ vLLM 推理服务连接
- ✅ vLLM 嵌入服务连接
- ✅ OpenMemory 初始化
- ✅ 记忆写入
- ✅ 记忆搜索（向量检索）
- ✅ 集成对话

---

## 📖 文档

- [设计文档](openmemory-design.md) - 完整的系统架构和设计说明

---

## 📄 License

MIT
