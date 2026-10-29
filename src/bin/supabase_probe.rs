use futures_util::{SinkExt, StreamExt};
use rand::{rngs::OsRng, RngCore};
use reqwest::{Client, RequestBuilder};
use serde_json::{json, Value};
use std::{env, time::Duration};
use tokio::time::{timeout, Instant};
use tokio_tungstenite::{connect_async, tungstenite::Message};

const APP_SCHEMA: &str = "transfer_genie";
const FILE_BUCKET: &str = "transfer-genie-files";

#[derive(Clone)]
struct Config {
    base_url: String,
    anon_key: String,
    service_key: String,
}

#[derive(Clone)]
struct User {
    id: String,
    email: String,
    password: String,
    access_token: String,
    refresh_token: String,
}

fn required(name: &str) -> Result<String, String> {
    env::var(name).map_err(|_| format!("missing environment variable {name}"))
}

fn config() -> Result<Config, String> {
    Ok(Config {
        base_url: required("TG_SUPABASE_URL")?
            .trim_end_matches('/')
            .to_string(),
        anon_key: required("TG_SUPABASE_ANON_KEY")?,
        service_key: required("TG_SUPABASE_SERVICE_ROLE_KEY")?,
    })
}

fn random_hex(bytes: usize) -> String {
    let mut data = vec![0_u8; bytes];
    OsRng.fill_bytes(&mut data);
    data.into_iter()
        .map(|value| format!("{value:02x}"))
        .collect()
}

fn random_uuid() -> String {
    let raw = random_hex(16);
    format!(
        "{}-{}-{}-{}-{}",
        &raw[0..8],
        &raw[8..12],
        &raw[12..16],
        &raw[16..20],
        &raw[20..32]
    )
}

fn authenticated(request: RequestBuilder, config: &Config, token: &str) -> RequestBuilder {
    request
        .header("apikey", &config.anon_key)
        .bearer_auth(token)
}

fn app_request(request: RequestBuilder, config: &Config, token: &str) -> RequestBuilder {
    authenticated(request, config, token)
        .header("Accept-Profile", APP_SCHEMA)
        .header("Content-Profile", APP_SCHEMA)
}

async fn checked_json(response: reqwest::Response, context: &str) -> Result<Value, String> {
    let status = response.status();
    if !status.is_success() {
        return Err(format!("{context} returned HTTP {status}"));
    }
    response
        .json::<Value>()
        .await
        .map_err(|err| format!("{context} response parse failed: {err}"))
}

async fn create_user(client: &Client, config: &Config, label: &str) -> Result<User, String> {
    let email = format!(
        "transfer-genie-probe-{label}-{}@example.invalid",
        random_hex(6)
    );
    let password = format!("TgProbe-{}!9a", random_hex(18));
    let response = client
        .post(format!("{}/auth/v1/admin/users", config.base_url))
        .header("apikey", &config.service_key)
        .bearer_auth(&config.service_key)
        .json(&json!({"email":email,"password":password,"email_confirm":true}))
        .send()
        .await
        .map_err(|err| format!("create user failed: {err}"))?;
    let body = checked_json(response, "create user").await?;
    Ok(User {
        id: body["id"]
            .as_str()
            .ok_or("create user missing id")?
            .to_string(),
        email,
        password,
        access_token: String::new(),
        refresh_token: String::new(),
    })
}

async fn sign_in(client: &Client, config: &Config, user: &mut User) -> Result<(), String> {
    let response = client
        .post(format!(
            "{}/auth/v1/token?grant_type=password",
            config.base_url
        ))
        .header("apikey", &config.anon_key)
        .json(&json!({"email":user.email,"password":user.password}))
        .send()
        .await
        .map_err(|err| format!("sign in failed: {err}"))?;
    let body = checked_json(response, "sign in").await?;
    user.access_token = body["access_token"]
        .as_str()
        .ok_or("missing access token")?
        .to_string();
    user.refresh_token = body["refresh_token"]
        .as_str()
        .ok_or("missing refresh token")?
        .to_string();
    if body["user"]["id"].as_str() != Some(user.id.as_str()) {
        return Err("sign in returned a different user".to_string());
    }
    Ok(())
}

