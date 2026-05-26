use serde::Serialize;
use serde_json::{json, Value};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const WORKSPACE_DIR_NAME: &str = "workspace";
pub const DEFAULT_SNAPSHOT_RETAIN_COUNT: usize = 20;

#[derive(Clone, Debug)]
pub struct WorkspaceLayout {
    root: PathBuf,
}

impl WorkspaceLayout {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            root: app_data_dir.join(WORKSPACE_DIR_NAME),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn settings_path(&self, app_data_dir: &Path) -> PathBuf {
        app_data_dir.join("settings.json")
    }

    pub fn db_path(&self, app_data_dir: &Path) -> PathBuf {
        app_data_dir.join("messages.sqlite")
    }

    pub fn endpoints_dir(&self) -> PathBuf {
        self.root.join("endpoints")
    }

    #[allow(dead_code)]
    pub fn endpoint_dir(&self, endpoint_id: &str) -> PathBuf {
        self.endpoints_dir().join(endpoint_id)
    }

    #[allow(dead_code)]
    pub fn history_cache_dir(&self, endpoint_id: &str) -> PathBuf {
        self.endpoint_dir(endpoint_id).join("history-cache")
    }

    pub fn change_log_dir(&self) -> PathBuf {
        self.root.join("change-log")
    }

    pub fn backups_dir(&self) -> PathBuf {
        self.root.join("backups")
    }

    pub fn mirrors_dir(&self) -> PathBuf {
        self.root.join("mirrors")
    }

    pub fn snapshots_dir(&self) -> PathBuf {
        self.root.join("snapshots")
    }

    pub fn runtime_dir(&self) -> PathBuf {
        self.root.join("runtime")
    }

    pub fn plugins_dir(&self) -> PathBuf {
        self.root.join("plugins")
    }

    pub fn plugin_dir(&self, module_id: &str) -> PathBuf {
        self.plugins_dir().join(module_id)
    }
}

#[derive(Serialize)]
struct LocalChangeRecord {
    id: String,
    timestamp_ms: i64,
    category: String,
    operation: String,
    target_path: String,
    snapshot_path: Option<String>,
    metadata: Value,
}

pub fn ensure_workspace_dirs(layout: &WorkspaceLayout) -> Result<(), String> {
    for dir in [
        layout.root().to_path_buf(),
        layout.endpoints_dir(),
        layout.change_log_dir(),
        layout.backups_dir(),
        layout.mirrors_dir(),
        layout.snapshots_dir(),
        layout.runtime_dir(),
        layout.plugins_dir(),
    ] {
        fs::create_dir_all(&dir)
            .map_err(|err| format!("创建 workspace 目录失败 {}: {err}", dir.display()))?;
    }
    Ok(())
}

pub fn migrate_legacy_layout(
    app_data_dir: &Path,
    layout: &WorkspaceLayout,
) -> Result<(), String> {
    migrate_legacy_endpoint_dirs(app_data_dir, &layout.endpoints_dir())?;
    migrate_legacy_plugin_dir(
        &app_data_dir.join("telegram-bridge"),
        &layout.plugins_dir().join("telegram-bridge"),
    )?;
    Ok(())
}

fn migrate_legacy_endpoint_dirs(app_data_dir: &Path, endpoints_dir: &Path) -> Result<(), String> {
    let legacy_files_dir = app_data_dir.join("files");
    if !legacy_files_dir.is_dir() {
        return Ok(());
    }

    for entry in
        fs::read_dir(&legacy_files_dir).map_err(|err| format!("failed to read legacy files directory: {err}"))?
    {
        let entry = entry.map_err(|err| format!("failed to read legacy endpoint directory: {err}"))?;
        let target_dir = endpoints_dir.join(entry.file_name());
        if target_dir.exists() {
            continue;
        }
        fs::rename(entry.path(), &target_dir).map_err(|err| {
            format!(
                "failed to migrate legacy endpoint directory {} -> {}: {err}",
                entry.path().display(),
                target_dir.display()
            )
        })?;
    }

    Ok(())
}

