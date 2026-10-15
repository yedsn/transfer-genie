use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row, ToSql};
use serde_json;
use sha2::{Digest, Sha256};
use std::path::Path;

use crate::types::{DownloadHistoryRecord, MarkedTag, Message, UploadHistoryRecord};

const UNTAGGED_MARKED_TAG_FILTER_ID: &str = "__untagged__";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingMarkedSync {
    pub endpoint_id: String,
    pub filename: String,
    pub timestamp_ms: i64,
    pub marked: bool,
    pub marked_tag_ids: Vec<String>,
    pub marked_pinned: bool,
    pub marked_due_date: Option<String>,
    pub updated_at_ms: i64,
}

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
    pub marked_due_date: Option<String>,
    pub format: String,
    pub transcript_source: Option<String>,
    pub source_audio_mime_type: Option<String>,
    pub transcript_raw_text: Option<String>,
    pub source_kind: Option<String>,
    pub source_channel_id: Option<String>,
    pub source_message_id: Option<String>,
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

#[derive(Clone, Debug)]
pub struct DbBulkDownloadResource {
    pub filename: String,
    pub timestamp_ms: i64,
    pub size: i64,
    pub original_name: String,
    pub transcript_source: Option<String>,
    pub source_audio_mime_type: Option<String>,
    pub download_status: Option<String>,
    pub saved_path: Option<String>,
    pub partial_bytes: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AttachmentSyncRecord {
    pub attachment_id: String,
    pub message_id: String,
    pub original_name: String,
    pub local_path: Option<String>,
    pub object_path: Option<String>,
    pub preview_object_path: Option<String>,
    pub mime_type: Option<String>,
    pub size: i64,
    pub sha256: Option<String>,
    pub upload_state: String,
    pub remote_revision: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OrphanAttachmentCandidate {
    pub attachment_id: String,
    pub object_path: String,
    pub preview_object_path: Option<String>,
}

#[derive(Clone, Debug)]
pub struct NewOutboxOperation {
    pub operation_id: String,
    pub endpoint_id: String,
    pub owner_scope: String,
    pub entity_type: String,
    pub entity_id: String,
    pub action: String,
    pub base_revision: i64,
    pub payload_json: String,
    pub payload_hash: String,
    pub created_at_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OutboxOperation {
    pub operation_id: String,
    pub endpoint_id: String,
    pub owner_scope: String,
    pub entity_type: String,
    pub entity_id: String,
    pub action: String,
    pub base_revision: i64,
    pub payload_json: String,
    pub payload_hash: String,
    pub depends_on_operation_id: Option<String>,
    pub state: String,
    pub attempt_count: i64,
    pub next_attempt_at_ms: i64,
    pub lease_owner: Option<String>,
    pub lease_expires_at_ms: Option<i64>,
    pub last_error: Option<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Clone, Debug)]
pub struct PulledChange {
    pub change_seq: i64,
    pub entity_type: String,
    pub entity_id: String,
    pub change_type: String,
    pub revision: i64,
    pub snapshot: Option<serde_json::Value>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SupabaseHistoryCursor {
    pub oldest_timestamp_ms: Option<i64>,
    pub oldest_message_id: Option<String>,
    pub has_more_before: bool,
    pub initialized: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TelegramDeliveryRecord {
    pub message_key: String,
    pub status: String,
    pub telegram_message_id: Option<i64>,
    pub last_error: Option<String>,
    pub last_attempt_ms: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StorageTransferItem {
    pub item_type: String,
    pub source_key: String,
    pub entity_id: String,
    pub attachment_id: Option<String>,
    pub message_operation_id: String,
    pub attachment_operation_id: Option<String>,
    pub state: String,
    pub source_revision: Option<String>,
    pub source_hash: Option<String>,
    pub total_bytes: i64,
    pub transferred_bytes: i64,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StorageTransferProgress {
    pub batch_id: String,
    pub source_profile_id: String,
    pub target_profile_id: String,
    pub source_provider_kind: String,
    pub target_provider_kind: String,
    pub source_owner_scope: String,
    pub target_owner_scope: String,
    pub status: String,
    pub phase: String,
    pub total_items: i64,
    pub applied_items: i64,
    pub skipped_items: i64,
    pub conflict_items: i64,
    pub failed_items: i64,
    pub total_bytes: i64,
    pub transferred_bytes: i64,
    pub last_error: Option<String>,
}

pub type StorageImportItem = StorageTransferItem;
pub type StorageImportProgress = StorageTransferProgress;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SyncConflictRecord {
    pub id: i64,
    pub entity_type: String,
    pub entity_id: String,
    pub local_payload_json: String,
    pub remote_payload_json: Option<String>,
    pub local_revision: i64,
    pub remote_revision: Option<i64>,
    pub created_at_ms: i64,
}

pub struct NewStorageTransferBatch<'a> {
    pub batch_id: &'a str,
    pub source_profile_id: &'a str,
    pub target_profile_id: &'a str,
    pub source_provider_kind: &'a str,
    pub target_provider_kind: &'a str,
    pub source_owner_scope: &'a str,
    pub target_owner_scope: &'a str,
    pub items: &'a [StorageTransferItem],
    pub now_ms: i64,
}

pub type NewStorageImportBatch<'a> = NewStorageTransferBatch<'a>;

fn parse_tag_ids(raw: String) -> Vec<String> {
    let mut tag_ids = serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default();
    tag_ids.sort();
    tag_ids.dedup();
    tag_ids
}

fn serialize_tag_ids(tag_ids: &[String]) -> rusqlite::Result<String> {
    serde_json::to_string(tag_ids)
        .map_err(|err| rusqlite::Error::ToSqlConversionFailure(Box::new(err)))
}

fn table_columns(conn: &Connection, table: &str) -> rusqlite::Result<Vec<String>> {
    let sql = format!("PRAGMA table_info({table})");
    conn.prepare(&sql)?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect()
}

fn table_primary_key_columns(conn: &Connection, table: &str) -> rusqlite::Result<Vec<String>> {
    let sql = format!("PRAGMA table_info({table})");
    let mut columns = conn
        .prepare(&sql)?
        .query_map([], |row| {
            Ok((row.get::<_, i64>(5)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    columns.retain(|(position, _)| *position > 0);
    columns.sort_by_key(|(position, _)| *position);
    Ok(columns.into_iter().map(|(_, name)| name).collect())
}

fn ensure_account_scoped_business_keys(conn: &mut Connection) -> rusqlite::Result<()> {
    if table_primary_key_columns(conn, "messages")? != ["endpoint_id", "owner_scope", "filename"] {
        let tx = conn.transaction()?;
        tx.execute_batch(
            "CREATE TABLE messages_account_scoped (
               endpoint_id TEXT NOT NULL,filename TEXT NOT NULL,sender TEXT NOT NULL,
               timestamp_ms INTEGER NOT NULL,size INTEGER NOT NULL,kind TEXT NOT NULL,
               original_name TEXT NOT NULL,etag TEXT,mtime TEXT,content TEXT,local_path TEXT,
               remote_path TEXT,file_hash TEXT,marked BOOLEAN NOT NULL DEFAULT 0,
               marked_tag_ids TEXT NOT NULL DEFAULT '[]',marked_pinned BOOLEAN NOT NULL DEFAULT 0,
               marked_due_date TEXT,format TEXT NOT NULL DEFAULT 'text',transcript_source TEXT,
               source_audio_mime_type TEXT,transcript_raw_text TEXT,source_kind TEXT,
               source_channel_id TEXT,source_message_id TEXT,message_id TEXT,
               remote_revision INTEGER NOT NULL DEFAULT 0,deleted_at_ms INTEGER,
               sync_state TEXT NOT NULL DEFAULT 'synced',owner_scope TEXT NOT NULL DEFAULT '',
               PRIMARY KEY(endpoint_id,owner_scope,filename)
             );
             INSERT INTO messages_account_scoped SELECT endpoint_id,filename,sender,timestamp_ms,size,
               kind,original_name,etag,mtime,content,local_path,remote_path,file_hash,marked,
               marked_tag_ids,marked_pinned,marked_due_date,format,transcript_source,
               source_audio_mime_type,transcript_raw_text,source_kind,source_channel_id,
               source_message_id,message_id,remote_revision,deleted_at_ms,
               sync_state,owner_scope FROM messages;
             DROP TABLE messages;
             ALTER TABLE messages_account_scoped RENAME TO messages;",
        )?;
        tx.commit()?;
    }
    if table_primary_key_columns(conn, "marked_tags")? != ["endpoint_id", "owner_scope", "id"] {
        let tx = conn.transaction()?;
        tx.execute_batch(
            "CREATE TABLE marked_tags_account_scoped (
               endpoint_id TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,
               owner_scope TEXT NOT NULL DEFAULT '',remote_revision INTEGER NOT NULL DEFAULT 0,
               deleted_at_ms INTEGER,sync_state TEXT NOT NULL DEFAULT 'synced',
               PRIMARY KEY(endpoint_id,owner_scope,id)
             );
             INSERT INTO marked_tags_account_scoped SELECT endpoint_id,id,name,owner_scope,
               remote_revision,deleted_at_ms,sync_state FROM marked_tags;
             DROP TABLE marked_tags;
             ALTER TABLE marked_tags_account_scoped RENAME TO marked_tags;",
        )?;
        tx.commit()?;
    }
    Ok(())
}

fn ensure_local_first_sync_schema(conn: &Connection) -> rusqlite::Result<()> {
    let columns = table_columns(conn, "messages")?;
    let additions = [
        ("message_id", "TEXT"),
        ("source_kind", "TEXT"),
        ("source_channel_id", "TEXT"),
        ("source_message_id", "TEXT"),
        ("remote_revision", "INTEGER NOT NULL DEFAULT 0"),
        ("deleted_at_ms", "INTEGER"),
        ("sync_state", "TEXT NOT NULL DEFAULT 'synced'"),
        ("owner_scope", "TEXT NOT NULL DEFAULT ''"),
    ];
    for (name, definition) in additions {
        if !columns.iter().any(|column| column == name) {
            conn.execute(
                &format!("ALTER TABLE messages ADD COLUMN {name} {definition}"),
                [],
            )?;
        }
    }
    let tag_columns = table_columns(conn, "marked_tags")?;
    for (name, definition) in [
        ("owner_scope", "TEXT NOT NULL DEFAULT ''"),
        ("remote_revision", "INTEGER NOT NULL DEFAULT 0"),
        ("deleted_at_ms", "INTEGER"),
        ("sync_state", "TEXT NOT NULL DEFAULT 'synced'"),
    ] {
        if !tag_columns.iter().any(|column| column == name) {
            conn.execute(
                &format!("ALTER TABLE marked_tags ADD COLUMN {name} {definition}"),
                [],
            )?;
        }
    }
    conn.execute_batch(
        "UPDATE messages
         SET message_id = lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) ||
             '-4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
             substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
             lower(hex(randomblob(6)))
         WHERE message_id IS NULL OR trim(message_id) = '';
         CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_profile_message_id
           ON messages(endpoint_id, owner_scope, message_id);
         CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_source
           ON messages(endpoint_id, owner_scope, source_kind, source_channel_id, source_message_id)
           WHERE source_kind IS NOT NULL AND source_channel_id IS NOT NULL
             AND source_message_id IS NOT NULL;
         CREATE INDEX IF NOT EXISTS idx_messages_profile_revision
           ON messages(endpoint_id, owner_scope, remote_revision);
         CREATE INDEX IF NOT EXISTS idx_messages_profile_deleted
           ON messages(endpoint_id, owner_scope, deleted_at_ms);
         CREATE INDEX IF NOT EXISTS idx_marked_tags_profile_owner
           ON marked_tags(endpoint_id, owner_scope, deleted_at_ms);

         CREATE TABLE IF NOT EXISTS sync_outbox (
           operation_id TEXT PRIMARY KEY,
           endpoint_id TEXT NOT NULL,
           owner_scope TEXT NOT NULL DEFAULT '',
           entity_type TEXT NOT NULL,
           entity_id TEXT NOT NULL,
           action TEXT NOT NULL,
           base_revision INTEGER NOT NULL DEFAULT 0,
           payload_json TEXT NOT NULL,
           payload_hash TEXT NOT NULL,
           depends_on_operation_id TEXT,
           state TEXT NOT NULL DEFAULT 'pending',
           attempt_count INTEGER NOT NULL DEFAULT 0,
           next_attempt_at_ms INTEGER NOT NULL DEFAULT 0,
           lease_started_at_ms INTEGER,
           last_error TEXT,
           created_at_ms INTEGER NOT NULL,
           updated_at_ms INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_sync_outbox_claim
           ON sync_outbox(endpoint_id, owner_scope, state, next_attempt_at_ms, created_at_ms);
         CREATE INDEX IF NOT EXISTS idx_sync_outbox_entity
           ON sync_outbox(endpoint_id, owner_scope, entity_type, entity_id, created_at_ms);

         CREATE TABLE IF NOT EXISTS sync_checkpoints (
           endpoint_id TEXT NOT NULL,
           owner_scope TEXT NOT NULL DEFAULT '',
           change_seq INTEGER NOT NULL DEFAULT 0,
           updated_at_ms INTEGER NOT NULL,
           PRIMARY KEY(endpoint_id, owner_scope)
         );

         CREATE TABLE IF NOT EXISTS supabase_history_cursors (
           endpoint_id TEXT NOT NULL,
           owner_scope TEXT NOT NULL DEFAULT '',
           oldest_timestamp_ms INTEGER,
           oldest_message_id TEXT,
           has_more_before INTEGER NOT NULL DEFAULT 1,
           initialized INTEGER NOT NULL DEFAULT 0,
           updated_at_ms INTEGER NOT NULL,
           PRIMARY KEY(endpoint_id, owner_scope)
         );

         CREATE TABLE IF NOT EXISTS sync_conflicts (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           endpoint_id TEXT NOT NULL,
           owner_scope TEXT NOT NULL DEFAULT '',
           entity_type TEXT NOT NULL,
           entity_id TEXT NOT NULL,
           local_payload_json TEXT NOT NULL,
           remote_payload_json TEXT,
           local_revision INTEGER NOT NULL DEFAULT 0,
           remote_revision INTEGER,
           status TEXT NOT NULL DEFAULT 'unresolved',
           created_at_ms INTEGER NOT NULL,
           resolved_at_ms INTEGER
         );
         CREATE INDEX IF NOT EXISTS idx_sync_conflicts_open
           ON sync_conflicts(endpoint_id, owner_scope, status, created_at_ms);

         CREATE TABLE IF NOT EXISTS attachment_sync (
           endpoint_id TEXT NOT NULL,
           owner_scope TEXT NOT NULL DEFAULT '',
           attachment_id TEXT NOT NULL,
           message_id TEXT NOT NULL,
           original_name TEXT NOT NULL,
           local_path TEXT,
           object_path TEXT,
           preview_object_path TEXT,
           mime_type TEXT,
           size INTEGER NOT NULL DEFAULT 0,
           sha256 TEXT,
           upload_state TEXT NOT NULL DEFAULT 'local',
           remote_revision INTEGER NOT NULL DEFAULT 0,
           deleted_at_ms INTEGER,
           last_error TEXT,
           updated_at_ms INTEGER NOT NULL,
           PRIMARY KEY(endpoint_id, owner_scope, attachment_id)
         );
         CREATE INDEX IF NOT EXISTS idx_attachment_sync_message
            ON attachment_sync(endpoint_id, owner_scope, message_id);

         CREATE TABLE IF NOT EXISTS telegram_bridge_bindings (
           binding_key TEXT PRIMARY KEY,
           profile_id TEXT NOT NULL,
           owner_scope TEXT NOT NULL DEFAULT '',
           provider_kind TEXT NOT NULL,
           last_update_id INTEGER NOT NULL DEFAULT 0,
           start_watermark_ms INTEGER NOT NULL DEFAULT 0,
           start_watermark_key TEXT NOT NULL DEFAULT '',
           updated_at_ms INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS telegram_delivery_ledger (
           binding_key TEXT NOT NULL,
           message_key TEXT NOT NULL,
           status TEXT NOT NULL,
           telegram_message_id INTEGER,
           last_error TEXT,
           last_attempt_ms INTEGER,
           PRIMARY KEY(binding_key,message_key)
         );

         CREATE TABLE IF NOT EXISTS storage_import_batches (
           batch_id TEXT PRIMARY KEY,
           source_profile_id TEXT NOT NULL,
           target_profile_id TEXT NOT NULL,
           source_provider_kind TEXT NOT NULL DEFAULT 'webdav',
           target_provider_kind TEXT NOT NULL DEFAULT 'supabase',
           source_owner_scope TEXT NOT NULL DEFAULT '',
           target_owner_scope TEXT NOT NULL,
           status TEXT NOT NULL DEFAULT 'prepared',
           phase TEXT NOT NULL DEFAULT 'planning',
           total_items INTEGER NOT NULL DEFAULT 0,
           applied_items INTEGER NOT NULL DEFAULT 0,
           skipped_items INTEGER NOT NULL DEFAULT 0,
           conflict_items INTEGER NOT NULL DEFAULT 0,
           failed_items INTEGER NOT NULL DEFAULT 0,
           total_bytes INTEGER NOT NULL DEFAULT 0,
           transferred_bytes INTEGER NOT NULL DEFAULT 0,
           last_error TEXT,
           created_at_ms INTEGER NOT NULL,
           updated_at_ms INTEGER NOT NULL
         );
         CREATE UNIQUE INDEX IF NOT EXISTS idx_storage_import_batch_scope
           ON storage_import_batches(source_profile_id,target_profile_id,target_owner_scope);

         CREATE TABLE IF NOT EXISTS storage_import_items (
           batch_id TEXT NOT NULL,
           item_type TEXT NOT NULL,
           source_key TEXT NOT NULL,
           entity_id TEXT NOT NULL,
           attachment_id TEXT,
           message_operation_id TEXT NOT NULL,
           attachment_operation_id TEXT,
           state TEXT NOT NULL DEFAULT 'pending',
           source_revision TEXT,
           source_hash TEXT,
           total_bytes INTEGER NOT NULL DEFAULT 0,
           transferred_bytes INTEGER NOT NULL DEFAULT 0,
           last_error TEXT,
           updated_at_ms INTEGER NOT NULL,
           PRIMARY KEY(batch_id,item_type,source_key),
           FOREIGN KEY(batch_id) REFERENCES storage_import_batches(batch_id) ON DELETE CASCADE
         );
         CREATE INDEX IF NOT EXISTS idx_storage_import_items_pending
           ON storage_import_items(batch_id,state,item_type,source_key);

         UPDATE storage_import_batches
         SET last_error=NULL
         WHERE status='completed'
           AND failed_items=0
           AND applied_items=total_items;"
    )?;
    let transfer_batch_columns = table_columns(conn, "storage_import_batches")?;
    for (name, definition) in [
        ("source_provider_kind", "TEXT NOT NULL DEFAULT 'webdav'"),
        ("target_provider_kind", "TEXT NOT NULL DEFAULT 'supabase'"),
        ("source_owner_scope", "TEXT NOT NULL DEFAULT ''"),
        ("phase", "TEXT NOT NULL DEFAULT 'planning'"),
        ("skipped_items", "INTEGER NOT NULL DEFAULT 0"),
        ("conflict_items", "INTEGER NOT NULL DEFAULT 0"),
        ("total_bytes", "INTEGER NOT NULL DEFAULT 0"),
        ("transferred_bytes", "INTEGER NOT NULL DEFAULT 0"),
    ] {
        if !transfer_batch_columns.iter().any(|column| column == name) {
            conn.execute(
                &format!("ALTER TABLE storage_import_batches ADD COLUMN {name} {definition}"),
                [],
            )?;
        }
    }
    conn.execute_batch(
        "DROP INDEX IF EXISTS idx_storage_import_batch_scope;
         CREATE UNIQUE INDEX IF NOT EXISTS idx_storage_import_batch_scope
           ON storage_import_batches(source_profile_id,source_owner_scope,
             target_profile_id,target_owner_scope);",
    )?;
    let transfer_item_columns = table_columns(conn, "storage_import_items")?;
    for (name, definition) in [
        ("source_revision", "TEXT"),
        ("source_hash", "TEXT"),
        ("total_bytes", "INTEGER NOT NULL DEFAULT 0"),
        ("transferred_bytes", "INTEGER NOT NULL DEFAULT 0"),
    ] {
        if !transfer_item_columns.iter().any(|column| column == name) {
            conn.execute(
                &format!("ALTER TABLE storage_import_items ADD COLUMN {name} {definition}"),
                [],
            )?;
        }
    }
    let outbox_columns = table_columns(conn, "sync_outbox")?;
    for (name, definition) in [
        ("lease_owner", "TEXT"),
        ("lease_expires_at_ms", "INTEGER"),
        ("depends_on_operation_id", "TEXT"),
    ] {
        if !outbox_columns.iter().any(|column| column == name) {
            conn.execute(
                &format!("ALTER TABLE sync_outbox ADD COLUMN {name} {definition}"),
                [],
            )?;
        }
    }
    Ok(())
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
            "CREATE TABLE IF NOT EXISTS messages (        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        sender TEXT NOT NULL,        timestamp_ms INTEGER NOT NULL,        size INTEGER NOT NULL,        kind TEXT NOT NULL,        original_name TEXT NOT NULL,        etag TEXT,        mtime TEXT,        content TEXT,        local_path TEXT,        remote_path TEXT,        file_hash TEXT,        marked BOOLEAN NOT NULL DEFAULT 0,        marked_tag_ids TEXT NOT NULL DEFAULT '[]',        marked_pinned BOOLEAN NOT NULL DEFAULT 0,        marked_due_date TEXT,        format TEXT NOT NULL DEFAULT 'text',        transcript_source TEXT,        source_audio_mime_type TEXT,        transcript_raw_text TEXT,        PRIMARY KEY(endpoint_id, filename)      );      CREATE TABLE IF NOT EXISTS marked_tags (        endpoint_id TEXT NOT NULL,        id TEXT NOT NULL,        name TEXT NOT NULL,        PRIMARY KEY(endpoint_id, id)      );      CREATE TABLE IF NOT EXISTS download_history (        id INTEGER PRIMARY KEY AUTOINCREMENT,        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        original_name TEXT NOT NULL,        saved_path TEXT,        status TEXT NOT NULL,        error TEXT,        file_size INTEGER NOT NULL DEFAULT 0,        created_at_ms INTEGER NOT NULL,        updated_at_ms INTEGER NOT NULL,        UNIQUE(endpoint_id, filename)      );      CREATE TABLE IF NOT EXISTS upload_history (        id INTEGER PRIMARY KEY AUTOINCREMENT,        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        original_name TEXT NOT NULL,        local_path TEXT,        status TEXT NOT NULL,        error TEXT,        file_size INTEGER NOT NULL DEFAULT 0,        created_at_ms INTEGER NOT NULL,        updated_at_ms INTEGER NOT NULL,        UNIQUE(endpoint_id, filename)      );      CREATE TABLE IF NOT EXISTS partial_downloads (        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        original_name TEXT NOT NULL,        final_path TEXT NOT NULL,        temp_path TEXT NOT NULL,        downloaded_bytes INTEGER NOT NULL DEFAULT 0,        total_bytes INTEGER NOT NULL DEFAULT 0,        etag TEXT,        mtime TEXT,        updated_at_ms INTEGER NOT NULL,        PRIMARY KEY(endpoint_id, filename)      );",
        )
        .map_err(|err| format!("初始化数据库表失败: {err}"))?;
        ensure_pending_marked_sync_schema(&conn)
            .map_err(|err| format!("初始化待同步标记表失败: {err}"))?;
        ensure_local_first_sync_schema(&conn)
            .map_err(|err| format!("初始化本地优先同步表失败: {err}"))?;
        ensure_account_scoped_business_keys(&mut conn)
            .map_err(|err| format!("初始化账号隔离主键失败: {err}"))?;
        ensure_local_first_sync_schema(&conn)
            .map_err(|err| format!("重建账号隔离索引失败: {err}"))?;
        ensure_indexes(&conn).map_err(|err| format!("初始化数据库索引失败: {err}"))?;
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
            "CREATE TABLE messages_new (        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        sender TEXT NOT NULL,        timestamp_ms INTEGER NOT NULL,        size INTEGER NOT NULL,        kind TEXT NOT NULL,        original_name TEXT NOT NULL,        etag TEXT,        mtime TEXT,        content TEXT,        local_path TEXT,        remote_path TEXT,        file_hash TEXT,        marked BOOLEAN NOT NULL DEFAULT 0,        marked_tag_ids TEXT NOT NULL DEFAULT '[]',        marked_pinned BOOLEAN NOT NULL DEFAULT 0,        marked_due_date TEXT,        format TEXT NOT NULL DEFAULT 'text',        transcript_source TEXT,        source_audio_mime_type TEXT,        transcript_raw_text TEXT,        PRIMARY KEY(endpoint_id, filename)      );",
        )
        .map_err(|err| format!("迁移消息表失败: {err}"))?;
        tx.execute(
            "INSERT INTO messages_new        (endpoint_id, filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path, remote_path, file_hash, marked, marked_tag_ids, marked_pinned, format, transcript_source, source_audio_mime_type, transcript_raw_text)        SELECT ?1, filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path, NULL, NULL, 0, '[]', 0, 'text', NULL, NULL, NULL FROM messages",
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
            if row.map_err(|err| format!("读取消息表结构失败：{err}"))? == "marked_tag_ids"
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
            if row.map_err(|err| format!("读取消息表结构失败：{err}"))? == "marked_pinned"
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

    let mut has_marked_due_date = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        for row in rows {
            if row.map_err(|err| format!("读取消息表结构失败: {err}"))? == "marked_due_date"
            {
                has_marked_due_date = true;
                break;
            }
        }
    }

    if !has_marked_due_date {
        conn.execute("ALTER TABLE messages ADD COLUMN marked_due_date TEXT", [])
            .map_err(|err| format!("补充 marked_due_date 列失败: {err}"))?;
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

    let mut has_transcript_source = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        for row in rows {
            if row.map_err(|err| format!("读取消息表结构失败: {err}"))? == "transcript_source"
            {
                has_transcript_source = true;
                break;
            }
        }
    }

    if !has_transcript_source {
        conn.execute("ALTER TABLE messages ADD COLUMN transcript_source TEXT", [])
            .map_err(|err| format!("补充 transcript_source 列失败: {err}"))?;
    }

    let mut has_source_audio_mime_type = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        for row in rows {
            if row.map_err(|err| format!("读取消息表结构失败: {err}"))? == "source_audio_mime_type"
            {
                has_source_audio_mime_type = true;
                break;
            }
        }
    }

    if !has_source_audio_mime_type {
        conn.execute(
            "ALTER TABLE messages ADD COLUMN source_audio_mime_type TEXT",
            [],
        )
        .map_err(|err| format!("补充 source_audio_mime_type 列失败: {err}"))?;
    }

    let mut has_transcript_raw_text = false;
    {
        let mut stmt = conn
            .prepare("PRAGMA table_info(messages)")
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|err| format!("读取消息表结构失败: {err}"))?;
        for row in rows {
            if row.map_err(|err| format!("读取消息表结构失败: {err}"))? == "transcript_raw_text"
            {
                has_transcript_raw_text = true;
                break;
            }
        }
    }

    if !has_transcript_raw_text {
        conn.execute(
            "ALTER TABLE messages ADD COLUMN transcript_raw_text TEXT",
            [],
        )
        .map_err(|err| format!("补充 transcript_raw_text 列失败: {err}"))?;
    }

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS marked_tags (        endpoint_id TEXT NOT NULL,        id TEXT NOT NULL,        name TEXT NOT NULL,        PRIMARY KEY(endpoint_id, id)      );      CREATE TABLE IF NOT EXISTS download_history (        id INTEGER PRIMARY KEY AUTOINCREMENT,        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        original_name TEXT NOT NULL,        saved_path TEXT,        status TEXT NOT NULL,        error TEXT,        file_size INTEGER NOT NULL DEFAULT 0,        created_at_ms INTEGER NOT NULL,        updated_at_ms INTEGER NOT NULL,        UNIQUE(endpoint_id, filename)      );      CREATE TABLE IF NOT EXISTS upload_history (        id INTEGER PRIMARY KEY AUTOINCREMENT,        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        original_name TEXT NOT NULL,        local_path TEXT,        status TEXT NOT NULL,        error TEXT,        file_size INTEGER NOT NULL DEFAULT 0,        created_at_ms INTEGER NOT NULL,        updated_at_ms INTEGER NOT NULL,        UNIQUE(endpoint_id, filename)      );      CREATE TABLE IF NOT EXISTS partial_downloads (        endpoint_id TEXT NOT NULL,        filename TEXT NOT NULL,        original_name TEXT NOT NULL,        final_path TEXT NOT NULL,        temp_path TEXT NOT NULL,        downloaded_bytes INTEGER NOT NULL DEFAULT 0,        total_bytes INTEGER NOT NULL DEFAULT 0,        etag TEXT,        mtime TEXT,        updated_at_ms INTEGER NOT NULL,        PRIMARY KEY(endpoint_id, filename)      );",
    )
    .map_err(|err| format!("初始化下载相关数据表失败: {err}"))?;

    ensure_pending_marked_sync_schema(&conn)
        .map_err(|err| format!("初始化待同步标记表失败: {err}"))?;
    ensure_local_first_sync_schema(&conn)
        .map_err(|err| format!("初始化本地优先同步表失败: {err}"))?;
    ensure_account_scoped_business_keys(&mut conn)
        .map_err(|err| format!("初始化账号隔离主键失败: {err}"))?;
    ensure_local_first_sync_schema(&conn).map_err(|err| format!("重建账号隔离索引失败: {err}"))?;
    ensure_indexes(&conn).map_err(|err| format!("初始化数据库索引失败: {err}"))?;

    Ok(())
}

fn ensure_pending_marked_sync_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS pending_marked_sync (
            endpoint_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            marked BOOLEAN NOT NULL,
            marked_tag_ids TEXT NOT NULL DEFAULT '[]',
            marked_pinned BOOLEAN NOT NULL DEFAULT 0,
            marked_due_date TEXT,
            updated_at_ms INTEGER NOT NULL,
            PRIMARY KEY(endpoint_id, filename)
        );",
    )?;
    let has_due_date = conn
        .prepare("PRAGMA table_info(pending_marked_sync)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?
        .into_iter()
        .any(|name| name == "marked_due_date");
    if !has_due_date {
        conn.execute(
            "ALTER TABLE pending_marked_sync ADD COLUMN marked_due_date TEXT",
            [],
        )?;
    }
    Ok(())
}

fn ensure_indexes(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_messages_endpoint_timestamp_filename ON messages(endpoint_id, timestamp_ms, filename);
         CREATE INDEX IF NOT EXISTS idx_messages_endpoint_marked_pinned_timestamp ON messages(endpoint_id, marked, marked_pinned, timestamp_ms);
         CREATE INDEX IF NOT EXISTS idx_messages_endpoint_marked_due_date ON messages(endpoint_id, marked, marked_due_date);
         CREATE INDEX IF NOT EXISTS idx_pending_marked_sync_endpoint_updated ON pending_marked_sync(endpoint_id, updated_at_ms);
         CREATE INDEX IF NOT EXISTS idx_download_history_updated_at ON download_history(updated_at_ms DESC);
         CREATE INDEX IF NOT EXISTS idx_upload_history_updated_at ON upload_history(updated_at_ms DESC);",
    )
}

pub fn get_message(
    path: &Path,
    endpoint_id: &str,
    filename: &str,
) -> rusqlite::Result<Option<DbMessage>> {
    let conn = Connection::open(path)?;
    conn
    .query_row(
      "SELECT endpoint_id, filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path, remote_path, file_hash, marked, marked_tag_ids, marked_pinned, marked_due_date, format, transcript_source, source_audio_mime_type, transcript_raw_text, source_kind, source_channel_id, source_message_id \
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
          marked_due_date: row.get(16)?,
          format: row.get(17)?,
          transcript_source: row.get(18)?,
          source_audio_mime_type: row.get(19)?,
          transcript_raw_text: row.get(20)?,
          source_kind: row.get(21)?,
          source_channel_id: row.get(22)?,
          source_message_id: row.get(23)?,
        })
      },
    )
    .optional()
}

pub fn upsert_message(path: &Path, message: &DbMessage) -> rusqlite::Result<()> {
    let conn = Connection::open(path)?;
    conn.execute(
    "INSERT INTO messages\
      (endpoint_id, filename, sender, timestamp_ms, size, kind, original_name, etag, mtime, content, local_path, remote_path, file_hash, marked, marked_tag_ids, marked_pinned, marked_due_date, format, transcript_source, source_audio_mime_type, transcript_raw_text, source_kind, source_channel_id, source_message_id)\
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)\
      ON CONFLICT(endpoint_id, owner_scope, filename) DO UPDATE SET \
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
        marked_due_date=excluded.marked_due_date,\
        format=excluded.format,\
        transcript_source=excluded.transcript_source,\
        source_audio_mime_type=excluded.source_audio_mime_type,\
        transcript_raw_text=excluded.transcript_raw_text,\
        source_kind=excluded.source_kind,\
        source_channel_id=excluded.source_channel_id,\
        source_message_id=excluded.source_message_id",
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
      message.marked_due_date,
      message.format,
      message.transcript_source,
      message.source_audio_mime_type,
      message.transcript_raw_text,
      message.source_kind,
      message.source_channel_id,
      message.source_message_id,
    ],
  )?;
    Ok(())
}

fn enqueue_outbox(conn: &Connection, operation: &NewOutboxOperation) -> rusqlite::Result<()> {
    enqueue_outbox_with_dependency(conn, operation, None)
}

fn enqueue_outbox_with_dependency(
    conn: &Connection,
    operation: &NewOutboxOperation,
    depends_on_operation_id: Option<&str>,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO sync_outbox (
           operation_id, endpoint_id, owner_scope, entity_type, entity_id, action,
           base_revision, payload_json, payload_hash, depends_on_operation_id, state,
           attempt_count, next_attempt_at_ms, created_at_ms, updated_at_ms
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'pending',0,0,?11,?11)",
        params![
            operation.operation_id,
            operation.endpoint_id,
            operation.owner_scope,
            operation.entity_type,
            operation.entity_id,
            operation.action,
            operation.base_revision,
            operation.payload_json,
            operation.payload_hash,
            depends_on_operation_id,
            operation.created_at_ms,
        ],
    )?;
    Ok(())
}

fn map_outbox_operation(row: &Row<'_>) -> rusqlite::Result<OutboxOperation> {
    Ok(OutboxOperation {
        operation_id: row.get(0)?,
        endpoint_id: row.get(1)?,
        owner_scope: row.get(2)?,
        entity_type: row.get(3)?,
        entity_id: row.get(4)?,
        action: row.get(5)?,
        base_revision: row.get(6)?,
        payload_json: row.get(7)?,
        payload_hash: row.get(8)?,
        depends_on_operation_id: row.get(9)?,
        state: row.get(10)?,
        attempt_count: row.get(11)?,
        next_attempt_at_ms: row.get(12)?,
        lease_owner: row.get(13)?,
        lease_expires_at_ms: row.get(14)?,
        last_error: row.get(15)?,
        created_at_ms: row.get(16)?,
        updated_at_ms: row.get(17)?,
    })
}

const OUTBOX_SELECT: &str = "operation_id,endpoint_id,owner_scope,entity_type,entity_id,action,
  base_revision,payload_json,payload_hash,depends_on_operation_id,state,attempt_count,next_attempt_at_ms,lease_owner,
  lease_expires_at_ms,last_error,created_at_ms,updated_at_ms";

pub fn recover_outbox_leases(path: &Path, now_ms: i64) -> rusqlite::Result<usize> {
    Connection::open(path)?.execute(
        "UPDATE sync_outbox
         SET state='pending',lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,
             updated_at_ms=?1,last_error=coalesce(last_error,'interrupted before acknowledgement')
         WHERE state='sending' AND (lease_expires_at_ms IS NULL OR lease_expires_at_ms<=?1)",
        params![now_ms],
    )
}

pub fn recover_all_outbox_claims(path: &Path, now_ms: i64) -> rusqlite::Result<usize> {
    Connection::open(path)?.execute(
        "UPDATE sync_outbox
         SET state='pending',lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,
             updated_at_ms=?1,last_error=coalesce(last_error,'interrupted before acknowledgement')
         WHERE state='sending'",
        params![now_ms],
    )
}

pub fn outbox_retry_delay_ms(attempt_count: i64) -> i64 {
    let exponent = attempt_count.saturating_sub(1).clamp(0, 8) as u32;
    1_000_i64.saturating_mul(1_i64 << exponent).min(300_000)
}

