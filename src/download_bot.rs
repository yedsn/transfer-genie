use crate::plugin_protocol::{
    InvokeRequest, ItemResult, TaskInput, TransferMeter, TransferProgress,
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{self, BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};
use url::Url;

fn setting(config: &Value, key: &str, default: u64, max: u64) -> u64 {
    config[key].as_u64().unwrap_or(default).clamp(1, max)
}

fn io_error(error: io::Error) -> String {
    format!("下载文件读写失败（{}）", error.kind())
}

fn copy_bounded(
    mut source: impl Read,
    mut dest: impl Write,
    max: u64,
    deadline: Instant,
) -> Result<u64, String> {
    let mut size = 0;
    let mut buffer = vec![0; 128 * 1024];
    loop {
        if Instant::now() >= deadline {
            return Err("下载超过总时限".into());
        }
        let count = source.read(&mut buffer).map_err(io_error)?;
        if count == 0 {
            return Ok(size);
        }
        size += count as u64;
        if size > max {
            return Err("文件超过大小限制".into());
        }
        dest.write_all(&buffer[..count]).map_err(io_error)?;
    }
}

fn file_hash(path: &Path, size: u64) -> Option<String> {
    let metadata = fs::symlink_metadata(path).ok()?;
    if !metadata.file_type().is_file() || metadata.len() != size {
        return None;
    }
    let mut file = File::open(path).ok()?;
    let mut digest = Sha256::new();
    if io::copy(&mut (&mut file).take(size + 1), &mut digest).ok()? != size {
        return None;
    }
    Some(format!("{:x}", digest.finalize()))
}

fn file_url(url: &Url) -> bool {
    matches!(url.scheme(), "https" | "http")
        && url.username().is_empty()
        && url.password().is_none()
}

fn url_name(url: &Url) -> Option<String> {
    let name = url.path_segments()?.next_back()?;
    (!name.is_empty()).then(|| {
        percent_encoding::percent_decode_str(name)
            .decode_utf8_lossy()
            .into_owned()
    })
}

fn response_name(response: &reqwest::Response) -> Option<String> {
    let header = response
        .headers()
        .get(reqwest::header::CONTENT_DISPOSITION)?
        .to_str()
        .ok()?;
    let mut fallback = None;
    for parameter in header.split(';').skip(1) {
        let Some((key, value)) = parameter.trim().split_once('=') else {
            continue;
        };
        if key.eq_ignore_ascii_case("filename*") {
            if let Some((encoding, value)) = value.trim_matches('"').split_once('\'') {
                if encoding.eq_ignore_ascii_case("utf-8") {
                    if let Some((_, encoded)) = value.split_once('\'') {
                        return Some(
                            percent_encoding::percent_decode_str(encoded)
                                .decode_utf8_lossy()
                                .into_owned(),
                        );
                    }
                }
            }
        } else if key.eq_ignore_ascii_case("filename") {
            fallback = Some(value.trim_matches('"').to_owned());
        }
    }
    fallback
}

fn http_download(
    url: Url,
    path: &Path,
    config: &Value,
    max: u64,
    total: Duration,
    idle: Duration,
    progress: &mut impl FnMut(Option<&str>, TransferProgress),
) -> Result<(Option<String>, u64), String> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| "无法启动下载")?;
    runtime.block_on(async {
        let mut builder = reqwest::Client::builder()
            .no_proxy()
            .timeout(total)
            .connect_timeout(idle)
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 5 || !file_url(attempt.url()) {
                    attempt.error("不支持的下载重定向")
                } else {
                    attempt.follow()
                }
            }));
        if let Some(proxy) = config["resolved_proxy_url"].as_str() {
            builder = builder.proxy(reqwest::Proxy::all(proxy).map_err(|_| "代理地址无效")?);
        }
        let mut response = builder
            .build()
            .map_err(|_| "无法启动下载")?
            .get(url)
            .send()
            .await
            .map_err(|_| "连接下载地址失败，请检查链接和所选出口")?;
        if !response.status().is_success() {
            return Err(if response.status().as_u16() == 407 {
                "代理认证失败".into()
            } else {
                format!("下载服务器返回 HTTP {}", response.status().as_u16())
            });
        }
        let name = response_name(&response).or_else(|| url_name(response.url()));
        if response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.starts_with("text/html"))
            && config["connection_check"] != true
            && !name.as_deref().is_some_and(|v| {
                matches!(extension(v).to_ascii_lowercase().as_str(), "html" | "htm")
            })
        {
            return Err("链接返回网页，请提供文件直链".into());
        }
        if response.content_length().is_some_and(|n| n > max) {
            return Err("文件超过大小限制".into());
        }
        let mut output = File::create(path).map_err(io_error)?;
        let mut size = 0;
        let mut meter = TransferMeter::new(response.content_length());
        while let Some(chunk) = tokio::time::timeout(idle, response.chunk())
            .await
            .map_err(|_| "下载超过无数据时限")?
            .map_err(|_| "读取下载响应失败")?
        {
            size += chunk.len() as u64;
            if size > max {
                return Err("文件超过大小限制".into());
            }
            output.write_all(&chunk).map_err(io_error)?;
            if let Some(sample) = meter.sample(size) {
                progress(name.as_deref(), sample);
            }
        }
        output.sync_all().map_err(io_error)?;
        Ok((name, size))
    })
}

