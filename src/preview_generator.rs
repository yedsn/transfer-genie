#[cfg(target_os = "ios")]
use std::path::Path;
use std::path::PathBuf;

use tauri::AppHandle;

pub async fn generate_preview(
    app_handle: Option<AppHandle>,
    source_path: PathBuf,
    original_name: String,
    output_path: PathBuf,
) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        let _ = app_handle;
        tokio::task::spawn_blocking(move || {
            crate::media_preview::generate_media_preview(&source_path, &original_name, &output_path)
        })
        .await
        .map_err(|error| format!("预览生成任务失败: {error}"))?
    }

    #[cfg(target_os = "ios")]
    {
        use tauri_plugin_mobile_integration::{
            GenerateImageThumbnailRequest, GenerateVideoPosterRequest, MobileIntegrationExt,
        };

        let Some(kind) = crate::media_preview::media_preview_kind(&original_name) else {
            return Ok(false);
        };
        let app_handle = app_handle.ok_or_else(|| "iOS 原生预览服务不可用".to_string())?;
        let generated_path = tokio::task::spawn_blocking(move || {
            let response = match kind {
                crate::media_preview::MediaPreviewKind::Image => app_handle
                    .mobile_integration()
                    .generate_image_thumbnail(GenerateImageThumbnailRequest {
                        path: source_path.to_string_lossy().to_string(),
                        max_pixel_size: Some(crate::media_preview::PREVIEW_MAX_EDGE as u16),
                    }),
                crate::media_preview::MediaPreviewKind::Video => app_handle
                    .mobile_integration()
                    .generate_video_poster(GenerateVideoPosterRequest {
                        request_id: uuid::Uuid::new_v4().to_string(),
                        path: source_path.to_string_lossy().to_string(),
                        max_pixel_size: Some(crate::media_preview::PREVIEW_MAX_EDGE as u16),
                        timeout_milliseconds: Some(
                            crate::media_preview::VIDEO_FRAME_TIMEOUT.as_millis() as u32,
                        ),
                    }),
            }
            .map_err(|error| format!("iOS 原生预览生成失败: {error}"))?;
            Ok::<PathBuf, String>(PathBuf::from(response.path))
        })
        .await
        .map_err(|error| format!("iOS 原生预览任务失败: {error}"))??;

        persist_generated_preview(&generated_path, &output_path)?;
        let _ = std::fs::remove_file(generated_path);
        Ok(true)
    }

    #[cfg(all(mobile, not(target_os = "ios")))]
    {
        let _ = (app_handle, source_path, original_name, output_path);
        Err("当前移动平台不支持原生预览生成".to_string())
    }
}

#[cfg(target_os = "ios")]
fn persist_generated_preview(source_path: &Path, output_path: &Path) -> Result<(), String> {
    let parent = output_path
        .parent()
        .ok_or_else(|| "预览目标路径无效".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| format!("创建预览目录失败: {error}"))?;
    let temporary_path =
        output_path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4().simple()));
    std::fs::copy(source_path, &temporary_path)
        .map_err(|error| format!("复制 iOS 原生预览失败: {error}"))?;
    if let Err(error) = std::fs::rename(&temporary_path, output_path) {
        let _ = std::fs::remove_file(&temporary_path);
        return Err(format!("保存 iOS 原生预览失败: {error}"));
    }
    Ok(())
}

#[cfg(all(test, desktop))]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};

    #[tokio::test]
    async fn desktop_adapter_uses_existing_image_generator() {
        let root = std::env::temp_dir().join(format!(
            "transfer-genie-preview-adapter-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("source.png");
        let output = root.join("preview.jpg");
        ImageBuffer::from_pixel(900, 300, Rgb([40u8, 120, 220]))
            .save(&source)
            .unwrap();

        assert!(
            generate_preview(None, source, "source.png".into(), output.clone())
                .await
                .unwrap()
        );
        let preview = image::open(&output).unwrap();
        assert!(preview.width() <= crate::media_preview::PREVIEW_MAX_EDGE);
        assert!(preview.height() <= crate::media_preview::PREVIEW_MAX_EDGE);
        let _ = std::fs::remove_dir_all(root);
    }
}