pub fn claim_outbox_operations(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    lease_owner: &str,
    now_ms: i64,
    lease_duration_ms: i64,
    limit: usize,
    ignore_backoff: bool,
) -> rusqlite::Result<Vec<OutboxOperation>> {
    if limit == 0 {
        return Ok(Vec::new());
    }
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE sync_outbox
         SET state='pending',lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,
             updated_at_ms=?1,last_error=coalesce(last_error,'interrupted before acknowledgement')
         WHERE endpoint_id=?2 AND owner_scope=?3 AND state='sending'
           AND (lease_expires_at_ms IS NULL OR lease_expires_at_ms<=?1)",
        params![now_ms, endpoint_id, owner_scope],
    )?;
    let retry_filter = if ignore_backoff {
        ""
    } else {
        "AND o.next_attempt_at_ms<=?4"
    };
    let sql = format!(
        "SELECT o.operation_id FROM sync_outbox o
         WHERE o.endpoint_id=?1 AND o.owner_scope=?2 AND o.state='pending' {retry_filter}
           AND (o.depends_on_operation_id IS NULL
             OR EXISTS (SELECT 1 FROM sync_outbox dependency
               WHERE dependency.operation_id=o.depends_on_operation_id
                 AND dependency.state='acknowledged')
             OR (o.entity_type<>'attachment' AND EXISTS (
               SELECT 1 FROM sync_outbox dependency
               WHERE dependency.operation_id=o.depends_on_operation_id
                 AND dependency.state='superseded'
             ))
             OR (o.entity_type='attachment' AND EXISTS (
               SELECT 1 FROM sync_outbox dependency
               WHERE dependency.operation_id=o.depends_on_operation_id
                 AND dependency.state='superseded'
             ) AND EXISTS (
               SELECT 1 FROM attachment_sync attachment
               JOIN sync_outbox confirmed_message
                 ON confirmed_message.endpoint_id=attachment.endpoint_id
                AND confirmed_message.owner_scope=attachment.owner_scope
                AND confirmed_message.entity_type='message'
                AND confirmed_message.entity_id=attachment.message_id
                AND confirmed_message.state='acknowledged'
               WHERE attachment.endpoint_id=o.endpoint_id
                 AND attachment.owner_scope=o.owner_scope
                 AND attachment.attachment_id=o.entity_id
             ))
           )
           AND NOT EXISTS (
             SELECT 1 FROM sync_outbox previous
             WHERE previous.endpoint_id=o.endpoint_id AND previous.owner_scope=o.owner_scope
               AND previous.entity_type=o.entity_type AND previous.entity_id=o.entity_id
               AND previous.rowid<o.rowid
               AND previous.state NOT IN ('acknowledged','superseded')
           )
         ORDER BY CASE o.entity_type
           WHEN 'tag' THEN 0
           WHEN 'message' THEN 1
           WHEN 'attachment' THEN 2
           ELSE 3 END,
           o.created_at_ms,o.operation_id LIMIT ?3"
    );
    let ids: Vec<String> = {
        let mut statement = tx.prepare(&sql)?;
        let mut rows = if ignore_backoff {
            statement.query(params![endpoint_id, owner_scope, limit as i64])?
        } else {
            statement.query(params![endpoint_id, owner_scope, limit as i64, now_ms])?
        };
        let mut ids = Vec::new();
        while let Some(row) = rows.next()? {
            ids.push(row.get(0)?);
        }
        ids
    };
    let lease_expires_at_ms = now_ms.saturating_add(lease_duration_ms.max(1));
    for id in &ids {
        tx.execute(
            "UPDATE sync_outbox SET state='sending',attempt_count=attempt_count+1,
               lease_owner=?2,lease_started_at_ms=?3,lease_expires_at_ms=?4,updated_at_ms=?3
             WHERE operation_id=?1 AND state='pending'",
            params![id, lease_owner, now_ms, lease_expires_at_ms],
        )?;
    }
    let mut claimed = Vec::with_capacity(ids.len());
    for id in &ids {
        claimed.push(tx.query_row(
            &format!("SELECT {OUTBOX_SELECT} FROM sync_outbox WHERE operation_id=?1"),
            params![id],
            map_outbox_operation,
        )?);
    }
    tx.commit()?;
    Ok(claimed)
}

pub fn claim_storage_import_outbox_operations(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    batch_id: &str,
    lease_owner: &str,
    now_ms: i64,
    lease_duration_ms: i64,
    limit: usize,
) -> rusqlite::Result<Vec<OutboxOperation>> {
    if limit == 0 {
        return Ok(Vec::new());
    }
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE sync_outbox
         SET state='pending',lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,
             updated_at_ms=?1,last_error=coalesce(last_error,'interrupted before acknowledgement')
         WHERE endpoint_id=?2 AND owner_scope=?3 AND state='sending'
           AND (lease_expires_at_ms IS NULL OR lease_expires_at_ms<=?1)",
        params![now_ms, endpoint_id, owner_scope],
    )?;
    let ids = {
        let mut statement = tx.prepare(
            "SELECT outbox.operation_id FROM sync_outbox outbox
             WHERE outbox.endpoint_id=?1 AND outbox.owner_scope=?2 AND outbox.state='pending'
               AND (outbox.depends_on_operation_id IS NULL
                 OR EXISTS (SELECT 1 FROM sync_outbox dependency
                   WHERE dependency.operation_id=outbox.depends_on_operation_id
                     AND dependency.state='acknowledged')
                 OR (outbox.entity_type<>'attachment' AND EXISTS (
                   SELECT 1 FROM sync_outbox dependency
                   WHERE dependency.operation_id=outbox.depends_on_operation_id
                     AND dependency.state='superseded'
                 ))
                 OR (outbox.entity_type='attachment' AND EXISTS (
                   SELECT 1 FROM sync_outbox dependency
                   WHERE dependency.operation_id=outbox.depends_on_operation_id
                     AND dependency.state='superseded'
                 ) AND EXISTS (
                   SELECT 1 FROM attachment_sync attachment
                   JOIN sync_outbox confirmed_message
                     ON confirmed_message.endpoint_id=attachment.endpoint_id
                    AND confirmed_message.owner_scope=attachment.owner_scope
                    AND confirmed_message.entity_type='message'
                    AND confirmed_message.entity_id=attachment.message_id
                    AND confirmed_message.state='acknowledged'
                   WHERE attachment.endpoint_id=outbox.endpoint_id
                     AND attachment.owner_scope=outbox.owner_scope
                     AND attachment.attachment_id=outbox.entity_id
                 ))
               )
               AND outbox.operation_id IN (
                 SELECT message_operation_id FROM storage_import_items WHERE batch_id=?3
                 UNION
                 SELECT attachment_operation_id FROM storage_import_items
                   WHERE batch_id=?3 AND attachment_operation_id IS NOT NULL
               )
               AND NOT EXISTS (
                 SELECT 1 FROM sync_outbox previous
                 WHERE previous.endpoint_id=outbox.endpoint_id
                   AND previous.owner_scope=outbox.owner_scope
                   AND previous.entity_type=outbox.entity_type
                   AND previous.entity_id=outbox.entity_id
                   AND previous.rowid<outbox.rowid
                   AND previous.state NOT IN ('acknowledged','superseded')
               )
             ORDER BY CASE outbox.entity_type
               WHEN 'tag' THEN 0 WHEN 'message' THEN 1 WHEN 'attachment' THEN 2 ELSE 3 END,
               outbox.created_at_ms,outbox.operation_id LIMIT ?4",
        )?;
        let values = statement
            .query_map(
                params![endpoint_id, owner_scope, batch_id, limit as i64],
                |row| row.get::<_, String>(0),
            )?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
    };
    let lease_expires_at_ms = now_ms.saturating_add(lease_duration_ms.max(1));
    for id in &ids {
        tx.execute(
            "UPDATE sync_outbox SET state='sending',attempt_count=attempt_count+1,
               lease_owner=?2,lease_started_at_ms=?3,lease_expires_at_ms=?4,updated_at_ms=?3
             WHERE operation_id=?1 AND state='pending'",
            params![id, lease_owner, now_ms, lease_expires_at_ms],
        )?;
    }
    let mut claimed = Vec::with_capacity(ids.len());
    for id in &ids {
        claimed.push(tx.query_row(
            &format!("SELECT {OUTBOX_SELECT} FROM sync_outbox WHERE operation_id=?1"),
            params![id],
            map_outbox_operation,
        )?);
    }
    tx.commit()?;
    Ok(claimed)
}

pub fn release_outbox_operation(
    path: &Path,
    operation_id: &str,
    lease_owner: &str,
    next_attempt_at_ms: i64,
    error: &str,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    Ok(Connection::open(path)?.execute(
        "UPDATE sync_outbox SET state='pending',next_attempt_at_ms=?3,last_error=?4,
           lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,updated_at_ms=?5
         WHERE operation_id=?1 AND state='sending' AND lease_owner=?2",
        params![operation_id, lease_owner, next_attempt_at_ms, error, now_ms],
    )? > 0)
}

pub fn repair_missing_attachment_message(
    path: &Path,
    attachment_operation_id: &str,
    lease_owner: &str,
    message_operation: &NewOutboxOperation,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let attachment_exists: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM sync_outbox
         WHERE operation_id=?1 AND state='sending' AND lease_owner=?2
           AND entity_type='attachment' AND action='upsert')",
        params![attachment_operation_id, lease_owner],
        |row| row.get(0),
    )?;
    if !attachment_exists {
        return Ok(false);
    }
    enqueue_outbox(&tx, message_operation)?;
    tx.execute(
        "UPDATE sync_outbox SET state='pending',depends_on_operation_id=?3,next_attempt_at_ms=0,
         last_error='关联消息缺失，正在先恢复消息',lease_owner=NULL,lease_started_at_ms=NULL,
         lease_expires_at_ms=NULL,updated_at_ms=?4
         WHERE operation_id=?1 AND state='sending' AND lease_owner=?2",
        params![
            attachment_operation_id,
            lease_owner,
            message_operation.operation_id,
            now_ms
        ],
    )?;
    let batch_ids = {
        let mut statement = tx.prepare(
            "SELECT DISTINCT batch_id FROM storage_import_items
             WHERE attachment_operation_id=?1",
        )?;
        let values = statement
            .query_map(params![attachment_operation_id], |row| {
                row.get::<_, String>(0)
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
    };
    tx.execute(
        "UPDATE storage_import_items SET message_operation_id=?2,state='staged',last_error=NULL,
         updated_at_ms=?3 WHERE attachment_operation_id=?1",
        params![
            attachment_operation_id,
            message_operation.operation_id,
            now_ms
        ],
    )?;
    for batch_id in batch_ids {
        refresh_import_progress(&tx, &batch_id, now_ms)?;
    }
    tx.commit()?;
    Ok(true)
}

pub fn mark_storage_import_operation_error(
    path: &Path,
    operation_id: &str,
    error: &str,
    now_ms: i64,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let affected_batches = {
        let mut statement = tx.prepare(
            "SELECT DISTINCT batch_id FROM storage_import_items
             WHERE message_operation_id=?1 OR attachment_operation_id=?1",
        )?;
        let values = statement
            .query_map(params![operation_id], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
    };
    tx.execute(
        "UPDATE storage_import_items SET state='error',last_error=?2,updated_at_ms=?3
         WHERE message_operation_id=?1 OR attachment_operation_id=?1",
        params![operation_id, error, now_ms],
    )?;
    for batch_id in affected_batches {
        tx.execute(
            "UPDATE storage_import_batches SET last_error=?2,updated_at_ms=?3 WHERE batch_id=?1",
            params![batch_id, error, now_ms],
        )?;
        refresh_import_progress(&tx, &batch_id, now_ms)?;
    }
    tx.commit()
}

pub fn acknowledge_outbox_operation(
    path: &Path,
    operation_id: &str,
    lease_owner: &str,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    Ok(Connection::open(path)?.execute(
        "UPDATE sync_outbox SET state='acknowledged',last_error=NULL,
           lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,updated_at_ms=?3
         WHERE operation_id=?1 AND state='sending' AND lease_owner=?2",
        params![operation_id, lease_owner, now_ms],
    )? > 0)
}

pub fn reconcile_duplicate_tag_operation(
    path: &Path,
    operation: &OutboxOperation,
    remote_tag: &MarkedTag,
    remote_revision: i64,
    lease_owner: &str,
    now_ms: i64,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO marked_tags
           (endpoint_id,id,name,owner_scope,remote_revision,deleted_at_ms,sync_state)
         VALUES (?1,?2,?3,?4,?5,NULL,'synced')
         ON CONFLICT(endpoint_id,owner_scope,id) DO UPDATE SET
           name=excluded.name,remote_revision=excluded.remote_revision,deleted_at_ms=NULL,sync_state='synced'",
        params![
            operation.endpoint_id,
            remote_tag.id,
            remote_tag.name,
            operation.owner_scope,
            remote_revision
        ],
    )?;
    tx.execute(
        "UPDATE storage_import_items SET entity_id=?2,state='skipped',last_error=NULL,updated_at_ms=?3
         WHERE message_operation_id=?1 AND item_type='tag'",
        params![operation.operation_id, remote_tag.id, now_ms],
    )?;
    let pending_messages = {
        let mut statement = tx.prepare(
            "SELECT operation_id,payload_json FROM sync_outbox
             WHERE endpoint_id=?1 AND owner_scope=?2 AND entity_type='message'
               AND state IN ('pending','error')",
        )?;
        let values = statement
            .query_map(
                params![operation.endpoint_id, operation.owner_scope],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
    };
    for (message_operation_id, payload_json) in pending_messages {
        let mut payload: serde_json::Value = serde_json::from_str(&payload_json)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        let Some(tag_ids) = payload
            .get_mut("markedTagIds")
            .and_then(|value| value.as_array_mut())
        else {
            continue;
        };
        let mut changed = false;
        for tag_id in tag_ids.iter_mut() {
            if tag_id.as_str() == Some(operation.entity_id.as_str()) {
                *tag_id = serde_json::Value::String(remote_tag.id.clone());
                changed = true;
            }
        }
        if !changed {
            continue;
        }
        let rewritten = serde_json::to_string(&payload)
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        let payload_hash = format!("{:x}", Sha256::digest(rewritten.as_bytes()));
        tx.execute(
            "UPDATE sync_outbox SET payload_json=?2,payload_hash=?3,last_error=NULL,updated_at_ms=?4
             WHERE operation_id=?1 AND state IN ('pending','error')",
            params![message_operation_id, rewritten, payload_hash, now_ms],
        )?;
        tx.execute(
            "UPDATE messages SET marked_tag_ids=replace(marked_tag_ids,?3,?4)
             WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=(
               SELECT entity_id FROM sync_outbox WHERE operation_id=?5
             )",
            params![
                operation.endpoint_id,
                operation.owner_scope,
                operation.entity_id,
                remote_tag.id,
                message_operation_id
            ],
        )?;
    }
    tx.execute(
        "DELETE FROM marked_tags WHERE endpoint_id=?1 AND owner_scope=?2 AND id=?3
         AND remote_revision=0",
        params![
            operation.endpoint_id,
            operation.owner_scope,
            operation.entity_id
        ],
    )?;
    tx.execute(
        "UPDATE sync_outbox SET state='superseded',last_error=NULL,
         lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,updated_at_ms=?3
         WHERE operation_id=?1 AND state='sending' AND lease_owner=?2",
        params![operation.operation_id, lease_owner, now_ms],
    )?;
    let batch_ids = {
        let mut statement = tx.prepare(
            "SELECT DISTINCT batch_id FROM storage_import_items WHERE message_operation_id=?1",
        )?;
        let values = statement
            .query_map(params![operation.operation_id], |row| {
                row.get::<_, String>(0)
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
    };
    for batch_id in batch_ids {
        refresh_import_progress(&tx, &batch_id, now_ms)?;
    }
    tx.commit()
}

pub fn apply_outbox_success(
    path: &Path,
    operation: &OutboxOperation,
    lease_owner: &str,
    remote_revision: i64,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let changed = tx.execute(
        "UPDATE sync_outbox SET state='acknowledged',last_error=NULL,
           lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,updated_at_ms=?3
         WHERE operation_id=?1 AND state='sending' AND lease_owner=?2",
        params![operation.operation_id, lease_owner, now_ms],
    )?;
    if changed == 0 {
        return Ok(false);
    }
    tx.execute(
        "UPDATE sync_outbox SET base_revision=?5,updated_at_ms=?6
         WHERE endpoint_id=?1 AND owner_scope=?2 AND entity_type=?3 AND entity_id=?4
           AND state='pending' AND rowid>(SELECT rowid FROM sync_outbox WHERE operation_id=?7)",
        params![
            operation.endpoint_id,
            operation.owner_scope,
            operation.entity_type,
            operation.entity_id,
            remote_revision,
            now_ms,
            operation.operation_id,
        ],
    )?;
    match operation.entity_type.as_str() {
        "message" => {
            tx.execute(
                "UPDATE messages SET remote_revision=?4,
                   sync_state=CASE WHEN EXISTS (
                     SELECT 1 FROM sync_outbox pending
                     WHERE pending.endpoint_id=?1 AND pending.owner_scope=?2
                       AND pending.entity_type='message' AND pending.entity_id=?3
                       AND pending.operation_id<>?5 AND pending.state NOT IN ('acknowledged','superseded')
                   ) THEN 'pending' ELSE 'synced' END
                 WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=?3",
                params![
                    operation.endpoint_id,
                    operation.owner_scope,
                    operation.entity_id,
                    remote_revision,
                    operation.operation_id,
                ],
            )?;
        }
        "tag" => {
            tx.execute(
                "UPDATE marked_tags SET remote_revision=?4,
                   sync_state=CASE WHEN EXISTS (
                     SELECT 1 FROM sync_outbox pending
                     WHERE pending.endpoint_id=?1 AND pending.owner_scope=?2
                       AND pending.entity_type='tag' AND pending.entity_id=?3
                       AND pending.operation_id<>?5 AND pending.state NOT IN ('acknowledged','superseded')
                   ) THEN 'pending' ELSE 'synced' END
                 WHERE endpoint_id=?1 AND owner_scope=?2 AND id=?3",
                params![
                    operation.endpoint_id,
                    operation.owner_scope,
                    operation.entity_id,
                    remote_revision,
                    operation.operation_id,
                ],
            )?;
        }
        "attachment" => {
            tx.execute(
                "UPDATE attachment_sync SET remote_revision=?4,upload_state='uploaded',
                   last_error=NULL,updated_at_ms=?5
                 WHERE endpoint_id=?1 AND owner_scope=?2 AND attachment_id=?3",
                params![
                    operation.endpoint_id,
                    operation.owner_scope,
                    operation.entity_id,
                    remote_revision,
                    now_ms
                ],
            )?;
        }
        _ => {}
    }
    let affected_batches = {
        let mut statement = tx.prepare(
            "SELECT DISTINCT batch_id FROM storage_import_items
             WHERE message_operation_id=?1 OR attachment_operation_id=?1",
        )?;
        let values = statement
            .query_map(params![operation.operation_id], |row| {
                row.get::<_, String>(0)
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
    };
    tx.execute(
        "UPDATE storage_import_items SET
           state=CASE WHEN
             EXISTS (SELECT 1 FROM sync_outbox message_op
               WHERE message_op.operation_id=storage_import_items.message_operation_id
                 AND message_op.state IN ('acknowledged','superseded'))
             AND (storage_import_items.attachment_operation_id IS NULL OR EXISTS (
               SELECT 1 FROM sync_outbox attachment_op
               WHERE attachment_op.operation_id=storage_import_items.attachment_operation_id
                 AND attachment_op.state IN ('acknowledged','superseded')
             )) THEN 'applied' ELSE 'staged' END,
           last_error=NULL,updated_at_ms=?2
         WHERE message_operation_id=?1 OR attachment_operation_id=?1",
        params![operation.operation_id, now_ms],
    )?;
    for batch_id in affected_batches {
        refresh_import_progress(&tx, &batch_id, now_ms)?;
    }
    tx.commit()?;
    Ok(true)
}

pub fn record_outbox_conflict(
    path: &Path,
    operation: &OutboxOperation,
    lease_owner: &str,
    remote_revision: Option<i64>,
    remote_payload_json: Option<&str>,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let changed = tx.execute(
        "UPDATE sync_outbox SET state='conflict',last_error='revision conflict',
           lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,updated_at_ms=?3
         WHERE operation_id=?1 AND state='sending' AND lease_owner=?2",
        params![operation.operation_id, lease_owner, now_ms],
    )?;
    if changed == 0 {
        return Ok(false);
    }
    let affected_batches = {
        let mut statement = tx.prepare(
            "SELECT DISTINCT batch_id FROM storage_import_items
             WHERE message_operation_id=?1 OR attachment_operation_id=?1",
        )?;
        let values = statement
            .query_map(params![operation.operation_id], |row| {
                row.get::<_, String>(0)
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
    };
    tx.execute(
        "UPDATE storage_import_items SET state='error',last_error='Supabase 数据冲突',updated_at_ms=?2
         WHERE message_operation_id=?1 OR attachment_operation_id=?1",
        params![operation.operation_id, now_ms],
    )?;
    for batch_id in affected_batches {
        tx.execute(
            "UPDATE storage_import_batches SET last_error='Supabase 数据冲突',updated_at_ms=?2
             WHERE batch_id=?1",
            params![batch_id, now_ms],
        )?;
        refresh_import_progress(&tx, &batch_id, now_ms)?;
    }
    tx.execute(
        "INSERT INTO sync_conflicts (
           endpoint_id,owner_scope,entity_type,entity_id,local_payload_json,
           remote_payload_json,local_revision,remote_revision,status,created_at_ms
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'unresolved',?9)",
        params![
            operation.endpoint_id,
            operation.owner_scope,
            operation.entity_type,
            operation.entity_id,
            operation.payload_json,
            remote_payload_json,
            operation.base_revision,
            remote_revision,
            now_ms,
        ],
    )?;
    let table = match operation.entity_type.as_str() {
        "message" => Some(("messages", "message_id")),
        "tag" => Some(("marked_tags", "id")),
        _ => None,
    };
    if let Some((table, id_column)) = table {
        tx.execute(
            &format!(
                "UPDATE {table} SET sync_state='conflict'
                 WHERE endpoint_id=?1 AND owner_scope=?2 AND {id_column}=?3"
            ),
            params![
                operation.endpoint_id,
                operation.owner_scope,
                operation.entity_id
            ],
        )?;
    }
    tx.commit()?;
    Ok(true)
}

pub fn get_outbox_operation(
    path: &Path,
    operation_id: &str,
) -> rusqlite::Result<Option<OutboxOperation>> {
    Connection::open(path)?
        .query_row(
            &format!("SELECT {OUTBOX_SELECT} FROM sync_outbox WHERE operation_id=?1"),
            params![operation_id],
            map_outbox_operation,
        )
        .optional()
}

pub fn get_sync_checkpoint(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
) -> rusqlite::Result<i64> {
    Ok(Connection::open(path)?
        .query_row(
            "SELECT change_seq FROM sync_checkpoints WHERE endpoint_id=?1 AND owner_scope=?2",
            params![endpoint_id, owner_scope],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(0))
}

pub fn get_supabase_history_cursor(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
) -> rusqlite::Result<SupabaseHistoryCursor> {
    Ok(Connection::open(path)?
        .query_row(
            "SELECT oldest_timestamp_ms,oldest_message_id,has_more_before,initialized
             FROM supabase_history_cursors WHERE endpoint_id=?1 AND owner_scope=?2",
            params![endpoint_id, owner_scope],
            |row| {
                Ok(SupabaseHistoryCursor {
                    oldest_timestamp_ms: row.get(0)?,
                    oldest_message_id: row.get(1)?,
                    has_more_before: row.get::<_, i64>(2)? != 0,
                    initialized: row.get::<_, i64>(3)? != 0,
                })
            },
        )
        .optional()?
        .unwrap_or(SupabaseHistoryCursor {
            oldest_timestamp_ms: None,
            oldest_message_id: None,
            has_more_before: true,
            initialized: false,
        }))
}

pub fn count_pending_outbox(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
) -> rusqlite::Result<i64> {
    Connection::open(path)?.query_row(
        "SELECT count(*) FROM sync_outbox WHERE endpoint_id=?1 AND owner_scope=?2
         AND state NOT IN ('acknowledged','superseded','conflict')",
        params![endpoint_id, owner_scope],
        |row| row.get(0),
    )
}

pub fn count_open_conflicts(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
) -> rusqlite::Result<i64> {
    Connection::open(path)?.query_row(
        "SELECT count(*) FROM sync_conflicts WHERE endpoint_id=?1 AND owner_scope=?2 AND status='unresolved'",
        params![endpoint_id,owner_scope], |row| row.get(0))
}

pub fn list_pending_operations(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
) -> rusqlite::Result<Vec<OutboxOperation>> {
    let conn = Connection::open(path)?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {OUTBOX_SELECT} FROM sync_outbox WHERE endpoint_id=?1 AND owner_scope=?2
         AND state NOT IN ('acknowledged','superseded','conflict') ORDER BY created_at_ms ASC"
    ))?;
    let rows = stmt.query_map(params![endpoint_id, owner_scope], map_outbox_operation)?;
    rows.collect()
}

pub fn retry_pending_operation(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    operation_id: &str,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    Ok(Connection::open(path)?.execute(
        "UPDATE sync_outbox SET state='pending',next_attempt_at_ms=0,last_error=NULL,
         lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,updated_at_ms=?4
         WHERE endpoint_id=?1 AND owner_scope=?2 AND operation_id=?3
           AND state NOT IN ('acknowledged','superseded','conflict')",
        params![endpoint_id, owner_scope, operation_id, now_ms],
    )? > 0)
}

pub fn retry_all_pending_operations(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    now_ms: i64,
) -> rusqlite::Result<usize> {
    Connection::open(path)?.execute(
        "UPDATE sync_outbox SET state='pending',next_attempt_at_ms=0,last_error=NULL,
         lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,updated_at_ms=?3
         WHERE endpoint_id=?1 AND owner_scope=?2
           AND state NOT IN ('acknowledged','superseded','conflict')",
        params![endpoint_id, owner_scope, now_ms],
    )
}

fn repair_stale_attachment_dependencies_in_tx(
    tx: &Connection,
    endpoint_id: &str,
    owner_scope: &str,
    now_ms: i64,
) -> rusqlite::Result<usize> {
    let affected_batches = {
        let mut statement = tx.prepare(
            "SELECT DISTINCT item.batch_id FROM storage_import_items item
             JOIN sync_outbox attachment_op
               ON attachment_op.operation_id=item.attachment_operation_id
             JOIN sync_outbox dependency
               ON dependency.operation_id=attachment_op.depends_on_operation_id
             WHERE attachment_op.endpoint_id=?1 AND attachment_op.owner_scope=?2
               AND attachment_op.entity_type='attachment' AND attachment_op.state='pending'
               AND dependency.state='superseded'",
        )?;
        let values = statement
            .query_map(params![endpoint_id, owner_scope], |row| {
                row.get::<_, String>(0)
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
    };
    let cancelled = tx.execute(
        "UPDATE sync_outbox AS attachment_op SET
           state='superseded',depends_on_operation_id=NULL,next_attempt_at_ms=0,
           last_error='关联消息已采用云端删除状态，附件同步已取消',
           lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,updated_at_ms=?3
         WHERE attachment_op.endpoint_id=?1 AND attachment_op.owner_scope=?2
           AND attachment_op.entity_type='attachment' AND attachment_op.action='upsert'
           AND attachment_op.state='pending'
           AND EXISTS (
             SELECT 1 FROM attachment_sync attachment
             JOIN messages message
               ON message.endpoint_id=attachment.endpoint_id
              AND message.owner_scope=attachment.owner_scope
              AND message.message_id=attachment.message_id
             WHERE attachment.endpoint_id=attachment_op.endpoint_id
               AND attachment.owner_scope=attachment_op.owner_scope
               AND attachment.attachment_id=attachment_op.entity_id
               AND message.deleted_at_ms IS NOT NULL
           )",
        params![endpoint_id, owner_scope, now_ms],
    )?;
    tx.execute(
        "UPDATE attachment_sync SET deleted_at_ms=coalesce(deleted_at_ms,?3),
           last_error=NULL,updated_at_ms=?3
         WHERE endpoint_id=?1 AND owner_scope=?2
           AND EXISTS (
             SELECT 1 FROM messages message
             WHERE message.endpoint_id=attachment_sync.endpoint_id
               AND message.owner_scope=attachment_sync.owner_scope
               AND message.message_id=attachment_sync.message_id
               AND message.deleted_at_ms IS NOT NULL
           )",
        params![endpoint_id, owner_scope, now_ms],
    )?;
    let released = tx.execute(
        "UPDATE sync_outbox AS attachment_op SET
           depends_on_operation_id=NULL,next_attempt_at_ms=0,last_error=NULL,updated_at_ms=?3
         WHERE attachment_op.endpoint_id=?1 AND attachment_op.owner_scope=?2
           AND attachment_op.entity_type='attachment' AND attachment_op.action='upsert'
           AND attachment_op.state='pending' AND attachment_op.depends_on_operation_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM sync_outbox dependency
             WHERE dependency.operation_id=attachment_op.depends_on_operation_id
               AND dependency.state='superseded'
           )
           AND EXISTS (
             SELECT 1 FROM attachment_sync attachment
             JOIN messages message
               ON message.endpoint_id=attachment.endpoint_id
              AND message.owner_scope=attachment.owner_scope
              AND message.message_id=attachment.message_id
             WHERE attachment.endpoint_id=attachment_op.endpoint_id
               AND attachment.owner_scope=attachment_op.owner_scope
               AND attachment.attachment_id=attachment_op.entity_id
               AND message.deleted_at_ms IS NULL AND message.remote_revision>0
           )",
        params![endpoint_id, owner_scope, now_ms],
    )?;
    tx.execute(
        "UPDATE storage_import_items SET state='skipped',last_error=NULL,updated_at_ms=?3
         WHERE batch_id IN (
           SELECT batch_id FROM storage_import_batches
           WHERE target_profile_id=?1 AND target_owner_scope=?2
         ) AND attachment_operation_id IN (
           SELECT operation_id FROM sync_outbox
           WHERE endpoint_id=?1 AND owner_scope=?2 AND entity_type='attachment'
             AND state='superseded'
             AND last_error='关联消息已采用云端删除状态，附件同步已取消'
         )",
        params![endpoint_id, owner_scope, now_ms],
    )?;
    for batch_id in affected_batches {
        refresh_import_progress(tx, &batch_id, now_ms)?;
    }
    Ok(cancelled + released)
}

pub fn repair_stale_attachment_dependencies(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    now_ms: i64,
) -> rusqlite::Result<usize> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let repaired =
        repair_stale_attachment_dependencies_in_tx(&tx, endpoint_id, owner_scope, now_ms)?;
    tx.commit()?;
    Ok(repaired)
}

pub fn list_sync_conflicts(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
) -> rusqlite::Result<Vec<SyncConflictRecord>> {
    let conn = Connection::open(path)?;
    let mut stmt = conn.prepare(
        "SELECT id,entity_type,entity_id,local_payload_json,remote_payload_json,
      local_revision,remote_revision,created_at_ms FROM sync_conflicts
      WHERE endpoint_id=?1 AND owner_scope=?2 AND status='unresolved' ORDER BY created_at_ms ASC",
    )?;
    let rows = stmt.query_map(params![endpoint_id, owner_scope], |row| {
        Ok(SyncConflictRecord {
            id: row.get(0)?,
            entity_type: row.get(1)?,
            entity_id: row.get(2)?,
            local_payload_json: row.get(3)?,
            remote_payload_json: row.get(4)?,
            local_revision: row.get(5)?,
            remote_revision: row.get(6)?,
            created_at_ms: row.get(7)?,
        })
    })?;
    rows.collect()
}

pub fn get_sync_conflict(
    path: &Path,
    id: i64,
    endpoint_id: &str,
    owner_scope: &str,
) -> rusqlite::Result<Option<SyncConflictRecord>> {
    Connection::open(path)?.query_row("SELECT id,entity_type,entity_id,local_payload_json,remote_payload_json,
      local_revision,remote_revision,created_at_ms FROM sync_conflicts WHERE id=?1 AND endpoint_id=?2
      AND owner_scope=?3 AND status='unresolved'",params![id,endpoint_id,owner_scope],|row|Ok(SyncConflictRecord{
      id:row.get(0)?,entity_type:row.get(1)?,entity_id:row.get(2)?,local_payload_json:row.get(3)?,
      remote_payload_json:row.get(4)?,local_revision:row.get(5)?,remote_revision:row.get(6)?,created_at_ms:row.get(7)?
    })).optional()
}

pub fn resolve_sync_conflict_keep_local(
    path: &Path,
    conflict_id: i64,
    endpoint_id: &str,
    owner_scope: &str,
    operation: &NewOutboxOperation,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let changed = tx.execute(
        "UPDATE sync_conflicts SET status='resolved_local',resolved_at_ms=?4
      WHERE id=?1 AND endpoint_id=?2 AND owner_scope=?3 AND status='unresolved'",
        params![conflict_id, endpoint_id, owner_scope, now_ms],
    )?;
    if changed == 0 {
        return Ok(false);
    }
    tx.execute(
        "UPDATE sync_outbox SET state='superseded',updated_at_ms=?4 WHERE endpoint_id=?1
      AND owner_scope=?2 AND entity_type=?3 AND entity_id=?5 AND state='conflict'",
        params![
            endpoint_id,
            owner_scope,
            operation.entity_type,
            now_ms,
            operation.entity_id
        ],
    )?;
    enqueue_outbox(&tx, operation)?;
    match operation.entity_type.as_str() {
        "message" => {
            tx.execute("UPDATE messages SET sync_state='pending' WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=?3",params![endpoint_id,owner_scope,operation.entity_id])?;
        }
        "tag" => {
            tx.execute("UPDATE marked_tags SET sync_state='pending' WHERE endpoint_id=?1 AND owner_scope=?2 AND id=?3",params![endpoint_id,owner_scope,operation.entity_id])?;
        }
        _ => {}
    }
    tx.commit()?;
    Ok(true)
}

pub fn resolve_all_sync_conflicts_keep_local(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    conflict_ids: &[i64],
    operations: &[NewOutboxOperation],
    now_ms: i64,
) -> rusqlite::Result<usize> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    for operation in operations {
        tx.execute(
            "UPDATE sync_outbox SET state='superseded',updated_at_ms=?4 WHERE endpoint_id=?1
             AND owner_scope=?2 AND entity_type=?3 AND entity_id=?5 AND state='conflict'",
            params![
                endpoint_id,
                owner_scope,
                operation.entity_type,
                now_ms,
                operation.entity_id
            ],
        )?;
        enqueue_outbox(&tx, operation)?;
        match operation.entity_type.as_str() {
            "message" => {
                tx.execute(
                    "UPDATE messages SET sync_state='pending'
                     WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=?3",
                    params![endpoint_id, owner_scope, operation.entity_id],
                )?;
            }
            "tag" => {
                tx.execute(
                    "UPDATE marked_tags SET sync_state='pending'
                     WHERE endpoint_id=?1 AND owner_scope=?2 AND id=?3",
                    params![endpoint_id, owner_scope, operation.entity_id],
                )?;
            }
            _ => {}
        }
    }
    let mut resolved_count = 0;
    for conflict_id in conflict_ids {
        resolved_count += tx.execute(
            "UPDATE sync_conflicts SET status='resolved_local',resolved_at_ms=?4
             WHERE id=?1 AND endpoint_id=?2 AND owner_scope=?3 AND status='unresolved'",
            params![conflict_id, endpoint_id, owner_scope, now_ms],
        )?;
    }
    tx.commit()?;
    Ok(resolved_count)
}

pub fn resolve_sync_conflict_use_remote(
    path: &Path,
    conflict_id: i64,
    endpoint_id: &str,
    owner_scope: &str,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    let Some(conflict) = get_sync_conflict(path, conflict_id, endpoint_id, owner_scope)? else {
        return Ok(false);
    };
    let snapshot: Option<serde_json::Value> = conflict
        .remote_payload_json
        .as_deref()
        .and_then(|value| serde_json::from_str(value).ok());
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE sync_outbox SET state='superseded',updated_at_ms=?5 WHERE endpoint_id=?1
      AND owner_scope=?2 AND entity_type=?3 AND entity_id=?4 AND state='conflict'",
        params![
            endpoint_id,
            owner_scope,
            conflict.entity_type,
            conflict.entity_id,
            now_ms
        ],
    )?;
    let change = PulledChange {
        change_seq: 0,
        entity_type: conflict.entity_type.clone(),
        entity_id: conflict.entity_id.clone(),
        change_type: if snapshot
            .as_ref()
            .is_none_or(|value| !value["deleted_at"].is_null())
        {
            "delete".into()
        } else {
            "upsert".into()
        },
        revision: conflict.remote_revision.unwrap_or(0),
        snapshot,
    };
    match change.entity_type.as_str() {
        "message" => apply_pulled_message(&tx, endpoint_id, owner_scope, &change, now_ms)?,
        "tag" => apply_pulled_tag(&tx, endpoint_id, owner_scope, &change, now_ms)?,
        "attachment" => apply_pulled_attachment(&tx, endpoint_id, owner_scope, &change, now_ms)?,
        _ => {}
    }
    tx.execute(
        "UPDATE sync_conflicts SET status='resolved_remote',resolved_at_ms=?4
      WHERE id=?1 AND endpoint_id=?2 AND owner_scope=?3",
        params![conflict_id, endpoint_id, owner_scope, now_ms],
    )?;
    tx.commit()?;
    Ok(true)
}

pub fn resolve_all_sync_conflicts_use_remote(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    now_ms: i64,
) -> rusqlite::Result<usize> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let conflicts = {
        let mut statement = tx.prepare(
            "SELECT id,entity_type,entity_id,local_payload_json,remote_payload_json,
             local_revision,remote_revision,created_at_ms FROM sync_conflicts
             WHERE endpoint_id=?1 AND owner_scope=?2 AND status='unresolved'
             ORDER BY created_at_ms ASC,id ASC",
        )?;
        let values = statement
            .query_map(params![endpoint_id, owner_scope], |row| {
                Ok(SyncConflictRecord {
                    id: row.get(0)?,
                    entity_type: row.get(1)?,
                    entity_id: row.get(2)?,
                    local_payload_json: row.get(3)?,
                    remote_payload_json: row.get(4)?,
                    local_revision: row.get(5)?,
                    remote_revision: row.get(6)?,
                    created_at_ms: row.get(7)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        values
    };
    if conflicts.is_empty() {
        return Ok(0);
    }
    let conflict_ids = conflicts
        .iter()
        .map(|conflict| conflict.id)
        .collect::<Vec<_>>();
    let mut latest_conflicts: Vec<SyncConflictRecord> = Vec::new();
    for conflict in &conflicts {
        if let Some(existing) = latest_conflicts.iter_mut().find(|existing| {
            existing.entity_type == conflict.entity_type && existing.entity_id == conflict.entity_id
        }) {
            *existing = conflict.clone();
        } else {
            latest_conflicts.push(conflict.clone());
        }
    }
    for conflict in latest_conflicts {
        tx.execute(
            "UPDATE sync_outbox SET state='superseded',updated_at_ms=?5 WHERE endpoint_id=?1
             AND owner_scope=?2 AND entity_type=?3 AND entity_id=?4 AND state='conflict'",
            params![
                endpoint_id,
                owner_scope,
                conflict.entity_type,
                conflict.entity_id,
                now_ms
            ],
        )?;
        let snapshot: Option<serde_json::Value> = conflict
            .remote_payload_json
            .as_deref()
            .and_then(|value| serde_json::from_str(value).ok());
        let change = PulledChange {
            change_seq: 0,
            entity_type: conflict.entity_type.clone(),
            entity_id: conflict.entity_id.clone(),
            change_type: if snapshot
                .as_ref()
                .is_none_or(|value| !value["deleted_at"].is_null())
            {
                "delete".into()
            } else {
                "upsert".into()
            },
            revision: conflict.remote_revision.unwrap_or(0),
            snapshot,
        };
        match change.entity_type.as_str() {
            "message" => apply_pulled_message(&tx, endpoint_id, owner_scope, &change, now_ms)?,
            "tag" => apply_pulled_tag(&tx, endpoint_id, owner_scope, &change, now_ms)?,
            "attachment" => {
                apply_pulled_attachment(&tx, endpoint_id, owner_scope, &change, now_ms)?
            }
            _ => {}
        }
    }
    for conflict_id in conflict_ids {
        tx.execute(
            "UPDATE sync_conflicts SET status='resolved_remote',resolved_at_ms=?4
             WHERE id=?1 AND endpoint_id=?2 AND owner_scope=?3 AND status='unresolved'",
            params![conflict_id, endpoint_id, owner_scope, now_ms],
        )?;
    }
    tx.commit()?;
    Ok(conflicts.len())
}

pub fn apply_pulled_changes(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    changes: &[PulledChange],
    checkpoint: i64,
    now_ms: i64,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    for change in changes {
        match change.entity_type.as_str() {
            "message" => apply_pulled_message(&tx, endpoint_id, owner_scope, change, now_ms)?,
            "tag" => apply_pulled_tag(&tx, endpoint_id, owner_scope, change, now_ms)?,
            "attachment" => apply_pulled_attachment(&tx, endpoint_id, owner_scope, change, now_ms)?,
            _ => {}
        }
    }
    tx.execute(
        "INSERT INTO sync_checkpoints (endpoint_id,owner_scope,change_seq,updated_at_ms)
         VALUES (?1,?2,?3,?4)
         ON CONFLICT(endpoint_id,owner_scope) DO UPDATE SET
           change_seq=max(sync_checkpoints.change_seq,excluded.change_seq),updated_at_ms=excluded.updated_at_ms",
        params![endpoint_id, owner_scope, checkpoint, now_ms],
    )?;
    tx.commit()
}

pub fn apply_supabase_message_page(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    messages: &[serde_json::Value],
    tags: &[serde_json::Value],
    attachments: &[serde_json::Value],
    has_more_before: bool,
    advance_history_cursor: bool,
    now_ms: i64,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    for (entity_type, snapshots) in [
        ("tag", tags),
        ("message", messages),
        ("attachment", attachments),
    ] {
        for snapshot in snapshots {
            let Some(entity_id) = snapshot["id"].as_str() else {
                continue;
            };
            let change = PulledChange {
                change_seq: 0,
                entity_type: entity_type.to_string(),
                entity_id: entity_id.to_string(),
                change_type: "upsert".to_string(),
                revision: snapshot["revision"].as_i64().unwrap_or(0),
                snapshot: Some(snapshot.clone()),
            };
            match entity_type {
                "message" => apply_pulled_message(&tx, endpoint_id, owner_scope, &change, now_ms)?,
                "tag" => apply_pulled_tag(&tx, endpoint_id, owner_scope, &change, now_ms)?,
                "attachment" => {
                    apply_pulled_attachment(&tx, endpoint_id, owner_scope, &change, now_ms)?
                }
                _ => {}
            }
        }
    }

    let oldest = messages
        .last()
        .and_then(|row| Some((row["timestamp_ms"].as_i64()?, row["id"].as_str()?)));
    if advance_history_cursor {
        tx.execute(
            "INSERT INTO supabase_history_cursors (endpoint_id,owner_scope,oldest_timestamp_ms,
               oldest_message_id,has_more_before,initialized,updated_at_ms)
             VALUES (?1,?2,?3,?4,?5,1,?6)
             ON CONFLICT(endpoint_id,owner_scope) DO UPDATE SET
               oldest_timestamp_ms=excluded.oldest_timestamp_ms,
               oldest_message_id=excluded.oldest_message_id,
               has_more_before=excluded.has_more_before,initialized=1,
               updated_at_ms=excluded.updated_at_ms",
            params![
                endpoint_id,
                owner_scope,
                oldest.map(|value| value.0),
                oldest.map(|value| value.1),
                has_more_before,
                now_ms
            ],
        )?;
    } else {
        tx.execute(
            "INSERT INTO supabase_history_cursors (endpoint_id,owner_scope,oldest_timestamp_ms,
               oldest_message_id,has_more_before,initialized,updated_at_ms)
             VALUES (?1,?2,?3,?4,?5,1,?6)
             ON CONFLICT(endpoint_id,owner_scope) DO UPDATE SET updated_at_ms=excluded.updated_at_ms",
            params![
                endpoint_id,
                owner_scope,
                oldest.map(|value| value.0),
                oldest.map(|value| value.1),
                has_more_before,
                now_ms
            ],
        )?;
    }
    tx.commit()
}

fn apply_pulled_message(
    tx: &Connection,
    endpoint_id: &str,
    owner_scope: &str,
    change: &PulledChange,
    now_ms: i64,
) -> rusqlite::Result<()> {
    if local_entity_has_work(tx, endpoint_id, owner_scope, "message", &change.entity_id)? {
        return insert_pull_conflict(tx, endpoint_id, owner_scope, change, now_ms);
    }
    let Some(snapshot) = change.snapshot.as_ref() else {
        return Ok(());
    };
    let deleted = change.change_type == "delete" || !snapshot["deleted_at"].is_null();
    let existing_filename = tx
        .query_row(
            "SELECT filename FROM messages
             WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=?3",
            params![endpoint_id, owner_scope, change.entity_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let requested_filename = snapshot["legacy_filename"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let mut target_filename = requested_filename
        .or(existing_filename.as_deref())
        .unwrap_or(&change.entity_id)
        .to_string();
    if let Some(existing_filename) = existing_filename.as_deref() {
        if existing_filename != target_filename {
            let target_is_occupied: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM messages
                 WHERE endpoint_id=?1 AND owner_scope=?2 AND filename=?3
                   AND coalesce(message_id,'')<>?4)",
                params![endpoint_id, owner_scope, target_filename, change.entity_id],
                |row| row.get(0),
            )?;
            if target_is_occupied {
                target_filename = existing_filename.to_string();
            } else {
                tx.execute(
                    "UPDATE messages SET filename=?4
                     WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=?3",
                    params![endpoint_id, owner_scope, change.entity_id, target_filename],
                )?;
            }
        }
    }
    tx.execute(
        "INSERT INTO messages (
           endpoint_id,filename,sender,timestamp_ms,size,kind,original_name,content,format,file_hash,
           marked,marked_tag_ids,marked_pinned,marked_due_date,transcript_source,source_audio_mime_type,
           transcript_raw_text,source_kind,source_channel_id,source_message_id,
           message_id,remote_revision,deleted_at_ms,sync_state,owner_scope
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,'synced',?24)
         ON CONFLICT(endpoint_id,owner_scope,filename) DO UPDATE SET
           sender=excluded.sender,timestamp_ms=excluded.timestamp_ms,size=excluded.size,
           kind=excluded.kind,original_name=excluded.original_name,content=excluded.content,
           format=excluded.format,file_hash=excluded.file_hash,marked=excluded.marked,
           marked_tag_ids=excluded.marked_tag_ids,marked_pinned=excluded.marked_pinned,
           marked_due_date=excluded.marked_due_date,transcript_source=excluded.transcript_source,
           source_audio_mime_type=excluded.source_audio_mime_type,
           transcript_raw_text=excluded.transcript_raw_text,source_kind=excluded.source_kind,
           source_channel_id=excluded.source_channel_id,source_message_id=excluded.source_message_id,
           message_id=excluded.message_id,
           remote_revision=excluded.remote_revision,deleted_at_ms=excluded.deleted_at_ms,
           sync_state='synced',owner_scope=excluded.owner_scope",
        params![
            endpoint_id,
            target_filename,
            snapshot["sender"].as_str().unwrap_or_default(),
            snapshot["timestamp_ms"].as_i64().unwrap_or(0),
            snapshot["size"].as_i64().unwrap_or(0),
            snapshot["kind"].as_str().unwrap_or("text"),
            snapshot["original_name"].as_str().unwrap_or_default(),
            snapshot["content"].as_str(),
            snapshot["format"].as_str().unwrap_or("text"),
            snapshot["file_hash"].as_str(),
            snapshot["marked"].as_bool().unwrap_or(false),
            serde_json::to_string(&snapshot["marked_tag_ids"])
                .unwrap_or_else(|_| "[]".into()),
            snapshot["marked_pinned"].as_bool().unwrap_or(false),
            snapshot["marked_due_date"].as_str(),
            snapshot["transcript_source"].as_str(),
            snapshot["source_audio_mime_type"].as_str(),
            snapshot["transcript_raw_text"].as_str(),
            snapshot["source_kind"].as_str(),
            snapshot["source_channel_id"].as_str(),
            snapshot["source_message_id"].as_str(),
            change.entity_id,
            change.revision,
            deleted.then_some(now_ms),
            owner_scope,
        ],
    )?;
    tx.execute(
        "UPDATE messages SET remote_path=(
           SELECT object_path FROM attachment_sync
           WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=?3
             AND deleted_at_ms IS NULL AND object_path IS NOT NULL AND object_path<>''
           ORDER BY remote_revision DESC LIMIT 1
         )
         WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=?3
           AND EXISTS (
             SELECT 1 FROM attachment_sync
             WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=?3
               AND deleted_at_ms IS NULL AND object_path IS NOT NULL AND object_path<>''
           )",
        params![endpoint_id, owner_scope, change.entity_id],
    )?;
    repair_stale_attachment_dependencies_in_tx(tx, endpoint_id, owner_scope, now_ms)?;
    Ok(())
}

fn apply_pulled_tag(
    tx: &Connection,
    endpoint_id: &str,
    owner_scope: &str,
    change: &PulledChange,
    now_ms: i64,
) -> rusqlite::Result<()> {
    if local_entity_has_work(tx, endpoint_id, owner_scope, "tag", &change.entity_id)? {
        return insert_pull_conflict(tx, endpoint_id, owner_scope, change, now_ms);
    }
    let Some(snapshot) = change.snapshot.as_ref() else {
        return Ok(());
    };
    let deleted = change.change_type == "delete" || !snapshot["deleted_at"].is_null();
    tx.execute(
        "INSERT INTO marked_tags (endpoint_id,id,name,owner_scope,remote_revision,deleted_at_ms,sync_state)
         VALUES (?1,?2,?3,?4,?5,?6,'synced') ON CONFLICT(endpoint_id,owner_scope,id) DO UPDATE SET
         name=excluded.name,owner_scope=excluded.owner_scope,remote_revision=excluded.remote_revision,
         deleted_at_ms=excluded.deleted_at_ms,sync_state='synced'",
        params![endpoint_id, change.entity_id, snapshot["name"].as_str().unwrap_or_default(),
            owner_scope, change.revision, deleted.then_some(now_ms)],
    )?;
    Ok(())
}

fn apply_pulled_attachment(
    tx: &Connection,
    endpoint_id: &str,
    owner_scope: &str,
    change: &PulledChange,
    now_ms: i64,
) -> rusqlite::Result<()> {
    let Some(snapshot) = change.snapshot.as_ref() else {
        return Ok(());
    };
    let deleted = change.change_type == "delete" || !snapshot["deleted_at"].is_null();
    tx.execute(
        "INSERT INTO attachment_sync (endpoint_id,owner_scope,attachment_id,message_id,original_name,
         object_path,preview_object_path,mime_type,size,sha256,upload_state,remote_revision,deleted_at_ms,updated_at_ms)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'uploaded',?11,?12,?13)
         ON CONFLICT(endpoint_id,owner_scope,attachment_id) DO UPDATE SET
         message_id=excluded.message_id,original_name=excluded.original_name,object_path=excluded.object_path,
         preview_object_path=excluded.preview_object_path,mime_type=excluded.mime_type,size=excluded.size,
         sha256=excluded.sha256,upload_state='uploaded',remote_revision=excluded.remote_revision,
         deleted_at_ms=excluded.deleted_at_ms,updated_at_ms=excluded.updated_at_ms",
        params![endpoint_id,owner_scope,change.entity_id,snapshot["message_id"].as_str().unwrap_or_default(),
            snapshot["original_name"].as_str().unwrap_or_default(),snapshot["object_path"].as_str(),
            snapshot["preview_object_path"].as_str(),snapshot["mime_type"].as_str(),
            snapshot["size"].as_i64().unwrap_or(0),snapshot["sha256"].as_str(),
            change.revision,deleted.then_some(now_ms),now_ms],
    )?;
    tx.execute(
        "UPDATE messages SET remote_path=?4
         WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=?3",
        params![
            endpoint_id,
            owner_scope,
            snapshot["message_id"].as_str().unwrap_or_default(),
            (!deleted)
                .then(|| snapshot["object_path"].as_str())
                .flatten(),
        ],
    )?;
    Ok(())
}

