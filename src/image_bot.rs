use crate::plugin_protocol::{InvokeRequest, ItemResult, TaskInput, PROTOCOL_VERSION};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{BufRead, Read, Write},
    path::{Path, PathBuf},
};

const MAX_BYTES: u64 = 100 * 1024 * 1024;
static PUBLICATION: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn limit(config: &serde_json::Value, key: &str, default: u64, ceiling: u64) -> u64 {
    config[key].as_u64().unwrap_or(default).clamp(1, ceiling)
}
fn download_url(url: url::Url, config: &serde_json::Value) -> Result<Vec<u8>, String> {
    let max_bytes = limit(config, "max_size_mib", 100, 100) * 1024 * 1024;
    let total_seconds = limit(config, "timeout_seconds", 600, 600);
    let idle_seconds = limit(config, "idle_timeout_seconds", 30, 30);
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?;
    runtime.block_on(async move {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(total_seconds))
            .connect_timeout(std::time::Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .map_err(|e| e.to_string())?;
        let mut response = client
            .get(url)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|_| "图片链接下载失败".to_string())?;
        if response.content_length().unwrap_or(0) > max_bytes {
            return Err("图片超过大小限制".into());
        }
        let mut data = Vec::new();
        loop {
            let chunk = tokio::time::timeout(
                std::time::Duration::from_secs(idle_seconds),
                response.chunk(),
            )
            .await
            .map_err(|_| "图片响应超过无数据时限".to_string())?
            .map_err(|_| "读取图片响应失败".to_string())?;
            let Some(chunk) = chunk else {
                break;
            };
            if data.len().saturating_add(chunk.len()) as u64 > max_bytes {
                return Err("图片超过大小限制".into());
            }
            data.extend_from_slice(&chunk);
        }
        Ok(data)
    })
}

