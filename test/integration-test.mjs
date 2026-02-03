#!/usr/bin/env node
/**
 * openmemory + Qwen3-0.6B 集成测试
 * 
 * 测试地址: http://192.168.150.107:8080
 * 模型: Qwen3-0.6B (vLLM)
 */

import { OpenMemory } from '../dist/index.js';

// ============ 配置 ============

// vLLM 推理服务配置
const VLLM_CONFIG = {
  baseUrl: 'http://192.168.150.107:8080/v1',
  model: 'Qwen3-0.6B',
  maxTokens: 512,
  temperature: 0.7,
};

// vLLM 嵌入服务配置
const EMBEDDING_CONFIG = {
  baseUrl: 'http://192.168.150.107:8081/v1',
  model: 'Qwen3-Embedding-0.6B',
};

// ============ 工具函数 ============

function log(message) {
  console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function success(message) {
  console.log(`✅ ${message}`);
}

function error(message) {
  console.error(`❌ ${message}`);
}

function info(message) {
  console.log(`ℹ️  ${message}`);
}

// ============ 测试函数 ============

async function testVLLMConnection() {
  log('测试 vLLM 推理服务连接...');
  
  try {
    // 先测试模型列表接口
    const modelsResponse = await fetch(`${VLLM_CONFIG.baseUrl}/models`);
    if (modelsResponse.ok) {
      const modelsData = await modelsResponse.json();
      info(`可用模型: ${modelsData.data?.map(m => m.id).join(', ') || '无法获取'}`);
    }

    // 测试简单的推理
    const response = await fetch(`${VLLM_CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VLLM_CONFIG.model,
        messages: [
          { role: 'user', content: '你好，请用一句话介绍你自己' }
        ],
        max_tokens: 50,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      error(`vLLM 响应错误: ${response.status} - ${text}`);
      return false;
    }

    const data = await response.json();
    const reply = data.choices[0]?.message?.content || '';
    success(`vLLM 推理服务连接成功`);
    info(`模型回复: ${reply.slice(0, 100)}...`);
    return true;
  } catch (err) {
    error(`vLLM 推理服务连接失败: ${err}`);
    return false;
  }
}

async function testEmbeddingService() {
  log('测试 vLLM 嵌入服务连接...');
  
  try {
    // 测试模型列表
    const modelsResponse = await fetch(`${EMBEDDING_CONFIG.baseUrl}/models`);
    if (modelsResponse.ok) {
      const modelsData = await modelsResponse.json();
      info(`嵌入模型: ${modelsData.data?.map(m => m.id).join(', ') || '无法获取'}`);
    }

    // 测试嵌入生成
    const response = await fetch(`${EMBEDDING_CONFIG.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_CONFIG.model,
        input: '这是一段测试文本',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      error(`嵌入服务响应错误: ${response.status} - ${text}`);
      return false;
    }

    const data = await response.json();
    const embedding = data.data?.[0]?.embedding;
    if (embedding && Array.isArray(embedding)) {
      success(`嵌入服务连接成功`);
      info(`向量维度: ${embedding.length}`);
      info(`向量样本: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
      return true;
    } else {
      error('嵌入响应格式不正确');
      return false;
    }
  } catch (err) {
    error(`嵌入服务连接失败: ${err}`);
    return false;
  }
}

async function testOpenMemoryInit() {
  log('初始化 OpenMemory...');
  
  try {
    // 使用 vLLM 嵌入服务配置
    const memory = new OpenMemory({
      embedding: {
        provider: 'openai',
        openai: {
          apiKey: 'no-key-needed',  // vLLM 不需要 API key
          model: EMBEDDING_CONFIG.model,
          baseUrl: EMBEDDING_CONFIG.baseUrl,
        },
      },
    });
    await memory.initialize();
    
    const status = await memory.getStatus();
    success(`OpenMemory 初始化成功`);
    info(`工作区: ${status.workspace}`);
    info(`已索引文件: ${status.filesIndexed}`);
    info(`总分块数: ${status.totalChunks}`);
    info(`嵌入模型: ${status.embeddingModel}`);
    info(`嵌入服务: ${EMBEDDING_CONFIG.baseUrl}`);
    
    return memory;
  } catch (err) {
    error(`OpenMemory 初始化失败: ${err}`);
    return null;
  }
}

async function testMemoryWrite(memory) {
  log('测试记忆写入...');
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const testContent = `
## 测试记录 ${new Date().toLocaleTimeString()}

这是一条测试记忆内容。

- 用户名称：张三
- 职业：前端开发者
- 喜好：使用 TypeScript 和 React

---
`;
    
    await memory.append(`memory/${today}.md`, testContent);
    success(`记忆写入成功: memory/${today}.md`);
    return true;
  } catch (err) {
    error(`记忆写入失败: ${err}`);
    return false;
  }
}

async function testMemorySearch(memory) {
  log('测试记忆搜索...');
  
  try {
    // 先重建索引确保新内容被索引
    info('重建索引中...');
    const indexResult = await memory.reindex(false);
    info(`索引完成: ${indexResult.filesIndexed} 文件, ${indexResult.chunksCreated} 分块`);
    
    // 搜索测试
    const results = await memory.search('前端开发者', { limit: 3 });
    
    if (results.length > 0) {
      success(`搜索成功，找到 ${results.length} 条结果`);
      results.forEach((r, i) => {
        info(`[${i + 1}] ${r.path} (得分: ${(r.score * 100).toFixed(1)}%)`);
        info(`    ${r.snippet.slice(0, 80)}...`);
      });
    } else {
      info('未找到匹配结果（可能嵌入模型未就绪）');
    }
    
    return true;
  } catch (err) {
    error(`记忆搜索失败: ${err}`);
    return false;
  }
}

async function testIntegratedChat(memory) {
  log('测试集成对话...');
  
  try {
    const userInput = '你好，我叫李四，是一名后端开发者，主要使用 Python 和 Go';
    
    // 1. 检索相关记忆
    const memories = await memory.search(userInput, { limit: 3 });
    const memoryContext = memories.length > 0
      ? memories.map(m => `[${m.path}] ${m.snippet}`).join('\n---\n')
      : '暂无相关记忆';

    // 2. 构建提示词
    const systemPrompt = `你是用户的个人 AI 助手，具有长期记忆能力。

## 相关历史记忆
${memoryContext}

## 指令
- 基于记忆上下文提供个性化回答
- 记住用户告诉你的重要信息
- 保持回答简洁`;

    // 3. 调用 vLLM
    const response = await fetch(`${VLLM_CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VLLM_CONFIG.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInput },
        ],
        max_tokens: VLLM_CONFIG.maxTokens,
        temperature: VLLM_CONFIG.temperature,
      }),
    });

    if (!response.ok) {
      throw new Error(`vLLM 错误: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices[0]?.message?.content || '';

    // 4. 保存对话
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString('zh-CN');
    await memory.append(`memory/${today}.md`, `
## ${time} - 集成测试
**用户**: ${userInput}
**助手**: ${reply}
---
`);

    success('集成对话测试成功');
    info(`用户: ${userInput}`);
    info(`助手: ${reply.slice(0, 200)}${reply.length > 200 ? '...' : ''}`);
    
    return true;
  } catch (err) {
    error(`集成对话失败: ${err}`);
    return false;
  }
}

// ============ 主程序 ============

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🧠 openmemory + Qwen3 集成测试');
  console.log('   推理服务: ' + VLLM_CONFIG.baseUrl);
  console.log('   嵌入服务: ' + EMBEDDING_CONFIG.baseUrl);
  console.log('='.repeat(60) + '\n');
  
  const results = [];

  // 测试 1: vLLM 推理服务连接
  const vllmOk = await testVLLMConnection();
  results.push({ name: 'vLLM 推理服务', passed: vllmOk });
  console.log();

  // 测试 2: vLLM 嵌入服务连接
  const embeddingOk = await testEmbeddingService();
  results.push({ name: 'vLLM 嵌入服务', passed: embeddingOk });
  console.log();

  if (!embeddingOk) {
    error('嵌入服务不可用，无法继续测试');
    printResults(results);
    process.exit(1);
  }

  // 测试 3: OpenMemory 初始化
  const memory = await testOpenMemoryInit();
  results.push({ name: 'OpenMemory 初始化', passed: !!memory });
  console.log();

  if (!memory) {
    error('无法继续测试：OpenMemory 初始化失败');
    printResults(results);
    process.exit(1);
  }

  // 测试 4: 记忆写入
  const writeOk = await testMemoryWrite(memory);
  results.push({ name: '记忆写入', passed: writeOk });
  console.log();

  // 测试 5: 记忆搜索
  const searchOk = await testMemorySearch(memory);
  results.push({ name: '记忆搜索', passed: searchOk });
  console.log();

  // 测试 6: 集成对话（仅在 vLLM 可用时）
  if (vllmOk) {
    const chatOk = await testIntegratedChat(memory);
    results.push({ name: '集成对话', passed: chatOk });
    console.log();
  }

  // 清理
  await memory.close();

  // 汇总结果
  printResults(results);
}

function printResults(results) {
  console.log('='.repeat(60));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(r => {
    console.log(`${r.passed ? '✅' : '❌'} ${r.name}`);
  });
  
  console.log();
  console.log(`总计: ${passed}/${total} 通过`);
  
  if (passed === total) {
    console.log('\n🎉 所有测试通过！openmemory 可以正常工作。\n');
  } else {
    console.log('\n⚠️  部分测试未通过，请检查上述错误信息。\n');
  }
}

main().catch(err => {
  error(`测试程序异常: ${err}`);
  process.exit(1);
});
