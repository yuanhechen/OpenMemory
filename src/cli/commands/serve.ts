import { startAPIServer } from '../../api/server.js';
import { loadConfig } from '../../core/config.js';

/**
 * serve 命令 - 启动 API 服务
 */
export async function serveCommand(options: { port?: number; host?: string }): Promise<void> {
  const config = await loadConfig();

  // 覆盖配置
  if (options.port) {
    config.api.port = options.port;
  }
  if (options.host) {
    config.api.host = options.host;
  }

  console.log('\n🧠 openmemory serve');
  console.log('──────────────────────\n');

  try {
    const { memory, server } = await startAPIServer(config);

    // 优雅关闭
    const shutdown = async () => {
      console.log('\n正在关闭服务...');
      await server.stop();
      await memory.close();
      console.log('服务已关闭。\n');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    console.log('\nAPI 端点:');
    console.log(`  GET  /health    - 健康检查`);
    console.log(`  GET  /status    - 状态信息`);
    console.log(`  GET  /get       - 读取文件`);
    console.log(`  POST /search    - 搜索记忆`);
    console.log(`  POST /append    - 追加内容`);
    console.log(`  POST /write     - 写入文件`);
    console.log(`  POST /reindex   - 重建索引`);
    console.log('\n按 Ctrl+C 停止服务\n');
  } catch (error) {
    console.error('启动服务失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
