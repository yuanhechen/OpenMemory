import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { OpenMemory, createOpenMemory } from '../core/engine.js';
import { OpenMemoryConfig } from '../core/config.js';
import { routes } from './routes.js';

/**
 * API 服务器配置
 */
export interface ServerConfig {
  port: number;
  host: string;
}

/**
 * API 服务器
 */
export class APIServer {
  private config: ServerConfig;
  private memory: OpenMemory;
  private server?: Server;

  constructor(memory: OpenMemory, config: ServerConfig) {
    this.memory = memory;
    this.config = config;
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer(this.handleRequest.bind(this));

      this.server.on('error', reject);

      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`🧠 openmemory API server running at http://${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = undefined;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 处理请求
   */
  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    // CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method ?? 'GET';

    // 查找路由
    const methodRoutes = routes[method];
    if (!methodRoutes) {
      this.sendError(res, 405, `Method ${method} not allowed`);
      return;
    }

    const handler = methodRoutes[pathname];
    if (!handler) {
      this.sendError(res, 404, `Route ${pathname} not found`);
      return;
    }

    try {
      await handler(req, res, this.memory);
    } catch (error) {
      console.error('Request handler error:', error);
      this.sendError(res, 500, 'Internal server error');
    }
  }

  /**
   * 发送错误响应
   */
  private sendError(res: ServerResponse, status: number, message: string): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }
}

/**
 * 创建并启动 API 服务器
 */
export async function startAPIServer(
  config?: Partial<OpenMemoryConfig>
): Promise<{ memory: OpenMemory; server: APIServer }> {
  const memory = await createOpenMemory(config);
  const memoryConfig = memory.getConfig();

  const server = new APIServer(memory, {
    port: memoryConfig.api.port,
    host: memoryConfig.api.host,
  });

  await server.start();

  return { memory, server };
}
