use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row, ToSql};
use serde_json;
use std::path::Path;

use crate::types::{DownloadHistoryRecord, MarkedTag, Message, UploadHistoryRecord};

#[derive(Clone)]
pub struct DbMessage {
    pub endpoint_id: String,
    pub filename: String,
    pub sender: String,
    pub timestamp_ms: i64,
    pub size: i64,
    pub kind: String,
    pub original_name: String,
    pub etag: Option<String>,
    pub mtime: Option<String>,
    pub content: Option<String>,
    pub local_path: Option<String>,
    pub remote_path: Option<String>,
    pub file_hash: Option<String>,
    pub marked: bool,
    pub marked_tag_ids: Vec<String>,
    pub marked_pinned: bool,
    pub format: String,
}

#[derive(Clone)]
pub struct DbDownloadHistory {
    #[allow(dead_code)]
    pub id: i64,
    pub endpoint_id: String,
    pub filename: String,
    pub original_name: String,
    pub saved_path: Option<String>,
    pub status: String,
    pub error: Option<String>,
    pub file_size: i64,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Clone)]
pub struct DbUploadHistory {
    #[allow(dead_code)]
    pub id: i64,
    pub endpoint_id: String,
    pub filename: String,
    pub original_name: String,
    pub local_path: Option<String>,
    pub status: String,
    pub error: Option<String>,
    pub file_size: i64,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Clone)]
pub struct DbPartialDownload {
    pub endpoint_id: String,
    pub filename: String,
    pub original_name: String,
    pub final_path: String,
    pub temp_path: String,
    pub downloaded_bytes: i64,
    pub total_bytes: i64,
    pub etag: Option<String>,
    pub mtime: Option<String>,
    pub updated_at_ms: i64,
}

fn parse_tag_ids(raw: String) -> Vec<String> {
    let mut tag_ids = serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default();
    tag_ids.sort();
    tag_ids.dedup();
    tag_ids
}

fn serialize_tag_ids(tag_ids: &[String]) -> rusqlite::Result<String> {
    serde_json::to_string(tag_ids).map_err(|err| {
        rusqlite::Error::ToSqlConversionFailure(Box::new(err))
    })
}

