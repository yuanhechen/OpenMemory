import * as p from '@clack/prompts';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getStateDir, getDefaultConfig, saveConfig, OpenMemoryConfig } from '../../core/config.js';
import { Workspace } from '../../core/workspace.js';
import { loadTemplates } from '../../templates/loader.js';
import { OllamaEmbeddingProvider } from '../../embedding/ollama.js';
import { Database } from '../../storage/sqlite.js';

/**
 * init 命令 - 初始化工作区
 */
export async function initCommand(options: { workspace?: string }): Promise<void> {
  console.log('\n🧠 openmemory init');
  console.log('──────────────────\n');

  p.intro('让我们设置你的记忆空间');

  // 1. 选择工作区目录
  const defaultWorkspace = getDefaultConfig().workspace;
  const workspaceInput = await p.text({
    message: '工作区目录',
    placeholder: defaultWorkspace,
    defaultValue: options.workspace ?? defaultWorkspace,
    validate: (value) => {
      if (!value) return '请输入有效的目录路径';
      return undefined;
    },
  });

  if (p.isCancel(workspaceInput)) {
    p.cancel('已取消初始化');
    process.exit(0);
  }

  const workspacePath = workspaceInput as string;

  // 2. 选择嵌入提供商
  const providerChoice = await p.select({
    message: '嵌入向量提供商',
    options: [
      { value: 'ollama', label: 'Ollama (本地，推荐)', hint: '需要安装 Ollama' },
      { value: 'openai', label: 'OpenAI', hint: '需要 API Key' },
      { value: 'gemini', label: 'Gemini', hint: '需要 API Key' },
      { value: 'skip', label: '跳过 (稍后配置)' },
    ],
  });

  if (p.isCancel(providerChoice)) {
    p.cancel('已取消初始化');
    process.exit(0);
  }

  const config = getDefaultConfig();
  config.workspace = workspacePath;

  // 3. 根据提供商配置
  if (providerChoice === 'ollama') {
    // 检查 Ollama 是否可用
    const spinner = p.spinner();
    spinner.start('检查 Ollama 连接...');

    const ollama = new OllamaEmbeddingProvider(
      'http://localhost:11434',
      'nomic-embed-text'
    );
    const connected = await ollama.checkConnection();

    if (!connected) {
      spinner.stop('Ollama 未运行或模型未安装');
      
      p.note(
        '请确保 Ollama 正在运行，并安装嵌入模型:\n\n' +
        '  ollama pull nomic-embed-text\n\n' +
        '然后重新运行 openmemory init',
        '提示'
      );
    } else {
      spinner.stop('Ollama 连接成功');

      // 选择模型
      const models = await ollama.listModels();
      const embeddingModels = models.filter((m) => 
        m.includes('embed') || m.includes('minilm')
      );

      if (embeddingModels.length > 0) {
        const modelChoice = await p.select({
          message: 'Ollama 嵌入模型',
          options: embeddingModels.map((m) => ({
            value: m.split(':')[0],
            label: m,
          })),
        });

        if (!p.isCancel(modelChoice)) {
          config.embedding.ollama!.model = modelChoice as string;
        }
      }
    }

    config.embedding.provider = 'ollama';
  } else if (providerChoice === 'openai') {
    const apiKey = await p.password({
      message: 'OpenAI API Key',
    });

    if (!p.isCancel(apiKey)) {
      config.embedding.provider = 'openai';
      config.embedding.openai = {
        apiKey: apiKey as string,
        model: 'text-embedding-3-small',
      };
    }
  } else if (providerChoice === 'gemini') {
    const apiKey = await p.password({
      message: 'Gemini API Key',
    });

    if (!p.isCancel(apiKey)) {
      config.embedding.provider = 'gemini';
      config.embedding.gemini = {
        apiKey: apiKey as string,
        model: 'gemini-embedding-001',
      };
    }
  }

  // 4. 创建工作区
  const spinner = p.spinner();
  spinner.start('创建工作区...');

  try {
    // 加载模板
    const templates = await loadTemplates();

    // 初始化工作区
    const workspace = new Workspace(workspacePath);
    await workspace.initialize(templates);

    // 初始化数据库
    const db = new Database(config.storage.indexPath);
    await db.initialize();
    await db.close();

    // 保存配置
    await saveConfig(config);

    spinner.stop('工作区创建完成');

    // 5. 显示结果
    console.log('\n');
    p.note(
      `工作区: ${workspacePath}\n` +
      `配置文件: ${path.join(getStateDir(), 'config.json')}\n` +
      `索引数据库: ${config.storage.indexPath}`,
      '已创建'
    );

    console.log('\n下一步:');
    console.log('  openmemory status        # 查看状态');
    console.log('  openmemory serve         # 启动 API 服务');
    console.log('\n文档: https://openmemory.dev/docs\n');

  } catch (error) {
    spinner.stop('创建失败');
    p.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  p.outro('✅ openmemory 初始化完成！');
}
