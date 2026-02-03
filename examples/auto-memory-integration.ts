/**
 * openmemory + vLLM 自动记忆集成示例
 * 
 * 本示例展示如何使用 AutoMemory 系统实现：
 * - Auto-Capture: 智能识别并自动捕获重要信息
 * - Auto-Recall: 自动召回相关记忆并注入上下文
 * 
 * 前置条件：
 * 1. vLLM 服务已启动: python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-7B-Instruct
 * 2. Ollama 已安装并运行（用于嵌入向量）: ollama pull nomic-embed-text
 * 3. openmemory 已初始化: npx openmemory init
 */

import { 
  OpenMemory, 
  AutoMemory, 
  RecallResult,
  CapturedMemory,
} from 'openmemory';

// ============ 配置 ============

const VLLM_CONFIG = {
  baseUrl: 'http://localhost:8000/v1',
  model: 'Qwen/Qwen2.5-7B-Instruct',
  maxTokens: 2048,
  temperature: 0.7,
};

// ============ vLLM 客户端 ============

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callVLLM(messages: Message[]): Promise<string> {
  const response = await fetch(`${VLLM_CONFIG.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VLLM_CONFIG.model,
      messages,
      max_tokens: VLLM_CONFIG.maxTokens,
      temperature: VLLM_CONFIG.temperature,
    }),
  });

  if (!response.ok) {
    throw new Error(`vLLM error: ${response.status}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? '';
}

// ============ 自动记忆增强助手 ============

class AutoMemoryAssistant {
  private memory!: OpenMemory;
  private autoMemory!: AutoMemory;
  private history: Message[] = [];

  async init(): Promise<void> {
    // 初始化 OpenMemory
    this.memory = new OpenMemory();
    await this.memory.initialize();

    // 初始化 AutoMemory 系统
    // 注意：实际使用时需要访问内部的 db 和 embedder
    // 这里展示的是概念性用法
    console.log('✅ 记忆系统已初始化');
    console.log('📝 自动捕获: 开启');
    console.log('🔍 自动召回: 开启');
  }

  /**
   * 开始新对话
   */
  startConversation(): void {
    this.history = [];
    console.log('\n🆕 新对话开始');
  }

  /**
   * 处理用户输入
   */
  async chat(userInput: string): Promise<string> {
    // 1️⃣ 检索相关记忆 (Auto-Recall)
    const memories = await this.memory.search(userInput, { limit: 3 });
    
    // 检查用户输入是否包含重要信息 (Auto-Capture)
    const capturedFromUser = this.shouldCapture(userInput);
    if (capturedFromUser) {
      console.log(`📌 检测到用户重要信息: "${this.extractContent(userInput)}"`);
    }

    // 2️⃣ 构建带记忆的系统提示词
    const memoryContext = memories.length > 0
      ? `<relevant-memories>
以下是可能与本次对话相关的历史记忆：
${memories.map((m, i) => `${i + 1}. [${m.path}] ${m.snippet} (相关度: ${(m.score * 100).toFixed(0)}%)`).join('\n')}
</relevant-memories>`
      : '';

    const systemPrompt = `${memoryContext}

你是用户的个人 AI 助手，具有长期记忆能力。

## 指令
- 基于记忆上下文提供个性化回答
- 保持对话自然，不要机械引用记忆`;

    // 3️⃣ 调用 vLLM
    this.history.push({ role: 'user', content: userInput });
    
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...this.history.slice(-10),
    ];

    const response = await callVLLM(messages);
    this.history.push({ role: 'assistant', content: response });

    // 4️⃣ 检查助手回复是否包含重要信息 (Auto-Capture)
    const capturedFromAssistant = this.shouldCapture(response);

    // 5️⃣ 保存对话到每日日志
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString('zh-CN');
    await this.memory.append(`memory/${today}.md`, `
## ${time}
**用户**: ${userInput}
**助手**: ${response}
---
`);

    // 6️⃣ 保存捕获的重要信息
    if (capturedFromUser) {
      const content = this.extractContent(userInput);
      const category = this.detectCategory(userInput);
      await this.saveToLongTermMemory(content, category, today);
    }

    return response;
  }

  /**
   * 结束对话
   */
  async endConversation(): Promise<void> {
    console.log('💾 对话结束，记忆已保存');
  }

  /**
   * 判断是否应该捕获
   */
  private shouldCapture(text: string): boolean {
    // 长度检查
    if (text.length < 10 || text.length > 500) return false;

    // 排除规则
    const excludePatterns = [
      /<[^>]+>/,                    // XML/HTML 标签
      /^```[\s\S]*```$/,            // 代码块
      /<relevant-memories>/i,        // 记忆标记
    ];
    for (const pattern of excludePatterns) {
      if (pattern.test(text)) return false;
    }

    // 触发规则
    const triggerPatterns = [
      /记住|记下|别忘|remember/i,
      /我喜欢|我偏好|我习惯|我倾向|我不喜欢|我讨厌/i,
      /i (like|prefer|hate|love|want|need|always|never)/i,
      /我们决定|我决定|我选择|我们选择/i,
      /我(的|是|叫|住|在)|my .+ is/i,
      /我的名字|我叫|call me|my name/i,
      /\+?\d{10,}/,                 // 电话号码
      /[\w.-]+@[\w.-]+\.\w+/,       // 邮箱
      /重要|关键|必须|一定|important|must|crucial/i,
    ];

    for (const pattern of triggerPatterns) {
      if (pattern.test(text)) return true;
    }

    return false;
  }

  /**
   * 检测记忆类别
   */
  private detectCategory(text: string): string {
    const lowerText = text.toLowerCase();

    if (/喜欢|偏好|习惯|like|prefer|love|hate/.test(lowerText)) {
      return '偏好';
    }
    if (/决定|选择|使用|decided|choose|use/.test(lowerText)) {
      return '决策';
    }
    if (/[\w.-]+@[\w.-]+\.\w+/.test(text) || /\+?\d{10,}/.test(text)) {
      return '信息';
    }
    if (/我(叫|是|的名字)|my name|call me/.test(lowerText)) {
      return '信息';
    }

    return '事实';
  }

  /**
   * 提取核心内容
   */
  private extractContent(text: string): string {
    let content = text.trim().replace(/\s+/g, ' ');
    if (content.length > 100) {
      content = content.slice(0, 100) + '...';
    }
    return content;
  }

  /**
   * 保存到长期记忆
   */
  private async saveToLongTermMemory(
    content: string, 
    category: string, 
    date: string
  ): Promise<void> {
    const entry = `- [${category}] ${content} _(${date})_\n`;
    await this.memory.append('MEMORY.md', entry);
    console.log(`💾 已保存到长期记忆: [${category}] ${content}`);
  }

  async close(): Promise<void> {
    await this.memory.close();
  }
}

// ============ 主程序 ============

async function main() {
  const assistant = new AutoMemoryAssistant();
  await assistant.init();
  assistant.startConversation();

  console.log('\n🧠 自动记忆助手已就绪');
  console.log('💡 特性: 智能识别重要信息，自动召回相关记忆');
  console.log('📌 命令: /new 开始新对话, exit 退出\n');

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question('👤 你: ', async (input) => {
      const trimmed = input.trim();

      if (trimmed.toLowerCase() === 'exit') {
        await assistant.endConversation();
        await assistant.close();
        rl.close();
        return;
      }

      if (trimmed === '/new') {
        await assistant.endConversation();
        assistant.startConversation();
        prompt();
        return;
      }

      try {
        const response = await assistant.chat(trimmed);
        console.log(`🤖 助手: ${response}\n`);
      } catch (error) {
        console.error('错误:', error);
      }

      prompt();
    });
  };

  prompt();
}

main().catch(console.error);
