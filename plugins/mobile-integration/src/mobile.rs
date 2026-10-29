use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_mobile_integration);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<MobileIntegration<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("", "ExamplePlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_mobile_integration)?;
    Ok(MobileIntegration(handle))
}

/// Access to the mobile-integration APIs.
pub struct MobileIntegration<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> MobileIntegration<R> {
    pub fn diagnostic(&self, payload: DiagnosticRequest) -> crate::Result<DiagnosticResponse> {
        self.0
            .run_mobile_plugin("diagnostic", payload)
            .map_err(Into::into)
    }

    pub fn set_navigation_gestures_enabled(
        &self,
        payload: NavigationGesturesRequest,
    ) -> crate::Result<NavigationGesturesResponse> {
        self.0
            .run_mobile_plugin("setNavigationGesturesEnabled", payload)
            .map_err(Into::into)
    }

    pub fn navigate_native_page(
        &self,
        payload: NativePageNavigationRequest,
    ) -> crate::Result<NativePageNavigationResponse> {
        self.0
            .run_mobile_plugin("navigateNativePage", payload)
            .map_err(Into::into)
    }

    pub fn select_media(&self, payload: SelectMediaRequest) -> crate::Result<SelectMediaResponse> {
        self.0
            .run_mobile_plugin("selectMedia", payload)
            .map_err(Into::into)
    }

    pub fn select_documents(
        &self,
        payload: SelectDocumentsRequest,
    ) -> crate::Result<SelectDocumentsResponse> {
        self.0
            .run_mobile_plugin("selectDocuments", payload)
            .map_err(Into::into)
    }

    pub fn preview_file(&self, payload: LocalFileRequest) -> crate::Result<PreviewFileResponse> {
        self.0
            .run_mobile_plugin("previewFile", payload)
            .map_err(Into::into)
    }

    pub fn share_file(&self, payload: LocalFileRequest) -> crate::Result<ShareFileResponse> {
        self.0
            .run_mobile_plugin("shareFile", payload)
            .map_err(Into::into)
    }

    pub fn generate_image_thumbnail(
        &self,
        payload: GenerateImageThumbnailRequest,
    ) -> crate::Result<GenerateImageThumbnailResponse> {
        self.0
            .run_mobile_plugin("generateImageThumbnail", payload)
            .map_err(Into::into)
    }

    pub fn generate_video_poster(
        &self,
        payload: GenerateVideoPosterRequest,
    ) -> crate::Result<GenerateImageThumbnailResponse> {
        self.0
            .run_mobile_plugin("generateVideoPoster", payload)
            .map_err(Into::into)
    }

    pub fn cancel_video_poster(
        &self,
        payload: CancelVideoPosterRequest,
    ) -> crate::Result<CancelVideoPosterResponse> {
        self.0
            .run_mobile_plugin("cancelVideoPoster", payload)
            .map_err(Into::into)
    }
}
