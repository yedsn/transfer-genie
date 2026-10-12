use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde::Serialize;
use serde_json::{json, Value};
use std::time::Duration;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const APP_SCHEMA: &str = "transfer_genie";
const FILE_BUCKET: &str = "transfer-genie-files";

#[derive(Clone, Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SupabaseConnectionCheck {
    pub network: bool,
    pub public_key: bool,
    pub auth: bool,
    pub schema: bool,
    pub rpc: bool,
    pub rls: bool,
    pub realtime: bool,
    pub storage: bool,
    pub schema_version: Option<String>,
    pub error_code: Option<String>,
    pub message: Option<String>,
}

pub async fn check(
    client: &Client,
    api_url: &str,
    anon_key: &str,
    access_token: Option<&str>,
) -> SupabaseConnectionCheck {
    let mut result = SupabaseConnectionCheck::default();
    let base = api_url.trim_end_matches('/');
    let settings_response = match client
        .get(format!("{base}/auth/v1/settings"))
        .header("apikey", anon_key)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            result.error_code = Some("NETWORK_UNREACHABLE".to_string());
            result.message = Some(format!("无法连接 Supabase: {error}"));
            return result;
        }
    };
    result.network = true;
    if !settings_response.status().is_success() {
        result.error_code = Some("PUBLIC_KEY_INVALID".to_string());
        result.message = Some("Supabase 公开 Key 无效".to_string());
        return result;
    }
    result.public_key = true;

    let Some(access_token) = access_token else {
        result.error_code = Some("AUTH_REQUIRED".to_string());
        result.message = Some("请先登录 Supabase 账号".to_string());
        return result;
    };
    let user_response = match authenticated(
        client.get(format!("{base}/auth/v1/user")),
        anon_key,
        access_token,
    )
    .send()
    .await
    {
        Ok(response) => response,
        Err(error) => {
            result.error_code = Some("AUTH_NETWORK_ERROR".to_string());
            result.message = Some(format!("验证 Supabase 会话失败: {error}"));
            return result;
        }
    };
    if !user_response.status().is_success() {
        result.error_code = Some("AUTH_SESSION_INVALID".to_string());
        result.message = Some("Supabase 会话已失效".to_string());
        return result;
    }
    result.auth = true;

    let cloud_response = match app_request(
        client.post(format!("{base}/rest/v1/rpc/cloud_status")),
        anon_key,
        access_token,
    )
    .json(&json!({}))
    .send()
    .await
    {
        Ok(response) => response,
        Err(error) => {
            result.error_code = Some("REST_UNREACHABLE".to_string());
            result.message = Some(format!("连接 Supabase REST 失败: {error}"));
            return result;
        }
    };
    let cloud_status = cloud_response.status();
    let cloud_body = cloud_response.text().await.unwrap_or_default();
    if !cloud_status.is_success() {
        let upper = cloud_body.to_uppercase();
        if upper.contains("PGRST202")
            || upper.contains("PGRST205")
            || upper.contains("42P01")
            || upper.contains("42883")
            || upper.contains("PERMISSION DENIED FOR SCHEMA")
        {
            result.error_code = Some("CLOUD_SCHEMA_MISSING".to_string());
            result.message = Some("Supabase 业务 Schema 或 RPC 尚未部署/暴露".to_string());
        } else {
            result.error_code = Some("RPC_UNAVAILABLE".to_string());
            result.message = Some("Supabase 业务 RPC 不可用".to_string());
        }
        return result;
    }
    result.schema = true;
    result.rpc = true;
    if let Ok(value) = serde_json::from_str::<Value>(&cloud_body) {
        result.schema_version = value["schemaVersion"].as_str().map(str::to_string);
    }

    let rls_response = match app_request(
        client.get(format!("{base}/rest/v1/spaces?select=id&limit=1")),
        anon_key,
        access_token,
    )
    .send()
    .await
    {
        Ok(response) => response,
        Err(error) => {
            result.error_code = Some("RLS_CHECK_FAILED".to_string());
            result.message = Some(format!("检查 Supabase 数据权限失败: {error}"));
            return result;
        }
    };
    if !rls_response.status().is_success() {
        result.error_code = Some("RLS_UNAVAILABLE".to_string());
        result.message = Some("Supabase 个人数据读取权限不可用".to_string());
        return result;
    }
    result.rls = true;

    let storage_response = match authenticated(
        client.post(format!("{base}/storage/v1/object/list/{FILE_BUCKET}")),
        anon_key,
        access_token,
    )
    .json(&json!({"prefix":"","limit":1,"offset":0}))
    .send()
    .await
    {
        Ok(response) => response,
        Err(error) => {
            result.error_code = Some("STORAGE_CHECK_FAILED".to_string());
            result.message = Some(format!("检查 Supabase Storage 失败: {error}"));
            return result;
        }
    };
    if !storage_response.status().is_success() {
        result.error_code = Some("STORAGE_BUCKET_MISSING".to_string());
        result.message = Some("Supabase 私有文件桶或 Storage 策略不可用".to_string());
        return result;
    }
    result.storage = true;

    match check_realtime(api_url, anon_key, access_token).await {
        Ok(()) => result.realtime = true,
        Err(message) => {
            result.error_code = Some("REALTIME_UNAVAILABLE".to_string());
            result.message = Some(message);
        }
    }
    result
}

