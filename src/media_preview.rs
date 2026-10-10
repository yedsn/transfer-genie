use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

pub const FFMPEG_BUNDLE_VERSION: &str = "6.1.1";
pub const PREVIEW_MAX_EDGE: u32 = 480;
pub const VIDEO_FRAME_TIMEOUT: Duration = Duration::from_secs(20);
pub const PREVIEW_GENERATION_CONCURRENCY: usize = 2;
const FFMPEG_ERROR_LIMIT: u64 = 16 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaPreviewKind {
    Image,
    Video,
}

pub fn media_preview_kind(name: &str) -> Option<MediaPreviewKind> {
    let extension = Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "avif" => Some(MediaPreviewKind::Image),
        "mp4" | "mov" | "mkv" | "avi" | "webm" | "m4v" | "wmv" | "flv" => {
            Some(MediaPreviewKind::Video)
        }
        _ => None,
    }
}

pub fn media_resource_key(endpoint_id: &str, filename: &str, variant: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(endpoint_id.as_bytes());
    hasher.update([0]);
    hasher.update(filename.as_bytes());
    hasher.update([0]);
    hasher.update(variant.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn media_playback_cache_path(
    endpoint_dir: &Path,
    endpoint_id: &str,
    filename: &str,
    original_name: &str,
    variant: &str,
) -> PathBuf {
    let extension = Path::new(original_name)
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .map(|value| format!(".{}", value.to_ascii_lowercase()))
        .unwrap_or_default();
    endpoint_dir.join("media-preview").join(format!(
        "{}{}",
        media_resource_key(endpoint_id, filename, variant),
        extension
    ))
}

fn ffmpeg_candidates(current_exe: Option<&Path>, executable_name: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(parent) = current_exe.and_then(Path::parent) {
        candidates.push(parent.join(executable_name));
        candidates.push(parent.join("tools").join("ffmpeg").join(executable_name));
        candidates.push(
            parent
                .join("resources")
                .join("tools")
                .join("ffmpeg")
                .join(executable_name),
        );
        candidates.push(
            parent
                .join("..")
                .join("Resources")
                .join("tools")
                .join("ffmpeg")
                .join(executable_name),
        );
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tools")
            .join("ffmpeg")
            .join(executable_name),
    );
    candidates
}

pub fn resolve_ffmpeg_path() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("TRANSFER_GENIE_FFMPEG").map(PathBuf::from) {
        if path.is_file() {
            return Some(path);
        }
    }

    let executable_name = if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    let current_exe = std::env::current_exe().ok();
    let candidates = ffmpeg_candidates(current_exe.as_deref(), executable_name);
    if let Some(path) = candidates.into_iter().find(|path| path.is_file()) {
        return Some(path);
    }

    Command::new(executable_name)
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()
        .filter(|status| status.success())
        .map(|_| PathBuf::from(executable_name))
}

pub fn generate_image_preview(source_path: &Path, output_path: &Path) -> Result<(), String> {
    use image::io::Reader as ImageReader;

    let image = ImageReader::open(source_path)
        .map_err(|err| format!("读取图片失败: {err}"))?
        .with_guessed_format()
        .map_err(|err| format!("识别图片格式失败: {err}"))?
        .decode()
        .map_err(|err| format!("图片解码失败: {err}"))?;
    let preview = image.thumbnail(PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建预览目录失败: {err}"))?;
    }
    let mut encoded = Cursor::new(Vec::new());
    preview
        .write_to(&mut encoded, image::ImageFormat::Jpeg)
        .map_err(|err| format!("图片预览编码失败: {err}"))?;
    fs::write(output_path, encoded.into_inner()).map_err(|err| format!("写入图片预览失败: {err}"))
}

pub fn generate_video_preview_with(
    ffmpeg_path: &Path,
    source_path: &Path,
    output_path: &Path,
    timeout: Duration,
) -> Result<(), String> {
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建预览目录失败: {err}"))?;
    }
    let error_path = output_path.with_extension("ffmpeg-error.log");
    let error_file =
        fs::File::create(&error_path).map_err(|err| format!("创建 FFmpeg 错误日志失败: {err}"))?;
    let extension = ffmpeg_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let mut command = if cfg!(windows) && extension.eq_ignore_ascii_case("ps1") {
        let mut command = Command::new("powershell.exe");
        command
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(ffmpeg_path);
        command
    } else if cfg!(windows)
        && (extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("bat"))
    {
        let mut command = Command::new("cmd.exe");
        command
            .args(["/D", "/S", "/C"])
            .arg(format!("\"{}\"", ffmpeg_path.display()));
        command
    } else {
        Command::new(ffmpeg_path)
    };
    let mut child = command
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-y",
            "-ss",
            "00:00:00.500",
            "-i",
        ])
        .arg(source_path)
        .args([
            "-frames:v",
            "1",
            "-vf",
            "scale=min(480\\,iw):-2:force_original_aspect_ratio=decrease",
            "-q:v",
            "4",
        ])
        .arg(output_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::from(error_file))
        .spawn()
        .map_err(|err| format!("启动 FFmpeg 失败: {err}"))?;

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() && output_path.is_file() => {
                let _ = fs::remove_file(&error_path);
                return Ok(());
            }
            Ok(Some(status)) => {
                let mut stderr = Vec::new();
                let _ = fs::File::open(&error_path)
                    .and_then(|file| file.take(FFMPEG_ERROR_LIMIT).read_to_end(&mut stderr));
                let stderr = String::from_utf8_lossy(&stderr).trim().to_string();
                let _ = fs::remove_file(&error_path);
                let _ = fs::remove_file(output_path);
                return Err(if stderr.is_empty() {
                    format!("FFmpeg 提取视频封面失败: {status}")
                } else {
                    format!("FFmpeg 提取视频封面失败: {stderr}")
                });
            }
            Ok(None) if started.elapsed() < timeout => thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = fs::remove_file(output_path);
                let _ = fs::remove_file(&error_path);
                return Err(format!(
                    "FFmpeg 提取视频封面超时（{} 秒）",
                    timeout.as_secs()
                ));
            }
            Err(err) => {
                let _ = child.kill();
                let _ = fs::remove_file(output_path);
                let _ = fs::remove_file(&error_path);
                return Err(format!("等待 FFmpeg 失败: {err}"));
            }
        }
    }
}

