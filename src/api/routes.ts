import { IncomingMessage, ServerResponse, createServer, Server } from 'node:http';
import { OpenMemory } from '../core/engine.js';

/**
 * API 路由处理器
 */
export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  memory: OpenMemory
) => Promise<void>;

/**
 * 路由定义
 */
export const routes: Record<string, Record<string, RouteHandler>> = {
  GET: {
    '/health': healthHandler,
    '/status': statusHandler,
    '/get': getHandler,
  },
  POST: {
    '/search': searchHandler,
    '/append': appendHandler,
    '/write': writeHandler,
    '/reindex': reindexHandler,
  },
};

/**
 * 健康检查
 */
async function healthHandler(
  req: IncomingMessage,
  res: ServerResponse,
  memory: OpenMemory
): Promise<void> {
  sendJson(res, 200, { status: 'ok', version: '0.1.0' });
}

/**
 * 状态查询
 */
async function statusHandler(
  req: IncomingMessage,
  res: ServerResponse,
  memory: OpenMemory
): Promise<void> {
  try {
    const status = await memory.getStatus();
    sendJson(res, 200, status);
  } catch (error) {
    sendError(res, 500, 'Failed to get status', error);
  }
}

/**
 * 读取文件
 */
async function getHandler(
  req: IncomingMessage,
  res: ServerResponse,
  memory: OpenMemory
): Promise<void> {
  try {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const path = url.searchParams.get('path');

    if (!path) {
      sendError(res, 400, 'Missing required parameter: path');
      return;
    }

    const startLine = url.searchParams.get('startLine');
    const endLine = url.searchParams.get('endLine');

    const content = await memory.get(
      path,
      startLine ? parseInt(startLine) : undefined,
      endLine ? parseInt(endLine) : undefined
    );

    sendJson(res, 200, { content, path });
  } catch (error) {
    sendError(res, 500, 'Failed to read file', error);
  }
}

/**
 * 搜索记忆
 */
async function searchHandler(
  req: IncomingMessage,
  res: ServerResponse,
  memory: OpenMemory
): Promise<void> {
  try {
    const body = await parseJsonBody(req);
    const query = body.query as string;
    const limit = body.limit as number | undefined;
    const minScore = body.minScore as number | undefined;

    if (!query) {
      sendError(res, 400, 'Missing required parameter: query');
      return;
    }

    const results = await memory.search(query, { limit, minScore });
    sendJson(res, 200, { results, count: results.length });
  } catch (error) {
    sendError(res, 500, 'Search failed', error);
  }
}

/**
 * 追加内容
 */
async function appendHandler(
  req: IncomingMessage,
  res: ServerResponse,
  memory: OpenMemory
): Promise<void> {
  try {
    const body = await parseJsonBody(req);
    const path = body.path as string;
    const content = body.content as string;

    if (!path || !content) {
      sendError(res, 400, 'Missing required parameters: path, content');
      return;
    }

    await memory.append(path, content);
    sendJson(res, 200, { success: true, path });
  } catch (error) {
    sendError(res, 500, 'Failed to append content', error);
  }
}

/**
 * 写入文件
 */
async function writeHandler(
  req: IncomingMessage,
  res: ServerResponse,
  memory: OpenMemory
): Promise<void> {
  try {
    const body = await parseJsonBody(req);
    const path = body.path as string;
    const content = body.content as string;

    if (!path || content === undefined) {
      sendError(res, 400, 'Missing required parameters: path, content');
      return;
    }

    await memory.write(path, content);
    sendJson(res, 200, { success: true, path });
  } catch (error) {
    sendError(res, 500, 'Failed to write file', error);
  }
}

/**
 * 重建索引
 */
async function reindexHandler(
  req: IncomingMessage,
  res: ServerResponse,
  memory: OpenMemory
): Promise<void> {
  try {
    const body = await parseJsonBody(req);
    const full = (body?.full as boolean) ?? false;

    const result = await memory.reindex(full);
    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, 500, 'Reindex failed', error);
  }
}

/**
 * 解析 JSON 请求体
 */
async function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * 发送 JSON 响应
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * 发送错误响应
 */
function sendError(
  res: ServerResponse,
  status: number,
  message: string,
  error?: unknown
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  sendJson(res, status, {
    error: message,
    details: errorMessage,
  });
}
