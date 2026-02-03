import * as p from '@clack/prompts';
import { createOpenMemory } from '../../core/engine.js';

/**
 * index 命令 - 重建索引
 */
export async function indexCommand(options: { full?: boolean }): Promise<void> {
  console.log('\n🧠 openmemory index');
  console.log('──────────────────────\n');

  const full = options.full ?? false;

  if (full) {
    console.log('模式: 完整重建（删除现有索引）');
  } else {
    console.log('模式: 增量更新');
  }

  const spinner = p.spinner();
  spinner.start('正在索引文件...');

  try {
    const memory = await createOpenMemory();
    const result = await memory.reindex(full);
    await memory.close();

    spinner.stop('索引完成');

    console.log('\n结果:');
    console.log(`  处理文件: ${result.filesIndexed}`);
    console.log(`  创建分块: ${result.chunksCreated}`);
    console.log('');
  } catch (error) {
    spinner.stop('索引失败');
    console.error('错误:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