fn aria_command(config: &Value) -> Result<Command, String> {
    let path = Path::new(config["aria2c_path"].as_str().unwrap_or_default());
    if !path.is_absolute() || !path.is_file() {
        return Err("请设置有效的 aria2c 程序路径".into());
    }
    let mut command = Command::new(path);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    for key in [
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "ftp_proxy",
        "no_proxy",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "FTP_PROXY",
        "NO_PROXY",
    ] {
        command.env_remove(key);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    Ok(command)
}

fn aria_progress(line: &str) -> Option<TransferProgress> {
    let mut fields = line.trim().strip_prefix("[#")?.split_whitespace();
    fields.next()?;
    let (received, total) = fields.next()?.split_once('/')?;
    let bytes = |value: &str| value.strip_suffix('B')?.parse::<u64>().ok();
    Some(TransferProgress {
        received_bytes: bytes(received)?,
        total_bytes: bytes(total.split('(').next()?).filter(|size| *size > 0),
        bytes_per_second: fields
            .find_map(|field| bytes(field.strip_prefix("DL:")?.trim_end_matches(']')))?,
    })
}

fn wait_child(
    mut command: Command,
    path: &Path,
    max: u64,
    total: Duration,
    mut progress: impl FnMut(TransferProgress),
) -> Result<(), String> {
    let mut child = command
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|_| "无法启动 aria2c，请检查程序路径")?;
    let stdout = child.stdout.take().expect("aria2c stdout is piped");
    let (sender, receiver) = std::sync::mpsc::sync_channel(4);
    // The reader owns only the pipe and drops it when the process exits.
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            // Only numeric summaries are forwarded. Discard all paths and diagnostics.
            let mut line = Vec::new();
            match reader.by_ref().take(4096).read_until(b'\n', &mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    if let Some(sample) = std::str::from_utf8(&line).ok().and_then(aria_progress) {
                        let _ = sender.try_send(sample);
                    }
                }
            }
        }
    });
    let deadline = Instant::now() + total;
    let result = loop {
        if fs::metadata(path).is_ok_and(|meta| meta.len() > max) {
            break Err("文件超过大小限制".into());
        }
        if let Some(sample) = receiver.try_iter().take(4).last() {
            progress(sample);
        }
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break Ok(()),
            Ok(Some(_)) => break Err("aria2c 下载或检查失败，请检查链接、程序和所选出口".into()),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            Ok(None) => break Err("aria2c 超时".into()),
            Err(_) => break Err("无法读取 aria2c 状态".into()),
        }
    };
    if result.is_err() {
        let _ = child.kill();
        let _ = child.wait();
    }
    result
}

