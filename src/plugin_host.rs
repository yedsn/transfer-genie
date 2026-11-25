use crate::plugin_protocol::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
// Hold across each registry mutation so simultaneous settings/install commands
// cannot overwrite one another's read-modify-write transaction.
static REGISTRY_WRITE: Mutex<()> = Mutex::new(());

const MAX_PACKAGE: u64 = 256 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
pub struct InstalledPlugin {
    pub manifest: PluginManifest,
    pub source_kind: String,
    pub origin: String,
    pub enabled: bool,
    pub instance_id: String,
    pub root: String,
    #[serde(default)]
    pub config: Value,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub source_url: Option<String>,
    #[serde(default)]
    pub log_path: String,
}
#[derive(Default, Serialize, Deserialize)]
struct Registry {
    #[serde(default)]
    plugins: BTreeMap<String, InstalledPlugin>,
    #[serde(default)]
    device_id: String,
    #[serde(default)]
    market_url: String,
    #[serde(default)]
    allowed_spaces: BTreeMap<String, Vec<String>>,
    #[serde(default)]
    retained_plugins: BTreeMap<String, InstalledPlugin>,
}
pub fn space_allowed(root: &Path, id: &str, scope: &str) -> Result<bool, String> {
    Ok(read_registry(root)?
        .allowed_spaces
        .get(id)
        .is_some_and(|spaces| spaces.iter().any(|space| space == scope)))
}
pub fn set_space_allowed(root: &Path, id: &str, scope: &str, allowed: bool) -> Result<(), String> {
    let _guard = REGISTRY_WRITE.lock().map_err(|e| e.to_string())?;
    let mut registry = read_registry(root)?;
    if !registry.plugins.contains_key(id) {
        return Err("插件不存在".into());
    }
    let spaces = registry.allowed_spaces.entry(id.into()).or_default();
    spaces.retain(|space| space != scope);
    if allowed {
        spaces.push(scope.into());
    }
    write_registry(root, &registry)
}
pub fn root(state: &crate::AppState) -> PathBuf {
    state
        .settings_path
        .parent()
        .unwrap()
        .join("workspace/plugins")
}
fn registry_path(root: &Path) -> PathBuf {
    root.join("registry.json")
}
fn read_registry(root: &Path) -> Result<Registry, String> {
    let path = registry_path(root);
    if !path.exists() {
        return Ok(Registry::default());
    }
    serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("插件注册表无效: {e}"))
}
fn write_registry(root: &Path, registry: &Registry) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    crate::workspace::write_json_with_audit_at(
        &registry_path(root),
        registry,
        root.parent(),
        "plugins",
        "registry",
    )
}
pub fn initialize(root: &Path, download_dir: &Path) -> Result<(), String> {
    let _guard = REGISTRY_WRITE.lock().map_err(|e| e.to_string())?;
    let mut registry = read_registry(root)?;
    if registry.device_id.is_empty() {
        registry.device_id = uuid::Uuid::new_v4().to_string();
    }
    let manifest: PluginManifest = serde_json::from_str(include_str!(
        "../plugins/.system/image-downloader/plugin.json"
    ))
    .map_err(|e| e.to_string())?;
    let entry = registry
        .plugins
        .entry(IMAGE_PLUGIN_ID.into())
        .or_insert_with(|| InstalledPlugin {
            manifest: manifest.clone(),
            source_kind: "builtin".into(),
            origin: "bundled".into(),
            enabled: false,
            instance_id: uuid::Uuid::new_v4().to_string(),
            root: String::new(),
            config: json!({"name":"图片下载","download_dir":download_dir.to_string_lossy()}),
            error: None,
            source_url: None,
            log_path: root
                .join(IMAGE_PLUGIN_ID)
                .join("plugin.log")
                .to_string_lossy()
                .into(),
        });
    entry.manifest = manifest;
    entry.source_kind = "builtin".into();
    for field in &entry.manifest.config_schema {
        if entry.config.get(&field.key).is_none() && !field.default.is_null() {
            entry.config[&field.key] = field.default.clone();
        }
    }
    entry.log_path = root
        .join(IMAGE_PLUGIN_ID)
        .join("plugin.log")
        .to_string_lossy()
        .into();
    write_registry(root, &registry)
}
pub fn device_id(root: &Path) -> Result<String, String> {
    Ok(read_registry(root)?.device_id)
}
pub fn set_builtin_resource(root: &Path, directory: &Path) -> Result<(), String> {
    let _guard = REGISTRY_WRITE.lock().map_err(|e| e.to_string())?;
    let mut registry = read_registry(root)?;
    let plugin = registry
        .plugins
        .get_mut(IMAGE_PLUGIN_ID)
        .ok_or("内置插件未注册")?;
    plugin.root = directory.to_string_lossy().into();
    write_registry(root, &registry)
}
pub fn list(root: &Path) -> Result<Vec<InstalledPlugin>, String> {
    let mut plugins: Vec<_> = read_registry(root)?.plugins.into_values().collect();
    for plugin in &mut plugins {
        plugin.error = command(plugin).err();
    }
    Ok(plugins)
}
pub fn get(root: &Path, id: &str) -> Result<InstalledPlugin, String> {
    read_registry(root)?
        .plugins
        .remove(id)
        .ok_or("插件不存在".into())
}
fn secret_entry(plugin: &InstalledPlugin, key: &str) -> Result<keyring::Entry, String> {
    if !plugin
        .manifest
        .config_schema
        .iter()
        .any(|field| field.key == key && field.kind == "secret")
    {
        return Err("插件未声明此凭据字段".into());
    }
    keyring::Entry::new(
        "transfer-genie-plugins",
        &format!("{}:{key}", plugin.instance_id),
    )
    .map_err(|_| "无法打开插件系统凭据".into())
}
pub fn set_secret(root: &Path, id: &str, key: &str, value: &str) -> Result<(), String> {
    let plugin = get(root, id)?;
    let entry = secret_entry(&plugin, key)?;
    if value.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("删除插件凭据失败".into()),
        }
    } else {
        entry
            .set_password(value)
            .map_err(|_| "保存插件凭据失败".into())
    }
}
pub fn secrets(plugin: &InstalledPlugin) -> Result<BTreeMap<String, String>, String> {
    let mut values = BTreeMap::new();
    for field in &plugin.manifest.config_schema {
        if field.kind != "secret" {
            continue;
        }
        match secret_entry(plugin, &field.key)?.get_password() {
            Ok(value) => {
                values.insert(field.key.clone(), value);
            }
            Err(keyring::Error::NoEntry) if !field.required => {}
            Err(keyring::Error::NoEntry) => return Err(format!("请设置{}", field.label)),
            Err(_) => return Err("读取插件凭据失败".into()),
        }
    }
    Ok(values)
}
pub fn redact(text: &str, secrets: &BTreeMap<String, String>) -> String {
    let mut redacted = text.to_string();
    let mut values = secrets
        .values()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    values.sort_by_key(|value| std::cmp::Reverse(value.len()));
    for value in values {
        redacted = redacted.replace(value, "[REDACTED]");
    }
    redacted
}
pub fn redact_payload(value: &mut Value, secrets: &BTreeMap<String, String>) {
    match value {
        Value::String(text) => *text = redact(text, secrets),
        Value::Array(items) => {
            for item in items {
                redact_payload(item, secrets);
            }
        }
        Value::Object(fields) => {
            for item in fields.values_mut() {
                redact_payload(item, secrets);
            }
        }
        _ => {}
    }
}
pub fn configure(root: &Path, id: &str, enabled: bool, config: Value) -> Result<(), String> {
    let _guard = REGISTRY_WRITE.lock().map_err(|e| e.to_string())?;
    let mut registry = read_registry(root)?;
    let plugin = registry.plugins.get_mut(id).ok_or("插件不存在")?;
    validate_config(&plugin.manifest, &config)?;
    if enabled {
        command(plugin)?;
        secrets(plugin)?;
    }
    plugin.enabled = enabled;
    plugin.config = config;
    write_registry(root, &registry)
}
pub fn set_auto_start(root: &Path, id: &str, enabled: bool) -> Result<(), String> {
    let _guard = REGISTRY_WRITE.lock().map_err(|e| e.to_string())?;
    let mut registry = read_registry(root)?;
    let plugin = registry.plugins.get_mut(id).ok_or("插件不存在")?;
    if plugin.manifest.runtime.mode != "service" {
        return Err("一次性插件无需自动启动".into());
    }
    plugin.manifest.runtime.auto_start = enabled;
    write_registry(root, &registry)
}
pub fn rollback(root: &Path, id: &str, version: &str) -> Result<InstalledPlugin, String> {
    let _guard = REGISTRY_WRITE.lock().map_err(|e| e.to_string())?;
    let mut registry = read_registry(root)?;
    let existing = registry.plugins.get(id).ok_or("插件不存在")?;
    if existing.source_kind == "builtin" || !valid_component(version) {
        return Err("不允许回滚该版本".into());
    }
    let directory = root.join(id).join("versions").join(version);
    let manifest: PluginManifest = serde_json::from_slice(
        &fs::read(directory.join("plugin.json")).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    validate_manifest(&manifest)?;
    if manifest.id != id || manifest.version != version {
        return Err("版本身份不符".into());
    }
    validate_config(&manifest, &existing.config)?;
    let mut plugin = existing.clone();
    plugin.manifest = manifest;
    plugin.root = directory.to_string_lossy().into();
    plugin.enabled = false;
    command(&plugin)?;
    #[cfg(desktop)]
    crate::plugin_process::stop(id)?;
    registry.plugins.insert(id.into(), plugin.clone());
    write_registry(root, &registry)?;
    Ok(plugin)
}
pub fn uninstall(root: &Path, id: &str, keep_data: bool) -> Result<(), String> {
    let _guard = REGISTRY_WRITE.lock().map_err(|e| e.to_string())?;
    let mut registry = read_registry(root)?;
    let plugin = registry.plugins.get(id).cloned().ok_or("插件不存在")?;
    if plugin.source_kind == "builtin" {
        return Err("内置插件不能卸载".into());
    }
    if !valid_component(id) {
        return Err("无效插件 id".into());
    }
    let versions = root.join(id).join("versions");
    if versions.exists() {
        fs::remove_dir_all(&versions).map_err(|e| e.to_string())?;
    }
    if !keep_data {
        let data = root.join(id).join("data");
        if data.exists() {
            fs::remove_dir_all(data).map_err(|e| e.to_string())?;
        }
        let log = root.join(id).join("plugin.log");
        if log.exists() {
            fs::remove_file(log).map_err(|e| e.to_string())?;
        }
        for field in &plugin.manifest.config_schema {
            if field.kind == "secret" {
                match secret_entry(&plugin, &field.key)?.delete_credential() {
                    Ok(()) | Err(keyring::Error::NoEntry) => {}
                    Err(_) => return Err("删除插件凭据失败".into()),
                }
            }
        }
    }
    registry.plugins.remove(id);
    if keep_data {
        let mut retained = plugin.clone();
        retained.enabled = false;
        registry.retained_plugins.insert(id.into(), retained);
    } else {
        registry.allowed_spaces.remove(id);
        registry.retained_plugins.remove(id);
    }
    write_registry(root, &registry)
}
pub fn safe_relative(value: &str) -> Result<PathBuf, String> {
    if value.contains('\\') || value.contains(':') || value.is_empty() {
        return Err("插件文件路径无效".into());
    }
    let path = PathBuf::from(value);
    if path
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("插件文件路径越界".into());
    }
    Ok(path)
}
fn copy_directory(source: &Path, target: &Path, total: &mut u64) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
        if meta.file_type().is_symlink() {
            return Err("插件不允许符号链接".into());
        }
        if meta.is_dir() {
            copy_directory(&entry.path(), &target.join(entry.file_name()), total)?;
        } else if meta.is_file() {
            *total += meta.len();
            if *total > MAX_PACKAGE {
                return Err("插件包超限".into());
            }
            fs::copy(entry.path(), target.join(entry.file_name())).map_err(|e| e.to_string())?;
        } else {
            return Err("不支持的插件文件".into());
        }
    }
    Ok(())
}
pub fn install(
    root: &Path,
    source: &Path,
    origin: &str,
    source_url: Option<String>,
) -> Result<InstalledPlugin, String> {
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let stage = root.join(format!(".install-{}", uuid::Uuid::new_v4()));
    let result = (|| {
        fs::create_dir(&stage).map_err(|e| e.to_string())?;
        if source.is_dir() {
            copy_directory(source, &stage, &mut 0)?;
        } else {
            if fs::metadata(source).map_err(|e| e.to_string())?.len() > MAX_PACKAGE {
                return Err("插件包超限".into());
            }
            let mut archive =
                zip::ZipArchive::new(fs::File::open(source).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            if archive.len() > 10000 {
                return Err("插件文件数量超限".into());
            }
            let mut total = 0;
            for i in 0..archive.len() {
                let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
                let relative = safe_relative(file.name().trim_end_matches('/'))?;
                if file
                    .unix_mode()
                    .map(|m| m & 0o170000 == 0o120000)
                    .unwrap_or(false)
                {
                    return Err("插件不允许符号链接".into());
                }
                total += file.size();
                if total > MAX_PACKAGE {
                    return Err("解压后插件包超限".into());
                }
                let path = stage.join(relative);
                if file.is_dir() {
                    fs::create_dir_all(path).map_err(|e| e.to_string())?;
                } else {
                    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
                    let mut output = fs::OpenOptions::new()
                        .create_new(true)
                        .write(true)
                        .open(&path)
                        .map_err(|e| e.to_string())?;
                    let copied =
                        std::io::copy(&mut file.by_ref().take(MAX_PACKAGE + 1), &mut output)
                            .map_err(|e| e.to_string())?;
                    if copied > MAX_PACKAGE {
                        return Err("插件文件超限".into());
                    }
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        if let Some(mode) = file.unix_mode() {
                            fs::set_permissions(path, fs::Permissions::from_mode(mode & 0o755))
                                .map_err(|e| e.to_string())?;
                        }
                    }
                }
            }
        }
        let manifest: PluginManifest = serde_json::from_slice(
            &fs::read(stage.join("plugin.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| format!("plugin.json 无效: {e}"))?;
        validate_manifest(&manifest)?;
        if [IMAGE_PLUGIN_ID, "webdav-sync", "telegram-bridge"].contains(&manifest.id.as_str()) {
            return Err("不能覆盖内置插件".into());
        }
        let _guard = REGISTRY_WRITE.lock().map_err(|e| e.to_string())?;
        let mut registry = read_registry(root)?;
        let existing = registry
            .plugins
            .get(&manifest.id)
            .or_else(|| registry.retained_plugins.get(&manifest.id))
            .cloned();
        let target = root
            .join(&manifest.id)
            .join("versions")
            .join(&manifest.version);
        if target.exists() {
            return Err("该版本已安装".into());
        }
        let mut config = json!({});
        for field in &manifest.config_schema {
            if field.kind != "secret" {
                config[&field.key] = field.default.clone();
            }
        }
        let mut plugin = InstalledPlugin {
            manifest: manifest.clone(),
            source_kind: "external".into(),
            origin: origin.into(),
            enabled: false,
            instance_id: existing
                .as_ref()
                .map(|p| p.instance_id.clone())
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            root: stage.to_string_lossy().into(),
            config: existing
                .as_ref()
                .map(|p| p.config.clone())
                .unwrap_or(config),
            error: None,
            source_url,
            log_path: root
                .join(&manifest.id)
                .join("plugin.log")
                .to_string_lossy()
                .into(),
        };
        // Missing interpreters remain a visible, unready installation; invalid entries do not.
        let entry = safe_relative(&manifest.runtime.command)?;
        if !stage.join(entry).is_file() {
            return Err("插件入口文件不存在".into());
        }
        plugin.error = command(&plugin).err();
        #[cfg(desktop)]
        if existing.is_some() {
            crate::plugin_process::stop(&manifest.id)?;
        }
        fs::create_dir_all(target.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::rename(&stage, &target).map_err(|e| e.to_string())?;
        plugin.root = target.to_string_lossy().into();
        registry.retained_plugins.remove(&manifest.id);
        registry.plugins.insert(manifest.id, plugin.clone());
        if let Err(error) = write_registry(root, &registry) {
            let _ = fs::remove_dir_all(&target);
            return Err(error);
        }
        Ok(plugin)
    })();
    if stage.exists() {
        let _ = fs::remove_dir_all(&stage);
    }
    result
}
pub fn command(plugin: &InstalledPlugin) -> Result<(PathBuf, Vec<String>), String> {
    if plugin.source_kind == "builtin" && plugin.manifest.id == IMAGE_PLUGIN_ID {
        if !plugin.root.is_empty() {
            let executable = Path::new(&plugin.root).join(if cfg!(windows) {
                "transfer-genie-image-bot.exe"
            } else {
                "transfer-genie-image-bot"
            });
            if executable.is_file() {
                return Ok((executable, vec![]));
            }
        }
        #[cfg(not(debug_assertions))]
        return Err("内置图片程序资源缺失，请重新安装应用".into());
        #[cfg(debug_assertions)]
        return Ok((
            std::env::current_exe().map_err(|e| e.to_string())?,
            vec!["--image-bot".into()],
        ));
    }
    let root = fs::canonicalize(&plugin.root).map_err(|e| e.to_string())?;
    let entry = fs::canonicalize(root.join(safe_relative(&plugin.manifest.runtime.command)?))
        .map_err(|_| "插件入口不存在")?;
    if !entry.starts_with(&root) || !entry.is_file() {
        return Err("插件入口越界".into());
    }
    let mut args = plugin.manifest.runtime.args.clone();
    if let Some(interpreter) = &plugin.manifest.runtime.interpreter {
        if !valid_component(interpreter) {
            return Err("无效解释器名称".into());
        }
        let executable = std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
            .find_map(|dir| {
                let path = dir.join(interpreter);
                if path.is_file() {
                    return Some(path);
                }
                let path = dir.join(format!("{interpreter}.exe"));
                path.is_file().then_some(path)
            })
            .ok_or_else(|| format!("缺少解释器: {interpreter}"))?;
        args.insert(0, entry.to_string_lossy().into());
        Ok((executable, args))
    } else {
        Ok((entry, args))
    }
}
pub fn instances(root: &Path, name: &str) -> Result<Vec<BotInstance>, String> {
    let id = device_id(root)?;
    let now = crate::now_ms();
    Ok(list(root)?
        .into_iter()
        .filter(|p| p.manifest.capabilities.iter().any(|c| c.kind == "bot"))
        .map(|p| BotInstance {
            protocol_version: PROTOCOL_VERSION,
            instance_id: p.instance_id,
            plugin_id: p.manifest.id,
            name: p.config["name"].as_str().unwrap_or(&p.manifest.name).into(),
            device_id: id.clone(),
            device_name: name.into(),
            platform: std::env::consts::OS.into(),
            enabled: p.enabled && p.error.is_none(),
            heartbeat_ms: now,
            expires_at_ms: now + 90000,
            capabilities: p.manifest.capabilities,
        })
        .collect())
}

#[derive(Clone, Serialize, Deserialize)]
pub struct MarketArtifact {
    pub platform: String,
    pub arch: String,
    pub url: String,
    pub sha256: String,
    pub size: u64,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct MarketPlugin {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    pub host_api_version: u32,
    #[serde(default)]
    pub min_app_version: Option<String>,
    #[serde(default)]
    pub versions_url: Option<String>,
    #[serde(default)]
    pub artifacts: Vec<MarketArtifact>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct MarketIndex {
    pub schema_version: u32,
    pub plugins: Vec<MarketPlugin>,
    #[serde(default)]
    pub from_cache: bool,
    #[serde(default)]
    pub refresh_error: Option<String>,
}
#[derive(Deserialize)]
struct MarketVersions {
    schema_version: u32,
    plugin_id: String,
    versions: Vec<MarketVersion>,
}
#[derive(Deserialize)]
struct MarketVersion {
    version: String,
    artifacts: Vec<MarketArtifact>,
}
pub fn market_compatibility(plugin: &MarketPlugin) -> Result<(), String> {
    if plugin.host_api_version != PROTOCOL_VERSION {
        return Err("插件接口版本不兼容".into());
    }
    if let Some(minimum) = &plugin.min_app_version {
        let minimum = semver::Version::parse(minimum).map_err(|_| "最低宿主版本格式无效")?;
        let current =
            semver::Version::parse(env!("CARGO_PKG_VERSION")).map_err(|e| e.to_string())?;
        if current < minimum {
            return Err(format!("需要 TransferGenie {minimum} 或更新版本"));
        }
    }
    Ok(())
}
async fn fetch_market_json(client: &reqwest::Client, address: &str) -> Result<Vec<u8>, String> {
    use futures_util::StreamExt;
    let url = url::Url::parse(address).map_err(|e| e.to_string())?;
    if !["http", "https"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("市场地址无效".into());
    }
    let response = client
        .get(url)
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    if response.content_length().unwrap_or(0) > 4 * 1024 * 1024 {
        return Err("市场索引超限".into());
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        if bytes.len().saturating_add(chunk.len()) > 4 * 1024 * 1024 {
            return Err("市场索引超限".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
pub fn market_url(root: &Path) -> Result<String, String> {
    Ok(read_registry(root)?.market_url)
}
pub fn set_market_url(root: &Path, url: String) -> Result<(), String> {
    let _guard = REGISTRY_WRITE.lock().map_err(|e| e.to_string())?;
    if !url.trim().is_empty() {
        let u = url::Url::parse(&url).map_err(|e| e.to_string())?;
        if !["http", "https"].contains(&u.scheme()) {
            return Err("市场地址须为 HTTP(S)".into());
        }
    }
    let mut r = read_registry(root)?;
    if r.market_url != url {
        let cache = root.join("market-cache.json");
        match fs::remove_file(cache) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("清除旧市场缓存失败: {error}")),
        }
    }
    r.market_url = url;
    write_registry(root, &r)
}
pub async fn market_fetch(root: &Path, client: &reqwest::Client) -> Result<MarketIndex, String> {
    let url = market_url(root)?;
    if url.is_empty() {
        return Err("请先配置插件市场索引地址".into());
    }
    let fetched: Result<MarketIndex, String> = async {
        let bytes = fetch_market_json(client, &url).await?;
        let mut index: MarketIndex = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if index.schema_version != 1 {
            return Err("市场索引版本不兼容".into());
        }
        for plugin in &mut index.plugins {
            if let Some(address) = &plugin.versions_url {
                let versions: MarketVersions =
                    serde_json::from_slice(&fetch_market_json(client, address).await?)
                        .map_err(|e| e.to_string())?;
                if versions.schema_version != 1 || versions.plugin_id != plugin.id {
                    return Err("市场版本清单身份或版本不符".into());
                }
                plugin.artifacts = versions
                    .versions
                    .into_iter()
                    .find(|version| version.version == plugin.version)
                    .ok_or("市场版本清单缺少目标版本")?
                    .artifacts;
            }
        }
        index.from_cache = false;
        index.refresh_error = None;
        let _guard = REGISTRY_WRITE.lock().map_err(|e| e.to_string())?;
        if market_url(root)? != url {
            return Err("市场来源已更改，请重新刷新".into());
        }
        fs::write(
            root.join("market-cache.json"),
            serde_json::to_vec(&index).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        Ok(index)
    }
    .await;
    fetched.or_else(|error| {
        if market_url(root).ok().as_deref() != Some(url.as_str()) {
            return Err(error);
        }
        fs::read(root.join("market-cache.json"))
            .ok()
            .and_then(|b| serde_json::from_slice::<MarketIndex>(&b).ok())
            .filter(|index| index.schema_version == 1)
            .map(|mut index| {
                index.from_cache = true;
                index.refresh_error = Some(error.clone());
                index
            })
            .ok_or(error)
    })
}
pub async fn market_install(
    root: &Path,
    client: &reqwest::Client,
    id: &str,
    app: &tauri::AppHandle,
) -> Result<InstalledPlugin, String> {
    use tauri::Emitter;
    market_install_with_progress(root, client, id, |bytes, total| {
        let _ = app.emit(
            "plugin-download-progress",
            json!({"id":id,"bytes":bytes,"total":total}),
        );
    })
    .await
}
async fn market_install_with_progress(
    root: &Path,
    client: &reqwest::Client,
    id: &str,
    mut progress: impl FnMut(u64, u64),
) -> Result<InstalledPlugin, String> {
    use futures_util::StreamExt;
    let index = market_fetch(root, client).await?;
    let plugin = index
        .plugins
        .iter()
        .find(|p| p.id == id)
        .ok_or("市场没有该插件")?;
    market_compatibility(plugin)?;
    let artifact = plugin
        .artifacts
        .iter()
        .find(|a| a.platform == std::env::consts::OS && a.arch == std::env::consts::ARCH)
        .ok_or("没有适合本机系统与架构的插件包")?;
    if artifact.size > MAX_PACKAGE || artifact.sha256.len() != 64 {
        return Err("市场包元数据无效".into());
    }
    let parsed = url::Url::parse(&artifact.url).map_err(|e| e.to_string())?;
    if !["http", "https"].contains(&parsed.scheme()) {
        return Err("包地址无效".into());
    }
    let temp = root.join(format!(".download-{}.zip", uuid::Uuid::new_v4()));
    let result = async {
        let response = client
            .get(parsed)
            .timeout(std::time::Duration::from_secs(600))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;
        let mut stream = response.bytes_stream();
        let mut size = 0;
        let mut digest = Sha256::new();
        let mut file = fs::File::create(&temp).map_err(|e| e.to_string())?;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            size += chunk.len() as u64;
            if size > MAX_PACKAGE {
                return Err("下载插件包超限".into());
            }
            digest.update(&chunk);
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            progress(size, artifact.size);
        }
        if size != artifact.size
            || format!("{:x}", digest.finalize()) != artifact.sha256.to_lowercase()
        {
            return Err("插件包大小或 SHA-256 校验失败".into());
        }
        // Check index identity before mutating installation registry.
        let mut archive = zip::ZipArchive::new(fs::File::open(&temp).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        let mut text = String::new();
        archive
            .by_name("plugin.json")
            .map_err(|e| e.to_string())?
            .take(1024 * 1024)
            .read_to_string(&mut text)
            .map_err(|e| e.to_string())?;
        let manifest: PluginManifest = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        if manifest.id != plugin.id || manifest.version != plugin.version {
            return Err("插件包与市场索引不一致".into());
        }
        install(root, &temp, "marketplace", Some(artifact.url.clone()))
    }
    .await;
    let _ = fs::remove_file(temp);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn market_rejects_newer_host_requirements_and_bad_version_metadata() {
        let mut plugin: MarketPlugin = serde_json::from_value(json!({"id":"test","name":"test","version":"1.0.0","host_api_version":1,"min_app_version":"999.0.0"})).unwrap();
        assert!(market_compatibility(&plugin)
            .unwrap_err()
            .contains("999.0.0"));
        plugin.min_app_version = Some("invalid".into());
        assert!(market_compatibility(&plugin).is_err());
        plugin.min_app_version = Some("0.1.0".into());
        assert!(market_compatibility(&plugin).is_ok());
        plugin.host_api_version = 99;
        assert!(market_compatibility(&plugin).is_err());
    }
    #[test]
    fn credentials_use_system_store_and_are_redacted_from_nested_results() {
        let _guard = crate::credential_store::credential_test_guard();
        let root =
            std::env::temp_dir().join(format!("plugin-secret-test-{}", uuid::Uuid::new_v4()));
        initialize(&root, &root.join("downloads")).unwrap();
        let mut registry = read_registry(&root).unwrap();
        let plugin = registry.plugins.get_mut(IMAGE_PLUGIN_ID).unwrap();
        plugin.manifest.config_schema.push(ConfigField {
            key: "token".into(),
            label: "Token".into(),
            kind: "secret".into(),
            required: true,
            default: Value::Null,
        });
        let plugin = plugin.clone();
        write_registry(&root, &registry).unwrap();
        assert!(secrets(&plugin).is_err());
        let secret = "private-plugin-token";
        set_secret(&root, IMAGE_PLUGIN_ID, "token", secret).unwrap();
        let stored = secrets(&plugin).unwrap();
        assert_eq!(stored["token"], secret);
        assert!(!String::from_utf8(fs::read(registry_path(&root)).unwrap())
            .unwrap()
            .contains(secret));
        let mut payload = json!({"items":[{"error":format!("rejected {secret}")}], "number":1});
        redact_payload(&mut payload, &stored);
        assert_eq!(payload["items"][0]["error"], "rejected [REDACTED]");
        assert_eq!(payload["number"], 1);
        assert!(set_secret(&root, IMAGE_PLUGIN_ID, "undeclared", secret).is_err());
        set_secret(&root, IMAGE_PLUGIN_ID, "token", "").unwrap();
        assert!(secrets(&plugin).is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[tokio::test]
    async fn market_installs_verified_zip_and_rejects_hash_mismatch_without_replacing_plugin() {
        let root = std::env::temp_dir().join(format!("market-install-{}", uuid::Uuid::new_v4()));
        initialize(&root, &root.join("downloads")).unwrap();
        let cursor = std::io::Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(cursor);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("plugin.json", options).unwrap();
        zip.write_all(include_bytes!(
            "../tests/fixtures/plugins/echo-bot/plugin.json"
        ))
        .unwrap();
        zip.start_file("main.cjs", options).unwrap();
        zip.write_all(include_bytes!(
            "../tests/fixtures/plugins/echo-bot/main.cjs"
        ))
        .unwrap();
        let package = zip.finish().unwrap().into_inner();
        let digest = format!("{:x}", Sha256::digest(&package));
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            for attempt in 0..6 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0u8; 4096];
                stream.read(&mut request).unwrap();
                let body = if attempt % 3 == 0 {
                    json!({"schema_version":1,"plugins":[{"id":"echo-bot-example","name":"test","description":"test","version":"1.0.0","host_api_version":1,"min_app_version":"0.5.19","versions_url":format!("http://{address}/versions.json")}]}).to_string().into_bytes()
                } else if attempt % 3 == 1 {
                    json!({"schema_version":1,"plugin_id":"echo-bot-example","versions":[{"version":"1.0.0","artifacts":[{"platform":std::env::consts::OS,"arch":std::env::consts::ARCH,"url":format!("http://{address}/plugin.zip"),"size":package.len(),"sha256":if attempt == 1 {digest.clone()} else {"0".repeat(64)}}]}]}).to_string().into_bytes()
                } else {
                    package.clone()
                };
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                )
                .unwrap();
                stream.write_all(&body).unwrap();
            }
        });
        set_market_url(&root, format!("http://{address}/index.json")).unwrap();
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let mut downloaded = 0;
        let plugin =
            market_install_with_progress(&root, &client, "echo-bot-example", |bytes, _| {
                downloaded = bytes
            })
            .await
            .unwrap();
        assert!(downloaded > 0);
        assert_eq!(plugin.origin, "marketplace");
        assert!(!plugin.enabled);
        let error = market_install_with_progress(&root, &client, "echo-bot-example", |_, _| {})
            .await
            .err()
            .unwrap();
        assert!(error.contains("SHA-256"));
        assert_eq!(
            get(&root, "echo-bot-example").unwrap().instance_id,
            plugin.instance_id
        );
        assert!(!fs::read_dir(&root).unwrap().any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".download-")));
        server.join().unwrap();
        fs::remove_dir_all(root).unwrap();
    }
    #[tokio::test]
    async fn market_reads_http_index_and_retains_it_for_offline_refresh() {
        let root = std::env::temp_dir().join(format!("market-http-test-{}", uuid::Uuid::new_v4()));
        initialize(&root, &root.join("downloads")).unwrap();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 4096];
            stream.read(&mut request).unwrap();
            let body = br#"{"schema_version":1,"plugins":[]}"#;
            write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len()).unwrap();
            stream.write_all(body).unwrap();
        });
        set_market_url(&root, format!("http://{address}/index.json")).unwrap();
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .unwrap();
        assert_eq!(
            market_fetch(&root, &client).await.unwrap().schema_version,
            1
        );
        server.join().unwrap();
        let cached = market_fetch(&root, &client).await.unwrap();
        assert!(cached.plugins.is_empty());
        assert!(cached.from_cache);
        assert!(cached.refresh_error.is_some());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn changing_market_source_removes_the_previous_sources_cache() {
        let root =
            std::env::temp_dir().join(format!("market-source-test-{}", uuid::Uuid::new_v4()));
        initialize(&root, &root.join("downloads")).unwrap();
        set_market_url(&root, "https://example.com/one/index.json".into()).unwrap();
        fs::write(root.join("market-cache.json"), b"old-source").unwrap();
        set_market_url(&root, "https://example.com/one/index.json".into()).unwrap();
        assert!(root.join("market-cache.json").exists());
        set_market_url(&root, "https://example.com/two/index.json".into()).unwrap();
        assert!(!root.join("market-cache.json").exists());
        assert!(set_market_url(&root, "file:///tmp/index.json".into()).is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn imported_package_executes_through_the_shared_protocol() {
        let root =
            std::env::temp_dir().join(format!("plugin-package-test-{}", uuid::Uuid::new_v4()));
        initialize(&root, &root.join("downloads")).unwrap();
        let package = root.join("fixture.zip");
        let mut archive = zip::ZipWriter::new(fs::File::create(&package).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        archive.start_file("plugin.json", options).unwrap();
        archive
            .write_all(include_bytes!(
                "../tests/fixtures/plugins/echo-bot/plugin.json"
            ))
            .unwrap();
        archive.start_file("main.cjs", options).unwrap();
        archive
            .write_all(include_bytes!(
                "../tests/fixtures/plugins/echo-bot/main.cjs"
            ))
            .unwrap();
        archive.finish().unwrap();
        let plugin = install(&root, &package, "local_import", None).unwrap();
        assert!(!plugin.enabled);
        assert!(Path::new(&plugin.root).join("main.cjs").is_file());
        configure(&root, &plugin.manifest.id, true, json!({})).unwrap();
        let plugin = get(&root, &plugin.manifest.id).unwrap();
        #[cfg(desktop)]
        {
            let request = InvokeRequest {
                protocol_version: 1,
                kind: "invoke".into(),
                request_id: "r".into(),
                task_id: "t".into(),
                text: "test".into(),
                config: json!({}),
                inputs: vec![TaskInput {
                    item_id: "one".into(),
                    name: "one".into(),
                    local_path: None,
                    url: Some("https://example.com/a.png".into()),
                    error: None,
                }],
                state_dir: root.join("state").to_string_lossy().into(),
            };
            let result = crate::plugin_process::invoke(&plugin, &request).unwrap();
            assert_eq!(result["items"][0]["status"], "succeeded");
        }
        assert!(install(&root, &package, "local_import", None).is_err());
        assert!(get(&root, &plugin.manifest.id).unwrap().enabled);
        uninstall(&root, &plugin.manifest.id, true).unwrap();
        assert!(get(&root, &plugin.manifest.id).is_err());
        let restored = install(&root, &package, "local_import", None).unwrap();
        assert_eq!(restored.instance_id, plugin.instance_id);
        assert_eq!(restored.config, plugin.config);
        assert!(!restored.enabled);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn refuses_unsafe_archive_paths() {
        for p in ["../a", "/tmp/a", "a/../b", "C:/a", "a\\b"] {
            assert!(safe_relative(p).is_err());
        }
    }
    #[test]
    fn explicit_rollback_restores_a_valid_previous_version_disabled() {
        let root = std::env::temp_dir().join(format!("plugin-rollback-{}", uuid::Uuid::new_v4()));
        initialize(&root, &root.join("downloads")).unwrap();
        let source = root.join("package");
        fs::create_dir_all(&source).unwrap();
        fs::write(
            source.join("plugin.json"),
            include_bytes!("../tests/fixtures/plugins/echo-bot/plugin.json"),
        )
        .unwrap();
        fs::write(
            source.join("main.cjs"),
            include_bytes!("../tests/fixtures/plugins/echo-bot/main.cjs"),
        )
        .unwrap();
        let original = install(&root, &source, "local_import", None).unwrap();
        let mut manifest: Value =
            serde_json::from_slice(&fs::read(source.join("plugin.json")).unwrap()).unwrap();
        manifest["version"] = json!("2.0.0");
        fs::write(source.join("plugin.json"), manifest.to_string()).unwrap();
        let updated = install(&root, &source, "local_import", None).unwrap();
        assert_eq!(updated.instance_id, original.instance_id);
        let restored = rollback(&root, &original.manifest.id, &original.manifest.version).unwrap();
        assert_eq!(restored.manifest.version, original.manifest.version);
        assert!(!restored.enabled);
        assert!(rollback(&root, &original.manifest.id, "../escape").is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn builtin_is_registered_disabled_and_cannot_be_removed() {
        let r = std::env::temp_dir().join(format!("plugin-test-{}", uuid::Uuid::new_v4()));
        initialize(&r, &r.join("downloads")).unwrap();
        let p = get(&r, IMAGE_PLUGIN_ID).unwrap();
        assert!(!p.enabled);
        assert_eq!(p.source_kind, "builtin");
        assert!(uninstall(&r, IMAGE_PLUGIN_ID, false).is_err());
        fs::remove_dir_all(r).unwrap();
    }
    #[test]
    fn concurrent_configuration_preserves_both_plugin_updates() {
        let root =
            std::env::temp_dir().join(format!("plugin-registry-test-{}", uuid::Uuid::new_v4()));
        initialize(&root, &root.join("downloads")).unwrap();
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/plugins/echo-bot");
        install(&root, &fixture, "local_import", None).unwrap();
        let image_config = get(&root, IMAGE_PLUGIN_ID).unwrap().config;
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let workers: Vec<_> = [
            (IMAGE_PLUGIN_ID, image_config),
            ("echo-bot-example", json!({})),
        ]
        .into_iter()
        .map(|(id, config)| {
            let root = root.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                configure(&root, id, true, config).unwrap();
            })
        })
        .collect();
        for worker in workers {
            worker.join().unwrap();
        }
        assert!(get(&root, IMAGE_PLUGIN_ID).unwrap().enabled);
        assert!(get(&root, "echo-bot-example").unwrap().enabled);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn space_publishing_requires_explicit_permission_and_is_isolated() {
        let root = std::env::temp_dir().join(format!("plugin-space-test-{}", uuid::Uuid::new_v4()));
        initialize(&root, &root.join("downloads")).unwrap();
        assert!(!space_allowed(&root, IMAGE_PLUGIN_ID, "owner-a-space").unwrap());
        set_space_allowed(&root, IMAGE_PLUGIN_ID, "owner-a-space", true).unwrap();
        assert!(space_allowed(&root, IMAGE_PLUGIN_ID, "owner-a-space").unwrap());
        assert!(!space_allowed(&root, IMAGE_PLUGIN_ID, "owner-b-space").unwrap());
        set_space_allowed(&root, IMAGE_PLUGIN_ID, "owner-a-space", false).unwrap();
        assert!(!space_allowed(&root, IMAGE_PLUGIN_ID, "owner-a-space").unwrap());
        fs::remove_dir_all(root).unwrap();
    }
}