pub fn generate_media_preview(
    source_path: &Path,
    original_name: &str,
    output_path: &Path,
) -> Result<bool, String> {
    match media_preview_kind(original_name) {
        Some(MediaPreviewKind::Image) => {
            generate_image_preview(source_path, output_path)?;
            Ok(true)
        }
        Some(MediaPreviewKind::Video) => {
            let ffmpeg = resolve_ffmpeg_path().ok_or_else(|| {
                format!("未找到 FFmpeg {FFMPEG_BUNDLE_VERSION}，视频已发送但无法生成预览图")
            })?;
            generate_video_preview_with(&ffmpeg, source_path, output_path, VIDEO_FRAME_TIMEOUT)?;
            Ok(true)
        }
        None => Ok(false),
    }
}

pub fn run_preview_generator<F>(generator: F) -> Result<bool, String>
where
    F: FnOnce() -> Result<bool, String>,
{
    generator()
}

pub fn preview_generation_semaphore() -> Arc<tokio::sync::Semaphore> {
    static SEMAPHORE: OnceLock<Arc<tokio::sync::Semaphore>> = OnceLock::new();
    Arc::clone(
        SEMAPHORE
            .get_or_init(|| Arc::new(tokio::sync::Semaphore::new(PREVIEW_GENERATION_CONCURRENCY))),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};
    use rand::Rng;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "transfer-genie-media-preview-{name}-{:016x}",
            rand::thread_rng().gen::<u64>()
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn classifies_supported_preview_types() {
        assert_eq!(
            media_preview_kind("photo.PNG"),
            Some(MediaPreviewKind::Image)
        );
        assert_eq!(
            media_preview_kind("clip.webm"),
            Some(MediaPreviewKind::Video)
        );
        assert_eq!(media_preview_kind("song.mp3"), None);
        assert_eq!(media_preview_kind("document.pdf"), None);
    }

    #[test]
    fn resource_keys_and_playback_paths_are_stable_and_endpoint_scoped() {
        let root = Path::new("cache");
        let first = media_playback_cache_path(root, "endpoint-a", "message", "Movie.MP4", "file");
        let same = media_playback_cache_path(root, "endpoint-a", "message", "Movie.MP4", "file");
        let other = media_playback_cache_path(root, "endpoint-b", "message", "Movie.MP4", "file");
        assert_eq!(first, same);
        assert_ne!(first, other);
        assert_eq!(
            first.extension().and_then(|value| value.to_str()),
            Some("mp4")
        );
        assert!(first.starts_with(root.join("media-preview")));
    }

    #[test]
    fn ffmpeg_candidates_cover_windows_and_macos_bundle_layouts() {
        let windows_exe = Path::new(r"C:\Program Files\Transfer Genie\transfer-genie.exe");
        let windows = ffmpeg_candidates(Some(windows_exe), "ffmpeg.exe");
        assert!(windows.contains(&PathBuf::from(
            r"C:\Program Files\Transfer Genie\tools\ffmpeg\ffmpeg.exe"
        )));

        let macos_exe = Path::new("/Applications/Transfer Genie.app/Contents/MacOS/transfer-genie");
        let macos = ffmpeg_candidates(Some(macos_exe), "ffmpeg");
        assert!(macos.contains(&PathBuf::from(
            "/Applications/Transfer Genie.app/Contents/MacOS/../Resources/tools/ffmpeg/ffmpeg"
        )));
    }

    #[test]
    fn image_preview_is_jpeg_and_respects_max_edge() {
        let dir = temp_dir("image");
        let source = dir.join("input image.png");
        let output = dir.join("nested").join("preview.jpg");
        ImageBuffer::from_pixel(900, 300, Rgb([255u8, 80, 20]))
            .save(&source)
            .expect("save source image");
        assert!(generate_media_preview(&source, "input image.png", &output).unwrap());
        let preview = image::open(&output).expect("open preview");
        assert!(preview.width() <= PREVIEW_MAX_EDGE);
        assert!(preview.height() <= PREVIEW_MAX_EDGE);
        assert_eq!(
            image::ImageFormat::from_path(&output).unwrap(),
            image::ImageFormat::Jpeg
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn non_media_does_not_create_preview() {
        let dir = temp_dir("non-media");
        let source = dir.join("document.txt");
        let output = dir.join("preview.jpg");
        fs::write(&source, b"hello").unwrap();
        assert!(!generate_media_preview(&source, "document.txt", &output).unwrap());
        assert!(!output.exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn preview_generation_error_is_reported_to_background_caller() {
        let result = run_preview_generator(|| Err("decoder failed".to_string()));
        assert_eq!(result.unwrap_err(), "decoder failed");
    }

    #[tokio::test]
    async fn preview_generation_concurrency_is_bounded() {
        let semaphore = preview_generation_semaphore();
        assert_eq!(
            semaphore.available_permits(),
            PREVIEW_GENERATION_CONCURRENCY
        );
        let first = semaphore.clone().acquire_owned().await.unwrap();
        let second = semaphore.clone().acquire_owned().await.unwrap();
        assert_eq!(semaphore.available_permits(), 0);
        let blocked =
            tokio::time::timeout(Duration::from_millis(30), semaphore.clone().acquire_owned())
                .await;
        assert!(blocked.is_err());
        drop(first);
        assert!(semaphore.try_acquire().is_ok());
        drop(second);
    }

    #[cfg(windows)]
    fn write_fake_ffmpeg(path: &Path, body: &str) {
        fs::write(path, body).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn video_preview_accepts_paths_with_spaces_and_outputs_jpeg() {
        let dir = temp_dir("video success with spaces");
        let fixture = dir.join("frame fixture.jpg");
        ImageBuffer::from_pixel(64, 32, Rgb([30u8, 120, 240]))
            .save(&fixture)
            .unwrap();
        let script = dir.join("fake ffmpeg.ps1");
        write_fake_ffmpeg(
            &script,
            &format!(
                "$outputPath = $args[-1]\nCopy-Item -LiteralPath '{}' -Destination $outputPath -Force",
                fixture.display().to_string().replace('\'', "''")
            ),
        );
        let source = dir.join("input clip.mp4");
        let output = dir.join("preview output.jpg");
        fs::write(&source, b"fixture").unwrap();
        generate_video_preview_with(&script, &source, &output, Duration::from_secs(2)).unwrap();
        assert_eq!(
            image::ImageFormat::from_path(&output).unwrap(),
            image::ImageFormat::Jpeg
        );
        assert!(image::open(&output).is_ok());
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(windows)]
    #[test]
    fn video_preview_reports_failure_and_removes_partial_output() {
        let dir = temp_dir("video-failure");
        let script = dir.join("fake-failure.ps1");
        write_fake_ffmpeg(
            &script,
            "[Console]::Error.WriteLine('controlled failure')\nexit 9",
        );
        let source = dir.join("broken.mp4");
        let output = dir.join("preview.jpg");
        fs::write(&source, b"broken").unwrap();
        let error = generate_video_preview_with(&script, &source, &output, Duration::from_secs(2))
            .unwrap_err();
        assert!(error.contains("controlled failure"));
        assert!(!output.exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(windows)]
    #[test]
    fn video_preview_times_out_and_removes_partial_output() {
        let dir = temp_dir("video-timeout");
        let script = dir.join("fake-timeout.ps1");
        write_fake_ffmpeg(&script, "Start-Sleep -Seconds 3");
        let source = dir.join("slow.mp4");
        let output = dir.join("preview.jpg");
        fs::write(&source, b"slow").unwrap();
        let error =
            generate_video_preview_with(&script, &source, &output, Duration::from_millis(100))
                .unwrap_err();
        assert!(error.contains("超时"));
        assert!(!output.exists());
        let _ = fs::remove_dir_all(dir);
    }
}
