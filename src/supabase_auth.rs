use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupabaseSession {
    pub access_token: String,
    pub refresh_token: String,
    pub user_id: String,
    pub email: String,
    pub expires_at: i64,
}

impl SupabaseSession {
    pub fn needs_refresh(&self, now_seconds: i64) -> bool {
        self.expires_at <= 0 || self.expires_at <= now_seconds.saturating_add(60)
    }
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SupabaseAuthErrorKind {
    InvalidCredentials,
    SessionRevoked,
    Network,
    Service,
    InvalidResponse,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupabaseAuthError {
    pub kind: SupabaseAuthErrorKind,
    pub message: String,
}

pub async fn sign_in(
    client: &Client,
    api_url: &str,
    anon_key: &str,
    email: &str,
    password: &str,
) -> Result<SupabaseSession, SupabaseAuthError> {
    let response = client
        .post(format!(
            "{}/auth/v1/token?grant_type=password",
            api_url.trim_end_matches('/')
        ))
        .header("apikey", anon_key)
        .json(&json!({"email":email.trim(),"password":password}))
        .send()
        .await
        .map_err(network_error)?;
    parse_session_response(response, SupabaseAuthErrorKind::InvalidCredentials).await
}

pub async fn refresh(
    client: &Client,
    api_url: &str,
    anon_key: &str,
    refresh_token: &str,
) -> Result<SupabaseSession, SupabaseAuthError> {
    let response = client
        .post(format!(
            "{}/auth/v1/token?grant_type=refresh_token",
            api_url.trim_end_matches('/')
        ))
        .header("apikey", anon_key)
        .json(&json!({"refresh_token":refresh_token}))
        .send()
        .await
        .map_err(network_error)?;
    parse_session_response(response, SupabaseAuthErrorKind::SessionRevoked).await
}

pub async fn current_user(
    client: &Client,
    api_url: &str,
    anon_key: &str,
    access_token: &str,
) -> Result<(String, String), SupabaseAuthError> {
    let response = client
        .get(format!("{}/auth/v1/user", api_url.trim_end_matches('/')))
        .header("apikey", anon_key)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(network_error)?;
    let status = response.status();
    let body: Value = response.json().await.map_err(|_| invalid_response())?;
    if !status.is_success() {
        return Err(SupabaseAuthError {
            kind: if status == StatusCode::UNAUTHORIZED {
                SupabaseAuthErrorKind::SessionRevoked
            } else {
                SupabaseAuthErrorKind::Service
            },
            message: if status == StatusCode::UNAUTHORIZED {
                "Supabase 会话已失效"
            } else {
                "无法验证当前 Supabase 用户"
            }
            .to_string(),
        });
    }
    let id = body["id"]
        .as_str()
        .ok_or_else(invalid_response)?
        .to_string();
    let email = body["email"].as_str().unwrap_or_default().to_string();
    Ok((id, email))
}

pub async fn logout(
    client: &Client,
    api_url: &str,
    anon_key: &str,
    access_token: &str,
) -> Result<(), SupabaseAuthError> {
    let response = client
        .post(format!("{}/auth/v1/logout", api_url.trim_end_matches('/')))
        .header("apikey", anon_key)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(network_error)?;
    if response.status().is_success() || response.status() == StatusCode::UNAUTHORIZED {
        Ok(())
    } else {
        Err(SupabaseAuthError {
            kind: SupabaseAuthErrorKind::Service,
            message: "Supabase 退出登录失败".to_string(),
        })
    }
}

async fn parse_session_response(
    response: reqwest::Response,
    auth_failure_kind: SupabaseAuthErrorKind,
) -> Result<SupabaseSession, SupabaseAuthError> {
    let status = response.status();
    let body: Value = response.json().await.map_err(|_| invalid_response())?;
    if !status.is_success() {
        return Err(SupabaseAuthError {
            kind: if status == StatusCode::BAD_REQUEST || status == StatusCode::UNAUTHORIZED {
                auth_failure_kind.clone()
            } else {
                SupabaseAuthErrorKind::Service
            },
            message: match auth_failure_kind {
                SupabaseAuthErrorKind::InvalidCredentials => "Supabase 登录凭据无效",
                SupabaseAuthErrorKind::SessionRevoked => "Supabase 会话已失效",
                _ => "Supabase Auth 请求失败",
            }
            .to_string(),
        });
    }
    let now_seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    Ok(SupabaseSession {
        access_token: body["access_token"]
            .as_str()
            .ok_or_else(invalid_response)?
            .to_string(),
        refresh_token: body["refresh_token"]
            .as_str()
            .ok_or_else(invalid_response)?
            .to_string(),
        user_id: body["user"]["id"]
            .as_str()
            .ok_or_else(invalid_response)?
            .to_string(),
        email: body["user"]["email"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        expires_at: body["expires_at"]
            .as_i64()
            .or_else(|| {
                body["expires_in"]
                    .as_i64()
                    .map(|seconds| now_seconds + seconds)
            })
            .unwrap_or_default(),
    })
}

fn network_error(_error: reqwest::Error) -> SupabaseAuthError {
    SupabaseAuthError {
        kind: SupabaseAuthErrorKind::Network,
        message: "Supabase Auth 网络请求失败".to_string(),
    }
}

fn invalid_response() -> SupabaseAuthError {
    SupabaseAuthError {
        kind: SupabaseAuthErrorKind::InvalidResponse,
        message: "Supabase Auth 返回内容无效".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::Query;
    use axum::http::{HeaderMap, StatusCode as AxumStatusCode};
    use axum::routing::{get, post};
    use axum::{Json, Router};
    use std::collections::HashMap;

    async fn token(
        Query(query): Query<HashMap<String, String>>,
        Json(body): Json<Value>,
    ) -> (AxumStatusCode, Json<Value>) {
        match query.get("grant_type").map(String::as_str) {
            Some("password") if body["password"] == "correct" => (
                AxumStatusCode::OK,
                Json(json!({
                    "access_token":"access-a","refresh_token":"refresh-a",
                    "expires_at":1234,"user":{"id":"user-a","email":"a@example.com"}
                })),
            ),
            Some("password") => (
                AxumStatusCode::BAD_REQUEST,
                Json(json!({
                    "message": format!(
                        "invalid password={} key=sb_secret_fixture token=access-secret",
                        body["password"].as_str().unwrap_or_default()
                    )
                })),
            ),
            Some("refresh_token") if body["refresh_token"] == "refresh-a" => (
                AxumStatusCode::OK,
                Json(json!({
                    "access_token":"access-b","refresh_token":"refresh-b",
                    "expires_at":2345,"user":{"id":"user-a","email":"a@example.com"}
                })),
            ),
            Some("refresh_token") if body["refresh_token"] == "refresh-expires-in" => (
                AxumStatusCode::OK,
                Json(json!({
                    "access_token":"access-c","refresh_token":"refresh-c",
                    "expires_in":3600,"user":{"id":"user-a","email":"a@example.com"}
                })),
            ),
            _ => (
                AxumStatusCode::BAD_REQUEST,
                Json(json!({"message":"Invalid Refresh Token"})),
            ),
        }
    }

    async fn user(headers: HeaderMap) -> (AxumStatusCode, Json<Value>) {
        if headers
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            == Some("Bearer access-b")
        {
            (
                AxumStatusCode::OK,
                Json(json!({"id":"user-a","email":"a@example.com"})),
            )
        } else {
            (
                AxumStatusCode::UNAUTHORIZED,
                Json(json!({"message":"session revoked"})),
            )
        }
    }

    async fn logout_handler() -> AxumStatusCode {
        AxumStatusCode::NO_CONTENT
    }

    async fn spawn_auth_server() -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind auth server");
        let address = listener.local_addr().expect("auth server address");
        let router = Router::new()
            .route("/auth/v1/token", post(token))
            .route("/auth/v1/user", get(user))
            .route("/auth/v1/logout", post(logout_handler));
        tokio::spawn(async move {
            axum::serve(listener, router)
                .await
                .expect("serve auth routes");
        });
        format!("http://{address}")
    }

    #[tokio::test]
    async fn auth_lifecycle_and_error_states_are_distinct() {
        let base_url = spawn_auth_server().await;
        let client = Client::new();
        let invalid = sign_in(&client, &base_url, "public", "a@example.com", "wrong")
            .await
            .expect_err("invalid credentials should fail");
        assert_eq!(invalid.kind, SupabaseAuthErrorKind::InvalidCredentials);
        assert_eq!(invalid.message, "Supabase 登录凭据无效");
        assert!(!invalid.message.contains("wrong"));
        assert!(!invalid.message.contains("sb_secret_fixture"));
        assert!(!invalid.message.contains("access-secret"));

        let session = sign_in(&client, &base_url, "public", "a@example.com", "correct")
            .await
            .expect("sign in");
        assert_eq!(session.user_id, "user-a");

        let revoked = refresh(&client, &base_url, "public", "revoked")
            .await
            .expect_err("revoked refresh should fail");
        assert_eq!(revoked.kind, SupabaseAuthErrorKind::SessionRevoked);
        assert_eq!(revoked.message, "Supabase 会话已失效");
        assert!(!revoked.message.contains("revoked"));

        let refreshed = refresh(&client, &base_url, "public", &session.refresh_token)
            .await
            .expect("refresh session");
        let current = current_user(&client, &base_url, "public", &refreshed.access_token)
            .await
            .expect("current user");
        assert_eq!(current.0, "user-a");
        logout(&client, &base_url, "public", &refreshed.access_token)
            .await
            .expect("logout");
    }

    #[test]
    fn session_refresh_window_covers_expired_and_near_expiry_tokens() {
        let session = SupabaseSession {
            access_token: "access".into(),
            refresh_token: "refresh".into(),
            user_id: "user".into(),
            email: "user@example.com".into(),
            expires_at: 1_100,
        };
        assert!(!session.needs_refresh(1_000));
        assert!(session.needs_refresh(1_040));
        assert!(SupabaseSession {
            expires_at: 0,
            ..session
        }
        .needs_refresh(1_000));
    }

    #[tokio::test]
    async fn refresh_accepts_expires_in_when_expires_at_is_absent() {
        let base_url = spawn_auth_server().await;
        let before = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let session = refresh(&Client::new(), &base_url, "public", "refresh-expires-in")
            .await
            .unwrap();
        assert!(session.expires_at >= before + 3_599);
    }
}