fn safe_name(name: &str, extension: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(160)
        .collect();
    let stem = Path::new(&cleaned)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image")
        .trim_matches(['.', ' ']);
    let upper = stem.to_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL"].contains(&upper.as_str())
        || (upper.len() == 4
            && (upper.starts_with("COM") || upper.starts_with("LPT"))
            && upper.as_bytes()[3].is_ascii_digit());
    format!(
        "{}{}.{}",
        if reserved { "_" } else { "" },
        if stem.is_empty() { "image" } else { stem },
        extension
    )
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn process(
    input: &TaskInput,
    req: &InvokeRequest,
    _client: &reqwest::blocking::Client,
) -> Result<ItemResult, String> {
    let state_dir = PathBuf::from(&req.state_dir);
    fs::create_dir_all(&state_dir).map_err(|e| e.to_string())?;
    let journal = state_dir.join(format!("{}.json", hash(input.item_id.as_bytes())));
    if let Ok(bytes) = fs::read(&journal) {
        if let Ok(result) = serde_json::from_slice::<ItemResult>(&bytes) {
            if let (Some(path), Some(expected)) = (&result.saved_path, &result.sha256) {
                let valid_file = fs::symlink_metadata(path).is_ok_and(|metadata| {
                    metadata.is_file()
                        && !metadata.file_type().is_symlink()
                        && metadata.len() <= MAX_BYTES
                });
                if valid_file && fs::read(path).ok().map(|b| hash(&b)) == Some(expected.clone()) {
                    return Ok(result);
                }
            }
        }
    }
    if let Some(error) = &input.error {
        return Err(error.clone());
    }
    let mut data = Vec::new();
    let max_bytes = limit(&req.config, "max_size_mib", 100, 100) * 1024 * 1024;
    if let Some(path) = &input.local_path {
        let file = fs::File::open(path).map_err(|e| e.to_string())?;
        use std::io::Read;
        file.take(max_bytes + 1)
            .read_to_end(&mut data)
            .map_err(|e| e.to_string())?;
    } else if let Some(url) = &input.url {
        let parsed = url::Url::parse(url).map_err(|e| e.to_string())?;
        if !["http", "https"].contains(&parsed.scheme())
            || !parsed.username().is_empty()
            || parsed.password().is_some()
        {
            return Err("仅支持无内嵌凭据的 HTTP(S) 图片直链".into());
        }
        data = download_url(parsed, &req.config)?;
    } else {
        return Err("没有图片附件或直链".into());
    }
    if data.len() as u64 > max_bytes {
        return Err("图片超过大小限制".into());
    }
    let format = image::guess_format(&data).map_err(|_| "资源不是受支持的图片".to_string())?;
    let mut reader = image::io::Reader::with_format(std::io::Cursor::new(&data), format);
    let mut limits = image::io::Limits::default();
    limits.max_image_width = Some(32768);
    limits.max_image_height = Some(32768);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    reader
        .decode()
        .map_err(|_| "图片数据无效或尺寸超限".to_string())?;
    let ext = format.extensions_str().first().copied().unwrap_or("img");
    let directory = req
        .config
        .get("download_dir")
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
        .ok_or("请配置下载目录")?;
    let directory = PathBuf::from(directory);
    if !directory.is_absolute() {
        return Err("下载目录必须为绝对路径".into());
    }
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let directory = fs::canonicalize(directory).map_err(|e| e.to_string())?;
    // Network and decode work run concurrently; reserve names and publish files
    // serially so two items with the same name cannot race each other.
    let _publication = PUBLICATION.lock().map_err(|e| e.to_string())?;
    let name = safe_name(&input.name, ext);
    let digest = hash(&data);
    let mut path = directory.join(&name);
    let mut selected = false;
    for n in 0..10000 {
        if n > 0 {
            path = directory.join(format!(
                "{} ({}).{}",
                Path::new(&name).file_stem().unwrap().to_string_lossy(),
                n,
                ext
            ));
        }
        match fs::symlink_metadata(&path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                selected = true;
                break;
            }
            Err(error) => return Err(error.to_string()),
            Ok(metadata)
                if metadata.is_file()
                    && !metadata.file_type().is_symlink()
                    && metadata.len() <= MAX_BYTES =>
            {
                if fs::read(&path).ok().map(|b| hash(&b)) == Some(digest.clone()) {
                    selected = true;
                    break;
                }
            }
            _ => {}
        }
    }
    if !selected {
        return Err("无法找到可用文件名".into());
    }
    let result = ItemResult {
        item_id: input.item_id.clone(),
        status: "succeeded".into(),
        name: path.file_name().unwrap().to_string_lossy().into(),
        saved_path: Some(path.to_string_lossy().into()),
        sha256: Some(digest),
        size: data.len() as u64,
        error: None,
    };
    let journal_tmp = journal.with_extension("json.tmp");
    let mut journal_file = fs::File::create(&journal_tmp).map_err(|e| e.to_string())?;
    journal_file
        .write_all(&serde_json::to_vec(&result).map_err(|e| e.to_string())?)
        .and_then(|_| journal_file.sync_all())
        .map_err(|e| e.to_string())?;
    drop(journal_file);
    if journal.exists() {
        fs::remove_file(&journal).map_err(|e| e.to_string())?;
    }
    fs::rename(&journal_tmp, &journal).map_err(|e| e.to_string())?;
    if fs::symlink_metadata(&path).is_err() {
        let temporary = directory.join(format!(".transfer-genie-{}.part", uuid::Uuid::new_v4()));
        let publish = (|| -> Result<(), String> {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|e| e.to_string())?;
            file.write_all(&data)
                .and_then(|_| file.sync_all())
                .map_err(|e| e.to_string())?;
            // Linking publishes atomically without replacing a racing existing file.
            fs::hard_link(&temporary, &path).map_err(|e| format!("发布图片失败: {e}"))?;
            Ok(())
        })();
        let _ = fs::remove_file(&temporary);
        publish?;
    }
    let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() > MAX_BYTES
        || fs::read(&path).ok().map(|b| hash(&b)).as_ref() != result.sha256.as_ref()
    {
        return Err("目标文件在保存期间发生变化，请重试".into());
    }
    Ok(result)
}