fn migrate_legacy_plugin_dir(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
    if !source_dir.is_dir() || target_dir.exists() {
        return Ok(());
    }

    if let Some(parent) = target_dir.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("failed to create plugin parent directory {}: {err}", parent.display()))?;
    }

    fs::rename(source_dir, target_dir).map_err(|err| {
        format!(
            "failed to migrate legacy plugin directory {} -> {}: {err}",
            source_dir.display(),
            target_dir.display()
        )
    })
}

pub fn write_json_with_audit_at<T: Serialize + ?Sized>(
    path: &Path,
    value: &T,
    audit_root: Option<&Path>,
    category: &str,
    operation: &str,
) -> Result<(), String> {
    let data =
        serde_json::to_vec_pretty(value).map_err(|err| format!("序列化 JSON 失败: {err}"))?;
    write_bytes_with_audit_at(path, &data, audit_root, category, operation)
}

pub fn write_bytes_with_audit_at(
    path: &Path,
    data: &[u8],
    audit_root: Option<&Path>,
    category: &str,
    operation: &str,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("创建目标目录失败 {}: {err}", parent.display()))?;
    }

    let resolved_audit_root = audit_root
        .map(PathBuf::from)
        .or_else(|| infer_workspace_root(path));
    let snapshot_path = if let Some(root) = resolved_audit_root.as_deref() {
        snapshot_existing_file(root, path, category)?
    } else {
        None
    };

    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, data)
        .map_err(|err| format!("写入临时文件失败 {}: {err}", temp_path.display()))?;
    fs::rename(&temp_path, path)
        .map_err(|err| format!("更新文件失败 {}: {err}", path.display()))?;

    if let Some(root) = resolved_audit_root.as_deref() {
        append_change_record(
            root,
            category,
            operation,
            path,
            snapshot_path.as_deref(),
            json!({
                "bytes": data.len(),
            }),
        )?;
    }

    Ok(())
}

pub fn infer_workspace_root(path: &Path) -> Option<PathBuf> {
    for ancestor in path.ancestors() {
        if ancestor.file_name() == Some(OsStr::new(WORKSPACE_DIR_NAME)) {
            return Some(ancestor.to_path_buf());
        }
    }
    None
}

#[allow(dead_code)]
pub fn list_snapshots_for_target(
    workspace_root: &Path,
    target_path: &Path,
    category: &str,
) -> Result<Vec<PathBuf>, String> {
    let snapshot_dir = snapshot_target_dir(workspace_root, target_path, category);
    if !snapshot_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut entries = fs::read_dir(&snapshot_dir)
        .map_err(|err| format!("读取快照目录失败 {}: {err}", snapshot_dir.display()))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .collect::<Vec<_>>();
    entries.sort();
    entries.reverse();
    Ok(entries)
}

#[allow(dead_code)]
pub fn restore_snapshot_to_target(
    snapshot_path: &Path,
    target_path: &Path,
    audit_root: Option<&Path>,
    category: &str,
    operation: &str,
) -> Result<(), String> {
    let data = fs::read(snapshot_path)
        .map_err(|err| format!("读取快照文件失败 {}: {err}", snapshot_path.display()))?;
    write_bytes_with_audit_at(target_path, &data, audit_root, category, operation)
}

fn snapshot_existing_file(
    workspace_root: &Path,
    target_path: &Path,
    category: &str,
) -> Result<Option<PathBuf>, String> {
    if !target_path.is_file() {
        return Ok(None);
    }

    let file_name = target_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("snapshot.bin");
    let snapshot_dir = snapshot_target_dir(workspace_root, target_path, category);
    fs::create_dir_all(&snapshot_dir)
        .map_err(|err| format!("创建快照目录失败 {}: {err}", snapshot_dir.display()))?;
    let snapshot_path = snapshot_dir.join(format!("{}-{}", now_ms(), file_name));
    fs::copy(target_path, &snapshot_path).map_err(|err| {
        format!(
            "创建快照失败 {} -> {}: {err}",
            target_path.display(),
            snapshot_path.display()
        )
    })?;
    prune_snapshot_dir(&snapshot_dir, DEFAULT_SNAPSHOT_RETAIN_COUNT)?;
    Ok(Some(snapshot_path))
}