pub fn init_db(path: &Path, default_endpoint_id: Option<&str>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| format!("创建数据库目录失败: {err}"))?;
    }

    let mut conn = Connection::open(path).map_err(|err| format!("打开数据库失败: {err}"))?;
    let table_exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='messages'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| format!("检查数据库表失败: {err}"))?;

    if table_exists.is_none() {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS messages (        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        sender TEXT NOT NULL,        timestamp_ms INTEGER NOT NULL,        size INTEGER NOT NULL,        kind TEXT NOT NULL,        original_name TEXT NOT NULL,        etag TEXT,        mtime TEXT,        content TEXT,        local_path TEXT,        remote_path TEXT,        file_hash TEXT,        marked BOOLEAN NOT NULL DEFAULT 0,        marked_tag_ids TEXT NOT NULL DEFAULT '[]',        marked_pinned BOOLEAN NOT NULL DEFAULT 0,        format TEXT NOT NULL DEFAULT 'text',        PRIMARY KEY(endpoint_id, filename)      );      CREATE TABLE IF NOT EXISTS marked_tags (        endpoint_id TEXT NOT NULL,        id TEXT NOT NULL,        name TEXT NOT NULL,        PRIMARY KEY(endpoint_id, id)      );      CREATE TABLE IF NOT EXISTS download_history (        id INTEGER PRIMARY KEY AUTOINCREMENT,        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        original_name TEXT NOT NULL,        saved_path TEXT,        status TEXT NOT NULL,        error TEXT,        file_size INTEGER NOT NULL DEFAULT 0,        created_at_ms INTEGER NOT NULL,        updated_at_ms INTEGER NOT NULL,        UNIQUE(endpoint_id, filename)      );      CREATE TABLE IF NOT EXISTS upload_history (        id INTEGER PRIMARY KEY AUTOINCREMENT,        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        original_name TEXT NOT NULL,        local_path TEXT,        status TEXT NOT NULL,        error TEXT,        file_size INTEGER NOT NULL DEFAULT 0,        created_at_ms INTEGER NOT NULL,        updated_at_ms INTEGER NOT NULL,        UNIQUE(endpoint_id, filename)      );      CREATE TABLE IF NOT EXISTS partial_downloads (        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        original_name TEXT NOT NULL,        final_path TEXT NOT NULL,        temp_path TEXT NOT NULL,        downloaded_bytes INTEGER NOT NULL DEFAULT 0,        total_bytes INTEGER NOT NULL DEFAULT 0,        etag TEXT,        mtime TEXT,        updated_at_ms INTEGER NOT NULL,        PRIMARY KEY(endpoint_id, filename)      );",
        )
        .map_err(|err| format!("初始化数据库表失败: {err}"))?;
        return Ok(());
    }

    let mut has_endpoint_id = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        for row in rows {
            if row.map_err(|err| format!("读取消息表结构失败: {err}"))? == "endpoint_id" {
                has_endpoint_id = true;
                break;
            }
        }
    }

    if !has_endpoint_id {
        let fallback_id = default_endpoint_id.unwrap_or("legacy");
        let endpoint_id = if fallback_id.trim().is_empty() {
            "legacy"
        } else {
            fallback_id
        };
        let tx = conn
            .transaction()
            .map_err(|err| format!("迁移消息表失败: {err}"))?;
        tx.execute_batch(
            "CREATE TABLE messages_new (        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        sender TEXT NOT NULL,        timestamp_ms INTEGER NOT NULL,        size INTEGER NOT NULL,        kind TEXT NOT NULL,        original_name TEXT NOT NULL,        etag TEXT,        mtime TEXT,        content TEXT,        local_path TEXT,        remote_path TEXT,        file_hash TEXT,        marked BOOLEAN NOT NULL DEFAULT 0,        marked_tag_ids TEXT NOT NULL DEFAULT '[]',        marked_pinned BOOLEAN NOT NULL DEFAULT 0,        format TEXT NOT NULL DEFAULT 'text',        PRIMARY KEY(endpoint_id, filename)      );",
        )
        .map_err(|err| format!("迁移消息表失败: {err}"))?;
        tx.execute(
            "INSERT INTO messages_new        (endpoint_id, filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path, remote_path, file_hash, marked, marked_tag_ids, marked_pinned, format)        SELECT ?1, filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path, NULL, NULL, 0, '[]', 0, 'text' FROM messages",
            params![endpoint_id],
        )
        .map_err(|err| format!("迁移消息表失败: {err}"))?;
        tx.execute_batch("DROP TABLE messages; ALTER TABLE messages_new RENAME TO messages;")
            .map_err(|err| format!("迁移消息表失败: {err}"))?;
        tx.commit()
            .map_err(|err| format!("迁移消息表失败: {err}"))?;
    }

    // 补充 file_hash 列，兼容旧版本数据库
    let mut has_file_hash = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        for row in rows {
            if row.map_err(|err| format!("读取消息表结构失败: {err}"))? == "file_hash" {
                has_file_hash = true;
                break;
            }
        }
    }

    if !has_file_hash {
        conn.execute("ALTER TABLE messages ADD COLUMN file_hash TEXT", [])
            .map_err(|err| format!("补充 file_hash 列失败: {err}"))?;
    }

    // 补充 marked 列，兼容旧版本数据库
    let mut has_marked = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        for row in rows {
            if row.map_err(|err| format!("读取消息表结构失败: {err}"))? == "marked" {
                has_marked = true;
                break;
            }
        }
    }

    let mut has_remote_path = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        for row in rows {
            if row.map_err(|err| format!("读取消息表结构失败: {err}"))? == "remote_path" {
                has_remote_path = true;
                break;
            }
        }
    }

    if !has_remote_path {
        conn.execute("ALTER TABLE messages ADD COLUMN remote_path TEXT", [])
            .map_err(|err| format!("补充 remote_path 列失败: {err}"))?;
    }

    if !has_marked {
        conn.execute(
            "ALTER TABLE messages ADD COLUMN marked BOOLEAN NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|err| format!("补充 marked 列失败: {err}"))?;
    }

    // 补充 format 列，兼容旧版本数据库
    let mut has_marked_tag_ids = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("读取消息表结构失败：{err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("读取消息表结构失败：{err}"))?;
        for row in rows {
            if row.map_err(|err| format!("读取消息表结构失败：{err}"))?
                == "marked_tag_ids"
            {
                has_marked_tag_ids = true;
                break;
            }
        }
    }

    if !has_marked_tag_ids {
        conn.execute(
            "ALTER TABLE messages ADD COLUMN marked_tag_ids TEXT NOT NULL DEFAULT '[]'",
            [],
        )
        .map_err(|err| format!("补充 marked_tag_ids 列失败：{err}"))?;
    }

    let mut has_marked_pinned = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("读取消息表结构失败：{err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("读取消息表结构失败：{err}"))?;
        for row in rows {
            if row.map_err(|err| format!("读取消息表结构失败：{err}"))?
                == "marked_pinned"
            {
                has_marked_pinned = true;
                break;
            }
        }
    }

    if !has_marked_pinned {
        conn.execute(
            "ALTER TABLE messages ADD COLUMN marked_pinned BOOLEAN NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|err| format!("补充 marked_pinned 列失败：{err}"))?;
    }

    let mut has_format = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        for row in rows {
            if row.map_err(|err| format!("读取消息表结构失败: {err}"))? == "format" {
                has_format = true;
                break;
            }
        }
    }

    if !has_format {
        conn.execute(
            "ALTER TABLE messages ADD COLUMN format TEXT NOT NULL DEFAULT 'text'",
            [],
        )
        .map_err(|err| format!("补充 format 列失败: {err}"))?;
    }

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS marked_tags (        endpoint_id TEXT NOT NULL,        id TEXT NOT NULL,        name TEXT NOT NULL,        PRIMARY KEY(endpoint_id, id)      );      CREATE TABLE IF NOT EXISTS download_history (        id INTEGER PRIMARY KEY AUTOINCREMENT,        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        original_name TEXT NOT NULL,        saved_path TEXT,        status TEXT NOT NULL,        error TEXT,        file_size INTEGER NOT NULL DEFAULT 0,        created_at_ms INTEGER NOT NULL,        updated_at_ms INTEGER NOT NULL,        UNIQUE(endpoint_id, filename)      );      CREATE TABLE IF NOT EXISTS upload_history (        id INTEGER PRIMARY KEY AUTOINCREMENT,        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        original_name TEXT NOT NULL,        local_path TEXT,        status TEXT NOT NULL,        error TEXT,        file_size INTEGER NOT NULL DEFAULT 0,        created_at_ms INTEGER NOT NULL,        updated_at_ms INTEGER NOT NULL,        UNIQUE(endpoint_id, filename)      );      CREATE TABLE IF NOT EXISTS partial_downloads (        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        original_name TEXT NOT NULL,        final_path TEXT NOT NULL,        temp_path TEXT NOT NULL,        downloaded_bytes INTEGER NOT NULL DEFAULT 0,        total_bytes INTEGER NOT NULL DEFAULT 0,        etag TEXT,        mtime TEXT,        updated_at_ms INTEGER NOT NULL,        PRIMARY KEY(endpoint_id, filename)      );",
    )
    .map_err(|err| format!("初始化下载相关数据表失败: {err}"))?;

    Ok(())
}