fn local_entity_has_work(
    tx: &Connection,
    endpoint_id: &str,
    owner_scope: &str,
    entity_type: &str,
    entity_id: &str,
) -> rusqlite::Result<bool> {
    Ok(tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM sync_outbox WHERE endpoint_id=?1 AND owner_scope=?2
          AND entity_type=?3 AND entity_id=?4 AND state NOT IN ('acknowledged','superseded'))",
        params![endpoint_id, owner_scope, entity_type, entity_id],
        |row| row.get(0),
    )?)
}

fn insert_pull_conflict(
    tx: &Connection,
    endpoint_id: &str,
    owner_scope: &str,
    change: &PulledChange,
    now_ms: i64,
) -> rusqlite::Result<()> {
    tx.execute(
        "INSERT INTO sync_conflicts (endpoint_id,owner_scope,entity_type,entity_id,local_payload_json,
         remote_payload_json,local_revision,remote_revision,status,created_at_ms)
         SELECT ?1,?2,?3,?4,coalesce((SELECT payload_json FROM sync_outbox WHERE endpoint_id=?1
           AND owner_scope=?2 AND entity_type=?3 AND entity_id=?4
           AND state NOT IN ('acknowledged','superseded') ORDER BY rowid DESC LIMIT 1),'{}'),
           ?5,0,?6,'unresolved',?7
         WHERE NOT EXISTS (SELECT 1 FROM sync_conflicts WHERE endpoint_id=?1 AND owner_scope=?2
           AND entity_type=?3 AND entity_id=?4 AND status='unresolved' AND remote_revision=?6)",
        params![endpoint_id,owner_scope,change.entity_type,change.entity_id,
            change.snapshot.as_ref().map(|value| value.to_string()),change.revision,now_ms],
    )?;
    Ok(())
}

pub fn save_message_and_enqueue(
    path: &Path,
    message: &DbMessage,
    operation: &NewOutboxOperation,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE messages SET
           sender=?3,timestamp_ms=?4,size=?5,kind=?6,original_name=?7,content=?8,
           marked=?9,marked_tag_ids=?10,marked_pinned=?11,marked_due_date=?12,
           format=?13,transcript_source=?14,source_audio_mime_type=?15,
           transcript_raw_text=?16,source_kind=?17,source_channel_id=?18,source_message_id=?19,
           sync_state='pending',deleted_at_ms=NULL
         WHERE endpoint_id=?1 AND filename=?2 AND owner_scope=?20",
        params![
            message.endpoint_id,
            message.filename,
            message.sender,
            message.timestamp_ms,
            message.size,
            message.kind,
            message.original_name,
            message.content,
            message.marked,
            serialize_tag_ids(&message.marked_tag_ids)?,
            message.marked_pinned,
            message.marked_due_date,
            message.format,
            message.transcript_source,
            message.source_audio_mime_type,
            message.transcript_raw_text,
            message.source_kind,
            message.source_channel_id,
            message.source_message_id,
            operation.owner_scope,
        ],
    )?;
    if tx.changes() == 0 {
        tx.execute(
            "INSERT INTO messages (
              endpoint_id,filename,sender,timestamp_ms,size,kind,original_name,etag,mtime,
              content,local_path,remote_path,file_hash,marked,marked_tag_ids,marked_pinned,
              marked_due_date,format,transcript_source,source_audio_mime_type,
              transcript_raw_text,source_kind,source_channel_id,source_message_id,
              message_id,remote_revision,deleted_at_ms,sync_state,owner_scope
            ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,
              ?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,NULL,'pending',?27)",
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
                message.marked_due_date,
                message.format,
                message.transcript_source,
                message.source_audio_mime_type,
                message.transcript_raw_text,
                message.source_kind,
                message.source_channel_id,
                message.source_message_id,
                operation.entity_id,
                operation.base_revision,
                operation.owner_scope,
            ],
        )?;
    }
    enqueue_outbox(&tx, operation)?;
    tx.commit()
}

pub fn save_file_message_and_enqueue(
    path: &Path,
    message: &DbMessage,
    message_operation: &NewOutboxOperation,
    attachment_id: &str,
    object_path: &str,
    mime_type: Option<&str>,
    attachment_operation: &NewOutboxOperation,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO messages (endpoint_id,filename,sender,timestamp_ms,size,kind,original_name,content,
         local_path,remote_path,file_hash,marked,marked_tag_ids,marked_pinned,marked_due_date,format,
         source_kind,source_channel_id,source_message_id,message_id,remote_revision,deleted_at_ms,sync_state,owner_scope)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,0,NULL,'pending',?21)",
        params![message.endpoint_id,message.filename,message.sender,message.timestamp_ms,message.size,
            message.kind,message.original_name,message.content,message.local_path,message.remote_path,
            message.file_hash,message.marked,serialize_tag_ids(&message.marked_tag_ids)?,
            message.marked_pinned,message.marked_due_date,message.format,message.source_kind,
            message.source_channel_id,message.source_message_id,message_operation.entity_id,
            message_operation.owner_scope],
    )?;
    tx.execute(
        "INSERT INTO attachment_sync (endpoint_id,owner_scope,attachment_id,message_id,original_name,
         local_path,object_path,mime_type,size,sha256,upload_state,updated_at_ms)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'local',?11)",
        params![message.endpoint_id,message_operation.owner_scope,attachment_id,message_operation.entity_id,
            message.original_name,message.local_path,object_path,mime_type,message.size,message.file_hash,
            message_operation.created_at_ms],
    )?;
    enqueue_outbox(&tx, message_operation)?;
    enqueue_outbox(&tx, attachment_operation)?;
    tx.commit()
}

#[allow(clippy::too_many_arguments)]
pub fn save_message_with_marked_changes_and_enqueue(
    path: &Path,
    message: &DbMessage,
    created_tags: &[(MarkedTag, NewOutboxOperation)],
    cleaned_messages: &[(String, Vec<String>, NewOutboxOperation)],
    message_operation: &NewOutboxOperation,
    deleted_tags: &[(MarkedTag, i64, i64, NewOutboxOperation)],
    attachment: Option<(&str, &str, Option<&str>, Option<&str>, &NewOutboxOperation)>,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let mut dependency: Option<String> = None;
    for (tag, operation) in created_tags {
        tx.execute(
            "INSERT INTO marked_tags
               (endpoint_id,id,name,owner_scope,remote_revision,deleted_at_ms,sync_state)
             VALUES (?1,?2,?3,?4,0,NULL,'pending')
             ON CONFLICT(endpoint_id,owner_scope,id) DO UPDATE SET
               name=excluded.name,deleted_at_ms=NULL,sync_state='pending'",
            params![
                operation.endpoint_id,
                tag.id,
                tag.name,
                operation.owner_scope
            ],
        )?;
        enqueue_outbox_with_dependency(&tx, operation, dependency.as_deref())?;
        dependency = Some(operation.operation_id.clone());
    }
    for (filename, tag_ids, operation) in cleaned_messages {
        if tx.execute(
            "UPDATE messages SET marked_tag_ids=?4,sync_state='pending'
             WHERE endpoint_id=?1 AND owner_scope=?2 AND filename=?3
               AND deleted_at_ms IS NULL AND marked=1",
            params![
                operation.endpoint_id,
                operation.owner_scope,
                filename,
                serialize_tag_ids(tag_ids)?,
            ],
        )? == 0
        {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        enqueue_outbox_with_dependency(&tx, operation, dependency.as_deref())?;
        dependency = Some(operation.operation_id.clone());
    }
    tx.execute(
        "INSERT INTO messages (
          endpoint_id,filename,sender,timestamp_ms,size,kind,original_name,etag,mtime,
          content,local_path,remote_path,file_hash,marked,marked_tag_ids,marked_pinned,
          marked_due_date,format,transcript_source,source_audio_mime_type,
          transcript_raw_text,source_kind,source_channel_id,source_message_id,
          message_id,remote_revision,deleted_at_ms,sync_state,owner_scope
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,
          ?17,?18,?19,?20,?21,?22,?23,?24,?25,0,NULL,'pending',?26)",
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
            message.marked_due_date,
            message.format,
            message.transcript_source,
            message.source_audio_mime_type,
            message.transcript_raw_text,
            message.source_kind,
            message.source_channel_id,
            message.source_message_id,
            message_operation.entity_id,
            message_operation.owner_scope,
        ],
    )?;
    enqueue_outbox_with_dependency(&tx, message_operation, dependency.as_deref())?;
    dependency = Some(message_operation.operation_id.clone());
    for (tag, revision, deleted_at_ms, operation) in deleted_tags {
        if tx.execute(
            "UPDATE marked_tags SET deleted_at_ms=?5,sync_state='pending'
             WHERE endpoint_id=?1 AND owner_scope=?2 AND id=?3 AND remote_revision=?4",
            params![
                operation.endpoint_id,
                operation.owner_scope,
                tag.id,
                revision,
                deleted_at_ms,
            ],
        )? == 0
        {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        enqueue_outbox_with_dependency(&tx, operation, dependency.as_deref())?;
        dependency = Some(operation.operation_id.clone());
    }
    if let Some((attachment_id, object_path, preview_object_path, mime_type, operation)) =
        attachment
    {
        tx.execute(
            "INSERT INTO attachment_sync (endpoint_id,owner_scope,attachment_id,message_id,original_name,
             local_path,object_path,preview_object_path,mime_type,size,sha256,upload_state,updated_at_ms)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'local',?12)",
            params![
                message.endpoint_id,operation.owner_scope,attachment_id,message_operation.entity_id,
                message.original_name,message.local_path,object_path,preview_object_path,mime_type,
                message.size,message.file_hash,message_operation.created_at_ms,
            ],
        )?;
        enqueue_outbox_with_dependency(&tx, operation, dependency.as_deref())?;
    }
    tx.commit()
}

pub fn get_attachment_local_path(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    attachment_id: &str,
) -> rusqlite::Result<Option<(String, String, String, i64, Option<String>)>> {
    Connection::open(path)?
        .query_row(
            "SELECT local_path,object_path,original_name,size,sha256 FROM attachment_sync
         WHERE endpoint_id=?1 AND owner_scope=?2 AND attachment_id=?3 AND deleted_at_ms IS NULL",
            params![endpoint_id, owner_scope, attachment_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .optional()
}

fn map_attachment_sync_record(row: &Row<'_>) -> rusqlite::Result<AttachmentSyncRecord> {
    Ok(AttachmentSyncRecord {
        attachment_id: row.get(0)?,
        message_id: row.get(1)?,
        original_name: row.get(2)?,
        local_path: row.get(3)?,
        object_path: row.get(4)?,
        preview_object_path: row.get(5)?,
        mime_type: row.get(6)?,
        size: row.get(7)?,
        sha256: row.get(8)?,
        upload_state: row.get(9)?,
        remote_revision: row.get(10)?,
    })
}

const ATTACHMENT_SYNC_SELECT: &str = "attachment_id,message_id,original_name,local_path,
 object_path,preview_object_path,mime_type,size,sha256,upload_state,remote_revision";

pub fn get_attachment_sync_record(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    attachment_id: &str,
) -> rusqlite::Result<Option<AttachmentSyncRecord>> {
    Connection::open(path)?
        .query_row(
            &format!(
                "SELECT {ATTACHMENT_SYNC_SELECT} FROM attachment_sync
                 WHERE endpoint_id=?1 AND owner_scope=?2 AND attachment_id=?3
                   AND deleted_at_ms IS NULL"
            ),
            params![endpoint_id, owner_scope, attachment_id],
            map_attachment_sync_record,
        )
        .optional()
}

pub fn get_attachment_for_message(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    message_id: &str,
) -> rusqlite::Result<Option<AttachmentSyncRecord>> {
    Connection::open(path)?
        .query_row(
            &format!(
                "SELECT {ATTACHMENT_SYNC_SELECT} FROM attachment_sync
                 WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=?3
                   AND deleted_at_ms IS NULL
                 ORDER BY remote_revision DESC, updated_at_ms DESC LIMIT 1"
            ),
            params![endpoint_id, owner_scope, message_id],
            map_attachment_sync_record,
        )
        .optional()
}

pub fn set_attachment_preview_and_enqueue(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    attachment_id: &str,
    preview_object_path: &str,
    operation: &NewOutboxOperation,
    now_ms: i64,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let changed = tx.execute(
        "UPDATE attachment_sync SET preview_object_path=?4,last_error=NULL,updated_at_ms=?5
         WHERE endpoint_id=?1 AND owner_scope=?2 AND attachment_id=?3
           AND deleted_at_ms IS NULL",
        params![
            endpoint_id,
            owner_scope,
            attachment_id,
            preview_object_path,
            now_ms
        ],
    )?;
    if changed == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    enqueue_outbox(&tx, operation)?;
    tx.commit()
}

pub fn get_attachment_object_path_for_message(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    message_id: &str,
) -> rusqlite::Result<Option<String>> {
    Connection::open(path)?
        .query_row(
            "SELECT object_path FROM attachment_sync
             WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=?3
               AND deleted_at_ms IS NULL AND object_path IS NOT NULL AND object_path<>''
             ORDER BY remote_revision DESC LIMIT 1",
            params![endpoint_id, owner_scope, message_id],
            |row| row.get(0),
        )
        .optional()
}

#[allow(clippy::too_many_arguments)]
pub fn repair_claimed_attachment_object_path(
    path: &Path,
    operation_id: &str,
    lease_owner: &str,
    endpoint_id: &str,
    owner_scope: &str,
    attachment_id: &str,
    object_path: &str,
    payload_json: &str,
    payload_hash: &str,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let changed = tx.execute(
        "UPDATE sync_outbox SET payload_json=?3,payload_hash=?4,last_error=NULL,updated_at_ms=?5
         WHERE operation_id=?1 AND state='sending' AND lease_owner=?2",
        params![
            operation_id,
            lease_owner,
            payload_json,
            payload_hash,
            now_ms
        ],
    )?;
    if changed == 0 {
        return Ok(false);
    }
    tx.execute(
        "UPDATE attachment_sync SET object_path=?4,last_error=NULL,updated_at_ms=?5
         WHERE endpoint_id=?1 AND owner_scope=?2 AND attachment_id=?3",
        params![endpoint_id, owner_scope, attachment_id, object_path, now_ms],
    )?;
    tx.execute(
        "UPDATE messages SET remote_path=?4
         WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=(
           SELECT message_id FROM attachment_sync
           WHERE endpoint_id=?1 AND owner_scope=?2 AND attachment_id=?3
         )",
        params![endpoint_id, owner_scope, attachment_id, object_path],
    )?;
    tx.commit()?;
    Ok(true)
}

#[allow(clippy::too_many_arguments)]
pub fn repair_claimed_attachment_preview_path(
    path: &Path,
    operation_id: &str,
    lease_owner: &str,
    endpoint_id: &str,
    owner_scope: &str,
    attachment_id: &str,
    preview_object_path: Option<&str>,
    payload_json: &str,
    payload_hash: &str,
    last_error: Option<&str>,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let changed = tx.execute(
        "UPDATE sync_outbox SET payload_json=?3,payload_hash=?4,last_error=?5,updated_at_ms=?6
         WHERE operation_id=?1 AND state='sending' AND lease_owner=?2",
        params![
            operation_id,
            lease_owner,
            payload_json,
            payload_hash,
            last_error,
            now_ms
        ],
    )?;
    if changed == 0 {
        return Ok(false);
    }
    tx.execute(
        "UPDATE attachment_sync SET preview_object_path=?4,last_error=?5,updated_at_ms=?6
         WHERE endpoint_id=?1 AND owner_scope=?2 AND attachment_id=?3",
        params![
            endpoint_id,
            owner_scope,
            attachment_id,
            preview_object_path,
            last_error,
            now_ms
        ],
    )?;
    tx.commit()?;
    Ok(true)
}

pub fn set_message_local_path_for_scope(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    filename: &str,
    local_path: &str,
) -> rusqlite::Result<bool> {
    Ok(Connection::open(path)?.execute(
        "UPDATE messages SET local_path=?4 WHERE endpoint_id=?1 AND owner_scope=?2 AND filename=?3",
        params![endpoint_id, owner_scope, filename, local_path],
    )? > 0)
}

pub fn clear_uploaded_attachment_local_path(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    attachment_id: &str,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let message_id = tx
        .query_row(
            "SELECT message_id FROM attachment_sync
             WHERE endpoint_id=?1 AND owner_scope=?2 AND attachment_id=?3
               AND upload_state='uploaded' AND deleted_at_ms IS NULL",
            params![endpoint_id, owner_scope, attachment_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let Some(message_id) = message_id else {
        return Ok(false);
    };
    tx.execute(
        "UPDATE attachment_sync SET local_path=NULL,updated_at_ms=?4
         WHERE endpoint_id=?1 AND owner_scope=?2 AND attachment_id=?3",
        params![endpoint_id, owner_scope, attachment_id, now_ms],
    )?;
    tx.execute(
        "UPDATE messages SET local_path=NULL
         WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=?3",
        params![endpoint_id, owner_scope, message_id],
    )?;
    tx.commit()?;
    Ok(true)
}

pub fn list_orphan_attachment_candidates(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    cutoff_ms: i64,
    limit: usize,
) -> rusqlite::Result<Vec<OrphanAttachmentCandidate>> {
    let conn = Connection::open(path)?;
    let mut stmt = conn.prepare(
        "SELECT a.attachment_id,a.object_path,a.preview_object_path FROM attachment_sync a
         WHERE a.endpoint_id=?1 AND a.owner_scope=?2 AND a.deleted_at_ms IS NOT NULL
           AND a.deleted_at_ms<=?3 AND a.object_path IS NOT NULL AND a.object_path<>''
           AND a.upload_state NOT IN ('local','uploading','pending_metadata')
           AND NOT EXISTS (SELECT 1 FROM sync_outbox o WHERE o.endpoint_id=a.endpoint_id
             AND o.owner_scope=a.owner_scope AND o.entity_type='attachment'
             AND o.entity_id=a.attachment_id AND o.state NOT IN ('acknowledged','superseded'))
         ORDER BY a.deleted_at_ms ASC LIMIT ?4",
    )?;
    let rows = stmt.query_map(
        params![endpoint_id, owner_scope, cutoff_ms, limit as i64],
        |row| {
            Ok(OrphanAttachmentCandidate {
                attachment_id: row.get(0)?,
                object_path: row.get(1)?,
                preview_object_path: row.get(2)?,
            })
        },
    )?;
    let result = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(result)
}

pub fn mark_attachment_object_cleaned(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    attachment_id: &str,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    Ok(Connection::open(path)?.execute(
        "UPDATE attachment_sync SET object_path=NULL,preview_object_path=NULL,upload_state='deleted',
         last_error=NULL,updated_at_ms=?4 WHERE endpoint_id=?1 AND owner_scope=?2 AND attachment_id=?3",
        params![endpoint_id,owner_scope,attachment_id,now_ms])? > 0)
}

pub fn create_or_resume_storage_transfer(
    path: &Path,
    batch: &NewStorageTransferBatch<'_>,
) -> rusqlite::Result<StorageTransferProgress> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO storage_import_batches(batch_id,source_profile_id,target_profile_id,
         source_provider_kind,target_provider_kind,source_owner_scope,target_owner_scope,
         status,phase,total_items,total_bytes,created_at_ms,updated_at_ms)
         VALUES(?1,?2,?3,?4,?5,?6,?7,'prepared','prepared',?8,?9,?10,?10)
         ON CONFLICT(batch_id) DO UPDATE SET total_items=excluded.total_items,
         total_bytes=excluded.total_bytes,status='prepared',phase='prepared',
         last_error=NULL,updated_at_ms=excluded.updated_at_ms",
        params![
            batch.batch_id,
            batch.source_profile_id,
            batch.target_profile_id,
            batch.source_provider_kind,
            batch.target_provider_kind,
            batch.source_owner_scope,
            batch.target_owner_scope,
            batch.items.len() as i64,
            batch
                .items
                .iter()
                .map(|item| item.total_bytes.max(0))
                .sum::<i64>(),
            batch.now_ms
        ],
    )?;
    tx.execute(
        "UPDATE storage_import_items SET state=CASE WHEN
           EXISTS (SELECT 1 FROM sync_outbox message_op
             WHERE message_op.operation_id=storage_import_items.message_operation_id
               AND message_op.state IN ('acknowledged','superseded'))
           AND (storage_import_items.attachment_operation_id IS NULL OR EXISTS (
             SELECT 1 FROM sync_outbox attachment_op
             WHERE attachment_op.operation_id=storage_import_items.attachment_operation_id
               AND attachment_op.state IN ('acknowledged','superseded')
           )) THEN 'applied' ELSE 'staged' END,
           last_error=NULL,updated_at_ms=?2
         WHERE batch_id=?1 AND EXISTS (
           SELECT 1 FROM sync_outbox existing
           WHERE existing.operation_id=storage_import_items.message_operation_id
         )",
        params![batch.batch_id, batch.now_ms],
    )?;
    let incoming_keys = batch
        .items
        .iter()
        .map(|item| (item.item_type.clone(), item.source_key.clone()))
        .collect::<std::collections::HashSet<_>>();
    let existing_keys = {
        let mut statement =
            tx.prepare("SELECT item_type,source_key FROM storage_import_items WHERE batch_id=?1")?;
        let keys = statement
            .query_map(params![batch.batch_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        keys
    };
    for (item_type, source_key) in existing_keys {
        if !incoming_keys.contains(&(item_type.clone(), source_key.clone())) {
            tx.execute(
                "DELETE FROM storage_import_items
                 WHERE batch_id=?1 AND item_type=?2 AND source_key=?3",
                params![batch.batch_id, item_type, source_key],
            )?;
        }
    }
    for item in batch.items {
        tx.execute(
            "UPDATE sync_outbox SET state='superseded',last_error=NULL,
             lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,updated_at_ms=?6
             WHERE operation_id IN (
               SELECT message_operation_id FROM storage_import_items
                 WHERE batch_id=?1 AND item_type=?2 AND source_key=?3
                   AND message_operation_id<>?4
               UNION
               SELECT attachment_operation_id FROM storage_import_items
                 WHERE batch_id=?1 AND item_type=?2 AND source_key=?3
                   AND attachment_operation_id IS NOT NULL
                   AND attachment_operation_id IS NOT ?5
             ) AND state NOT IN ('acknowledged','superseded')",
            params![
                batch.batch_id,
                item.item_type,
                item.source_key,
                item.message_operation_id,
                item.attachment_operation_id,
                batch.now_ms
            ],
        )?;
        tx.execute(
            "INSERT INTO storage_import_items(batch_id,item_type,source_key,entity_id,
             attachment_id,message_operation_id,attachment_operation_id,state,source_revision,
             source_hash,total_bytes,transferred_bytes,last_error,updated_at_ms)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,NULL,?13)
             ON CONFLICT(batch_id,item_type,source_key) DO UPDATE SET
               entity_id=excluded.entity_id,attachment_id=excluded.attachment_id,
               message_operation_id=excluded.message_operation_id,
               attachment_operation_id=excluded.attachment_operation_id,
               state=CASE WHEN
                 storage_import_items.source_revision IS excluded.source_revision
                 AND storage_import_items.message_operation_id=excluded.message_operation_id
                 AND storage_import_items.attachment_operation_id IS excluded.attachment_operation_id
                 AND storage_import_items.state IN ('applied','skipped')
                 AND excluded.state='pending'
                 THEN storage_import_items.state ELSE excluded.state END,
               source_revision=excluded.source_revision,
               source_hash=CASE WHEN
                 storage_import_items.source_revision IS excluded.source_revision
                 THEN COALESCE(excluded.source_hash,storage_import_items.source_hash)
                 ELSE excluded.source_hash END,
               total_bytes=excluded.total_bytes,
               transferred_bytes=CASE WHEN
                 storage_import_items.source_revision IS excluded.source_revision
                 AND storage_import_items.state IN ('pending','error','staged')
                 THEN MIN(storage_import_items.transferred_bytes,excluded.total_bytes)
                 WHEN excluded.state='skipped' THEN excluded.total_bytes ELSE 0 END,
               last_error=NULL,
               updated_at_ms=excluded.updated_at_ms",
            params![
                batch.batch_id,
                item.item_type,
                item.source_key,
                item.entity_id,
                item.attachment_id,
                item.message_operation_id,
                item.attachment_operation_id,
                item.state,
                item.source_revision,
                item.source_hash,
                item.total_bytes,
                item.transferred_bytes,
                batch.now_ms
            ],
        )?;
    }
    tx.execute(
        "UPDATE storage_import_batches SET
         total_items=(SELECT count(*) FROM storage_import_items WHERE batch_id=?1),
         total_bytes=(SELECT COALESCE(sum(total_bytes),0) FROM storage_import_items WHERE batch_id=?1),
         updated_at_ms=?2 WHERE batch_id=?1",
        params![batch.batch_id, batch.now_ms],
    )?;
    refresh_import_progress(&tx, batch.batch_id, batch.now_ms)?;
    tx.commit()?;
    get_storage_transfer_progress(path, batch.batch_id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn create_or_resume_storage_import(
    path: &Path,
    batch: &NewStorageImportBatch<'_>,
) -> rusqlite::Result<StorageImportProgress> {
    create_or_resume_storage_transfer(path, batch)
}

fn map_storage_transfer_progress(row: &Row<'_>) -> rusqlite::Result<StorageTransferProgress> {
    Ok(StorageTransferProgress {
        batch_id: row.get(0)?,
        source_profile_id: row.get(1)?,
        target_profile_id: row.get(2)?,
        source_provider_kind: row.get(3)?,
        target_provider_kind: row.get(4)?,
        source_owner_scope: row.get(5)?,
        target_owner_scope: row.get(6)?,
        status: row.get(7)?,
        phase: row.get(8)?,
        total_items: row.get(9)?,
        applied_items: row.get(10)?,
        skipped_items: row.get(11)?,
        conflict_items: row.get(12)?,
        failed_items: row.get(13)?,
        total_bytes: row.get(14)?,
        transferred_bytes: row.get(15)?,
        last_error: row.get(16)?,
    })
}

pub fn get_storage_transfer_progress(
    path: &Path,
    batch_id: &str,
) -> rusqlite::Result<Option<StorageTransferProgress>> {
    Connection::open(path)?
        .query_row(
            "SELECT batch_id,source_profile_id,target_profile_id,source_provider_kind,
         target_provider_kind,source_owner_scope,target_owner_scope,status,phase,total_items,
         applied_items,skipped_items,conflict_items,failed_items,total_bytes,transferred_bytes,
         last_error FROM storage_import_batches WHERE batch_id=?1",
            params![batch_id],
            map_storage_transfer_progress,
        )
        .optional()
}

pub fn get_latest_storage_transfer_progress(
    path: &Path,
) -> rusqlite::Result<Option<StorageTransferProgress>> {
    Connection::open(path)?
        .query_row(
            "SELECT batch_id,source_profile_id,target_profile_id,source_provider_kind,
         target_provider_kind,source_owner_scope,target_owner_scope,status,phase,total_items,
         applied_items,skipped_items,conflict_items,failed_items,total_bytes,transferred_bytes,
         last_error FROM storage_import_batches ORDER BY updated_at_ms DESC LIMIT 1",
            [],
            map_storage_transfer_progress,
        )
        .optional()
}

pub fn get_latest_resumable_storage_transfer_progress(
    path: &Path,
) -> rusqlite::Result<Option<StorageTransferProgress>> {
    Connection::open(path)?
        .query_row(
            "SELECT batch_id,source_profile_id,target_profile_id,source_provider_kind,
         target_provider_kind,source_owner_scope,target_owner_scope,status,phase,total_items,
         applied_items,skipped_items,conflict_items,failed_items,total_bytes,transferred_bytes,
         last_error FROM storage_import_batches
         WHERE status NOT IN ('completed','cancelled') ORDER BY updated_at_ms DESC LIMIT 1",
            [],
            map_storage_transfer_progress,
        )
        .optional()
}

pub fn list_resumable_storage_transfer_progress(
    path: &Path,
) -> rusqlite::Result<Vec<StorageTransferProgress>> {
    let conn = Connection::open(path)?;
    let mut statement = conn.prepare(
        "SELECT batch_id,source_profile_id,target_profile_id,source_provider_kind,
         target_provider_kind,source_owner_scope,target_owner_scope,status,phase,total_items,
         applied_items,skipped_items,conflict_items,failed_items,total_bytes,transferred_bytes,
         last_error FROM storage_import_batches
         WHERE status NOT IN ('completed','cancelled') ORDER BY updated_at_ms DESC",
    )?;
    let values = statement
        .query_map([], map_storage_transfer_progress)?
        .collect();
    values
}

pub fn recover_storage_transfer_runs(path: &Path, now_ms: i64) -> rusqlite::Result<usize> {
    let conn = Connection::open(path)?;
    let prepared = conn.execute(
        "UPDATE storage_import_batches SET status='prepared',phase='prepared',
         last_error=NULL,updated_at_ms=?1
         WHERE status IN ('pending','running','staged') AND phase='planning'
           AND applied_items=0 AND skipped_items=0 AND conflict_items=0 AND failed_items=0",
        params![now_ms],
    )?;
    let interrupted = conn.execute(
        "UPDATE storage_import_batches SET status='interrupted',phase='interrupted',
         last_error=COALESCE(last_error,'上次传输已中断，可继续或放弃'),updated_at_ms=?1
         WHERE status IN ('pending','running','staged')",
        params![now_ms],
    )?;
    Ok(prepared + interrupted)
}

pub fn mark_storage_transfer_running(
    path: &Path,
    batch_id: &str,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let changed = tx.execute(
        "UPDATE storage_import_batches SET status='running',phase='transferring',
         last_error=NULL,updated_at_ms=?2 WHERE batch_id=?1 AND status<>'cancelled'",
        params![batch_id, now_ms],
    )?;
    if changed > 0 {
        refresh_import_progress(&tx, batch_id, now_ms)?;
    }
    tx.commit()?;
    Ok(changed > 0)
}

pub fn mark_storage_transfer_interrupted(
    path: &Path,
    batch_id: &str,
    error: &str,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    Ok(Connection::open(path)?.execute(
        "UPDATE storage_import_batches SET status='interrupted',phase='interrupted',
         last_error=?2,updated_at_ms=?3 WHERE batch_id=?1 AND status='running'",
        params![batch_id, error, now_ms],
    )? > 0)
}

pub fn mark_storage_transfer_completed(
    path: &Path,
    batch_id: &str,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    Ok(Connection::open(path)?.execute(
        "UPDATE storage_import_batches SET status='completed',phase='completed',
         last_error=NULL,updated_at_ms=?2 WHERE batch_id=?1 AND status='running'
           AND NOT EXISTS (SELECT 1 FROM storage_import_items
             WHERE batch_id=?1 AND state NOT IN ('applied','skipped'))",
        params![batch_id, now_ms],
    )? > 0)
}

pub fn cancel_storage_transfer(path: &Path, batch_id: &str, now_ms: i64) -> rusqlite::Result<bool> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let changed = tx.execute(
        "UPDATE storage_import_batches SET status='cancelled',phase='cancelled',
         last_error=NULL,updated_at_ms=?2 WHERE batch_id=?1 AND status<>'running'",
        params![batch_id, now_ms],
    )?;
    if changed == 0 {
        tx.commit()?;
        return Ok(false);
    }

    tx.execute(
        "UPDATE sync_outbox SET state='superseded',last_error=NULL,
         lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,updated_at_ms=?2
         WHERE operation_id IN (
           SELECT message_operation_id FROM storage_import_items WHERE batch_id=?1
           UNION
           SELECT attachment_operation_id FROM storage_import_items
             WHERE batch_id=?1 AND attachment_operation_id IS NOT NULL
         ) AND state NOT IN ('acknowledged','superseded','conflict')",
        params![batch_id, now_ms],
    )?;

    tx.execute(
        "DELETE FROM attachment_sync
         WHERE remote_revision=0 AND EXISTS (
           SELECT 1 FROM storage_import_items item
           JOIN storage_import_batches batch ON batch.batch_id=item.batch_id
           JOIN sync_outbox operation ON operation.operation_id=item.attachment_operation_id
           WHERE item.batch_id=?1 AND item.attachment_id=attachment_sync.attachment_id
             AND batch.target_profile_id=attachment_sync.endpoint_id
             AND batch.target_owner_scope=attachment_sync.owner_scope
             AND operation.state='superseded'
         )",
        params![batch_id],
    )?;
    tx.execute(
        "DELETE FROM messages
         WHERE remote_revision=0 AND EXISTS (
           SELECT 1 FROM storage_import_items item
           JOIN storage_import_batches batch ON batch.batch_id=item.batch_id
           JOIN sync_outbox operation ON operation.operation_id=item.message_operation_id
           WHERE item.batch_id=?1 AND item.entity_id=messages.message_id
             AND batch.target_profile_id=messages.endpoint_id
             AND batch.target_owner_scope=messages.owner_scope
             AND operation.state='superseded'
         )",
        params![batch_id],
    )?;
    tx.execute(
        "DELETE FROM marked_tags
         WHERE remote_revision=0 AND EXISTS (
           SELECT 1 FROM storage_import_items item
           JOIN storage_import_batches batch ON batch.batch_id=item.batch_id
           JOIN sync_outbox operation ON operation.operation_id=item.message_operation_id
           WHERE item.batch_id=?1 AND item.item_type='tag' AND item.entity_id=marked_tags.id
             AND batch.target_profile_id=marked_tags.endpoint_id
             AND batch.target_owner_scope=marked_tags.owner_scope
             AND operation.state='superseded'
         )",
        params![batch_id],
    )?;
    tx.commit()?;
    Ok(true)
}

pub fn get_storage_import_progress(
    path: &Path,
    batch_id: &str,
) -> rusqlite::Result<Option<StorageImportProgress>> {
    get_storage_transfer_progress(path, batch_id)
}

pub fn count_pending_import_outbox(path: &Path, batch_id: &str) -> rusqlite::Result<i64> {
    Connection::open(path)?.query_row(
        "SELECT count(*) FROM sync_outbox outbox
         WHERE outbox.operation_id IN (
           SELECT message_operation_id FROM storage_import_items WHERE batch_id=?1
           UNION
           SELECT attachment_operation_id FROM storage_import_items
             WHERE batch_id=?1 AND attachment_operation_id IS NOT NULL
         ) AND outbox.state NOT IN ('acknowledged','superseded','conflict')",
        params![batch_id],
        |row| row.get(0),
    )
}

pub fn count_import_conflicts(path: &Path, batch_id: &str) -> rusqlite::Result<i64> {
    Connection::open(path)?.query_row(
        "SELECT count(*) FROM sync_outbox outbox
         WHERE outbox.operation_id IN (
           SELECT message_operation_id FROM storage_import_items WHERE batch_id=?1
           UNION
           SELECT attachment_operation_id FROM storage_import_items
             WHERE batch_id=?1 AND attachment_operation_id IS NOT NULL
         ) AND outbox.state='conflict'",
        params![batch_id],
        |row| row.get(0),
    )
}

pub fn list_storage_transfer_items(
    path: &Path,
    batch_id: &str,
    states: &[&str],
) -> rusqlite::Result<Vec<StorageTransferItem>> {
    let conn = Connection::open(path)?;
    let placeholders = (1..=states.len())
        .map(|index| format!("?{}", index + 1))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!("SELECT item_type,source_key,entity_id,attachment_id,message_operation_id,
      attachment_operation_id,state,source_revision,source_hash,total_bytes,transferred_bytes,last_error
      FROM storage_import_items WHERE batch_id=?1 AND state IN ({placeholders})
      ORDER BY CASE item_type WHEN 'tag' THEN 0 ELSE 1 END,source_key");
    let mut parameters: Vec<&dyn ToSql> = vec![&batch_id];
    parameters.extend(states.iter().map(|state| state as &dyn ToSql));
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(parameters), |row| {
        Ok(StorageTransferItem {
            item_type: row.get(0)?,
            source_key: row.get(1)?,
            entity_id: row.get(2)?,
            attachment_id: row.get(3)?,
            message_operation_id: row.get(4)?,
            attachment_operation_id: row.get(5)?,
            state: row.get(6)?,
            source_revision: row.get(7)?,
            source_hash: row.get(8)?,
            total_bytes: row.get(9)?,
            transferred_bytes: row.get(10)?,
            last_error: row.get(11)?,
        })
    })?;
    rows.collect()
}

pub fn update_storage_transfer_item_entity_id(
    path: &Path,
    batch_id: &str,
    item_type: &str,
    source_key: &str,
    entity_id: &str,
    now_ms: i64,
) -> rusqlite::Result<bool> {
    Ok(Connection::open(path)?.execute(
        "UPDATE storage_import_items SET entity_id=?4,updated_at_ms=?5
         WHERE batch_id=?1 AND item_type=?2 AND source_key=?3",
        params![batch_id, item_type, source_key, entity_id, now_ms],
    )? > 0)
}

pub fn supersede_storage_transfer_item_operations(
    path: &Path,
    batch_id: &str,
    item_type: &str,
    source_key: &str,
    now_ms: i64,
) -> rusqlite::Result<usize> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let changed = tx.execute(
        "UPDATE sync_outbox SET state='superseded',last_error=NULL,
         lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,updated_at_ms=?4
         WHERE operation_id IN (
           SELECT message_operation_id FROM storage_import_items
             WHERE batch_id=?1 AND item_type=?2 AND source_key=?3
           UNION
           SELECT attachment_operation_id FROM storage_import_items
             WHERE batch_id=?1 AND item_type=?2 AND source_key=?3
               AND attachment_operation_id IS NOT NULL
         ) AND state NOT IN ('acknowledged','superseded')",
        params![batch_id, item_type, source_key, now_ms],
    )?;
    tx.commit()?;
    Ok(changed)
}

pub fn delete_unconfirmed_tag(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    tag_id: &str,
) -> rusqlite::Result<bool> {
    Ok(Connection::open(path)?.execute(
        "DELETE FROM marked_tags
         WHERE endpoint_id=?1 AND owner_scope=?2 AND id=?3 AND remote_revision=0",
        params![endpoint_id, owner_scope, tag_id],
    )? > 0)
}

pub fn list_storage_import_items(
    path: &Path,
    batch_id: &str,
    states: &[&str],
) -> rusqlite::Result<Vec<StorageImportItem>> {
    list_storage_transfer_items(path, batch_id, states)
}

fn refresh_import_progress(conn: &Connection, batch_id: &str, now_ms: i64) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE storage_import_batches SET
         applied_items=(SELECT count(*) FROM storage_import_items WHERE batch_id=?1 AND state='applied'),
         skipped_items=(SELECT count(*) FROM storage_import_items WHERE batch_id=?1 AND state='skipped'),
         conflict_items=(SELECT count(*) FROM storage_import_items WHERE batch_id=?1 AND state='conflict'),
         failed_items=(SELECT count(*) FROM storage_import_items WHERE batch_id=?1 AND state='error'),
         transferred_bytes=(SELECT COALESCE(sum(transferred_bytes),0) FROM storage_import_items WHERE batch_id=?1),
         last_error=CASE
           WHEN (SELECT count(*) FROM storage_import_items WHERE batch_id=?1 AND state='error')=0
             THEN NULL
           ELSE last_error END,
         status=CASE
           WHEN status='completed' THEN 'completed'
           WHEN status IN ('prepared','interrupted','cancelled') THEN status
           WHEN (SELECT count(*) FROM storage_import_items WHERE batch_id=?1 AND state='conflict')>0 THEN 'conflict'
           WHEN (SELECT count(*) FROM storage_import_items WHERE batch_id=?1 AND state='error')>0 THEN 'error'
           ELSE 'running' END,
         phase=CASE
           WHEN status='prepared' THEN 'prepared'
           WHEN status='interrupted' THEN 'interrupted'
           WHEN status='cancelled' THEN 'cancelled'
           WHEN status='completed' THEN 'completed'
           WHEN (SELECT count(*) FROM storage_import_items WHERE batch_id=?1
             AND state NOT IN ('applied','skipped'))=0 THEN 'verifying'
           WHEN (SELECT count(*) FROM storage_import_items WHERE batch_id=?1 AND state='conflict')>0 THEN 'conflict'
           WHEN (SELECT count(*) FROM storage_import_items WHERE batch_id=?1 AND state='error')>0 THEN 'error'
           WHEN status='running' THEN 'transferring'
           ELSE phase END,updated_at_ms=?2 WHERE batch_id=?1",
        params![batch_id, now_ms],
    )?;
    Ok(())
}