fn aria_download(
    url: Url,
    path: &Path,
    config: &Value,
    max: u64,
    total: Duration,
    idle: Duration,
    progress: &mut impl FnMut(Option<&str>, TransferProgress),
) -> Result<(Option<String>, u64), String> {
    let mut command = aria_command(config)?;
    if let Some(proxy) = config["resolved_proxy_url"].as_str() {
        command.env("http_proxy", proxy).env("https_proxy", proxy);
    }
    command
        .current_dir(path.parent().ok_or("下载目录无效")?)
        .args([
            "--no-conf=true",
            "--enable-rpc=false",
            "--no-netrc=true",
            "--follow-torrent=false",
            "--follow-metalink=false",
            "--file-allocation=none",
            "--enable-mmap=false",
            "--disk-cache=0",
            "--continue=false",
            "--auto-file-renaming=false",
            "--allow-overwrite=false",
            "--max-tries=1",
            "--split=1",
            "--max-connection-per-server=1",
            "--check-certificate=true",
            "--enable-color=false",
            "--human-readable=false",
            "--summary-interval=1",
            "--show-console-readout=false",
            "--console-log-level=error",
            "--download-result=hide",
        ])
        .arg(format!("--timeout={}", idle.as_secs()))
        .arg(format!("--connect-timeout={}", idle.as_secs()))
        .arg("--dir")
        .arg(path.parent().ok_or("下载目录无效")?)
        .arg("--out")
        .arg(path.file_name().ok_or("下载文件名无效")?)
        .arg("--")
        .arg(url.as_str());
    let name = url_name(&url);
    wait_child(command, path, max, total, |sample| {
        progress(name.as_deref(), sample)
    })?;
    let file = fs::OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(io_error)?;
    let size = file.metadata().map_err(io_error)?.len();
    if size > max {
        return Err("文件超过大小限制".into());
    }
    file.sync_all().map_err(io_error)?;
    Ok((name, size))
}

fn fetch(
    url: Url,
    path: &Path,
    config: &Value,
    max: u64,
    total: Duration,
    idle: Duration,
    progress: &mut impl FnMut(Option<&str>, TransferProgress),
) -> Result<(Option<String>, u64), String> {
    if let Some(error) = config["route_error"].as_str() {
        return Err(error.into());
    }
    if !file_url(&url) {
        return Err("仅支持无内嵌凭据的 HTTP(S) 文件直链".into());
    }
    if config["download_engine"] == "aria2c" {
        aria_download(url, path, config, max, total, idle, progress)
    } else {
        http_download(url, path, config, max, total, idle, progress)
    }
}

struct Staging(PathBuf);
impl Drop for Staging {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn staging_path(dir: &Path, request: &InvokeRequest, input: &TaskInput) -> PathBuf {
    let hash = Sha256::digest(format!("{}:{}", request.state_dir, input.item_id).as_bytes());
    dir.join(format!(".transfer-genie-{hash:x}"))
}

pub fn cleanup_download(request: &InvokeRequest) {
    if request.protocol_version != 2 {
        return;
    }
    if let Some(directory) = request.config["download_dir"]
        .as_str()
        .filter(|p| Path::new(p).is_absolute())
    {
        for item in &request.inputs {
            let _ = fs::remove_dir_all(staging_path(Path::new(directory), request, item));
        }
    }
}

pub fn check_download(config: &Value, check_engine: bool) -> Result<String, String> {
    if check_engine {
        let mut command = aria_command(config)?;
        command.arg("--version").stdout(Stdio::piped());
        let mut child = command
            .spawn()
            .map_err(|_| "无法启动 aria2c，请检查程序路径")?;
        let stdout = child.stdout.take().ok_or("无法读取 aria2c 版本")?;
        let reader = std::thread::spawn(move || {
            let mut data = Vec::new();
            let _ = stdout.take(64 * 1024).read_to_end(&mut data);
            data
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break Some(status),
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(25))
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break None;
                }
            }
        };
        let data = reader.join().map_err(|_| "无法读取 aria2c 版本")?;
        let version = String::from_utf8_lossy(&data);
        let version = version
            .lines()
            .next()
            .filter(|line| line.starts_with("aria2 version "));
        if let (Some(status), Some(version)) = (status, version) {
            if status.success() {
                return Ok(version.chars().take(120).collect());
            }
        }
        return Err("所选程序未返回有效的 aria2c 版本".into());
    }
    let staging = Staging(
        std::env::temp_dir().join(format!("transfer-genie-proxy-{}", uuid::Uuid::new_v4())),
    );
    fs::create_dir(&staging.0).map_err(io_error)?;
    let mut config = config.clone();
    config["connection_check"] = Value::Bool(true);
    fetch(
        Url::parse("https://example.com/").unwrap(),
        &staging.0.join("test.html"),
        &config,
        1024 * 1024,
        Duration::from_secs(12),
        Duration::from_secs(8),
        &mut |_, _| {},
    )?;
    Ok("代理连接成功".into())
}

