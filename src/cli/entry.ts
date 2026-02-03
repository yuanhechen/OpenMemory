#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { statusCommand } from './commands/status.js';
import { searchCommand } from './commands/search.js';
import { serveCommand } from './commands/serve.js';
import { doctorCommand } from './commands/doctor.js';
import { indexCommand } from './commands/index.js';

const program = new Command();

program
  .name('openmemory')
  .description('🧠 透明、本地优先的 LLM 记忆增强引擎')
  .version('0.1.0');

// init 命令
program
  .command('init')
  .description('初始化工作区（引导向导）')
  .option('-w, --workspace <path>', '工作区目录')
  .action(initCommand);

// status 命令
program
  .command('status')
  .description('查看记忆状态')
  .action(statusCommand);

// search 命令
program
  .command('search <query>')
  .description('搜索记忆')
  .option('-l, --limit <number>', '返回结果数量', '6')
  .option('-s, --min-score <number>', '最低分数阈值', '0.35')
  .action((query, options) => {
    searchCommand(query, {
      limit: parseInt(options.limit),
      minScore: parseFloat(options.minScore),
    });
  });

// index 命令
program
  .command('index')
  .description('重建索引')
  .option('-f, --full', '完整重建（删除现有索引）')
  .action(indexCommand);

// serve 命令
program
  .command('serve')
  .description('启动 API 服务')
  .option('-p, --port <number>', 'API 端口', '8787')
  .option('-h, --host <string>', '绑定地址', '127.0.0.1')
  .action((options) => {
    serveCommand({
      port: parseInt(options.port),
      host: options.host,
    });
  });

// doctor 命令
program
  .command('doctor')
  .description('诊断问题')
  .action(doctorCommand);

// 解析命令行参数
program.parse();
