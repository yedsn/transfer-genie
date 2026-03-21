use rusqlite::{params, params_from_iter, Connection, OptionalExtension, ToSql};
use std::path::Path;

use crate::types::{DownloadHistoryRecord, Message};

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
    pub file_hash: Option<String>,
    pub marked: bool,
    pub format: String,
}

#[derive(Clone)]
pub struct DbDownloadHistory {
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

pub fn init_db(path: &Path, default_endpoint_id: Option<&str>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| format!("幹秀方象垂朕村払移: {err}"))?;
    }
    let mut conn = Connection::open(path).map_err(|err| format!("嬉蝕方象垂払移: {err}"))?;
    let table_exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='messages'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;

    if table_exists.is_none() {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS messages (\
        endpoint_id TEXT NOT NULL,\
        filename TEXT NOT NULL,\
        sender TEXT NOT NULL,\
        timestamp_ms INTEGER NOT NULL,\
        size INTEGER NOT NULL,\
        kind TEXT NOT NULL,\
        original_name TEXT NOT NULL,\
        etag TEXT,\
        mtime TEXT,\
        content TEXT,\
        local_path TEXT,\
        file_hash TEXT,\
        PRIMARY KEY(endpoint_id, filename)\
      );\
      CREATE TABLE IF NOT EXISTS download_history (\
        id INTEGER PRIMARY KEY AUTOINCREMENT,\
        endpoint_id TEXT NOT NULL,\
        filename TEXT NOT NULL,\
        original_name TEXT NOT NULL,\
        saved_path TEXT,\
        status TEXT NOT NULL,\
        error TEXT,\
        file_size INTEGER NOT NULL DEFAULT 0,\
        created_at_ms INTEGER NOT NULL,\
        updated_at_ms INTEGER NOT NULL,\
        UNIQUE(endpoint_id, filename)\
      );\
      CREATE TABLE IF NOT EXISTS partial_downloads (\
        endpoint_id TEXT NOT NULL,\
        filename TEXT NOT NULL,\
        original_name TEXT NOT NULL,\
        final_path TEXT NOT NULL,\
        temp_path TEXT NOT NULL,\
        downloaded_bytes INTEGER NOT NULL DEFAULT 0,\
        total_bytes INTEGER NOT NULL DEFAULT 0,\
        etag TEXT,\
        mtime TEXT,\
        updated_at_ms INTEGER NOT NULL,\
        PRIMARY KEY(endpoint_id, filename)\
      );",
        )
        .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
        return Ok(());
    }

    let mut has_endpoint_id = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
        for row in rows {
            if row.map_err(|err| format!("兜兵晒方象垂払移: {err}"))? == "endpoint_id" {
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
            .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
        tx.execute_batch(
            "CREATE TABLE messages_new (\
        endpoint_id TEXT NOT NULL,\
        filename TEXT NOT NULL,\
        sender TEXT NOT NULL,\
        timestamp_ms INTEGER NOT NULL,\
        size INTEGER NOT NULL,\
        kind TEXT NOT NULL,\
        original_name TEXT NOT NULL,\
        etag TEXT,\
        mtime TEXT,\
        content TEXT,\
        local_path TEXT,\
        file_hash TEXT,\
        PRIMARY KEY(endpoint_id, filename)\
      );",
        )
        .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
        tx.execute(
      "INSERT INTO messages_new\
        (endpoint_id, filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path, file_hash)\
        SELECT ?1, filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path, NULL FROM messages",
      params![endpoint_id],
    )
    .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
        tx.execute_batch("DROP TABLE messages; ALTER TABLE messages_new RENAME TO messages;")
            .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
        tx.commit()
            .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
    }

    // 检查是否有 file_hash 列，如果没有则添加
    let mut has_file_hash = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
        for row in rows {
            if row.map_err(|err| format!("兜兵晒方象垂払移: {err}"))? == "file_hash" {
                has_file_hash = true;
                break;
            }
        }
    }

    if !has_file_hash {
        conn.execute("ALTER TABLE messages ADD COLUMN file_hash TEXT", [])
            .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
    }

    // 检查是否有 marked 列，如果没有则添加
    let mut has_marked = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
        for row in rows {
            if row.map_err(|err| format!("兜兵晒方象垂払移: {err}"))? == "marked" {
                has_marked = true;
                break;
            }
        }
    }

    if !has_marked {
        conn.execute(
            "ALTER TABLE messages ADD COLUMN marked BOOLEAN NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
    }

    // 检查是否有 format 列，如果没有则添加
    let mut has_format = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
        for row in rows {
            if row.map_err(|err| format!("兜兵晒方象垂払移: {err}"))? == "format" {
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
        .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
    }

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS download_history (\
        id INTEGER PRIMARY KEY AUTOINCREMENT,\
        endpoint_id TEXT NOT NULL,\
        filename TEXT NOT NULL,\
        original_name TEXT NOT NULL,\
        saved_path TEXT,\
        status TEXT NOT NULL,\
        error TEXT,\
        file_size INTEGER NOT NULL DEFAULT 0,\
        created_at_ms INTEGER NOT NULL,\
        updated_at_ms INTEGER NOT NULL,\
        UNIQUE(endpoint_id, filename)\
      );\
      CREATE TABLE IF NOT EXISTS partial_downloads (\
        endpoint_id TEXT NOT NULL,\
        filename TEXT NOT NULL,\
        original_name TEXT NOT NULL,\
        final_path TEXT NOT NULL,\
        temp_path TEXT NOT NULL,\
        downloaded_bytes INTEGER NOT NULL DEFAULT 0,\
        total_bytes INTEGER NOT NULL DEFAULT 0,\
        etag TEXT,\
        mtime TEXT,\
        updated_at_ms INTEGER NOT NULL,\
        PRIMARY KEY(endpoint_id, filename)\
      );",
    )
    .map_err(|err| format!("鍏滃叺鏅掓柟璞″瀭鎵曠Щ: {err}"))?;

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
      "SELECT endpoint_id, filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path, file_hash, marked, format \
       FROM messages WHERE endpoint_id = ?1 AND filename = ?2",
      params![endpoint_id, filename],
      |row| {
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
          file_hash: row.get(11)?,
          marked: row.get(12)?,
          format: row.get(13)?,
        })
      },
    )
    .optional()
}

