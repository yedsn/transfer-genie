use crate::types::{Settings, StorageProfile, StorageProviderKind, WebDavEndpoint};

#[derive(Clone)]
pub enum ProviderConfig {
    Webdav(WebDavEndpoint),
    Supabase(StorageProfile),
}

impl ProviderConfig {
    pub fn profile_id(&self) -> &str {
        match self {
            Self::Webdav(endpoint) => &endpoint.id,
            Self::Supabase(profile) => &profile.id,
        }
    }

    pub fn profile_name(&self) -> &str {
        match self {
            Self::Webdav(endpoint) => &endpoint.name,
            Self::Supabase(profile) => &profile.name,
        }
    }

    pub fn provider_kind(&self) -> &'static str {
        match self {
            Self::Webdav(_) => "webdav",
            Self::Supabase(_) => "supabase",
        }
    }
}

pub fn resolve_active_provider(settings: &Settings) -> Result<ProviderConfig, String> {
    let active_id = settings
        .active_storage_profile_id
        .as_deref()
        .or(settings.active_webdav_id.as_deref())
        .unwrap_or("")
        .trim();
    if active_id.is_empty() {
        return Err("请先选择存储空间".to_string());
    }
    let provider = resolve_provider_by_id(settings, active_id)?;
    require_bound_provider(&provider)?;
    Ok(provider)
}

pub fn require_bound_provider(provider: &ProviderConfig) -> Result<(), String> {
    if let ProviderConfig::Supabase(profile) = provider {
        profile
            .supabase
            .as_ref()
            .ok_or_else(|| "Supabase 存储空间配置不完整".to_string())?
            .require_bound()?;
    }
    Ok(())
}

pub fn resolve_provider_by_id(
    settings: &Settings,
    profile_id: &str,
) -> Result<ProviderConfig, String> {
    let profile_id = profile_id.trim();
    if profile_id.is_empty() {
        return Err("记录缺少存储空间".to_string());
    }
    if let Some(profile) = settings
        .storage_profiles
        .iter()
        .find(|profile| profile.id == profile_id)
    {
        if !profile.enabled {
            return Err(format!("存储空间已禁用: {profile_id}"));
        }
        return match profile.provider_kind {
            StorageProviderKind::Webdav => profile
                .to_webdav()
                .ok_or_else(|| format!("WebDAV 存储空间配置不完整: {profile_id}"))
                .and_then(validate_webdav)
                .map(ProviderConfig::Webdav),
            StorageProviderKind::Supabase => {
                let config = profile
                    .supabase
                    .as_ref()
                    .ok_or_else(|| format!("Supabase 存储空间配置不完整: {profile_id}"))?;
                if config.api_url.trim().is_empty() || config.anon_key.trim().is_empty() {
                    return Err(format!("Supabase 存储空间配置不完整: {profile_id}"));
                }
                Ok(ProviderConfig::Supabase(profile.clone()))
            }
        };
    }
    settings
        .webdav_endpoints
        .iter()
        .find(|endpoint| endpoint.id == profile_id)
        .cloned()
        .ok_or_else(|| format!("存储空间不存在: {profile_id}"))
        .and_then(validate_webdav)
        .map(ProviderConfig::Webdav)
}

pub fn resolve_active_webdav(settings: &Settings) -> Result<WebDavEndpoint, String> {
    match resolve_active_provider(settings)? {
        ProviderConfig::Webdav(endpoint) => Ok(endpoint),
        ProviderConfig::Supabase(_) => Err("当前存储空间不是 WebDAV".to_string()),
    }
}

pub fn resolve_webdav_by_id(
    settings: &Settings,
    profile_id: &str,
) -> Result<WebDavEndpoint, String> {
    match resolve_provider_by_id(settings, profile_id)? {
        ProviderConfig::Webdav(endpoint) => Ok(endpoint),
        ProviderConfig::Supabase(_) => Err(format!("存储空间不是 WebDAV: {}", profile_id.trim())),
    }
}

fn validate_webdav(endpoint: WebDavEndpoint) -> Result<WebDavEndpoint, String> {
    if !endpoint.enabled {
        return Err(format!("WebDAV 存储空间已禁用: {}", endpoint.id));
    }
    if endpoint.url.trim().is_empty() {
        return Err(format!("WebDAV 存储空间地址为空: {}", endpoint.id));
    }
    Ok(endpoint)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{StorageProviderKind, SupabaseStorageConfig};

    #[test]
    fn rejects_webdav_operation_for_active_supabase_profile() {
        let settings = Settings {
            storage_profiles: vec![StorageProfile {
                id: "cloud".into(),
                name: "Cloud".into(),
                provider_kind: StorageProviderKind::Supabase,
                enabled: true,
                webdav: None,
                supabase: Some(SupabaseStorageConfig {
                    api_url: "https://example.com".into(),
                    anon_key: "public".into(),
                    space_id: "00000000-0000-4000-8000-000000000001".into(),
                    binding_state: Default::default(),
                }),
            }],
            active_storage_profile_id: Some("cloud".into()),
            webdav_endpoints: Vec::new(),
            active_webdav_id: None,
            sender_name: String::new(),
            refresh_interval_secs: 5,
            download_dir: String::new(),
            save_filename_rule: crate::types::default_save_filename_rule(),
            send_hotkey: String::new(),
            shortcuts_enabled: true,
            global_hotkey_enabled: true,
            global_hotkey: String::new(),
            auto_start: false,
            auto_update_enabled: false,
            local_http_api: Default::default(),
            send: Default::default(),
            telegram: Default::default(),
            backup: Default::default(),
            ai: Default::default(),
            speech_to_text: Default::default(),
        };
        assert_eq!(
            resolve_active_webdav(&settings).unwrap_err(),
            "当前存储空间不是 WebDAV"
        );
        assert_eq!(
            resolve_active_provider(&settings).unwrap().profile_id(),
            "cloud"
        );
    }
}