fn snapshot_target_dir(workspace_root: &Path, target_path: &Path, category: &str) -> PathBuf {
    let base_dir = workspace_root.parent().unwrap_or(workspace_root);
    let relative = target_path
        .strip_prefix(base_dir)
        .or_else(|_| target_path.strip_prefix(workspace_root))
        .ok();

    let mut dir = workspace_root.join("snapshots").join(sanitize_component(category));
    if let Some(relative) = relative {
        for component in relative.components() {
            let value = sanitize_component(&component.as_os_str().to_string_lossy());
            if !value.is_empty() {
                dir.push(value);
            }
        }
    } else if let Some(file_name) = target_path.file_name().and_then(|value| value.to_str()) {
        dir.push(sanitize_component(file_name));
    } else {
        dir.push("snapshot-target");
    }
    dir
}

fn prune_snapshot_dir(snapshot_dir: &Path, retain_count: usize) -> Result<(), String> {
    if !snapshot_dir.is_dir() {
        return Ok(());
    }

    let mut entries = fs::read_dir(snapshot_dir)
        .map_err(|err| format!("读取快照目录失败 {}: {err}", snapshot_dir.display()))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_file())
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());

    if entries.len() <= retain_count {
        return Ok(());
    }

    let remove_count = entries.len() - retain_count;
    for entry in entries.into_iter().take(remove_count) {
        fs::remove_file(entry.path())
            .map_err(|err| format!("清理旧快照失败 {}: {err}", entry.path().display()))?;
    }

    Ok(())
}

fn append_change_record(
    workspace_root: &Path,
    category: &str,
    operation: &str,
    target_path: &Path,
    snapshot_path: Option<&Path>,
    metadata: Value,
) -> Result<(), String> {
    let change_log_dir = workspace_root.join("change-log");
    fs::create_dir_all(&change_log_dir)
        .map_err(|err| format!("创建变更日志目录失败 {}: {err}", change_log_dir.display()))?;
    let log_path = change_log_dir.join("events.jsonl");
    let record = LocalChangeRecord {
        id: format!("change-{}", now_ms()),
        timestamp_ms: now_ms(),
        category: category.to_string(),
        operation: operation.to_string(),
        target_path: target_path.to_string_lossy().to_string(),
        snapshot_path: snapshot_path.map(|path| path.to_string_lossy().to_string()),
        metadata,
    };
    let mut serialized =
        serde_json::to_vec(&record).map_err(|err| format!("序列化变更记录失败: {err}"))?;
    serialized.push(b'\n');

    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|err| format!("打开变更日志失败 {}: {err}", log_path.display()))?;
    file.write_all(&serialized)
        .map_err(|err| format!("写入变更日志失败 {}: {err}", log_path.display()))
}

