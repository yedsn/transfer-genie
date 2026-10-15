use crate::db::OutboxOperation;
use crate::supabase_auth::SupabaseSession;
use crate::types::SupabaseStorageConfig;
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::pin::Pin;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};
use url::Url;

const APP_SCHEMA: &str = "transfer_genie";
const REALTIME_HEARTBEAT_SECS: u64 = 15;

type RealtimeSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub struct RealtimeSubscription {
    socket: RealtimeSocket,
}

pub struct StorageDownloadStreamResponse {
    pub stream: Pin<Box<dyn futures_util::Stream<Item = reqwest::Result<bytes::Bytes>> + Send>>,
}

#[derive(Clone, Debug)]
pub struct RemoteMessagePage {
    pub messages: Vec<Value>,
    pub tags: Vec<Value>,
    pub attachments: Vec<Value>,
    pub has_more: bool,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize, PartialEq, Eq)]
pub struct RemoteSpaceSummary {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub message_count: i64,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum PushResult {
    Applied {
        revision: i64,
        change_seq: i64,
    },
    Conflict {
        remote_revision: Option<i64>,
        remote: Value,
    },
    Missing,
}

#[derive(Clone, Debug, serde::Deserialize, PartialEq, Eq)]
pub struct RemoteChange {
    pub change_seq: i64,
    pub entity_type: String,
    pub entity_id: String,
    pub change_type: String,
    pub revision: i64,
}

pub async fn pull_changes(
    client: &Client,
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
    after_seq: i64,
    limit: usize,
) -> Result<Vec<RemoteChange>, String> {
    let response = client
        .post(format!(
            "{}/rest/v1/rpc/pull_changes",
            config.api_url.trim_end_matches('/')
        ))
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .header("Accept-Profile", APP_SCHEMA)
        .header("Content-Profile", APP_SCHEMA)
        .json(&json!({
            "p_space_id":config.space_id,
            "p_after_seq":after_seq,
            "p_limit":limit.clamp(1,1000)
        }))
        .send()
        .await
        .map_err(|error| format!("拉取 Supabase 变化失败: {error}"))?;
    parse_json_response(response, "pull_changes").await
}

pub async fn fetch_entity_snapshot(
    client: &Client,
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
    entity_type: &str,
    entity_id: &str,
) -> Result<Option<Value>, String> {
    let (table, id) = match entity_type {
        "message" => ("messages", entity_id),
        "tag" => ("tags", entity_id),
        "attachment" => ("attachments", entity_id),
        other => return Err(format!("暂不支持拉取实体: {other}")),
    };
    let response = client
        .get(format!(
            "{}/rest/v1/{table}",
            config.api_url.trim_end_matches('/')
        ))
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .header("Accept-Profile", APP_SCHEMA)
        .query(&[("id", format!("eq.{id}")), ("select", "*".to_string())])
        .send()
        .await
        .map_err(|error| format!("读取 Supabase {entity_type} 快照失败: {error}"))?;
    let rows: Vec<Value> = parse_json_response(response, table).await?;
    Ok(rows.into_iter().next())
}

pub async fn list_spaces(
    client: &Client,
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
) -> Result<Vec<RemoteSpaceSummary>, String> {
    let response = client
        .get(format!(
            "{}/rest/v1/spaces",
            config.api_url.trim_end_matches('/')
        ))
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .header("Accept-Profile", APP_SCHEMA)
        .query(&[
            ("select", "id,name,updated_at"),
            ("order", "updated_at.desc,id.asc"),
        ])
        .send()
        .await
        .map_err(|error| format!("读取 Supabase 存储空间失败: {error}"))?;
    let rows: Vec<Value> = parse_json_response(response, "spaces").await?;
    let mut spaces = Vec::with_capacity(rows.len());
    for row in rows {
        let Some(id) = row["id"].as_str() else {
            continue;
        };
        let count_response = client
            .get(format!(
                "{}/rest/v1/messages",
                config.api_url.trim_end_matches('/')
            ))
            .header("apikey", &config.anon_key)
            .bearer_auth(&session.access_token)
            .header("Accept-Profile", APP_SCHEMA)
            .header("Prefer", "count=exact")
            .query(&[
                ("space_id", format!("eq.{id}")),
                ("deleted_at", "is.null".to_string()),
                ("select", "id".to_string()),
                ("limit", "1".to_string()),
            ])
            .send()
            .await
            .map_err(|error| format!("统计 Supabase 存储空间消息失败: {error}"))?;
        let status = count_response.status();
        let content_range = count_response
            .headers()
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let body = count_response.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(format!(
                "统计 Supabase 存储空间消息失败 ({status}): {}",
                sanitize_error(&body)
            ));
        }
        let message_count = content_range
            .as_deref()
            .and_then(parse_content_range_count)
            .unwrap_or(0);
        spaces.push(RemoteSpaceSummary {
            id: id.to_string(),
            name: row["name"].as_str().unwrap_or("Supabase").to_string(),
            message_count,
            updated_at: row["updated_at"].as_str().map(str::to_string),
        });
    }
    Ok(spaces)
}

