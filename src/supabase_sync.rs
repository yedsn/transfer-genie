use crate::db::OutboxOperation;
use crate::supabase_auth::SupabaseSession;
use crate::types::SupabaseStorageConfig;
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};
use url::Url;

const APP_SCHEMA: &str = "transfer_genie";
const REALTIME_HEARTBEAT_SECS: u64 = 15;

type RealtimeSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub struct RealtimeSubscription {
    socket: RealtimeSocket,
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

pub async fn ensure_space(
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
    use super::{realtime_reconnect_delay, sanitize_error, storage_object_url};
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
}