fn extension(name: &str) -> &str {
    Path::new(name)
        .extension()
        .and_then(|part| part.to_str())
        .unwrap_or_default()
}

fn sanitize(name: &str, limit: usize) -> String {
    let mut result = String::new();
    for c in name.chars() {
        let c = if c.is_control() || "<>:\"/\\|?*".contains(c) {
            '_'
        } else {
            c
        };
        if result.len() + c.len_utf8() > limit {
            break;
        }
        result.push(c);
    }
    result.trim_matches(['.', ' ']).into()
}

pub(super) fn target_name(name: &str, rule: &str, timestamp: i64) -> String {
    let cleaned = sanitize(name, 4096);
    let original = if cleaned.is_empty() {
        "文件"
    } else {
        &cleaned
    };
    let rendered = crate::save_filename::build_save_filename(rule, original, timestamp);
    let rendered = sanitize(&rendered, 4096);
    let stem = Path::new(&rendered)
        .file_stem()
        .and_then(|part| part.to_str())
        .unwrap_or_default();
    let mut base = sanitize(stem, 170);
    if base.is_empty() {
        base = "文件".into();
    }
    let upper = base
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    if ["CON", "PRN", "AUX", "NUL"].contains(&upper.as_str())
        || upper.len() == 4
            && (upper.starts_with("COM") || upper.starts_with("LPT"))
            && upper.as_bytes()[3].is_ascii_digit()
    {
        base.insert(0, '_');
    }
    let ext = sanitize(extension(&rendered), 32);
    if ext.is_empty() {
        base
    } else {
        format!("{base}.{ext}")
    }
}