fn sanitize_component(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '_' | '-' => ch,
            _ => '_',
        })
        .collect()
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let suffix = now_ms();
        std::env::temp_dir().join(format!("transfer-genie-workspace-{name}-{suffix}"))
    }

    #[test]
    fn infer_workspace_root_from_nested_path() {
        let root = temp_dir("infer").join("workspace");
        let nested = root.join("plugins").join("telegram-bridge").join("state.json");
        assert_eq!(infer_workspace_root(&nested).as_deref(), Some(root.as_path()));
    }

    #[test]
    fn write_bytes_with_audit_creates_snapshot_and_change_log() {
        let app_dir = temp_dir("audit");
        let layout = WorkspaceLayout::new(app_dir.clone());
        ensure_workspace_dirs(&layout).expect("ensure workspace dirs");
        let target = app_dir.join("settings.json");

        write_bytes_with_audit_at(
            &target,
            br#"{"a":1}"#,
            Some(layout.root()),
            "settings",
            "write",
        )
        .expect("first write");
        write_bytes_with_audit_at(
            &target,
            br#"{"a":2}"#,
            Some(layout.root()),
            "settings",
            "write",
        )
        .expect("second write");

        let change_log = layout.change_log_dir().join("events.jsonl");
        let content = fs::read_to_string(&change_log).expect("read change log");
        assert!(content.contains("\"category\":\"settings\""));

        let snapshot_dir = layout
            .root()
            .join("snapshots")
            .join("settings")
            .join("settings.json");
        assert!(snapshot_dir.is_dir());
        let snapshots = list_snapshots_for_target(layout.root(), &target, "settings")
            .expect("list snapshots");
        assert!(!snapshots.is_empty());

        let _ = fs::remove_dir_all(app_dir);
    }

    #[test]
    fn restore_snapshot_to_target_restores_previous_content_and_appends_audit_log() {
        let app_dir = temp_dir("restore");
        let layout = WorkspaceLayout::new(app_dir.clone());
        ensure_workspace_dirs(&layout).expect("ensure workspace dirs");
        let target = app_dir.join("settings.json");

        write_bytes_with_audit_at(
            &target,
            br#"{"a":1}"#,
            Some(layout.root()),
            "settings",
            "write",
        )
        .expect("first write");
        write_bytes_with_audit_at(
            &target,
            br#"{"a":2}"#,
            Some(layout.root()),
            "settings",
            "write",
        )
        .expect("second write");

        let snapshots =
            list_snapshots_for_target(layout.root(), &target, "settings").expect("list snapshots");
        let restore_source = snapshots.last().expect("oldest snapshot").clone();

        restore_snapshot_to_target(
            &restore_source,
            &target,
            Some(layout.root()),
            "settings",
            "restore-snapshot",
        )
        .expect("restore snapshot");

        let content = fs::read_to_string(&target).expect("read restored target");
        assert!(content.contains("\"a\":1"));

        let change_log = fs::read_to_string(layout.change_log_dir().join("events.jsonl"))
            .expect("read change log");
        assert!(change_log.contains("\"operation\":\"restore-snapshot\""));

        let _ = fs::remove_dir_all(app_dir);
    }

    #[test]
    fn snapshot_retention_keeps_latest_entries_per_target() {
        let app_dir = temp_dir("retention");
        let layout = WorkspaceLayout::new(app_dir.clone());
        ensure_workspace_dirs(&layout).expect("ensure workspace dirs");
        let target = app_dir.join("settings.json");

        write_bytes_with_audit_at(
            &target,
            br#"{"version":0}"#,
            Some(layout.root()),
            "settings",
            "write",
        )
        .expect("seed write");

        for index in 1..=(DEFAULT_SNAPSHOT_RETAIN_COUNT + 3) {
            let payload = format!("{{\"version\":{index}}}");
            write_bytes_with_audit_at(
                &target,
                payload.as_bytes(),
                Some(layout.root()),
                "settings",
                "write",
            )
            .expect("write revision");
        }

        let snapshots =
            list_snapshots_for_target(layout.root(), &target, "settings").expect("list snapshots");
        assert_eq!(snapshots.len(), DEFAULT_SNAPSHOT_RETAIN_COUNT);

        let _ = fs::remove_dir_all(app_dir);
    }

    #[test]
    fn ensure_workspace_dirs_creates_snapshot_and_mirror_dirs() {
        let app_dir = temp_dir("dirs");
        let layout = WorkspaceLayout::new(app_dir.clone());
        ensure_workspace_dirs(&layout).expect("ensure workspace dirs");

        assert!(layout.mirrors_dir().is_dir());
        assert!(layout.snapshots_dir().is_dir());

        let _ = fs::remove_dir_all(app_dir);
    }

    #[test]
    fn migrate_legacy_layout_moves_endpoint_and_plugin_dirs() {
        let app_dir = temp_dir("migrate");
        let layout = WorkspaceLayout::new(app_dir.clone());
        let legacy_endpoint_dir = app_dir.join("files").join("endpoint-a");
        let legacy_plugin_dir = app_dir.join("telegram-bridge");

        fs::create_dir_all(&legacy_endpoint_dir).expect("create legacy endpoint dir");
        fs::write(legacy_endpoint_dir.join("sample.txt"), b"hello")
            .expect("write legacy endpoint file");
        fs::create_dir_all(&legacy_plugin_dir).expect("create legacy plugin dir");
        fs::write(legacy_plugin_dir.join("state.json"), b"{}").expect("write legacy plugin file");

        ensure_workspace_dirs(&layout).expect("ensure workspace dirs");
        migrate_legacy_layout(&app_dir, &layout).expect("migrate legacy layout");

        assert!(layout.endpoints_dir().join("endpoint-a").join("sample.txt").is_file());
        assert!(layout.plugins_dir().join("telegram-bridge").join("state.json").is_file());
        assert!(!legacy_endpoint_dir.exists());
        assert!(!legacy_plugin_dir.exists());

        let _ = fs::remove_dir_all(app_dir);
    }
}
