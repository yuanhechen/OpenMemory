import { createOpenMemory } from '../../core/engine.js';

/**
 * search 命令 - 搜索记忆
 */
export async function searchCommand(
  query: string,
  options: { limit?: number; minScore?: number }
): Promise<void> {
  const { limit = 6, minScore = 0.35 } = options;

  try {
    const memory = await createOpenMemory();
    const results = await memory.search(query, { limit, minScore });

    if (results.length === 0) {
      console.log('\n没有找到相关记忆。\n');
      await memory.close();
      return;
    }

    console.log(`\n找到 ${results.length} 条相关记忆:\n`);

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      console.log(`─── ${i + 1}. ${result.path} (L${result.startLine}-${result.endLine}) ───`);
      console.log(`分数: ${result.score.toFixed(3)} (向量: ${result.vectorScore.toFixed(3)}, 文本: ${result.textScore.toFixed(3)})`);
      console.log('');
      console.log(result.snippet);
      console.log('');
    }

    await memory.close();
  } catch (error) {
    console.error('搜索失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