fn authenticated(
    request: reqwest::RequestBuilder,
    anon_key: &str,
    access_token: &str,
) -> reqwest::RequestBuilder {
    request.header("apikey", anon_key).bearer_auth(access_token)
}

fn app_request(
    request: reqwest::RequestBuilder,
    anon_key: &str,
    access_token: &str,
) -> reqwest::RequestBuilder {
    authenticated(request, anon_key, access_token)
        .header("Accept-Profile", APP_SCHEMA)
        .header("Content-Profile", APP_SCHEMA)
}

async fn check_realtime(api_url: &str, anon_key: &str, access_token: &str) -> Result<(), String> {
    let scheme = if api_url.starts_with("https://") {
        "wss://"
    } else {
        "ws://"
    };
    let host = api_url
        .split_once("://")
        .map(|(_, value)| value.trim_end_matches('/'))
        .unwrap_or(api_url.trim_end_matches('/'));
    let url = format!(
        "{scheme}{host}/realtime/v1/websocket?apikey={}&vsn=1.0.0",
        urlencoding::encode(anon_key)
    );
    let (mut socket, _) = timeout(Duration::from_secs(10), connect_async(url))
        .await
        .map_err(|_| "连接 Supabase Realtime 超时".to_string())?
        .map_err(|error| format!("连接 Supabase Realtime 失败: {error}"))?;
    socket
        .send(Message::Text(
            json!({
                "topic":"realtime:transfer-genie-connection-check","event":"phx_join",
                "payload":{"config":{"broadcast":{"ack":false,"self":false},
                "presence":{"key":""},"postgres_changes":[{"event":"*",
                "schema":APP_SCHEMA,"table":"change_log"}]},"access_token":access_token},
                "ref":"1","join_ref":"1"
            })
            .to_string(),
        ))
        .await
        .map_err(|error| format!("发送 Realtime 检查失败: {error}"))?;
    loop {
        let message = timeout(Duration::from_secs(10), socket.next())
            .await
            .map_err(|_| "等待 Realtime 响应超时".to_string())?
            .ok_or_else(|| "Realtime 连接提前关闭".to_string())?
            .map_err(|error| format!("读取 Realtime 响应失败: {error}"))?;
        if let Message::Text(text) = message {
            let value: Value = serde_json::from_str(&text)
                .map_err(|error| format!("解析 Realtime 响应失败: {error}"))?;
            if value["event"] == "phx_reply" && value["ref"] == "1" {
                let _ = socket.close(None).await;
                return if value["payload"]["status"] == "ok" {
                    Ok(())
                } else {
                    Err("Supabase Realtime 订阅被拒绝".to_string())
                };
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderMap, StatusCode};
    use axum::routing::{get, post};
    use axum::{Json, Router};

    async fn spawn(router: Router) -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind connection check server");
        let address = listener.local_addr().expect("server address");
        tokio::spawn(async move {
            axum::serve(listener, router).await.expect("serve checks");
        });
        format!("http://{address}")
    }

    async fn auth_settings(headers: HeaderMap) -> (StatusCode, Json<Value>) {
        if headers.get("apikey").and_then(|value| value.to_str().ok()) == Some("valid") {
            (StatusCode::OK, Json(json!({"external":{}})))
        } else {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({"message":"invalid key"})),
            )
        }
    }

    async fn user() -> Json<Value> {
        Json(json!({"id":"user-a"}))
    }

    async fn missing_rpc() -> (StatusCode, Json<Value>) {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"code":"PGRST202","message":"function missing"})),
        )
    }

    #[tokio::test]
    async fn distinguishes_bad_key_from_missing_business_schema() {
        let base = spawn(
            Router::new()
                .route("/auth/v1/settings", get(auth_settings))
                .route("/auth/v1/user", get(user))
                .route("/rest/v1/rpc/cloud_status", post(missing_rpc)),
        )
        .await;
        let client = Client::new();

        let bad_key = check(&client, &base, "bad", Some("token")).await;
        assert!(bad_key.network);
        assert!(!bad_key.public_key);
        assert_eq!(bad_key.error_code.as_deref(), Some("PUBLIC_KEY_INVALID"));

        let missing_schema = check(&client, &base, "valid", Some("token")).await;
        assert!(missing_schema.network);
        assert!(missing_schema.public_key);
        assert!(missing_schema.auth);
        assert!(!missing_schema.schema);
        assert_eq!(
            missing_schema.error_code.as_deref(),
            Some("CLOUD_SCHEMA_MISSING")
        );
    }
}
