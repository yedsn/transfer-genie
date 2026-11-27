use crate::{plugin_host, plugin_protocol::*, AppState, IntegrationTargetContext};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};
use tauri::{Emitter, Manager, State};
use tokio::sync::Notify;

static BOT_SYNC_WAKE: Notify = Notify::const_new();

fn notify_chat(state: &AppState, ctx: &IntegrationTargetContext, messages_changed: bool) {
    if let Some(app) = &state.app_handle {
        let _ = app.emit(
            "bot-chat-updated",
            json!({
                "scope": context_scope(ctx),
                "messagesChanged": messages_changed,
            }),
        );
    }
}

pub fn initialize(path: &Path) -> Result<(), String> {
    Connection::open(path).and_then(|c|c.execute_batch("CREATE TABLE IF NOT EXISTS bot_records(endpoint_id TEXT NOT NULL,owner_scope TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,pending INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(endpoint_id,owner_scope,kind,id)); CREATE TABLE IF NOT EXISTS bot_execution(endpoint_id TEXT NOT NULL,owner_scope TEXT NOT NULL,task_id TEXT NOT NULL,status TEXT NOT NULL,result TEXT,PRIMARY KEY(endpoint_id,owner_scope,task_id)); CREATE INDEX IF NOT EXISTS bot_pending_records ON bot_records(endpoint_id,owner_scope,pending); CREATE INDEX IF NOT EXISTS bot_context_filename ON bot_records(endpoint_id,owner_scope,json_extract(payload,'$.filename')) WHERE kind='contexts';")).map_err(|e|e.to_string())
}
pub fn recover(path: &Path) -> Result<(), String> {
    Connection::open(path)
        .and_then(|c| {
            c.execute(
                "UPDATE bot_execution SET status='interrupted' WHERE status='running'",
                [],
            )
        })
        .map(|_| ())
        .map_err(|e| e.to_string())
}
fn put(
    state: &AppState,
    ctx: &IntegrationTargetContext,
    kind: &str,
    id: &str,
    payload: &Value,
    pending: bool,
) -> Result<(), String> {
    put_record(
        &state.db_path,
        ctx.profile_id(),
        &ctx.owner_scope,
        kind,
        id,
        payload,
        pending,
    )
    .map(|_| ())
}
fn put_record(
    path: &Path,
    endpoint: &str,
    owner: &str,
    kind: &str,
    id: &str,
    payload: &Value,
    pending: bool,
) -> Result<bool, String> {
    Connection::open(path).and_then(|c|c.execute("INSERT INTO bot_records VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(endpoint_id,owner_scope,kind,id) DO UPDATE SET payload=excluded.payload,pending=MAX(bot_records.pending,excluded.pending) WHERE excluded.pending=1 OR (bot_records.pending=0 AND excluded.kind='directory' AND bot_records.payload<>excluded.payload)",params![endpoint,owner,kind,id,payload.to_string(),pending])).map(|count|count>0).map_err(|e|e.to_string())
}
fn records(
    state: &AppState,
    ctx: &IntegrationTargetContext,
    kind: &str,
) -> Result<Vec<Value>, String> {
    let c = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let mut q = c
        .prepare(
            "SELECT payload FROM bot_records WHERE endpoint_id=?1 AND owner_scope=?2 AND kind=?3",
        )
        .map_err(|e| e.to_string())?;
    let rows = q
        .query_map(params![ctx.profile_id(), ctx.owner_scope, kind], |r| {
            r.get::<_, String>(0)
        })
        .map_err(|e| e.to_string())?;
    rows.map(|r| {
        r.map_err(|e| e.to_string())
            .and_then(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
    })
    .collect()
}
#[cfg(test)]
pub async fn send(
    state: &AppState,
    text: String,
    format: Option<String>,
    references: Vec<MessageReference>,
    target: Option<String>,
    client_id: Option<String>,
    marked_options: Option<crate::SendMarkedOptionsInput>,
) -> Result<crate::SendMessageResult, String> {
    send_with_options(
        state,
        text,
        format,
        references,
        target,
        client_id,
        marked_options,
        None,
        None,
        None,
    )
    .await
}

fn download_body(text: &str, mention: &str, offset: usize) -> Result<String, String> {
    let mut units = 0;
    for (index, character) in text.char_indices() {
        if units == offset
            && !mention.is_empty()
            && mention.starts_with('@')
            && text[index..].starts_with(mention)
        {
            let mut suffix = &text[index + mention.len()..];
            if let Some(rest) = suffix.strip_prefix(' ') {
                suffix = rest;
            }
            return Ok(format!("{}{suffix}", &text[..index]));
        }
        units += character.len_utf16();
    }
    Err("下载机器人提及已变化，请重新选择".into())
}

pub async fn send_with_options(
    state: &AppState,
    text: String,
    format: Option<String>,
    mut references: Vec<MessageReference>,
    target: Option<String>,
    client_id: Option<String>,
    marked_options: Option<crate::SendMarkedOptionsInput>,
    download_route: Option<String>,
    mention_text: Option<String>,
    mention_start: Option<usize>,
) -> Result<crate::SendMessageResult, String> {
    let body = match (&download_route, mention_text, mention_start) {
        (Some(_), Some(mention), Some(offset)) if target.is_some() => {
            Some(download_body(&text, &mention, offset)?)
        }
        (None, None, None) => None,
        _ => return Err("下载任务缺少有效提及".into()),
    };
    if references.len() > MAX_REFERENCES {
        return Err("最多引用 50 条消息".into());
    }
    let settings = crate::current_settings(state)?;
    let ctx = crate::resolve_send_target_context(state, &settings)?;
    let mut seen = std::collections::HashSet::new();
    references.retain(|reference| seen.insert(reference.filename.clone()));
    for reference in &mut references {
        let message = crate::db::get_message_for_scope(
            &state.db_path,
            ctx.profile_id(),
            &ctx.owner_scope,
            &reference.filename,
        )
        .map_err(|e| e.to_string())?
        .ok_or("引用消息已不可用")?;
        reference.sender = message.sender;
        reference.timestamp_ms = message.timestamp_ms;
        reference.kind = message.kind;
        reference.original_name = message.original_name;
        reference.content = message.content;
        reference.file_hash = message.file_hash;
        reference.etag = message.etag;
        reference.size = message.size;
    }
    references.sort_by(|a, b| {
        a.timestamp_ms
            .cmp(&b.timestamp_ms)
            .then(a.filename.cmp(&b.filename))
    });
    let request_id = client_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let id = uuid::Uuid::new_v5(
        &uuid::Uuid::NAMESPACE_URL,
        format!(
            "bot-send:{}:{}:{request_id}",
            ctx.profile_id(),
            ctx.owner_scope
        )
        .as_bytes(),
    )
    .to_string();
    let now = crate::now_ms();
    let filename = crate::external_source_filename(
        &settings.sender_name,
        "message.txt",
        now,
        &crate::ExternalSourceIdentity {
            kind: "bot-call".into(),
            channel_id: ctx.profile_id().into(),
            message_id: id.clone(),
        },
    );
    let _guard = state.sync_guard.lock().await;
    crate::ensure_integration_context(state, &ctx)?;
    let existing = records(state, &ctx, "contexts")?
        .into_iter()
        .find(|v| v["id"] == id);
    if let Some(existing) = existing {
        let requested = json!({"text":text,"format":crate::normalize_send_text_format(format.clone())?,"references":references,"target_bot_instance_id":target,"download_route":download_route,"download_body":body});
        for key in [
            "text",
            "format",
            "references",
            "target_bot_instance_id",
            "download_route",
            "download_body",
        ] {
            if existing[key] != requested[key] {
                return Err("相同发送标识已用于不同的消息内容，请重新发送".into());
            }
        }
        let filename = existing["filename"].as_str().ok_or("调用记录无效")?;
        if let Some(message) = crate::db::get_message_for_scope(
            &state.db_path,
            ctx.profile_id(),
            &ctx.owner_scope,
            filename,
        )
        .map_err(|e| e.to_string())?
        {
            return Ok(crate::supabase_send_result(ctx.profile_id(), &message));
        }
    }
    let mut target_info = None;
    if let Some(target) = &target {
        let mut known = records(state, &ctx, "directory")?;
        #[cfg(desktop)]
        for instance in scoped_instances(state, &ctx, &settings.sender_name)? {
            known.push(serde_json::to_value(instance).map_err(|e| e.to_string())?);
        }
        let instance = known
            .iter()
            .rev()
            .find(|v| {
                v["instance_id"] == *target && v["protocol_version"].as_u64().unwrap_or(1) == 1
            })
            .filter(|v| v["enabled"] == true)
            .ok_or("机器人实例未注册或已停用")?;
        target_info = Some(instance.clone());
        if let Some(route) = &download_route {
            let options = &instance["download_options"];
            if options.is_null() {
                return Err("目标机器人版本不支持通用下载，请升级目标设备".into());
            }
            if route != "direct"
                && route != "default"
                && !options["profiles"]
                    .as_array()
                    .is_some_and(|profiles| profiles.iter().any(|p| p["id"] == *route))
            {
                return Err("所选下载代理已不存在，请重新选择出口".into());
            }
            if references.is_empty() && body.as_deref().unwrap_or_default().trim().is_empty() {
                return Err("请引用消息或输入要下载的内容".into());
            }
        }
    }
    let remote_path = crate::filenames::message_remote_path(&filename, now);
    let mut message = crate::db::DbMessage {
        endpoint_id: ctx.profile_id().into(),
        filename: filename.clone(),
        sender: settings.sender_name.clone(),
        timestamp_ms: now,
        size: text.len() as i64,
        kind: "text".into(),
        original_name: "message.txt".into(),
        etag: None,
        mtime: None,
        content: Some(text.clone()),
        local_path: None,
        remote_path: Some(remote_path),
        file_hash: None,
        marked: false,
        marked_tag_ids: vec![],
        marked_pinned: false,
        marked_due_date: None,
        format: crate::normalize_send_text_format(format)?,
        transcript_source: None,
        source_audio_mime_type: None,
        transcript_raw_text: None,
        source_kind: None,
        source_channel_id: None,
        source_message_id: None,
    };
    let mut supabase_changes = None;
    let mut webdav_changes = None;
    match &ctx.provider {
        crate::storage_provider::ProviderConfig::Supabase(profile) => {
            supabase_changes = Some(crate::apply_supabase_send_marked_options(
                state,
                profile,
                ctx.session.as_ref().ok_or("需要登录")?,
                &mut message,
                marked_options.unwrap_or_default(),
            )?);
        }
        crate::storage_provider::ProviderConfig::Webdav(endpoint) => {
            let applied = crate::load_and_apply_send_marked_options(
                state,
                endpoint,
                marked_options.unwrap_or_default(),
            )
            .await?;
            message.marked = applied.marked;
            message.marked_tag_ids = applied.tag_ids.clone();
            message.marked_due_date = applied.due_date.clone();
            webdav_changes = Some(applied);
        }
    }
    let mut context = json!({"id":id,"filename":filename,"references":references,"target_bot_instance_id":target,"task_id":if target.is_some(){Some(id.clone())}else{None},"text":text,"sender":settings.sender_name,"timestamp_ms":now,"format":message.format,"marked":message.marked,"marked_tag_ids":message.marked_tag_ids,"marked_due_date":message.marked_due_date,"download_route":download_route,"download_body":body});
    if let Some(instance) = target_info {
        context["bot_name"] = instance["name"].clone();
        context["bot_device_name"] = instance["device_name"].clone();
        context["bot_expires_at_ms"] = instance["expires_at_ms"].clone();
        if !instance["download_options"].is_null() {
            context["bot_target_icon"] = json!("download");
        }
    }
    let task = target.map(|target| BotTask {
        retry_of: None,
        retry_item_ids: vec![],
        protocol_version: if download_route.is_some() { 2 } else { 1 },
        download_route,
        download_body: body,
        original_timestamp_ms: None,
        original_task_id: None,
        task_id: id.clone(),
        target_instance_id: target,
        author_device_id: plugin_host::device_id(&plugin_host::root(state)).unwrap_or_default(),
        message_filename: filename.clone(),
        text,
        references,
        created_at_ms: now,
        expires_at_ms: now + 86400000,
    });
    let mut c = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    if let Some(changes) = &supabase_changes {
        let operation = crate::outbox_operation(
            ctx.profile_id(),
            &ctx.owner_scope,
            "message",
            &id,
            "upsert",
            0,
            crate::supabase_message_payload(&message),
        )?;
        crate::db::save_message_with_marked_changes_in_transaction(
            &tx,
            &message,
            &changes.created_tags,
            &changes.cleaned_messages,
            &operation,
            &changes.deleted_tags,
            None,
        )
        .map_err(|e| e.to_string())?;
    } else {
        tx.execute("INSERT INTO messages(endpoint_id,owner_scope,filename,sender,timestamp_ms,size,kind,original_name,content,format,message_id,sync_state,marked,marked_tag_ids,marked_due_date) VALUES(?1,?2,?3,?4,?5,?6,'text','message.txt',?7,?8,?9,'pending',?10,?11,?12)",params![ctx.profile_id(),ctx.owner_scope,filename,message.sender,now,message.size,message.content,message.format,id,message.marked,serde_json::to_string(&message.marked_tag_ids).map_err(|e|e.to_string())?,message.marked_due_date]).map_err(|e|e.to_string())?;
    }
    tx.execute(
        "INSERT INTO bot_records VALUES(?1,?2,'contexts',?3,?4,1)",
        params![ctx.profile_id(), ctx.owner_scope, id, context.to_string()],
    )
    .map_err(|e| e.to_string())?;
    if let Some(task) = task {
        let serialized = serde_json::to_string(&task).map_err(|e| e.to_string())?;
        if serialized.len() > 4 * 1024 * 1024 - 64 * 1024 {
            return Err("机器人任务内容过大，请分批发送".into());
        }
        tx.execute(
            "INSERT INTO bot_records VALUES(?1,?2,'tasks',?3,?4,1)",
            params![ctx.profile_id(), ctx.owner_scope, id, serialized],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(applied) = &webdav_changes {
        if applied.tags_changed {
            tx.execute(
                "DELETE FROM marked_tags WHERE endpoint_id=?1 AND owner_scope=?2",
                params![ctx.profile_id(), ctx.owner_scope],
            )
            .map_err(|e| e.to_string())?;
            for tag in &applied.tags {
                tx.execute(
                    "INSERT INTO marked_tags(endpoint_id,owner_scope,id,name) VALUES(?1,?2,?3,?4)",
                    params![ctx.profile_id(), ctx.owner_scope, tag.id, tag.name],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        for (filename, timestamp) in &applied.cleanup_targets {
            let control_id = format!("marked-cleanup-{}", uuid::Uuid::new_v4());
            tx.execute(
                "INSERT INTO bot_records VALUES(?1,?2,'contexts',?3,?4,1)",
                params![
                    ctx.profile_id(),
                    ctx.owner_scope,
                    control_id,
                    json!({"filename":filename,"timestamp_ms":timestamp,"metadata_only":true})
                        .to_string()
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    if context["task_id"].is_string() {
        BOT_SYNC_WAKE.notify_one();
    }
    if supabase_changes.is_some() {
        crate::notify_supabase_outbox_pending(state);
    }
    Ok(crate::supabase_send_result(ctx.profile_id(), &message))
}
async fn remote_write(
    state: &AppState,
    ctx: &IntegrationTargetContext,
    kind: &str,
    id: &str,
    payload: Value,
) -> Result<(), String> {
    match &ctx.provider {
        crate::storage_provider::ProviderConfig::Webdav(endpoint) => {
            if kind == "contexts" {
                let filename = payload["filename"].as_str().ok_or("引用消息缺少文件标识")?;
                let message = crate::db::get_message_for_scope(
                    &state.db_path,
                    ctx.profile_id(),
                    &ctx.owner_scope,
                    filename,
                )
                .map_err(|e| e.to_string())?
                .ok_or("引用消息尚未保存")?;
                if payload["metadata_only"] != true {
                    let path =
                        crate::filenames::message_remote_path(filename, message.timestamp_ms);
                    crate::webdav::upload_file_ensuring_parent(
                        &state.http,
                        endpoint,
                        &path,
                        message.content.clone().unwrap_or_default().into_bytes(),
                    )
                    .await?;
                }
                crate::ensure_integration_context(state, ctx)?;
                let history = crate::history::upsert_history_entries(
                    &state.http,
                    endpoint,
                    vec![crate::message_to_history(&message)],
                )
                .await?;
                crate::invalidate_history_cache_for_paths(
                    state,
                    ctx.profile_id(),
                    &history.touched_paths,
                )?;
                let tags = crate::db::list_marked_tags(&state.db_path, ctx.profile_id())
                    .map_err(|e| e.to_string())?;
                crate::history::save_marked_tags(&state.http, endpoint, &tags).await?;
            }
            crate::webdav::upload_file_ensuring_parent(
                &state.http,
                endpoint,
                &format!("bots/v1/{kind}/{id}.json"),
                serde_json::to_vec(&payload).map_err(|e| e.to_string())?,
            )
            .await
        }
        crate::storage_provider::ProviderConfig::Supabase(profile) => {
            let config = profile.supabase.as_ref().ok_or("缺少空间配置")?;
            let session = ctx.session.as_ref().ok_or("需要登录")?;
            let response=state.http.post(format!("{}/rest/v1/rpc/bot_record_put",config.api_url.trim_end_matches('/'))).header("apikey",&config.anon_key).bearer_auth(&session.access_token).header("Content-Profile","transfer_genie").json(&json!({"p_space_id":config.space_id,"p_kind":kind,"p_id":id,"p_payload":payload})).send().await.map_err(|e|e.to_string())?;
            if response.status().is_success() {
                Ok(())
            } else {
                Err("机器人同步失败，请检查 Supabase 插件迁移与登录状态".into())
            }
        }
    }
}
async fn read_limited_stream(
    mut stream: std::pin::Pin<
        Box<dyn futures_util::Stream<Item = reqwest::Result<bytes::Bytes>> + Send>,
    >,
    limit: usize,
) -> Result<Vec<u8>, String> {
    use futures_util::StreamExt;
    let mut bytes = Vec::new();
    loop {
        let chunk = tokio::time::timeout(std::time::Duration::from_secs(30), stream.next())
            .await
            .map_err(|_| "读取机器人数据超时".to_string())?;
        let Some(chunk) = chunk else { break };
        let chunk = chunk.map_err(|e| e.to_string())?;
        if bytes.len().saturating_add(chunk.len()) > limit {
            return Err("机器人数据超过大小限制".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
pub(crate) async fn synchronize(
    state: &AppState,
    ctx: &IntegrationTargetContext,
) -> Result<(), String> {
    let pending = {
        let c = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
        let mut q=c.prepare("SELECT kind,id,payload FROM bot_records WHERE endpoint_id=?1 AND owner_scope=?2 AND pending=1 ORDER BY CASE kind WHEN 'directory' THEN 0 WHEN 'contexts' THEN 1 WHEN 'tasks' THEN 2 ELSE 3 END,id").map_err(|e|e.to_string())?;
        let rows = q
            .query_map(params![ctx.profile_id(), ctx.owner_scope], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    let task_sent = pending.iter().any(|(kind, _, _)| kind == "tasks");
    for (kind, id, payload) in pending {
        crate::ensure_integration_context(state, ctx)?;
        remote_write(
            state,
            ctx,
            &kind,
            &id,
            serde_json::from_str(&payload).map_err(|e| e.to_string())?,
        )
        .await?;
        crate::ensure_integration_context(state, ctx)?;
        Connection::open(&state.db_path).and_then(|c|c.execute("UPDATE bot_records SET pending=0 WHERE endpoint_id=?1 AND owner_scope=?2 AND kind=?3 AND id=?4 AND payload=?5",params![ctx.profile_id(),ctx.owner_scope,kind,id,payload])).map_err(|e|e.to_string())?;
    }
    if task_sent {
        notify_chat(state, ctx, false);
    }
    receive_records(state, ctx, &["directory", "tasks", "events", "contexts"]).await
}

pub(crate) async fn receive_records(
    state: &AppState,
    ctx: &IntegrationTargetContext,
    kinds: &[&str],
) -> Result<(), String> {
    let mut changed = false;
    let mut message_context_changed = false;
    for &kind in kinds {
        let rows: Vec<(String, Value)> = match &ctx.provider {
            crate::storage_provider::ProviderConfig::Webdav(endpoint) => {
                let entries = crate::webdav::list_entries(
                    &state.http,
                    endpoint,
                    Some(&format!("bots/v1/{kind}")),
                    true,
                )
                .await?;
                // Immutable records already in the local index never need another GET.
                let known = if kind == "directory" {
                    std::collections::HashSet::new()
                } else {
                    let connection = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
                    let mut query = connection.prepare("SELECT id FROM bot_records WHERE endpoint_id=?1 AND owner_scope=?2 AND kind=?3").map_err(|e| e.to_string())?;
                    let ids = query
                        .query_map(params![ctx.profile_id(), ctx.owner_scope, kind], |row| {
                            row.get::<_, String>(0)
                        })
                        .map_err(|e| e.to_string())?;
                    ids.collect::<Result<std::collections::HashSet<_>, _>>()
                        .map_err(|e| e.to_string())?
                };
                let mut rows = vec![];
                for entry in entries
                    .into_iter()
                    .filter(|e| !e.is_collection && e.filename.ends_with(".json"))
                {
                    if known.contains(entry.filename.trim_end_matches(".json")) {
                        continue;
                    }
                    if entry.size.unwrap_or(0) > 4 * 1024 * 1024 {
                        continue;
                    }
                    let response = crate::webdav::download_file_stream(
                        &state.http,
                        endpoint,
                        &entry.remote_path,
                    )
                    .await?;
                    let bytes = read_limited_stream(response.stream, 4 * 1024 * 1024).await?;
                    if bytes.len() > 4 * 1024 * 1024 {
                        continue;
                    }
                    let value: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
                    rows.push((entry.filename.trim_end_matches(".json").into(), value));
                }
                rows
            }
            crate::storage_provider::ProviderConfig::Supabase(profile) => {
                let config = profile.supabase.as_ref().ok_or("缺少空间配置")?;
                let session = ctx.session.as_ref().ok_or("需要登录")?;
                let mut all_rows = Vec::new();
                let mut offset = 0usize;
                loop {
                    let response = state
                        .http
                        .get(format!(
                            "{}/rest/v1/bot_records",
                            config.api_url.trim_end_matches('/')
                        ))
                        .header("apikey", &config.anon_key)
                        .bearer_auth(&session.access_token)
                        .header("Accept-Profile", "transfer_genie")
                        .query(&[
                            ("space_id", format!("eq.{}", config.space_id)),
                            ("kind", format!("eq.{kind}")),
                            ("select", "id,payload".into()),
                            ("order", "id.asc".into()),
                            ("limit", "500".into()),
                            ("offset", offset.to_string()),
                        ])
                        .send()
                        .await
                        .map_err(|e| e.to_string())?;
                    if !response.status().is_success() {
                        let status = response.status().as_u16();
                        return Err(match status {
                            404 => "Supabase 缺少机器人目录表或 API 缓存未刷新，请在服务端执行 004_bot_plugin_records.sql 并刷新 schema cache".into(),
                            401 => "当前空间登录已失效，请重新登录后重试机器人目录".into(),
                            403 => "当前账号无权读取机器人目录，请检查服务端权限和 RLS 配置".into(),
                            _ => format!("读取机器人目录失败（HTTP {status}），请稍后重试"),
                        });
                    }
                    let bytes =
                        read_limited_stream(Box::pin(response.bytes_stream()), 4 * 1024 * 1024)
                            .await?;
                    let rows: Vec<Value> =
                        serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
                    let count = rows.len();
                    all_rows.extend(rows.into_iter().filter_map(|r| {
                        Some((r["id"].as_str()?.to_string(), r["payload"].clone()))
                    }));
                    if count == 0 {
                        break;
                    }
                    offset += count;
                }
                all_rows
            }
        };
        for (id, payload) in rows {
            crate::ensure_integration_context(state, ctx)?;
            if valid_component(&id) {
                let inserted = put_record(
                    &state.db_path,
                    ctx.profile_id(),
                    &ctx.owner_scope,
                    kind,
                    &id,
                    &payload,
                    false,
                )?;
                changed |= inserted && matches!(kind, "tasks" | "events" | "contexts");
                message_context_changed |=
                    inserted && kind == "contexts" && payload["metadata_only"] != true;
            }
        }
    }
    if changed {
        let inserted_messages = hydrate_contexts(state, ctx)?;
        notify_chat(state, ctx, inserted_messages || message_context_changed);
    }
    Ok(())
}
#[cfg(desktop)]
fn scoped_instances(
    state: &AppState,
    ctx: &IntegrationTargetContext,
    sender: &str,
) -> Result<Vec<BotInstance>, String> {
    let root = plugin_host::root(state);
    let scope = context_scope(ctx);
    let mut instances = plugin_host::instances(&root, sender)?;
    for instance in &mut instances {
        instance.enabled &= plugin_host::space_allowed(&root, &instance.plugin_id, &scope)?;
        if !instance.enabled {
            instance.download_options = None;
        }
    }
    Ok(instances)
}
#[cfg(desktop)]
fn publish_directory(
    state: &AppState,
    ctx: &IntegrationTargetContext,
    sender: &str,
) -> Result<(), String> {
    for instance in scoped_instances(state, ctx, sender)? {
        put(
            state,
            ctx,
            "directory",
            &instance.instance_id,
            &serde_json::to_value(&instance).map_err(|e| e.to_string())?,
            true,
        )?;
    }
    Ok(())
}
pub async fn tick(state: &AppState) -> Result<(), String> {
    #[cfg(desktop)]
    for plugin in plugin_host::list(&plugin_host::root(state))? {
        if plugin.enabled
            && plugin.manifest.runtime.mode == "service"
            && plugin.manifest.runtime.auto_start
        {
            let id = plugin.manifest.id.clone();
            let result = tauri::async_runtime::spawn_blocking(move || {
                crate::plugin_process::maintain_service(&plugin)
            })
            .await
            .map_err(|e| e.to_string())?;
            if let Err(error) = result {
                if let Some(app) = &state.app_handle {
                    let _ = app.emit("plugin-runtime-error", json!({"id":id,"error":error}));
                }
            }
        }
    }
    let settings = crate::current_settings(state)?;
    let ctx = crate::resolve_send_target_context(state, &settings)?;
    let root = plugin_host::root(state);
    #[cfg(desktop)]
    publish_directory(state, &ctx, &settings.sender_name)?;
    let sync_result = synchronize(state, &ctx).await;
    #[cfg(desktop)]
    {
        let local = plugin_host::list(&root)?;
        for value in records(state, &ctx, "tasks")? {
            crate::ensure_integration_context(state, &ctx)?;
            let task: BotTask = match serde_json::from_value(value) {
                Ok(t) => t,
                Err(_) => continue,
            };
            if !matches!(task.protocol_version, 1 | 2) || !valid_component(&task.task_id) {
                continue;
            }
            let Some(plugin) = local
                .iter()
                .find(|p| p.enabled && p.instance_id == task.target_instance_id)
            else {
                continue;
            };
            if task.protocol_version == 2
                && (plugin.manifest.id != IMAGE_PLUGIN_ID || task.download_route.is_none())
            {
                continue;
            }
            if !plugin_host::space_allowed(&root, &plugin.manifest.id, &context_scope(&ctx))? {
                continue;
            }
            let c = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
            let exists:Option<String>=c.query_row("SELECT status FROM bot_execution WHERE endpoint_id=?1 AND owner_scope=?2 AND task_id=?3",params![ctx.profile_id(),ctx.owner_scope,task.task_id],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
            if exists.as_deref() == Some("interrupted") && plugin.manifest.id == IMAGE_PLUGIN_ID {
                Connection::open(&state.db_path).and_then(|c|c.execute("DELETE FROM bot_execution WHERE endpoint_id=?1 AND owner_scope=?2 AND task_id=?3",params![ctx.profile_id(),ctx.owner_scope,task.task_id])).map_err(|e|e.to_string())?;
            } else if exists.is_some() {
                if exists.as_deref() == Some("interrupted") {
                    let event = TaskEvent {
                        task_id: task.task_id.clone(),
                        event_id: format!("interrupted-{}", task.task_id),
                        device_id: plugin_host::device_id(&root)?,
                        timestamp_ms: task.created_at_ms + 1,
                        kind: "interrupted".into(),
                        payload: json!({"error":"应用退出时任务结果未知；重试可能重复产生外部操作，请核实后手动重试"}),
                    };
                    let inserted = Connection::open(&state.db_path)
                        .and_then(|c| {
                            c.execute(
                                "INSERT OR IGNORE INTO bot_records VALUES(?1,?2,'events',?3,?4,1)",
                                params![
                                    ctx.profile_id(),
                                    ctx.owner_scope,
                                    event.event_id,
                                    json!(event).to_string()
                                ],
                            )
                        })
                        .map_err(|e| e.to_string())?
                        > 0;
                    if inserted {
                        notify_chat(state, &ctx, false);
                    }
                }
                continue;
            }
            if task.expires_at_ms < crate::now_ms() {
                let event = TaskEvent {
                    task_id: task.task_id.clone(),
                    event_id: format!("expired-{}", task.task_id),
                    device_id: plugin_host::device_id(&root)?,
                    timestamp_ms: crate::now_ms(),
                    kind: "expired".into(),
                    payload: json!({"error":"任务已超过有效期"}),
                };
                persist_execution_event(
                    &state.db_path,
                    ctx.profile_id(),
                    &ctx.owner_scope,
                    &event,
                    None,
                )?;
                notify_chat(state, &ctx, false);
                continue;
            }
            if cancellation_requested(state, &ctx, &task)? {
                let event = TaskEvent {
                    task_id: task.task_id.clone(),
                    event_id: uuid::Uuid::new_v4().to_string(),
                    device_id: plugin_host::device_id(&root)?,
                    timestamp_ms: crate::now_ms(),
                    kind: "cancelled".into(),
                    payload: json!({"error":"任务在执行前已取消"}),
                };
                persist_execution_event(
                    &state.db_path,
                    ctx.profile_id(),
                    &ctx.owner_scope,
                    &event,
                    None,
                )?;
                notify_chat(state, &ctx, false);
                continue;
            }
            crate::plugin_process::prepare_invoke(&plugin.manifest.id)?;
            let accepted = TaskEvent {
                task_id: task.task_id.clone(),
                event_id: format!("accepted-{}", uuid::Uuid::new_v4()),
                device_id: plugin_host::device_id(&root)?,
                timestamp_ms: crate::now_ms(),
                kind: "running".into(),
                payload: json!({}),
            };
            persist_execution_event(
                &state.db_path,
                ctx.profile_id(),
                &ctx.owner_scope,
                &accepted,
                None,
            )?;
            notify_chat(state, &ctx, false);
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(3));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            let execution = execute(state, &ctx, plugin, &task);
            tokio::pin!(execution);
            loop {
                tokio::select! {
                    result = &mut execution => { result?; break; }
                    _ = interval.tick() => {
                        // Keep progress delivery and incoming control records moving during a long task.
                        if let Err(error) = crate::ensure_integration_context(state, &ctx) {
                            crate::plugin_process::request_cancel(&plugin.manifest.id)?;
                            // Join execution so the process is stopped and its result remains
                            // attached to the original account before this tick exits.
                            let _ = (&mut execution).await;
                            return Err(error);
                        }
                        publish_directory(state, &ctx, &settings.sender_name)?;
                        let _ = synchronize(state, &ctx).await;
                        if cancellation_requested(state, &ctx, &task)? || !plugin_host::space_allowed(&root, &plugin.manifest.id, &context_scope(&ctx))? {
                            crate::plugin_process::request_cancel(&plugin.manifest.id)?;
                        }
                    }
                }
            }
        }
    }
    if hydrate_contexts(state, &ctx)? {
        notify_chat(state, &ctx, true);
    }
    sync_result
}
fn cancellation_requested(
    state: &AppState,
    ctx: &IntegrationTargetContext,
    task: &BotTask,
) -> Result<bool, String> {
    Ok(records(state, ctx, "events")?.iter().any(|event| {
        event["kind"] == "cancel_requested"
            && event["task_id"] == task.task_id
            && event["device_id"] == task.author_device_id
    }))
}
fn is_terminal_status(status: &str) -> bool {
    matches!(
        status,
        "succeeded" | "failed" | "partial_failed" | "cancelled" | "expired" | "interrupted"
    )
}
fn latest_task_event<'a>(events: &'a [Value], task_id: &Value) -> Option<&'a Value> {
    events
        .iter()
        .filter(|event| &event["task_id"] == task_id)
        .max_by_key(|event| {
            (
                is_terminal_status(event["kind"].as_str().unwrap_or("")),
                event["timestamp_ms"].as_i64().unwrap_or(0),
            )
        })
}
fn failed_item_ids(event: &Value) -> Result<Vec<String>, String> {
    if !matches!(event["kind"].as_str(), Some("failed" | "partial_failed")) {
        return Err("该任务没有可重试的失败项".into());
    }
    let items = event["payload"]["items"]
        .as_array()
        .ok_or("任务未返回逐项结果，不能安全重试")?;
    let ids: Vec<String> = items
        .iter()
        .filter(|item| item["status"] == "failed")
        .filter_map(|item| item["item_id"].as_str().map(str::to_owned))
        .collect();
    if ids.is_empty() {
        return Err("没有可重试的失败项".into());
    }
    Ok(ids)
}
#[tauri::command]
pub fn retry_bot_task(state: State<'_, AppState>, task_id: String) -> Result<String, String> {
    retry_task(&state, task_id)
}

pub(crate) fn retry_task(state: &AppState, task_id: String) -> Result<String, String> {
    let settings = crate::current_settings(state)?;
    let ctx = crate::resolve_send_target_context(state, &settings)?;
    let device = plugin_host::device_id(&plugin_host::root(state))?;
    let mut task: BotTask = records(state, &ctx, "tasks")?
        .into_iter()
        .find(|v| v["task_id"] == task_id)
        .ok_or("任务不存在")
        .and_then(|v| serde_json::from_value(v).map_err(|_| "任务数据无效"))?;
    if task.author_device_id != device {
        return Err("请在发起任务的设备上重试".into());
    }
    let events = records(state, &ctx, "events")?;
    let event = latest_task_event(&events, &json!(task_id)).ok_or("任务尚无结果")?;
    task.retry_item_ids = if event["kind"] == "interrupted" {
        vec![]
    } else {
        failed_item_ids(event)?
    };
    task.retry_of = Some(task_id.clone());
    task.original_timestamp_ms.get_or_insert(task.created_at_ms);
    task.original_task_id.get_or_insert(task_id.clone());
    task.task_id = uuid::Uuid::new_v5(
        &uuid::Uuid::NAMESPACE_URL,
        format!(
            "bot-retry:{}:{}",
            task_id,
            event["event_id"].as_str().ok_or("结果标识无效")?
        )
        .as_bytes(),
    )
    .to_string();
    if records(state, &ctx, "tasks")?
        .iter()
        .any(|existing| existing["task_id"] == task.task_id)
    {
        return Ok(task.task_id);
    }
    task.created_at_ms = crate::now_ms();
    task.expires_at_ms = task.created_at_ms + 86400000;
    put(
        state,
        &ctx,
        "tasks",
        &task.task_id,
        &serde_json::to_value(&task).map_err(|e| e.to_string())?,
        true,
    )?;
    BOT_SYNC_WAKE.notify_one();
    Ok(task.task_id)
}
#[tauri::command]
pub fn cancel_bot_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    let settings = crate::current_settings(&state)?;
    let ctx = crate::resolve_send_target_context(&state, &settings)?;
    let device = plugin_host::device_id(&plugin_host::root(&state))?;
    let task: BotTask = records(&state, &ctx, "tasks")?
        .into_iter()
        .find(|v| v["task_id"] == task_id)
        .ok_or("任务不存在")
        .and_then(|v| serde_json::from_value(v).map_err(|_| "任务数据无效"))?;
    if task.author_device_id != device {
        return Err("请在发起任务的设备上取消".into());
    }
    let event = TaskEvent {
        task_id,
        event_id: uuid::Uuid::new_v4().to_string(),
        device_id: device,
        timestamp_ms: crate::now_ms(),
        kind: "cancel_requested".into(),
        payload: json!({}),
    };
    put(
        &state,
        &ctx,
        "events",
        &event.event_id,
        &serde_json::to_value(&event).map_err(|e| e.to_string())?,
        true,
    )?;
    notify_chat(&state, &ctx, false);
    BOT_SYNC_WAKE.notify_one();
    Ok(())
}
fn hydrate_contexts(state: &AppState, ctx: &IntegrationTargetContext) -> Result<bool, String> {
    let c = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
    let mut inserted = false;
    for value in records(state, ctx, "contexts")? {
        if value["metadata_only"] == true {
            continue;
        }
        let Some(filename) = value["filename"].as_str() else {
            continue;
        };
        if filename.contains('/') || filename.contains('\\') {
            continue;
        }
        inserted |= c.execute("INSERT OR IGNORE INTO messages(endpoint_id,owner_scope,filename,sender,timestamp_ms,size,kind,original_name,content,format,message_id,sync_state,marked,marked_tag_ids,marked_due_date) VALUES(?1,?2,?3,?4,?5,?6,'text','message.txt',?7,?8,?9,'synced',?10,?11,?12)",params![ctx.profile_id(),ctx.owner_scope,filename,value["sender"].as_str().unwrap_or("机器人"),value["timestamp_ms"].as_i64().unwrap_or(0),value["text"].as_str().unwrap_or("").len(),value["text"].as_str().unwrap_or(""),value["format"].as_str().unwrap_or("text"),value["id"].as_str(),value["marked"].as_bool().unwrap_or(false),value.get("marked_tag_ids").unwrap_or(&json!([])).to_string(),value["marked_due_date"].as_str()]).map_err(|e|e.to_string())?>0;
    }
    Ok(inserted)
}
#[cfg(desktop)]
fn plain_url(token: &str) -> Option<&str> {
    let token = token.trim_matches(|c: char| "<>\"'()[]，。".contains(c));
    (token.starts_with("https://") || token.starts_with("http://")).then_some(token)
}

#[cfg(desktop)]
fn links(text: &str) -> impl Iterator<Item = &str> {
    text.split_whitespace().filter_map(|token| {
        if let Some((_, target)) = token.rsplit_once("](") {
            plain_url(target)
        } else {
            plain_url(token)
        }
    })
}

#[cfg(desktop)]
fn text_inputs(
    inputs: &mut Vec<TaskInput>,
    stage: &Path,
    retry: &[String],
    key: &str,
    text: &str,
    timestamp: i64,
) -> Result<(), String> {
    if !text.trim().is_empty()
        && text
            .split_whitespace()
            .any(|token| plain_url(token).is_none())
    {
        let item_id = format!("{:x}", Sha256::digest(format!("text:{key}").as_bytes()));
        if retry.is_empty() || retry.contains(&item_id) {
            let path = stage.join(&item_id);
            fs::write(&path, text).map_err(|_| "无法暂存文字")?;
            let date = time::OffsetDateTime::from_unix_timestamp(timestamp.div_euclid(1000))
                .unwrap_or(time::OffsetDateTime::UNIX_EPOCH);
            inputs.push(TaskInput {
                timestamp_ms: Some(timestamp),
                item_id,
                name: format!(
                    "文字_{:04}{:02}{:02}_{:02}{:02}{:02}.txt",
                    date.year(),
                    date.month() as u8,
                    date.day(),
                    date.hour(),
                    date.minute(),
                    date.second()
                ),
                local_path: Some(path.to_string_lossy().into()),
                url: None,
                error: None,
            });
        }
    }
    for url in links(text) {
        let item_id = format!("{:x}", Sha256::digest(url.as_bytes()));
        if (!retry.is_empty() && !retry.contains(&item_id))
            || inputs.iter().any(|i| i.item_id == item_id)
        {
            continue;
        }
        inputs.push(TaskInput {
            timestamp_ms: Some(timestamp),
            item_id,
            name: "下载文件".into(),
            local_path: None,
            url: Some(url.into()),
            error: None,
        });
    }
    Ok(())
}

#[cfg(desktop)]
async fn inputs(
    state: &AppState,
    ctx: &IntegrationTargetContext,
    task: &BotTask,
    config: &Value,
    progress: &mut impl FnMut(&Value) -> Result<(), String>,
) -> Result<Vec<TaskInput>, String> {
    let mut inputs = vec![];
    let stage = plugin_host::root(state)
        .join("task-inputs")
        .join(task_scope_key(ctx))
        .join(&task.task_id);
    fs::create_dir_all(&stage).map_err(|e| e.to_string())?;
    for reference in &task.references {
        if task.protocol_version == 2 && reference.kind == "text" {
            text_inputs(
                &mut inputs,
                &stage,
                &task.retry_item_ids,
                &reference.filename,
                reference.content.as_deref().unwrap_or_default(),
                reference.timestamp_ms,
            )?;
            continue;
        }
        let reference_item_id = format!("{:x}", Sha256::digest(reference.filename.as_bytes()));
        if !task.retry_item_ids.is_empty() && !task.retry_item_ids.contains(&reference_item_id) {
            continue;
        }
        if reference.kind == "text" {
            continue;
        }
        let mut input = TaskInput {
            timestamp_ms: Some(reference.timestamp_ms),
            item_id: format!("{:x}", Sha256::digest(reference.filename.as_bytes())),
            name: reference.original_name.clone(),
            local_path: None,
            url: None,
            error: None,
        };
        let path = stage.join(&input.item_id);
        let ceiling = if task.protocol_version == 2 {
            102400
        } else {
            100
        };
        let max = if task.protocol_version == 2 {
            config["max_size_mib"].as_u64().unwrap_or(2048)
        } else {
            100
        }
        .clamp(1, ceiling)
            * 1024
            * 1024;
        let mut reported_transfer = false;
        let fetched = tokio::time::timeout(
            std::time::Duration::from_secs(
                config["timeout_seconds"]
                    .as_u64()
                    .unwrap_or(600)
                    .clamp(1, 600),
            ),
            async {
                use futures_util::StreamExt;
                use tokio::io::{AsyncReadExt, AsyncWriteExt};
                let message = crate::db::get_message_for_scope(
                    &state.db_path,
                    ctx.profile_id(),
                    &ctx.owner_scope,
                    &reference.filename,
                )
                .map_err(|e| e.to_string())?
                .ok_or("引用消息已不可用")?;
                if reference.file_hash.is_some() && reference.file_hash != message.file_hash {
                    return Err("引用附件版本已变化".into());
                }
                if reference.etag.is_some() && reference.etag != message.etag {
                    return Err("引用附件版本已变化".into());
                }
                if reference.size != message.size || reference.timestamp_ms != message.timestamp_ms
                {
                    return Err("引用附件版本已变化".into());
                }
                if message.size > max as i64 {
                    return Err("引用附件超过大小限制".into());
                }
                let mut output = tokio::fs::File::create(&path)
                    .await
                    .map_err(|_| "无法暂存引用附件")?;
                let mut digest = Sha256::new();
                let mut size = 0;
                if let Some(local_path) = message.local_path.filter(|p| Path::new(p).is_file()) {
                    let mut source = tokio::fs::File::open(local_path)
                        .await
                        .map_err(|_| "无法打开引用附件")?;
                    let mut buffer = vec![0; 128 * 1024];
                    loop {
                        let n = source
                            .read(&mut buffer)
                            .await
                            .map_err(|_| "读取引用附件失败")?;
                        if n == 0 {
                            break;
                        }
                        if crate::plugin_process::is_cancelled(IMAGE_PLUGIN_ID)
                            && task.protocol_version == 2
                        {
                            return Err("插件任务已取消".into());
                        }
                        size += n as u64;
                        if size > max {
                            return Err("引用附件超过大小限制".into());
                        }
                        digest.update(&buffer[..n]);
                        output
                            .write_all(&buffer[..n])
                            .await
                            .map_err(|_| "写入引用附件失败")?;
                    }
                } else {
                    let mut stream = match &ctx.provider {
                        crate::storage_provider::ProviderConfig::Webdav(endpoint) => {
                            let response = crate::webdav::download_file_stream(
                                &state.http,
                                endpoint,
                                &message.remote_path.unwrap_or_else(|| {
                                    crate::filenames::message_remote_path(
                                        &message.filename,
                                        message.timestamp_ms,
                                    )
                                }),
                            )
                            .await?;
                            if reference.etag.is_some() && reference.etag != response.etag {
                                return Err("远端引用附件版本已变化".into());
                            }
                            response.stream
                        }
                        crate::storage_provider::ProviderConfig::Supabase(profile) => {
                            let identity = crate::db::get_message_sync_identity(
                                &state.db_path,
                                ctx.profile_id(),
                                &ctx.owner_scope,
                                &reference.filename,
                            )
                            .map_err(|e| e.to_string())?
                            .ok_or("附件身份不可用")?;
                            let object = crate::db::get_attachment_object_path_for_message(
                                &state.db_path,
                                ctx.profile_id(),
                                &ctx.owner_scope,
                                &identity.0,
                            )
                            .map_err(|e| e.to_string())?
                            .ok_or("附件原件不可用")?;
                            let response = crate::supabase_sync::download_storage_object_stream(
                                &state.http,
                                profile.supabase.as_ref().unwrap(),
                                ctx.session.as_ref().unwrap(),
                                &object,
                            )
                            .await?;
                            response.stream
                        }
                    };
                    let idle = std::time::Duration::from_secs(
                        config["idle_timeout_seconds"]
                            .as_u64()
                            .unwrap_or(30)
                            .clamp(1, 30),
                    );
                    let mut meter = TransferMeter::new(u64::try_from(message.size).ok().filter(|&size| size > 0));
                    while let Some(chunk) = tokio::time::timeout(idle, stream.next())
                        .await
                        .map_err(|_| "读取引用附件超时")?
                    {
                        if crate::plugin_process::is_cancelled(IMAGE_PLUGIN_ID)
                            && task.protocol_version == 2
                        {
                            return Err("插件任务已取消".into());
                        }
                        let chunk = chunk.map_err(|_| "读取引用附件失败")?;
                        size += chunk.len() as u64;
                        if size > max {
                            return Err("引用附件超过大小限制".into());
                        }
                        digest.update(&chunk);
                        output
                            .write_all(&chunk)
                            .await
                            .map_err(|_| "写入引用附件失败")?;
                        if let Some(sample) = meter.sample(size) {
                            progress(&json!({"item":{"item_id":input.item_id,"name":input.name,"status":"downloading","transfer":sample}}))?;
                            reported_transfer = true;
                        }
                    }
                }
                if let Some(hash) = &reference.file_hash {
                    if format!("{:x}", digest.finalize()) != *hash {
                        return Err("引用附件哈希不符".into());
                    }
                }
                output.flush().await.map_err(|_| "写入引用附件失败")?;
                Ok(path.to_string_lossy().to_string())
            },
        )
        .await
        .unwrap_or_else(|_| Err("引用附件下载超时".into()));
        if reported_transfer {
            progress(
                &json!({"item":{"item_id":input.item_id,"name":input.name,"status":"preparing"}}),
            )?;
        }
        match fetched {
            Ok(path) => input.local_path = Some(path),
            Err(error) => {
                let _ = fs::remove_file(&path);
                input.error = Some(error);
            }
        }
        inputs.push(input);
    }
    if task.protocol_version == 2 {
        text_inputs(
            &mut inputs,
            &stage,
            &task.retry_item_ids,
            "body",
            task.download_body.as_deref().unwrap_or_default(),
            task.original_timestamp_ms.unwrap_or(task.created_at_ms),
        )?;
    }
    let texts = (task.protocol_version == 1)
        .then_some(task.text.as_str())
        .into_iter()
        .chain(
            task.references
                .iter()
                .filter(|_| task.protocol_version == 1)
                .filter_map(|r| r.content.as_deref()),
        );
    for text in texts {
        for part in text.split_whitespace() {
            let url = part.trim_matches(|c: char| "<>\"'()[]，。".contains(c));
            if url.starts_with("https://") || url.starts_with("http://") {
                let item_id = format!("{:x}", Sha256::digest(url.as_bytes()));
                if !task.retry_item_ids.is_empty() && !task.retry_item_ids.contains(&item_id) {
                    continue;
                }
                if inputs.iter().any(|i| i.item_id == item_id) {
                    continue;
                }
                let name = url::Url::parse(url)
                    .ok()
                    .and_then(|u| {
                        u.path_segments()
                            .and_then(|mut s| s.next_back())
                            .map(str::to_owned)
                    })
                    .filter(|s| !s.is_empty())
                    .unwrap_or("image".into());
                inputs.push(TaskInput {
                    timestamp_ms: Some(task.original_timestamp_ms.unwrap_or(task.created_at_ms)),
                    item_id,
                    name,
                    local_path: None,
                    url: Some(url.into()),
                    error: None,
                });
            }
        }
    }
    if inputs.len() > 50 {
        return Err("单次任务最多 50 项".into());
    }
    Ok(inputs)
}
#[cfg(desktop)]
fn task_scope_key(ctx: &IntegrationTargetContext) -> String {
    format!("{:x}", Sha256::digest(context_scope(ctx)))
}

#[cfg(desktop)]
async fn execute(
    state: &AppState,
    ctx: &IntegrationTargetContext,
    plugin: &plugin_host::InstalledPlugin,
    task: &BotTask,
) -> Result<(), String> {
    let result = async {
        let plugin_root = plugin_host::root(state);
        let mut config = plugin.config.clone();
        let mut journal_task = task.task_id.as_str();
        if task.protocol_version == 2 {
            journal_task = task.original_task_id.as_deref().unwrap_or(&task.task_id);
            if !valid_component(journal_task) { return Err("下载任务标识无效".into()); }
            let original = if journal_task != task.task_id {
                records(state, ctx, "tasks")?.into_iter().find(|v| v["task_id"] == journal_task && v["target_instance_id"] == task.target_instance_id && v["author_device_id"] == task.author_device_id)
                    .ok_or("原始下载任务不存在")?
            } else { serde_json::to_value(task).map_err(|_| "下载任务无效")? };
            let requested = original["download_route"].as_str().ok_or("下载任务缺少出口")?;
            let route = if requested == "default" { plugin.config["default_route"].as_str().unwrap_or("direct") } else { requested };
            let connection = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
            connection.execute("INSERT OR IGNORE INTO bot_records VALUES(?1,?2,'download-routes',?3,?4,0)", params![ctx.profile_id(), ctx.owner_scope, journal_task, json!(route).to_string()]).map_err(|e|e.to_string())?;
            let frozen: String = connection.query_row("SELECT payload FROM bot_records WHERE endpoint_id=?1 AND owner_scope=?2 AND kind='download-routes' AND id=?3", params![ctx.profile_id(), ctx.owner_scope, journal_task], |row| row.get(0)).map_err(|e| e.to_string())?;
            let frozen: String = serde_json::from_str(&frozen).map_err(|_| "下载出口记录无效")?;
            match plugin_host::download_execution_config(&plugin_root, plugin, &frozen) {
                Ok(resolved) => config = resolved,
                Err(error) => config["route_error"] = json!(error),
            }
        }
        if plugin.manifest.id == IMAGE_PLUGIN_ID {
            config["save_filename_rule"] = json!(crate::current_settings(state)?.save_filename_rule);
        }
        let db_path = state.db_path.clone();
        let endpoint = ctx.profile_id().to_string();
        let owner = ctx.owner_scope.clone();
        let device = plugin_host::device_id(&plugin_root)?;
        let app = state.app_handle.clone();
        let scope = context_scope(ctx);
        let task_id = task.task_id.clone();
        let mut last_samples = std::collections::HashMap::new();
        let mut progress = move |payload: &Value| {
            let timestamp_ms = crate::now_ms();
            let item = &payload["item"];
            let payload = match item["status"].as_str() {
                Some("downloading") if !item["transfer"].is_null() => {
                    let id = item["item_id"].as_str().ok_or("下载进度缺少任务项标识")?;
                    // Leave ordinary item results readable by clients that predate transfer samples.
                    if last_samples.get(id).is_some_and(|last| timestamp_ms - last < 3_000) { return Ok(()); }
                    last_samples.insert(id.to_owned(), timestamp_ms);
                    json!({"transfer_item":item})
                }
                Some("preparing") => json!({"transfer_item":item}),
                _ => payload.clone(),
            };
            let event = TaskEvent {
                task_id: task_id.clone(),
                event_id: uuid::Uuid::new_v4().to_string(),
                device_id: device.clone(),
                timestamp_ms,
                kind: "progress".into(),
                payload,
            };
            let serialized = serde_json::to_string(&event).map_err(|e| e.to_string())?;
            Connection::open(&db_path)
                .and_then(|c| c.execute("INSERT INTO bot_records VALUES(?1,?2,'events',?3,?4,1)", params![endpoint, owner, event.event_id, serialized]))
                .map_err(|e| e.to_string())?;
            if let Some(app) = &app {
                let _ = app.emit("bot-task-progress", &event);
                let _ = app.emit("bot-chat-updated", json!({"scope":scope,"messagesChanged":false}));
            }
            Ok(())
        };
        let input = inputs(state, ctx, task, &config, &mut progress).await?;
        crate::ensure_integration_context(state, ctx)?;
        if input.is_empty() && plugin.manifest.id == IMAGE_PLUGIN_ID {
            return Err(if task.protocol_version == 2 { "请引用消息或输入要下载的内容" } else { "请引用图片消息或提供图片直链" }.to_string());
        }
        let mut root = plugin_root.join(&plugin.manifest.id).join("data");
        if task.protocol_version == 2 { root = root.join(task_scope_key(ctx)); }
        let root = root.join(journal_task);
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let request = InvokeRequest {
            protocol_version: task.protocol_version,
            kind: "invoke".into(),
            request_id: task.task_id.clone(),
            task_id: task.task_id.clone(),
            text: task.text.clone(),
            config,
            inputs: input,
            state_dir: root.to_string_lossy().into(),
        };
        let plugin = plugin.clone();
        tauri::async_runtime::spawn_blocking(move || {
            crate::plugin_process::invoke_with_progress(&plugin, &request, progress)
        })
        .await
        .map_err(|e| e.to_string())?
    }
    .await;
    let _ = fs::remove_dir_all(
        plugin_host::root(state)
            .join("task-inputs")
            .join(task_scope_key(ctx))
            .join(&task.task_id),
    );
    let (status, payload) = match result {
        Ok(v) => {
            let failed = v["items"]
                .as_array()
                .map(|items| items.iter().filter(|i| i["status"] != "succeeded").count())
                .unwrap_or(1);
            (
                if failed == 0 {
                    "succeeded"
                } else if failed == v["items"].as_array().map(Vec::len).unwrap_or(0) {
                    "failed"
                } else {
                    "partial_failed"
                },
                v,
            )
        }
        Err(e) => (
            if e == "插件任务已取消" {
                "cancelled"
            } else {
                "failed"
            },
            json!({"error":e}),
        ),
    };
    let event = TaskEvent {
        task_id: task.task_id.clone(),
        event_id: uuid::Uuid::new_v4().to_string(),
        device_id: plugin_host::device_id(&plugin_host::root(state))?,
        timestamp_ms: crate::now_ms(),
        kind: status.into(),
        payload: payload.clone(),
    };
    let reply_id = uuid::Uuid::new_v5(
        &uuid::Uuid::NAMESPACE_URL,
        format!("bot-result:{}", task.task_id).as_bytes(),
    )
    .to_string();
    let filename = crate::external_source_filename(
        &plugin.manifest.name,
        "message.txt",
        task.created_at_ms + 1,
        &crate::ExternalSourceIdentity {
            kind: "bot-result".into(),
            channel_id: ctx.profile_id().into(),
            message_id: reply_id.clone(),
        },
    );
    let mut lines = vec![format!(
        "{} · {}：{}",
        plugin.manifest.name,
        crate::current_settings(state)?.sender_name,
        if status == "succeeded" {
            "下载完成"
        } else {
            "处理结束，部分内容未成功"
        }
    )];
    if let Some(error) = payload["error"].as_str() {
        lines.push(error.into());
    }
    if let Some(items) = payload["items"].as_array() {
        for item in items {
            lines.push(format!(
                "{} · {}",
                item["name"].as_str().unwrap_or("图片"),
                if item["status"] == "succeeded" {
                    item["saved_path"].as_str().unwrap_or("已保存")
                } else {
                    item["error"].as_str().unwrap_or("失败")
                }
            ));
        }
    }
    let reply = json!({"id":reply_id,"filename":filename,"sender":plugin.config["name"].as_str().unwrap_or(&plugin.manifest.name),"timestamp_ms":task.created_at_ms+1,"text":lines.join("\n"),"format":"text","references":[{"filename":task.message_filename,"sender":"我","kind":"text","content":task.text,"original_name":"message.txt","timestamp_ms":task.created_at_ms}],"task_id":task.task_id,"bot_icon":(plugin.manifest.id == IMAGE_PLUGIN_ID).then_some("download")});
    persist_execution_event(
        &state.db_path,
        ctx.profile_id(),
        &ctx.owner_scope,
        &event,
        Some((&reply_id, &reply)),
    )?;
    let _ = state
        .app_handle
        .as_ref()
        .map(|app| app.emit("bot-task-result", &event));
    hydrate_contexts(state, ctx)?;
    notify_chat(state, ctx, true);
    crate::notify_supabase_outbox_pending(state);
    let _ = synchronize(state, ctx).await;
    Ok(())
}
fn persist_execution_event(
    path: &Path,
    endpoint: &str,
    owner: &str,
    event: &TaskEvent,
    reply: Option<(&str, &Value)>,
) -> Result<(), String> {
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO bot_execution VALUES(?1,?2,?3,?4,?5) ON CONFLICT(endpoint_id,owner_scope,task_id) DO UPDATE SET status=excluded.status,result=excluded.result",params![endpoint,owner,event.task_id,event.kind,event.payload.to_string()]).map_err(|e|e.to_string())?;
    tx.execute(
        "INSERT INTO bot_records VALUES(?1,?2,'events',?3,?4,1)",
        params![
            endpoint,
            owner,
            event.event_id,
            serde_json::to_string(event).map_err(|e| e.to_string())?
        ],
    )
    .map_err(|e| e.to_string())?;
    if let Some((id, payload)) = reply {
        tx.execute(
            "INSERT INTO bot_records VALUES(?1,?2,'contexts',?3,?4,1)",
            params![endpoint, owner, id, payload.to_string()],
        )
        .map_err(|e| e.to_string())?;
        if !owner.is_empty() {
            let filename = payload["filename"]
                .as_str()
                .ok_or("机器人回复缺少文件标识")?;
            let text = payload["text"].as_str().unwrap_or_default();
            let timestamp = payload["timestamp_ms"]
                .as_i64()
                .unwrap_or(event.timestamp_ms);
            let sender = payload["sender"].as_str().unwrap_or("机器人");
            tx.execute("INSERT INTO messages(endpoint_id,owner_scope,filename,sender,timestamp_ms,size,kind,original_name,content,format,message_id,sync_state) VALUES(?1,?2,?3,?4,?5,?6,'text','message.txt',?7,'text',?8,'pending')",params![endpoint,owner,filename,sender,timestamp,text.len(),text,id]).map_err(|e|e.to_string())?;
            let operation = crate::outbox_operation_with_id(
                &uuid::Uuid::new_v5(
                    &uuid::Uuid::NAMESPACE_URL,
                    format!("bot-reply-outbox:{id}").as_bytes(),
                )
                .to_string(),
                endpoint,
                owner,
                "message",
                id,
                "upsert",
                0,
                json!({"sender":sender,"timestampMs":timestamp,"size":text.len(),"kind":"text","originalName":"message.txt","content":text,"format":"text","legacyFilename":filename,"marked":false,"markedTagIds":[],"markedPinned":false}),
            )?;
            crate::db::enqueue_outbox(&tx, &operation).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}
pub fn start(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let state = app.state::<AppState>();
            let result = tick(&state).await;
            if let Err(error) = &result {
                let _ = app.emit("bot-runtime-status", json!({"error":error}));
            }
            let delay = bot_poll_delay(&state, result.is_err());
            drop(state);
            tokio::select! {
                _ = BOT_SYNC_WAKE.notified() => {},
                _ = tokio::time::sleep(delay) => {},
            }
        }
    });
}

fn bot_poll_delay(state: &AppState, failed: bool) -> std::time::Duration {
    if failed {
        return std::time::Duration::from_secs(15);
    }
    let awaiting = (|| -> Result<bool, String> {
        let settings = crate::current_settings(state)?;
        let ctx = crate::resolve_send_target_context(state, &settings)?;
        let device = plugin_host::device_id(&plugin_host::root(state))?;
        #[cfg(desktop)]
        if scoped_instances(state, &ctx, &settings.sender_name)?
            .iter()
            .any(|instance| instance.enabled)
        {
            return Ok(true);
        }
        let events = records(state, &ctx, "events")?;
        let now = crate::now_ms();
        Ok(records(state, &ctx, "tasks")?.iter().any(|task| {
            if task["author_device_id"] != device
                || task["expires_at_ms"].as_i64().unwrap_or_default() <= now
            {
                return false;
            }
            let latest = latest_task_event(&events, &task["task_id"]);
            if latest
                .is_some_and(|event| is_terminal_status(event["kind"].as_str().unwrap_or_default()))
            {
                return false;
            }
            latest
                .and_then(|event| event["timestamp_ms"].as_i64())
                .or_else(|| task["created_at_ms"].as_i64())
                .is_some_and(|activity| now.saturating_sub(activity) < 120_000)
        }))
    })()
    .unwrap_or(false);
    std::time::Duration::from_secs(if awaiting { 3 } else { 15 })
}

#[tauri::command]
pub fn get_bot_scope(state: State<'_, AppState>) -> Result<String, String> {
    let settings = crate::current_settings(&state)?;
    let ctx = crate::resolve_send_target_context(&state, &settings)?;
    Ok(context_scope(&ctx))
}
pub(crate) fn context_scope(ctx: &IntegrationTargetContext) -> String {
    let remote = match &ctx.provider {
        crate::storage_provider::ProviderConfig::Webdav(endpoint) => endpoint.url.clone(),
        crate::storage_provider::ProviderConfig::Supabase(profile) => profile
            .supabase
            .as_ref()
            .map(|config| {
                format!(
                    "{}:{}",
                    config.api_url.trim_end_matches('/'),
                    config.space_id
                )
            })
            .unwrap_or_default(),
    };
    format!(
        "{:x}",
        Sha256::digest(
            json!([ctx.profile_id(), ctx.owner_scope, remote])
                .to_string()
                .as_bytes()
        )
    )
}
#[tauri::command]
pub fn list_plugins(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let root = plugin_host::root(&state);
    let scope = crate::current_settings(&state)
        .and_then(|settings| crate::resolve_send_target_context(&state, &settings))
        .map(|ctx| context_scope(&ctx))
        .ok();
    plugin_host::list(&root)?
        .into_iter()
        .map(|plugin| {
            let allowed = scope
                .as_ref()
                .map(|scope| plugin_host::space_allowed(&root, &plugin.manifest.id, scope))
                .transpose()?
                .unwrap_or(false);
            let mut value = serde_json::to_value(plugin).map_err(|e| e.to_string())?;
            value["current_space_allowed"] = json!(allowed);
            value["has_current_space"] = json!(scope.is_some());
            let versions = root
                .join(value["manifest"]["id"].as_str().unwrap_or(""))
                .join("versions");
            value["available_versions"] = json!(fs::read_dir(versions)
                .ok()
                .into_iter()
                .flatten()
                .filter_map(Result::ok)
                .filter(|entry| entry.path().join("plugin.json").is_file())
                .map(|entry| entry.file_name().to_string_lossy().to_string())
                .collect::<Vec<_>>());
            Ok(value)
        })
        .collect()
}
#[tauri::command]
pub fn set_plugin_secret(
    state: State<'_, AppState>,
    id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    #[cfg(desktop)]
    crate::plugin_process::stop(&id)?;
    let root = plugin_host::root(&state);
    plugin_host::set_secret(&root, &id, &key, &value)?;
    #[cfg(desktop)]
    {
        let plugin = plugin_host::get(&root, &id)?;
        if plugin.enabled
            && plugin.manifest.runtime.mode == "service"
            && plugin.manifest.runtime.auto_start
        {
            crate::plugin_process::start(&plugin)?;
        }
    }
    Ok(())
}
#[tauri::command]
pub fn list_download_proxies(
    state: State<'_, AppState>,
) -> Result<Vec<plugin_host::DownloadProxyProfile>, String> {
    plugin_host::download_profiles(&plugin_host::root(&state))
}

#[tauri::command]
pub fn save_download_proxy(
    state: State<'_, AppState>,
    id: Option<String>,
    name: String,
    address: String,
    credentials: Option<(String, String)>,
) -> Result<(), String> {
    plugin_host::save_download_profile(&plugin_host::root(&state), id, name, address, credentials)
}

#[tauri::command]
pub fn remove_download_proxy(
    state: State<'_, AppState>,
    id: String,
    replacement: Option<String>,
) -> Result<(), String> {
    plugin_host::remove_download_profile(&plugin_host::root(&state), &id, replacement.as_deref())
}

#[tauri::command]
pub async fn check_download_settings(
    state: State<'_, AppState>,
    proxy_id: Option<String>,
    aria2c_path: Option<String>,
) -> Result<String, String> {
    #[cfg(desktop)]
    {
        let root = plugin_host::root(&state);
        let plugin = plugin_host::get(&root, IMAGE_PLUGIN_ID)?;
        let is_engine_check = aria2c_path.is_some();
        let mut config = plugin_host::download_execution_config(
            &root,
            &plugin,
            proxy_id.as_deref().unwrap_or("direct"),
        )?;
        if let Some(path) = aria2c_path {
            config["aria2c_path"] = json!(path);
        }
        tauri::async_runtime::spawn_blocking(move || {
            crate::image_bot::check_download(&config, is_engine_check)
        })
        .await
        .map_err(|_| "下载设置检查中断".to_string())?
    }
    #[cfg(not(desktop))]
    {
        let _ = (state, proxy_id, aria2c_path);
        Err("请在执行电脑检查下载设置".into())
    }
}

#[tauri::command]
pub fn test_plugin_environment(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let plugin = plugin_host::get(&plugin_host::root(&state), &id)?;
    crate::plugin_protocol::validate_config(&plugin.manifest, &plugin.config)?;
    plugin_host::command(&plugin)?;
    plugin_host::secrets(&plugin)?;
    Ok(json!({"message":"入口、配置和凭据检查通过"}))
}
#[tauri::command]
pub fn set_plugin_auto_start(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    plugin_host::set_auto_start(&plugin_host::root(&state), &id, enabled)
}
#[tauri::command]
pub fn rollback_plugin(
    state: State<'_, AppState>,
    id: String,
    version: String,
) -> Result<plugin_host::InstalledPlugin, String> {
    plugin_host::rollback(&plugin_host::root(&state), &id, &version)
}
#[tauri::command]
pub fn set_plugin_space(
    state: State<'_, AppState>,
    id: String,
    allowed: bool,
) -> Result<(), String> {
    let settings = crate::current_settings(&state)?;
    let ctx = crate::resolve_send_target_context(&state, &settings)?;
    plugin_host::set_space_allowed(
        &plugin_host::root(&state),
        &id,
        &context_scope(&ctx),
        allowed,
    )
}
#[tauri::command]
pub fn configure_plugin(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
    config: Value,
) -> Result<(), String> {
    #[cfg(desktop)]
    crate::plugin_process::stop(&id)?;
    let root = plugin_host::root(&state);
    plugin_host::configure(&root, &id, enabled, config)?;
    #[cfg(desktop)]
    {
        let plugin = plugin_host::get(&root, &id)?;
        if enabled
            && plugin.manifest.runtime.mode == "service"
            && plugin.manifest.runtime.auto_start
        {
            crate::plugin_process::start(&plugin)?;
        }
    }
    Ok(())
}
#[tauri::command]
pub fn import_plugin(
    state: State<'_, AppState>,
    path: String,
) -> Result<plugin_host::InstalledPlugin, String> {
    if cfg!(not(desktop)) {
        return Err("当前设备仅支持调用机器人".into());
    }
    plugin_host::install(
        &plugin_host::root(&state),
        Path::new(&path),
        "local_import",
        None,
    )
}
#[tauri::command]
pub fn uninstall_plugin(
    state: State<'_, AppState>,
    id: String,
    keep_data: bool,
) -> Result<(), String> {
    #[cfg(desktop)]
    crate::plugin_process::stop(&id)?;
    let root = plugin_host::root(&state);
    if let Ok(settings) = crate::current_settings(&state) {
        if let Ok(ctx) = crate::resolve_send_target_context(&state, &settings) {
            if let Some(mut instance) = plugin_host::instances(&root, &settings.sender_name)?
                .into_iter()
                .find(|instance| instance.plugin_id == id)
            {
                instance.enabled = false;
                put(
                    &state,
                    &ctx,
                    "directory",
                    &instance.instance_id,
                    &serde_json::to_value(&instance).map_err(|e| e.to_string())?,
                    true,
                )?;
            }
        }
    }
    plugin_host::uninstall(&root, &id, keep_data)
}
#[tauri::command]
pub fn plugin_service(state: State<'_, AppState>, id: String, start: bool) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let plugin = plugin_host::get(&plugin_host::root(&state), &id)?;
        if start {
            crate::plugin_process::start(&plugin)
        } else {
            crate::plugin_process::stop(&id)
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = (state, id, start);
        Err("当前设备不支持执行插件".into())
    }
}
#[tauri::command]
pub fn plugin_runtime_status(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let plugin = plugin_host::get(&plugin_host::root(&state), &id)?;
    #[cfg(desktop)]
    let running = crate::plugin_process::running(&id);
    #[cfg(not(desktop))]
    let running = false;
    let path = plugin_host::root(&state).join(&id).join("plugin.log");
    let log = if path.is_file() {
        use std::io::{Read, Seek, SeekFrom};
        let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
        let size = file.metadata().map_err(|e| e.to_string())?.len();
        file.seek(SeekFrom::Start(size.saturating_sub(65536)))
            .map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        file.take(65536)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        String::from_utf8_lossy(&bytes).to_string()
    } else {
        String::new()
    };
    Ok(json!({"id":id,"running":running,"mode":plugin.manifest.runtime.mode,"log":log}))
}
#[tauri::command]
pub async fn list_bot_instances(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let settings = crate::current_settings(&state)?;
    let ctx = crate::resolve_send_target_context(&state, &settings)?;
    // Discovery must not depend on the caller hosting plugins or waiting for
    // the background task consumer to finish its next synchronization cycle.
    tokio::time::timeout(
        std::time::Duration::from_secs(10),
        receive_records(&state, &ctx, &["directory"]),
    )
    .await
    .map_err(|_| "刷新远端机器人目录超时".to_string())??;
    crate::ensure_integration_context(&state, &ctx)?;
    let mut values = records(&state, &ctx, "directory")?;
    #[cfg(desktop)]
    for instance in scoped_instances(&state, &ctx, &settings.sender_name)? {
        let value = serde_json::to_value(instance).map_err(|e| e.to_string())?;
        values.retain(|v| v["instance_id"] != value["instance_id"]);
        values.push(value);
    }
    Ok(values
        .into_iter()
        .filter(|value| value["enabled"] == true)
        .collect())
}
#[tauri::command]
pub fn list_bot_events(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let settings = crate::current_settings(&state)?;
    let ctx = crate::resolve_send_target_context(&state, &settings)?;
    records(&state, &ctx, "events")
}
#[tauri::command]
pub fn list_bot_tasks(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let settings = crate::current_settings(&state)?;
    let ctx = crate::resolve_send_target_context(&state, &settings)?;
    let device = plugin_host::device_id(&plugin_host::root(&state))?;
    let mut events = records(&state, &ctx, "events")?;
    events.sort_by_key(|e| e["timestamp_ms"].as_i64().unwrap_or(0));
    let mut tasks = records(&state, &ctx, "tasks")?;
    let pending: std::collections::HashSet<String> = {
        let conn = Connection::open(&state.db_path).map_err(|e| e.to_string())?;
        let mut query = conn.prepare("SELECT id FROM bot_records WHERE endpoint_id=?1 AND owner_scope=?2 AND kind='tasks' AND pending=1").map_err(|e| e.to_string())?;
        let rows = query
            .query_map(params![ctx.profile_id(), ctx.owner_scope], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?
    };
    for task in &mut tasks {
        task["pending_delivery"] = json!(task["task_id"]
            .as_str()
            .is_some_and(|id| pending.contains(id)));
        let latest = latest_task_event(&events, &task["task_id"]);
        task["status"] = latest.map(|e| e["kind"].clone()).unwrap_or_else(|| {
            json!(
                if task["expires_at_ms"].as_i64().unwrap_or(0) < crate::now_ms() {
                    "expired"
                } else {
                    "waiting_device"
                }
            )
        });
        task["can_cancel"] = json!(
            task["author_device_id"] == device
                && !matches!(
                    task["status"].as_str(),
                    Some(
                        "succeeded"
                            | "failed"
                            | "partial_failed"
                            | "cancelled"
                            | "expired"
                            | "interrupted"
                    )
                )
        );
        task["can_retry"] = json!(
            task["author_device_id"] == device
                && latest.is_some_and(
                    |event| event["kind"] == "interrupted" || failed_item_ids(event).is_ok()
                )
        );
    }
    tasks.sort_by_key(|t| std::cmp::Reverse(t["created_at_ms"].as_i64().unwrap_or(0)));
    Ok(tasks)
}
#[tauri::command]
pub fn get_message_contexts(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let settings = crate::current_settings(&state)?;
    let ctx = crate::resolve_send_target_context(&state, &settings)?;
    records(&state, &ctx, "contexts")
}
#[tauri::command]
pub fn set_plugin_market(state: State<'_, AppState>, url: String) -> Result<(), String> {
    plugin_host::set_market_url(&plugin_host::root(&state), url)
}
#[tauri::command]
pub fn get_plugin_market(state: State<'_, AppState>) -> Result<String, String> {
    plugin_host::market_url(&plugin_host::root(&state))
}
#[tauri::command]
pub async fn fetch_plugin_market(state: State<'_, AppState>) -> Result<Value, String> {
    let index = plugin_host::market_fetch(&plugin_host::root(&state), &state.http).await?;
    let mut value = serde_json::to_value(index).map_err(|e| e.to_string())?;
    if let Some(plugins) = value["plugins"].as_array_mut() {
        for plugin in plugins {
            let metadata: plugin_host::MarketPlugin =
                serde_json::from_value(plugin.clone()).map_err(|e| e.to_string())?;
            let supported = plugin["artifacts"].as_array().is_some_and(|artifacts| {
                artifacts.iter().any(|artifact| {
                    artifact["platform"] == std::env::consts::OS
                        && artifact["arch"] == std::env::consts::ARCH
                })
            });
            let reason = if let Err(error) = plugin_host::market_compatibility(&metadata) {
                error
            } else if !supported {
                "没有适合本机系统与架构的插件包".into()
            } else {
                String::new()
            };
            plugin["unavailable_reason"] = json!(reason);
        }
    }
    Ok(value)
}
#[tauri::command]
pub async fn install_market_plugin(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<plugin_host::InstalledPlugin, String> {
    plugin_host::market_install(&plugin_host::root(&state), &state.http, &id, &app).await
}

#[cfg(test)]
mod tests {
    #[test]
    fn acknowledged_tasks_cannot_be_replaced_by_remote_payloads() {
        let root = std::env::temp_dir().join(format!("bot-immutable-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("state.sqlite");
        super::initialize(&path).unwrap();
        for kind in ["tasks", "events", "contexts"] {
            super::put_record(
                &path,
                "space",
                "owner",
                kind,
                "id",
                &serde_json::json!({"original":true}),
                false,
            )
            .unwrap();
            super::put_record(
                &path,
                "space",
                "owner",
                kind,
                "id",
                &serde_json::json!({"original":false}),
                false,
            )
            .unwrap();
        }
        let conn = rusqlite::Connection::open(&path).unwrap();
        let changed: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM bot_records WHERE payload LIKE '%false%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(changed, 0);
        drop(conn);
        std::fs::remove_dir_all(root).unwrap();
    }
    use super::*;
    #[tokio::test]
    async fn streaming_limits_reject_chunked_oversize_data_before_collecting_the_body() {
        let stream = futures_util::stream::iter(vec![
            Ok(bytes::Bytes::from_static(b"abc")),
            Ok(bytes::Bytes::from_static(b"def")),
        ]);
        assert!(read_limited_stream(Box::pin(stream), 5)
            .await
            .unwrap_err()
            .contains("大小限制"));
        let stream = futures_util::stream::iter(vec![
            Ok(bytes::Bytes::from_static(b"abc")),
            Ok(bytes::Bytes::from_static(b"de")),
        ]);
        assert_eq!(
            read_limited_stream(Box::pin(stream), 5).await.unwrap(),
            b"abcde"
        );
    }
    #[test]
    fn incoming_directory_cannot_replace_unpublished_local_state() {
        let root = std::env::temp_dir().join(format!("bot-queue-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("state.sqlite");
        initialize(&path).unwrap();
        put_record(
            &path,
            "space",
            "owner",
            "directory",
            "bot",
            &json!({"enabled":false}),
            true,
        )
        .unwrap();
        put_record(
            &path,
            "space",
            "owner",
            "directory",
            "bot",
            &json!({"enabled":true}),
            false,
        )
        .unwrap();
        let conn = Connection::open(&path).unwrap();
        let (payload, pending): (String, i64) = conn
            .query_row(
                "SELECT payload,pending FROM bot_records WHERE owner_scope='owner'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&payload).unwrap()["enabled"],
            false
        );
        assert_eq!(pending, 1);
        put_record(
            &path,
            "space",
            "other-owner",
            "directory",
            "bot",
            &json!({"enabled":true}),
            false,
        )
        .unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM bot_records", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 2);
        drop(conn);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn retry_only_selects_explicit_failed_items() {
        let event = json!({"kind":"partial_failed","payload":{"items":[{"item_id":"saved","status":"succeeded"},{"item_id":"retry","status":"failed"},{"item_id":"cancelled","status":"cancelled"}]}});
        assert_eq!(failed_item_ids(&event).unwrap(), vec!["retry".to_string()]);
        assert!(
            failed_item_ids(&json!({"kind":"failed","payload":{"error":"connection lost"}}))
                .is_err()
        );
        assert!(failed_item_ids(&json!({"kind":"succeeded","payload":{"items":[]}})).is_err());
    }
    #[test]
    fn terminal_state_rolls_back_if_event_cannot_be_queued() {
        let root = std::env::temp_dir().join(format!("bot-state-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("state.sqlite");
        crate::db::init_db(&path, None).unwrap();
        initialize(&path).unwrap();
        let event = TaskEvent {
            task_id: "task".into(),
            event_id: "event".into(),
            device_id: "device".into(),
            timestamp_ms: 1,
            kind: "succeeded".into(),
            payload: json!({"items":[]}),
        };
        let reply = json!({"id":"reply","filename":"reply.txt","text":"done","timestamp_ms":1});
        persist_execution_event(&path, "space", "owner", &event, Some(("reply", &reply))).unwrap();
        let mut conflicting = event.clone();
        conflicting.kind = "failed".into();
        assert!(persist_execution_event(&path, "space", "owner", &conflicting, None).is_err());
        let conn = Connection::open(&path).unwrap();
        let reply_pending: i64 = conn
            .query_row(
                "SELECT pending FROM bot_records WHERE kind='contexts' AND id='reply'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(reply_pending, 1);
        let queued_replies: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_outbox WHERE entity_type='message'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(queued_replies, 1);
        let mut reply_conflict = event.clone();
        reply_conflict.task_id = "other-task".into();
        reply_conflict.event_id = "other-event".into();
        assert!(persist_execution_event(
            &path,
            "space",
            "owner",
            &reply_conflict,
            Some(("reply", &reply))
        )
        .is_err());
        let executions: i64 = conn
            .query_row("SELECT COUNT(*) FROM bot_execution", [], |row| row.get(0))
            .unwrap();
        let events: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM bot_records WHERE kind='events'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!((executions, events), (1, 1));
        let status: String = conn
            .query_row("SELECT status FROM bot_execution", [], |row| row.get(0))
            .unwrap();
        assert_eq!(status, "succeeded");
        let pending: i64 = conn
            .query_row("SELECT pending FROM bot_records", [], |row| row.get(0))
            .unwrap();
        assert_eq!(pending, 1);
        drop(conn);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn late_control_or_progress_cannot_replace_a_terminal_status() {
        let events = vec![
            json!({"task_id":"t","kind":"succeeded","timestamp_ms":10}),
            json!({"task_id":"t","kind":"cancel_requested","timestamp_ms":20}),
            json!({"task_id":"t","kind":"progress","timestamp_ms":30}),
        ];
        assert_eq!(
            latest_task_event(&events, &json!("t")).unwrap()["kind"],
            "succeeded"
        );
        assert!(latest_task_event(&events, &json!("other")).is_none());
    }
}