fn parse_content_range_count(value: &str) -> Option<i64> {
    value
        .rsplit('/')
        .next()
        .filter(|total| *total != "*")
        .and_then(|total| total.parse::<i64>().ok())
}

pub async fn fetch_message_page(
    client: &Client,
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
    before: Option<(i64, &str)>,
    limit: usize,
) -> Result<RemoteMessagePage, String> {
    let limit = limit.clamp(1, 200);
    let query = build_message_page_query(config, before, limit);
    let response = client
        .get(format!(
            "{}/rest/v1/messages",
            config.api_url.trim_end_matches('/')
        ))
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .header("Accept-Profile", APP_SCHEMA)
        .query(&query)
        .send()
        .await
        .map_err(|error| format!("读取 Supabase 历史消息失败: {error}"))?;
    let mut messages: Vec<Value> = parse_json_response(response, "messages").await?;
    let has_more = messages.len() > limit;
    messages.truncate(limit);

    let message_ids = messages
        .iter()
        .filter_map(|row| row["id"].as_str())
        .collect::<Vec<_>>();
    let tag_ids = messages
        .iter()
        .flat_map(|row| {
            row["marked_tag_ids"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
        })
        .collect::<std::collections::BTreeSet<_>>();
    let attachments = fetch_rows_by_ids(
        client,
        config,
        session,
        "attachments",
        "message_id",
        &message_ids,
    )
    .await?;
    let tag_ids = tag_ids.into_iter().collect::<Vec<_>>();
    let tags = fetch_rows_by_ids(client, config, session, "tags", "id", &tag_ids).await?;

    Ok(RemoteMessagePage {
        messages,
        tags,
        attachments,
        has_more,
    })
}

async fn fetch_rows_by_ids(
    client: &Client,
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
    table: &str,
    column: &str,
    ids: &[&str],
) -> Result<Vec<Value>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let filter = format!("in.({})", ids.join(","));
    let response = client
        .get(format!(
            "{}/rest/v1/{table}",
            config.api_url.trim_end_matches('/')
        ))
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .header("Accept-Profile", APP_SCHEMA)
        .query(&[
            ("space_id", format!("eq.{}", config.space_id)),
            ("deleted_at", "is.null".to_string()),
            (column, filter),
            ("select", "*".to_string()),
        ])
        .send()
        .await
        .map_err(|error| format!("读取 Supabase {table} 历史元数据失败: {error}"))?;
    parse_json_response(response, table).await
}

pub async fn fetch_tag_by_name(
    client: &Client,
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
    name: &str,
) -> Result<Option<Value>, String> {
    let response = client
        .get(format!(
            "{}/rest/v1/tags",
            config.api_url.trim_end_matches('/')
        ))
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .header("Accept-Profile", APP_SCHEMA)
        .query(&[
            ("name", format!("ilike.{}", name.trim())),
            ("deleted_at", "is.null".to_string()),
            ("select", "*".to_string()),
            ("limit", "10".to_string()),
        ])
        .send()
        .await
        .map_err(|error| format!("按名称读取 Supabase 标签失败: {error}"))?;
    let rows: Vec<Value> = parse_json_response(response, "tags").await?;
    Ok(rows.into_iter().find(|row| {
        row["name"]
            .as_str()
            .is_some_and(|remote_name| remote_name.trim().eq_ignore_ascii_case(name.trim()))
    }))
}

