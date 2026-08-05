use serde::{Deserialize, Serialize};

pub const DEFAULT_LOCAL_HTTP_API_BIND_ADDRESS: &str = "127.0.0.1";
pub const DEFAULT_LOCAL_HTTP_API_BIND_PORT: u16 = 6011;

fn default_endpoint_enabled() -> bool {
    true
}

fn default_send_hotkey() -> String {
    "enter".to_string()
}

fn default_global_hotkey_enabled() -> bool {
    true
}

fn default_global_hotkey() -> String {
    "alt+t".to_string()
}

fn default_auto_update_enabled() -> bool {
    false
}

fn default_telegram_poll_interval_secs() -> u64 {
    5
}

fn default_telegram_proxy_url() -> String {
    "http://127.0.0.1:7890".to_string()
}

fn default_local_http_api_bind_address() -> String {
    DEFAULT_LOCAL_HTTP_API_BIND_ADDRESS.to_string()
}

fn default_local_http_api_bind_port() -> u16 {
    DEFAULT_LOCAL_HTTP_API_BIND_PORT
}

fn default_backup_interval_minutes() -> u64 {
    60
}

fn default_backup_retain_count() -> u32 {
    10
}

fn default_backup_keep_all_days() -> u32 {
    3
}

fn default_backup_keep_daily_days() -> u32 {
    7
}

fn default_backup_dir() -> String {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    if home.trim().is_empty() {
        "TransferGenie/backup".to_string()
    } else {
        std::path::Path::new(&home)
            .join("TransferGenie")
            .join("backup")
            .to_string_lossy()
            .to_string()
    }
}

fn default_ai_provider_kind() -> String {
    "openai_compatible".to_string()
}

fn default_ai_timeout_secs() -> u64 {
    60
}

fn default_ai_temperature() -> f32 {
    0.3
}

fn default_ai_action_output_mode() -> String {
    "preview_replace".to_string()
}

fn default_ai_action_category() -> String {
    "通用".to_string()
}

fn default_ai_default_action_id() -> String {
    "polish".to_string()
}

