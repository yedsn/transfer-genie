use crate::{
    plugin_host::{self, InstalledPlugin},
    plugin_protocol::InvokeRequest,
};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};

struct Process {
    child: Child,
    input: ChildStdin,
    output: Receiver<String>,
}
#[derive(Default)]
struct ProcessSlot {
    process: Mutex<Option<Process>>,
    running: AtomicBool,
    recovery: Mutex<Recovery>,
}
#[derive(Default)]
struct Recovery {
    attempts: u32,
    next_start: Option<Instant>,
    manual_stop: bool,
    healthy_since: Option<Instant>,
}
static PROCESSES: OnceLock<Mutex<HashMap<String, Arc<ProcessSlot>>>> = OnceLock::new();
static CANCELLATIONS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
fn cancellation(id: &str) -> Result<Arc<AtomicBool>, String> {
    let mut entries = CANCELLATIONS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|e| e.to_string())?;
    Ok(entries
        .entry(id.to_string())
        .or_insert_with(|| Arc::new(AtomicBool::new(false)))
        .clone())
}
fn processes() -> &'static Mutex<HashMap<String, Arc<ProcessSlot>>> {
    PROCESSES.get_or_init(|| Mutex::new(HashMap::new()))
}
fn slot(id: &str) -> Result<Arc<ProcessSlot>, String> {
    Ok(processes()
        .lock()
        .map_err(|e| e.to_string())?
        .entry(id.to_string())
        .or_default()
        .clone())
}
fn spawn(plugin: &InstalledPlugin) -> Result<Process, String> {
    let secrets = plugin_host::secrets(plugin)?;
    let (exe, args) = plugin_host::command(plugin)?;
    let mut command = Command::new(exe);
    command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if !plugin.root.is_empty() {
        command.current_dir(&plugin.root);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let input = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let (tx, output) = mpsc::sync_channel(64);
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            let mut bytes = vec![];
            match Read::by_ref(&mut reader)
                .take(4 * 1024 * 1024 + 1)
                .read_until(b'\n', &mut bytes)
            {
                Ok(0) => break,
                Ok(_) if bytes.len() <= 4 * 1024 * 1024 => {
                    if tx
                        .send(String::from_utf8_lossy(&bytes).to_string())
                        .is_err()
                    {
                        break;
                    }
                }
                _ => break,
            }
        }
    });
    let log_root = if !plugin.log_path.is_empty() {
        let path = std::path::PathBuf::from(&plugin.log_path);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        Some(path)
    } else if plugin.root.is_empty() || plugin.source_kind == "builtin" {
        None
    } else {
        PathRoot::from_plugin(plugin)
    };
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut log = log_root.and_then(|p| {
            if std::fs::metadata(&p).is_ok_and(|metadata| metadata.len() >= 1024 * 1024) {
                let _ = std::fs::write(&p, []);
            }
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(p)
                .ok()
        });
        let mut total = log
            .as_ref()
            .and_then(|file| file.metadata().ok())
            .map(|metadata| metadata.len() as usize)
            .unwrap_or(0);
        let mut oversized_line = false;
        loop {
            let mut bytes = vec![];
            match Read::by_ref(&mut reader)
                .take(65537)
                .read_until(b'\n', &mut bytes)
            {
                Ok(0) => break,
                Ok(_) => {
                    let complete = bytes.last() == Some(&b'\n');
                    if oversized_line || !complete {
                        oversized_line = !complete;
                        continue;
                    }
                    let bytes = plugin_host::redact(&String::from_utf8_lossy(&bytes), &secrets)
                        .into_bytes();
                    total += bytes.len();
                    if total < 1024 * 1024 {
                        if let Some(file) = log.as_mut() {
                            let _ = file.write_all(&bytes);
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });
    let mut process = Process {
        child,
        input,
        output,
    };
    let ready = process
        .output
        .recv_timeout(Duration::from_secs(10))
        .map_err(|_| "插件握手超时".to_string())
        .and_then(|line| serde_json::from_str::<Value>(&line).map_err(|_| "插件握手无效".into()));
    match ready {
        Ok(value) if value["kind"] == "ready" && value["protocol_version"] == 1 => Ok(process),
        _ => {
            terminate(&mut process);
            Err("插件未完成就绪握手".into())
        }
    }
}
struct PathRoot;
impl PathRoot {
    fn from_plugin(plugin: &InstalledPlugin) -> Option<std::path::PathBuf> {
        let root = std::path::Path::new(&plugin.root).parent()?.parent()?;
        Some(root.join("plugin.log"))
    }
}
fn terminate(process: &mut Process) {
    let _ = writeln!(
        process.input,
        "{}",
        json!({"protocol_version":1,"kind":"shutdown"})
    );
    let _ = process.input.flush();
    let deadline = Instant::now() + Duration::from_millis(300);
    while Instant::now() < deadline {
        if process.child.try_wait().ok().flatten().is_some() {
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/PID", &process.child.id().to_string(), "/T", "/F"])
            .creation_flags(0x08000000)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(unix)]
    {
        let _ = Command::new("kill")
            .args(["-TERM", "--", &format!("-{}", process.child.id())])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = process.child.kill();
    let _ = process.child.wait();
}
pub fn stop(id: &str) -> Result<(), String> {
    cancellation(id)?.store(true, Ordering::SeqCst);
    let slot = slot(id)?;
    slot.recovery.lock().map_err(|e| e.to_string())?.manual_stop = true;
    let mut entry = slot.process.lock().map_err(|e| e.to_string())?;
    if let Some(mut process) = entry.take() {
        terminate(&mut process);
    }
    slot.running.store(false, Ordering::SeqCst);
    Ok(())
}
pub fn request_cancel(id: &str) -> Result<(), String> {
    cancellation(id)?.store(true, Ordering::SeqCst);
    Ok(())
}
pub fn prepare_invoke(id: &str) -> Result<(), String> {
    cancellation(id)?.store(false, Ordering::SeqCst);
    Ok(())
}
pub fn stop_all() {
    if let Some(entries) = CANCELLATIONS.get() {
        if let Ok(entries) = entries.lock() {
            for flag in entries.values() {
                flag.store(true, Ordering::SeqCst);
            }
        }
    }
    let ids = processes()
        .lock()
        .map(|map| map.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    for id in ids {
        let _ = stop(&id);
    }
}
pub fn running(id: &str) -> bool {
    let Ok(slot) = slot(id) else { return false };
    if let Ok(mut entry) = slot.process.try_lock() {
        let live = entry
            .as_mut()
            .is_some_and(|p| p.child.try_wait().ok().flatten().is_none());
        slot.running.store(live, Ordering::SeqCst);
    }
    slot.running.load(Ordering::SeqCst)
}
pub fn start(plugin: &InstalledPlugin) -> Result<(), String> {
    {
        let slot = slot(&plugin.manifest.id)?;
        *slot.recovery.lock().map_err(|e| e.to_string())? = Recovery::default();
    }
    start_process(plugin)
}
pub fn maintain_service(plugin: &InstalledPlugin) -> Result<(), String> {
    if !plugin.enabled
        || plugin.manifest.runtime.mode != "service"
        || !plugin.manifest.runtime.auto_start
    {
        return Ok(());
    }
    if running(&plugin.manifest.id) {
        let slot = slot(&plugin.manifest.id)?;
        let mut recovery = slot.recovery.lock().map_err(|e| e.to_string())?;
        let since = recovery.healthy_since.get_or_insert_with(Instant::now);
        if since.elapsed() >= Duration::from_secs(60) {
            recovery.attempts = 0;
            recovery.next_start = None;
        }
        return Ok(());
    }
    let slot = slot(&plugin.manifest.id)?;
    {
        let mut recovery = slot.recovery.lock().map_err(|e| e.to_string())?;
        recovery.healthy_since = None;
        if recovery.manual_stop {
            return Ok(());
        }
        if recovery.attempts >= 3 {
            return Err("插件连续启动或退出失败，自动恢复已停止，请手动启动".into());
        }
        if recovery
            .next_start
            .is_some_and(|next| Instant::now() < next)
        {
            return Ok(());
        }
        recovery.attempts += 1;
        recovery.next_start =
            Some(Instant::now() + Duration::from_secs(15 * (1 << (recovery.attempts - 1))));
    }
    start_process(plugin)
}
fn start_process(plugin: &InstalledPlugin) -> Result<(), String> {
    if !plugin.enabled {
        return Err("插件已停用".into());
    }
    if plugin.manifest.runtime.mode != "service" {
        return Err("一次性插件按任务运行".into());
    }
    let slot = slot(&plugin.manifest.id)?;
    let mut entry = slot.process.lock().map_err(|e| e.to_string())?;
    if let Some(process) = entry.as_mut() {
        if process
            .child
            .try_wait()
            .map_err(|e| e.to_string())?
            .is_some()
        {
            *entry = None;
        }
    }
    if entry.is_none() {
        *entry = Some(spawn(plugin)?);
    }
    slot.running.store(true, Ordering::SeqCst);
    Ok(())
}
pub fn invoke(plugin: &InstalledPlugin, request: &InvokeRequest) -> Result<Value, String> {
    prepare_invoke(&plugin.manifest.id)?;
    invoke_with_progress(plugin, request, |_| Ok(()))
}
pub fn invoke_with_progress(
    plugin: &InstalledPlugin,
    request: &InvokeRequest,
    mut progress: impl FnMut(&Value) -> Result<(), String>,
) -> Result<Value, String> {
    if !plugin.enabled {
        return Err("插件已停用".into());
    }
    let secrets = plugin_host::secrets(plugin)?;
    let mut request = request.clone();
    for (key, value) in &secrets {
        request.config[key] = json!(value);
    }
    let cancelled = cancellation(&plugin.manifest.id)?;
    let slot = slot(&plugin.manifest.id)?;
    let mut entry = slot.process.lock().map_err(|e| e.to_string())?;
    if cancelled.load(Ordering::SeqCst) {
        return Err("插件任务已取消".into());
    }
    if let Some(p) = entry.as_mut() {
        if p.child.try_wait().map_err(|e| e.to_string())?.is_some() {
            *entry = None;
        }
    }
    if entry.is_none() {
        *entry = Some(spawn(plugin)?);
    }
    slot.running.store(true, Ordering::SeqCst);
    let process = entry.as_mut().unwrap();
    let result = (|| {
        writeln!(
            process.input,
            "{}",
            serde_json::to_string(&request).map_err(|e| e.to_string())?
        )
        .and_then(|_| process.input.flush())
        .map_err(|e| e.to_string())?;
        let timeout_seconds = if plugin.manifest.id == crate::plugin_protocol::IMAGE_PLUGIN_ID {
            let concurrency = request.config["concurrency"]
                .as_u64()
                .unwrap_or(2)
                .clamp(1, 8);
            let per_item = request.config["timeout_seconds"]
                .as_u64()
                .unwrap_or(600)
                .clamp(1, 600);
            per_item * (request.inputs.len() as u64).div_ceil(concurrency).max(1) + 30
        } else {
            600
        };
        let deadline = Instant::now() + Duration::from_secs(timeout_seconds);
        loop {
            if cancelled.load(Ordering::SeqCst) {
                let _ = writeln!(
                    process.input,
                    "{}",
                    json!({"protocol_version":1,"kind":"cancel","request_id":request.request_id,"task_id":request.task_id})
                );
                let _ = process.input.flush();
                return Err("插件任务已取消".into());
            }
            if Instant::now() >= deadline {
                return Err("插件任务超时".into());
            }
            let line = match process.output.recv_timeout(Duration::from_millis(100)) {
                Ok(line) => line,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => return Err("插件进程已退出".into()),
            };
            let mut value: Value = serde_json::from_str(&line).map_err(|_| "插件输出无效")?;
            plugin_host::redact_payload(&mut value, &secrets);
            if value["protocol_version"] != 1
                || value["task_id"] != request.task_id
                || value["request_id"] != request.request_id
            {
                return Err("插件响应身份不符".into());
            }
            if value["kind"] == "result" {
                crate::plugin_protocol::validate_item_results(&value, &request.inputs)?;
                return Ok(value);
            }
            if value["kind"] == "progress" {
                let item = &value["item"];
                if !request
                    .inputs
                    .iter()
                    .any(|input| item["item_id"] == input.item_id)
                {
                    return Err("插件进度包含未知任务项".into());
                }
                progress(&value)?;
            } else {
                return Err("不支持的插件响应类型".into());
            }
        }
    })();
    if plugin.manifest.runtime.mode == "oneshot" || result.is_err() {
        slot.running.store(false, Ordering::SeqCst);
        if let Some(mut process) = entry.take() {
            if result.is_ok() && plugin.manifest.runtime.mode == "oneshot" {
                let deadline = Instant::now() + Duration::from_secs(2);
                loop {
                    match process.child.try_wait() {
                        Ok(Some(status)) => {
                            if !status.success() {
                                return Err("插件以失败状态退出".into());
                            }
                            break;
                        }
                        _ if Instant::now() >= deadline => {
                            terminate(&mut process);
                            return Err("一次性插件返回结果后未退出".into());
                        }
                        _ => std::thread::sleep(Duration::from_millis(10)),
                    }
                }
            } else {
                terminate(&mut process);
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_protocol::{PluginManifest, Runtime};

    #[test]
    fn stop_interrupts_a_running_service_without_waiting_for_task_timeout() {
        let root = std::env::temp_dir().join(format!("tg-process-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("worker.js"),
            "console.log(JSON.stringify({protocol_version:1,kind:'ready'})); require('readline').createInterface({input:process.stdin}).on('line',()=>{});").unwrap();
        let plugin = InstalledPlugin {
            manifest: PluginManifest {
                manifest_version: 1,
                id: format!("test-{}", uuid::Uuid::new_v4()),
                name: "test".into(),
                version: "1".into(),
                host_api_version: 1,
                supported_platforms: vec![],
                capabilities: vec![],
                config_schema: vec![],
                runtime: Runtime {
                    mode: "service".into(),
                    command: "worker.js".into(),
                    args: vec![],
                    interpreter: Some("node".into()),
                    auto_start: false,
                },
            },
            source_kind: "external".into(),
            origin: "local_import".into(),
            enabled: true,
            instance_id: "test".into(),
            root: root.to_string_lossy().into(),
            config: json!({}),
            error: None,
            source_url: None,
            log_path: root.join("plugin.log").to_string_lossy().into(),
        };
        let request = InvokeRequest {
            protocol_version: 1,
            kind: "invoke".into(),
            request_id: "r".into(),
            task_id: "t".into(),
            text: String::new(),
            config: json!({}),
            inputs: vec![],
            state_dir: root.to_string_lossy().into(),
        };
        start(&plugin).unwrap();
        prepare_invoke(&plugin.manifest.id).unwrap();
        request_cancel(&plugin.manifest.id).unwrap();
        assert!(invoke_with_progress(&plugin, &request, |_| Ok(()))
            .unwrap_err()
            .contains("取消"));
        let worker_plugin = plugin.clone();
        let worker = std::thread::spawn(move || invoke(&worker_plugin, &request));
        std::thread::sleep(Duration::from_millis(250));
        assert!(
            running(&plugin.manifest.id),
            "busy plugins must still report running"
        );
        let mut other = plugin.clone();
        other.manifest.id = format!("test-{}", uuid::Uuid::new_v4());
        let other_worker = other.clone();
        let (ready_tx, ready_rx) = mpsc::channel();
        let starter = std::thread::spawn(move || {
            ready_tx.send(start(&other_worker)).unwrap();
        });
        ready_rx
            .recv_timeout(Duration::from_secs(5))
            .expect("another plugin must start while a task is running")
            .unwrap();
        starter.join().unwrap();
        assert!(running(&other.manifest.id));
        let began = Instant::now();
        stop(&plugin.manifest.id).unwrap();
        assert!(began.elapsed() < Duration::from_secs(5));
        assert!(worker.join().unwrap().unwrap_err().contains("取消"));
        assert!(!running(&plugin.manifest.id));
        assert!(running(&other.manifest.id));
        stop(&other.manifest.id).unwrap();
        other.manifest.runtime.auto_start = true;
        maintain_service(&other).unwrap();
        assert!(
            !running(&other.manifest.id),
            "manual stop must suppress auto restart"
        );
        {
            let slot = slot(&other.manifest.id).unwrap();
            let mut recovery = slot.recovery.lock().unwrap();
            recovery.manual_stop = false;
            recovery.attempts = 3;
        }
        assert!(maintain_service(&other)
            .unwrap_err()
            .contains("自动恢复已停止"));
        start(&other).unwrap();
        assert!(
            running(&other.manifest.id),
            "manual start resets the recovery budget"
        );
        stop(&other.manifest.id).unwrap();
        let request = InvokeRequest {
            protocol_version: 1,
            kind: "invoke".into(),
            request_id: "r".into(),
            task_id: "t".into(),
            text: String::new(),
            config: json!({}),
            inputs: vec![],
            state_dir: root.to_string_lossy().into(),
        };
        for (body,expected) in [
            ("console.log('broken-json')", "握手"),
            ("console.log(JSON.stringify({kind:'ready',protocol_version:99}))", "握手"),
            ("console.log(JSON.stringify({kind:'ready',protocol_version:1})); require('readline').createInterface({input:process.stdin}).on('line',()=>console.log(JSON.stringify({kind:'result',protocol_version:1,task_id:'wrong',request_id:'r',items:[]})));", "身份"),
            ("console.log(JSON.stringify({kind:'ready',protocol_version:1})); require('readline').createInterface({input:process.stdin}).on('line',()=>process.exit(7));", "退出"),
        ] {
            std::fs::write(root.join("worker.js"),body).unwrap();
            let error=invoke(&other,&request).unwrap_err();assert!(error.contains(expected),"{error}");assert!(!running(&other.manifest.id));
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
