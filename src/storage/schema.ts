/**
 * 数据库 Schema 定义
 */

/**
 * 创建主表的 SQL
 */
export const CREATE_CHUNKS_TABLE = `
CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    text TEXT NOT NULL,
    hash TEXT NOT NULL,
    embedding BLOB,
    model TEXT NOT NULL,
    source TEXT DEFAULT 'memory',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
)`;

/**
 * 创建向量索引表的 SQL (sqlite-vec)
 */
export const CREATE_CHUNKS_VEC_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
    id TEXT PRIMARY KEY,
    embedding FLOAT[768]
)`;

/**
 * 创建全文搜索表的 SQL (FTS5)
 */
export const CREATE_CHUNKS_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    id, path, text, model,
    content='chunks',
    content_rowid='rowid'
)`;

/**
 * 创建 FTS 触发器
 */
export const CREATE_FTS_TRIGGERS = `
-- 插入触发器
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, id, path, text, model) 
    VALUES (new.rowid, new.id, new.path, new.text, new.model);
END;

-- 删除触发器
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, id, path, text, model) 
    VALUES('delete', old.rowid, old.id, old.path, old.text, old.model);
END;

-- 更新触发器
CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, id, path, text, model) 
    VALUES('delete', old.rowid, old.id, old.path, old.text, old.model);
    INSERT INTO chunks_fts(rowid, id, path, text, model) 
    VALUES (new.rowid, new.id, new.path, new.text, new.model);
END;
`;

/**
 * 创建文件元数据表的 SQL
 */
export const CREATE_FILE_META_TABLE = `
CREATE TABLE IF NOT EXISTS file_meta (
    path TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    mtime INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL
)`;

/**
 * 创建系统元数据表的 SQL
 */
export const CREATE_META_TABLE = `
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
)`;

/**
 * 创建索引
 */
export const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(hash);
CREATE INDEX IF NOT EXISTS idx_chunks_model ON chunks(model);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);
`;

/**
 * Chunk 数据结构
 */
export interface ChunkRecord {
  id?: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  hash: string;
  embedding?: number[];
  model: string;
  source?: string;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * 文件元数据结构
 */
export interface FileMetaRecord {
  path: string;
  hash: string;
  mtime: number;
  indexedAt: number;
}

/**
 * 搜索结果结构
 */
export interface ChunkSearchResult {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  score: number;
}