pub fn update_storage_transfer_item_progress(
    path: &Path,
    batch_id: &str,
    item_type: &str,
    source_key: &str,
    transferred_bytes: i64,
    now_ms: i64,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE storage_import_items SET transferred_bytes=MIN(MAX(?4,0),MAX(total_bytes,?4)),
         updated_at_ms=?5 WHERE batch_id=?1 AND item_type=?2 AND source_key=?3",
        params![batch_id, item_type, source_key, transferred_bytes, now_ms],
    )?;
    refresh_import_progress(&tx, batch_id, now_ms)?;
    tx.commit()
}

pub fn update_storage_transfer_item_fingerprint(
    path: &Path,
    batch_id: &str,
    item_type: &str,
    source_key: &str,
    source_revision: Option<&str>,
    source_hash: Option<&str>,
    total_bytes: i64,
    now_ms: i64,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE storage_import_items SET source_revision=?4,source_hash=?5,total_bytes=?6,
         updated_at_ms=?7 WHERE batch_id=?1 AND item_type=?2 AND source_key=?3",
        params![
            batch_id,
            item_type,
            source_key,
            source_revision,
            source_hash,
            total_bytes.max(0),
            now_ms
        ],
    )?;
    tx.execute(
        "UPDATE storage_import_batches SET
         total_bytes=(SELECT COALESCE(sum(total_bytes),0) FROM storage_import_items WHERE batch_id=?1),
         updated_at_ms=?2 WHERE batch_id=?1",
        params![batch_id, now_ms],
    )?;
    tx.commit()
}

pub fn mark_storage_transfer_item_state(
    path: &Path,
    batch_id: &str,
    item_type: &str,
    source_key: &str,
    state: &str,
    error: Option<&str>,
    now_ms: i64,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE storage_import_items SET state=?4,last_error=?5,
         transferred_bytes=CASE WHEN ?4 IN ('applied','skipped') THEN total_bytes ELSE transferred_bytes END,
         updated_at_ms=?6 WHERE batch_id=?1 AND item_type=?2 AND source_key=?3",
        params![batch_id, item_type, source_key, state, error, now_ms],
    )?;
    tx.execute(
        "UPDATE storage_import_batches SET last_error=?2 WHERE batch_id=?1",
        params![batch_id, error],
    )?;
    refresh_import_progress(&tx, batch_id, now_ms)?;
    tx.commit()
}

pub fn has_unfinished_storage_transfers(path: &Path, profile_id: &str) -> rusqlite::Result<bool> {
    Connection::open(path)?.query_row(
        "SELECT EXISTS(SELECT 1 FROM storage_import_batches
         WHERE (source_profile_id=?1 OR target_profile_id=?1)
           AND status NOT IN ('completed','cancelled'))",
        params![profile_id],
        |row| row.get(0),
    )
}

pub fn has_pending_profile_work(path: &Path, profile_id: &str) -> rusqlite::Result<bool> {
    Connection::open(path)?.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM sync_outbox
             WHERE endpoint_id=?1 AND state NOT IN ('acknowledged','superseded')
           UNION ALL
           SELECT 1 FROM sync_conflicts
             WHERE endpoint_id=?1 AND status='unresolved'
           UNION ALL
           SELECT 1 FROM storage_import_batches
             WHERE (source_profile_id=?1 OR target_profile_id=?1)
               AND status NOT IN ('completed','cancelled')
         )",
        params![profile_id],
        |row| row.get(0),
    )
}

pub fn abandon_profile_work(path: &Path, profile_id: &str, now_ms: i64) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;

    tx.execute(
        "UPDATE sync_outbox SET state='superseded',last_error='存储空间已强制移除',
         lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,updated_at_ms=?2
         WHERE endpoint_id=?1 AND state NOT IN ('acknowledged','superseded')",
        params![profile_id, now_ms],
    )?;
    tx.execute(
        "UPDATE sync_conflicts SET status='abandoned',resolved_at_ms=?2
         WHERE endpoint_id=?1 AND status='unresolved'",
        params![profile_id, now_ms],
    )?;
    tx.execute(
        "UPDATE sync_outbox SET state='superseded',last_error='关联存储空间已强制移除',
         lease_owner=NULL,lease_started_at_ms=NULL,lease_expires_at_ms=NULL,updated_at_ms=?2
         WHERE operation_id IN (
           SELECT item.message_operation_id FROM storage_import_items item
           JOIN storage_import_batches batch ON batch.batch_id=item.batch_id
           WHERE batch.source_profile_id=?1 OR batch.target_profile_id=?1
           UNION
           SELECT item.attachment_operation_id FROM storage_import_items item
           JOIN storage_import_batches batch ON batch.batch_id=item.batch_id
           WHERE (batch.source_profile_id=?1 OR batch.target_profile_id=?1)
             AND item.attachment_operation_id IS NOT NULL
         ) AND state NOT IN ('acknowledged','superseded')",
        params![profile_id, now_ms],
    )?;
    tx.execute(
        "UPDATE storage_import_batches SET status='cancelled',phase='cancelled',
         last_error='关联存储空间已强制移除',updated_at_ms=?2
         WHERE (source_profile_id=?1 OR target_profile_id=?1)
           AND status NOT IN ('completed','cancelled')",
        params![profile_id, now_ms],
    )?;

    tx.commit()
}

pub fn storage_transfer_is_cancelled(path: &Path, batch_id: &str) -> rusqlite::Result<bool> {
    Connection::open(path)?.query_row(
        "SELECT status='cancelled' FROM storage_import_batches WHERE batch_id=?1",
        params![batch_id],
        |row| row.get(0),
    )
}

pub fn reset_profile_local_state_for_destination_change(
    path: &Path,
    profile_id: &str,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;

    tx.execute(
        "DELETE FROM storage_import_items WHERE batch_id IN (
           SELECT batch_id FROM storage_import_batches
           WHERE source_profile_id=?1 OR target_profile_id=?1
         )",
        params![profile_id],
    )?;
    tx.execute(
        "DELETE FROM storage_import_batches
         WHERE source_profile_id=?1 OR target_profile_id=?1",
        params![profile_id],
    )?;
    for table in [
        "sync_outbox",
        "sync_checkpoints",
        "supabase_history_cursors",
        "sync_conflicts",
        "attachment_sync",
        "messages",
        "marked_tags",
        "pending_marked_sync",
        "download_history",
        "upload_history",
        "partial_downloads",
    ] {
        tx.execute(
            &format!("DELETE FROM {table} WHERE endpoint_id=?1"),
            params![profile_id],
        )?;
    }

    tx.commit()
}

pub fn has_profile_business_data(path: &Path, profile_id: &str) -> rusqlite::Result<bool> {
    Connection::open(path)?.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM messages WHERE endpoint_id=?1
           UNION ALL
           SELECT 1 FROM marked_tags WHERE endpoint_id=?1
           UNION ALL
           SELECT 1 FROM attachment_sync WHERE endpoint_id=?1
         )",
        params![profile_id],
        |row| row.get(0),
    )
}

pub fn mark_storage_import_item_error(
    path: &Path,
    batch_id: &str,
    item_type: &str,
    source_key: &str,
    error: &str,
    now_ms: i64,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE storage_import_items SET state='error',last_error=?4,updated_at_ms=?5
      WHERE batch_id=?1 AND item_type=?2 AND source_key=?3",
        params![batch_id, item_type, source_key, error, now_ms],
    )?;
    tx.execute(
        "UPDATE storage_import_batches SET last_error=?2 WHERE batch_id=?1",
        params![batch_id, error],
    )?;
    refresh_import_progress(&tx, batch_id, now_ms)?;
    tx.commit()
}

pub fn apply_imported_tag(
    path: &Path,
    batch_id: &str,
    source_key: &str,
    target_profile_id: &str,
    owner_scope: &str,
    tag: &MarkedTag,
    operation: &NewOutboxOperation,
    now_ms: i64,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute("INSERT INTO marked_tags(endpoint_id,id,name,owner_scope,remote_revision,deleted_at_ms,sync_state)
      VALUES(?1,?2,?3,?4,0,NULL,'pending') ON CONFLICT(endpoint_id,owner_scope,id) DO UPDATE SET
      name=excluded.name,deleted_at_ms=NULL,sync_state='pending'",params![target_profile_id,tag.id,tag.name,owner_scope])?;
    enqueue_outbox(&tx, operation)?;
    tx.execute(
        "UPDATE storage_import_items SET state='staged',last_error=NULL,updated_at_ms=?4
      WHERE batch_id=?1 AND item_type='tag' AND source_key=?2 AND entity_id=?3",
        params![batch_id, source_key, tag.id, now_ms],
    )?;
    refresh_import_progress(&tx, batch_id, now_ms)?;
    tx.commit()
}

#[allow(clippy::too_many_arguments)]
pub fn apply_imported_message(
    path: &Path,
    batch_id: &str,
    source_key: &str,
    message: &DbMessage,
    message_operation: &NewOutboxOperation,
    attachment: Option<(&str, &str, Option<&str>, Option<&str>, &NewOutboxOperation)>,
    now_ms: i64,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM messages
         WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=?3 AND filename<>?4",
        params![
            message.endpoint_id,
            message_operation.owner_scope,
            message_operation.entity_id,
            message.filename
        ],
    )?;
    tx.execute("INSERT INTO messages(endpoint_id,filename,sender,timestamp_ms,size,kind,original_name,etag,mtime,
      content,local_path,remote_path,file_hash,marked,marked_tag_ids,marked_pinned,marked_due_date,format,
      transcript_source,source_audio_mime_type,transcript_raw_text,source_kind,source_channel_id,
      source_message_id,message_id,remote_revision,deleted_at_ms,sync_state,owner_scope)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,NULL,'pending',?27)
      ON CONFLICT(endpoint_id,owner_scope,filename) DO UPDATE SET sender=excluded.sender,timestamp_ms=excluded.timestamp_ms,
      size=excluded.size,kind=excluded.kind,original_name=excluded.original_name,content=excluded.content,
      local_path=excluded.local_path,remote_path=excluded.remote_path,file_hash=excluded.file_hash,marked=excluded.marked,
      marked_tag_ids=excluded.marked_tag_ids,marked_pinned=excluded.marked_pinned,marked_due_date=excluded.marked_due_date,
      format=excluded.format,transcript_source=excluded.transcript_source,source_audio_mime_type=excluded.source_audio_mime_type,
      transcript_raw_text=excluded.transcript_raw_text,source_kind=excluded.source_kind,
      source_channel_id=excluded.source_channel_id,source_message_id=excluded.source_message_id,
      message_id=excluded.message_id,deleted_at_ms=NULL,sync_state='pending'",
      params![message.endpoint_id,message.filename,message.sender,message.timestamp_ms,message.size,message.kind,message.original_name,
      message.etag,message.mtime,message.content,message.local_path,message.remote_path,message.file_hash,message.marked,
      serialize_tag_ids(&message.marked_tag_ids)?,message.marked_pinned,message.marked_due_date,message.format,
      message.transcript_source,message.source_audio_mime_type,message.transcript_raw_text,message.source_kind,
      message.source_channel_id,message.source_message_id,message_operation.entity_id,
      message_operation.base_revision,message_operation.owner_scope])?;
    enqueue_outbox(&tx, message_operation)?;
    if let Some((
        attachment_id,
        object_path,
        preview_object_path,
        mime_type,
        attachment_operation,
    )) = attachment
    {
        tx.execute("INSERT INTO attachment_sync(endpoint_id,owner_scope,attachment_id,message_id,original_name,local_path,
        object_path,preview_object_path,mime_type,size,sha256,upload_state,updated_at_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'local',?12)
        ON CONFLICT(endpoint_id,owner_scope,attachment_id) DO UPDATE SET
        message_id=excluded.message_id,original_name=excluded.original_name,local_path=excluded.local_path,
        object_path=excluded.object_path,preview_object_path=excluded.preview_object_path,
        mime_type=excluded.mime_type,size=excluded.size,sha256=excluded.sha256,
        upload_state='local',deleted_at_ms=NULL,last_error=NULL,updated_at_ms=excluded.updated_at_ms",
        params![message.endpoint_id,message_operation.owner_scope,attachment_id,message_operation.entity_id,message.original_name,
        message.local_path,object_path,preview_object_path,mime_type,message.size,message.file_hash,now_ms])?;
        enqueue_outbox_with_dependency(
            &tx,
            attachment_operation,
            Some(&message_operation.operation_id),
        )?;
    }
    tx.execute(
        "UPDATE storage_import_items SET state='staged',last_error=NULL,updated_at_ms=?4
      WHERE batch_id=?1 AND item_type='message' AND source_key=?2 AND entity_id=?3",
        params![batch_id, source_key, message_operation.entity_id, now_ms],
    )?;
    refresh_import_progress(&tx, batch_id, now_ms)?;
    tx.commit()
}

pub fn tombstone_messages_and_enqueue(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    filenames: &[String],
    operations: &[NewOutboxOperation],
    deleted_at_ms: i64,
) -> rusqlite::Result<usize> {
    if filenames.len() != operations.len() {
        return Err(rusqlite::Error::InvalidParameterCount(
            filenames.len(),
            operations.len(),
        ));
    }
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let mut changed = 0;
    for (filename, operation) in filenames.iter().zip(operations) {
        changed += tx.execute(
            "UPDATE messages SET deleted_at_ms=?4,sync_state='pending'
             WHERE endpoint_id=?1 AND owner_scope=?2 AND filename=?3",
            params![endpoint_id, owner_scope, filename, deleted_at_ms],
        )?;
        enqueue_outbox(&tx, operation)?;
    }
    tx.commit()?;
    Ok(changed)
}

pub fn get_message_sync_identity(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    filename: &str,
) -> rusqlite::Result<Option<(String, i64)>> {
    Connection::open(path)?
        .query_row(
            "SELECT message_id, remote_revision FROM messages
             WHERE endpoint_id=?1 AND owner_scope=?2 AND filename=?3 AND deleted_at_ms IS NULL",
            params![endpoint_id, owner_scope, filename],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
}

pub fn get_attachment_sync_identity(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    attachment_id: &str,
) -> rusqlite::Result<Option<(String, i64)>> {
    Connection::open(path)?
        .query_row(
            "SELECT attachment_id, remote_revision FROM attachment_sync
             WHERE endpoint_id=?1 AND owner_scope=?2 AND attachment_id=?3
               AND deleted_at_ms IS NULL",
            params![endpoint_id, owner_scope, attachment_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
}

pub fn get_message_for_scope(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    filename: &str,
) -> rusqlite::Result<Option<DbMessage>> {
    let conn = Connection::open(path)?;
    conn.query_row(
        "SELECT endpoint_id, filename, sender, timestamp_ms, size, kind, original_name,
          etag, mtime, content, local_path, remote_path, file_hash, marked, marked_tag_ids,
          marked_pinned, marked_due_date, format, transcript_source, source_audio_mime_type,
          transcript_raw_text, source_kind, source_channel_id, source_message_id FROM messages
         WHERE endpoint_id=?1 AND owner_scope=?2 AND filename=?3 AND deleted_at_ms IS NULL",
        params![endpoint_id, owner_scope, filename],
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
                marked_due_date: row.get(16)?,
                format: row.get(17)?,
                transcript_source: row.get(18)?,
                source_audio_mime_type: row.get(19)?,
                transcript_raw_text: row.get(20)?,
                source_kind: row.get(21)?,
                source_channel_id: row.get(22)?,
                source_message_id: row.get(23)?,
            })
        },
    )
    .optional()
}

pub fn find_message_by_source_for_scope(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    source_kind: &str,
    source_channel_id: &str,
    source_message_id: &str,
) -> rusqlite::Result<Option<String>> {
    Connection::open(path)?
        .query_row(
            "SELECT filename FROM messages WHERE endpoint_id=?1 AND owner_scope=?2
             AND source_kind=?3 AND source_channel_id=?4 AND source_message_id=?5
             AND deleted_at_ms IS NULL LIMIT 1",
            params![
                endpoint_id,
                owner_scope,
                source_kind,
                source_channel_id,
                source_message_id
            ],
            |row| row.get(0),
        )
        .optional()
}

pub fn get_message_by_id_for_scope(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    message_id: &str,
) -> rusqlite::Result<Option<(DbMessage, i64)>> {
    let conn = Connection::open(path)?;
    conn.query_row(
        "SELECT endpoint_id, filename, sender, timestamp_ms, size, kind, original_name,
          etag, mtime, content, local_path, remote_path, file_hash, marked, marked_tag_ids,
          marked_pinned, marked_due_date, format, transcript_source, source_audio_mime_type,
          transcript_raw_text, source_kind, source_channel_id, source_message_id, remote_revision FROM messages
         WHERE endpoint_id=?1 AND owner_scope=?2 AND message_id=?3 AND deleted_at_ms IS NULL",
        params![endpoint_id, owner_scope, message_id],
        |row| {
            let marked_tag_ids: String = row.get(14)?;
            Ok((
                DbMessage {
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
                    marked_due_date: row.get(16)?,
                    format: row.get(17)?,
                    transcript_source: row.get(18)?,
                    source_audio_mime_type: row.get(19)?,
                    transcript_raw_text: row.get(20)?,
                    source_kind: row.get(21)?,
                    source_channel_id: row.get(22)?,
                    source_message_id: row.get(23)?,
                },
                row.get(24)?,
            ))
        },
    )
    .optional()
}

pub fn set_message_marked_and_enqueue(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    filename: &str,
    marked: bool,
    tag_ids: &[String],
    pinned: bool,
    due_date: Option<&str>,
    operation: &NewOutboxOperation,
) -> rusqlite::Result<bool> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let changed = tx.execute(
        "UPDATE messages SET marked=?4,marked_tag_ids=?5,marked_pinned=?6,
           marked_due_date=?7,sync_state='pending'
         WHERE endpoint_id=?1 AND owner_scope=?2 AND filename=?3 AND deleted_at_ms IS NULL",
        params![
            endpoint_id,
            owner_scope,
            filename,
            marked,
            serialize_tag_ids(tag_ids)?,
            pinned,
            due_date,
        ],
    )?;
    if changed == 0 {
        return Ok(false);
    }
    enqueue_outbox(&tx, operation)?;
    tx.commit()?;
    Ok(true)
}

pub fn set_messages_marked_tags_and_enqueue(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    updates: &[(String, Vec<String>, NewOutboxOperation)],
) -> rusqlite::Result<usize> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let mut changed = 0;
    for (filename, tag_ids, operation) in updates {
        let updated = tx.execute(
            "UPDATE messages SET marked_tag_ids=?4,sync_state='pending'
             WHERE endpoint_id=?1 AND owner_scope=?2 AND filename=?3
               AND deleted_at_ms IS NULL AND marked=1",
            params![
                endpoint_id,
                owner_scope,
                filename,
                serialize_tag_ids(tag_ids)?,
            ],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        enqueue_outbox(&tx, operation)?;
        changed += updated;
    }
    tx.commit()?;
    Ok(changed)
}

pub fn save_tag_and_enqueue(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    tag: &MarkedTag,
    remote_revision: i64,
    deleted_at_ms: Option<i64>,
    operation: &NewOutboxOperation,
) -> rusqlite::Result<()> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO marked_tags
           (endpoint_id,id,name,owner_scope,remote_revision,deleted_at_ms,sync_state)
         VALUES (?1,?2,?3,?4,?5,?6,'pending')
         ON CONFLICT(endpoint_id,owner_scope,id) DO UPDATE SET
           name=excluded.name,owner_scope=excluded.owner_scope,
           remote_revision=excluded.remote_revision,deleted_at_ms=excluded.deleted_at_ms,
           sync_state='pending'",
        params![
            endpoint_id,
            tag.id,
            tag.name,
            owner_scope,
            remote_revision,
            deleted_at_ms,
        ],
    )?;
    enqueue_outbox(&tx, operation)?;
    tx.commit()
}

pub fn delete_tag_cleanup_messages_and_enqueue(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    tag: &MarkedTag,
    tag_revision: i64,
    deleted_at_ms: i64,
    message_updates: &[(String, Vec<String>, NewOutboxOperation)],
    tag_operation: &NewOutboxOperation,
) -> rusqlite::Result<usize> {
    let mut conn = Connection::open(path)?;
    let tx = conn.transaction()?;
    let mut previous_operation_id: Option<String> = None;
    let mut changed = 0;
    for (filename, tag_ids, operation) in message_updates {
        let updated = tx.execute(
            "UPDATE messages SET marked_tag_ids=?4,sync_state='pending'
             WHERE endpoint_id=?1 AND owner_scope=?2 AND filename=?3
               AND deleted_at_ms IS NULL AND marked=1",
            params![
                endpoint_id,
                owner_scope,
                filename,
                serialize_tag_ids(tag_ids)?
            ],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        enqueue_outbox_with_dependency(&tx, operation, previous_operation_id.as_deref())?;
        previous_operation_id = Some(operation.operation_id.clone());
        changed += updated;
    }
    tx.execute(
        "UPDATE marked_tags SET deleted_at_ms=?5,sync_state='pending'
         WHERE endpoint_id=?1 AND owner_scope=?2 AND id=?3 AND remote_revision=?4",
        params![
            endpoint_id,
            owner_scope,
            tag.id,
            tag_revision,
            deleted_at_ms
        ],
    )?;
    if tx.changes() == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    enqueue_outbox_with_dependency(&tx, tag_operation, previous_operation_id.as_deref())?;
    tx.commit()?;
    Ok(changed)
}

pub fn list_tags_for_scope(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
) -> rusqlite::Result<Vec<(MarkedTag, i64)>> {
    let conn = Connection::open(path)?;
    let mut stmt = conn.prepare(
        "SELECT id,name,remote_revision FROM marked_tags
         WHERE endpoint_id=?1 AND owner_scope=?2 AND deleted_at_ms IS NULL
         ORDER BY name COLLATE NOCASE ASC",
    )?;
    let rows = stmt.query_map(params![endpoint_id, owner_scope], |row| {
        Ok((
            MarkedTag {
                id: row.get(0)?,
                name: row.get(1)?,
            },
            row.get(2)?,
        ))
    })?;
    rows.collect()
}

pub fn upsert_pending_marked_sync(
    path: &Path,
    pending: &PendingMarkedSync,
) -> rusqlite::Result<()> {
    let conn = Connection::open(path)?;
    conn.execute(
        "INSERT INTO pending_marked_sync
          (endpoint_id, filename, timestamp_ms, marked, marked_tag_ids, marked_pinned, marked_due_date, updated_at_ms)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
          ON CONFLICT(endpoint_id, filename) DO UPDATE SET
            timestamp_ms=excluded.timestamp_ms,
            marked=excluded.marked,
            marked_tag_ids=excluded.marked_tag_ids,
            marked_pinned=excluded.marked_pinned,
            marked_due_date=excluded.marked_due_date,
            updated_at_ms=excluded.updated_at_ms",
        params![
            pending.endpoint_id,
            pending.filename,
            pending.timestamp_ms,
            pending.marked,
            serialize_tag_ids(&pending.marked_tag_ids)?,
            pending.marked_pinned,
            pending.marked_due_date,
            pending.updated_at_ms,
        ],
    )?;
    Ok(())
}

pub fn list_pending_marked_sync(
    path: &Path,
    endpoint_id: &str,
) -> rusqlite::Result<Vec<PendingMarkedSync>> {
    let conn = Connection::open(path)?;
    let mut stmt = conn.prepare(
        "SELECT endpoint_id, filename, timestamp_ms, marked, marked_tag_ids, marked_pinned, marked_due_date, updated_at_ms
         FROM pending_marked_sync
         WHERE endpoint_id = ?1
         ORDER BY updated_at_ms ASC",
    )?;
    let rows = stmt.query_map(params![endpoint_id], |row| {
        let marked_tag_ids: String = row.get(4)?;
        Ok(PendingMarkedSync {
            endpoint_id: row.get(0)?,
            filename: row.get(1)?,
            timestamp_ms: row.get(2)?,
            marked: row.get(3)?,
            marked_tag_ids: parse_tag_ids(marked_tag_ids),
            marked_pinned: row.get(5)?,
            marked_due_date: row.get(6)?,
            updated_at_ms: row.get(7)?,
        })
    })?;
    rows.collect()
}

pub fn clear_pending_marked_sync_exact(
    path: &Path,
    endpoint_id: &str,
    entries: &[(String, i64, i64)],
) -> rusqlite::Result<()> {
    if entries.is_empty() {
        return Ok(());
    }
    let conn = Connection::open(path)?;
    let mut statement = conn.prepare(
        "DELETE FROM pending_marked_sync WHERE endpoint_id = ?1 AND filename = ?2 AND timestamp_ms = ?3 AND updated_at_ms = ?4",
    )?;
    for (filename, timestamp_ms, updated_at_ms) in entries {
        statement.execute(params![endpoint_id, filename, timestamp_ms, updated_at_ms])?;
    }
    Ok(())
}

#[cfg(test)]
pub fn list_messages(
    path: &Path,
    endpoint_id: &str,
    search_query: Option<&str>,
) -> rusqlite::Result<Vec<Message>> {
    list_messages_paged(path, endpoint_id, None, None, false, search_query)
}

fn message_row_select_sql() -> &'static str {
    "filename, sender, timestamp_ms, size, kind, original_name, content, local_path, remote_path, file_hash, marked, marked_tag_ids, marked_pinned, marked_due_date, format, transcript_source, source_audio_mime_type, transcript_raw_text, message_id, source_kind, source_channel_id, source_message_id"
}