pub fn get_message(
    path: &Path,
    endpoint_id: &str,
    filename: &str,
) -> rusqlite::Result<Option<DbMessage>> {
    let conn = Connection::open(path)?;
    conn
    .query_row(
      "SELECT endpoint_id, filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path, remote_path, file_hash, marked, marked_tag_ids, marked_pinned, format \
       FROM messages WHERE endpoint_id = ?1 AND filename = ?2",
      params![endpoint_id, filename],
      |row| {
        let marked_tag_ids: String = row.get(14)?;
        Ok(DbMessage {
          endpoint_id: row.get(0)?,
          filename: row.get(1)?,
          sender: row.get(2)?,
          timestamp_ms: row.get(3)?,
          size: row.get(4)?,
          kind: row.get(5)?,
          original_name: row.get(6)?,
          etag: row.get(7)?,
          mtime: row.get(8)?,
          content: row.get(9)?,
          local_path: row.get(10)?,
          remote_path: row.get(11)?,
          file_hash: row.get(12)?,
          marked: row.get(13)?,
          marked_tag_ids: parse_tag_ids(marked_tag_ids),
          marked_pinned: row.get(15)?,
          format: row.get(16)?,
        })
      },
    )
    .optional()
}

pub fn upsert_message(path: &Path, message: &DbMessage) -> rusqlite::Result<()> {
    let conn = Connection::open(path)?;
    conn.execute(
    "INSERT INTO messages\
      (endpoint_id, filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path, remote_path, file_hash, marked, marked_tag_ids, marked_pinned, format)\
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)\
      ON CONFLICT(endpoint_id, filename) DO UPDATE SET \
        sender=excluded.sender,\
        timestamp_ms=excluded.timestamp_ms,\
        size=excluded.size,\
        kind=excluded.kind,\
        original_name=excluded.original_name,\
        etag=excluded.etag,\
        mtime=excluded.mtime,\
        content=excluded.content,\
        local_path=excluded.local_path,\
        remote_path=excluded.remote_path,\
        file_hash=excluded.file_hash,\
        marked=excluded.marked,\
        marked_tag_ids=excluded.marked_tag_ids,\
        marked_pinned=excluded.marked_pinned,\
        format=excluded.format",
    params![
      message.endpoint_id,
      message.filename,
      message.sender,
      message.timestamp_ms,
      message.size,
      message.kind,
      message.original_name,
      message.etag,
      message.mtime,
      message.content,
      message.local_path,
      message.remote_path,
      message.file_hash,
      message.marked,
      serialize_tag_ids(&message.marked_tag_ids)?,
      message.marked_pinned,
      message.format,
    ],
  )?;
    Ok(())
}

pub fn list_messages(path: &Path, endpoint_id: &str) -> rusqlite::Result<Vec<Message>> {
    list_messages_paged(path, endpoint_id, None, None, false)
}

