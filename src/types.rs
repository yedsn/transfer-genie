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
    7
}

fn default_settings_snapshot_retain_count() -> u32 {
    7
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

pub fn default_speech_to_text_provider_kind() -> String {
    "volcengine_agent_plan".to_string()
}

pub fn default_speech_to_text_resource_id() -> String {
    "volc.seedasr.sauc.duration".to_string()
}

pub fn default_speech_to_text_endpoint() -> String {
    "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream".to_string()
}

pub fn default_speech_to_text_shortcut_enabled() -> bool {
    false
}

pub fn default_speech_to_text_shortcut() -> String {
    "right-alt".to_string()
}

pub fn default_speech_to_text_max_duration_secs() -> u64 {
    60
}

pub fn default_speech_to_text_microphone_device_id() -> String {
    String::new()
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
            id: "summarize-points".to_string(),
            name: "总结要点".to_string(),
            category: "通用".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个严谨的中文信息整理助手。".to_string(),
            user_prompt: "请总结下面内容的核心要点，使用简洁的项目符号列表。保留重要事实、数字、结论和限制条件，不要编造原文没有的信息。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "extract-todos".to_string(),
            name: "提取待办".to_string(),
            category: "通用".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个执行力强的任务整理助手。".to_string(),
            user_prompt: "请从下面内容中提取待办事项，按任务、负责人、截止时间、备注整理。如果原文没有负责人或截止时间，请标注“未提及”。只输出待办列表。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "make-plan".to_string(),
            name: "制定执行计划".to_string(),
            category: "通用".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个务实的计划制定助手，擅长把目标拆成可执行步骤。".to_string(),
            user_prompt: "请根据下面内容制定一个简洁可执行的计划，包含目标、步骤、优先级、风险和待确认问题。不要编造不存在的前提；信息不足时写入待确认问题。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "translate-to-chinese".to_string(),
            name: "翻译成中文".to_string(),
            category: "翻译".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个准确、自然的翻译助手。".to_string(),
            user_prompt: "请将下面内容翻译成简体中文，保持原意准确、表达自然。如果输入是 Markdown，请保持 Markdown 结构；代码块、命令、URL 和专有名词按语境保留。只输出译文。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "translate-to-english".to_string(),
            name: "翻译成英文".to_string(),
            category: "翻译".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个准确、自然的中英翻译助手。".to_string(),
            user_prompt: "请将下面内容翻译成英文，保持原意准确、表达自然。如果输入是 Markdown，请保持 Markdown 结构；代码块、命令、URL 和专有名词按语境保留。只输出译文。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "translate-keep-format".to_string(),
            name: "保留格式翻译".to_string(),
            category: "翻译".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个重视格式一致性的翻译助手。".to_string(),
            user_prompt: "请翻译下面内容。若主要内容是中文，请翻译成英文；若主要内容是其他语言，请翻译成简体中文。严格保留原有 Markdown、列表、表格、代码块、链接和换行结构。只输出译文。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "chat-tone".to_string(),
            name: "改成聊天语气".to_string(),
            category: "沟通".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个中文沟通文案助手。".to_string(),
            user_prompt: "请把下面内容改写成适合即时聊天发送的语气，清楚、自然、不啰嗦，保持原意不变。只输出改写后的内容。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "email-tone".to_string(),
            name: "改成邮件语气".to_string(),
            category: "沟通".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个专业、克制的商务邮件写作助手。".to_string(),
            user_prompt: "请把下面内容改写成适合邮件发送的语气，结构清晰、礼貌得体、不过度客套，保持原意不变。只输出改写后的内容。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "draft-reply".to_string(),
            name: "生成回复".to_string(),
            category: "沟通".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个可靠的沟通协作者，擅长生成简洁有效的回复。".to_string(),
            user_prompt: "请根据下面收到的内容生成一段合适的中文回复。语气自然、重点明确；如果信息不足，请给出可直接发送的澄清回复。只输出回复内容。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "soften-tone".to_string(),
            name: "语气更温和".to_string(),
            category: "沟通".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个擅长降低沟通摩擦的中文表达助手。".to_string(),
            user_prompt: "请把下面内容改写得更温和、清楚、容易被接受，同时保留核心诉求和事实，不要削弱必要的边界。只输出改写后的内容。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "one-line-summary".to_string(),
            name: "提炼一句话".to_string(),
            category: "沟通".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个中文信息提炼助手。".to_string(),
            user_prompt: "请把下面内容提炼成一句清楚、可直接发送的话，保留最重要的信息。只输出一句话。\n\n{{text}}".to_string(),
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
            id: "dev-requirements-brief".to_string(),
            name: "梳理需求".to_string(),
            category: "开发".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个严谨的产品需求分析师和软件工程协作者，擅长把零散想法整理成可执行需求。".to_string(),
            user_prompt: "请把下面的需求描述整理成结构清晰的需求说明，包含：目标、范围、核心流程、功能点、验收标准、待确认问题。保持原意，不要编造不存在的信息；如果信息不足，请放入待确认问题。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "dev-error-analysis".to_string(),
            name: "分析报错".to_string(),
            category: "开发".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个严谨的软件排障助手。".to_string(),
            user_prompt: "请分析下面的报错或日志，说明可能原因、定位步骤和修复建议。不要编造不存在的环境信息；如果需要更多上下文，请列出需要补充的信息。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "dev-commit-message".to_string(),
            name: "生成 Commit Message".to_string(),
            category: "开发".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个熟悉 Git 工作流的软件工程协作者。".to_string(),
            user_prompt: "请根据下面的改动说明或 diff 生成一个简洁的 Git commit message。优先输出一行英文或中文标题；如有必要，再补充 2-3 条正文要点。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "dev-issue".to_string(),
            name: "整理成 Issue".to_string(),
            category: "开发".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个严谨的软件项目协作者。".to_string(),
            user_prompt: "请把下面内容整理成可提交的 Issue，包含标题、问题描述、复现步骤、预期结果、实际结果、补充信息。原文缺失的信息请标注“未提供”。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "dev-code-review".to_string(),
            name: "代码审查".to_string(),
            category: "开发".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个严格但务实的软件代码审查者。".to_string(),
            user_prompt: "请审查下面的代码或 diff，优先指出可能的 bug、回归风险、安全问题和缺失测试。按严重程度排序；如果没有明显问题，请说明剩余风险。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "dev-test-points".to_string(),
            name: "生成测试点".to_string(),
            category: "开发".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个注重风险覆盖的软件测试分析助手。".to_string(),
            user_prompt: "请根据下面的需求、改动或说明生成测试点，覆盖正常流程、边界情况、失败场景和回归风险。保持简洁可执行。\n\n{{text}}".to_string(),
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
            id: "format-markdown".to_string(),
            name: "整理为 Markdown".to_string(),
            category: "格式".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个擅长整理 Markdown 文档的编辑助手。".to_string(),
            user_prompt: "请把下面内容整理为结构清晰的 Markdown，保留原意和关键信息，合理使用标题、列表、代码块或表格。只输出整理后的 Markdown。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "format-table".to_string(),
            name: "整理成表格".to_string(),
            category: "格式".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个擅长结构化信息的中文编辑助手。".to_string(),
            user_prompt: "请把下面内容整理成 Markdown 表格。根据原文选择合适的列；缺失信息留空或标注“未提及”。只输出表格。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "format-key-info".to_string(),
            name: "提取关键信息".to_string(),
            category: "格式".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个准确的信息抽取助手。".to_string(),
            user_prompt: "请从下面内容中提取关键信息，按字段和值整理。优先提取人物、时间、地点、链接、账号、参数、结论和待办；没有的信息不要编造。\n\n{{text}}".to_string(),
            output_mode: default_ai_action_output_mode(),
        },
        AiTextAction {
            id: "format-cleanup".to_string(),
            name: "清理格式".to_string(),
            category: "格式".to_string(),
            builtin: true,
            favorite: false,
            enabled: true,
            system_prompt: "你是一个细致的文本格式整理助手。".to_string(),
            user_prompt: "请清理下面文本的格式问题，包括多余空行、重复空格、混乱编号和不一致的列表缩进。保持原意和内容不变，只输出清理后的文本。\n\n{{text}}".to_string(),
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
pub struct SendSettings {
    #[serde(default)]
    pub copy_after_send: bool,
}

impl Default for SendSettings {
    fn default() -> Self {
        Self {
            copy_after_send: false,
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
    #[serde(default = "default_settings_snapshot_retain_count")]
    pub settings_snapshot_retain_count: u32,
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
            settings_snapshot_retain_count: default_settings_snapshot_retain_count(),
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
pub struct SpeechToTextSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_speech_to_text_provider_kind")]
    pub provider_kind: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_speech_to_text_resource_id")]
    pub resource_id: String,
    #[serde(default = "default_speech_to_text_endpoint")]
    pub endpoint: String,
    #[serde(default = "default_speech_to_text_shortcut_enabled")]
    pub shortcut_enabled: bool,
    #[serde(default = "default_speech_to_text_shortcut")]
    pub shortcut: String,
    #[serde(default = "default_speech_to_text_max_duration_secs")]
    pub max_duration_secs: u64,
    #[serde(default = "default_speech_to_text_microphone_device_id")]
    pub microphone_device_id: String,
}

impl Default for SpeechToTextSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            provider_kind: default_speech_to_text_provider_kind(),
            api_key: String::new(),
            resource_id: default_speech_to_text_resource_id(),
            endpoint: default_speech_to_text_endpoint(),
            shortcut_enabled: default_speech_to_text_shortcut_enabled(),
            shortcut: default_speech_to_text_shortcut(),
            max_duration_secs: default_speech_to_text_max_duration_secs(),
            microphone_device_id: default_speech_to_text_microphone_device_id(),
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
    pub send: SendSettings,
    #[serde(default)]
    pub telegram: TelegramBridgeSettings,
    #[serde(default)]
    pub backup: BackupSettings,
    #[serde(default)]
    pub ai: AiSettings,
    #[serde(default)]
    pub speech_to_text: SpeechToTextSettings,
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