fn map_message_row(row: &Row<'_>) -> rusqlite::Result<Message> {
    let marked_tag_ids: String = row.get(11)?;
    Ok(Message {
        filename: row.get(0)?,
        message_id: row.get(18)?,
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
        marked_due_date: row.get(13)?,
        format: row.get(14)?,
        transcript_source: row.get(15)?,
        source_audio_mime_type: row.get(16)?,
        transcript_raw_text: row.get(17)?,
        source_kind: row.get(19)?,
        source_channel_id: row.get(20)?,
        source_message_id: row.get(21)?,
    })
}

fn collect_messages(
    conn: &Connection,
    sql: &str,
    params: &[&dyn ToSql],
) -> rusqlite::Result<Vec<Message>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params, map_message_row)?;
    let mut messages = Vec::new();
    for row in rows {
        messages.push(row?);
    }
    Ok(messages)
}

pub fn list_messages_paged(
    path: &Path,
    endpoint_id: &str,
    limit: Option<i64>,
    offset: Option<i64>,
    only_marked: bool,
    search_query: Option<&str>,
) -> rusqlite::Result<Vec<Message>> {
    let conn = Connection::open(path)?;

    let normalized_search = search_query
        .map(str::trim)
        .filter(|query| !query.is_empty())
        .map(|query| format!("%{}%", query.to_lowercase()));

    let mut where_clause = if only_marked {
        "WHERE endpoint_id = ?1 AND marked = 1".to_string()
    } else {
        "WHERE endpoint_id = ?1".to_string()
    };

    if normalized_search.is_some() {
        where_clause.push_str(
            " AND (LOWER(COALESCE(content, '')) LIKE ?2 OR LOWER(COALESCE(original_name, '')) LIKE ?2 OR LOWER(filename) LIKE ?2)",
        );
    }

    // 使用子查询实现：先按时间倒序取最新的 N 条，再按时间正序返回
    let sql = match (limit, offset) {
        (Some(lim), Some(off)) => format!(
            "SELECT * FROM (              SELECT {}               FROM messages {} ORDER BY timestamp_ms DESC, filename DESC LIMIT {} OFFSET {}            ) ORDER BY timestamp_ms ASC, filename ASC",
            message_row_select_sql(), where_clause, lim, off
        ),
        (Some(lim), None) => format!(
            "SELECT * FROM (              SELECT {}               FROM messages {} ORDER BY timestamp_ms DESC, filename DESC LIMIT {}            ) ORDER BY timestamp_ms ASC, filename ASC",
            message_row_select_sql(), where_clause, lim
        ),
        _ => format!(
            "SELECT {} FROM messages {} ORDER BY timestamp_ms ASC, filename ASC",
            message_row_select_sql(), where_clause
        ),
    };

    if let Some(search_term) = normalized_search.as_deref() {
        collect_messages(&conn, &sql, &[&endpoint_id, &search_term])
    } else {
        collect_messages(&conn, &sql, &[&endpoint_id])
    }
}

pub fn list_bulk_download_candidates(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    search_query: Option<&str>,
) -> rusqlite::Result<Vec<DbBulkDownloadResource>> {
    let conn = Connection::open(path)?;
    let normalized_search = search_query
        .map(str::trim)
        .filter(|query| !query.is_empty())
        .map(|query| format!("%{}%", query.to_lowercase()));
    let search_clause = if normalized_search.is_some() {
        " AND (LOWER(COALESCE(m.original_name, '')) LIKE ?3 OR LOWER(m.filename) LIKE ?3)"
    } else {
        ""
    };
    let sql = format!(
        "SELECT m.filename, m.timestamp_ms, m.size, m.original_name, \
                m.transcript_source, m.source_audio_mime_type, d.status, d.saved_path, p.downloaded_bytes \
         FROM messages m \
         LEFT JOIN download_history d ON d.endpoint_id = m.endpoint_id AND d.filename = m.filename \
         LEFT JOIN partial_downloads p ON p.endpoint_id = m.endpoint_id AND p.filename = m.filename \
         WHERE m.endpoint_id = ?1 AND m.owner_scope = ?2 AND m.deleted_at_ms IS NULL \
           AND (m.kind = 'file' OR m.transcript_source = 'speech-to-text'){} \
         ORDER BY m.timestamp_ms DESC, m.filename DESC",
        search_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let map_row = |row: &Row<'_>| {
        Ok(DbBulkDownloadResource {
            filename: row.get(0)?,
            timestamp_ms: row.get(1)?,
            size: row.get(2)?,
            original_name: row.get(3)?,
            transcript_source: row.get(4)?,
            source_audio_mime_type: row.get(5)?,
            download_status: row.get(6)?,
            saved_path: row.get(7)?,
            partial_bytes: row.get(8)?,
        })
    };
    let rows = if let Some(search) = normalized_search.as_deref() {
        stmt.query_map(params![endpoint_id, owner_scope, search], map_row)?
    } else {
        stmt.query_map(params![endpoint_id, owner_scope], map_row)?
    };
    rows.collect()
}

pub fn list_latest_messages_window(
    path: &Path,
    endpoint_id: &str,
    limit: i64,
    only_marked: bool,
) -> rusqlite::Result<Vec<Message>> {
    let conn = Connection::open(path)?;
    let where_clause = if only_marked {
        "WHERE endpoint_id = ?1 AND marked = 1"
    } else {
        "WHERE endpoint_id = ?1"
    };
    let sql = format!(
        "SELECT * FROM (\
           SELECT {} FROM messages {} \
           ORDER BY timestamp_ms DESC, filename DESC LIMIT ?2\
         ) ORDER BY timestamp_ms ASC, filename ASC",
        message_row_select_sql(),
        where_clause
    );
    collect_messages(&conn, &sql, &[&endpoint_id, &limit])
}

pub fn list_messages_before(
    path: &Path,
    endpoint_id: &str,
    before_timestamp_ms: i64,
    before_filename: &str,
    limit: i64,
    only_marked: bool,
) -> rusqlite::Result<Vec<Message>> {
    let conn = Connection::open(path)?;
    let where_clause = if only_marked {
        "WHERE endpoint_id = ?1 AND marked = 1 AND (timestamp_ms < ?2 OR (timestamp_ms = ?2 AND filename < ?3))"
    } else {
        "WHERE endpoint_id = ?1 AND (timestamp_ms < ?2 OR (timestamp_ms = ?2 AND filename < ?3))"
    };
    let sql = format!(
        "SELECT * FROM (\
           SELECT {} FROM messages {} \
           ORDER BY timestamp_ms DESC, filename DESC LIMIT ?4\
         ) ORDER BY timestamp_ms ASC, filename ASC",
        message_row_select_sql(),
        where_clause
    );
    collect_messages(
        &conn,
        &sql,
        &[&endpoint_id, &before_timestamp_ms, &before_filename, &limit],
    )
}

pub fn list_messages_after(
    path: &Path,
    endpoint_id: &str,
    after_timestamp_ms: i64,
    after_filename: &str,
    limit: i64,
    only_marked: bool,
) -> rusqlite::Result<Vec<Message>> {
    let conn = Connection::open(path)?;
    let where_clause = if only_marked {
        "WHERE endpoint_id = ?1 AND marked = 1 AND (timestamp_ms > ?2 OR (timestamp_ms = ?2 AND filename > ?3))"
    } else {
        "WHERE endpoint_id = ?1 AND (timestamp_ms > ?2 OR (timestamp_ms = ?2 AND filename > ?3))"
    };
    let sql = format!(
        "SELECT {} FROM messages {} ORDER BY timestamp_ms ASC, filename ASC LIMIT ?4",
        message_row_select_sql(),
        where_clause
    );
    collect_messages(
        &conn,
        &sql,
        &[&endpoint_id, &after_timestamp_ms, &after_filename, &limit],
    )
}

pub fn list_latest_messages_window_for_scope(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    limit: i64,
    only_marked: bool,
) -> rusqlite::Result<Vec<Message>> {
    let conn = Connection::open(path)?;
    let marked_clause = if only_marked { " AND marked=1" } else { "" };
    let sql = format!(
        "SELECT * FROM (
           SELECT {} FROM messages
           WHERE endpoint_id=?1 AND owner_scope=?2 AND deleted_at_ms IS NULL{}
           ORDER BY timestamp_ms DESC,message_id DESC LIMIT ?3
         ) ORDER BY timestamp_ms ASC,message_id ASC",
        message_row_select_sql(),
        marked_clause
    );
    collect_messages(&conn, &sql, &[&endpoint_id, &owner_scope, &limit])
}

#[allow(clippy::too_many_arguments)]
pub fn list_messages_before_for_scope(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    before_timestamp_ms: i64,
    before_filename: &str,
    limit: i64,
    only_marked: bool,
) -> rusqlite::Result<Vec<Message>> {
    let conn = Connection::open(path)?;
    let marked_clause = if only_marked { " AND marked=1" } else { "" };
    let sql = format!(
        "SELECT * FROM (
           SELECT {} FROM messages
           WHERE endpoint_id=?1 AND owner_scope=?2 AND deleted_at_ms IS NULL{}
             AND (timestamp_ms<?3 OR (timestamp_ms=?3 AND message_id<?4))
           ORDER BY timestamp_ms DESC,message_id DESC LIMIT ?5
         ) ORDER BY timestamp_ms ASC,message_id ASC",
        message_row_select_sql(),
        marked_clause
    );
    collect_messages(
        &conn,
        &sql,
        &[
            &endpoint_id,
            &owner_scope,
            &before_timestamp_ms,
            &before_filename,
            &limit,
        ],
    )
}

#[allow(clippy::too_many_arguments)]
pub fn list_messages_after_for_scope(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    after_timestamp_ms: i64,
    after_filename: &str,
    limit: i64,
    only_marked: bool,
) -> rusqlite::Result<Vec<Message>> {
    let conn = Connection::open(path)?;
    let marked_clause = if only_marked { " AND marked=1" } else { "" };
    let sql = format!(
        "SELECT {} FROM messages
         WHERE endpoint_id=?1 AND owner_scope=?2 AND deleted_at_ms IS NULL{}
           AND (timestamp_ms>?3 OR (timestamp_ms=?3 AND coalesce(message_id,filename)>?4))
         ORDER BY timestamp_ms ASC,coalesce(message_id,filename) ASC LIMIT ?5",
        message_row_select_sql(),
        marked_clause
    );
    collect_messages(
        &conn,
        &sql,
        &[
            &endpoint_id,
            &owner_scope,
            &after_timestamp_ms,
            &after_filename,
            &limit,
        ],
    )
}

pub fn telegram_bridge_binding_state(
    path: &Path,
    binding_key: &str,
) -> rusqlite::Result<Option<(i64, i64, String)>> {
    Connection::open(path)?
        .query_row(
            "SELECT last_update_id,start_watermark_ms,start_watermark_key
             FROM telegram_bridge_bindings WHERE binding_key=?1",
            [binding_key],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
}

#[allow(clippy::too_many_arguments)]
pub fn upsert_telegram_bridge_binding_state(
    path: &Path,
    binding_key: &str,
    profile_id: &str,
    owner_scope: &str,
    provider_kind: &str,
    last_update_id: i64,
    watermark_ms: i64,
    watermark_key: &str,
    updated_at_ms: i64,
) -> rusqlite::Result<()> {
    Connection::open(path)?.execute(
        "INSERT INTO telegram_bridge_bindings(
           binding_key,profile_id,owner_scope,provider_kind,last_update_id,
           start_watermark_ms,start_watermark_key,updated_at_ms)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
         ON CONFLICT(binding_key) DO UPDATE SET
           profile_id=excluded.profile_id,owner_scope=excluded.owner_scope,
           provider_kind=excluded.provider_kind,last_update_id=excluded.last_update_id,
           start_watermark_ms=excluded.start_watermark_ms,
           start_watermark_key=excluded.start_watermark_key,updated_at_ms=excluded.updated_at_ms",
        params![
            binding_key,
            profile_id,
            owner_scope,
            provider_kind,
            last_update_id,
            watermark_ms,
            watermark_key,
            updated_at_ms
        ],
    )?;
    Ok(())
}

pub fn get_telegram_delivery_record(
    path: &Path,
    binding_key: &str,
    message_key: &str,
) -> rusqlite::Result<Option<TelegramDeliveryRecord>> {
    Connection::open(path)?
        .query_row(
            "SELECT message_key,status,telegram_message_id,last_error,last_attempt_ms
             FROM telegram_delivery_ledger WHERE binding_key=?1 AND message_key=?2",
            params![binding_key, message_key],
            |row| {
                Ok(TelegramDeliveryRecord {
                    message_key: row.get(0)?,
                    status: row.get(1)?,
                    telegram_message_id: row.get(2)?,
                    last_error: row.get(3)?,
                    last_attempt_ms: row.get(4)?,
                })
            },
        )
        .optional()
}

pub fn upsert_telegram_delivery_record(
    path: &Path,
    binding_key: &str,
    record: &TelegramDeliveryRecord,
) -> rusqlite::Result<()> {
    Connection::open(path)?.execute(
        "INSERT INTO telegram_delivery_ledger(
           binding_key,message_key,status,telegram_message_id,last_error,last_attempt_ms)
         VALUES(?1,?2,?3,?4,?5,?6)
         ON CONFLICT(binding_key,message_key) DO UPDATE SET status=excluded.status,
           telegram_message_id=excluded.telegram_message_id,last_error=excluded.last_error,
           last_attempt_ms=excluded.last_attempt_ms",
        params![
            binding_key,
            record.message_key,
            record.status,
            record.telegram_message_id,
            record.last_error,
            record.last_attempt_ms
        ],
    )?;
    Ok(())
}

pub fn recover_telegram_sending_deliveries(
    path: &Path,
    binding_key: &str,
    updated_at_ms: i64,
) -> rusqlite::Result<usize> {
    Connection::open(path)?.execute(
        "UPDATE telegram_delivery_ledger
         SET status='delivery_unconfirmed',
             last_error=coalesce(last_error,'应用在确认 Telegram 投递结果前退出'),
             last_attempt_ms=coalesce(last_attempt_ms,?2)
         WHERE binding_key=?1 AND status='sending'",
        params![binding_key, updated_at_ms],
    )
}

pub fn count_messages_before_for_scope(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    before_timestamp_ms: i64,
    before_filename: &str,
    only_marked: bool,
) -> rusqlite::Result<i64> {
    let marked_clause = if only_marked { " AND marked=1" } else { "" };
    Connection::open(path)?.query_row(
        &format!(
            "SELECT count(*) FROM messages
             WHERE endpoint_id=?1 AND owner_scope=?2 AND deleted_at_ms IS NULL{}
               AND (timestamp_ms<?3 OR (timestamp_ms=?3 AND message_id<?4))",
            marked_clause
        ),
        params![
            endpoint_id,
            owner_scope,
            before_timestamp_ms,
            before_filename
        ],
        |row| row.get(0),
    )
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

pub fn list_messages_for_scope(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    limit: Option<i64>,
    offset: Option<i64>,
    only_marked: bool,
    search_query: Option<&str>,
) -> rusqlite::Result<Vec<Message>> {
    let conn = Connection::open(path)?;
    let mut sql = format!(
        "SELECT {} FROM messages WHERE endpoint_id=?1 AND owner_scope=?2
      AND deleted_at_ms IS NULL",
        message_row_select_sql()
    );
    if only_marked {
        sql.push_str(" AND marked=1");
    }
    let search = search_query
        .map(|value| format!("%{}%", value.trim()))
        .filter(|value| value != "%%");
    if search.is_some() {
        sql.push_str(" AND (filename LIKE ?3 OR original_name LIKE ?3 OR content LIKE ?3)");
        sql.push_str(" ORDER BY timestamp_ms DESC,filename DESC LIMIT ?4 OFFSET ?5");
    } else {
        sql.push_str(" ORDER BY timestamp_ms DESC,filename DESC LIMIT ?3 OFFSET ?4");
    }
    let limit = limit.unwrap_or(50).clamp(1, 500);
    let offset = offset.unwrap_or(0).max(0);
    if let Some(search) = search.as_deref() {
        collect_messages(
            &conn,
            &sql,
            &[&endpoint_id, &owner_scope, &search, &limit, &offset],
        )
    } else {
        collect_messages(&conn, &sql, &[&endpoint_id, &owner_scope, &limit, &offset])
    }
}

pub fn count_messages_for_scope(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    only_marked: bool,
) -> rusqlite::Result<i64> {
    let sql = if only_marked {
        "SELECT count(*) FROM messages WHERE endpoint_id=?1 AND owner_scope=?2 AND deleted_at_ms IS NULL AND marked=1"
    } else {
        "SELECT count(*) FROM messages WHERE endpoint_id=?1 AND owner_scope=?2 AND deleted_at_ms IS NULL"
    };
    Connection::open(path)?.query_row(sql, params![endpoint_id, owner_scope], |row| row.get(0))
}

pub fn count_messages_before(
    path: &Path,
    endpoint_id: &str,
    before_timestamp_ms: i64,
    before_filename: &str,
    only_marked: bool,
) -> rusqlite::Result<i64> {
    let conn = Connection::open(path)?;
    let sql = if only_marked {
        "SELECT COUNT(*) FROM messages \
         WHERE endpoint_id = ?1 AND marked = 1 \
         AND (timestamp_ms < ?2 OR (timestamp_ms = ?2 AND filename < ?3))"
    } else {
        "SELECT COUNT(*) FROM messages \
         WHERE endpoint_id = ?1 \
         AND (timestamp_ms < ?2 OR (timestamp_ms = ?2 AND filename < ?3))"
    };
    conn.query_row(
        sql,
        params![endpoint_id, before_timestamp_ms, before_filename],
        |row| row.get(0),
    )
}

pub fn list_marked_messages(
    path: &Path,
    endpoint_id: &str,
    tag_id: Option<&str>,
    search_query: Option<&str>,
) -> rusqlite::Result<Vec<Message>> {
    list_marked_messages_paged(path, endpoint_id, tag_id, search_query, None, None, None)
}

pub fn list_marked_messages_paged(
    path: &Path,
    endpoint_id: &str,
    tag_id: Option<&str>,
    search_query: Option<&str>,
    limit: Option<i64>,
    offset: Option<i64>,
    pending_due_date: Option<&str>,
) -> rusqlite::Result<Vec<Message>> {
    let conn = Connection::open(path)?;
    let normalized_search = search_query
        .map(str::trim)
        .filter(|query| !query.is_empty())
        .map(|query| format!("%{}%", query.to_lowercase()));
    let untagged_filter = tag_id == Some(UNTAGGED_MARKED_TAG_FILTER_ID);
    let tag_pattern = tag_id
        .filter(|tag_id| *tag_id != UNTAGGED_MARKED_TAG_FILTER_ID)
        .map(serde_json::to_string)
        .transpose()
        .map_err(|err| rusqlite::Error::ToSqlConversionFailure(Box::new(err)))?
        .map(|tag_id| format!("%{tag_id}%"));
    let mut sql = format!(
        "SELECT {} FROM messages WHERE endpoint_id = ?1 AND marked = 1",
        message_row_select_sql()
    )
    .to_string();
    if normalized_search.is_some() {
        sql.push_str(
            " AND (LOWER(COALESCE(content, '')) LIKE ?2 OR LOWER(COALESCE(original_name, '')) LIKE ?2 OR LOWER(filename) LIKE ?2)",
        );
    }
    if tag_pattern.is_some() {
        let placeholder = if normalized_search.is_some() {
            "?3"
        } else {
            "?2"
        };
        sql.push_str(" AND marked_tag_ids LIKE ");
        sql.push_str(placeholder);
    } else if untagged_filter {
        sql.push_str(" AND marked_tag_ids = '[]'");
    }
    if pending_due_date.is_some() {
        sql.push_str(
            " AND (marked_due_date IS NULL OR marked_due_date = '' OR marked_due_date <= ?",
        );
        sql.push_str(
            &(params_count(normalized_search.is_some(), tag_pattern.is_some()) + 1).to_string(),
        );
        sql.push(')');
    }
    sql.push_str(" ORDER BY marked_pinned DESC, timestamp_ms DESC");
    if let Some(limit) = limit {
        sql.push_str(" LIMIT ");
        sql.push_str(&limit.max(0).to_string());
        if let Some(offset) = offset {
            sql.push_str(" OFFSET ");
            sql.push_str(&offset.max(0).to_string());
        }
    }

    let mut stmt = conn.prepare(&sql)?;
    let mut params: Vec<&dyn ToSql> = vec![&endpoint_id];
    if let Some(ref search_term) = normalized_search {
        params.push(search_term);
    }
    if let Some(ref tag_pattern) = tag_pattern {
        params.push(tag_pattern);
    }
    if let Some(ref due_date) = pending_due_date {
        params.push(due_date);
    }
    let rows = stmt.query_map(params_from_iter(params), map_message_row)?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(row?);
    }
    Ok(messages)
}

pub fn list_marked_messages_for_scope(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    tag_id: Option<&str>,
    search_query: Option<&str>,
    limit: Option<i64>,
    offset: Option<i64>,
    pending_due_date: Option<&str>,
) -> rusqlite::Result<Vec<Message>> {
    let conn = Connection::open(path)?;
    let normalized_search = search_query
        .map(str::trim)
        .filter(|query| !query.is_empty())
        .map(|query| format!("%{}%", query.to_lowercase()));
    let untagged_filter = tag_id == Some(UNTAGGED_MARKED_TAG_FILTER_ID);
    let tag_pattern = tag_id
        .filter(|tag_id| *tag_id != UNTAGGED_MARKED_TAG_FILTER_ID)
        .map(serde_json::to_string)
        .transpose()
        .map_err(|err| rusqlite::Error::ToSqlConversionFailure(Box::new(err)))?
        .map(|tag_id| format!("%{tag_id}%"));
    let mut sql = format!(
        "SELECT {} FROM messages WHERE endpoint_id=?1 AND owner_scope=?2
         AND deleted_at_ms IS NULL AND marked=1",
        message_row_select_sql()
    );
    if normalized_search.is_some() {
        sql.push_str(
            " AND (LOWER(COALESCE(content,'')) LIKE ?3 OR LOWER(COALESCE(original_name,'')) LIKE ?3 OR LOWER(filename) LIKE ?3)",
        );
    }
    if tag_pattern.is_some() {
        sql.push_str(if normalized_search.is_some() {
            " AND marked_tag_ids LIKE ?4"
        } else {
            " AND marked_tag_ids LIKE ?3"
        });
    } else if untagged_filter {
        sql.push_str(" AND marked_tag_ids='[]'");
    }
    if pending_due_date.is_some() {
        let placeholder =
            3 + usize::from(normalized_search.is_some()) + usize::from(tag_pattern.is_some());
        sql.push_str(&format!(
            " AND (marked_due_date IS NULL OR marked_due_date='' OR marked_due_date<=?{placeholder})"
        ));
    }
    sql.push_str(" ORDER BY marked_pinned DESC,timestamp_ms DESC");
    if let Some(limit) = limit {
        sql.push_str(&format!(" LIMIT {}", limit.max(0)));
        if let Some(offset) = offset {
            sql.push_str(&format!(" OFFSET {}", offset.max(0)));
        }
    }
    let mut params: Vec<&dyn ToSql> = vec![&endpoint_id, &owner_scope];
    if let Some(ref value) = normalized_search {
        params.push(value);
    }
    if let Some(ref value) = tag_pattern {
        params.push(value);
    }
    if let Some(ref value) = pending_due_date {
        params.push(value);
    }
    let mut statement = conn.prepare(&sql)?;
    let result = statement
        .query_map(params_from_iter(params), map_message_row)?
        .collect();
    result
}

fn params_count(has_search: bool, has_tag: bool) -> usize {
    1 + usize::from(has_search) + usize::from(has_tag)
}

pub fn count_marked_messages(
    path: &Path,
    endpoint_id: &str,
    tag_id: Option<&str>,
    search_query: Option<&str>,
    pending_due_date: Option<&str>,
) -> rusqlite::Result<i64> {
    let conn = Connection::open(path)?;
    let normalized_search = search_query
        .map(str::trim)
        .filter(|query| !query.is_empty())
        .map(|query| format!("%{}%", query.to_lowercase()));
    let untagged_filter = tag_id == Some(UNTAGGED_MARKED_TAG_FILTER_ID);
    let tag_pattern = tag_id
        .filter(|tag_id| *tag_id != UNTAGGED_MARKED_TAG_FILTER_ID)
        .map(serde_json::to_string)
        .transpose()
        .map_err(|err| rusqlite::Error::ToSqlConversionFailure(Box::new(err)))?
        .map(|tag_id| format!("%{tag_id}%"));
    let mut sql = "SELECT COUNT(*) FROM messages WHERE endpoint_id = ?1 AND marked = 1".to_string();
    if normalized_search.is_some() {
        sql.push_str(
            " AND (LOWER(COALESCE(content, '')) LIKE ?2 OR LOWER(COALESCE(original_name, '')) LIKE ?2 OR LOWER(filename) LIKE ?2)",
        );
    }
    if tag_pattern.is_some() {
        let placeholder = if normalized_search.is_some() {
            "?3"
        } else {
            "?2"
        };
        sql.push_str(" AND marked_tag_ids LIKE ");
        sql.push_str(placeholder);
    } else if untagged_filter {
        sql.push_str(" AND marked_tag_ids = '[]'");
    }
    if pending_due_date.is_some() {
        sql.push_str(
            " AND (marked_due_date IS NULL OR marked_due_date = '' OR marked_due_date <= ?",
        );
        sql.push_str(
            &(params_count(normalized_search.is_some(), tag_pattern.is_some()) + 1).to_string(),
        );
        sql.push(')');
    }
    let mut params: Vec<&dyn ToSql> = vec![&endpoint_id];
    if let Some(ref search_term) = normalized_search {
        params.push(search_term);
    }
    if let Some(ref tag_pattern) = tag_pattern {
        params.push(tag_pattern);
    }
    if let Some(ref due_date) = pending_due_date {
        params.push(due_date);
    }
    conn.query_row(&sql, params_from_iter(params), |row| row.get(0))
}

pub fn count_marked_messages_for_scope(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    tag_id: Option<&str>,
    search_query: Option<&str>,
    pending_due_date: Option<&str>,
) -> rusqlite::Result<i64> {
    let conn = Connection::open(path)?;
    let normalized_search = search_query
        .map(str::trim)
        .filter(|query| !query.is_empty())
        .map(|query| format!("%{}%", query.to_lowercase()));
    let untagged_filter = tag_id == Some(UNTAGGED_MARKED_TAG_FILTER_ID);
    let tag_pattern = tag_id
        .filter(|tag_id| *tag_id != UNTAGGED_MARKED_TAG_FILTER_ID)
        .map(serde_json::to_string)
        .transpose()
        .map_err(|err| rusqlite::Error::ToSqlConversionFailure(Box::new(err)))?
        .map(|tag_id| format!("%{tag_id}%"));
    let mut sql = "SELECT count(*) FROM messages WHERE endpoint_id=?1 AND owner_scope=?2
        AND deleted_at_ms IS NULL AND marked=1"
        .to_string();
    if normalized_search.is_some() {
        sql.push_str(
            " AND (LOWER(COALESCE(content,'')) LIKE ?3 OR LOWER(COALESCE(original_name,'')) LIKE ?3 OR LOWER(filename) LIKE ?3)",
        );
    }
    if tag_pattern.is_some() {
        sql.push_str(if normalized_search.is_some() {
            " AND marked_tag_ids LIKE ?4"
        } else {
            " AND marked_tag_ids LIKE ?3"
        });
    } else if untagged_filter {
        sql.push_str(" AND marked_tag_ids='[]'");
    }
    if pending_due_date.is_some() {
        let placeholder =
            3 + usize::from(normalized_search.is_some()) + usize::from(tag_pattern.is_some());
        sql.push_str(&format!(
            " AND (marked_due_date IS NULL OR marked_due_date='' OR marked_due_date<=?{placeholder})"
        ));
    }
    let mut params: Vec<&dyn ToSql> = vec![&endpoint_id, &owner_scope];
    if let Some(ref value) = normalized_search {
        params.push(value);
    }
    if let Some(ref value) = tag_pattern {
        params.push(value);
    }
    if let Some(ref value) = pending_due_date {
        params.push(value);
    }
    conn.query_row(&sql, params_from_iter(params), |row| row.get(0))
}

pub fn count_unfinished_marked_messages(
    path: &Path,
    endpoint_id: &str,
    today: &str,
) -> rusqlite::Result<i64> {
    let conn = Connection::open(path)?;
    conn.query_row(
        "SELECT COUNT(*) FROM messages
         WHERE endpoint_id = ?1
           AND marked = 1
           AND (marked_due_date IS NULL OR marked_due_date = '' OR marked_due_date <= ?2)",
        params![endpoint_id, today],
        |row| row.get(0),
    )
}

