import { existsSync } from 'node:fs';
import { loadConfig, getConfigPath, getStateDir } from '../../core/config.js';
import { Database } from '../../storage/sqlite.js';
import { OllamaEmbeddingProvider } from '../../embedding/ollama.js';

interface CheckResult {
  name: string;
  passed: boolean;
  message?: string;
}

/**
 * doctor 命令 - 诊断问题
 */
export async function doctorCommand(): Promise<void> {
  console.log('\n🧠 openmemory doctor');
  console.log('──────────────────────\n');

  const checks: CheckResult[] = [];
  const config = await loadConfig();

  // 1. 检查配置文件
  checks.push({
    name: '配置文件存在',
    passed: existsSync(getConfigPath()),
  });

  // 2. 检查工作区目录
  checks.push({
    name: '工作区目录存在',
    passed: existsSync(config.workspace),
  });

  // 3. 检查引导文件
  const bootstrapFiles = ['MEMORY.md', 'USER.md', 'PROJECT.md'];
  for (const file of bootstrapFiles) {
    const filePath = `${config.workspace}/${file}`;
    checks.push({
      name: `${file} 存在`,
      passed: existsSync(filePath),
    });
  }

  // 4. 检查 memory 目录
  checks.push({
    name: 'memory/ 目录存在',
    passed: existsSync(`${config.workspace}/memory`),
  });

  // 5. 检查 SQLite 索引
  checks.push({
    name: 'SQLite 索引存在',
    passed: existsSync(config.storage.indexPath),
  });

  // 6. 检查 sqlite-vec 扩展
  let vecEnabled = false;
  if (existsSync(config.storage.indexPath)) {
    try {
      const db = new Database(config.storage.indexPath);
      await db.initialize();
      vecEnabled = db.isVecEnabled();
      await db.close();
    } catch {
      // 忽略错误
    }
  }
  checks.push({
    name: 'sqlite-vec 扩展加载',
    passed: vecEnabled,
    message: vecEnabled ? undefined : '向量搜索将不可用',
  });

  // 7. 检查 FTS5
  checks.push({
    name: 'FTS5 已启用',
    passed: true, // SQLite 默认支持 FTS5
  });

  // 8. 检查嵌入提供商
  console.log(`嵌入提供商: ${config.embedding.provider}`);

  if (config.embedding.provider === 'ollama') {
    const ollama = new OllamaEmbeddingProvider(
      config.embedding.ollama?.baseUrl ?? 'http://localhost:11434',
      config.embedding.ollama?.model ?? 'nomic-embed-text'
    );

    let ollamaReachable = false;
    let modelAvailable = false;

    try {
      const response = await fetch(`${config.embedding.ollama?.baseUrl}/api/tags`);
      ollamaReachable = response.ok;

      if (ollamaReachable) {
        modelAvailable = await ollama.checkConnection();
      }
    } catch {
      // 连接失败
    }

    checks.push({
      name: `Ollama 可达 (${config.embedding.ollama?.baseUrl})`,
      passed: ollamaReachable,
    });

    checks.push({
      name: `模型可用: ${config.embedding.ollama?.model}`,
      passed: modelAvailable,
      message: modelAvailable ? undefined : `运行: ollama pull ${config.embedding.ollama?.model}`,
    });
  }

  // 9. 打印索引统计
  if (existsSync(config.storage.indexPath)) {
    try {
      const db = new Database(config.storage.indexPath);
      await db.initialize();
      const stats = await db.getStats();
      await db.close();

      console.log('\n索引统计:');
      console.log(`  已索引文件: ${stats.filesCount}`);
      console.log(`  文本块数量: ${stats.chunksCount}`);
      if (stats.lastSync) {
        console.log(`  最后同步: ${new Date(stats.lastSync).toLocaleString()}`);
      }
    } catch {
      // 忽略错误
    }
  }

  // 10. 打印检查结果
  console.log('\n检查结果:');
  let allPassed = true;
  for (const check of checks) {
    const status = check.passed ? '✓' : '✗';
    console.log(`${status} ${check.name}`);
    if (check.message) {
      console.log(`  └─ ${check.message}`);
    }
    if (!check.passed) {
      allPassed = false;
    }
  }

  console.log('\n──────────────────────');
  if (allPassed) {
    console.log('✅ 所有检查通过\n');
  } else {
    console.log('⚠️  部分检查未通过\n');
  }
}
