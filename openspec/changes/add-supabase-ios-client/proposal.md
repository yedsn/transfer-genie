# Proposal

## Why

Transfer Genie currently targets desktop systems, so the user cannot reliably access the same Supabase message space from an iPhone. The project already has a local-first SQLite model, Supabase authentication, private attachment storage, incremental sync, and cloud preview metadata; extending those foundations into a focused Supabase-only iOS client is lower risk than creating a separate mobile product or porting desktop-only behavior unchanged.

## What Changes

- Add an iOS client built with Tauri 2 that reuses the Vue frontend and Rust business core while providing a mobile entry point and iOS-specific configuration, capabilities, signing, and development workflow.
- Limit the iOS product to Supabase storage spaces; WebDAV configuration, migration, backup, restore, and sync remain available on desktop but are hidden and inactive on iOS.
- Add an iOS-native bridge for photo/video and document selection, ImageIO thumbnails, AVFoundation video posters and playback, Quick Look document preview, and the system share sheet. iOS SHALL NOT depend on an FFmpeg executable or desktop subprocesses.
- Reuse the existing private `preview.jpg` object and `preview_object_path` contract so desktop and iOS clients exchange lightweight image and video previews without downloading full attachments.
- Adapt the message feed for touch input, safe areas, the software keyboard, mobile selection gestures, and platform-appropriate file actions while preserving the existing local-first message and marking behavior.
- Make lifecycle-driven Supabase synchronization authoritative on iOS: cold start, sign-in, foreground recovery, network recovery, Realtime reconnect, and manual refresh trigger incremental pull; Realtime remains a foreground wake-up signal rather than a background delivery guarantee.
- Keep text and ordinary attachment operations recoverable through SQLite and the outbox. The first release may pause unfinished Rust transfers when suspended and resume them on foreground; durable system-managed background upload/download is an explicitly deferred follow-up unless the implementation spike proves it is required for the minimum stable release.
- Add simulator and physical-device verification gates before expanding the full mobile UI, including Keychain session restoration, cross-device preview interoperability, offline retry, foreground/background recovery, and release-build stability.
- Keep all existing desktop WebDAV and desktop integration behavior unchanged.

## Capabilities

### New Capabilities

- `ios-client`: Defines the supported iOS product scope, native media/file integration, lifecycle behavior, device installation, and mobile stability requirements.

### Modified Capabilities

- `client-settings`: Defines the Supabase-only settings surface on iOS and excludes desktop/WebDAV-only settings without deleting or rewriting desktop configuration.
- `local-first-sync`: Adds iOS lifecycle recovery and suspended-transfer behavior while preserving durable outbox and checkpoint guarantees.
- `message-feed`: Adds touch-first attachment selection, media/document preview, sharing, and mobile interaction behavior.
- `storage-profiles`: Restricts selectable iOS storage profiles to Supabase while preserving multi-provider desktop behavior and profile isolation.
- `supabase-storage`: Adds cross-platform preview generation interoperability, iOS Keychain persistence, and foreground-oriented Realtime/recovery behavior.

## Impact

- Rust application structure: mobile library entry point, platform adapters, compile-time exclusion of tray, global shortcuts, updater, autostart, local HTTP API, Telegram Bridge, FFmpeg subprocesses, and desktop dictation behavior.
- Tauri configuration: iOS project generation, platform-specific capabilities, bundle metadata, permissions, development host configuration, signing, and simulator/device commands.
- Native iOS code: a Swift Tauri plugin for PhotosPicker/document picker, security-scoped file copying, ImageIO, AVFoundation, Quick Look, share sheet, and lifecycle notifications.
- Frontend: responsive/touch interactions, safe-area and keyboard layout, mobile navigation, native bridge integration, and removal of hover/double-click dependencies on iOS.
- Supabase: reuse of the current Auth, RLS, RPC, Realtime, private Storage, original attachment, and `preview.jpg` schemas; no service-role key is introduced.
- Testing and operations: iOS target compilation, simulator runtime setup, physical iPhone signing, release-device regression tests, and cross-device Supabase acceptance tests.