pub fn count_unfinished_marked_messages_for_scope(
    path: &Path,
    endpoint_id: &str,
    owner_scope: &str,
    today: &str,
) -> rusqlite::Result<i64> {
    Connection::open(path)?.query_row(
        "SELECT count(*) FROM messages
         WHERE endpoint_id=?1 AND owner_scope=?2 AND deleted_at_ms IS NULL AND marked=1
           AND (marked_due_date IS NULL OR marked_due_date='' OR marked_due_date<=?3)",
        params![endpoint_id, owner_scope, today],
        |row| row.get(0),
    )
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

pub fn list_cleanup_candidates(
    path: &Path,
    endpoint_id: &str,
    cutoff_ms: Option<i64>,
) -> rusqlite::Result<Vec<Message>> {
    let conn = Connection::open(path)?;
    let mut sql = format!(
        "SELECT {} FROM messages WHERE endpoint_id = ?1 AND marked = 0",
        message_row_select_sql()
    );
    if cutoff_ms.is_some() {
        sql.push_str(" AND timestamp_ms < ?2");
    }
    sql.push_str(" ORDER BY timestamp_ms ASC, filename ASC");
    if let Some(cutoff_ms) = cutoff_ms {
        collect_messages(&conn, &sql, &[&endpoint_id, &cutoff_ms])
    } else {
        collect_messages(&conn, &sql, &[&endpoint_id])
    }
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

pub fn find_download_history_by_key(
    path: &Path,
    endpoint_id: &str,
    filename: &str,
) -> rusqlite::Result<Option<DbDownloadHistory>> {
    let conn = Connection::open(path)?;
    get_download_history_by_key(&conn, endpoint_id, filename)
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

pub fn list_download_history_paged(
    path: &Path,
    limit: Option<i64>,
    offset: Option<i64>,
) -> rusqlite::Result<Vec<DownloadHistoryRecord>> {
    let conn = Connection::open(path)?;
    let mut sql =
        "SELECT id, endpoint_id, filename, original_name, saved_path, status, error, file_size, created_at_ms, updated_at_ms \
         FROM download_history ORDER BY updated_at_ms DESC, id DESC"
            .to_string();
    if let Some(limit) = limit {
        sql.push_str(" LIMIT ");
        sql.push_str(&limit.max(0).to_string());
        if let Some(offset) = offset {
            sql.push_str(" OFFSET ");
            sql.push_str(&offset.max(0).to_string());
        }
    }
    let mut stmt = conn.prepare(&sql)?;
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

pub fn count_download_history(path: &Path) -> rusqlite::Result<i64> {
    let conn = Connection::open(path)?;
    conn.query_row("SELECT COUNT(*) FROM download_history", [], |row| {
        row.get(0)
    })
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

pub fn list_upload_history_paged(
    path: &Path,
    limit: Option<i64>,
    offset: Option<i64>,
) -> rusqlite::Result<Vec<UploadHistoryRecord>> {
    let conn = Connection::open(path)?;
    let mut sql =
        "SELECT id, endpoint_id, filename, original_name, local_path, status, error, file_size, created_at_ms, updated_at_ms \
         FROM upload_history ORDER BY updated_at_ms DESC, id DESC"
            .to_string();
    if let Some(limit) = limit {
        sql.push_str(" LIMIT ");
        sql.push_str(&limit.max(0).to_string());
        if let Some(offset) = offset {
            sql.push_str(" OFFSET ");
            sql.push_str(&offset.max(0).to_string());
        }
    }
    let mut stmt = conn.prepare(&sql)?;
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

pub fn count_upload_history(path: &Path) -> rusqlite::Result<i64> {
    let conn = Connection::open(path)?;
    conn.query_row("SELECT COUNT(*) FROM upload_history", [], |row| row.get(0))
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
            marked_due_date: None,
            format: "text".to_string(),
            transcript_source: None,
            source_audio_mime_type: None,
            transcript_raw_text: None,
            source_kind: None,
            source_channel_id: None,
            source_message_id: None,
        }
    }

    fn sample_file_message(
        endpoint_id: &str,
        filename: &str,
        original_name: &str,
        timestamp_ms: i64,
    ) -> DbMessage {
        DbMessage {
            endpoint_id: endpoint_id.to_string(),
            filename: filename.to_string(),
            sender: "tester".to_string(),
            timestamp_ms,
            size: timestamp_ms,
            kind: "file".to_string(),
            original_name: original_name.to_string(),
            etag: None,
            mtime: None,
            content: None,
            local_path: None,
            remote_path: Some(format!("files/{filename}")),
            file_hash: None,
            marked: false,
            marked_tag_ids: Vec::new(),
            marked_pinned: false,
            marked_due_date: None,
            format: "text".to_string(),
            transcript_source: None,
            source_audio_mime_type: None,
            transcript_raw_text: None,
            source_kind: None,
            source_channel_id: None,
            source_message_id: None,
        }
    }

    fn remote_message(id: &str, filename: &str, timestamp_ms: i64) -> serde_json::Value {
        serde_json::json!({
            "id": id,
            "sender": "remote",
            "timestamp_ms": timestamp_ms,
            "size": 1,
            "kind": "text",
            "original_name": filename,
            "legacy_filename": filename,
            "content": filename,
            "format": "text",
            "marked": false,
            "marked_tag_ids": [],
            "marked_pinned": false,
            "revision": 1,
            "deleted_at": null
        })
    }

    #[test]
    fn supabase_history_page_is_scoped_and_uses_message_id_for_stable_paging() {
        let path = temp_db_path("supabase-history-page");
        init_db(&path, None).unwrap();
        apply_supabase_message_page(
            &path,
            "profile-a",
            "user-a",
            &[
                remote_message("message-c", "c.txt", 100),
                remote_message("message-b", "b.txt", 100),
            ],
            &[],
            &[],
            true,
            true,
            200,
        )
        .unwrap();
        apply_supabase_message_page(
            &path,
            "profile-a",
            "user-b",
            &[remote_message("message-z", "z.txt", 100)],
            &[],
            &[],
            false,
            true,
            201,
        )
        .unwrap();

        let cursor = get_supabase_history_cursor(&path, "profile-a", "user-a").unwrap();
        assert_eq!(cursor.oldest_timestamp_ms, Some(100));
        assert_eq!(cursor.oldest_message_id.as_deref(), Some("message-b"));
        assert!(cursor.has_more_before);
        let page = list_messages_before_for_scope(
            &path,
            "profile-a",
            "user-a",
            100,
            "message-c",
            10,
            false,
        )
        .unwrap();
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].message_id.as_deref(), Some("message-b"));
        assert_eq!(
            count_messages_for_scope(&path, "profile-a", "user-b", false).unwrap(),
            1
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn supabase_history_page_links_attachment_object_path_to_message() {
        let path = temp_db_path("supabase-history-attachment");
        init_db(&path, None).unwrap();
        let message = serde_json::json!({
            "id": "message-file",
            "sender": "remote",
            "timestamp_ms": 100,
            "size": 12,
            "kind": "file",
            "original_name": "report.pdf",
            "legacy_filename": "report.pdf",
            "content": null,
            "format": "file",
            "file_hash": "sha256-value",
            "marked": false,
            "marked_tag_ids": [],
            "marked_pinned": false,
            "revision": 3,
            "deleted_at": null
        });
        let attachment = serde_json::json!({
            "id": "attachment-file",
            "message_id": "message-file",
            "original_name": "report.pdf",
            "object_path": "user-a/space-a/attachment-file/report.pdf",
            "preview_object_path": null,
            "mime_type": "application/pdf",
            "size": 12,
            "sha256": "sha256-value",
            "revision": 4,
            "deleted_at": null
        });

        apply_supabase_message_page(
            &path,
            "profile-a",
            "user-a",
            &[message],
            &[],
            &[attachment],
            false,
            true,
            200,
        )
        .unwrap();

        let stored = get_message_for_scope(&path, "profile-a", "user-a", "report.pdf")
            .unwrap()
            .unwrap();
        assert_eq!(
            stored.remote_path.as_deref(),
            Some("user-a/space-a/attachment-file/report.pdf")
        );
        assert_eq!(
            get_attachment_object_path_for_message(&path, "profile-a", "user-a", "message-file",)
                .unwrap()
                .as_deref(),
            Some("user-a/space-a/attachment-file/report.pdf")
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn attachment_preview_queries_and_updates_are_scope_isolated() {
        let path = temp_db_path("attachment-preview-scope");
        init_db(&path, None).unwrap();
        let conn = Connection::open(&path).unwrap();
        for (endpoint, owner, preview) in [
            ("profile-a", "user-a", None),
            (
                "profile-a",
                "user-b",
                Some("user-b/space/attachment/preview.jpg"),
            ),
            (
                "profile-b",
                "user-a",
                Some("user-a/other/attachment/preview.jpg"),
            ),
        ] {
            conn.execute(
                "INSERT INTO attachment_sync(endpoint_id,owner_scope,attachment_id,message_id,
                 original_name,local_path,object_path,preview_object_path,mime_type,size,sha256,
                 upload_state,remote_revision,updated_at_ms)
                 VALUES(?1,?2,'attachment','message','photo.png','local.png',?3,?4,
                 'image/png',12,'hash','uploaded',7,1)",
                params![
                    endpoint,
                    owner,
                    format!("{owner}/space/attachment/photo.png"),
                    preview
                ],
            )
            .unwrap();
        }
        drop(conn);

        let historical = get_attachment_sync_record(&path, "profile-a", "user-a", "attachment")
            .unwrap()
            .unwrap();
        assert_eq!(historical.preview_object_path, None);
        assert_eq!(historical.remote_revision, 7);
        assert_eq!(historical.local_path.as_deref(), Some("local.png"));
        let operation = NewOutboxOperation {
            operation_id: "preview-operation".into(),
            endpoint_id: "profile-a".into(),
            owner_scope: "user-a".into(),
            entity_type: "attachment".into(),
            entity_id: "attachment".into(),
            action: "upsert".into(),
            base_revision: 7,
            payload_json: "{}".into(),
            payload_hash: "hash".into(),
            created_at_ms: 2,
        };
        set_attachment_preview_and_enqueue(
            &path,
            "profile-a",
            "user-a",
            "attachment",
            "user-a/space/attachment/preview.jpg",
            &operation,
            2,
        )
        .unwrap();
        assert_eq!(
            get_attachment_sync_record(&path, "profile-a", "user-a", "attachment")
                .unwrap()
                .unwrap()
                .preview_object_path
                .as_deref(),
            Some("user-a/space/attachment/preview.jpg")
        );
        assert_eq!(
            get_attachment_sync_record(&path, "profile-a", "user-b", "attachment")
                .unwrap()
                .unwrap()
                .preview_object_path
                .as_deref(),
            Some("user-b/space/attachment/preview.jpg")
        );
        assert_eq!(
            get_outbox_operation(&path, "preview-operation")
                .unwrap()
                .unwrap()
                .base_revision,
            7
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn pulled_attachment_change_updates_preview_path_for_other_devices() {
        let path = temp_db_path("attachment-preview-pull");
        init_db(&path, None).unwrap();
        let message = remote_message("message-file", "remote-photo.png", 100);
        apply_supabase_message_page(
            &path,
            "profile-a",
            "user-a",
            &[message],
            &[],
            &[serde_json::json!({
                "id":"attachment-file","message_id":"message-file",
                "original_name":"photo.png",
                "object_path":"user-a/space/attachment-file/photo.png",
                "preview_object_path":null,"mime_type":"image/png",
                "size":12,"sha256":"hash","revision":1,"deleted_at":null
            })],
            false,
            true,
            100,
        )
        .unwrap();
        apply_pulled_changes(
            &path,
            "profile-a",
            "user-a",
            &[PulledChange {
                change_seq: 2,
                entity_type: "attachment".into(),
                entity_id: "attachment-file".into(),
                change_type: "upsert".into(),
                revision: 2,
                snapshot: Some(serde_json::json!({
                    "message_id":"message-file","original_name":"photo.png",
                    "object_path":"user-a/space/attachment-file/photo.png",
                    "preview_object_path":"user-a/space/attachment-file/preview.jpg",
                    "mime_type":"image/png","size":12,"sha256":"hash",
                    "deleted_at":null
                })),
            }],
            2,
            200,
        )
        .unwrap();
        let attachment =
            get_attachment_sync_record(&path, "profile-a", "user-a", "attachment-file")
                .unwrap()
                .unwrap();
        assert_eq!(attachment.remote_revision, 2);
        assert_eq!(
            attachment.preview_object_path.as_deref(),
            Some("user-a/space/attachment-file/preview.jpg")
        );
        assert_eq!(
            get_sync_checkpoint(&path, "profile-a", "user-a").unwrap(),
            2
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn refreshing_recent_supabase_page_does_not_move_oldest_history_cursor() {
        let path = temp_db_path("supabase-history-refresh");
        init_db(&path, None).unwrap();
        apply_supabase_message_page(
            &path,
            "profile-a",
            "user-a",
            &[remote_message("message-old", "old.txt", 50)],
            &[],
            &[],
            true,
            true,
            200,
        )
        .unwrap();
        apply_supabase_message_page(
            &path,
            "profile-a",
            "user-a",
            &[remote_message("message-new", "new.txt", 200)],
            &[],
            &[],
            false,
            false,
            201,
        )
        .unwrap();
        let cursor = get_supabase_history_cursor(&path, "profile-a", "user-a").unwrap();
        assert_eq!(cursor.oldest_timestamp_ms, Some(50));
        assert_eq!(cursor.oldest_message_id.as_deref(), Some("message-old"));
        assert!(cursor.has_more_before);
        assert_eq!(
            count_messages_for_scope(&path, "profile-a", "user-a", false).unwrap(),
            2
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn list_bulk_download_candidates_filters_endpoint_search_and_sorts_latest_first() {
        let path = temp_db_path("bulk-download-candidates");
        init_db(&path, None).expect("initialize database");
        upsert_message(
            &path,
            &sample_file_message("endpoint-1", "old", "old-photo.png", 100),
        )
        .unwrap();
        upsert_message(
            &path,
            &sample_file_message("endpoint-1", "new", "new-video.mp4", 300),
        )
        .unwrap();
        upsert_message(
            &path,
            &sample_file_message("endpoint-2", "other", "new-other.mp4", 400),
        )
        .unwrap();
        let plain_text = sample_message("plain.txt", 500, &[], false);
        upsert_message(&path, &plain_text).unwrap();

        let rows = list_bulk_download_candidates(&path, "endpoint-1", "", None).unwrap();
        assert_eq!(
            rows.iter()
                .map(|row| row.filename.as_str())
                .collect::<Vec<_>>(),
            vec!["new", "old"]
        );
        let searched =
            list_bulk_download_candidates(&path, "endpoint-1", "", Some("photo")).unwrap();
        assert_eq!(searched.len(), 1);
        assert_eq!(searched[0].original_name, "old-photo.png");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn list_bulk_download_candidates_includes_speech_transcript_audio() {
        let path = temp_db_path("bulk-download-speech");
        init_db(&path, None).expect("initialize database");
        let mut speech = sample_message("speech-message", 200, &[], false);
        speech.original_name = "speech-message.wav".to_string();
        speech.transcript_source = Some("speech-to-text".to_string());
        speech.source_audio_mime_type = Some("audio/wav".to_string());
        upsert_message(&path, &speech).unwrap();
        let rows = list_bulk_download_candidates(&path, "endpoint-1", "", None).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].source_audio_mime_type.as_deref(), Some("audio/wav"));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn list_bulk_download_candidates_isolates_owner_scope_and_hides_deleted_messages() {
        let path = temp_db_path("bulk-download-owner-scope");
        init_db(&path, None).expect("initialize database");
        let message_a = sample_file_message("supabase-1", "shared", "user-a.png", 300);
        upsert_message(&path, &message_a).unwrap();
        Connection::open(&path)
            .unwrap()
            .execute(
                "UPDATE messages SET owner_scope='user-a' WHERE endpoint_id='supabase-1' AND filename='shared'",
                [],
            )
            .unwrap();
        let message_b = sample_file_message("supabase-1", "shared", "user-b.png", 200);
        upsert_message(&path, &message_b).unwrap();
        Connection::open(&path)
            .unwrap()
            .execute(
                "UPDATE messages SET owner_scope='user-b' WHERE endpoint_id='supabase-1' AND owner_scope='' AND filename='shared'",
                [],
            )
            .unwrap();
        let deleted = sample_file_message("supabase-1", "deleted", "deleted.png", 400);
        upsert_message(&path, &deleted).unwrap();
        Connection::open(&path)
            .unwrap()
            .execute(
                "UPDATE messages SET owner_scope='user-a', deleted_at_ms=500 WHERE endpoint_id='supabase-1' AND filename='deleted'",
                [],
            )
            .unwrap();

        let rows = list_bulk_download_candidates(&path, "supabase-1", "user-a", None).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].original_name, "user-a.png");
        let other = list_bulk_download_candidates(&path, "supabase-1", "user-b", None).unwrap();
        assert_eq!(other.len(), 1);
        assert_eq!(other[0].original_name, "user-b.png");
        let _ = std::fs::remove_file(path);
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
        assert_eq!(message.marked_due_date, None);
        assert_eq!(message.transcript_source, None);
        assert_eq!(message.source_audio_mime_type, None);
        assert_eq!(message.source_kind, None);
        assert_eq!(message.source_channel_id, None);
        assert_eq!(message.source_message_id, None);
        assert!(list_marked_tags(&path, "endpoint-1")
            .expect("list marked tags after migration")
            .is_empty());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn init_db_adds_local_first_schema_without_losing_existing_messages() {
        let path = temp_db_path("local-first-migration");
        let conn = Connection::open(&path).expect("create legacy db");
        conn.execute_batch(
            "CREATE TABLE messages (
                endpoint_id TEXT NOT NULL, filename TEXT NOT NULL, sender TEXT NOT NULL,
                timestamp_ms INTEGER NOT NULL, size INTEGER NOT NULL, kind TEXT NOT NULL,
                original_name TEXT NOT NULL, etag TEXT, mtime TEXT, content TEXT, local_path TEXT,
                remote_path TEXT, file_hash TEXT, marked BOOLEAN NOT NULL DEFAULT 0,
                marked_tag_ids TEXT NOT NULL DEFAULT '[]', marked_pinned BOOLEAN NOT NULL DEFAULT 0,
                marked_due_date TEXT, format TEXT NOT NULL DEFAULT 'text', transcript_source TEXT,
                source_audio_mime_type TEXT, transcript_raw_text TEXT,
                PRIMARY KEY(endpoint_id, filename)
            );",
        )
        .expect("create legacy messages table");
        conn.execute(
            "INSERT INTO messages
             (endpoint_id,filename,sender,timestamp_ms,size,kind,original_name,content)
             VALUES ('endpoint-1','one.txt','one',1,1,'text','one.txt','first'),
                    ('endpoint-1','two.txt','two',2,2,'text','two.txt','second')",
            [],
        )
        .expect("seed legacy rows");
        drop(conn);

        init_db(&path, None).expect("migrate database");
        let conn = Connection::open(&path).expect("open migrated db");
        let count: i64 = conn
            .query_row("SELECT count(*) FROM messages", [], |row| row.get(0))
            .expect("count messages");
        let stable_ids: i64 = conn
            .query_row(
                "SELECT count(DISTINCT message_id) FROM messages
                 WHERE message_id IS NOT NULL AND message_id <> ''",
                [],
                |row| row.get(0),
            )
            .expect("count stable ids");
        assert_eq!(count, 2);
        assert_eq!(stable_ids, 2);
        let source_columns: i64 = conn
            .query_row(
                "SELECT count(*) FROM pragma_table_info('messages')
                 WHERE name IN ('source_kind','source_channel_id','source_message_id')",
                [],
                |row| row.get(0),
            )
            .expect("count source columns");
        assert_eq!(source_columns, 3);
        let populated_sources: i64 = conn
            .query_row(
                "SELECT count(*) FROM messages WHERE source_kind IS NOT NULL
                 OR source_channel_id IS NOT NULL OR source_message_id IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .expect("count populated source identities");
        assert_eq!(populated_sources, 0);
        for table in [
            "sync_outbox",
            "sync_checkpoints",
            "sync_conflicts",
            "attachment_sync",
        ] {
            let exists: i64 = conn
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |row| row.get(0),
                )
                .expect("check sync table");
            assert_eq!(exists, 1, "missing table {table}");
        }
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn message_and_outbox_commit_or_rollback_together() {
        let path = temp_db_path("message-outbox-transaction");
        init_db(&path, None).expect("initialize database");
        let mut message = sample_message("atomic.txt", 100, &[], false);
        message.marked = false;
        let operation = NewOutboxOperation {
            operation_id: "operation-1".into(),
            endpoint_id: message.endpoint_id.clone(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: "message-a".into(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: "{}".into(),
            payload_hash: "hash-a".into(),
            created_at_ms: 100,
        };
        save_message_and_enqueue(&path, &message, &operation).expect("save atomically");
        let conn = Connection::open(&path).expect("open database");
        let message_count: i64 = conn
            .query_row("SELECT count(*) FROM messages", [], |row| row.get(0))
            .expect("count messages");
        let outbox_count: i64 = conn
            .query_row("SELECT count(*) FROM sync_outbox", [], |row| row.get(0))
            .expect("count outbox");
        assert_eq!((message_count, outbox_count), (1, 1));
        drop(conn);

        let mut changed = message.clone();
        changed.content = Some("must roll back".into());
        let duplicate = NewOutboxOperation {
            payload_hash: "different".into(),
            ..operation
        };
        assert!(save_message_and_enqueue(&path, &changed, &duplicate).is_err());
        let conn = Connection::open(&path).expect("reopen database");
        let stored: String = conn
            .query_row(
                "SELECT content FROM messages WHERE filename='atomic.txt'",
                [],
                |row| row.get(0),
            )
            .expect("read message content");
        let outbox_count: i64 = conn
            .query_row("SELECT count(*) FROM sync_outbox", [], |row| row.get(0))
            .expect("count outbox after rollback");
        assert_eq!(stored, "atomic.txt");
        assert_eq!(outbox_count, 1);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn telegram_source_identity_is_unique_within_scope_but_reusable_across_owners() {
        let path = temp_db_path("telegram-source-identity");
        init_db(&path, None).expect("initialize database");
        let mut first = sample_message("telegram-a.txt", 100, &[], false);
        first.marked = false;
        first.source_kind = Some("telegram".into());
        first.source_channel_id = Some("-100123".into());
        first.source_message_id = Some("456".into());
        let operation =
            |operation_id: &str, owner_scope: &str, entity_id: &str| NewOutboxOperation {
                operation_id: operation_id.into(),
                endpoint_id: first.endpoint_id.clone(),
                owner_scope: owner_scope.into(),
                entity_type: "message".into(),
                entity_id: entity_id.into(),
                action: "upsert".into(),
                base_revision: 0,
                payload_json: "{}".into(),
                payload_hash: format!("hash-{operation_id}"),
                created_at_ms: 100,
            };
        save_message_and_enqueue(&path, &first, &operation("op-a", "user-a", "message-a"))
            .expect("save first Telegram message");

        let mut duplicate = first.clone();
        duplicate.filename = "telegram-duplicate.txt".into();
        assert!(save_message_and_enqueue(
            &path,
            &duplicate,
            &operation("op-duplicate", "user-a", "message-duplicate"),
        )
        .is_err());

        let mut other_owner = first.clone();
        other_owner.filename = "telegram-other-owner.txt".into();
        save_message_and_enqueue(
            &path,
            &other_owner,
            &operation("op-b", "user-b", "message-b"),
        )
        .expect("same Telegram source is isolated by owner scope");
        let conn = Connection::open(&path).unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT count(*) FROM messages WHERE source_kind='telegram'
                 AND source_channel_id='-100123' AND source_message_id='456'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn telegram_bridge_local_state_is_binding_scoped_and_survives_reopen() {
        let path = temp_db_path("telegram-local-state");
        init_db(&path, None).expect("initialize database");
        upsert_telegram_bridge_binding_state(
            &path,
            "supabase:profile-a:user-a:-1001",
            "profile-a",
            "user-a",
            "supabase",
            42,
            1000,
            "message-a",
            2000,
        )
        .unwrap();
        upsert_telegram_bridge_binding_state(
            &path,
            "supabase:profile-a:user-b:-1001",
            "profile-a",
            "user-b",
            "supabase",
            7,
            3000,
            "message-b",
            4000,
        )
        .unwrap();
        upsert_telegram_delivery_record(
            &path,
            "supabase:profile-a:user-a:-1001",
            &TelegramDeliveryRecord {
                message_key: "message-a".into(),
                status: "delivery_unconfirmed".into(),
                telegram_message_id: None,
                last_error: Some("request result unknown".into()),
                last_attempt_ms: Some(5000),
            },
        )
        .unwrap();
        upsert_telegram_delivery_record(
            &path,
            "supabase:profile-a:user-a:-1001",
            &TelegramDeliveryRecord {
                message_key: "message-crashed".into(),
                status: "sending".into(),
                telegram_message_id: None,
                last_error: None,
                last_attempt_ms: Some(5001),
            },
        )
        .unwrap();

        assert_eq!(
            recover_telegram_sending_deliveries(&path, "supabase:profile-a:user-a:-1001", 6000,)
                .unwrap(),
            1
        );

        drop(Connection::open(&path).unwrap());

        assert_eq!(
            telegram_bridge_binding_state(&path, "supabase:profile-a:user-a:-1001").unwrap(),
            Some((42, 1000, "message-a".into()))
        );
        assert_eq!(
            telegram_bridge_binding_state(&path, "supabase:profile-a:user-b:-1001").unwrap(),
            Some((7, 3000, "message-b".into()))
        );
        let record =
            get_telegram_delivery_record(&path, "supabase:profile-a:user-a:-1001", "message-a")
                .unwrap()
                .expect("delivery record");
        assert_eq!(record.status, "delivery_unconfirmed");
        assert_eq!(record.last_error.as_deref(), Some("request result unknown"));
        let recovered = get_telegram_delivery_record(
            &path,
            "supabase:profile-a:user-a:-1001",
            "message-crashed",
        )
        .unwrap()
        .expect("recovered delivery record");
        assert_eq!(recovered.status, "delivery_unconfirmed");
        assert!(get_telegram_delivery_record(
            &path,
            "supabase:profile-a:user-b:-1001",
            "message-a",
        )
        .unwrap()
        .is_none());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn telegram_outbound_watermark_query_is_scope_isolated_and_excludes_history() {
        let path = temp_db_path("telegram-outbound-watermark");
        init_db(&path, None).unwrap();

        for (owner, filename, timestamp_ms) in [
            ("user-a", "history.txt", 999),
            ("user-a", "same-time-before.txt", 1_000),
            ("user-a", "live.txt", 1_001),
            ("user-b", "other-owner.txt", 1_002),
        ] {
            let mut message = sample_message(filename, timestamp_ms, &[], false);
            message.marked = false;
            let operation = NewOutboxOperation {
                operation_id: format!("operation-{owner}-{filename}"),
                endpoint_id: message.endpoint_id.clone(),
                owner_scope: owner.into(),
                entity_type: "message".into(),
                entity_id: format!("message-{owner}-{filename}"),
                action: "upsert".into(),
                base_revision: 0,
                payload_json: "{}".into(),
                payload_hash: format!("hash-{owner}-{filename}"),
                created_at_ms: timestamp_ms,
            };
            save_message_and_enqueue(&path, &message, &operation).unwrap();
        }

        let messages = list_messages_after_for_scope(
            &path,
            "endpoint-1",
            "user-a",
            1_000,
            "same-time-before.txt",
            10,
            false,
        )
        .unwrap();
        assert_eq!(
            messages
                .iter()
                .map(|message| message.filename.as_str())
                .collect::<Vec<_>>(),
            vec!["live.txt"]
        );
        assert!(
            list_messages_after_for_scope(&path, "endpoint-1", "user-a", 2_000, "", 10, false,)
                .unwrap()
                .is_empty()
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn provider_sync_results_make_text_and_files_eligible_for_telegram_outbound() {
        let path = temp_db_path("telegram-provider-sync-outbound");
        init_db(&path, None).unwrap();

        let mut webdav_text = sample_message("webdav-text.txt", 1_001, &[], false);
        webdav_text.endpoint_id = "endpoint-webdav".into();
        webdav_text.marked = false;
        upsert_message(&path, &webdav_text).unwrap();
        let webdav_file = sample_file_message(
            "endpoint-webdav",
            "webdav-file.bin",
            "webdav-file.bin",
            1_002,
        );
        upsert_message(&path, &webdav_file).unwrap();

        let mut supabase_text = remote_message("supabase-text", "supabase-text.txt", 1_003);
        supabase_text["kind"] = serde_json::json!("text");
        let mut supabase_file = remote_message("supabase-file", "supabase-file.bin", 1_004);
        supabase_file["kind"] = serde_json::json!("file");
        supabase_file["content"] = serde_json::Value::Null;
        apply_supabase_message_page(
            &path,
            "endpoint-supabase",
            "user-a",
            &[supabase_text, supabase_file],
            &[],
            &[],
            false,
            true,
            2_000,
        )
        .unwrap();

        let webdav =
            list_messages_after_for_scope(&path, "endpoint-webdav", "", 1_000, "", 10, false)
                .unwrap();
        assert_eq!(
            webdav
                .iter()
                .map(|message| message.kind.as_str())
                .collect::<Vec<_>>(),
            vec!["text", "file"]
        );

        let supabase = list_messages_after_for_scope(
            &path,
            "endpoint-supabase",
            "user-a",
            1_000,
            "",
            10,
            false,
        )
        .unwrap();
        assert_eq!(
            supabase
                .iter()
                .map(|message| message.kind.as_str())
                .collect::<Vec<_>>(),
            vec!["text", "file"]
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn pulled_supabase_message_preserves_external_source_identity() {
        let path = temp_db_path("pulled-source-identity");
        init_db(&path, None).unwrap();
        let mut remote = remote_message("message-telegram", "telegram.txt", 100);
        remote["source_kind"] = serde_json::json!("telegram");
        remote["source_channel_id"] = serde_json::json!("-100123");
        remote["source_message_id"] = serde_json::json!("456");
        apply_supabase_message_page(
            &path,
            "profile-a",
            "user-a",
            &[remote],
            &[],
            &[],
            false,
            true,
            200,
        )
        .unwrap();
        let stored = get_message_for_scope(&path, "profile-a", "user-a", "telegram.txt")
            .unwrap()
            .unwrap();
        assert_eq!(stored.source_kind.as_deref(), Some("telegram"));
        assert_eq!(stored.source_channel_id.as_deref(), Some("-100123"));
        assert_eq!(stored.source_message_id.as_deref(), Some("456"));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn mark_tag_and_delete_rollback_when_outbox_insert_fails() {
        let path = temp_db_path("mutation-outbox-rollback");
        init_db(&path, None).expect("initialize database");
        let mut message = sample_message("atomic.txt", 100, &[], false);
        message.marked = false;
        let original = NewOutboxOperation {
            operation_id: "operation-shared".into(),
            endpoint_id: message.endpoint_id.clone(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: "message-a".into(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: "{}".into(),
            payload_hash: "hash-a".into(),
            created_at_ms: 100,
        };
        save_message_and_enqueue(&path, &message, &original).expect("seed message and outbox");

        let conflicting = NewOutboxOperation {
            payload_hash: "hash-conflict".into(),
            ..original.clone()
        };
        assert!(set_message_marked_and_enqueue(
            &path,
            "endpoint-1",
            "user-a",
            "atomic.txt",
            true,
            &[],
            false,
            None,
            &conflicting,
        )
        .is_err());
        let stored = get_message_for_scope(&path, "endpoint-1", "user-a", "atomic.txt")
            .expect("read message")
            .expect("message exists");
        assert!(!stored.marked);

        let tag = MarkedTag {
            id: "tag-a".into(),
            name: "Tag A".into(),
        };
        assert!(
            save_tag_and_enqueue(&path, "endpoint-1", "user-a", &tag, 0, None, &conflicting,)
                .is_err()
        );
        assert!(list_tags_for_scope(&path, "endpoint-1", "user-a")
            .expect("list tags")
            .is_empty());

        assert!(tombstone_messages_and_enqueue(
            &path,
            "endpoint-1",
            "user-a",
            &["atomic.txt".into()],
            &[conflicting],
            200,
        )
        .is_err());
        assert!(
            get_message_for_scope(&path, "endpoint-1", "user-a", "atomic.txt")
                .expect("read after failed tombstone")
                .is_some()
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn outbox_claim_recovery_preserves_operation_identity_and_payload() {
        let path = temp_db_path("outbox-claim-recovery");
        init_db(&path, None).expect("initialize database");
        let message = sample_message("outbox.txt", 100, &[], false);
        let first = NewOutboxOperation {
            operation_id: "operation-first".into(),
            endpoint_id: message.endpoint_id.clone(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: "message-a".into(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: "{\"content\":\"immutable\"}".into(),
            payload_hash: "hash-immutable".into(),
            created_at_ms: 100,
        };
        save_message_and_enqueue(&path, &message, &first).expect("seed first operation");
        let mut changed = message.clone();
        changed.content = Some("second".into());
        let second = NewOutboxOperation {
            operation_id: "operation-second".into(),
            payload_json: "{\"content\":\"second\"}".into(),
            payload_hash: "hash-second".into(),
            created_at_ms: 101,
            ..first.clone()
        };
        save_message_and_enqueue(&path, &changed, &second).expect("seed second operation");

        let claimed = claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker-a",
            1_000,
            30_000,
            10,
            false,
        )
        .expect("claim first operation");
        assert_eq!(claimed.len(), 1);
        assert_eq!(claimed[0].operation_id, first.operation_id);
        assert_eq!(claimed[0].payload_json, first.payload_json);
        assert_eq!(claimed[0].payload_hash, first.payload_hash);
        assert_eq!(claimed[0].attempt_count, 1);
        assert!(claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker-b",
            1_001,
            30_000,
            10,
            false,
        )
        .expect("respect active lease")
        .is_empty());

        assert_eq!(recover_all_outbox_claims(&path, 1_002).unwrap(), 1);
        let replay = claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker-restart",
            1_003,
            30_000,
            10,
            false,
        )
        .expect("reclaim after process interruption");
        assert_eq!(replay.len(), 1);
        assert_eq!(replay[0].operation_id, first.operation_id);
        assert_eq!(replay[0].payload_json, first.payload_json);
        assert_eq!(replay[0].attempt_count, 2);
        assert!(
            acknowledge_outbox_operation(&path, &first.operation_id, "worker-restart", 1_004)
                .unwrap()
        );
        let next = claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker-restart",
            1_005,
            30_000,
            10,
            false,
        )
        .expect("claim later operation after acknowledgement");
        assert_eq!(next.len(), 1);
        assert_eq!(next[0].operation_id, second.operation_id);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn outbox_success_rebases_later_pending_change_for_same_message() {
        let path = temp_db_path("outbox-rebase");
        init_db(&path, None).unwrap();
        let message = sample_message("rebase.txt", 100, &[], false);
        let first = NewOutboxOperation {
            operation_id: "rebase-first".into(),
            endpoint_id: "endpoint-1".into(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: "message-rebase".into(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: r#"{"marked":true}"#.into(),
            payload_hash: "rebase-first-hash".into(),
            created_at_ms: 100,
        };
        save_message_and_enqueue(&path, &message, &first).unwrap();
        let second = NewOutboxOperation {
            operation_id: "rebase-second".into(),
            payload_json: r#"{"marked":true,"markedPinned":true}"#.into(),
            payload_hash: "rebase-second-hash".into(),
            created_at_ms: 101,
            ..first.clone()
        };
        save_message_and_enqueue(&path, &message, &second).unwrap();
        let first_claim = claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker",
            200,
            30_000,
            1,
            true,
        )
        .unwrap();
        apply_outbox_success(&path, &first_claim[0], "worker", 1, 201).unwrap();
        let second_claim = claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker",
            202,
            30_000,
            1,
            true,
        )
        .unwrap();
        assert_eq!(second_claim[0].operation_id, "rebase-second");
        assert_eq!(second_claim[0].base_revision, 1);
        assert_eq!(second_claim[0].payload_hash, "rebase-second-hash");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn outbox_retry_backoff_is_recoverable_and_manual_claim_can_bypass_it() {
        let path = temp_db_path("outbox-retry-backoff");
        init_db(&path, None).expect("initialize database");
        let message = sample_message("retry.txt", 100, &[], false);
        let operation = NewOutboxOperation {
            operation_id: "operation-retry".into(),
            endpoint_id: message.endpoint_id.clone(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: "message-a".into(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: "{}".into(),
            payload_hash: "hash-retry".into(),
            created_at_ms: 100,
        };
        save_message_and_enqueue(&path, &message, &operation).expect("seed operation");
        let claimed = claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker-a",
            1_000,
            30_000,
            1,
            false,
        )
        .unwrap();
        let retry_at = 1_000 + outbox_retry_delay_ms(claimed[0].attempt_count);
        assert!(release_outbox_operation(
            &path,
            &operation.operation_id,
            "worker-a",
            retry_at,
            "response lost",
            1_001
        )
        .unwrap());
        assert!(claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker-b",
            1_002,
            30_000,
            1,
            false,
        )
        .unwrap()
        .is_empty());
        let manual = claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker-b",
            1_002,
            30_000,
            1,
            true,
        )
        .unwrap();
        assert_eq!(manual[0].operation_id, operation.operation_id);
        assert_eq!(manual[0].payload_hash, operation.payload_hash);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn outbox_success_and_conflict_update_business_state_atomically() {
        let path = temp_db_path("outbox-result-atomic");
        init_db(&path, None).expect("initialize database");
        let message = sample_message("result.txt", 100, &[], false);
        let operation = NewOutboxOperation {
            operation_id: "operation-result".into(),
            endpoint_id: message.endpoint_id.clone(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: "message-result".into(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: "{\"content\":\"local\"}".into(),
            payload_hash: "hash-result".into(),
            created_at_ms: 100,
        };
        save_message_and_enqueue(&path, &message, &operation).expect("seed operation");
        let claimed = claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker",
            1_000,
            30_000,
            1,
            false,
        )
        .unwrap();
        assert!(apply_outbox_success(&path, &claimed[0], "worker", 7, 1_001).unwrap());
        let conn = Connection::open(&path).unwrap();
        let state: (i64, String) = conn
            .query_row(
                "SELECT remote_revision,sync_state FROM messages WHERE message_id='message-result'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(state, (7, "synced".into()));
        drop(conn);

        let conflict_operation = NewOutboxOperation {
            operation_id: "operation-conflict".into(),
            base_revision: 7,
            payload_json: "{\"content\":\"local-new\"}".into(),
            payload_hash: "hash-conflict".into(),
            created_at_ms: 101,
            ..operation
        };
        let mut changed = message.clone();
        changed.content = Some("local-new".into());
        save_message_and_enqueue(&path, &changed, &conflict_operation).unwrap();
        let claimed = claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker",
            2_000,
            30_000,
            1,
            false,
        )
        .unwrap();
        assert!(record_outbox_conflict(
            &path,
            &claimed[0],
            "worker",
            Some(8),
            Some("{\"deleted_at\":\"2026-01-01T00:00:00Z\"}"),
            2_001
        )
        .unwrap());
        let conn = Connection::open(&path).unwrap();
        let conflict: (String, String, i64) = conn
            .query_row(
                "SELECT local_payload_json,remote_payload_json,remote_revision
                 FROM sync_conflicts WHERE entity_id='message-result'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(conflict.0, conflict_operation.payload_json);
        assert!(conflict.1.contains("deleted_at"));
        assert_eq!(conflict.2, 8);
        let sync_state: String = conn
            .query_row(
                "SELECT sync_state FROM messages WHERE message_id='message-result'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(sync_state, "conflict");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn pending_and_conflict_entry_points_keep_blocked_work_distinct() {
        let path = temp_db_path("sync-issue-entry-points");
        init_db(&path, None).unwrap();
        let message = sample_message("issues.txt", 100, &[], false);
        let operation = NewOutboxOperation {
            operation_id: "issue-operation".into(),
            endpoint_id: "endpoint-1".into(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: "message-issue".into(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: "{\"content\":\"local\"}".into(),
            payload_hash: "issue-hash".into(),
            created_at_ms: 100,
        };
        save_message_and_enqueue(&path, &message, &operation).unwrap();
        assert_eq!(
            list_pending_operations(&path, "endpoint-1", "user-a")
                .unwrap()
                .len(),
            1
        );
        let claimed = claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker",
            200,
            30_000,
            1,
            false,
        )
        .unwrap();
        record_outbox_conflict(
            &path,
            &claimed[0],
            "worker",
            Some(2),
            Some("{\"deleted_at\":null,\"content\":\"remote\"}"),
            201,
        )
        .unwrap();
        assert!(list_pending_operations(&path, "endpoint-1", "user-a")
            .unwrap()
            .is_empty());
        let conflicts = list_sync_conflicts(&path, "endpoint-1", "user-a").unwrap();
        assert_eq!(conflicts.len(), 1);
        let retry = NewOutboxOperation {
            operation_id: "issue-retry".into(),
            base_revision: 2,
            payload_hash: "retry-hash".into(),
            created_at_ms: 202,
            ..operation
        };
        assert!(resolve_sync_conflict_keep_local(
            &path,
            conflicts[0].id,
            "endpoint-1",
            "user-a",
            &retry,
            202
        )
        .unwrap());
        assert!(list_sync_conflicts(&path, "endpoint-1", "user-a")
            .unwrap()
            .is_empty());
        let pending = list_pending_operations(&path, "endpoint-1", "user-a").unwrap();
        assert_eq!(
            (pending.len(), pending[0].operation_id.as_str()),
            (1, "issue-retry")
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn resolving_conflict_with_remote_applies_snapshot_and_supersedes_local_operation() {
        let path = temp_db_path("sync-conflict-use-remote");
        init_db(&path, None).unwrap();
        let message = sample_message("remote-wins.txt", 100, &[], false);
        let operation = NewOutboxOperation {
            operation_id: "remote-wins-operation".into(),
            endpoint_id: "endpoint-1".into(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: "message-remote-wins".into(),
            action: "upsert".into(),
            base_revision: 1,
            payload_json: "{\"content\":\"local\"}".into(),
            payload_hash: "remote-wins-hash".into(),
            created_at_ms: 100,
        };
        save_message_and_enqueue(&path, &message, &operation).unwrap();
        let claimed = claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker",
            200,
            30_000,
            1,
            false,
        )
        .unwrap();
        let remote = serde_json::json!({
            "id": "message-remote-wins",
            "sender": "device-b",
            "timestamp_ms": 200,
            "size": 6,
            "kind": "text",
            "original_name": "remote-wins.txt",
            "legacy_filename": "remote-wins.txt",
            "content": "remote",
            "format": "text",
            "marked": false,
            "marked_tag_ids": [],
            "marked_pinned": false,
            "deleted_at": null
        });
        record_outbox_conflict(
            &path,
            &claimed[0],
            "worker",
            Some(2),
            Some(&remote.to_string()),
            201,
        )
        .unwrap();
        let conflict = list_sync_conflicts(&path, "endpoint-1", "user-a")
            .unwrap()
            .remove(0);

        assert!(
            resolve_sync_conflict_use_remote(&path, conflict.id, "endpoint-1", "user-a", 202)
                .unwrap()
        );

        let conn = Connection::open(&path).unwrap();
        let message_state: (Option<String>, i64, String) = conn
            .query_row(
                "SELECT content,remote_revision,sync_state FROM messages
                 WHERE endpoint_id='endpoint-1' AND owner_scope='user-a'
                   AND filename='remote-wins.txt'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(message_state, (Some("remote".into()), 2, "synced".into()));
        let outbox_state: String = conn
            .query_row(
                "SELECT state FROM sync_outbox WHERE operation_id='remote-wins-operation'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(outbox_state, "superseded");
        assert!(list_sync_conflicts(&path, "endpoint-1", "user-a")
            .unwrap()
            .is_empty());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn batch_conflict_resolution_keeps_profile_and_account_scope_isolated() {
        let path = temp_db_path("batch-conflict-resolution");
        init_db(&path, None).unwrap();
        for (index, owner_scope) in ["user-a", "user-a", "user-b"].into_iter().enumerate() {
            let entity_id = format!("message-{index}");
            let mut message =
                sample_message(&format!("message-{index}.txt"), index as i64, &[], false);
            message.content = Some(format!("local-{index}"));
            let operation = NewOutboxOperation {
                operation_id: format!("operation-{index}"),
                endpoint_id: "endpoint-1".into(),
                owner_scope: owner_scope.into(),
                entity_type: "message".into(),
                entity_id: entity_id.clone(),
                action: "upsert".into(),
                base_revision: 1,
                payload_json: format!(r#"{{"content":"local-{index}"}}"#),
                payload_hash: format!("hash-{index}"),
                created_at_ms: 100 + index as i64,
            };
            save_message_and_enqueue(&path, &message, &operation).unwrap();
            let claimed = claim_outbox_operations(
                &path,
                "endpoint-1",
                owner_scope,
                &format!("worker-{index}"),
                200 + index as i64,
                30_000,
                1,
                true,
            )
            .unwrap();
            let remote = serde_json::json!({
                "id":entity_id,"sender":"remote","timestamp_ms":300 + index as i64,
                "size":8,"kind":"text","original_name":format!("message-{index}.txt"),
                "legacy_filename":format!("message-{index}.txt"),"content":format!("remote-{index}"),
                "format":"text","marked":false,"marked_tag_ids":[],
                "marked_pinned":false,"deleted_at":null
            });
            record_outbox_conflict(
                &path,
                &claimed[0],
                &format!("worker-{index}"),
                Some(2),
                Some(&remote.to_string()),
                210 + index as i64,
            )
            .unwrap();
        }

        assert_eq!(
            resolve_all_sync_conflicts_use_remote(&path, "endpoint-1", "user-a", 400).unwrap(),
            2
        );
        assert!(list_sync_conflicts(&path, "endpoint-1", "user-a")
            .unwrap()
            .is_empty());
        assert_eq!(
            list_sync_conflicts(&path, "endpoint-1", "user-b")
                .unwrap()
                .len(),
            1
        );
        for index in 0..2 {
            let message = get_message_for_scope(
                &path,
                "endpoint-1",
                "user-a",
                &format!("message-{index}.txt"),
            )
            .unwrap()
            .unwrap();
            assert_eq!(message.content, Some(format!("remote-{index}")));
        }
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn batch_use_remote_merges_message_with_legacy_filename_by_message_id() {
        let path = temp_db_path("batch-remote-legacy-filename");
        init_db(&path, None).unwrap();
        let mut message = sample_message("old-local-name.txt", 100, &[], false);
        message.content = Some("local content".into());
        message.local_path = Some("cached/local-copy.txt".into());
        let operation = NewOutboxOperation {
            operation_id: "legacy-filename-operation".into(),
            endpoint_id: "endpoint-1".into(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: "stable-message-id".into(),
            action: "upsert".into(),
            base_revision: 1,
            payload_json: r#"{"content":"local content"}"#.into(),
            payload_hash: "local-hash".into(),
            created_at_ms: 100,
        };
        save_message_and_enqueue(&path, &message, &operation).unwrap();
        let claimed = claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker",
            200,
            30_000,
            1,
            true,
        )
        .unwrap();
        let remote = serde_json::json!({
            "id": "stable-message-id",
            "sender": "remote",
            "timestamp_ms": 300,
            "size": 14,
            "kind": "text",
            "original_name": "new-remote-name.txt",
            "legacy_filename": "new-remote-name.txt",
            "content": "remote content",
            "format": "text",
            "marked": false,
            "marked_tag_ids": [],
            "marked_pinned": false,
            "deleted_at": null
        });
        record_outbox_conflict(
            &path,
            &claimed[0],
            "worker",
            Some(9),
            Some(&remote.to_string()),
            201,
        )
        .unwrap();

        assert_eq!(
            resolve_all_sync_conflicts_use_remote(&path, "endpoint-1", "user-a", 400).unwrap(),
            1
        );

        let conn = Connection::open(&path).unwrap();
        let messages = conn
            .prepare(
                "SELECT filename,message_id,content,remote_revision,sync_state,local_path
                 FROM messages WHERE endpoint_id='endpoint-1' AND owner_scope='user-a'",
            )
            .unwrap()
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            })
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(
            messages,
            vec![(
                "new-remote-name.txt".into(),
                "stable-message-id".into(),
                Some("remote content".into()),
                9,
                "synced".into(),
                Some("cached/local-copy.txt".into()),
            )]
        );
        let outbox_state: String = conn
            .query_row(
                "SELECT state FROM sync_outbox WHERE operation_id='legacy-filename-operation'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(outbox_state, "superseded");
        assert!(list_sync_conflicts(&path, "endpoint-1", "user-a")
            .unwrap()
            .is_empty());
        drop(conn);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn batch_keep_local_creates_one_retry_per_entity_and_resolves_duplicates() {
        let path = temp_db_path("batch-conflict-keep-local");
        init_db(&path, None).unwrap();
        let mut message = sample_message("local-wins.txt", 100, &[], false);
        message.content = Some("local latest".into());
        let operation = NewOutboxOperation {
            operation_id: "original-operation".into(),
            endpoint_id: "endpoint-1".into(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: "message-local-wins".into(),
            action: "upsert".into(),
            base_revision: 1,
            payload_json: r#"{"content":"local latest"}"#.into(),
            payload_hash: "original-hash".into(),
            created_at_ms: 100,
        };
        save_message_and_enqueue(&path, &message, &operation).unwrap();
        let claimed = claim_outbox_operations(
            &path,
            "endpoint-1",
            "user-a",
            "worker",
            200,
            30_000,
            1,
            true,
        )
        .unwrap();
        record_outbox_conflict(
            &path,
            &claimed[0],
            "worker",
            Some(2),
            Some(r#"{"deleted_at":null,"content":"remote"}"#),
            201,
        )
        .unwrap();
        Connection::open(&path)
            .unwrap()
            .execute(
                "INSERT INTO sync_conflicts (endpoint_id,owner_scope,entity_type,entity_id,
                 local_payload_json,remote_payload_json,local_revision,remote_revision,status,created_at_ms)
                 VALUES ('endpoint-1','user-a','message','message-local-wins',?1,?2,1,3,'unresolved',202)",
                params![operation.payload_json, r#"{"deleted_at":null,"content":"remote newer"}"#],
            )
            .unwrap();
        let retry = NewOutboxOperation {
            operation_id: "retry-operation".into(),
            base_revision: 3,
            payload_hash: "retry-hash".into(),
            created_at_ms: 203,
            ..operation
        };

        let conflict_ids = list_sync_conflicts(&path, "endpoint-1", "user-a")
            .unwrap()
            .into_iter()
            .map(|conflict| conflict.id)
            .collect::<Vec<_>>();
        assert_eq!(
            resolve_all_sync_conflicts_keep_local(
                &path,
                "endpoint-1",
                "user-a",
                &conflict_ids,
                &[retry],
                204
            )
            .unwrap(),
            2
        );
        assert!(list_sync_conflicts(&path, "endpoint-1", "user-a")
            .unwrap()
            .is_empty());
        let pending = list_pending_operations(&path, "endpoint-1", "user-a").unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].operation_id, "retry-operation");
        assert_eq!(pending[0].base_revision, 3);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn pulled_changes_and_checkpoint_rollback_and_replay_atomically() {
        let path = temp_db_path("pull-checkpoint-atomic");
        init_db(&path, None).expect("initialize database");
        let snapshot = serde_json::json!({
            "id":"00000000-0000-4000-8000-000000000123",
            "sender":"device-a","timestamp_ms":100,"size":5,
            "kind":"text","original_name":"message.txt",
            "legacy_filename":"remote-message.txt","content":"hello",
            "format":"text","marked":false,"marked_tag_ids":[],
            "marked_pinned":false,"deleted_at":null
        });
        let changes = vec![PulledChange {
            change_seq: 1,
            entity_type: "message".into(),
            entity_id: "00000000-0000-4000-8000-000000000123".into(),
            change_type: "upsert".into(),
            revision: 1,
            snapshot: Some(snapshot),
        }];
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TRIGGER fail_checkpoint BEFORE INSERT ON sync_checkpoints
             BEGIN SELECT RAISE(ABORT, 'checkpoint interrupted'); END;",
        )
        .unwrap();
        drop(conn);
        assert!(apply_pulled_changes(&path, "profile", "user-a", &changes, 1, 100).is_err());
        let conn = Connection::open(&path).unwrap();
        let count: i64 = conn
            .query_row("SELECT count(*) FROM messages", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
        conn.execute_batch("DROP TRIGGER fail_checkpoint;").unwrap();
        drop(conn);

        apply_pulled_changes(&path, "profile", "user-a", &changes, 1, 101).unwrap();
        apply_pulled_changes(&path, "profile", "user-a", &changes, 1, 102).unwrap();
        let conn = Connection::open(&path).unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT count(*) FROM messages WHERE endpoint_id='profile' AND owner_scope='user-a'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(get_sync_checkpoint(&path, "profile", "user-a").unwrap(), 1);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn scoped_message_feed_isolates_accounts_on_the_same_profile() {
        let path = temp_db_path("scoped-feed");
        init_db(&path, None).unwrap();
        for (owner, id, filename) in [
            ("user-a", "message-a", "a.txt"),
            ("user-b", "message-b", "b.txt"),
        ] {
            let message = sample_message(filename, 100, &[], false);
            let operation = NewOutboxOperation {
                operation_id: format!("operation-{owner}"),
                endpoint_id: "endpoint-1".into(),
                owner_scope: owner.into(),
                entity_type: "message".into(),
                entity_id: id.into(),
                action: "upsert".into(),
                base_revision: 0,
                payload_json: "{}".into(),
                payload_hash: format!("hash-{owner}"),
                created_at_ms: 100,
            };
            save_message_and_enqueue(&path, &message, &operation).unwrap();
        }
        let a = list_messages_for_scope(&path, "endpoint-1", "user-a", None, None, false, None)
            .unwrap();
        let b = list_messages_for_scope(&path, "endpoint-1", "user-b", None, None, false, None)
            .unwrap();
        assert_eq!(
            a.iter()
                .map(|item| item.filename.as_str())
                .collect::<Vec<_>>(),
            vec!["a.txt"]
        );
        assert_eq!(
            b.iter()
                .map(|item| item.filename.as_str())
                .collect::<Vec<_>>(),
            vec!["b.txt"]
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn scoped_marked_feed_filters_and_isolates_accounts() {
        let path = temp_db_path("scoped-marked-feed");
        init_db(&path, None).unwrap();
        for (owner, filename, tag_id, due_date, pinned) in [
            ("user-a", "a-pinned.txt", "tag-a", Some("2026-01-01"), true),
            ("user-a", "a-untagged.txt", "", None, false),
            ("user-b", "b.txt", "tag-a", Some("2026-01-01"), false),
        ] {
            let tags = if tag_id.is_empty() {
                vec![]
            } else {
                vec![tag_id]
            };
            let mut message = sample_message(filename, 100, &tags, pinned);
            message.marked_due_date = due_date.map(str::to_string);
            let operation = NewOutboxOperation {
                operation_id: format!("op-{owner}-{filename}"),
                endpoint_id: "profile".into(),
                owner_scope: owner.into(),
                entity_type: "message".into(),
                entity_id: format!("id-{owner}-{filename}"),
                action: "upsert".into(),
                base_revision: 0,
                payload_json: "{}".into(),
                payload_hash: format!("hash-{owner}-{filename}"),
                created_at_ms: 1,
            };
            message.endpoint_id = "profile".into();
            save_message_and_enqueue(&path, &message, &operation).unwrap();
        }
        assert_eq!(
            list_marked_messages_for_scope(
                &path,
                "profile",
                "user-a",
                Some("tag-a"),
                Some("pinned"),
                None,
                None,
                Some("2026-12-31"),
            )
            .unwrap()
            .iter()
            .map(|message| message.filename.as_str())
            .collect::<Vec<_>>(),
            vec!["a-pinned.txt"]
        );
        assert_eq!(
            count_marked_messages_for_scope(
                &path,
                "profile",
                "user-a",
                Some(UNTAGGED_MARKED_TAG_FILTER_ID),
                None,
                None,
            )
            .unwrap(),
            1
        );
        assert_eq!(
            count_marked_messages_for_scope(&path, "profile", "user-b", None, None, None).unwrap(),
            1
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn tag_delete_waits_for_message_cleanup_and_rebases_followup_changes() {
        let path = temp_db_path("tag-delete-dependency");
        init_db(&path, None).unwrap();
        let mut message = sample_message("marked.txt", 100, &["tag-a"], false);
        message.endpoint_id = "profile".into();
        let seed = NewOutboxOperation {
            operation_id: "seed-message".into(),
            endpoint_id: "profile".into(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: "message-a".into(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: "{}".into(),
            payload_hash: "seed-hash".into(),
            created_at_ms: 1,
        };
        save_message_and_enqueue(&path, &message, &seed).unwrap();
        let seed_claim =
            claim_outbox_operations(&path, "profile", "user-a", "worker", 2, 30_000, 1, true)
                .unwrap();
        apply_outbox_success(&path, &seed_claim[0], "worker", 3, 3).unwrap();
        let tag = MarkedTag {
            id: "tag-a".into(),
            name: "A".into(),
        };
        let tag_create = NewOutboxOperation {
            operation_id: "tag-create".into(),
            endpoint_id: "profile".into(),
            owner_scope: "user-a".into(),
            entity_type: "tag".into(),
            entity_id: "tag-a".into(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: "{}".into(),
            payload_hash: "tag-create-hash".into(),
            created_at_ms: 4,
        };
        save_tag_and_enqueue(&path, "profile", "user-a", &tag, 0, None, &tag_create).unwrap();
        let tag_claim =
            claim_outbox_operations(&path, "profile", "user-a", "worker", 5, 30_000, 1, true)
                .unwrap();
        apply_outbox_success(&path, &tag_claim[0], "worker", 1, 6).unwrap();

        let cleanup = NewOutboxOperation {
            operation_id: "message-cleanup".into(),
            endpoint_id: "profile".into(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: "message-a".into(),
            action: "upsert".into(),
            base_revision: 3,
            payload_json: "{}".into(),
            payload_hash: "cleanup-hash".into(),
            created_at_ms: 7,
        };
        let delete = NewOutboxOperation {
            operation_id: "tag-delete".into(),
            endpoint_id: "profile".into(),
            owner_scope: "user-a".into(),
            entity_type: "tag".into(),
            entity_id: "tag-a".into(),
            action: "delete".into(),
            base_revision: 1,
            payload_json: "{}".into(),
            payload_hash: "tag-delete-hash".into(),
            created_at_ms: 7,
        };
        delete_tag_cleanup_messages_and_enqueue(
            &path,
            "profile",
            "user-a",
            &tag,
            1,
            7,
            &[("marked.txt".into(), Vec::new(), cleanup)],
            &delete,
        )
        .unwrap();
        let first =
            claim_outbox_operations(&path, "profile", "user-a", "worker", 8, 30_000, 1, true)
                .unwrap();
        assert_eq!(first[0].operation_id, "message-cleanup");
        assert!(
            claim_outbox_operations(&path, "profile", "user-a", "other", 8, 30_000, 1, true,)
                .unwrap()
                .is_empty()
        );
        apply_outbox_success(&path, &first[0], "worker", 4, 9).unwrap();
        let second =
            claim_outbox_operations(&path, "profile", "user-a", "worker", 10, 30_000, 1, true)
                .unwrap();
        assert_eq!(second[0].operation_id, "tag-delete");
        let stored = get_message_for_scope(&path, "profile", "user-a", "marked.txt")
            .unwrap()
            .unwrap();
        assert!(stored.marked_tag_ids.is_empty());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn orphan_cleanup_candidates_exclude_referenced_and_pending_objects() {
        let path = temp_db_path("orphan-candidates");
        init_db(&path, None).unwrap();
        let conn = Connection::open(&path).unwrap();
        for (id, state, deleted) in [
            ("safe", "uploaded", Some(10)),
            ("pending", "uploaded", Some(10)),
            ("referenced", "uploaded", None),
            ("uploading", "uploading", Some(10)),
        ] {
            conn.execute(
                "INSERT INTO attachment_sync(endpoint_id,owner_scope,attachment_id,message_id,
                 original_name,object_path,size,upload_state,deleted_at_ms,updated_at_ms)
                 VALUES('profile','user-a',?1,'message','x.bin',?2,1,?3,?4,10)",
                params![id, format!("user/space/{id}/x.bin"), state, deleted],
            )
            .unwrap();
        }
        conn.execute(
            "INSERT INTO sync_outbox(operation_id,endpoint_id,owner_scope,entity_type,entity_id,
             action,payload_json,payload_hash,state,created_at_ms,updated_at_ms)
             VALUES('op','profile','user-a','attachment','pending','upsert','{}','hash','pending',10,10)",
            [],
        ).unwrap();
        drop(conn);
        let candidates =
            list_orphan_attachment_candidates(&path, "profile", "user-a", 20, 50).unwrap();
        assert_eq!(
            candidates,
            vec![OrphanAttachmentCandidate {
                attachment_id: "safe".into(),
                object_path: "user/space/safe/x.bin".into(),
                preview_object_path: None,
            }]
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn repairs_claimed_legacy_attachment_path_atomically() {
        let path = temp_db_path("repair-legacy-attachment-path");
        init_db(&path, None).unwrap();
        let local_path = path.with_extension("bin");
        std::fs::write(&local_path, b"attachment").unwrap();
        let conn = Connection::open(&path).unwrap();
        conn.execute(
            "INSERT INTO messages(endpoint_id,filename,sender,timestamp_ms,size,kind,original_name,
             local_path,remote_path,message_id,owner_scope,sync_state)
             VALUES('profile','message','sender',1,10,'file','file.txt',?1,?2,'message-id','user-a','pending')",
            params![local_path.to_string_lossy(), "user-a//attachment-id/file.txt"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO attachment_sync(endpoint_id,owner_scope,attachment_id,message_id,original_name,
             local_path,object_path,size,upload_state,updated_at_ms)
             VALUES('profile','user-a','attachment-id','message-id','file.txt',?1,?2,10,'local',1)",
            params![local_path.to_string_lossy(), "user-a//attachment-id/file.txt"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sync_outbox(operation_id,endpoint_id,owner_scope,entity_type,entity_id,action,
             payload_json,payload_hash,state,lease_owner,created_at_ms,updated_at_ms)
             VALUES('operation','profile','user-a','attachment','attachment-id','upsert',
             '{\"objectPath\":\"user-a//attachment-id/file.txt\"}','old','sending','worker',1,1)",
            [],
        )
        .unwrap();
        drop(conn);

        let repaired_path = "user-a/space-id/attachment-id/file.txt";
        assert!(repair_claimed_attachment_object_path(
            &path,
            "operation",
            "worker",
            "profile",
            "user-a",
            "attachment-id",
            repaired_path,
            "{\"objectPath\":\"user-a/space-id/attachment-id/file.txt\"}",
            "new",
            2,
        )
        .unwrap());

        let conn = Connection::open(&path).unwrap();
        let attachment_path: String = conn
            .query_row(
                "SELECT object_path FROM attachment_sync WHERE attachment_id='attachment-id'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let message_path: String = conn
            .query_row(
                "SELECT remote_path FROM messages WHERE message_id='message-id'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let outbox: (String, String) = conn
            .query_row(
                "SELECT payload_hash,last_error FROM sync_outbox WHERE operation_id='operation'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            (attachment_path.as_str(), message_path.as_str()),
            (repaired_path, repaired_path)
        );
        assert_eq!(outbox, ("new".into(), String::new()));
        drop(conn);
        let _ = std::fs::remove_file(local_path);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn account_scoped_business_keys_allow_same_filename_and_tag_across_users() {
        let path = temp_db_path("account-scoped-business-keys");
        init_db(&path, None).expect("initialize database");
        for owner in ["user-a", "user-b"] {
            let message = sample_message("same.txt", 100, &[], false);
            let operation = NewOutboxOperation {
                operation_id: format!("operation-{owner}"),
                endpoint_id: message.endpoint_id.clone(),
                owner_scope: owner.into(),
                entity_type: "message".into(),
                entity_id: format!("message-{owner}"),
                action: "upsert".into(),
                base_revision: 0,
                payload_json: "{}".into(),
                payload_hash: format!("hash-{owner}"),
                created_at_ms: 100,
            };
            save_message_and_enqueue(&path, &message, &operation).unwrap();
            let tag = MarkedTag {
                id: "same-tag".into(),
                name: owner.into(),
            };
            let tag_operation = NewOutboxOperation {
                operation_id: format!("tag-operation-{owner}"),
                entity_type: "tag".into(),
                entity_id: tag.id.clone(),
                payload_hash: format!("tag-hash-{owner}"),
                ..operation
            };
            save_tag_and_enqueue(&path, "endpoint-1", owner, &tag, 0, None, &tag_operation)
                .unwrap();
        }
        assert_eq!(
            list_messages_for_scope(&path, "endpoint-1", "user-a", None, None, false, None)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            list_messages_for_scope(&path, "endpoint-1", "user-b", None, None, false, None)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            list_tags_for_scope(&path, "endpoint-1", "user-a").unwrap()[0]
                .0
                .name,
            "user-a"
        );
        assert_eq!(
            list_tags_for_scope(&path, "endpoint-1", "user-b").unwrap()[0]
                .0
                .name,
            "user-b"
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn storage_import_batch_resumes_without_duplicate_business_or_outbox_rows() {
        let path = temp_db_path("storage-import-resume");
        init_db(&path, None).expect("initialize database");
        let item = StorageImportItem {
            item_type: "message".into(),
            source_key: "source.txt".into(),
            entity_id: "00000000-0000-5000-8000-000000000001".into(),
            attachment_id: None,
            message_operation_id: "00000000-0000-5000-8000-000000000002".into(),
            attachment_operation_id: None,
            state: "pending".into(),
            source_revision: Some("etag-a".into()),
            source_hash: Some("source-hash".into()),
            total_bytes: 12,
            transferred_bytes: 0,
            last_error: None,
        };
        let batch = NewStorageImportBatch {
            batch_id: "batch",
            source_profile_id: "source",
            target_profile_id: "target",
            source_provider_kind: "webdav",
            target_provider_kind: "supabase",
            source_owner_scope: "",
            target_owner_scope: "user-a",
            items: std::slice::from_ref(&item),
            now_ms: 100,
        };
        create_or_resume_storage_import(&path, &batch).unwrap();
        assert!(mark_storage_transfer_running(&path, "batch", 100).unwrap());
        let mut message = sample_message("source.txt", 100, &[], false);
        message.endpoint_id = "target".into();
        let operation = NewOutboxOperation {
            operation_id: item.message_operation_id.clone(),
            endpoint_id: "target".into(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: item.entity_id.clone(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: "{}".into(),
            payload_hash: "hash".into(),
            created_at_ms: 100,
        };
        apply_imported_message(
            &path,
            "batch",
            &item.source_key,
            &message,
            &operation,
            None,
            101,
        )
        .unwrap();
        let staged = get_storage_import_progress(&path, "batch")
            .unwrap()
            .unwrap();
        assert_eq!(
            (staged.status.as_str(), staged.applied_items),
            ("running", 0)
        );
        let claimed = claim_storage_import_outbox_operations(
            &path, "target", "user-a", "batch", "worker", 102, 30_000, 1,
        )
        .unwrap();
        assert_eq!(claimed.len(), 1);
        mark_storage_import_operation_error(
            &path,
            &claimed[0].operation_id,
            "temporary upload failure",
            103,
        )
        .unwrap();
        let failed = get_storage_import_progress(&path, "batch")
            .unwrap()
            .unwrap();
        assert_eq!(failed.status, "error");
        assert_eq!(
            failed.last_error.as_deref(),
            Some("temporary upload failure")
        );
        apply_outbox_success(&path, &claimed[0], "worker", 1, 104).unwrap();
        assert!(mark_storage_transfer_completed(&path, "batch", 105).unwrap());
        let completed = get_storage_import_progress(&path, "batch")
            .unwrap()
            .unwrap();
        assert_eq!(
            (completed.status.as_str(), completed.applied_items),
            ("completed", 1)
        );
        assert_eq!(completed.last_error, None);
        create_or_resume_storage_import(
            &path,
            &NewStorageImportBatch {
                now_ms: 200,
                ..batch
            },
        )
        .unwrap();
        assert!(
            list_storage_import_items(&path, "batch", &["pending", "error"])
                .unwrap()
                .is_empty()
        );
        let conn = Connection::open(&path).unwrap();
        let counts = (
            conn.query_row(
                "SELECT count(*) FROM messages WHERE endpoint_id='target' AND owner_scope='user-a'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap(),
            conn.query_row(
                "SELECT count(*) FROM sync_outbox WHERE operation_id=?1",
                [item.message_operation_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap(),
        );
        assert_eq!(counts, (1, 1));
        assert_eq!(count_pending_import_outbox(&path, "batch").unwrap(), 0);
        assert_eq!(count_import_conflicts(&path, "batch").unwrap(), 0);
        let source_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM messages WHERE endpoint_id='source'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(source_count, 0);
        drop(conn);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn imported_message_replaces_legacy_filename_for_same_message_id() {
        let path = temp_db_path("storage-import-message-id");
        init_db(&path, None).expect("initialize database");

        let mut existing = sample_message("legacy-name.txt", 100, &[], false);
        existing.endpoint_id = "target".into();
        let existing_operation = NewOutboxOperation {
            operation_id: "existing-operation".into(),
            endpoint_id: "target".into(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: "stable-message-id".into(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: "{}".into(),
            payload_hash: "existing-hash".into(),
            created_at_ms: 1,
        };
        save_message_and_enqueue(&path, &existing, &existing_operation).unwrap();
        let claimed =
            claim_outbox_operations(&path, "target", "user-a", "worker", 2, 30_000, 1, false)
                .unwrap();
        apply_outbox_success(&path, &claimed[0], "worker", 7, 3).unwrap();

        let item = StorageTransferItem {
            item_type: "message".into(),
            source_key: "source-name.txt".into(),
            entity_id: "stable-message-id".into(),
            attachment_id: None,
            message_operation_id: "replacement-operation".into(),
            attachment_operation_id: None,
            state: "pending".into(),
            source_revision: None,
            source_hash: Some("replacement-hash".into()),
            total_bytes: 0,
            transferred_bytes: 0,
            last_error: None,
        };
        create_or_resume_storage_transfer(
            &path,
            &NewStorageTransferBatch {
                batch_id: "batch",
                source_profile_id: "source",
                target_profile_id: "target",
                source_provider_kind: "webdav",
                target_provider_kind: "supabase",
                source_owner_scope: "",
                target_owner_scope: "user-a",
                items: std::slice::from_ref(&item),
                now_ms: 4,
            },
        )
        .unwrap();
        assert!(mark_storage_transfer_running(&path, "batch", 5).unwrap());

        let mut replacement = sample_message("normalized-name.txt", 200, &[], false);
        replacement.endpoint_id = "target".into();
        replacement.content = Some("replacement content".into());
        let replacement_operation = NewOutboxOperation {
            operation_id: item.message_operation_id.clone(),
            endpoint_id: "target".into(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: item.entity_id.clone(),
            action: "upsert".into(),
            base_revision: 7,
            payload_json: "{}".into(),
            payload_hash: "replacement-hash".into(),
            created_at_ms: 6,
        };
        apply_imported_message(
            &path,
            "batch",
            &item.source_key,
            &replacement,
            &replacement_operation,
            None,
            6,
        )
        .unwrap();

        let conn = Connection::open(&path).unwrap();
        let messages = conn
            .prepare(
                "SELECT filename,message_id,remote_revision,content FROM messages
                 WHERE endpoint_id='target' AND owner_scope='user-a'",
            )
            .unwrap()
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(
            messages,
            vec![(
                "normalized-name.txt".into(),
                "stable-message-id".into(),
                7,
                Some("replacement content".into()),
            )]
        );
        let pending_base_revision: i64 = conn
            .query_row(
                "SELECT base_revision FROM sync_outbox WHERE operation_id='replacement-operation'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pending_base_revision, 7);
        drop(conn);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn imported_attachment_waits_for_message_and_repairs_missing_remote_message() {
        let path = temp_db_path("storage-import-attachment-dependency");
        init_db(&path, None).unwrap();
        let item = StorageTransferItem {
            item_type: "message".into(),
            source_key: "source.bin".into(),
            entity_id: "message-id".into(),
            attachment_id: Some("attachment-id".into()),
            message_operation_id: "message-operation".into(),
            attachment_operation_id: Some("attachment-operation".into()),
            state: "pending".into(),
            source_revision: None,
            source_hash: Some("hash".into()),
            total_bytes: 12,
            transferred_bytes: 0,
            last_error: None,
        };
        create_or_resume_storage_transfer(
            &path,
            &NewStorageTransferBatch {
                batch_id: "batch",
                source_profile_id: "source",
                target_profile_id: "target",
                source_provider_kind: "webdav",
                target_provider_kind: "supabase",
                source_owner_scope: "",
                target_owner_scope: "user-a",
                items: std::slice::from_ref(&item),
                now_ms: 1,
            },
        )
        .unwrap();
        assert!(mark_storage_transfer_running(&path, "batch", 2).unwrap());
        let mut message = sample_message("target.bin", 100, &[], false);
        message.endpoint_id = "target".into();
        message.local_path = Some("source.bin".into());
        message.remote_path = Some("user-a/space/attachment-id/target.bin".into());
        message.file_hash = Some("hash".into());
        let message_operation = NewOutboxOperation {
            operation_id: item.message_operation_id.clone(),
            endpoint_id: "target".into(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: item.entity_id.clone(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: "{}".into(),
            payload_hash: "message-hash".into(),
            created_at_ms: 3,
        };
        let attachment_operation = NewOutboxOperation {
            operation_id: item.attachment_operation_id.clone().unwrap(),
            endpoint_id: "target".into(),
            owner_scope: "user-a".into(),
            entity_type: "attachment".into(),
            entity_id: item.attachment_id.clone().unwrap(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: "{}".into(),
            payload_hash: "attachment-hash".into(),
            created_at_ms: 3,
        };
        apply_imported_message(
            &path,
            "batch",
            &item.source_key,
            &message,
            &message_operation,
            Some((
                "attachment-id",
                "user-a/space/attachment-id/target.bin",
                None,
                Some("application/octet-stream"),
                &attachment_operation,
            )),
            3,
        )
        .unwrap();

        let conn = Connection::open(&path).unwrap();
        let dependency: Option<String> = conn
            .query_row(
                "SELECT depends_on_operation_id FROM sync_outbox
                 WHERE operation_id='attachment-operation'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(dependency.as_deref(), Some("message-operation"));
        drop(conn);

        let claimed_message = claim_storage_import_outbox_operations(
            &path, "target", "user-a", "batch", "worker", 4, 30_000, 1,
        )
        .unwrap();
        assert_eq!(claimed_message[0].operation_id, "message-operation");
        apply_outbox_success(&path, &claimed_message[0], "worker", 1, 5).unwrap();
        let claimed_attachment = claim_storage_import_outbox_operations(
            &path, "target", "user-a", "batch", "worker", 6, 30_000, 1,
        )
        .unwrap();
        assert_eq!(claimed_attachment[0].operation_id, "attachment-operation");

        let repair_operation = NewOutboxOperation {
            operation_id: "message-repair-operation".into(),
            created_at_ms: 7,
            ..message_operation
        };
        assert!(repair_missing_attachment_message(
            &path,
            "attachment-operation",
            "worker",
            &repair_operation,
            7,
        )
        .unwrap());
        let repaired_message = claim_storage_import_outbox_operations(
            &path, "target", "user-a", "batch", "worker", 8, 30_000, 1,
        )
        .unwrap();
        assert_eq!(repaired_message[0].operation_id, "message-repair-operation");
        assert!(claim_storage_import_outbox_operations(
            &path, "target", "user-a", "batch", "other", 8, 30_000, 1,
        )
        .unwrap()
        .is_empty());
        apply_outbox_success(&path, &repaired_message[0], "worker", 1, 9).unwrap();
        let retried_attachment = claim_storage_import_outbox_operations(
            &path, "target", "user-a", "batch", "worker", 10, 30_000, 1,
        )
        .unwrap();
        assert_eq!(retried_attachment[0].operation_id, "attachment-operation");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn stale_attachment_dependencies_follow_the_resolved_remote_message() {
        let path = temp_db_path("stale-attachment-dependencies");
        init_db(&path, None).unwrap();
        let conn = Connection::open(&path).unwrap();
        for (suffix, deleted_at_ms) in [("active", None), ("deleted", Some(50))] {
            conn.execute(
                "INSERT INTO messages(endpoint_id,filename,sender,timestamp_ms,size,kind,original_name,
                 message_id,remote_revision,deleted_at_ms,sync_state,owner_scope)
                 VALUES('profile',?1,'sender',1,1,'file',?1,?2,2,?3,'synced','user-a')",
                params![format!("{suffix}.bin"), format!("message-{suffix}"), deleted_at_ms],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO attachment_sync(endpoint_id,owner_scope,attachment_id,message_id,
                 original_name,object_path,size,upload_state,updated_at_ms)
                 VALUES('profile','user-a',?1,?2,?3,?4,1,'pending_metadata',1)",
                params![
                    format!("attachment-{suffix}"),
                    format!("message-{suffix}"),
                    format!("{suffix}.bin"),
                    format!("user/space/attachment-{suffix}/{suffix}.bin")
                ],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO sync_outbox(operation_id,endpoint_id,owner_scope,entity_type,entity_id,
                 action,payload_json,payload_hash,state,last_error,created_at_ms,updated_at_ms)
                 VALUES(?1,'profile','user-a','message',?2,'upsert','{}','message-hash',
                 'superseded','revision conflict',1,1)",
                params![format!("message-operation-{suffix}"), format!("message-{suffix}")],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO sync_outbox(operation_id,endpoint_id,owner_scope,entity_type,entity_id,
                 action,payload_json,payload_hash,depends_on_operation_id,state,last_error,created_at_ms,updated_at_ms)
                 VALUES(?1,'profile','user-a','attachment',?2,'upsert',?3,'attachment-hash',?4,
                 'pending','关联消息缺失，正在先恢复消息',2,2)",
                params![
                    format!("attachment-operation-{suffix}"),
                    format!("attachment-{suffix}"),
                    format!(r#"{{"messageId":"message-{suffix}"}}"#),
                    format!("message-operation-{suffix}")
                ],
            )
            .unwrap();
        }
        drop(conn);

        assert_eq!(
            repair_stale_attachment_dependencies(&path, "profile", "user-a", 100).unwrap(),
            2
        );
        let active = get_outbox_operation(&path, "attachment-operation-active")
            .unwrap()
            .unwrap();
        assert_eq!(active.state, "pending");
        assert_eq!(active.depends_on_operation_id, None);
        assert_eq!(active.last_error, None);
        let deleted = get_outbox_operation(&path, "attachment-operation-deleted")
            .unwrap()
            .unwrap();
        assert_eq!(deleted.state, "superseded");
        let conn = Connection::open(&path).unwrap();
        let deleted_at_ms: Option<i64> = conn
            .query_row(
                "SELECT deleted_at_ms FROM attachment_sync
                 WHERE endpoint_id='profile' AND owner_scope='user-a'
                   AND attachment_id='attachment-deleted'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(deleted_at_ms, Some(100));
        drop(conn);
        let claimed =
            claim_outbox_operations(&path, "profile", "user-a", "worker", 101, 30_000, 1, true)
                .unwrap();
        assert_eq!(claimed[0].operation_id, "attachment-operation-active");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn duplicate_tag_reconciliation_supersedes_old_operation_and_rewrites_messages() {
        let path = temp_db_path("duplicate-tag-reconcile");
        init_db(&path, None).expect("initialize database");
        let tag_item = StorageTransferItem {
            item_type: "tag".into(),
            source_key: "source-tag".into(),
            entity_id: "generated-tag".into(),
            attachment_id: None,
            message_operation_id: "tag-operation".into(),
            attachment_operation_id: None,
            state: "pending".into(),
            source_revision: None,
            source_hash: None,
            total_bytes: 0,
            transferred_bytes: 0,
            last_error: None,
        };
        create_or_resume_storage_transfer(
            &path,
            &NewStorageTransferBatch {
                batch_id: "batch",
                source_profile_id: "source",
                target_profile_id: "target",
                source_provider_kind: "webdav",
                target_provider_kind: "supabase",
                source_owner_scope: "",
                target_owner_scope: "user-a",
                items: std::slice::from_ref(&tag_item),
                now_ms: 1,
            },
        )
        .unwrap();
        let tag_operation = NewOutboxOperation {
            operation_id: "tag-operation".into(),
            endpoint_id: "target".into(),
            owner_scope: "user-a".into(),
            entity_type: "tag".into(),
            entity_id: "generated-tag".into(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: r#"{"name":"Important"}"#.into(),
            payload_hash: "tag-hash".into(),
            created_at_ms: 2,
        };
        apply_imported_tag(
            &path,
            "batch",
            "source-tag",
            "target",
            "user-a",
            &MarkedTag {
                id: "generated-tag".into(),
                name: "Important".into(),
            },
            &tag_operation,
            2,
        )
        .unwrap();
        let message_operation = NewOutboxOperation {
            operation_id: "message-operation".into(),
            endpoint_id: "target".into(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: "message-id".into(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: r#"{"markedTagIds":["generated-tag"]}"#.into(),
            payload_hash: "message-hash".into(),
            created_at_ms: 3,
        };
        let conn = Connection::open(&path).unwrap();
        enqueue_outbox(&conn, &message_operation).unwrap();
        conn.execute(
            "UPDATE sync_outbox SET state='sending',lease_owner='worker' WHERE operation_id='tag-operation'",
            [],
        )
        .unwrap();
        drop(conn);

        reconcile_duplicate_tag_operation(
            &path,
            &OutboxOperation {
                operation_id: "tag-operation".into(),
                endpoint_id: "target".into(),
                owner_scope: "user-a".into(),
                entity_type: "tag".into(),
                entity_id: "generated-tag".into(),
                action: "upsert".into(),
                base_revision: 0,
                payload_json: tag_operation.payload_json.clone(),
                payload_hash: tag_operation.payload_hash.clone(),
                depends_on_operation_id: None,
                state: "sending".into(),
                attempt_count: 1,
                next_attempt_at_ms: 0,
                lease_owner: Some("worker".into()),
                lease_expires_at_ms: None,
                last_error: None,
                created_at_ms: 2,
                updated_at_ms: 2,
            },
            &MarkedTag {
                id: "remote-tag".into(),
                name: "Important".into(),
            },
            7,
            "worker",
            4,
        )
        .unwrap();

        let conn = Connection::open(&path).unwrap();
        let tag_state: String = conn
            .query_row(
                "SELECT state FROM sync_outbox WHERE operation_id='tag-operation'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tag_state, "superseded");
        let payload: String = conn
            .query_row(
                "SELECT payload_json FROM sync_outbox WHERE operation_id='message-operation'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(payload.contains("remote-tag"));
        assert!(!payload.contains("generated-tag"));
        let item = list_storage_transfer_items(&path, "batch", &["skipped"]).unwrap();
        assert_eq!(item[0].entity_id, "remote-tag");
        assert_eq!(
            list_tags_for_scope(&path, "target", "user-a").unwrap()[0].1,
            7
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn init_db_clears_stale_error_from_completed_storage_import() {
        let dir = std::env::temp_dir().join(format!(
            "transfer-genie-completed-import-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("messages.sqlite");
        init_db(&path, Some("endpoint")).unwrap();
        let conn = Connection::open(&path).unwrap();
        conn.execute(
            "INSERT INTO storage_import_batches(
               batch_id,source_profile_id,target_profile_id,target_owner_scope,status,
               total_items,applied_items,failed_items,last_error,created_at_ms,updated_at_ms
             ) VALUES('batch','source','target','owner','completed',3,3,0,'old failure',1,1)",
            [],
        )
        .unwrap();
        drop(conn);

        init_db(&path, Some("endpoint")).unwrap();

        let progress = get_storage_import_progress(&path, "batch")
            .unwrap()
            .unwrap();
        assert_eq!(progress.status, "completed");
        assert_eq!(progress.last_error, None);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn init_db_migrates_legacy_storage_import_tables_to_transfer_metadata() {
        let dir = std::env::temp_dir().join(format!(
            "transfer-genie-legacy-transfer-schema-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("messages.sqlite");
        init_db(&path, Some("endpoint")).unwrap();
        let conn = Connection::open(&path).unwrap();
        conn.execute(
            "INSERT INTO storage_import_batches(
               batch_id,source_profile_id,target_profile_id,target_owner_scope,status,
               total_items,applied_items,failed_items,last_error,created_at_ms,updated_at_ms
             ) VALUES('legacy','source','target','owner','running',1,0,0,NULL,1,1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO storage_import_items(
               batch_id,item_type,source_key,entity_id,message_operation_id,state,updated_at_ms
             ) VALUES('legacy','message','source.txt','entity','operation','pending',1)",
            [],
        )
        .unwrap();
        drop(conn);

        init_db(&path, Some("endpoint")).unwrap();

        let progress = get_storage_transfer_progress(&path, "legacy")
            .unwrap()
            .expect("legacy batch remains readable");
        assert_eq!(progress.source_provider_kind, "webdav");
        assert_eq!(progress.target_provider_kind, "supabase");
        assert_eq!(progress.source_owner_scope, "");
        assert_eq!(progress.phase, "planning");
        assert_eq!((progress.skipped_items, progress.conflict_items), (0, 0));
        let items = list_storage_transfer_items(&path, "legacy", &["pending"]).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].total_bytes, 0);
        assert_eq!(items[0].transferred_bytes, 0);
        assert_eq!(items[0].last_error, None);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn storage_transfer_plan_tracks_retry_skip_conflict_bytes_and_scope() {
        let path = temp_db_path("storage-transfer-progress");
        init_db(&path, None).expect("initialize database");
        let items = [
            StorageTransferItem {
                item_type: "message".into(),
                source_key: "applied.txt".into(),
                entity_id: "entity-applied".into(),
                attachment_id: None,
                message_operation_id: "operation-applied".into(),
                attachment_operation_id: None,
                state: "pending".into(),
                source_revision: Some("etag-applied".into()),
                source_hash: Some("hash-applied".into()),
                total_bytes: 10,
                transferred_bytes: 0,
                last_error: None,
            },
            StorageTransferItem {
                item_type: "message".into(),
                source_key: "skipped.txt".into(),
                entity_id: "entity-skipped".into(),
                attachment_id: None,
                message_operation_id: "operation-skipped".into(),
                attachment_operation_id: None,
                state: "pending".into(),
                source_revision: Some("etag-skipped".into()),
                source_hash: Some("hash-skipped".into()),
                total_bytes: 20,
                transferred_bytes: 0,
                last_error: None,
            },
            StorageTransferItem {
                item_type: "message".into(),
                source_key: "retry.txt".into(),
                entity_id: "entity-retry".into(),
                attachment_id: None,
                message_operation_id: "operation-retry".into(),
                attachment_operation_id: None,
                state: "pending".into(),
                source_revision: Some("etag-retry".into()),
                source_hash: Some("hash-retry".into()),
                total_bytes: 30,
                transferred_bytes: 0,
                last_error: None,
            },
        ];
        create_or_resume_storage_transfer(
            &path,
            &NewStorageTransferBatch {
                batch_id: "batch-owner-a",
                source_profile_id: "source",
                target_profile_id: "target",
                source_provider_kind: "supabase",
                target_provider_kind: "webdav",
                source_owner_scope: "owner-a",
                target_owner_scope: "",
                items: &items,
                now_ms: 1,
            },
        )
        .unwrap();
        assert!(mark_storage_transfer_running(&path, "batch-owner-a", 2).unwrap());
        create_or_resume_storage_transfer(
            &path,
            &NewStorageTransferBatch {
                batch_id: "batch-owner-b",
                source_profile_id: "source",
                target_profile_id: "target",
                source_provider_kind: "supabase",
                target_provider_kind: "webdav",
                source_owner_scope: "owner-b",
                target_owner_scope: "",
                items: &items,
                now_ms: 2,
            },
        )
        .unwrap();
        update_storage_transfer_item_progress(
            &path,
            "batch-owner-a",
            "message",
            "retry.txt",
            12,
            3,
        )
        .unwrap();
        mark_storage_transfer_item_state(
            &path,
            "batch-owner-a",
            "message",
            "applied.txt",
            "applied",
            None,
            4,
        )
        .unwrap();
        mark_storage_transfer_item_state(
            &path,
            "batch-owner-a",
            "message",
            "skipped.txt",
            "skipped",
            None,
            5,
        )
        .unwrap();
        mark_storage_transfer_item_state(
            &path,
            "batch-owner-a",
            "message",
            "retry.txt",
            "error",
            Some("temporary failure"),
            6,
        )
        .unwrap();
        let failed = get_storage_transfer_progress(&path, "batch-owner-a")
            .unwrap()
            .unwrap();
        assert_eq!(
            (
                failed.status.as_str(),
                failed.applied_items,
                failed.skipped_items,
                failed.failed_items,
                failed.total_bytes,
                failed.transferred_bytes,
            ),
            ("error", 1, 1, 1, 60, 42)
        );
        assert_eq!(
            list_storage_transfer_items(&path, "batch-owner-a", &["error"]).unwrap()[0]
                .last_error
                .as_deref(),
            Some("temporary failure")
        );
        mark_storage_transfer_item_state(
            &path,
            "batch-owner-a",
            "message",
            "retry.txt",
            "applied",
            None,
            7,
        )
        .unwrap();
        assert!(mark_storage_transfer_completed(&path, "batch-owner-a", 8).unwrap());
        let completed = get_storage_transfer_progress(&path, "batch-owner-a")
            .unwrap()
            .unwrap();
        assert_eq!(completed.status, "completed");
        assert_eq!((completed.applied_items, completed.skipped_items), (2, 1));
        assert_eq!(completed.transferred_bytes, completed.total_bytes);
        let untouched = get_storage_transfer_progress(&path, "batch-owner-b")
            .unwrap()
            .unwrap();
        assert_eq!(
            (untouched.status.as_str(), untouched.applied_items),
            ("prepared", 0)
        );
        assert!(has_unfinished_storage_transfers(&path, "source").unwrap());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn storage_transfer_preview_rebuilds_the_current_source_snapshot() {
        let path = temp_db_path("storage-transfer-plan-rebuild");
        init_db(&path, None).expect("initialize database");
        let original = [
            StorageTransferItem {
                item_type: "message".into(),
                source_key: "changed.txt".into(),
                entity_id: "entity-changed".into(),
                attachment_id: None,
                message_operation_id: "operation-old".into(),
                attachment_operation_id: None,
                state: "pending".into(),
                source_revision: Some("revision-old".into()),
                source_hash: Some("hash-old".into()),
                total_bytes: 10,
                transferred_bytes: 0,
                last_error: None,
            },
            StorageTransferItem {
                item_type: "message".into(),
                source_key: "removed.txt".into(),
                entity_id: "entity-removed".into(),
                attachment_id: None,
                message_operation_id: "operation-removed".into(),
                attachment_operation_id: None,
                state: "pending".into(),
                source_revision: Some("revision-removed".into()),
                source_hash: Some("hash-removed".into()),
                total_bytes: 20,
                transferred_bytes: 0,
                last_error: None,
            },
        ];
        create_or_resume_storage_transfer(
            &path,
            &NewStorageTransferBatch {
                batch_id: "batch",
                source_profile_id: "source",
                target_profile_id: "target",
                source_provider_kind: "webdav",
                target_provider_kind: "supabase",
                source_owner_scope: "",
                target_owner_scope: "owner",
                items: &original,
                now_ms: 1,
            },
        )
        .unwrap();
        mark_storage_transfer_item_state(
            &path,
            "batch",
            "message",
            "changed.txt",
            "applied",
            None,
            2,
        )
        .unwrap();
        mark_storage_transfer_item_state(
            &path,
            "batch",
            "message",
            "removed.txt",
            "applied",
            None,
            2,
        )
        .unwrap();
        assert!(mark_storage_transfer_running(&path, "batch", 2).unwrap());
        assert!(mark_storage_transfer_completed(&path, "batch", 3).unwrap());

        let rebuilt = [
            StorageTransferItem {
                item_type: "message".into(),
                source_key: "changed.txt".into(),
                entity_id: "entity-changed".into(),
                attachment_id: None,
                message_operation_id: "operation-new".into(),
                attachment_operation_id: None,
                state: "pending".into(),
                source_revision: Some("revision-new".into()),
                source_hash: Some("hash-new".into()),
                total_bytes: 12,
                transferred_bytes: 0,
                last_error: None,
            },
            StorageTransferItem {
                item_type: "message".into(),
                source_key: "same.txt".into(),
                entity_id: "entity-same".into(),
                attachment_id: None,
                message_operation_id: "operation-same".into(),
                attachment_operation_id: None,
                state: "skipped".into(),
                source_revision: Some("revision-same".into()),
                source_hash: Some("hash-same".into()),
                total_bytes: 8,
                transferred_bytes: 0,
                last_error: None,
            },
        ];
        let preview = create_or_resume_storage_transfer(
            &path,
            &NewStorageTransferBatch {
                batch_id: "batch",
                source_profile_id: "source",
                target_profile_id: "target",
                source_provider_kind: "webdav",
                target_provider_kind: "supabase",
                source_owner_scope: "",
                target_owner_scope: "owner",
                items: &rebuilt,
                now_ms: 4,
            },
        )
        .unwrap();
        assert_eq!(
            (
                preview.status.as_str(),
                preview.total_items,
                preview.applied_items,
                preview.skipped_items,
                preview.total_bytes,
            ),
            ("prepared", 2, 0, 1, 20)
        );
        let pending = list_storage_transfer_items(&path, "batch", &["pending"]).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].source_key, "changed.txt");
        assert_eq!(pending[0].source_revision.as_deref(), Some("revision-new"));
        assert_eq!(pending[0].message_operation_id, "operation-new");
        assert_eq!(pending[0].transferred_bytes, 0);
        let skipped = list_storage_transfer_items(&path, "batch", &["skipped"]).unwrap();
        assert_eq!(skipped.len(), 1);
        assert_eq!(skipped[0].source_key, "same.txt");
        assert!(list_storage_transfer_items(&path, "batch", &["applied"])
            .unwrap()
            .is_empty());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn pending_profile_work_blocks_only_profiles_with_unfinished_state() {
        let path = temp_db_path("pending-profile-work");
        init_db(&path, None).expect("initialize database");
        assert!(!has_pending_profile_work(&path, "clean").unwrap());
        let conn = Connection::open(&path).unwrap();
        conn.execute(
            "INSERT INTO storage_import_batches(
               batch_id,source_profile_id,target_profile_id,target_owner_scope,status,
               total_items,applied_items,failed_items,created_at_ms,updated_at_ms
             ) VALUES('pending','source','target','', 'running',1,0,0,1,1)",
            [],
        )
        .unwrap();
        drop(conn);
        assert!(has_pending_profile_work(&path, "source").unwrap());
        assert!(has_pending_profile_work(&path, "target").unwrap());
        assert!(!has_pending_profile_work(&path, "clean").unwrap());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn abandoning_profile_work_supersedes_operations_resolves_conflicts_and_cancels_transfers() {
        let path = temp_db_path("abandon-profile-work");
        init_db(&path, None).expect("initialize database");
        let conn = Connection::open(&path).unwrap();
        conn.execute(
            "INSERT INTO sync_outbox (operation_id,endpoint_id,owner_scope,entity_type,entity_id,
             action,base_revision,payload_json,payload_hash,state,attempt_count,next_attempt_at_ms,
             created_at_ms,updated_at_ms)
             VALUES('operation','profile','owner','message','message','upsert',0,'{}','hash',
             'pending',0,0,1,1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sync_conflicts (endpoint_id,owner_scope,entity_type,entity_id,
             local_payload_json,local_revision,status,created_at_ms)
             VALUES('profile','owner','message','message','{}',0,'unresolved',1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO storage_import_batches (batch_id,source_profile_id,target_profile_id,
             target_owner_scope,status,total_items,applied_items,failed_items,created_at_ms,updated_at_ms)
             VALUES('batch','profile','target','owner','running',1,0,0,1,1)",
            [],
        )
        .unwrap();
        drop(conn);

        abandon_profile_work(&path, "profile", 10).unwrap();

        let conn = Connection::open(&path).unwrap();
        let outbox_state: String = conn
            .query_row(
                "SELECT state FROM sync_outbox WHERE operation_id='operation'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let conflict_status: String = conn
            .query_row(
                "SELECT status FROM sync_conflicts WHERE endpoint_id='profile'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let transfer_status: String = conn
            .query_row(
                "SELECT status FROM storage_import_batches WHERE batch_id='batch'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(outbox_state, "superseded");
        assert_eq!(conflict_status, "abandoned");
        assert_eq!(transfer_status, "cancelled");
        assert!(!has_pending_profile_work(&path, "profile").unwrap());
        assert!(storage_transfer_is_cancelled(&path, "batch").unwrap());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn profile_business_data_detects_cached_messages_without_affecting_clean_profiles() {
        let path = temp_db_path("profile-business-data");
        init_db(&path, None).expect("initialize database");
        assert!(!has_profile_business_data(&path, "profile").unwrap());
        let mut message = sample_message("cached.txt", 100, &[], false);
        message.endpoint_id = "profile".into();
        upsert_message(&path, &message).unwrap();
        assert!(has_profile_business_data(&path, "profile").unwrap());
        assert!(!has_profile_business_data(&path, "other").unwrap());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn resetting_profile_destination_clears_only_that_profiles_local_state() {
        let path = temp_db_path("reset-profile-destination");
        init_db(&path, None).expect("initialize database");
        for profile_id in ["profile", "other"] {
            let mut message = sample_message(&format!("{profile_id}.txt"), 100, &[], false);
            message.endpoint_id = profile_id.into();
            upsert_message(&path, &message).unwrap();
        }
        let conn = Connection::open(&path).unwrap();
        conn.execute(
            "INSERT INTO sync_checkpoints(endpoint_id,owner_scope,change_seq,updated_at_ms)
             VALUES('profile','owner',9,1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO supabase_history_cursors(endpoint_id,owner_scope,initialized,updated_at_ms)
             VALUES('profile','owner',1,1)",
            [],
        )
        .unwrap();
        drop(conn);

        reset_profile_local_state_for_destination_change(&path, "profile").unwrap();

        assert!(!has_profile_business_data(&path, "profile").unwrap());
        assert!(has_profile_business_data(&path, "other").unwrap());
        assert_eq!(get_sync_checkpoint(&path, "profile", "owner").unwrap(), 0);
        assert!(
            !get_supabase_history_cursor(&path, "profile", "owner")
                .unwrap()
                .initialized
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn latest_storage_transfer_progress_survives_database_reopen() {
        let path = temp_db_path("latest-storage-transfer");
        init_db(&path, None).expect("initialize database");
        let item = StorageTransferItem {
            item_type: "message".into(),
            source_key: "latest.txt".into(),
            entity_id: "latest-entity".into(),
            attachment_id: None,
            message_operation_id: "latest-operation".into(),
            attachment_operation_id: None,
            state: "pending".into(),
            source_revision: None,
            source_hash: Some("hash".into()),
            total_bytes: 64,
            transferred_bytes: 0,
            last_error: None,
        };
        create_or_resume_storage_transfer(
            &path,
            &NewStorageTransferBatch {
                batch_id: "latest-batch",
                source_profile_id: "source",
                target_profile_id: "target",
                source_provider_kind: "webdav",
                target_provider_kind: "supabase",
                source_owner_scope: "",
                target_owner_scope: "owner",
                items: std::slice::from_ref(&item),
                now_ms: 10,
            },
        )
        .unwrap();
        drop(Connection::open(&path).unwrap());
        let latest = get_latest_storage_transfer_progress(&path)
            .unwrap()
            .expect("latest transfer persists");
        assert_eq!(latest.batch_id, "latest-batch");
        assert_eq!((latest.total_items, latest.total_bytes), (1, 64));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn storage_transfer_recovery_separates_prepared_interrupted_and_cancelled_runs() {
        let path = temp_db_path("storage-transfer-recovery");
        init_db(&path, None).expect("initialize database");
        let item = StorageTransferItem {
            item_type: "message".into(),
            source_key: "pending.txt".into(),
            entity_id: "pending-entity".into(),
            attachment_id: None,
            message_operation_id: "pending-operation".into(),
            attachment_operation_id: None,
            state: "pending".into(),
            source_revision: None,
            source_hash: None,
            total_bytes: 64,
            transferred_bytes: 0,
            last_error: None,
        };
        for (batch_id, target_profile_id, now_ms) in [
            ("ghost-planning", "target-a", 1),
            ("ghost-running", "target-b", 2),
        ] {
            create_or_resume_storage_transfer(
                &path,
                &NewStorageTransferBatch {
                    batch_id,
                    source_profile_id: "source",
                    target_profile_id,
                    source_provider_kind: "webdav",
                    target_provider_kind: "supabase",
                    source_owner_scope: "",
                    target_owner_scope: "owner",
                    items: std::slice::from_ref(&item),
                    now_ms,
                },
            )
            .unwrap();
        }
        let conn = Connection::open(&path).unwrap();
        conn.execute(
            "UPDATE storage_import_batches SET status='running',phase='planning' WHERE batch_id='ghost-planning'",
            [],
        )
        .unwrap();
        conn.execute(
            "UPDATE storage_import_batches SET status='running',phase='transferring',transferred_bytes=16 WHERE batch_id='ghost-running'",
            [],
        )
        .unwrap();
        drop(conn);

        assert_eq!(recover_storage_transfer_runs(&path, 10).unwrap(), 2);
        let prepared = get_storage_transfer_progress(&path, "ghost-planning")
            .unwrap()
            .unwrap();
        assert_eq!(
            (prepared.status.as_str(), prepared.phase.as_str()),
            ("prepared", "prepared")
        );
        let interrupted = get_storage_transfer_progress(&path, "ghost-running")
            .unwrap()
            .unwrap();
        assert_eq!(
            (interrupted.status.as_str(), interrupted.phase.as_str()),
            ("interrupted", "interrupted")
        );
        assert!(cancel_storage_transfer(&path, "ghost-running", 11).unwrap());
        let cancelled = get_storage_transfer_progress(&path, "ghost-running")
            .unwrap()
            .unwrap();
        assert_eq!(
            (cancelled.status.as_str(), cancelled.phase.as_str()),
            ("cancelled", "cancelled")
        );
        assert_eq!(
            get_latest_resumable_storage_transfer_progress(&path)
                .unwrap()
                .unwrap()
                .batch_id,
            "ghost-planning"
        );
        assert!(mark_storage_transfer_running(&path, "ghost-planning", 12).unwrap());
        assert!(!cancel_storage_transfer(&path, "ghost-planning", 13).unwrap());
        assert!(mark_storage_transfer_interrupted(
            &path,
            "ghost-planning",
            "network interrupted",
            14,
        )
        .unwrap());
        let resumable = get_latest_resumable_storage_transfer_progress(&path)
            .unwrap()
            .unwrap();
        assert_eq!(
            (resumable.status.as_str(), resumable.phase.as_str()),
            ("interrupted", "interrupted")
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn cancelling_storage_transfer_supersedes_unsent_outbox_and_removes_staged_rows() {
        let path = temp_db_path("storage-transfer-cancel-outbox");
        init_db(&path, None).expect("initialize database");
        let item = StorageTransferItem {
            item_type: "message".into(),
            source_key: "source.bin".into(),
            entity_id: "message-transfer-id".into(),
            attachment_id: Some("attachment-transfer-id".into()),
            message_operation_id: "message-transfer-operation".into(),
            attachment_operation_id: Some("attachment-transfer-operation".into()),
            state: "pending".into(),
            source_revision: Some("revision".into()),
            source_hash: Some("hash".into()),
            total_bytes: 12,
            transferred_bytes: 0,
            last_error: None,
        };
        create_or_resume_storage_transfer(
            &path,
            &NewStorageTransferBatch {
                batch_id: "batch",
                source_profile_id: "source",
                target_profile_id: "target",
                source_provider_kind: "webdav",
                target_provider_kind: "supabase",
                source_owner_scope: "",
                target_owner_scope: "user-a",
                items: std::slice::from_ref(&item),
                now_ms: 1,
            },
        )
        .unwrap();
        assert!(mark_storage_transfer_running(&path, "batch", 2).unwrap());

        let mut message = sample_message("target.bin", 100, &[], false);
        message.endpoint_id = "target".into();
        message.local_path = Some("staged.bin".into());
        message.remote_path = Some("user-a/space/attachment-transfer-id/target.bin".into());
        message.file_hash = Some("hash".into());
        let message_operation = NewOutboxOperation {
            operation_id: item.message_operation_id.clone(),
            endpoint_id: "target".into(),
            owner_scope: "user-a".into(),
            entity_type: "message".into(),
            entity_id: item.entity_id.clone(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: "{}".into(),
            payload_hash: "message-hash".into(),
            created_at_ms: 3,
        };
        let attachment_operation = NewOutboxOperation {
            operation_id: item.attachment_operation_id.clone().unwrap(),
            endpoint_id: "target".into(),
            owner_scope: "user-a".into(),
            entity_type: "attachment".into(),
            entity_id: item.attachment_id.clone().unwrap(),
            action: "upsert".into(),
            base_revision: 0,
            payload_json: "{}".into(),
            payload_hash: "attachment-hash".into(),
            created_at_ms: 3,
        };
        apply_imported_message(
            &path,
            "batch",
            &item.source_key,
            &message,
            &message_operation,
            Some((
                item.attachment_id.as_deref().unwrap(),
                message.remote_path.as_deref().unwrap(),
                None,
                Some("application/octet-stream"),
                &attachment_operation,
            )),
            3,
        )
        .unwrap();
        assert!(mark_storage_transfer_interrupted(&path, "batch", "network stopped", 4,).unwrap());
        assert!(cancel_storage_transfer(&path, "batch", 5).unwrap());

        let conn = Connection::open(&path).unwrap();
        let states = conn
            .prepare("SELECT state FROM sync_outbox ORDER BY operation_id")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(states, vec!["superseded", "superseded"]);
        let message_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM messages WHERE endpoint_id='target' AND owner_scope='user-a'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let attachment_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM attachment_sync WHERE endpoint_id='target' AND owner_scope='user-a'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!((message_count, attachment_count), (0, 0));
        drop(conn);
        assert_eq!(count_pending_import_outbox(&path, "batch").unwrap(), 0);
        assert_eq!(
            get_storage_transfer_progress(&path, "batch")
                .unwrap()
                .unwrap()
                .status,
            "cancelled"
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn resumable_storage_transfer_list_returns_all_unfinished_tasks() {
        let path = temp_db_path("storage-transfer-list");
        init_db(&path, None).expect("initialize database");
        for (batch_id, target_id, now_ms) in [("older", "target-a", 1), ("newer", "target-b", 2)] {
            let item = StorageTransferItem {
                item_type: "message".into(),
                source_key: format!("{batch_id}.txt"),
                entity_id: format!("{batch_id}-message"),
                attachment_id: None,
                message_operation_id: format!("{batch_id}-operation"),
                attachment_operation_id: None,
                state: "pending".into(),
                source_revision: Some(format!("{batch_id}-revision")),
                source_hash: None,
                total_bytes: 0,
                transferred_bytes: 0,
                last_error: None,
            };
            create_or_resume_storage_transfer(
                &path,
                &NewStorageTransferBatch {
                    batch_id,
                    source_profile_id: "source",
                    target_profile_id: target_id,
                    source_provider_kind: "webdav",
                    target_provider_kind: "webdav",
                    source_owner_scope: "",
                    target_owner_scope: "",
                    items: std::slice::from_ref(&item),
                    now_ms,
                },
            )
            .unwrap();
        }
        let tasks = list_resumable_storage_transfer_progress(&path).unwrap();
        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].batch_id, "newer");
        assert_eq!(tasks[1].batch_id, "older");
        assert!(cancel_storage_transfer(&path, "older", 3).unwrap());
        let tasks = list_resumable_storage_transfer_progress(&path).unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].batch_id, "newer");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn list_marked_messages_filters_by_tag_and_sorts_pinned_first() {
        let path = temp_db_path("marked-message-order");
        init_db(&path, None).expect("initialize database");

        upsert_message(
            &path,
            &sample_message("tag-a-old.txt", 100, &["tag-a"], false),
        )
        .expect("insert old tagged message");
        upsert_message(
            &path,
            &sample_message("tag-a-pinned.txt", 200, &["tag-a"], true),
        )
        .expect("insert pinned tagged message");
        upsert_message(
            &path,
            &sample_message("tag-b-new.txt", 300, &["tag-b"], false),
        )
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
        assert_eq!(
            filtered_filenames,
            vec!["tag-a-pinned.txt", "tag-a-old.txt"]
        );

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn list_marked_messages_filters_by_search_query() {
        let path = temp_db_path("marked-message-search");
        init_db(&path, None).expect("initialize database");

        upsert_message(
            &path,
            &sample_message("合同-草稿.txt", 100, &["tag-a"], false),
        )
        .expect("insert matching text message");

        let mut file_message = sample_message("archive.bin", 200, &["tag-b"], false);
        file_message.kind = "file".to_string();
        file_message.original_name = "客户合同.pdf".to_string();
        file_message.content = None;
        upsert_message(&path, &file_message).expect("insert matching file message");

        upsert_message(
            &path,
            &sample_message("无关记录.txt", 300, &["tag-a"], false),
        )
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
    fn list_marked_messages_paged_returns_requested_window_and_count() {
        let path = temp_db_path("marked-message-paged");
        init_db(&path, None).expect("initialize database");

        upsert_message(&path, &sample_message("old.txt", 100, &["tag-a"], false))
            .expect("insert old message");
        upsert_message(&path, &sample_message("middle.txt", 200, &["tag-a"], false))
            .expect("insert middle message");
        upsert_message(&path, &sample_message("pinned.txt", 300, &["tag-a"], true))
            .expect("insert pinned message");

        let total = count_marked_messages(&path, "endpoint-1", Some("tag-a"), None, None)
            .expect("count marked messages");
        let page = list_marked_messages_paged(
            &path,
            "endpoint-1",
            Some("tag-a"),
            None,
            Some(1),
            Some(1),
            None,
        )
        .expect("list marked page");

        assert_eq!(total, 3);
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].filename, "middle.txt");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn count_unfinished_marked_messages_uses_due_date_rules() {
        let path = temp_db_path("marked-unfinished-count");
        init_db(&path, None).expect("initialize database");

        let mut no_due = sample_message("no-due.txt", 100, &[], false);
        no_due.marked_due_date = None;
        upsert_message(&path, &no_due).expect("insert no due");

        let mut past_due = sample_message("past-due.txt", 200, &[], false);
        past_due.marked_due_date = Some("2026-08-26".to_string());
        upsert_message(&path, &past_due).expect("insert past due");

        let mut future_due = sample_message("future-due.txt", 300, &[], false);
        future_due.marked_due_date = Some("2026-08-28".to_string());
        upsert_message(&path, &future_due).expect("insert future due");

        let count = count_unfinished_marked_messages(&path, "endpoint-1", "2026-08-27")
            .expect("count unfinished");
        assert_eq!(count, 2);

        let page = list_marked_messages_paged(
            &path,
            "endpoint-1",
            None,
            None,
            None,
            None,
            Some("2026-08-27"),
        )
        .expect("list pending marked page");
        assert_eq!(page.len(), 2);
        assert!(page
            .iter()
            .all(|message| message.filename != "future-due.txt"));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn list_cleanup_candidates_filters_in_sql_compatible_order() {
        let path = temp_db_path("cleanup-candidates");
        init_db(&path, None).expect("initialize database");

        let mut old_unmarked = sample_message("old-unmarked.txt", 10, &[], false);
        old_unmarked.marked = false;
        upsert_message(&path, &old_unmarked).expect("insert old unmarked message");
        upsert_message(&path, &sample_message("old-marked.txt", 20, &[], false))
            .expect("insert old marked message");
        let mut new_unmarked = sample_message("new-unmarked.txt", 100, &[], false);
        new_unmarked.marked = false;
        upsert_message(&path, &new_unmarked).expect("insert new unmarked message");

        let candidates = list_cleanup_candidates(&path, "endpoint-1", Some(50))
            .expect("list cleanup candidates");

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].filename, "old-unmarked.txt");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn transfer_history_lists_are_paged_and_counted() {
        let path = temp_db_path("transfer-history-paged");
        init_db(&path, None).expect("initialize database");

        for index in 1..=3 {
            upsert_download_history(
                &path,
                &DbDownloadHistory {
                    id: 0,
                    endpoint_id: "endpoint-1".to_string(),
                    filename: format!("download-{index}.bin"),
                    original_name: format!("download-{index}.bin"),
                    saved_path: None,
                    status: "complete".to_string(),
                    error: None,
                    file_size: index,
                    created_at_ms: index,
                    updated_at_ms: index,
                },
            )
            .expect("insert download history");
            upsert_upload_history(
                &path,
                &DbUploadHistory {
                    id: 0,
                    endpoint_id: "endpoint-1".to_string(),
                    filename: format!("upload-{index}.bin"),
                    original_name: format!("upload-{index}.bin"),
                    local_path: None,
                    status: "complete".to_string(),
                    error: None,
                    file_size: index,
                    created_at_ms: index,
                    updated_at_ms: index,
                },
            )
            .expect("insert upload history");
        }

        let downloads = list_download_history_paged(&path, Some(1), Some(1))
            .expect("list download history page");
        let uploads =
            list_upload_history_paged(&path, Some(1), Some(1)).expect("list upload history page");

        assert_eq!(count_download_history(&path).expect("count downloads"), 3);
        assert_eq!(downloads.len(), 1);
        assert_eq!(downloads[0].filename, "download-2.bin");
        assert_eq!(count_upload_history(&path).expect("count uploads"), 3);
        assert_eq!(uploads.len(), 1);
        assert_eq!(uploads[0].filename, "upload-2.bin");

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn delete_messages_removes_entries_from_marked_list_results() {
        let path = temp_db_path("marked-message-delete-refresh");
        init_db(&path, None).expect("initialize database");

        upsert_message(&path, &sample_message("keep.txt", 300, &["tag-a"], false))
            .expect("insert kept message");
        upsert_message(
            &path,
            &sample_message("delete-a.txt", 200, &["tag-a"], false),
        )
        .expect("insert deleted message");
        upsert_message(
            &path,
            &sample_message("delete-b.txt", 100, &["tag-b"], true),
        )
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

    #[test]
    fn stable_message_windows_support_before_and_after_boundaries() {
        let path = temp_db_path("message-window-boundaries");
        init_db(&path, None).expect("initialize database");

        for (filename, timestamp_ms) in [
            ("001.txt", 100_i64),
            ("002.txt", 200_i64),
            ("003.txt", 200_i64),
            ("004.txt", 300_i64),
            ("005.txt", 400_i64),
        ] {
            let mut message = sample_message(filename, timestamp_ms, &[], false);
            message.marked = false;
            upsert_message(&path, &message).expect("insert sample message");
        }

        let latest =
            list_latest_messages_window(&path, "endpoint-1", 2, false).expect("latest window");
        let latest_filenames: Vec<_> = latest
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(latest_filenames, vec!["004.txt", "005.txt"]);

        let older = list_messages_before(&path, "endpoint-1", 300, "004.txt", 2, false)
            .expect("older window");
        let older_filenames: Vec<_> = older
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(older_filenames, vec!["002.txt", "003.txt"]);

        let newer = list_messages_after(&path, "endpoint-1", 200, "002.txt", 10, false)
            .expect("newer window");
        let newer_filenames: Vec<_> = newer
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(newer_filenames, vec!["003.txt", "004.txt", "005.txt"]);

        let older_count =
            count_messages_before(&path, "endpoint-1", 300, "004.txt", false).expect("older count");
        assert_eq!(older_count, 3);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn stable_message_windows_stay_consistent_after_boundary_deletions() {
        let path = temp_db_path("message-window-deletions");
        init_db(&path, None).expect("initialize database");

        for (filename, timestamp_ms) in [
            ("001.txt", 100_i64),
            ("002.txt", 200_i64),
            ("003.txt", 200_i64),
            ("004.txt", 300_i64),
            ("005.txt", 300_i64),
            ("006.txt", 400_i64),
        ] {
            let mut message = sample_message(filename, timestamp_ms, &[], false);
            message.marked = false;
            upsert_message(&path, &message).expect("insert sample message");
        }

        let deleted = delete_messages(
            &path,
            "endpoint-1",
            &["003.txt".to_string(), "005.txt".to_string()],
        )
        .expect("delete boundary messages");
        assert_eq!(deleted, 2);

        let latest = list_latest_messages_window(&path, "endpoint-1", 3, false)
            .expect("latest window after delete");
        let latest_filenames: Vec<_> = latest
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(latest_filenames, vec!["002.txt", "004.txt", "006.txt"]);

        let older = list_messages_before(&path, "endpoint-1", 300, "004.txt", 3, false)
            .expect("older window after delete");
        let older_filenames: Vec<_> = older
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(older_filenames, vec!["001.txt", "002.txt"]);

        let newer = list_messages_after(&path, "endpoint-1", 200, "002.txt", 10, false)
            .expect("newer window after delete");
        let newer_filenames: Vec<_> = newer
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(newer_filenames, vec!["004.txt", "006.txt"]);

        let older_count =
            count_messages_before(&path, "endpoint-1", 300, "004.txt", false).expect("older count");
        assert_eq!(older_count, 2);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn stable_message_windows_reconstruct_full_history_across_repeated_load_more() {
        let path = temp_db_path("message-window-repeated-load-more");
        init_db(&path, None).expect("initialize database");

        for (filename, timestamp_ms) in [
            ("001.txt", 100_i64),
            ("002.txt", 200_i64),
            ("003.txt", 200_i64),
            ("004.txt", 300_i64),
            ("005.txt", 300_i64),
            ("006.txt", 400_i64),
            ("007.txt", 500_i64),
        ] {
            let mut message = sample_message(filename, timestamp_ms, &[], false);
            message.marked = false;
            upsert_message(&path, &message).expect("insert sample message");
        }

        let expected = list_messages(&path, "endpoint-1", None).expect("list expected messages");
        let expected_filenames: Vec<_> = expected
            .iter()
            .map(|message| message.filename.clone())
            .collect();

        let page_size = 2_i64;
        let mut reconstructed = list_latest_messages_window(&path, "endpoint-1", page_size, false)
            .expect("load latest window");
        loop {
            let first = reconstructed
                .first()
                .cloned()
                .expect("window should not be empty");
            let older = list_messages_before(
                &path,
                "endpoint-1",
                first.timestamp_ms,
                &first.filename,
                page_size,
                false,
            )
            .expect("load older page");
            if older.is_empty() {
                break;
            }
            reconstructed.splice(0..0, older.into_iter());
        }

        let reconstructed_filenames: Vec<_> = reconstructed
            .iter()
            .map(|message| message.filename.clone())
            .collect();
        assert_eq!(reconstructed_filenames, expected_filenames);

        let unique_filenames: std::collections::HashSet<_> =
            reconstructed_filenames.iter().cloned().collect();
        assert_eq!(unique_filenames.len(), reconstructed_filenames.len());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn stable_message_windows_are_isolated_per_endpoint() {
        let path = temp_db_path("message-window-endpoint-isolation");
        init_db(&path, None).expect("initialize database");

        for (filename, timestamp_ms) in [
            ("a-001.txt", 100_i64),
            ("a-002.txt", 200_i64),
            ("a-003.txt", 300_i64),
        ] {
            let mut message = sample_message(filename, timestamp_ms, &[], false);
            message.marked = false;
            upsert_message(&path, &message).expect("insert endpoint-1 message");
        }

        for (filename, timestamp_ms) in [
            ("b-001.txt", 150_i64),
            ("b-002.txt", 250_i64),
            ("b-003.txt", 350_i64),
        ] {
            let mut message = sample_message(filename, timestamp_ms, &[], false);
            message.endpoint_id = "endpoint-2".to_string();
            message.marked = false;
            upsert_message(&path, &message).expect("insert endpoint-2 message");
        }

        let latest_endpoint_1 = list_latest_messages_window(&path, "endpoint-1", 2, false)
            .expect("latest endpoint-1 window");
        let latest_endpoint_1_filenames: Vec<_> = latest_endpoint_1
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(latest_endpoint_1_filenames, vec!["a-002.txt", "a-003.txt"]);

        let older_endpoint_1 =
            list_messages_before(&path, "endpoint-1", 300, "a-003.txt", 5, false)
                .expect("older endpoint-1 window");
        let older_endpoint_1_filenames: Vec<_> = older_endpoint_1
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(older_endpoint_1_filenames, vec!["a-001.txt", "a-002.txt"]);

        let newer_endpoint_1 =
            list_messages_after(&path, "endpoint-1", 100, "a-001.txt", 10, false)
                .expect("newer endpoint-1 window");
        let newer_endpoint_1_filenames: Vec<_> = newer_endpoint_1
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(newer_endpoint_1_filenames, vec!["a-002.txt", "a-003.txt"]);

        let endpoint_1_total =
            count_messages(&path, "endpoint-1", false).expect("count endpoint-1");
        let endpoint_1_before_count =
            count_messages_before(&path, "endpoint-1", 300, "a-003.txt", false)
                .expect("count older endpoint-1 messages");
        assert_eq!(endpoint_1_total, 3);
        assert_eq!(endpoint_1_before_count, 2);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn stable_message_windows_handle_empty_and_partial_results_near_boundaries() {
        let path = temp_db_path("message-window-empty-partial");
        init_db(&path, None).expect("initialize database");

        for (filename, timestamp_ms) in [("001.txt", 100_i64), ("002.txt", 200_i64)] {
            let mut message = sample_message(filename, timestamp_ms, &[], false);
            message.marked = false;
            upsert_message(&path, &message).expect("insert sample message");
        }

        let latest = list_latest_messages_window(&path, "endpoint-1", 10, false)
            .expect("latest oversized window");
        let latest_filenames: Vec<_> = latest
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(latest_filenames, vec!["001.txt", "002.txt"]);

        let older = list_messages_before(&path, "endpoint-1", 200, "002.txt", 10, false)
            .expect("older partial window");
        let older_filenames: Vec<_> = older
            .iter()
            .map(|message| message.filename.as_str())
            .collect();
        assert_eq!(older_filenames, vec!["001.txt"]);

        let before_earliest = list_messages_before(&path, "endpoint-1", 100, "001.txt", 10, false)
            .expect("before earliest window");
        assert!(before_earliest.is_empty());

        let after_newest = list_messages_after(&path, "endpoint-1", 200, "002.txt", 10, false)
            .expect("after newest window");
        assert!(after_newest.is_empty());

        let before_earliest_count =
            count_messages_before(&path, "endpoint-1", 100, "001.txt", false)
                .expect("count before earliest");
        assert_eq!(before_earliest_count, 0);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn pending_marked_sync_upserts_lists_and_clears_exact_entry() {
        let path = temp_db_path("pending-marked-sync");
        init_db(&path, None).expect("initialize database");

        let first = PendingMarkedSync {
            endpoint_id: "endpoint-1".to_string(),
            filename: "message.txt".to_string(),
            timestamp_ms: 100,
            marked: true,
            marked_tag_ids: vec!["tag-b".to_string(), "tag-a".to_string()],
            marked_pinned: false,
            marked_due_date: Some("2026-08-27".to_string()),
            updated_at_ms: 10,
        };
        upsert_pending_marked_sync(&path, &first).expect("insert pending marked sync");

        let second = PendingMarkedSync {
            marked: false,
            marked_tag_ids: Vec::new(),
            marked_pinned: false,
            marked_due_date: None,
            updated_at_ms: 20,
            ..first.clone()
        };
        upsert_pending_marked_sync(&path, &second).expect("replace pending marked sync");

        let pending = list_pending_marked_sync(&path, "endpoint-1").expect("list pending sync");
        assert_eq!(pending, vec![second.clone()]);

        clear_pending_marked_sync_exact(
            &path,
            "endpoint-1",
            &[(
                second.filename.clone(),
                second.timestamp_ms,
                first.updated_at_ms,
            )],
        )
        .expect("stale clear should be ignored");
        assert_eq!(
            list_pending_marked_sync(&path, "endpoint-1").expect("list after stale clear"),
            vec![second.clone()]
        );

        clear_pending_marked_sync_exact(
            &path,
            "endpoint-1",
            &[(
                second.filename.clone(),
                second.timestamp_ms,
                second.updated_at_ms,
            )],
        )
        .expect("clear exact pending sync");
        assert!(list_pending_marked_sync(&path, "endpoint-1")
            .expect("list after clear")
            .is_empty());

        let _ = std::fs::remove_file(path);
    }
}