pub fn list_messages_paged(
    path: &Path,
    endpoint_id: &str,
    limit: Option<i64>,
    offset: Option<i64>,
    only_marked: bool,
) -> rusqlite::Result<Vec<Message>> {
    let conn = Connection::open(path)?;

    let where_clause = if only_marked {
        "WHERE endpoint_id = ?1 AND marked = 1"
    } else {
        "WHERE endpoint_id = ?1"
    };

    // 使用子查询实现：先按时间倒序取最新的 N 条，再按时间正序返回
    let sql = match (limit, offset) {
        (Some(lim), Some(off)) => format!(
            "SELECT * FROM (\
              SELECT filename, sender, timestamp_ms, size, kind, original_name, content, local_path, remote_path, file_hash, marked, marked_tag_ids, marked_pinned, format \
              FROM messages {} ORDER BY timestamp_ms DESC LIMIT {} OFFSET {}\
            ) ORDER BY timestamp_ms ASC",
            where_clause, lim, off
        ),
        (Some(lim), None) => format!(
            "SELECT * FROM (\
              SELECT filename, sender, timestamp_ms, size, kind, original_name, content, local_path, remote_path, file_hash, marked, marked_tag_ids, marked_pinned, format \
              FROM messages {} ORDER BY timestamp_ms DESC LIMIT {}\
            ) ORDER BY timestamp_ms ASC",
            where_clause, lim
        ),
        _ => format!(
            "SELECT filename, sender, timestamp_ms, size, kind, original_name, content, local_path, remote_path, file_hash, marked, marked_tag_ids, marked_pinned, format \
             FROM messages {} ORDER BY timestamp_ms ASC",
            where_clause
        ),
    };

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([endpoint_id], |row| {
        let marked_tag_ids: String = row.get(11)?;
        Ok(Message {
            filename: row.get(0)?,
            sender: row.get(1)?,
            timestamp_ms: row.get(2)?,
            size: row.get(3)?,
            kind: row.get(4)?,
            original_name: row.get(5)?,
            content: row.get(6)?,
            local_path: row.get(7)?,
            remote_path: row.get(8)?,
            file_hash: row.get(9)?,
            download_exists: false,
            marked: row.get(10)?,
            marked_tag_ids: parse_tag_ids(marked_tag_ids),
            marked_pinned: row.get(12)?,
            format: row.get(13)?,
        })
    })?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(row?);
    }
    Ok(messages)
}

pub fn count_messages(path: &Path, endpoint_id: &str, only_marked: bool) -> rusqlite::Result<i64> {
    let conn = Connection::open(path)?;
    let sql = if only_marked {
        "SELECT COUNT(*) FROM messages WHERE endpoint_id = ?1 AND marked = 1"
    } else {
        "SELECT COUNT(*) FROM messages WHERE endpoint_id = ?1"
    };
    conn.query_row(&sql, params![endpoint_id], |row| row.get(0))
}

pub fn list_marked_messages(
    path: &Path,
    endpoint_id: &str,
    tag_id: Option<&str>,
    search_query: Option<&str>,
) -> rusqlite::Result<Vec<Message>> {
    let conn = Connection::open(path)?;
    let normalized_search = search_query
        .map(str::trim)
        .filter(|query| !query.is_empty())
        .map(|query| format!("%{}%", query.to_lowercase()));
    let mut sql =
        "SELECT filename, sender, timestamp_ms, size, kind, original_name, content, local_path, remote_path, file_hash, marked, marked_tag_ids, marked_pinned, format \
         FROM messages WHERE endpoint_id = ?1 AND marked = 1"
            .to_string();
    if normalized_search.is_some() {
        sql.push_str(
            " AND (LOWER(COALESCE(content, '')) LIKE ?2 OR LOWER(COALESCE(original_name, '')) LIKE ?2 OR LOWER(filename) LIKE ?2)",
        );
    }
    sql.push_str(" ORDER BY marked_pinned DESC, timestamp_ms DESC");
    let mut stmt = conn.prepare(&sql)?;
    let map_row = |row: &Row<'_>| -> rusqlite::Result<Message> {
        let marked_tag_ids: String = row.get(11)?;
        Ok(Message {
            filename: row.get(0)?,
            sender: row.get(1)?,
            timestamp_ms: row.get(2)?,
            size: row.get(3)?,
            kind: row.get(4)?,
            original_name: row.get(5)?,
            content: row.get(6)?,
            local_path: row.get(7)?,
            remote_path: row.get(8)?,
            file_hash: row.get(9)?,
            download_exists: false,
            marked: row.get(10)?,
            marked_tag_ids: parse_tag_ids(marked_tag_ids),
            marked_pinned: row.get(12)?,
            format: row.get(13)?,
        })
    };
    let rows = if let Some(search_term) = normalized_search.as_deref() {
        stmt.query_map(params![endpoint_id, search_term], map_row)?
    } else {
        stmt.query_map(params![endpoint_id], map_row)?
    };

    let mut messages = Vec::new();
    for row in rows {
        let message = row?;
        if let Some(expected_tag_id) = tag_id {
            if !message
                .marked_tag_ids
                .iter()
                .any(|message_tag_id| message_tag_id == expected_tag_id)
            {
                continue;
            }
        }
        messages.push(message);
    }
    Ok(messages)
}

pub fn replace_marked_tags(
    path: &Path,
    endpoint_id: &str,
    tags: &[MarkedTag],
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM marked_tags WHERE endpoint_id = ?1",
        params![endpoint_id],
    )?;
    for tag in tags {
        tx.execute(
            "INSERT INTO marked_tags (endpoint_id, id, name) VALUES (?1, ?2, ?3)",
            params![endpoint_id, tag.id, tag.name],
        )?;
    }
    tx.commit()
}