async fn refresh(client: &Client, config: &Config, user: &mut User) -> Result<(), String> {
    let response = client
        .post(format!(
            "{}/auth/v1/token?grant_type=refresh_token",
            config.base_url
        ))
        .header("apikey", &config.anon_key)
        .json(&json!({"refresh_token":user.refresh_token}))
        .send()
        .await
        .map_err(|err| format!("refresh failed: {err}"))?;
    let body = checked_json(response, "refresh").await?;
    user.access_token = body["access_token"]
        .as_str()
        .ok_or("refresh missing access token")?
        .to_string();
    user.refresh_token = body["refresh_token"]
        .as_str()
        .ok_or("refresh missing refresh token")?
        .to_string();
    let response = authenticated(
        client.get(format!("{}/auth/v1/user", config.base_url)),
        config,
        &user.access_token,
    )
    .send()
    .await
    .map_err(|err| format!("current user check failed: {err}"))?;
    let body = checked_json(response, "current user check").await?;
    if body["id"].as_str() != Some(user.id.as_str()) {
        return Err("refresh resolved to a different user".to_string());
    }
    Ok(())
}

async fn rpc(
    client: &Client,
    config: &Config,
    user: &User,
    name: &str,
    payload: Value,
) -> Result<Value, String> {
    let response = app_request(
        client.post(format!("{}/rest/v1/rpc/{name}", config.base_url)),
        config,
        &user.access_token,
    )
    .json(&payload)
    .send()
    .await
    .map_err(|err| format!("RPC {name} failed: {err}"))?;
    checked_json(response, &format!("RPC {name}")).await
}

async fn select_message(
    client: &Client,
    config: &Config,
    user: &User,
    message_id: &str,
) -> Result<Vec<Value>, String> {
    let response = app_request(
        client.get(format!(
            "{}/rest/v1/messages?id=eq.{message_id}&select=*",
            config.base_url
        )),
        config,
        &user.access_token,
    )
    .send()
    .await
    .map_err(|err| format!("select message failed: {err}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "select message returned HTTP {}",
            response.status()
        ));
    }
    response
        .json()
        .await
        .map_err(|err| format!("select message parse failed: {err}"))
}

async fn select_tag(
    client: &Client,
    config: &Config,
    user: &User,
    tag_id: &str,
) -> Result<Vec<Value>, String> {
    let response = app_request(
        client.get(format!(
            "{}/rest/v1/tags?id=eq.{tag_id}&select=*",
            config.base_url
        )),
        config,
        &user.access_token,
    )
    .send()
    .await
    .map_err(|err| format!("select tag failed: {err}"))?;
    if !response.status().is_success() {
        return Err(format!("select tag returned HTTP {}", response.status()));
    }
    response
        .json()
        .await
        .map_err(|err| format!("select tag parse failed: {err}"))
}

async fn delete_user(client: &Client, config: &Config, user_id: &str) {
    let _ = client
        .delete(format!("{}/auth/v1/admin/users/{user_id}", config.base_url))
        .header("apikey", &config.service_key)
        .bearer_auth(&config.service_key)
        .send()
        .await;
}