pub fn run() -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .connect_timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;
    let mut output = std::io::stdout().lock();
    writeln!(
        output,
        "{}",
        json!({"protocol_version": PROTOCOL_VERSION, "kind": "ready"})
    )
    .map_err(|e| e.to_string())?;
    output.flush().map_err(|e| e.to_string())?;
    let mut input = std::io::stdin().lock();
    loop {
        let mut line = Vec::new();
        let count = Read::by_ref(&mut input)
            .take(4 * 1024 * 1024 + 1)
            .read_until(b'\n', &mut line)
            .map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        if line.len() > 4 * 1024 * 1024 {
            return Err("请求过大".into());
        }
        let req: InvokeRequest = serde_json::from_slice(&line).map_err(|e| e.to_string())?;
        if req.protocol_version != PROTOCOL_VERSION || req.kind != "invoke" {
            return Err("无效协议请求".into());
        }
        if req.inputs.len() > 50 {
            return Err("单次任务最多 50 项".into());
        }
        let results = process_inputs(&req, &client, |result| {
            writeln!(output, "{}", json!({"protocol_version":1, "kind":"progress","request_id":req.request_id,"task_id":req.task_id,"item":result})).map_err(|e| e.to_string())?;
            output.flush().map_err(|e| e.to_string())?;
            Ok(())
        })?;
        writeln!(output, "{}", json!({"protocol_version":1,"kind":"result","request_id":req.request_id,"task_id":req.task_id,"items":results})).map_err(|e| e.to_string())?;
        output.flush().map_err(|e| e.to_string())?;
        break;
    }
    Ok(())
}
fn process_inputs(
    request: &InvokeRequest,
    client: &reqwest::blocking::Client,
    mut progress: impl FnMut(&ItemResult) -> Result<(), String>,
) -> Result<Vec<ItemResult>, String> {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc,
    };
    let next = AtomicUsize::new(0);
    let (send, receive) = mpsc::channel();
    std::thread::scope(|scope| {
        for _ in 0..request
            .inputs
            .len()
            .min(limit(&request.config, "concurrency", 2, 8) as usize)
        {
            let send = send.clone();
            let next = &next;
            scope.spawn(move || loop {
                let index = next.fetch_add(1, Ordering::Relaxed);
                let Some(input) = request.inputs.get(index) else {
                    break;
                };
                let result = process(input, request, client).unwrap_or_else(|error| ItemResult {
                    item_id: input.item_id.clone(),
                    status: "failed".into(),
                    name: input.name.clone(),
                    saved_path: None,
                    sha256: None,
                    size: 0,
                    error: Some(error),
                });
                if send.send((index, result)).is_err() {
                    break;
                }
            });
        }
        drop(send);
        let mut results = Vec::with_capacity(request.inputs.len());
        for (index, result) in receive {
            progress(&result)?;
            results.push((index, result));
        }
        results.sort_by_key(|(index, _)| *index);
        Ok(results.into_iter().map(|(_, result)| result).collect())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn batch_preserves_input_order_and_reports_each_failure_independently() {
        let root = std::env::temp_dir().join(format!("image-batch-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let source = root.join("source.png");
        image::RgbImage::new(2, 2).save(&source).unwrap();
        let request = InvokeRequest {
            protocol_version: 1,
            kind: "invoke".into(),
            request_id: "r".into(),
            task_id: "t".into(),
            text: String::new(),
            config: json!({"download_dir":root.join("downloads")}),
            state_dir: root.join("state").to_string_lossy().into(),
            inputs: vec![
                TaskInput {
                    item_id: "one".into(),
                    name: "same.png".into(),
                    local_path: Some(source.to_string_lossy().into()),
                    url: None,
                    error: None,
                },
                TaskInput {
                    item_id: "failed".into(),
                    name: "missing".into(),
                    local_path: None,
                    url: None,
                    error: Some("附件不存在".into()),
                },
                TaskInput {
                    item_id: "two".into(),
                    name: "same.png".into(),
                    local_path: Some(source.to_string_lossy().into()),
                    url: None,
                    error: None,
                },
            ],
        };
        let mut progress = Vec::new();
        let results = process_inputs(&request, &reqwest::blocking::Client::new(), |item| {
            progress.push(item.item_id.clone());
            Ok(())
        })
        .unwrap();
        assert_eq!(progress.len(), 3);
        assert_eq!(
            results
                .iter()
                .map(|item| item.item_id.as_str())
                .collect::<Vec<_>>(),
            vec!["one", "failed", "two"]
        );
        assert_eq!(results[0].status, "succeeded");
        assert_eq!(results[1].status, "failed");
        assert_eq!(results[2].saved_path, results[0].saved_path);
        assert_eq!(fs::read_dir(root.join("downloads")).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn downloads_http_originals_and_rejects_html_responses() {
        use std::io::Read;
        let root = std::env::temp_dir().join(format!("image-http-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let mut encoded = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(image::RgbImage::new(3, 2))
            .write_to(&mut encoded, image::ImageOutputFormat::Png)
            .unwrap();
        let original = encoded.into_inner();
        let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = server.local_addr().unwrap();
        let image = original.clone();
        let worker = std::thread::spawn(move || {
            for (index, connection) in server.incoming().take(2).enumerate() {
                let mut stream = connection.unwrap();
                let mut request = [0u8; 4096];
                let _ = stream.read(&mut request).unwrap();
                let body = if index == 0 {
                    image.as_slice()
                } else {
                    b"<html>not an image</html>"
                };
                write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len()).unwrap();
                stream.write_all(body).unwrap();
            }
        });
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap();
        let req = InvokeRequest {
            protocol_version: 1,
            kind: "invoke".into(),
            request_id: "r".into(),
            task_id: "t".into(),
            text: String::new(),
            config: json!({"download_dir":root.join("downloads")}),
            inputs: vec![],
            state_dir: root.join("state").to_string_lossy().into(),
        };
        let input = TaskInput {
            item_id: "image".into(),
            name: "download.png".into(),
            local_path: None,
            url: Some(format!("http://{address}/image")),
            error: None,
        };
        let result = process(&input, &req, &client).unwrap();
        assert_eq!(fs::read(result.saved_path.unwrap()).unwrap(), original);
        let invalid = TaskInput {
            item_id: "html".into(),
            name: "fake.png".into(),
            url: Some(format!("http://{address}/html")),
            ..input
        };
        assert!(process(&invalid, &req, &client)
            .unwrap_err()
            .contains("图片"));
        assert_eq!(fs::read_dir(root.join("downloads")).unwrap().count(), 1);
        worker.join().unwrap();
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn http_redirect_size_and_idle_limits_are_enforced() {
        use std::io::Read;
        let root = std::env::temp_dir().join(format!("image-limits-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = server.local_addr().unwrap();
        let worker = std::thread::spawn(move || {
            for index in 0..3 {
                let (mut stream, _) = server.accept().unwrap();
                let mut request = [0; 4096];
                let _ = stream.read(&mut request);
                match index {
                    0 => {
                        write!(stream,"HTTP/1.1 302 Found\r\nLocation: http://{address}/large\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
                    }
                    1 => {
                        write!(stream,"HTTP/1.1 200 OK\r\nContent-Length: 1048577\r\nConnection: close\r\n\r\n").unwrap();
                    }
                    _ => {
                        write!(
                            stream,
                            "HTTP/1.1 200 OK\r\nContent-Length: 10\r\nConnection: close\r\n\r\n"
                        )
                        .unwrap();
                        stream.flush().unwrap();
                        std::thread::sleep(std::time::Duration::from_millis(1400));
                    }
                }
            }
        });
        let config = json!({"max_size_mib":1,"idle_timeout_seconds":1});
        assert!(download_url(
            url::Url::parse(&format!("http://{address}/redirect")).unwrap(),
            &config
        )
        .unwrap_err()
        .contains("大小"));
        assert!(download_url(
            url::Url::parse(&format!("http://{address}/idle")).unwrap(),
            &config
        )
        .unwrap_err()
        .contains("时限"));
        worker.join().unwrap();
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn cleans_reserved_and_traversal_names() {
        assert_eq!(safe_name("CON.png", "png"), "_CON.png");
        assert!(!safe_name("../../a.png", "png").contains('/'));
    }
    #[test]
    fn saves_original_bytes_and_recovers_publication() {
        let root = std::env::temp_dir().join(format!("image-bot-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let source = root.join("source.png");
        image::RgbImage::new(2, 2).save(&source).unwrap();
        let req = InvokeRequest {
            protocol_version: 1,
            kind: "invoke".into(),
            request_id: "r".into(),
            task_id: "t".into(),
            text: String::new(),
            config: json!({"download_dir":root.join("downloads")}),
            inputs: vec![],
            state_dir: root.join("state").to_string_lossy().into(),
        };
        let input = TaskInput {
            item_id: "a".into(),
            name: "a.png".into(),
            local_path: Some(source.to_string_lossy().into()),
            url: None,
            error: None,
        };
        let client = reqwest::blocking::Client::new();
        let first = process(&input, &req, &client).unwrap();
        let second = process(&input, &req, &client).unwrap();
        assert_eq!(first.saved_path, second.saved_path);
        let unavailable = TaskInput {
            error: Some("原件已删除".into()),
            ..input.clone()
        };
        assert_eq!(
            process(&unavailable, &req, &client).unwrap().saved_path,
            second.saved_path
        );
        assert_eq!(
            fs::read(first.saved_path.unwrap()).unwrap(),
            fs::read(&source).unwrap()
        );
        let changed = image::RgbImage::from_pixel(2, 2, image::Rgb([255, 0, 0]));
        changed.save(&source).unwrap();
        let collision = TaskInput {
            item_id: "collision".into(),
            ..input.clone()
        };
        let saved_collision = process(&collision, &req, &client).unwrap();
        assert_ne!(saved_collision.saved_path, second.saved_path);
        assert_eq!(
            fs::read(saved_collision.saved_path.unwrap()).unwrap(),
            fs::read(&source).unwrap()
        );
        fs::write(&source, b"<html>bad</html>").unwrap();
        let bad = TaskInput {
            item_id: "bad".into(),
            ..input
        };
        assert!(process(&bad, &req, &client).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
