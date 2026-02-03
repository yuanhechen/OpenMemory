import { existsSync } from 'node:fs';
import { loadConfig, getStateDir, getConfigPath } from '../../core/config.js';
import { Database } from '../../storage/sqlite.js';
import { OllamaEmbeddingProvider } from '../../embedding/ollama.js';

/**
 * status 命令 - 查看记忆状态
 */
export async function statusCommand(): Promise<void> {
  console.log('\n🧠 openmemory status');
  console.log('──────────────────────\n');

  const config = await loadConfig();

  // 工作区状态
  console.log('工作区:');
  console.log(`  路径: ${config.workspace}`);
  console.log(`  状态: ${existsSync(config.workspace) ? '✓ 已创建' : '✗ 未创建'}`);

  // 配置状态
  console.log('\n配置:');
  console.log(`  配置文件: ${getConfigPath()}`);
  console.log(`  嵌入提供商: ${config.embedding.provider}`);

  if (config.embedding.provider === 'ollama') {
    console.log(`  Ollama 地址: ${config.embedding.ollama?.baseUrl}`);
    console.log(`  嵌入模型: ${config.embedding.ollama?.model}`);
  }

  // 索引状态
  console.log('\n索引:');
  console.log(`  数据库路径: ${config.storage.indexPath}`);

  if (existsSync(config.storage.indexPath)) {
    try {
      const db = new Database(config.storage.indexPath);
      await db.initialize();
      const stats = await db.getStats();
      await db.close();

      console.log(`  已索引文件: ${stats.filesCount}`);
      console.log(`  文本块数量: ${stats.chunksCount}`);
      console.log(`  向量搜索: ${db.isVecEnabled() ? '✓ 可用' : '✗ 不可用'}`);

      if (stats.lastSync) {
        const lastSyncDate = new Date(stats.lastSync).toLocaleString();
        console.log(`  最后同步: ${lastSyncDate}`);
      }
    } catch (error) {
      console.log(`  状态: ✗ 无法读取`);
    }
  } else {
    console.log(`  状态: 未初始化`);
  }

  // 嵌入服务状态
  if (config.embedding.provider === 'ollama') {
    console.log('\nOllama 状态:');
    try {
      const ollama = new OllamaEmbeddingProvider(
        config.embedding.ollama?.baseUrl ?? 'http://localhost:11434',
        config.embedding.ollama?.model ?? 'nomic-embed-text'
      );
      const connected = await ollama.checkConnection();
      console.log(`  连接: ${connected ? '✓ 正常' : '✗ 无法连接'}`);
    } catch {
      console.log(`  连接: ✗ 错误`);
    }
  }

  console.log('\n');
}