async fn parse_json_response<T: serde::de::DeserializeOwned>(
    response: reqwest::Response,
    action: &str,
) -> Result<T, String> {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "Supabase {action} 失败 ({status}): {}",
            sanitize_error(&body)
        ));
    }
    serde_json::from_str(&body).map_err(|error| format!("Supabase {action} 返回无效: {error}"))
}

pub async fn create_space(
    client: &Client,
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
    name: &str,
) -> Result<(), String> {
    let response = client
        .post(format!(
            "{}/rest/v1/rpc/space_upsert",
            config.api_url.trim_end_matches('/')
        ))
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .header("Accept-Profile", APP_SCHEMA)
        .header("Content-Profile", APP_SCHEMA)
        .json(&json!({"p_space_id":config.space_id,"p_name":name}))
        .send()
        .await
        .map_err(|error| format!("创建 Supabase 存储空间失败: {error}"))?;
    if response.status().is_success() {
        Ok(())
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(format!(
            "创建 Supabase 存储空间失败 ({status}): {}",
            sanitize_error(&body)
        ))
    }
}

pub async fn validate_space_access(
    client: &Client,
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
) -> Result<(), String> {
    if config.space_id.trim().is_empty() {
        return Err("尚未绑定账号中的 Supabase 空间".to_string());
    }
    let response = client
        .get(format!(
            "{}/rest/v1/spaces",
            config.api_url.trim_end_matches('/')
        ))
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .header("Accept-Profile", APP_SCHEMA)
        .query(&[
            ("id", format!("eq.{}", config.space_id)),
            ("select", "id".to_string()),
            ("limit", "1".to_string()),
        ])
        .send()
        .await
        .map_err(|error| format!("验证 Supabase 存储空间访问失败: {error}"))?;
    let rows: Vec<Value> = parse_json_response(response, "spaces").await?;
    if rows
        .iter()
        .any(|row| row["id"].as_str() == Some(config.space_id.as_str()))
    {
        Ok(())
    } else {
        Err("当前 Supabase 存储空间不存在或账号无权访问".to_string())
    }
}

pub async fn push_operation(
    client: &Client,
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
    operation: &OutboxOperation,
) -> Result<PushResult, String> {
    let payload: Value = serde_json::from_str(&operation.payload_json)
        .map_err(|error| format!("同步操作 payload 无效: {error}"))?;
    let (rpc, arguments) = match operation.entity_type.as_str() {
        "message" => (
            "message_apply",
            json!({
                "p_operation_id":operation.operation_id,
                "p_payload_hash":operation.payload_hash,
                "p_space_id":config.space_id,
                "p_message_id":operation.entity_id,
                "p_action":operation.action,
                "p_base_revision":operation.base_revision,
                "p_payload":payload
            }),
        ),
        "tag" => (
            "tag_apply",
            json!({
                "p_operation_id":operation.operation_id,
                "p_payload_hash":operation.payload_hash,
                "p_space_id":config.space_id,
                "p_tag_id":operation.entity_id,
                "p_action":operation.action,
                "p_base_revision":operation.base_revision,
                "p_name":payload.get("name").and_then(Value::as_str)
            }),
        ),
        "attachment" => (
            "attachment_apply",
            json!({"p_operation_id":operation.operation_id,"p_payload_hash":operation.payload_hash,
                "p_space_id":config.space_id,"p_attachment_id":operation.entity_id,
                "p_action":operation.action,"p_base_revision":operation.base_revision,
                "p_payload":payload}),
        ),
        other => return Err(format!("暂不支持同步实体: {other}")),
    };
    let response = client
        .post(format!(
            "{}/rest/v1/rpc/{rpc}",
            config.api_url.trim_end_matches('/')
        ))
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .header("Accept-Profile", APP_SCHEMA)
        .header("Content-Profile", APP_SCHEMA)
        .json(&arguments)
        .send()
        .await
        .map_err(|error| format!("Supabase RPC 网络错误: {error}"))?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "Supabase RPC {rpc} 失败 ({status}): {}",
            sanitize_error(&body)
        ));
    }
    let value: Value = serde_json::from_str(&body)
        .map_err(|error| format!("Supabase RPC {rpc} 返回无效: {error}"))?;
    match value.get("status").and_then(Value::as_str) {
        Some("applied") => Ok(PushResult::Applied {
            revision: value.get("revision").and_then(Value::as_i64).unwrap_or(0),
            change_seq: value.get("changeSeq").and_then(Value::as_i64).unwrap_or(0),
        }),
        Some("conflict") => Ok(PushResult::Conflict {
            remote_revision: value.get("remoteRevision").and_then(Value::as_i64),
            remote: value.get("remote").cloned().unwrap_or(Value::Null),
        }),
        Some("missing") => Ok(PushResult::Missing),
        other => Err(format!("Supabase RPC {rpc} 返回未知状态: {other:?}")),
    }
}