pub fn upsert_message(path: &Path, message: &DbMessage) -> rusqlite::Result<()> {
    let conn = Connection::open(path)?;
    conn.execute(
    "INSERT INTO messages\
      (endpoint_id, filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path, file_hash, marked, format)\
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)\
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
        file_hash=excluded.file_hash,\
        marked=excluded.marked,\
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
      message.file_hash,
      message.marked,
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
        SELECT filename, sender, timestamp_ms, size, kind, original_name, content, local_path, file_hash, marked, format \
        FROM messages {} ORDER BY timestamp_ms DESC LIMIT {} OFFSET {}\
      ) ORDER BY timestamp_ms ASC",
      where_clause, lim, off
    ),
    (Some(lim), None) => format!(
      "SELECT * FROM (\
        SELECT filename, sender, timestamp_ms, size, kind, original_name, content, local_path, file_hash, marked, format \
        FROM messages {} ORDER BY timestamp_ms DESC LIMIT {}\
      ) ORDER BY timestamp_ms ASC",
      where_clause, lim
    ),
    _ => format!(
      "SELECT filename, sender, timestamp_ms, size, kind, original_name, content, local_path, file_hash, marked, format \
       FROM messages {} ORDER BY timestamp_ms ASC",
      where_clause
    ),
  };

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([endpoint_id], |row| {
        Ok(Message {
            filename: row.get(0)?,
            sender: row.get(1)?,
            timestamp_ms: row.get(2)?,
            size: row.get(3)?,
            kind: row.get(4)?,
            original_name: row.get(5)?,
            content: row.get(6)?,
            local_path: row.get(7)?,
            file_hash: row.get(8)?,
            download_exists: false,
            marked: row.get(9)?,
            format: row.get(10)?,
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

pub fn delete_download_history(path: &Path, id: i64) -> rusqlite::Result<usize> {
    let conn = Connection::open(path)?;
    conn.execute("DELETE FROM download_history WHERE id = ?1", params![id])
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
