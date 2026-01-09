use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use std::path::Path;

use crate::types::Message;

#[derive(Clone)]
pub struct DbMessage {
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
}

pub fn init_db(path: &Path) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent).map_err(|err| format!("创建数据库目录失败: {err}"))?;
  }
  let conn = Connection::open(path).map_err(|err| format!("打开数据库失败: {err}"))?;
  conn
    .execute_batch(
      "CREATE TABLE IF NOT EXISTS messages (\
      filename TEXT PRIMARY KEY,\
      sender TEXT NOT NULL,\
      timestamp_ms INTEGER NOT NULL,\
      size INTEGER NOT NULL,\
      kind TEXT NOT NULL,\
      original_name TEXT NOT NULL,\
      etag TEXT,\
      mtime TEXT,\
      content TEXT,\
      local_path TEXT\
    );",
    )
    .map_err(|err| format!("初始化数据库失败: {err}"))?;
  Ok(())
}

pub fn get_message(path: &Path, filename: &str) -> rusqlite::Result<Option<DbMessage>> {
  let conn = Connection::open(path)?;
  conn
    .query_row(
      "SELECT filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path \
       FROM messages WHERE filename = ?1",
      [filename],
      |row| {
        Ok(DbMessage {
          filename: row.get(0)?,
          sender: row.get(1)?,
          timestamp_ms: row.get(2)?,
          size: row.get(3)?,
          kind: row.get(4)?,
          original_name: row.get(5)?,
          etag: row.get(6)?,
          mtime: row.get(7)?,
          content: row.get(8)?,
          local_path: row.get(9)?,
        })
      },
    )
    .optional()
}

pub fn upsert_message(path: &Path, message: &DbMessage) -> rusqlite::Result<()> {
  let conn = Connection::open(path)?;
  conn.execute(
    "INSERT INTO messages\
      (filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path)\
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)\
      ON CONFLICT(filename) DO UPDATE SET \
        sender=excluded.sender,\
        timestamp_ms=excluded.timestamp_ms,\
        size=excluded.size,\
        kind=excluded.kind,\
        original_name=excluded.original_name,\
        etag=excluded.etag,\
        mtime=excluded.mtime,\
        content=excluded.content,\
        local_path=excluded.local_path",
    params![
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
    ],
  )?;
  Ok(())
}

pub fn list_messages(path: &Path) -> rusqlite::Result<Vec<Message>> {
  let conn = Connection::open(path)?;
  let mut stmt = conn.prepare(
    "SELECT filename, sender, timestamp_ms, size, kind, original_name, content, local_path \
     FROM messages ORDER BY timestamp_ms ASC",
  )?;

  let rows = stmt.query_map([], |row| {
    Ok(Message {
      filename: row.get(0)?,
      sender: row.get(1)?,
      timestamp_ms: row.get(2)?,
      size: row.get(3)?,
      kind: row.get(4)?,
      original_name: row.get(5)?,
      content: row.get(6)?,
      local_path: row.get(7)?,
    })
  })?;

  let mut messages = Vec::new();
  for row in rows {
    messages.push(row?);
  }
  Ok(messages)
}

pub fn prune_messages(path: &Path, keep: &[String]) -> rusqlite::Result<()> {
  let conn = Connection::open(path)?;
  if keep.is_empty() {
    conn.execute("DELETE FROM messages", [])?;
    return Ok(());
  }
  let placeholders = std::iter::repeat("?")
    .take(keep.len())
    .collect::<Vec<_>>()
    .join(",");
  let sql = format!("DELETE FROM messages WHERE filename NOT IN ({placeholders})");
  conn.execute(&sql, params_from_iter(keep.iter()))?;
  Ok(())
}