pub async fn upload_storage_object(
    client: &Client,
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
    object_path: &str,
    bytes: Vec<u8>,
    mime_type: &str,
    expected_sha256: Option<&str>,
) -> Result<(), String> {
    let expected = bytes.len();
    let upload_url = storage_object_url(
        &config.api_url,
        "storage/v1/object/transfer-genie-files",
        object_path,
    )?;
    let response = client
        .post(upload_url)
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .header("x-upsert", "true")
        .header("content-type", mime_type)
        .body(bytes)
        .send()
        .await
        .map_err(|error| format!("上传 Supabase Storage 失败: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "上传 Supabase Storage 失败 ({status}): {}",
            sanitize_error(&body)
        ));
    }
    let verify_url = storage_object_url(
        &config.api_url,
        "storage/v1/object/authenticated/transfer-genie-files",
        object_path,
    )?;
    let verify = client
        .get(verify_url)
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .send()
        .await
        .map_err(|error| format!("校验 Supabase Storage 失败: {error}"))?;
    let verify_status = verify.status();
    if !verify_status.is_success() {
        let body = verify.text().await.unwrap_or_default();
        return Err(format!(
            "校验 Supabase Storage 失败 ({verify_status}): {}",
            sanitize_error(&body)
        ));
    }
    let verified = verify
        .bytes()
        .await
        .map_err(|error| format!("读取 Storage 校验数据失败: {error}"))?;
    let actual = verified.len();
    if actual != expected {
        return Err(format!("Storage 文件大小不一致: {actual}/{expected}"));
    }
    if let Some(expected_hash) = expected_sha256 {
        let actual_hash = format!("{:x}", Sha256::digest(&verified));
        if actual_hash != expected_hash {
            return Err("Storage 文件摘要不一致".to_string());
        }
    }
    Ok(())
}

pub async fn upload_storage_object_path(
    client: &Client,
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
    object_path: &str,
    local_path: &Path,
    mime_type: &str,
    expected_sha256: Option<&str>,
) -> Result<(), String> {
    let expected = std::fs::metadata(local_path)
        .map_err(|error| format!("读取待上传文件失败: {error}"))?
        .len();
    let file =
        std::fs::File::open(local_path).map_err(|error| format!("打开待上传文件失败: {error}"))?;
    let (tx, rx) = mpsc::channel::<Result<bytes::Bytes, std::io::Error>>(4);
    tokio::task::spawn_blocking(move || {
        use std::io::Read;
        let mut file = file;
        let mut buffer = vec![0u8; 512 * 1024];
        loop {
            match file.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => {
                    if tx
                        .blocking_send(Ok(bytes::Bytes::copy_from_slice(&buffer[..read])))
                        .is_err()
                    {
                        break;
                    }
                }
                Err(error) => {
                    let _ = tx.blocking_send(Err(error));
                    break;
                }
            }
        }
    });
    let stream = futures_util::stream::unfold(rx, |mut rx| async move {
        rx.recv().await.map(|item| (item, rx))
    });
    let upload_url = storage_object_url(
        &config.api_url,
        "storage/v1/object/transfer-genie-files",
        object_path,
    )?;
    let response = client
        .post(upload_url)
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .header("x-upsert", "true")
        .header("content-type", mime_type)
        .header("content-length", expected)
        .body(reqwest::Body::wrap_stream(stream))
        .send()
        .await
        .map_err(|error| format!("上传 Supabase Storage 失败: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "上传 Supabase Storage 失败 ({status}): {}",
            sanitize_error(&body)
        ));
    }
    let mut verified = download_storage_object_stream(client, config, session, object_path).await?;
    let mut actual = 0u64;
    let mut hasher = Sha256::new();
    while let Some(chunk) = verified.stream.next().await {
        let chunk = chunk.map_err(|error| format!("读取 Storage 校验数据失败: {error}"))?;
        actual += chunk.len() as u64;
        hasher.update(&chunk);
    }
    if actual != expected {
        return Err(format!("Storage 文件大小不一致: {actual}/{expected}"));
    }
    if let Some(expected_hash) = expected_sha256 {
        let actual_hash = format!("{:x}", hasher.finalize());
        if actual_hash != expected_hash {
            return Err("Storage 文件摘要不一致".to_string());
        }
    }
    Ok(())
}