pub fn list_marked_tags(path: &Path, endpoint_id: &str) -> rusqlite::Result<Vec<MarkedTag>> {
    let conn = Connection::open(path)?;
    let mut stmt = conn.prepare(
        "SELECT id, name FROM marked_tags WHERE endpoint_id = ?1 ORDER BY name COLLATE NOCASE ASC",
    )?;
    let rows = stmt.query_map([endpoint_id], |row| {
        Ok(MarkedTag {
            id: row.get(0)?,
            name: row.get(1)?,
        })
    })?;
    let mut tags = Vec::new();
    for row in rows {
        tags.push(row?);
    }
    Ok(tags)
}

pub fn prune_messages(path: &Path, endpoint_id: &str, keep: &[String]) -> rusqlite::Result<()> {
    let conn = Connection::open(path)?;
    if keep.is_empty() {
        conn.execute(
            "DELETE FROM messages WHERE endpoint_id = ?1",
            params![endpoint_id],
        )?;
        return Ok(());
    }
    let placeholders = std::iter::repeat("?")
        .take(keep.len())
        .collect::<Vec<_>>()
        .join(",");
    let sql =
        format!("DELETE FROM messages WHERE endpoint_id = ?1 AND filename NOT IN ({placeholders})");
    let mut params: Vec<&dyn ToSql> = Vec::with_capacity(keep.len() + 1);
    params.push(&endpoint_id);
    for item in keep {
        params.push(item);
    }
    conn.execute(&sql, params_from_iter(params))?;
    Ok(())
}

pub fn delete_messages(
    path: &Path,
    endpoint_id: &str,
    filenames: &[String],
) -> rusqlite::Result<usize> {
    let conn = Connection::open(path)?;
    if filenames.is_empty() {
        return Ok(0);
    }
    let placeholders = std::iter::repeat("?")
        .take(filenames.len())
        .collect::<Vec<_>>()
        .join(",");
    let sql =
        format!("DELETE FROM messages WHERE endpoint_id = ?1 AND filename IN ({placeholders})");
    let mut params: Vec<&dyn ToSql> = Vec::with_capacity(filenames.len() + 1);
    params.push(&endpoint_id);
    for item in filenames {
        params.push(item);
    }
    conn.execute(&sql, params_from_iter(params))
}

#[allow(dead_code)]
pub fn delete_messages_before(
    path: &Path,
    endpoint_id: &str,
    cutoff_ms: i64,
) -> rusqlite::Result<usize> {
    let conn = Connection::open(path)?;
    conn.execute(
        "DELETE FROM messages WHERE endpoint_id = ?1 AND timestamp_ms < ?2",
        params![endpoint_id, cutoff_ms],
    )
}

pub fn get_download_history(path: &Path, id: i64) -> rusqlite::Result<Option<DbDownloadHistory>> {
    let conn = Connection::open(path)?;
    conn.query_row(
        "SELECT id, endpoint_id, filename, original_name, saved_path, status, error, file_size, created_at_ms, updated_at_ms \
         FROM download_history WHERE id = ?1",
        params![id],
        |row| {
            Ok(DbDownloadHistory {
                id: row.get(0)?,
                endpoint_id: row.get(1)?,
                filename: row.get(2)?,
                original_name: row.get(3)?,
                saved_path: row.get(4)?,
                status: row.get(5)?,
                error: row.get(6)?,
                file_size: row.get(7)?,
                created_at_ms: row.get(8)?,
                updated_at_ms: row.get(9)?,
            })
        },
    )
    .optional()
}

fn get_download_history_by_key(
    conn: &Connection,
    endpoint_id: &str,
    filename: &str,
) -> rusqlite::Result<Option<DbDownloadHistory>> {
    conn.query_row(
        "SELECT id, endpoint_id, filename, original_name, saved_path, status, error, file_size, created_at_ms, updated_at_ms \
         FROM download_history WHERE endpoint_id = ?1 AND filename = ?2",
        params![endpoint_id, filename],
        |row| {
            Ok(DbDownloadHistory {
                id: row.get(0)?,
                endpoint_id: row.get(1)?,
                filename: row.get(2)?,
                original_name: row.get(3)?,
                saved_path: row.get(4)?,
                status: row.get(5)?,
                error: row.get(6)?,
                file_size: row.get(7)?,
                created_at_ms: row.get(8)?,
                updated_at_ms: row.get(9)?,
            })
        },
    )
    .optional()
}

