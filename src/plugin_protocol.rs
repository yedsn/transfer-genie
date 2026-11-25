use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_REFERENCES: usize = 50;
pub const IMAGE_PLUGIN_ID: &str = "image-downloader";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PluginManifest {
    pub manifest_version: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    pub host_api_version: u32,
    #[serde(default)]
    pub supported_platforms: Vec<String>,
    #[serde(default)]
    pub capabilities: Vec<Capability>,
    pub runtime: Runtime,
    #[serde(default)]
    pub config_schema: Vec<ConfigField>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Capability {
    pub kind: String,
    #[serde(default)]
    pub input_types: Vec<String>,
    #[serde(default)]
    pub batch: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Runtime {
    pub mode: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub interpreter: Option<String>,
    #[serde(default)]
    pub auto_start: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConfigField {
    pub key: String,
    pub label: String,
    pub kind: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub default: Value,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct MessageReference {
    pub filename: String,
    #[serde(default)]
    pub message_id: Option<String>,
    pub sender: String,
    pub timestamp_ms: i64,
    pub kind: String,
    pub original_name: String,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub file_hash: Option<String>,
    #[serde(default)]
    pub etag: Option<String>,
    #[serde(default)]
    pub size: i64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct MessageContext {
    #[serde(default)]
    pub references: Vec<MessageReference>,
    #[serde(default)]
    pub target_bot_instance_id: Option<String>,
    #[serde(default)]
    pub task_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BotInstance {
    #[serde(default = "protocol_version")]
    pub protocol_version: u32,
    pub instance_id: String,
    pub plugin_id: String,
    pub name: String,
    pub device_id: String,
    pub device_name: String,
    pub platform: String,
    pub enabled: bool,
    pub heartbeat_ms: i64,
    pub expires_at_ms: i64,
    pub capabilities: Vec<Capability>,
}
fn protocol_version() -> u32 {
    PROTOCOL_VERSION
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BotTask {
    pub protocol_version: u32,
    pub task_id: String,
    pub target_instance_id: String,
    pub author_device_id: String,
    pub message_filename: String,
    pub text: String,
    pub references: Vec<MessageReference>,
    pub created_at_ms: i64,
    pub expires_at_ms: i64,
    #[serde(default)]
    pub retry_of: Option<String>,
    #[serde(default)]
    pub retry_item_ids: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskEvent {
    pub task_id: String,
    pub event_id: String,
    pub device_id: String,
    pub timestamp_ms: i64,
    pub kind: String,
    #[serde(default)]
    pub payload: Value,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskInput {
    pub item_id: String,
    pub name: String,
    #[serde(default)]
    pub local_path: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InvokeRequest {
    pub protocol_version: u32,
    pub kind: String,
    pub request_id: String,
    pub task_id: String,
    pub text: String,
    pub config: Value,
    pub inputs: Vec<TaskInput>,
    pub state_dir: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ItemResult {
    pub item_id: String,
    pub status: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub saved_path: Option<String>,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub error: Option<String>,
}

pub fn valid_component(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value != "."
        && value != ".."
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
}

pub fn validate_item_results(value: &Value, inputs: &[TaskInput]) -> Result<(), String> {
    let items = value
        .get("items")
        .and_then(Value::as_array)
        .ok_or("插件缺少逐项结果")?;
    let expected: std::collections::HashSet<_> =
        inputs.iter().map(|item| item.item_id.as_str()).collect();
    if expected.len() != inputs.len() || items.len() != inputs.len() {
        return Err("插件返回的任务项数量不符".into());
    }
    let mut seen = std::collections::HashSet::new();
    for item in items {
        let id = item
            .get("item_id")
            .and_then(Value::as_str)
            .ok_or("插件结果缺少任务项标识")?;
        if !expected.contains(id) || !seen.insert(id) {
            return Err("插件结果包含未知或重复任务项".into());
        }
        if !matches!(
            item.get("status").and_then(Value::as_str),
            Some("succeeded" | "failed" | "cancelled")
        ) {
            return Err("插件任务项状态无效".into());
        }
    }
    Ok(())
}
pub fn validate_manifest(m: &PluginManifest) -> Result<(), String> {
    if m.manifest_version != 1 || m.host_api_version != PROTOCOL_VERSION {
        return Err("插件协议版本不兼容".into());
    }
    if !valid_component(&m.id) || !valid_component(&m.version) || m.name.trim().is_empty() {
        return Err("插件标识、名称或版本无效".into());
    }
    if !["oneshot", "service"].contains(&m.runtime.mode.as_str()) {
        return Err("不支持的插件运行模式".into());
    }
    if !m.supported_platforms.is_empty()
        && !m
            .supported_platforms
            .iter()
            .any(|p| p == std::env::consts::OS)
    {
        return Err("插件不支持当前系统".into());
    }
    if m.runtime.command.trim().is_empty() {
        return Err("插件缺少运行入口".into());
    }
    let mut keys = std::collections::HashSet::new();
    for field in &m.config_schema {
        if !valid_component(&field.key) || !keys.insert(&field.key) || field.label.trim().is_empty()
        {
            return Err("插件配置字段标识无效或重复".into());
        }
        if !["text", "string", "directory", "number", "boolean", "secret"]
            .contains(&field.kind.as_str())
        {
            return Err("插件配置字段类型不受支持".into());
        }
    }
    Ok(())
}
pub fn validate_config(manifest: &PluginManifest, config: &Value) -> Result<(), String> {
    let object = config.as_object().ok_or("配置必须为对象")?;
    for key in object.keys() {
        if !manifest.config_schema.iter().any(|field| &field.key == key) {
            return Err(format!("未知配置字段：{key}"));
        }
    }
    for field in &manifest.config_schema {
        if field.kind == "secret" {
            if object.contains_key(&field.key) {
                return Err("密钥字段必须通过凭据接口设置".into());
            }
            continue;
        }
        let value = config.get(&field.key);
        if value.is_none() || value.is_some_and(Value::is_null) {
            if field.required {
                return Err(format!("请填写{}", field.label));
            }
            continue;
        }
        let value = value.unwrap();
        let valid = match field.kind.as_str() {
            "number" => value.is_number(),
            "boolean" => value.is_boolean(),
            _ => value
                .as_str()
                .is_some_and(|text| !field.required || !text.trim().is_empty()),
        };
        if !valid {
            return Err(format!("{}的配置类型或内容无效", field.label));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn configuration_preserves_types_and_rejects_unknown_fields_and_plaintext_secrets() {
        let mut manifest: PluginManifest = serde_json::from_str(include_str!(
            "../plugins/.system/image-downloader/plugin.json"
        ))
        .unwrap();
        manifest.config_schema = serde_json::from_value(serde_json::json!([
            {"key":"count","label":"Count","kind":"number","required":true},
            {"key":"enabled","label":"Enabled","kind":"boolean"},
            {"key":"token","label":"Token","kind":"secret"}
        ]))
        .unwrap();
        assert!(
            validate_config(&manifest, &serde_json::json!({"count":2,"enabled":false})).is_ok()
        );
        for config in [
            serde_json::json!({}),
            serde_json::json!({"count":"2"}),
            serde_json::json!({"count":2,"enabled":"false"}),
            serde_json::json!({"count":2,"extra":true}),
            serde_json::json!({"count":2,"token":"secret"}),
        ] {
            assert!(validate_config(&manifest, &config).is_err());
        }
    }
    #[test]
    fn rejects_missing_duplicate_and_unknown_item_results() {
        let inputs = vec![
            TaskInput {
                item_id: "one".into(),
                name: String::new(),
                local_path: None,
                url: None,
                error: None,
            },
            TaskInput {
                item_id: "two".into(),
                name: String::new(),
                local_path: None,
                url: None,
                error: None,
            },
        ];
        for items in [
            serde_json::json!([]),
            serde_json::json!([{"item_id":"one","status":"succeeded"},{"item_id":"one","status":"succeeded"}]),
            serde_json::json!([{"item_id":"one","status":"succeeded"},{"item_id":"unknown","status":"failed"}]),
            serde_json::json!([{"item_id":"one","status":"running"},{"item_id":"two","status":"failed"}]),
        ] {
            assert!(validate_item_results(&serde_json::json!({"items":items}), &inputs).is_err());
        }
        assert!(validate_item_results(&serde_json::json!({"items":[{"item_id":"two","status":"failed"},{"item_id":"one","status":"succeeded"}]}),&inputs).is_ok());
    }
    #[test]
    fn rejects_path_components() {
        for id in ["../a", "a/b", "C:\\a", "..", ""] {
            assert!(!valid_component(id));
        }
        assert!(valid_component("image-downloader"));
    }
    #[test]
    fn legacy_context_defaults_to_no_references() {
        let c: MessageContext = serde_json::from_str("{}").unwrap();
        assert!(c.references.is_empty());
        assert!(c.target_bot_instance_id.is_none());
    }
}