pub async fn download_storage_object(
    client: &Client,
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
    object_path: &str,
) -> Result<Vec<u8>, String> {
    let download_url = storage_object_url(
        &config.api_url,
        "storage/v1/object/authenticated/transfer-genie-files",
        object_path,
    )?;
    let response = client
        .get(download_url)
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .send()
        .await
        .map_err(|error| format!("下载 Supabase 附件失败: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "下载 Supabase 附件失败 ({status}): {}",
            sanitize_error(&body)
        ));
    }
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|error| format!("读取 Supabase 附件失败: {error}"))
}

pub async fn download_storage_object_stream(
    client: &Client,
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
    object_path: &str,
) -> Result<StorageDownloadStreamResponse, String> {
    let download_url = storage_object_url(
        &config.api_url,
        "storage/v1/object/authenticated/transfer-genie-files",
        object_path,
    )?;
    let response = client
        .get(download_url)
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .send()
        .await
        .map_err(|error| format!("下载 Supabase 附件失败: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "下载 Supabase 附件失败 ({status}): {}",
            sanitize_error(&body)
        ));
    }
    Ok(StorageDownloadStreamResponse {
        stream: Box::pin(response.bytes_stream()),
    })
}

pub async fn delete_storage_objects(
    client: &Client,
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
    paths: &[String],
) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let response = client
        .delete(format!(
            "{}/storage/v1/object/transfer-genie-files",
            config.api_url.trim_end_matches('/')
        ))
        .header("apikey", &config.anon_key)
        .bearer_auth(&session.access_token)
        .json(&json!({"prefixes":paths}))
        .send()
        .await
        .map_err(|error| format!("清理 Supabase 孤立对象失败: {error}"))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "清理 Supabase 孤立对象失败 ({})",
            response.status()
        ))
    }
}

fn storage_object_url(api_url: &str, endpoint: &str, object_path: &str) -> Result<Url, String> {
    let mut url = Url::parse(api_url.trim_end_matches('/'))
        .map_err(|error| format!("Supabase Storage 地址无效: {error}"))?;
    let object_segments = object_path.split('/').collect::<Vec<_>>();
    if object_segments.is_empty() || object_segments.iter().any(|segment| segment.is_empty()) {
        return Err("Supabase Storage 对象路径无效：路径段不能为空".to_string());
    }
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| "Supabase Storage 地址不支持对象路径".to_string())?;
        segments.pop_if_empty();
        for segment in endpoint.split('/') {
            segments.push(segment);
        }
        for segment in object_segments {
            let decoded = percent_encoding::percent_decode_str(segment).decode_utf8_lossy();
            segments.push(&decoded);
        }
    }
    Ok(url)
}

fn sanitize_error(body: &str) -> String {
    let message = serde_json::from_str::<Value>(body).ok().and_then(|value| {
        ["message", "error", "code", "statusCode"]
            .iter()
            .filter_map(|key| value.get(*key))
            .find_map(|value| match value {
                Value::String(text) if !text.trim().is_empty() => Some(text.trim().to_string()),
                Value::Number(number) => Some(number.to_string()),
                _ => None,
            })
    });
    message
        .map(|message| message.chars().take(300).collect())
        .unwrap_or_else(|| {
            let plain = body.trim();
            if plain.is_empty() {
                "远端拒绝请求，未返回错误详情".to_string()
            } else {
                plain.chars().take(300).collect()
            }
        })
}

