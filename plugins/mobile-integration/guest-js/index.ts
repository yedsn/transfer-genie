import { addPluginListener, invoke, type PluginListener } from '@tauri-apps/api/core'

export type MobileLifecycleState = 'background' | 'foreground'

export interface MobileLifecycleEvent {
  state: MobileLifecycleState
}

export async function listenLifecycle(
  callback: (event: MobileLifecycleEvent) => void,
): Promise<PluginListener> {
  return await addPluginListener<MobileLifecycleEvent>('mobile-integration', 'lifecycle', callback)
}

export interface MobileDiagnostic {
  requestId: string
  platform: string
  nativePlugin: boolean
  mainThread: boolean
  canGoBack: boolean
  navigationGesturesEnabled: boolean
  rootScrollEnabled: boolean
  rootPanEnabled: boolean
}

export async function diagnostic(requestId: string): Promise<MobileDiagnostic> {
  return await invoke<MobileDiagnostic>('plugin:mobile-integration|diagnostic', {
    payload: {
      requestId,
    },
  })
}

export interface NavigationGesturesResponse {
  enabled: boolean
  supported: boolean
  canGoBack: boolean
  rootScrollEnabled: boolean
  rootPanEnabled: boolean
}

export async function setNavigationGesturesEnabled(
  enabled: boolean,
  revision: number,
): Promise<NavigationGesturesResponse> {
  return await invoke<NavigationGesturesResponse>(
    'plugin:mobile-integration|set_navigation_gestures_enabled',
    { payload: { enabled, revision } },
  )
}

export async function navigateNativePage(
  page: 'detail' | 'composer',
  action: 'prepare' | 'show' | 'close' | 'finish' | 'cancel' | 'resume',
  requestId: string,
): Promise<{ accepted: boolean; supported: boolean }> {
  return await invoke('plugin:mobile-integration|navigate_native_page', {
    payload: { page, action, requestId },
  })
}

export interface SelectedMedia {
  path: string
  originalName: string
  mediaType: 'image' | 'video'
  contentType?: string
  sizeBytes: number
}

export interface SelectMediaResponse {
  items: SelectedMedia[]
}

export async function selectMedia(selectionLimit = 10): Promise<SelectMediaResponse> {
  return await invoke<SelectMediaResponse>('plugin:mobile-integration|select_media', {
    payload: { selectionLimit },
  })
}

export interface SelectedDocument {
  path: string
  originalName: string
  contentType?: string
  sizeBytes: number
}

export interface SelectDocumentsResponse {
  items: SelectedDocument[]
}

export async function selectDocuments(allowsMultipleSelection = true): Promise<SelectDocumentsResponse> {
  return await invoke<SelectDocumentsResponse>('plugin:mobile-integration|select_documents', {
    payload: { allowsMultipleSelection },
  })
}

export interface PreviewFileResponse {
  presented: boolean
  supported: boolean
}

export async function previewFile(path: string): Promise<PreviewFileResponse> {
  return await invoke<PreviewFileResponse>('plugin:mobile-integration|preview_file', {
    payload: { path },
  })
}

export interface ShareFileResponse {
  completed: boolean
  activityType?: string
}

export async function shareFile(path: string): Promise<ShareFileResponse> {
  return await invoke<ShareFileResponse>('plugin:mobile-integration|share_file', {
    payload: { path },
  })
}

export interface GenerateImageThumbnailResponse {
  path: string
  width: number
  height: number
  sizeBytes: number
}

export async function generateImageThumbnail(
  path: string,
  maxPixelSize = 1280,
): Promise<GenerateImageThumbnailResponse> {
  return await invoke<GenerateImageThumbnailResponse>(
    'plugin:mobile-integration|generate_image_thumbnail',
    { payload: { path, maxPixelSize } },
  )
}

export async function generateVideoPoster(
  requestId: string,
  path: string,
  maxPixelSize = 1280,
  timeoutMilliseconds = 15_000,
): Promise<GenerateImageThumbnailResponse> {
  return await invoke<GenerateImageThumbnailResponse>(
    'plugin:mobile-integration|generate_video_poster',
    { payload: { requestId, path, maxPixelSize, timeoutMilliseconds } },
  )
}

export async function cancelVideoPoster(requestId: string): Promise<{ cancelled: boolean }> {
  return await invoke<{ cancelled: boolean }>('plugin:mobile-integration|cancel_video_poster', {
    payload: { requestId },
  })
}
