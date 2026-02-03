/**
 * openmemory + vLLM 集成示例
 * 
 * 本示例展示如何将 openmemory 与 vLLM 推理服务集成，
 * 让你的本地 LLM 具备长期记忆能力。
 * 
 * 前置条件：
 * 1. vLLM 服务已启动: python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-7B-Instruct
 * 2. Ollama 已安装并运行（用于嵌入向量）: ollama pull nomic-embed-text
 * 3. openmemory 已初始化: npx openmemory init
 */

import { OpenMemory } from 'openmemory';

// ============ 配置 ============

const VLLM_CONFIG = {
  baseUrl: 'http://localhost:8000/v1',      // vLLM 服务地址
  model: 'Qwen/Qwen2.5-7B-Instruct',        // 你的模型
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

// ============ 记忆增强助手 ============

class MemoryAssistant {
  private memory: OpenMemory;
  private history: Message[] = [];

  constructor() {
    this.memory = new OpenMemory();
  }

  async init(): Promise<void> {
    await this.memory.initialize();
    console.log('✅ 记忆系统已初始化');
  }

  async chat(userInput: string): Promise<string> {
    // 1️⃣ 检索相关记忆
    const memories = await this.memory.search(userInput, { limit: 5 });
    const memoryContext = memories.length > 0
      ? memories.map(m => `[${m.path}]\n${m.snippet}`).join('\n---\n')
      : '暂无相关记忆';

    // 2️⃣ 构建系统提示词
    const systemPrompt = `你是用户的个人 AI 助手，具有长期记忆能力。

## 相关历史记忆
${memoryContext}

## 指令
- 基于记忆上下文提供个性化回答
- 当用户分享重要信息（偏好、决策、个人信息）时，在回复末尾标注 [记住: 信息内容]
- 保持对话自然，不要机械引用记忆`;

    // 3️⃣ 调用 vLLM
    this.history.push({ role: 'user', content: userInput });
    
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...this.history.slice(-10), // 保留最近 10 轮对话
    ];

    const response = await callVLLM(messages);
    this.history.push({ role: 'assistant', content: response });

    // 4️⃣ 保存对话到每日日志
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString('zh-CN');
    await this.memory.append(`memory/${today}.md`, `
## ${time}
**用户**: ${userInput}
**助手**: ${response}
---
`);

    // 5️⃣ 检测并保存重要信息
    const match = response.match(/\[记住[：:]\s*([^\]]+)\]/);
    if (match) {
      await this.memory.append('MEMORY.md', `\n- ${match[1]} _(${today})_\n`);
      console.log(`💾 已保存到长期记忆: ${match[1]}`);
    }

    return response;
  }

  async close(): Promise<void> {
    await this.memory.close();
  }
}

// ============ 主程序 ============

async function main() {
  const assistant = new MemoryAssistant();
  await assistant.init();

  console.log('\n🧠 记忆增强助手已就绪 (输入 exit 退出)\n');

  // 交互式对话
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question('👤 你: ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        await assistant.close();
        rl.close();
        return;
      }

      try {
        const response = await assistant.chat(input);
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