type RealtimeSocket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn realtime_join(config: &Config, user: &User) -> Result<RealtimeSocket, String> {
    let scheme = if config.base_url.starts_with("https://") {
        "wss://"
    } else {
        "ws://"
    };
    let host = config
        .base_url
        .split_once("://")
        .map(|(_, value)| value)
        .unwrap_or(&config.base_url);
    let url = format!(
        "{}{}/realtime/v1/websocket?apikey={}&vsn=1.0.0",
        scheme,
        host,
        urlencoding::encode(&config.anon_key)
    );
    let (mut socket, _) = connect_async(&url)
        .await
        .map_err(|err| format!("Realtime connect failed: {err}"))?;
    socket.send(Message::Text(json!({
        "topic":format!("realtime:transfer-genie-probe-{}",random_hex(4)),"event":"phx_join",
        "payload":{"config":{"broadcast":{"ack":false,"self":false},"presence":{"key":""},
        "postgres_changes":[{"event":"*","schema":APP_SCHEMA,"table":"change_log"}]},"access_token":user.access_token},
        "ref":"1","join_ref":"1"
    }).to_string())).await.map_err(|err| format!("Realtime join send failed: {err}"))?;
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        let Some(message) = timeout(Duration::from_secs(5), socket.next())
            .await
            .map_err(|_| "Realtime join timed out".to_string())?
        else {
            break;
        };
        let message = message.map_err(|err| format!("Realtime join read failed: {err}"))?;
        if let Message::Text(text) = message {
            let value: Value = serde_json::from_str(&text).map_err(|err| err.to_string())?;
            if value["event"] == "phx_reply" && value["ref"] == "1" {
                if value["payload"]["status"] == "ok" {
                    return Ok(socket);
                }
                return Err(format!("Realtime join rejected: {}", value["payload"]));
            }
        }
    }
    Err("Realtime channel did not confirm join".to_string())
}

async fn wait_realtime(socket: &mut RealtimeSocket, entity_id: &str) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        let Some(message) = timeout(Duration::from_secs(5), socket.next())
            .await
            .ok()
            .and_then(|value| value)
        else {
            continue;
        };
        let message = message.map_err(|err| format!("Realtime event read failed: {err}"))?;
        if let Message::Text(text) = message {
            let value: Value = serde_json::from_str(&text).map_err(|err| err.to_string())?;
            if value["event"] == "postgres_changes" && value.to_string().contains(entity_id) {
                return Ok(());
            }
        }
    }
    Err("Realtime did not deliver expected change".to_string())
}

async fn storage_upload(
    client: &Client,
    config: &Config,
    user: &User,
    path: &str,
    data: &'static [u8],
) -> Result<(), String> {
    let response = authenticated(
        client.post(format!(
            "{}/storage/v1/object/{FILE_BUCKET}/{path}",
            config.base_url
        )),
        config,
        &user.access_token,
    )
    .header("content-type", "text/plain")
    .body(data)
    .send()
    .await
    .map_err(|err| format!("Storage upload failed: {err}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        return Err(format!("Storage upload returned HTTP {status}: {detail}"));
    }
    Ok(())
}

async fn storage_read(
    client: &Client,
    config: &Config,
    user: &User,
    path: &str,
) -> Result<reqwest::Response, String> {
    authenticated(
        client.get(format!(
            "{}/storage/v1/object/authenticated/{FILE_BUCKET}/{path}",
            config.base_url
        )),
        config,
        &user.access_token,
    )
    .send()
    .await
    .map_err(|err| format!("Storage read failed: {err}"))
}

async fn storage_delete(
    client: &Client,
    config: &Config,
    user: &User,
    path: &str,
) -> Result<(), String> {
    let response = authenticated(
        client.delete(format!(
            "{}/storage/v1/object/{FILE_BUCKET}",
            config.base_url
        )),
        config,
        &user.access_token,
    )
    .json(&json!({"prefixes":[path]}))
    .send()
    .await
    .map_err(|err| format!("Storage delete failed: {err}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Storage delete returned HTTP {}",
            response.status()
        ));
    }
    Ok(())
}

async fn verify_direct_write_denied(
    client: &Client,
    config: &Config,
    user: &User,
    space_id: &str,
) -> Result<(), String> {
    let response=app_request(client.post(format!("{}/rest/v1/messages",config.base_url)),config,&user.access_token)
        .json(&json!({"id":random_uuid(),"owner_id":user.id,"space_id":space_id,"sender":"probe","timestamp_ms":1,"kind":"text","original_name":"forbidden.txt"}))
        .send().await.map_err(|err|format!("direct write check failed: {err}"))?;
    if response.status().is_success() {
        return Err("authenticated user bypassed RPC write boundary".to_string());
    }
    Ok(())
}