pub fn upsert_download_history(
    path: &Path,
    entry: &DbDownloadHistory,
) -> rusqlite::Result<DbDownloadHistory> {
    let conn = Connection::open(path)?;
    conn.execute(
        "INSERT INTO download_history \
         (endpoint_id, filename, original_name, saved_path, status, error, file_size, created_at_ms, updated_at_ms) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
         ON CONFLICT(endpoint_id, filename) DO UPDATE SET \
           original_name=excluded.original_name, \
           saved_path=COALESCE(excluded.saved_path, download_history.saved_path), \
           status=excluded.status, \
           error=excluded.error, \
           file_size=excluded.file_size, \
           updated_at_ms=excluded.updated_at_ms",
        params![
            entry.endpoint_id,
            entry.filename,
            entry.original_name,
            entry.saved_path,
            entry.status,
            entry.error,
            entry.file_size,
            entry.created_at_ms,
            entry.updated_at_ms,
        ],
    )?;
    get_download_history_by_key(&conn, &entry.endpoint_id, &entry.filename)?
        .ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn list_download_history(path: &Path) -> rusqlite::Result<Vec<DownloadHistoryRecord>> {
    let conn = Connection::open(path)?;
    let mut stmt = conn.prepare(
        "SELECT id, endpoint_id, filename, original_name, saved_path, status, error, file_size, created_at_ms, updated_at_ms \
         FROM download_history ORDER BY updated_at_ms DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        let saved_path: Option<String> = row.get(4)?;
        let local_exists = saved_path
            .as_ref()
            .map(|path| Path::new(path).is_file())
            .unwrap_or(false);
        Ok(DownloadHistoryRecord {
            id: row.get(0)?,
            endpoint_id: row.get(1)?,
            filename: row.get(2)?,
            original_name: row.get(3)?,
            saved_path,
            status: row.get(5)?,
            error: row.get(6)?,
            file_size: row.get(7)?,
            created_at_ms: row.get(8)?,
            updated_at_ms: row.get(9)?,
            local_exists,
        })
    })?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn get_upload_history_by_key(
    conn: &Connection,
    endpoint_id: &str,
    filename: &str,
) -> rusqlite::Result<Option<DbUploadHistory>> {
    conn.query_row(
        "SELECT id, endpoint_id, filename, original_name, local_path, status, error, file_size, created_at_ms, updated_at_ms \
         FROM upload_history WHERE endpoint_id = ?1 AND filename = ?2",
        params![endpoint_id, filename],
        |row| {
            Ok(DbUploadHistory {
                id: row.get(0)?,
                endpoint_id: row.get(1)?,
                filename: row.get(2)?,
                original_name: row.get(3)?,
                local_path: row.get(4)?,
                status: row.get(5)?,
                error: row.get(6)?,
                file_size: row.get(7)?,
                created_at_ms: row.get(8)?,
                updated_at_ms: row.get(9)?,
            })
        },
    )
    .optional()
}

pub fn upsert_upload_history(
    path: &Path,
    entry: &DbUploadHistory,
) -> rusqlite::Result<DbUploadHistory> {
    let conn = Connection::open(path)?;
    conn.execute(
        "INSERT INTO upload_history \
         (endpoint_id, filename, original_name, local_path, status, error, file_size, created_at_ms, updated_at_ms) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
         ON CONFLICT(endpoint_id, filename) DO UPDATE SET \
           original_name=excluded.original_name, \
           local_path=COALESCE(excluded.local_path, upload_history.local_path), \
           status=excluded.status, \
           error=excluded.error, \
           file_size=excluded.file_size, \
           updated_at_ms=excluded.updated_at_ms",
        params![
            entry.endpoint_id,
            entry.filename,
            entry.original_name,
            entry.local_path,
            entry.status,
            entry.error,
            entry.file_size,
            entry.created_at_ms,
            entry.updated_at_ms,
        ],
    )?;
    get_upload_history_by_key(&conn, &entry.endpoint_id, &entry.filename)?
        .ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn list_upload_history(path: &Path) -> rusqlite::Result<Vec<UploadHistoryRecord>> {
    let conn = Connection::open(path)?;
    let mut stmt = conn.prepare(
        "SELECT id, endpoint_id, filename, original_name, local_path, status, error, file_size, created_at_ms, updated_at_ms \
         FROM upload_history ORDER BY updated_at_ms DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        let local_path: Option<String> = row.get(4)?;
        let local_exists = local_path
            .as_ref()
            .map(|path| Path::new(path).is_file())
            .unwrap_or(false);
        Ok(UploadHistoryRecord {
            id: row.get(0)?,
            endpoint_id: row.get(1)?,
            filename: row.get(2)?,
            original_name: row.get(3)?,
            local_path,
            status: row.get(5)?,
            error: row.get(6)?,
            file_size: row.get(7)?,
            created_at_ms: row.get(8)?,
            updated_at_ms: row.get(9)?,
            local_exists,
        })
    })?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

pub fn delete_download_history(path: &Path, id: i64) -> rusqlite::Result<usize> {
    let conn = Connection::open(path)?;
    conn.execute("DELETE FROM download_history WHERE id = ?1", params![id])
}

pub fn delete_download_history_many(path: &Path, ids: &[i64]) -> rusqlite::Result<usize> {
    if ids.is_empty() {
        return Ok(0);
    }
    let conn = Connection::open(path)?;
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!("DELETE FROM download_history WHERE id IN ({placeholders})");
    conn.execute(&sql, params_from_iter(ids.iter()))
}

pub fn delete_upload_history_many(path: &Path, ids: &[i64]) -> rusqlite::Result<usize> {
    if ids.is_empty() {
        return Ok(0);
    }
    let conn = Connection::open(path)?;
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!("DELETE FROM upload_history WHERE id IN ({placeholders})");
    conn.execute(&sql, params_from_iter(ids.iter()))
}

pub fn get_partial_download(
    path: &Path,
    endpoint_id: &str,
    filename: &str,
) -> rusqlite::Result<Option<DbPartialDownload>> {
    let conn = Connection::open(path)?;
    conn.query_row(
        "SELECT endpoint_id, filename, original_name, final_path, temp_path, downloaded_bytes, total_bytes, etag, mtime, updated_at_ms \
         FROM partial_downloads WHERE endpoint_id = ?1 AND filename = ?2",
        params![endpoint_id, filename],
        |row| {
            Ok(DbPartialDownload {
                endpoint_id: row.get(0)?,
                filename: row.get(1)?,
                original_name: row.get(2)?,
                final_path: row.get(3)?,
                temp_path: row.get(4)?,
                downloaded_bytes: row.get(5)?,
                total_bytes: row.get(6)?,
                etag: row.get(7)?,
                mtime: row.get(8)?,
                updated_at_ms: row.get(9)?,
            })
        },
    )
    .optional()
}

pub fn upsert_partial_download(path: &Path, entry: &DbPartialDownload) -> rusqlite::Result<()> {
    let conn = Connection::open(path)?;
    conn.execute(
        "INSERT INTO partial_downloads \
         (endpoint_id, filename, original_name, final_path, temp_path, downloaded_bytes, total_bytes, etag, mtime, updated_at_ms) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) \
         ON CONFLICT(endpoint_id, filename) DO UPDATE SET \
           original_name=excluded.original_name, \
           final_path=excluded.final_path, \
           temp_path=excluded.temp_path, \
           downloaded_bytes=excluded.downloaded_bytes, \
           total_bytes=excluded.total_bytes, \
           etag=excluded.etag, \
           mtime=excluded.mtime, \
           updated_at_ms=excluded.updated_at_ms",
        params![
            entry.endpoint_id,
            entry.filename,
            entry.original_name,
            entry.final_path,
            entry.temp_path,
            entry.downloaded_bytes,
            entry.total_bytes,
            entry.etag,
            entry.mtime,
            entry.updated_at_ms,
        ],
    )?;
    Ok(())
}

pub fn delete_partial_download(
    path: &Path,
    endpoint_id: &str,
    filename: &str,
) -> rusqlite::Result<usize> {
    let conn = Connection::open(path)?;
    conn.execute(
        "DELETE FROM partial_downloads WHERE endpoint_id = ?1 AND filename = ?2",
        params![endpoint_id, filename],
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("transfer-genie-{name}-{unique}.sqlite3"))
    }

    fn sample_message(
        filename: &str,
        timestamp_ms: i64,
        tag_ids: &[&str],
        marked_pinned: bool,
    ) -> DbMessage {
        DbMessage {
            endpoint_id: "endpoint-1".to_string(),
            filename: filename.to_string(),
            sender: "tester".to_string(),
            timestamp_ms,
            size: 1,
            kind: "text".to_string(),
            original_name: filename.to_string(),
            etag: None,
            mtime: None,
            content: Some(filename.to_string()),
            local_path: None,
            remote_path: None,
            file_hash: None,
            marked: true,
            marked_tag_ids: tag_ids.iter().map(|tag_id| (*tag_id).to_string()).collect(),
            marked_pinned,
            format: "text".to_string(),
        }
    }

    #[test]
    fn init_db_migrates_legacy_marked_messages_with_default_metadata() {
        let path = temp_db_path("legacy-marked-migration");
        let conn = Connection::open(&path).expect("create legacy db");
        conn.execute_batch(
            "CREATE TABLE messages (
                endpoint_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                sender TEXT NOT NULL,
                timestamp_ms INTEGER NOT NULL,
                size INTEGER NOT NULL,
                kind TEXT NOT NULL,
                original_name TEXT NOT NULL,
                etag TEXT,
                mtime TEXT,
                content TEXT,
                local_path TEXT,
                remote_path TEXT,
                file_hash TEXT,
                marked BOOLEAN NOT NULL DEFAULT 0,
                format TEXT NOT NULL DEFAULT 'text',
                PRIMARY KEY(endpoint_id, filename)
            );",
        )
        .expect("seed legacy schema");
        conn.execute(
            "INSERT INTO messages
             (endpoint_id, filename, sender, timestamp_ms, size, kind, original_name, content, marked, format)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                "endpoint-1",
                "legacy.txt",
                "tester",
                100_i64,
                1_i64,
                "text",
                "legacy.txt",
                "legacy content",
                true,
                "text"
            ],
        )
        .expect("insert legacy row");
        drop(conn);

        init_db(&path, None).expect("migrate database");

        let message = get_message(&path, "endpoint-1", "legacy.txt")
            .expect("load migrated message")
            .expect("migrated message should exist");
        assert!(message.marked);
        assert!(message.marked_tag_ids.is_empty());
        assert!(!message.marked_pinned);
        assert!(list_marked_tags(&path, "endpoint-1")
            .expect("list marked tags after migration")
            .is_empty());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn list_marked_messages_filters_by_tag_and_sorts_pinned_first() {
        let path = temp_db_path("marked-message-order");
        init_db(&path, None).expect("initialize database");

        upsert_message(&path, &sample_message("tag-a-old.txt", 100, &["tag-a"], false))
            .expect("insert old tagged message");
        upsert_message(&path, &sample_message("tag-a-pinned.txt", 200, &["tag-a"], true))
            .expect("insert pinned tagged message");
        upsert_message(&path, &sample_message("tag-b-new.txt", 300, &["tag-b"], false))
            .expect("insert second tag message");

        let all_messages = list_marked_messages(&path, "endpoint-1", None, None)
            .expect("list all marked messages");
        let all_filenames: Vec<_> = all_messages
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(
            all_filenames,
            vec!["tag-a-pinned.txt", "tag-b-new.txt", "tag-a-old.txt"]
        );

        let filtered_messages = list_marked_messages(&path, "endpoint-1", Some("tag-a"), None)
            .expect("list filtered marked messages");
        let filtered_filenames: Vec<_> = filtered_messages
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(filtered_filenames, vec!["tag-a-pinned.txt", "tag-a-old.txt"]);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn list_marked_messages_filters_by_search_query() {
        let path = temp_db_path("marked-message-search");
        init_db(&path, None).expect("initialize database");

        upsert_message(&path, &sample_message("合同-草稿.txt", 100, &["tag-a"], false))
            .expect("insert matching text message");

        let mut file_message = sample_message("archive.bin", 200, &["tag-b"], false);
        file_message.kind = "file".to_string();
        file_message.original_name = "客户合同.pdf".to_string();
        file_message.content = None;
        upsert_message(&path, &file_message).expect("insert matching file message");

        upsert_message(&path, &sample_message("无关记录.txt", 300, &["tag-a"], false))
            .expect("insert non-matching message");

        let matched_messages = list_marked_messages(&path, "endpoint-1", None, Some("合同"))
            .expect("list searched marked messages");
        let matched_filenames: Vec<_> = matched_messages
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(matched_filenames, vec!["archive.bin", "合同-草稿.txt"]);

        let tag_filtered_messages =
            list_marked_messages(&path, "endpoint-1", Some("tag-a"), Some("合同"))
                .expect("list searched tag-filtered messages");
        let tag_filtered_filenames: Vec<_> = tag_filtered_messages
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(tag_filtered_filenames, vec!["合同-草稿.txt"]);

        let all_messages = list_marked_messages(&path, "endpoint-1", None, Some("   "))
            .expect("blank search should behave like no search");
        assert_eq!(all_messages.len(), 3);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn delete_messages_removes_entries_from_marked_list_results() {
        let path = temp_db_path("marked-message-delete-refresh");
        init_db(&path, None).expect("initialize database");

        upsert_message(&path, &sample_message("keep.txt", 300, &["tag-a"], false))
            .expect("insert kept message");
        upsert_message(&path, &sample_message("delete-a.txt", 200, &["tag-a"], false))
            .expect("insert deleted message");
        upsert_message(&path, &sample_message("delete-b.txt", 100, &["tag-b"], true))
            .expect("insert deleted pinned message");

        let deleted = delete_messages(
            &path,
            "endpoint-1",
            &["delete-a.txt".to_string(), "delete-b.txt".to_string()],
        )
        .expect("delete marked messages");
        assert_eq!(deleted, 2);

        let remaining = list_marked_messages(&path, "endpoint-1", None, None)
            .expect("list marked messages after delete");
        let remaining_filenames: Vec<_> = remaining
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(remaining_filenames, vec!["keep.txt"]);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn replace_marked_tags_overwrites_endpoint_catalog_and_keeps_name_sorting() {
        let path = temp_db_path("marked-tag-catalog");
        init_db(&path, None).expect("initialize database");

        replace_marked_tags(
            &path,
            "endpoint-1",
            &[
                MarkedTag {
                    id: "tag-b".to_string(),
                    name: "Beta".to_string(),
                },
                MarkedTag {
                    id: "tag-a".to_string(),
                    name: "alpha".to_string(),
                },
            ],
        )
        .expect("seed first catalog");
        replace_marked_tags(
            &path,
            "endpoint-1",
            &[MarkedTag {
                id: "tag-c".to_string(),
                name: "Gamma".to_string(),
            }],
        )
        .expect("replace catalog");

        let tags = list_marked_tags(&path, "endpoint-1").expect("list replaced tags");
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].id, "tag-c");
        assert_eq!(tags[0].name, "Gamma");

        let _ = std::fs::remove_file(path);
    }
}