fn build_message_page_query(
    config: &SupabaseStorageConfig,
    before: Option<(i64, &str)>,
    limit: usize,
) -> Vec<(String, String)> {
    let limit = limit.clamp(1, 200);
    let mut query = vec![
        ("space_id".to_string(), format!("eq.{}", config.space_id)),
        ("deleted_at".to_string(), "is.null".to_string()),
        ("order".to_string(), "timestamp_ms.desc,id.desc".to_string()),
        ("limit".to_string(), (limit + 1).to_string()),
        ("select".to_string(), "*".to_string()),
    ];
    if let Some((timestamp_ms, message_id)) = before {
        query.push((
            "or".to_string(),
            format!(
                "(timestamp_ms.lt.{timestamp_ms},and(timestamp_ms.eq.{timestamp_ms},id.lt.{message_id}))"
            ),
        ));
    }
    query
}

pub async fn connect_realtime(
    config: &SupabaseStorageConfig,
    session: &SupabaseSession,
) -> Result<RealtimeSubscription, String> {
    let scheme = if config.api_url.starts_with("https://") {
        "wss://"
    } else {
        "ws://"
    };
    let host = config
        .api_url
        .split_once("://")
        .map(|(_, host)| host.trim_end_matches('/'))
        .unwrap_or(config.api_url.trim_end_matches('/'));
    let url = format!(
        "{scheme}{host}/realtime/v1/websocket?apikey={}&vsn=1.0.0",
        urlencoding::encode(&config.anon_key)
    );
    let (mut socket, _) = timeout(Duration::from_secs(10), connect_async(url))
        .await
        .map_err(|_| "连接 Supabase Realtime 超时".to_string())?
        .map_err(|error| format!("连接 Supabase Realtime 失败: {error}"))?;
    socket
        .send(Message::Text(
            json!({
                "topic":format!("realtime:transfer-genie-app-{}",uuid::Uuid::new_v4()),
                "event":"phx_join",
                "payload":{"config":{"broadcast":{"ack":false,"self":false},
                  "presence":{"key":""},"postgres_changes":[{"event":"*",
                  "schema":APP_SCHEMA,"table":"change_log"}]},"access_token":session.access_token},
                "ref":"1","join_ref":"1"
            })
            .to_string(),
        ))
        .await
        .map_err(|error| format!("订阅 Supabase Realtime 失败: {error}"))?;
    loop {
        let message = timeout(Duration::from_secs(10), socket.next())
            .await
            .map_err(|_| "等待 Supabase Realtime 订阅确认超时".to_string())?
            .ok_or_else(|| "Supabase Realtime 连接已关闭".to_string())?
            .map_err(|error| format!("读取 Supabase Realtime 失败: {error}"))?;
        if let Message::Text(text) = message {
            let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
            if value["event"] == "phx_reply" && value["ref"] == "1" {
                if value["payload"]["status"] != "ok" {
                    return Err("Supabase Realtime 订阅被拒绝".into());
                }
                return Ok(RealtimeSubscription { socket });
            }
        }
    }
}

impl RealtimeSubscription {
    pub async fn wait_for_change(&mut self) -> Result<(), String> {
        let mut heartbeat_pending = false;
        loop {
            let message = match timeout(
                Duration::from_secs(REALTIME_HEARTBEAT_SECS),
                self.socket.next(),
            )
            .await
            {
                Ok(Some(Ok(message))) => message,
                Ok(Some(Err(error))) => {
                    return Err(format!("读取 Supabase Realtime 失败: {error}"));
                }
                Ok(None) => return Err("Supabase Realtime 连接已关闭".into()),
                Err(_) => {
                    if heartbeat_pending {
                        return Err("Supabase Realtime 心跳响应超时".into());
                    }
                    self.socket
                        .send(Message::Text(
                            json!({
                                "topic":"phoenix",
                                "event":"heartbeat",
                                "payload":{},
                                "ref":uuid::Uuid::new_v4().to_string()
                            })
                            .to_string(),
                        ))
                        .await
                        .map_err(|error| format!("维持 Supabase Realtime 连接失败: {error}"))?;
                    heartbeat_pending = true;
                    continue;
                }
            };
            match message {
                Message::Text(text) => {
                    let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
                    if value["event"] == "postgres_changes" {
                        return Ok(());
                    }
                    if value["topic"] == "phoenix" && value["event"] == "phx_reply" {
                        heartbeat_pending = false;
                    }
                    if value["event"] == "phx_error" || value["event"] == "phx_close" {
                        return Err("Supabase Realtime 频道已关闭".into());
                    }
                }
                Message::Ping(payload) => {
                    self.socket
                        .send(Message::Pong(payload))
                        .await
                        .map_err(|error| format!("响应 Supabase Realtime 心跳失败: {error}"))?;
                }
                Message::Close(_) => return Err("Supabase Realtime 连接已关闭".into()),
                _ => {}
            }
        }
    }
}