fn expect(value: bool, message: &str) -> Result<(), String> {
    if value {
        Ok(())
    } else {
        Err(message.to_string())
    }
}

fn rpc_payload(
    operation_id: &str,
    payload_hash: &str,
    space_id: &str,
    message_id: &str,
    action: &str,
    base_revision: i64,
    payload: Value,
) -> Value {
    json!({
        "p_operation_id": operation_id,
        "p_payload_hash": payload_hash,
        "p_space_id": space_id,
        "p_message_id": message_id,
        "p_action": action,
        "p_base_revision": base_revision,
        "p_payload": payload
    })
}

async fn expect_rpc_denied(
    client: &Client,
    config: &Config,
    user: &User,
    name: &str,
    payload: Value,
    expected_text: &str,
) -> Result<(), String> {
    let response = app_request(
        client.post(format!("{}/rest/v1/rpc/{name}", config.base_url)),
        config,
        &user.access_token,
    )
    .json(&payload)
    .send()
    .await
    .map_err(|err| format!("negative RPC {name} failed: {err}"))?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    expect(
        !status.is_success() && body.contains(expected_text),
        &format!("RPC {name} did not reject with {expected_text}"),
    )
}

async fn run_contract(
    client: &Client,
    config: &Config,
    user_a: &mut User,
    user_a_device_b: &User,
    user_b: &mut User,
) -> Result<String, String> {
    refresh(client, config, user_a).await?;
    let status = rpc(client, config, user_a, "cloud_status", json!({})).await?;
    expect(
        status["schemaVersion"] == "001_transfer_genie_initial"
            && status["userId"] == user_a.id
            && status["bucket"] == FILE_BUCKET,
        "cloud status contract mismatch",
    )?;

    let space_id = random_uuid();
    let user_a_create_operation = random_uuid();
    rpc(
        client,
        config,
        user_a,
        "space_upsert",
        json!({
            "p_operation_id": user_a_create_operation,
            "p_space_id": space_id,
            "p_name": "Probe A"
        }),
    )
    .await?;
    let user_b_create_operation = random_uuid();
    rpc(
        client,
        config,
        user_b,
        "space_upsert",
        json!({
            "p_operation_id": user_b_create_operation,
            "p_space_id": space_id,
            "p_name": "Probe B"
        }),
    )
    .await?;
    verify_direct_write_denied(client, config, user_a, &space_id).await?;

    let mut realtime = realtime_join(config, user_a).await?;
    let message_id = random_uuid();
    let create_operation = random_uuid();
    let create_payload = json!({
        "sender": "probe",
        "timestampMs": 1730000000000_i64,
        "size": 18,
        "kind": "text",
        "originalName": "probe.txt",
        "content": "supabase rust probe",
        "format": "text",
        "sourceKind": "telegram",
        "sourceChannelId": "-100123",
        "sourceMessageId": "456",
        "markedTagIds": []
    });
    let create_args = rpc_payload(
        &create_operation,
        "probe-message-v1",
        &space_id,
        &message_id,
        "upsert",
        0,
        create_payload.clone(),
    );
    let created = rpc(client, config, user_a, "message_apply", create_args.clone()).await?;
    expect(
        created["status"] == "applied" && created["revision"] == 1,
        "message create did not apply revision 1",
    )?;
    let replayed = rpc(client, config, user_a, "message_apply", create_args).await?;
    expect(
        replayed == created,
        "idempotent message replay changed its result",
    )?;
    expect_rpc_denied(
        client,
        config,
        user_a,
        "message_apply",
        rpc_payload(
            &create_operation,
            "probe-message-different",
            &space_id,
            &message_id,
            "upsert",
            0,
            create_payload.clone(),
        ),
        "OPERATION_ID_PAYLOAD_MISMATCH",
    )
    .await?;
    wait_realtime(&mut realtime, &message_id).await?;
    let create_seq = created["changeSeq"]
        .as_i64()
        .ok_or("message create did not return a change sequence")?;
    realtime
        .close(None)
        .await
        .map_err(|err| format!("Realtime disconnect failed: {err}"))?;

    let device_b_update = rpc(
        client,
        config,
        user_a_device_b,
        "message_apply",
        rpc_payload(
            &random_uuid(),
            "probe-device-b-update",
            &space_id,
            &message_id,
            "upsert",
            1,
            json!({
                "sender":"probe-device-b","timestampMs":1730000000000_i64,
                "size":25,"kind":"text","originalName":"probe.txt",
                "content":"updated while A was offline","format":"text",
                "sourceKind":"telegram","sourceChannelId":"-100123",
                "sourceMessageId":"456",
                "markedTagIds":[]
            }),
        ),
    )
    .await?;
    expect(
        device_b_update["status"] == "applied" && device_b_update["revision"] == 2,
        "second session could not update the same user's message",
    )?;

    realtime = realtime_join(config, user_a).await?;
    let missed_changes = rpc(
        client,
        config,
        user_a,
        "pull_changes",
        json!({"p_space_id":space_id,"p_after_seq":create_seq,"p_limit":100}),
    )
    .await?;
    expect(
        missed_changes.as_array().is_some_and(|rows| {
            rows.iter()
                .any(|row| row["entity_id"] == message_id && row["revision"] == 2)
        }),
        "checkpoint pull omitted the change made while Realtime was disconnected",
    )?;

    let rows_a = select_message(client, config, user_a, &message_id).await?;
    let rows_b = select_message(client, config, user_b, &message_id).await?;
    expect(rows_a.len() == 1, "owner could not read its message")?;
    expect(
        rows_a[0]["source_kind"] == "telegram"
            && rows_a[0]["source_channel_id"] == "-100123"
            && rows_a[0]["source_message_id"] == "456",
        "message source identity did not round-trip through RPC and REST pull",
    )?;
    expect(rows_b.is_empty(), "RLS exposed a message to another user")?;
    let legacy_message_id = random_uuid();
    let legacy_create = rpc(
        client,
        config,
        user_a,
        "message_apply",
        rpc_payload(
            &random_uuid(),
            "probe-legacy-null-source",
            &space_id,
            &legacy_message_id,
            "upsert",
            0,
            json!({
                "sender":"legacy","timestampMs":1730000000001_i64,
                "size":6,"kind":"text","originalName":"legacy.txt",
                "content":"legacy","format":"text","markedTagIds":[]
            }),
        ),
    )
    .await?;
    expect(
        legacy_create["status"] == "applied",
        "legacy null-source row did not apply",
    )?;
    let legacy_rows = select_message(client, config, user_a, &legacy_message_id).await?;
    expect(
        legacy_rows.len() == 1
            && legacy_rows[0]["source_kind"].is_null()
            && legacy_rows[0]["source_channel_id"].is_null()
            && legacy_rows[0]["source_message_id"].is_null(),
        "legacy message did not preserve null source metadata",
    )?;
    let duplicate_source_id = random_uuid();
    let duplicate_source = rpc(
        client,
        config,
        user_a,
        "message_apply",
        rpc_payload(
            &random_uuid(),
            "probe-duplicate-source",
            &space_id,
            &duplicate_source_id,
            "upsert",
            0,
            create_payload.clone(),
        ),
    )
    .await?;
    expect(
        duplicate_source["status"] == "applied"
            && duplicate_source["idempotent"] == true
            && duplicate_source["entityId"] == message_id,
        "duplicate external source was not handled idempotently",
    )?;
    let same_id_duplicate = rpc(
        client,
        config,
        user_a,
        "message_apply",
        rpc_payload(
            &random_uuid(),
            "probe-same-id-duplicate-source",
            &space_id,
            &message_id,
            "upsert",
            0,
            create_payload.clone(),
        ),
    )
    .await?;
    expect(
        same_id_duplicate["status"] == "applied"
            && same_id_duplicate["idempotent"] == true
            && same_id_duplicate["entityId"] == message_id,
        "same-id duplicate external source was not handled idempotently",
    )?;

    let mut stale_payload = create_payload.clone();
    if let Some(payload) = stale_payload.as_object_mut() {
        payload.remove("sourceKind");
        payload.remove("sourceChannelId");
        payload.remove("sourceMessageId");
    }
    let stale = rpc(
        client,
        config,
        user_a,
        "message_apply",
        rpc_payload(
            &random_uuid(),
            "probe-stale",
            &space_id,
            &message_id,
            "upsert",
            0,
            stale_payload,
        ),
    )
    .await?;
    expect(
        stale["status"] == "conflict" && stale["remoteRevision"] == 2,
        "stale message update did not return a conflict",
    )?;

    let tag_id = format!("tag-probe-{}", random_hex(6));
    let tag = rpc(
        client,
        config,
        user_a,
        "tag_apply",
        json!({
            "p_operation_id":random_uuid(),"p_payload_hash":"probe-tag-v1",
            "p_space_id":space_id,"p_tag_id":tag_id,"p_action":"upsert",
            "p_base_revision":0,"p_name":"Probe tag"
        }),
    )
    .await?;
    expect(tag["status"] == "applied", "tag create failed")?;

    let renamed_tag = rpc(
        client,
        config,
        user_a_device_b,
        "tag_apply",
        json!({
            "p_operation_id":random_uuid(),"p_payload_hash":"probe-tag-v2",
            "p_space_id":space_id,"p_tag_id":tag_id,"p_action":"upsert",
            "p_base_revision":1,"p_name":"Probe tag renamed"
        }),
    )
    .await?;
    expect(
        renamed_tag["status"] == "applied" && renamed_tag["revision"] == 2,
        "tag rename from the second session failed",
    )?;

    let updated = rpc(
        client,
        config,
        user_a,
        "message_apply",
        rpc_payload(
            &random_uuid(),
            "probe-message-v2",
            &space_id,
            &message_id,
            "upsert",
            2,
            json!({
                "sender":"probe","timestampMs":1730000000000_i64,"size":18,
                "kind":"text","originalName":"probe.txt",
                "content":"supabase rust probe","format":"text",
                "marked":true,"markedTagIds":[tag_id],
                "markedPinned":true,"markedDueDate":"2026-12-31"
            }),
        ),
    )
    .await?;
    expect(
        updated["revision"] == 3,
        "message update did not reach revision 3",
    )?;
    wait_realtime(&mut realtime, &message_id).await?;

    let marked_rows = select_message(client, config, user_a_device_b, &message_id).await?;
    let marked_row = marked_rows
        .first()
        .ok_or("second session could not read marked message")?;
    expect(
        marked_row["marked"] == true
            && marked_row["marked_pinned"] == true
            && marked_row["marked_due_date"] == "2026-12-31"
            && marked_row["marked_tag_ids"]
                .as_array()
                .is_some_and(|ids| ids.iter().any(|id| id == &tag_id)),
        "marked fields were not preserved for the second session",
    )?;
    let renamed_rows = select_tag(client, config, user_a, &tag_id).await?;
    expect(
        renamed_rows
            .first()
            .is_some_and(|row| row["name"] == "Probe tag renamed" && row["revision"] == 2),
        "renamed tag was not readable from the other session",
    )?;

    let cleaned = rpc(
        client,
        config,
        user_a,
        "message_apply",
        rpc_payload(
            &random_uuid(),
            "probe-message-tag-cleanup",
            &space_id,
            &message_id,
            "upsert",
            3,
            json!({
                "sender":"probe","timestampMs":1730000000000_i64,"size":18,
                "kind":"text","originalName":"probe.txt",
                "content":"supabase rust probe","format":"text",
                "marked":true,"markedTagIds":[],
                "markedPinned":true,"markedDueDate":"2026-12-31"
            }),
        ),
    )
    .await?;
    expect(
        cleaned["status"] == "applied" && cleaned["revision"] == 4,
        "message tag cleanup failed",
    )?;
    let deleted_tag = rpc(
        client,
        config,
        user_a,
        "tag_apply",
        json!({
            "p_operation_id":random_uuid(),"p_payload_hash":"probe-tag-delete",
            "p_space_id":space_id,"p_tag_id":tag_id,"p_action":"delete",
            "p_base_revision":2,"p_name":Value::Null
        }),
    )
    .await?;
    expect(
        deleted_tag["status"] == "applied" && deleted_tag["revision"] == 3,
        "tag delete failed after message cleanup",
    )?;
    let cleanup_changes = rpc(
        client,
        config,
        user_a_device_b,
        "pull_changes",
        json!({
            "p_space_id":space_id,
            "p_after_seq":updated["changeSeq"].as_i64().unwrap_or(0),
            "p_limit":100
        }),
    )
    .await?;
    expect(
        cleanup_changes.as_array().is_some_and(|rows| {
            rows.iter().any(|row| {
                row["entity_type"] == "message"
                    && row["entity_id"] == message_id
                    && row["revision"] == 4
            }) && rows.iter().any(|row| {
                row["entity_type"] == "tag"
                    && row["entity_id"] == tag_id
                    && row["change_type"] == "delete"
                    && row["revision"] == 3
            })
        }),
        "second session did not pull message tag cleanup and tag tombstone",
    )?;
    let cleaned_rows = select_message(client, config, user_a_device_b, &message_id).await?;
    expect(
        cleaned_rows.first().is_some_and(|row| {
            row["marked_tag_ids"]
                .as_array()
                .is_some_and(|ids| ids.is_empty())
        }),
        "deleted tag remained referenced by the marked message",
    )?;

    let attachment_id = random_uuid();
    let object_path = format!("{}/{}/{}/probe.txt", user_a.id, space_id, attachment_id);
    const FILE_BYTES: &[u8] = b"transfer-genie-supabase-probe";
    storage_upload(client, config, user_a, &object_path, FILE_BYTES).await?;
    let owner_read = storage_read(client, config, user_a, &object_path).await?;
    expect(
        owner_read.status().is_success(),
        "owner could not read private object",
    )?;
    let owner_bytes = owner_read
        .bytes()
        .await
        .map_err(|err| format!("Storage body read failed: {err}"))?;
    expect(
        owner_bytes.as_ref() == FILE_BYTES,
        "Storage bytes changed after upload",
    )?;
    let other_read = storage_read(client, config, user_b, &object_path).await?;
    expect(
        !other_read.status().is_success(),
        "Storage RLS exposed another user's object",
    )?;

    let attachment_operation = random_uuid();
    expect_rpc_denied(
        client,
        config,
        user_a,
        "attachment_apply",
        json!({
            "p_operation_id":attachment_operation,"p_payload_hash":"probe-attachment-v1",
            "p_space_id":space_id,"p_attachment_id":attachment_id,
            "p_action":"upsert","p_base_revision":0,
            "p_payload":{
                "messageId":random_uuid(),"originalName":"probe.txt",
                "objectPath":object_path,"mimeType":"text/plain",
                "size":FILE_BYTES.len(),"sha256":"probe-sha256",
                "uploadStatus":"uploaded"
            }
        }),
        "MESSAGE_NOT_FOUND",
    )
    .await?;
    let retained_after_metadata_failure =
        storage_read(client, config, user_a, &object_path).await?;
    expect(
        retained_after_metadata_failure.status().is_success(),
        "Storage object disappeared after metadata failure",
    )?;

    let attachment = rpc(
        client,
        config,
        user_a,
        "attachment_apply",
        json!({
            "p_operation_id":attachment_operation,"p_payload_hash":"probe-attachment-v1",
            "p_space_id":space_id,"p_attachment_id":attachment_id,
            "p_action":"upsert","p_base_revision":0,
            "p_payload":{
                "messageId":message_id,"originalName":"probe.txt",
                "objectPath":object_path,"mimeType":"text/plain",
                "size":FILE_BYTES.len(),"sha256":"probe-sha256",
                "uploadStatus":"uploaded"
            }
        }),
    )
    .await?;
    expect(
        attachment["status"] == "applied",
        "attachment metadata create failed",
    )?;

    let changes = rpc(
        client,
        config,
        user_a,
        "pull_changes",
        json!({"p_space_id":space_id,"p_after_seq":0,"p_limit":100}),
    )
    .await?;
    let change_rows = changes
        .as_array()
        .ok_or("pull_changes did not return an array")?;
    expect(
        change_rows.iter().any(|row| row["entity_id"] == message_id)
            && change_rows
                .iter()
                .any(|row| row["entity_id"] == attachment_id),
        "pull_changes omitted message or attachment changes",
    )?;

    storage_delete(client, config, user_a, &object_path).await?;
    let deleted = rpc(
        client,
        config,
        user_a,
        "message_apply",
        rpc_payload(
            &random_uuid(),
            "probe-message-delete",
            &space_id,
            &message_id,
            "delete",
            4,
            json!({}),
        ),
    )
    .await?;
    expect(
        deleted["status"] == "applied" && deleted["revision"] == 5,
        "message tombstone did not reach revision 5",
    )?;
    let deletion_changes = rpc(
        client,
        config,
        user_a_device_b,
        "pull_changes",
        json!({
            "p_space_id":space_id,
            "p_after_seq":updated["changeSeq"].as_i64().unwrap_or(0),
            "p_limit":100
        }),
    )
    .await?;
    expect(
        deletion_changes.as_array().is_some_and(|rows| {
            rows.iter().any(|row| {
                row["entity_id"] == message_id
                    && row["change_type"] == "delete"
                    && row["revision"] == 5
            })
        }),
        "second session did not pull the message tombstone",
    )?;
    let _ = realtime.close(None).await;
    Ok(object_path)
}

