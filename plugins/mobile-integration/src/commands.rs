use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::MobileIntegrationExt;
use crate::Result;

#[command]
pub(crate) async fn diagnostic<R: Runtime>(
    app: AppHandle<R>,
    payload: DiagnosticRequest,
) -> Result<DiagnosticResponse> {
    let response = app.mobile_integration().diagnostic(payload)?;
    log::info!(
        "[mobile-integration] diagnostic request_id={} platform={} native_plugin={} main_thread={}",
        response.request_id,
        response.platform,
        response.native_plugin,
        response.main_thread
    );
    Ok(response)
}

#[command]
pub(crate) async fn set_navigation_gestures_enabled<R: Runtime>(
    app: AppHandle<R>,
    payload: NavigationGesturesRequest,
) -> Result<NavigationGesturesResponse> {
    app.mobile_integration()
        .set_navigation_gestures_enabled(payload)
}

#[command]
pub(crate) async fn navigate_native_page<R: Runtime>(
    app: AppHandle<R>,
    payload: NativePageNavigationRequest,
) -> Result<NativePageNavigationResponse> {
    app.mobile_integration().navigate_native_page(payload)
}

#[command]
pub(crate) async fn select_media<R: Runtime>(
    app: AppHandle<R>,
    payload: SelectMediaRequest,
) -> Result<SelectMediaResponse> {
    app.mobile_integration().select_media(payload)
}

#[command]
pub(crate) async fn select_documents<R: Runtime>(
    app: AppHandle<R>,
    payload: SelectDocumentsRequest,
) -> Result<SelectDocumentsResponse> {
    app.mobile_integration().select_documents(payload)
}

#[command]
pub(crate) async fn preview_file<R: Runtime>(
    app: AppHandle<R>,
    payload: LocalFileRequest,
) -> Result<PreviewFileResponse> {
    app.mobile_integration().preview_file(payload)
}

#[command]
pub(crate) async fn share_file<R: Runtime>(
    app: AppHandle<R>,
    payload: LocalFileRequest,
) -> Result<ShareFileResponse> {
    app.mobile_integration().share_file(payload)
}

#[command]
pub(crate) async fn generate_image_thumbnail<R: Runtime>(
    app: AppHandle<R>,
    payload: GenerateImageThumbnailRequest,
) -> Result<GenerateImageThumbnailResponse> {
    app.mobile_integration().generate_image_thumbnail(payload)
}

#[command]
pub(crate) async fn generate_video_poster<R: Runtime>(
    app: AppHandle<R>,
    payload: GenerateVideoPosterRequest,
) -> Result<GenerateImageThumbnailResponse> {
    app.mobile_integration().generate_video_poster(payload)
}

#[command]
pub(crate) async fn cancel_video_poster<R: Runtime>(
    app: AppHandle<R>,
    payload: CancelVideoPosterRequest,
) -> Result<CancelVideoPosterResponse> {
    app.mobile_integration().cancel_video_poster(payload)
}
