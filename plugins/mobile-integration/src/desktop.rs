use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<MobileIntegration<R>> {
    Ok(MobileIntegration(app.clone()))
}

/// Access to the mobile-integration APIs.
pub struct MobileIntegration<R: Runtime>(AppHandle<R>);

impl<R: Runtime> MobileIntegration<R> {
    pub fn diagnostic(&self, payload: DiagnosticRequest) -> crate::Result<DiagnosticResponse> {
        Ok(DiagnosticResponse {
            request_id: payload.request_id,
            platform: std::env::consts::OS.into(),
            native_plugin: false,
            main_thread: true,
            can_go_back: false,
            navigation_gestures_enabled: false,
            root_scroll_enabled: false,
            root_pan_enabled: false,
        })
    }

    pub fn set_navigation_gestures_enabled(
        &self,
        _payload: NavigationGesturesRequest,
    ) -> crate::Result<NavigationGesturesResponse> {
        Ok(NavigationGesturesResponse {
            enabled: false,
            supported: false,
            can_go_back: false,
            root_scroll_enabled: false,
            root_pan_enabled: false,
        })
    }

    pub fn navigate_native_page(
        &self,
        _payload: NativePageNavigationRequest,
    ) -> crate::Result<NativePageNavigationResponse> {
        Ok(NativePageNavigationResponse {
            accepted: false,
            supported: false,
        })
    }

    pub fn select_media(&self, _payload: SelectMediaRequest) -> crate::Result<SelectMediaResponse> {
        Err(crate::Error::UnsupportedPlatform)
    }

    pub fn select_documents(
        &self,
        _payload: SelectDocumentsRequest,
    ) -> crate::Result<SelectDocumentsResponse> {
        Err(crate::Error::UnsupportedPlatform)
    }

    pub fn preview_file(&self, _payload: LocalFileRequest) -> crate::Result<PreviewFileResponse> {
        Err(crate::Error::UnsupportedPlatform)
    }

    pub fn share_file(&self, _payload: LocalFileRequest) -> crate::Result<ShareFileResponse> {
        Err(crate::Error::UnsupportedPlatform)
    }

    pub fn generate_image_thumbnail(
        &self,
        _payload: GenerateImageThumbnailRequest,
    ) -> crate::Result<GenerateImageThumbnailResponse> {
        Err(crate::Error::UnsupportedPlatform)
    }

    pub fn generate_video_poster(
        &self,
        _payload: GenerateVideoPosterRequest,
    ) -> crate::Result<GenerateImageThumbnailResponse> {
        Err(crate::Error::UnsupportedPlatform)
    }

    pub fn cancel_video_poster(
        &self,
        _payload: CancelVideoPosterRequest,
    ) -> crate::Result<CancelVideoPosterResponse> {
        Err(crate::Error::UnsupportedPlatform)
    }
}