#[tokio::main]
async fn main() {
    let result = async {
        let config = config()?;
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|err| format!("HTTP client creation failed: {err}"))?;

        let mut user_a = create_user(&client, &config, "a").await?;
        let user_b_created = match create_user(&client, &config, "b").await {
            Ok(user) => user,
            Err(err) => {
                delete_user(&client, &config, &user_a.id).await;
                return Err(err);
            }
        };
        let mut user_b = user_b_created;

        let contract_result = async {
            sign_in(&client, &config, &mut user_a).await?;
            let mut user_a_device_b = User {
                id: user_a.id.clone(),
                email: user_a.email.clone(),
                password: user_a.password.clone(),
                access_token: String::new(),
                refresh_token: String::new(),
            };
            sign_in(&client, &config, &mut user_a_device_b).await?;
            sign_in(&client, &config, &mut user_b).await?;
            run_contract(&client, &config, &mut user_a, &user_a_device_b, &mut user_b).await
        }
        .await;

        if let Ok(path) = &contract_result {
            let _ = storage_delete(&client, &config, &user_a, path).await;
        }
        delete_user(&client, &config, &user_a.id).await;
        delete_user(&client, &config, &user_b.id).await;
        contract_result.map(|_| ())
    }
    .await;

    match result {
        Ok(()) => println!("Supabase probe passed: Auth, RPC, RLS, Realtime and Storage"),
        Err(err) => {
            eprintln!("Supabase probe failed: {err}");
            std::process::exit(1);
        }
    }
}