fn default_ai_actions() -> Vec<AiTextAction> {
    vec![
        AiTextAction {
            id: "polish".to_string(),
            name: "润色".to_string(),
            category: "通用".to_string(),
            builtin: true,
            favorite: true,
            enabled: true,
            system_prompt: "你是一个中文写作助手。".to_string(),
            user_prompt: "请润色下面的内容，保持原意不变，让表达更清晰、自然。如果输入是 Markdown，请保持 Markdown 结构。只输出润色后的文本。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "formalize".to_string(),
            name: "正式一点".to_string(),
            category: "通用".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个中文写作助手。".to_string(),
            user_prompt: "请将下面的内容改写得更正式、得体，保持原意不变。如果输入是 Markdown，请保持 Markdown 结构。只输出改写后的文本。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "shorten".to_string(),
            name: "简洁一点".to_string(),
            category: "通用".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个中文写作助手。".to_string(),
            user_prompt: "请压缩下面的内容，去掉冗余表达，保留关键信息。如果输入是 Markdown，请保持 Markdown 结构。只输出处理后的文本。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "dev-explain".to_string(),
            name: "解释代码/技术内容".to_string(),
            category: "开发".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个资深软件工程师，擅长用清晰、准确的中文解释技术内容。".to_string(),
            user_prompt: "请解释下面的代码或技术内容，先说明核心作用，再列出关键逻辑和注意事项。保持简洁，不要编造上下文。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "dev-pr-summary".to_string(),
            name: "生成变更说明".to_string(),
            category: "开发".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个严谨的软件工程协作者。".to_string(),
            user_prompt: "请把下面的开发记录整理成简洁的变更说明，包含用户可见变化和验证方式。如果输入是 Markdown，请保持 Markdown 结构。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "design-feedback".to_string(),
            name: "设计反馈".to_string(),
            category: "设计".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个注重产品质感和可用性的设计工程师。".to_string(),
            user_prompt: "请对下面的界面或交互描述给出设计反馈，重点关注信息层级、可用性、视觉一致性和可落地的优化建议。只输出反馈内容。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "design-copy".to_string(),
            name: "优化界面文案".to_string(),
            category: "设计".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个中文产品文案设计师，擅长写清晰、克制、可操作的界面文案。".to_string(),
            user_prompt: "请优化下面的界面文案，让它更清晰、自然、符合产品语境。保留原意，只输出优化后的文案。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "film-logline".to_string(),
            name: "影视一句话梗概".to_string(),
            category: "影视".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个影视策划编辑，擅长提炼故事卖点。".to_string(),
            user_prompt: "请把下面的影视创意或剧情整理成一句话梗概，突出主角、目标、冲突和看点。只输出梗概。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "film-scene-polish".to_string(),
            name: "润色场景描述".to_string(),
            category: "影视".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个影视剧本文案编辑，擅长增强画面感和节奏感。".to_string(),
            user_prompt: "请润色下面的场景描述，增强画面感、动作节奏和情绪氛围，保持原始信息不变。只输出润色后的文本。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
    ]
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LocalHttpApiSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_local_http_api_bind_address")]
    pub bind_address: String,
    #[serde(default = "default_local_http_api_bind_port")]
    pub bind_port: u16,
}

impl Default for LocalHttpApiSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            bind_address: default_local_http_api_bind_address(),
            bind_port: default_local_http_api_bind_port(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WebDavEndpoint {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub url: String,
    pub username: String,
    pub password: String,
    #[serde(default = "default_endpoint_enabled")]
    pub enabled: bool,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TelegramBridgeSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub auto_start: bool,
    #[serde(default)]
    pub sender_name: String,
    #[serde(default)]
    pub bot_token: String,
    #[serde(default)]
    pub chat_id: String,
    #[serde(default)]
    pub proxy_enabled: bool,
    #[serde(default = "default_telegram_proxy_url")]
    pub proxy_url: String,
    #[serde(default = "default_telegram_poll_interval_secs")]
    pub poll_interval_secs: u64,
}

impl Default for TelegramBridgeSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            auto_start: false,
            sender_name: String::new(),
            bot_token: String::new(),
            chat_id: String::new(),
            proxy_enabled: false,
            proxy_url: default_telegram_proxy_url(),
            poll_interval_secs: default_telegram_poll_interval_secs(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BackupSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_backup_interval_minutes")]
    pub interval_minutes: u64,
    #[serde(default = "default_backup_retain_count")]
    pub retain_count: u32,
    #[serde(default = "default_backup_dir")]
    pub directory: String,
    #[serde(default = "default_backup_keep_all_days")]
    pub keep_all_days: u32,
    #[serde(default = "default_backup_keep_daily_days")]
    pub keep_daily_days: u32,
}

impl Default for BackupSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            interval_minutes: default_backup_interval_minutes(),
            retain_count: default_backup_retain_count(),
            directory: default_backup_dir(),
            keep_all_days: default_backup_keep_all_days(),
            keep_daily_days: default_backup_keep_daily_days(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
pub struct AiProviderSettings {
    #[serde(default = "default_ai_provider_kind")]
    pub kind: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    #[serde(default = "default_ai_temperature")]
    pub temperature: f32,
    #[serde(default = "default_ai_timeout_secs")]
    pub timeout_secs: u64,
}

impl Default for AiProviderSettings {
    fn default() -> Self {
        Self {
            kind: default_ai_provider_kind(),
            base_url: String::new(),
            api_key: String::new(),
            model: String::new(),
            temperature: default_ai_temperature(),
            timeout_secs: default_ai_timeout_secs(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiTextAction {
    pub id: String,
    pub name: String,
    #[serde(default = "default_ai_action_category")]
    pub category: String,
    #[serde(default)]
    pub builtin: bool,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default = "default_endpoint_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default)]
    pub user_prompt: String,
    #[serde(default = "default_ai_action_output_mode")]
    pub output_mode: String,
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
pub struct AiSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub provider: AiProviderSettings,
    #[serde(default = "default_ai_default_action_id")]
    pub default_action_id: String,
    #[serde(default = "default_ai_actions")]
    pub actions: Vec<AiTextAction>,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: AiProviderSettings::default(),
            default_action_id: default_ai_default_action_id(),
            actions: default_ai_actions(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MarkedTag {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default)]
    pub webdav_endpoints: Vec<WebDavEndpoint>,
    #[serde(default)]
    pub active_webdav_id: Option<String>,
    #[serde(default)]
    pub sender_name: String,
    #[serde(default)]
    pub refresh_interval_secs: u64,
    #[serde(default)]
    pub download_dir: String,
    #[serde(default = "default_send_hotkey")]
    pub send_hotkey: String,
    #[serde(default = "default_global_hotkey_enabled")]
    pub global_hotkey_enabled: bool,
    #[serde(default = "default_global_hotkey")]
    pub global_hotkey: String,
    #[serde(default)]
    pub auto_start: bool,
    #[serde(default = "default_auto_update_enabled")]
    pub auto_update_enabled: bool,
    #[serde(default)]
    pub local_http_api: LocalHttpApiSettings,
    #[serde(default)]
    pub telegram: TelegramBridgeSettings,
    #[serde(default)]
    pub backup: BackupSettings,
    #[serde(default)]
    pub ai: AiSettings,
}

#[derive(Clone, Serialize)]
pub struct Message {
    pub filename: String,
    pub sender: String,
    pub timestamp_ms: i64,
    pub size: i64,
    pub kind: String,
    pub original_name: String,
    pub content: Option<String>,
    pub local_path: Option<String>,
    #[serde(default)]
    pub remote_path: Option<String>,
    pub file_hash: Option<String>,
    pub download_exists: bool,
    #[serde(default)]
    pub marked: bool,
    #[serde(default)]
    pub marked_tag_ids: Vec<String>,
    #[serde(default)]
    pub marked_pinned: bool,
    #[serde(default)]
    pub format: String,
}

#[derive(Clone, Serialize)]
pub struct SyncStatus {
    pub running: bool,
    pub last_run_ms: Option<i64>,
    pub last_error: Option<String>,
    pub last_result: Option<String>,
    pub current_source: Option<String>,
    pub conflict: Option<WebDavConflict>,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WebDavConflict {
    pub endpoint_id: String,
    pub filename: String,
    pub remote_path: String,
    pub local_etag: Option<String>,
    pub remote_etag: Option<String>,
    pub local_mtime: Option<String>,
    pub remote_mtime: Option<String>,
    pub local_size: i64,
    pub remote_size: i64,
}

#[derive(Clone, Serialize)]
pub struct DownloadHistoryRecord {
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
    pub local_exists: bool,
}

#[derive(Clone, Serialize)]
pub struct UploadHistoryRecord {
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
    pub local_exists: bool,
}

impl SyncStatus {
    pub fn idle() -> Self {
        Self {
            running: false,
            last_run_ms: None,
            last_error: None,
            last_result: Some("尚未同步".to_string()),
            current_source: None,
            conflict: None,
        }
    }
}

#[derive(Clone, Default, Debug)]
pub struct DavEntry {
    pub filename: String,
    pub remote_path: String,
    pub href: String,
    pub etag: Option<String>,
    pub size: Option<u64>,
    pub mtime: Option<String>,
    pub is_collection: bool,
}