pub fn realtime_reconnect_delay(attempt: u32) -> Duration {
    Duration::from_secs(1_u64.checked_shl(attempt.min(5)).unwrap_or(32).min(30))
}

#[cfg(test)]
mod tests {
    use super::{
        build_message_page_query, parse_content_range_count, realtime_reconnect_delay,
        sanitize_error, storage_object_url,
    };
    use crate::types::SupabaseStorageConfig;
    use std::time::Duration;

    #[test]
    fn realtime_reconnect_uses_bounded_exponential_backoff() {
        assert_eq!(realtime_reconnect_delay(0), Duration::from_secs(1));
        assert_eq!(realtime_reconnect_delay(1), Duration::from_secs(2));
        assert_eq!(realtime_reconnect_delay(4), Duration::from_secs(16));
        assert_eq!(realtime_reconnect_delay(5), Duration::from_secs(30));
        assert_eq!(realtime_reconnect_delay(20), Duration::from_secs(30));
    }

    #[test]
    fn storage_object_url_encodes_each_segment_once() {
        let url = storage_object_url(
            "https://example.test",
            "storage/v1/object/transfer-genie-files",
            "user/space/attachment/%E6%96%87%E4%BB%B6%20%231.txt",
        )
        .unwrap();

        assert_eq!(
            url.as_str(),
            "https://example.test/storage/v1/object/transfer-genie-files/user/space/attachment/%E6%96%87%E4%BB%B6%20%231.txt"
        );
    }

    #[test]
    fn storage_object_url_rejects_empty_path_segments() {
        assert_eq!(
            storage_object_url(
                "https://example.test",
                "storage/v1/object/transfer-genie-files",
                "user//attachment/file.txt",
            )
            .unwrap_err(),
            "Supabase Storage 对象路径无效：路径段不能为空"
        );
    }

    #[test]
    fn storage_error_uses_safe_json_message() {
        assert_eq!(
            sanitize_error(
                r#"{"statusCode":"400","error":"InvalidKey","message":"Invalid object name"}"#
            ),
            "Invalid object name"
        );
        assert_eq!(
            sanitize_error("<html>gateway error</html>"),
            "<html>gateway error</html>"
        );
        assert_eq!(sanitize_error(""), "远端拒绝请求，未返回错误详情");
    }

    #[test]
    fn message_page_query_uses_space_and_stable_history_boundary() {
        let config = SupabaseStorageConfig {
            api_url: "https://example.invalid".into(),
            anon_key: "anon".into(),
            space_id: "space-a".into(),
        };
        let query = build_message_page_query(
            &config,
            Some((123, "00000000-0000-4000-8000-000000000002")),
            50,
        );
        assert!(query.contains(&("space_id".into(), "eq.space-a".into())));
        assert!(query.contains(&("limit".into(), "51".into())));
        assert!(query.contains(&("order".into(), "timestamp_ms.desc,id.desc".into())));
        assert!(query.contains(&(
            "or".into(),
            "(timestamp_ms.lt.123,and(timestamp_ms.eq.123,id.lt.00000000-0000-4000-8000-000000000002))".into()
        )));
    }

    #[test]
    fn content_range_count_supports_non_empty_and_empty_spaces() {
        assert_eq!(parse_content_range_count("0-0/377"), Some(377));
        assert_eq!(parse_content_range_count("*/0"), Some(0));
        assert_eq!(parse_content_range_count("0-0/*"), None);
        assert_eq!(parse_content_range_count("invalid"), None);
    }
}
