use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticRequest {
    pub request_id: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticResponse {
    pub request_id: String,
    pub platform: String,
    pub native_plugin: bool,
    pub main_thread: bool,
    pub can_go_back: bool,
    pub navigation_gestures_enabled: bool,
    pub root_scroll_enabled: bool,
    pub root_pan_enabled: bool,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationGesturesRequest {
    pub enabled: bool,
    pub revision: u64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationGesturesResponse {
    pub enabled: bool,
    pub supported: bool,
    pub can_go_back: bool,
    pub root_scroll_enabled: bool,
    pub root_pan_enabled: bool,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePageNavigationRequest {
    pub page: String,
    pub action: String,
    pub request_id: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePageNavigationResponse {
    pub accepted: bool,
    pub supported: bool,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectMediaRequest {
    pub selection_limit: Option<u8>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedMedia {
    pub path: String,
    pub original_name: String,
    pub media_type: String,
    pub content_type: Option<String>,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectMediaResponse {
    pub items: Vec<SelectedMedia>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectDocumentsRequest {
    pub allows_multiple_selection: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedDocument {
    pub path: String,
    pub original_name: String,
    pub content_type: Option<String>,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectDocumentsResponse {
    pub items: Vec<SelectedDocument>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileRequest {
    pub path: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewFileResponse {
    pub presented: bool,
    pub supported: bool,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareFileResponse {
    pub completed: bool,
    pub activity_type: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateImageThumbnailRequest {
    pub path: String,
    pub max_pixel_size: Option<u16>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateImageThumbnailResponse {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub size_bytes: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateVideoPosterRequest {
    pub request_id: String,
    pub path: String,
    pub max_pixel_size: Option<u16>,
    pub timeout_milliseconds: Option<u32>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelVideoPosterRequest {
    pub request_id: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelVideoPosterResponse {
    pub cancelled: bool,
}
