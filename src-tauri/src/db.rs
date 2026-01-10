use rusqlite::{params, params_from_iter, Connection, OptionalExtension, ToSql};
use std::path::Path;

use crate::types::Message;

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
    conn
      .execute_batch(
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
    conn
      .execute("ALTER TABLE messages ADD COLUMN file_hash TEXT", [])
      .map_err(|err| format!("兜兵晒方象垂払移: {err}"))?;
  }

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
      "SELECT endpoint_id, filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path, file_hash \
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
        })
      },
    )
    .optional()
}

pub fn upsert_message(path: &Path, message: &DbMessage) -> rusqlite::Result<()> {
  let conn = Connection::open(path)?;
  conn.execute(
    "INSERT INTO messages\
      (endpoint_id, filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path, file_hash)\
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)\
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
        file_hash=excluded.file_hash",
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
    ],
  )?;
  Ok(())
}

pub fn list_messages(path: &Path, endpoint_id: &str) -> rusqlite::Result<Vec<Message>> {
  let conn = Connection::open(path)?;
  let mut stmt = conn.prepare(
    "SELECT filename, sender, timestamp_ms, size, kind, original_name, content, local_path, file_hash \
     FROM messages WHERE endpoint_id = ?1 ORDER BY timestamp_ms ASC",
  )?;

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
    })
  })?;

  let mut messages = Vec::new();
  for row in rows {
    messages.push(row?);
  }
  Ok(messages)
}

pub fn prune_messages(path: &Path, endpoint_id: &str, keep: &[String]) -> rusqlite::Result<()> {
  let conn = Connection::open(path)?;
  if keep.is_empty() {
    conn.execute("DELETE FROM messages WHERE endpoint_id = ?1", params![endpoint_id])?;
    return Ok(());
  }
  let placeholders = std::iter::repeat("?")
    .take(keep.len())
    .collect::<Vec<_>>()
    .join(",");
  let sql = format!(
    "DELETE FROM messages WHERE endpoint_id = ?1 AND filename NOT IN ({placeholders})"
  );
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
  let sql = format!(
    "DELETE FROM messages WHERE endpoint_id = ?1 AND filename IN ({placeholders})"
  );
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