pub(super) fn process(
    input: &TaskInput,
    req: &InvokeRequest,
    progress: &mut impl FnMut(Option<&str>, TransferProgress),
) -> Result<ItemResult, String> {
    let journal = Path::new(&req.state_dir).join(format!(
        "{:x}.json",
        Sha256::digest(input.item_id.as_bytes())
    ));
    if let Ok(result) = fs::read(&journal)
        .and_then(|data| serde_json::from_slice::<ItemResult>(&data).map_err(io::Error::other))
    {
        if let (Some(path), Some(hash)) = (&result.saved_path, &result.sha256) {
            if file_hash(Path::new(path), result.size).as_ref() == Some(hash) {
                return Ok(result);
            }
        }
    }
    if let Some(error) = &input.error {
        return Err(error.clone());
    }
    let dir = Path::new(req.config["download_dir"].as_str().unwrap_or_default());
    if !dir.is_absolute() {
        return Err("请设置绝对路径的下载目录".into());
    }
    fs::create_dir_all(dir).map_err(io_error)?;
    let dir = fs::canonicalize(dir).map_err(io_error)?;
    fs::create_dir_all(&req.state_dir).map_err(io_error)?;
    let staging = Staging(staging_path(&dir, req, input));
    if staging.0.exists() {
        fs::remove_dir_all(&staging.0).map_err(io_error)?;
    }
    fs::create_dir(&staging.0).map_err(io_error)?;
    let temp = staging.0.join("file.part");
    let max = setting(&req.config, "max_size_mib", 2048, 102400) * 1024 * 1024;
    let total = Duration::from_secs(setting(&req.config, "timeout_seconds", 600, 600));
    let idle = Duration::from_secs(setting(&req.config, "idle_timeout_seconds", 30, 30));
    let (name, size) = if let Some(path) = &input.local_path {
        let mut file = File::create(&temp).map_err(io_error)?;
        let size = copy_bounded(
            File::open(path).map_err(io_error)?,
            &mut file,
            max,
            Instant::now() + total,
        )?;
        file.sync_all().map_err(io_error)?;
        (input.name.clone(), size)
    } else if let Some(url) = &input.url {
        let (name, size) = fetch(
            Url::parse(url).map_err(|_| "文件直链无效")?,
            &temp,
            &req.config,
            max,
            total,
            idle,
            progress,
        )?;
        let name = name.unwrap_or_else(|| input.name.clone());
        let mut prefix = [0; 512];
        let count = File::open(&temp)
            .map_err(io_error)?
            .read(&mut prefix)
            .map_err(io_error)?;
        let start = String::from_utf8_lossy(&prefix[..count])
            .trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
            .to_ascii_lowercase();
        if (start.starts_with("<!doctype html") || start.starts_with("<html"))
            && !matches!(
                extension(&name).to_ascii_lowercase().as_str(),
                "html" | "htm"
            )
        {
            return Err("链接返回网页，请提供文件直链".into());
        }
        (name, size)
    } else {
        return Err("没有可下载的内容".into());
    };
    if matches!(
        extension(&name).to_ascii_lowercase().as_str(),
        "png" | "jpeg" | "jpg" | "webp" | "bmp" | "gif" | "tiff"
    ) {
        let mut reader = image::io::Reader::open(&temp)
            .map_err(io_error)?
            .with_guessed_format()
            .map_err(io_error)?;
        let mut limits = image::io::Limits::default();
        limits.max_image_width = Some(32768);
        limits.max_image_height = Some(32768);
        limits.max_alloc = Some(256 * 1024 * 1024);
        reader.limits(limits);
        reader.decode().map_err(|_| "图片内容无效或尺寸超限")?;
    }
    let digest = file_hash(&temp, size).ok_or("下载文件读取或校验失败")?;
    let name = target_name(
        &name,
        req.config["save_filename_rule"]
            .as_str()
            .unwrap_or_default(),
        input.timestamp_ms.unwrap_or_default(),
    );
    let stem = Path::new(&name).file_stem().unwrap().to_string_lossy();
    let ext = extension(&name);
    let _lock = super::PUBLICATION.lock().map_err(|_| "下载发布状态异常")?;
    for index in 0..10000 {
        let filename = if index == 0 {
            name.clone()
        } else if ext.is_empty() {
            format!("{stem} ({index})")
        } else {
            format!("{stem} ({index}).{ext}")
        };
        let path = dir.join(&filename);
        let existing = match fs::symlink_metadata(&path) {
            Ok(_) if file_hash(&path, size).as_ref() == Some(&digest) => true,
            Ok(_) => continue,
            Err(error) if error.kind() == io::ErrorKind::NotFound => false,
            Err(error) => return Err(io_error(error)),
        };
        let result = ItemResult {
            item_id: input.item_id.clone(),
            name: filename,
            status: "succeeded".into(),
            saved_path: Some(path.to_string_lossy().into()),
            sha256: Some(digest.clone()),
            size,
            error: None,
        };
        let journal_tmp = journal.with_extension("tmp");
        {
            let mut file = File::create(&journal_tmp).map_err(io_error)?;
            serde_json::to_writer(&mut file, &result).map_err(|_| "无法记录下载结果")?;
            file.sync_all().map_err(io_error)?;
        }
        fs::rename(&journal_tmp, &journal).map_err(io_error)?;
        if !existing {
            match fs::hard_link(&temp, &path) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(io_error(error)),
            }
        }
        return Ok(result);
    }
    Err("无法找到可用文件名".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::net::{TcpListener, TcpStream};

    fn incoming(mut socket: &TcpStream) -> String {
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut request = Vec::new();
        while !request.ends_with(b"\r\n\r\n") {
            let mut byte = [0];
            socket.read_exact(&mut byte).unwrap();
            request.push(byte[0]);
        }
        String::from_utf8(request).unwrap()
    }

    #[test]
    fn streams_large_originals_and_recovers_without_replacing_existing_files() {
        let staging =
            Staging(std::env::temp_dir().join(format!("tg-download-{}", uuid::Uuid::new_v4())));
        let root = &staging.0;
        let downloads = root.join("downloads");
        fs::create_dir_all(&downloads).unwrap();
        let source = root.join("original");
        File::create(&source)
            .unwrap()
            .set_len(101 * 1024 * 1024)
            .unwrap();
        fs::write(downloads.join("20240101_movie.mp4"), b"existing").unwrap();
        let input = TaskInput {
            timestamp_ms: Some(1_704_067_200_000),
            item_id: "video".into(),
            name: "movie.mp4".into(),
            local_path: Some(source.to_string_lossy().into()),
            url: None,
            error: None,
        };
        let mut request = InvokeRequest {
            protocol_version: 2,
            kind: "invoke".into(),
            request_id: "r".into(),
            task_id: "t".into(),
            text: String::new(),
            config: json!({"download_dir":downloads,"max_size_mib":100,"save_filename_rule":"{yyyymmdd}_{filename}.{file_suffix}"}),
            inputs: vec![input.clone()],
            state_dir: root.join("journal").to_string_lossy().into(),
        };
        assert!(process(&input, &request, &mut |_, _| {})
            .unwrap_err()
            .contains("大小限制"));
        request.config["max_size_mib"] = json!(102);
        let result = process(&input, &request, &mut |_, _| {}).unwrap();
        assert_eq!(result.name, "20240101_movie (1).mp4");
        assert_eq!(result.size, 101 * 1024 * 1024);
        fs::remove_file(source).unwrap();
        assert_eq!(
            process(&input, &request, &mut |_, _| {}).unwrap().sha256,
            result.sha256
        );
        assert_eq!(
            fs::read(downloads.join("20240101_movie.mp4")).unwrap(),
            b"existing"
        );
        assert_eq!(fs::read_dir(downloads).unwrap().count(), 2);
    }

    #[test]
    fn builtin_uses_named_proxy_and_propagates_authentication_error() {
        let staging =
            Staging(std::env::temp_dir().join(format!("tg-proxy-{}", uuid::Uuid::new_v4())));
        fs::create_dir(&staging.0).unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let proxy = format!("http://{}", listener.local_addr().unwrap());
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            assert!(incoming(&socket)
                .starts_with("GET http://unreachable.invalid/file.zip HTTP/1.1\r\n"));
            socket.write_all(b"HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
        });
        let result = fetch(
            Url::parse("http://unreachable.invalid/file.zip").unwrap(),
            &staging.0.join("file"),
            &json!({"resolved_proxy_url":proxy}),
            1024,
            Duration::from_secs(3),
            Duration::from_secs(2),
            &mut |_, _| {},
        );
        assert_eq!(result.unwrap_err(), "代理认证失败");
        worker.join().unwrap();
    }

    #[test]
    fn both_engines_report_bytes_and_speed_with_or_without_a_total() {
        let mut engines = vec![json!({})];
        if let Some(aria) = std::env::var_os("TG_TEST_ARIA2C") {
            engines.push(json!({"aria2c_path":Path::new(&aria).to_string_lossy(),"download_engine":"aria2c"}));
        }
        let staging =
            Staging(std::env::temp_dir().join(format!("tg-progress-{}", uuid::Uuid::new_v4())));
        fs::create_dir(&staging.0).unwrap();
        let path = staging.0.join("file.part");
        for engine in engines {
            for total in [Some(32_768), None] {
                let listener = TcpListener::bind("127.0.0.1:0").unwrap();
                let address = listener.local_addr().unwrap();
                let worker = std::thread::spawn(move || {
                    let (mut socket, _) = listener.accept().unwrap();
                    assert!(incoming(&socket).starts_with("GET /progress.zip "));
                    write!(socket, "HTTP/1.1 200 OK\r\nConnection: close\r\n").unwrap();
                    if let Some(total) = total {
                        write!(socket, "Content-Length: {total}\r\n").unwrap();
                    }
                    write!(socket, "\r\n").unwrap();
                    for _ in 0..8 {
                        socket.write_all(&[0; 4096]).unwrap();
                        std::thread::sleep(Duration::from_millis(320));
                    }
                });
                let mut samples = Vec::new();
                let (name, size) = fetch(
                    Url::parse(&format!("http://{address}/progress.zip")).unwrap(),
                    &path,
                    &engine,
                    64 * 1024,
                    Duration::from_secs(10),
                    Duration::from_secs(5),
                    &mut |name, sample| {
                        assert_eq!(name, Some("progress.zip"));
                        samples.push(sample);
                    },
                )
                .unwrap();
                worker.join().unwrap();
                assert_eq!(name.as_deref(), Some("progress.zip"));
                assert_eq!(size, 32_768);
                assert!(
                    samples.iter().any(|sample| sample.received_bytes > 0
                        && sample.received_bytes < size
                        && sample.bytes_per_second > 0),
                    "{engine}: {samples:?}"
                );
                assert!(samples.iter().all(|sample| sample.total_bytes == total));
                fs::remove_file(&path).unwrap();
            }
        }
    }

    #[test]
    fn aria2c_downloads_with_a_real_executable_if_configured() {
        let Some(aria) = std::env::var_os("TG_TEST_ARIA2C") else {
            return;
        };
        let staging =
            Staging(std::env::temp_dir().join(format!("tg-aria {}", uuid::Uuid::new_v4())));
        fs::create_dir(&staging.0).unwrap();
        let config =
            json!({"aria2c_path":Path::new(&aria).to_string_lossy(),"download_engine":"aria2c"});
        assert!(check_download(&config, true)
            .unwrap()
            .starts_with("aria2 version "));
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            assert!(incoming(&socket).starts_with("GET /demo.zip "));
            socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 3\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\nzip").unwrap();
        });
        let path = staging.0.join("file");
        let result = fetch(
            Url::parse(&format!("http://{address}/demo.zip")).unwrap(),
            &path,
            &config,
            1024,
            Duration::from_secs(5),
            Duration::from_secs(3),
            &mut |_, _| {},
        )
        .unwrap();
        assert_eq!(result, (Some("demo.zip".into()), 3));
        assert_eq!(fs::read(path).unwrap(), b"zip");
        worker.join().unwrap();

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let mut config = config;
        config["resolved_proxy_url"] = json!(format!(
            "http://fixture:secret@{}",
            listener.local_addr().unwrap()
        ));
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let request = incoming(&socket);
            assert!(request.starts_with("GET http://unreachable.invalid/through.zip "));
            assert!(request
                .to_ascii_lowercase()
                .contains("proxy-authorization: basic zml4dhvyztpzzwnyzxq="));
            socket
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nproxy",
                )
                .unwrap();
        });
        let path = staging.0.join("proxied");
        fetch(
            Url::parse("http://unreachable.invalid/through.zip").unwrap(),
            &path,
            &config,
            1024,
            Duration::from_secs(5),
            Duration::from_secs(3),
            &mut |_, _| {},
        )
        .unwrap();
        assert_eq!(fs::read(path).unwrap(), b"proxy");
        worker.join().unwrap();

        config.as_object_mut().unwrap().remove("resolved_proxy_url");
        for (reply_size, stalled, expected) in [(4096, false, "大小限制"), (3, true, "超时")]
        {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let worker = std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                let _ = incoming(&socket);
                write!(
                    socket,
                    "HTTP/1.1 200 OK\r\nContent-Length: {reply_size}\r\nConnection: close\r\n\r\n"
                )
                .unwrap();
                if stalled {
                    // The child must close the socket once the total deadline expires.
                    match socket.read(&mut [0; 1]) {
                        Ok(0) => {}
                        Err(error) if error.kind() == io::ErrorKind::ConnectionReset => {}
                        other => panic!("download socket remained open: {other:?}"),
                    }
                } else {
                    socket.write_all(&vec![0; reply_size]).unwrap();
                }
            });
            let path = staging.0.join(format!("limited-{reply_size}"));
            let error = fetch(
                Url::parse(&format!("http://{address}/demo.zip")).unwrap(),
                &path,
                &config,
                1024,
                Duration::from_secs(1),
                Duration::from_secs(3),
                &mut |_, _| {},
            )
            .unwrap_err();
            assert!(error.contains(expected), "{error}");
            worker.join().unwrap();
        }
    }
}
