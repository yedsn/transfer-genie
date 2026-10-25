# Design

## Context

See `proposal.md` for motivation and scope. Transfer Genie is a Tauri 2 desktop application with a Vue frontend and a large Rust binary entry point. Its reusable core already includes SQLite local-first state, durable outbox operations, Supabase Auth/RLS/RPC/Realtime, private attachments, and independent JPEG preview objects. Desktop startup also wires tray, shortcuts, updater, autostart, local HTTP API, Telegram Bridge, FFmpeg processes, and macOS/Windows integrations that cannot run unchanged on iOS.

The development Mac has Xcode, iOS SDKs, Rust iOS targets, CocoaPods, Tauri CLI, and an Apple Development identity. The matching official iOS Simulator runtime is part of the required workstation setup, while active device provisioning is not yet ready. An official-registry `cargo check --target aarch64-apple-ios` compiled the primary Tauri, SQLite, Keychain, HTTP, TLS, WebSocket, image, and crypto dependencies; the first project failure was the desktop updater permission being loaded into the mobile capability manifest.

Tauri supports Swift mobile plugins, but current upstream issues affect iOS file dialogs, security-scoped resources, opener behavior, and some physical-device release dialogs. Apple also suspends ordinary process work in the background; reliable background file transfers require native background `URLSession` file tasks. These constraints shape the adapter boundary and phased transfer design.

## Goals / Non-Goals

**Goals:**

- Keep one shared Rust domain and Supabase synchronization implementation across desktop and iOS.
- Establish a small, explicit iOS native boundary for system-owned media, document, preview, sharing, and lifecycle capabilities.
- Preserve the existing Supabase schema and cross-device attachment/preview contract.
- Make app suspension and termination recoverable without requiring background process residency.
- Prove the architecture on a simulator and the target physical iPhone before broad UI migration.
- Keep desktop behavior and releases stable throughout the migration.

**Non-Goals:**

- Rewriting the application as a separate SwiftUI product.
- Adding WebDAV support to iOS.
- Providing desktop tray, shortcuts, updater, bridge, HTTP server, or dictation behavior on iOS.
- Bundling an FFmpeg executable or promising in-app playback of every desktop-supported media container.
- Guaranteeing fixed-interval background synchronization or continuous background Realtime.
- Requiring durable system-managed background upload/download for the first probe; it remains a second implementation phase unless acceptance testing shows foreground-resume transfer is insufficient.

## Decisions

### 1. Split application bootstrap into shared library and platform adapters

Move the Tauri builder and shared initialization behind `#[cfg_attr(mobile, tauri::mobile_entry_point)] pub fn run()`. Keep a minimal desktop `main()` that calls the library. Organize startup into shared state initialization, desktop-only wiring, and mobile-only wiring rather than branching repeatedly inside one monolithic setup block.

Desktop-only modules and dependencies SHALL be compile-time gated, not merely left inactive at runtime. This includes tray, global shortcut, updater, single-instance behavior, autostart, Telegram Bridge subprocess management, local HTTP API startup, FFmpeg subprocess preview generation, external shell commands, and desktop dictation automation.

Alternative considered: maintain the existing binary and add runtime `cfg!` checks. This still type-checks unavailable APIs and dependencies for iOS and makes mobile startup difficult to audit.

### 2. Use platform-specific Tauri configuration and capabilities

Add `tauri.ios.conf.json` and an iOS/mobile capability file that contains only plugins and permissions available on iOS. Desktop capability files retain updater, opener, and other desktop permissions. The iOS bundle configuration owns minimum OS version, Info.plist permission strings, supported device family, signing metadata, and generated Xcode project inputs.

Vite SHALL read `TAURI_DEV_HOST` and configure HMR for a physical device while continuing to use loopback for desktop development. Tauri CLI and Rust/npm plugin versions SHALL be aligned before generating the Xcode project.

Alternative considered: keep a single capability manifest and tolerate unavailable permissions. The current updater permission failure proves this does not produce a valid mobile manifest.

### 3. Keep Supabase business logic in Rust

Rust remains authoritative for settings, Keychain-backed session records, SQLite transactions, outbox claims, RPC payloads, revision handling, incremental pull, Realtime state, attachment metadata, Storage object identity, and preview cache ownership. The Vue frontend continues to invoke a platform-neutral API surface.

The existing `keyring` Apple backend is retained initially because it explicitly supports iOS and compiled for the iOS target. A Swift Keychain implementation is only introduced if physical-device acceptance reveals entitlement or accessibility limitations that the Rust backend cannot configure safely.

Alternative considered: adopt `supabase-swift` and maintain a second synchronization implementation. This duplicates operation ID, revision, checkpoint, RLS, and outbox semantics and creates cross-client drift.

### 4. Introduce one project-owned Swift mobile plugin

Create a focused Tauri mobile plugin that presents native UI from the active iOS scene and exposes narrow commands. The plugin copies external selections into application-controlled sandbox paths before resolving calls so Rust never depends on a stale security-scoped URL.

Initial command surface:

- select photos and videos;
- select documents;
- generate image thumbnails;
- generate video posters;
- present Quick Look for a local file;
- present the system share sheet;
- report foreground/background and network-relevant lifecycle events needed to wake Rust recovery.

The bridge passes paths and structured metadata, not large byte arrays. Native presentation is dispatched on the main thread and resolves or rejects every invocation, including cancellation.

Alternative considered: rely entirely on Tauri dialog/opener plugins. Open upstream issues around file filters, security-scoped resources, release-device dialog presentation, and mobile opener behavior make them unsuitable for critical iOS paths.

### 5. Use Apple media frameworks and the existing preview contract

ImageIO generates orientation-correct bounded thumbnails without fully decoding large source images when possible. AVFoundation generates a poster near 0.5 seconds, applies the preferred track transform, limits the maximum output size, and supports cancellation. Output is always a bounded JPEG written to a sandbox file.

Rust uploads that file to the existing stable path:

```text
<user-id>/<space-id>/<attachment-id>/preview.jpg
```

The preview failure state stays independent from the original attachment state. iOS lists download `preview.jpg` only; opening full content triggers the existing authenticated object download. Quick Look handles supported documents after local download, AVPlayer or a system media view handles system-decodable audio/video, and unsupported formats fall back to type card plus share sheet.

Alternative considered: statically link FFmpeg or generate frames in WebView canvas. FFmpeg increases binary, licensing, linking, and maintenance cost; WebView decoding increases memory pressure and has weaker orientation, HDR, cancellation, and lifecycle behavior.

### 6. Preserve local-first semantics across iOS lifecycle events

Before any network operation, messages, attachment source paths, immutable payload snapshots, operation IDs, and outbox state are committed to SQLite. Foreground recovery performs these steps in order:

1. recover interrupted claims and local transfer state;
2. restore or refresh the Supabase Session;
3. reconnect Realtime with the current token;
4. process eligible outbox work;
5. perform authoritative incremental pull and advance checkpoint transactionally;
6. expose the resulting pending, auth, failure, and conflict status to the UI.

Realtime is only active while the process can run and remains a wake-up hint. Background suspension never advances a checkpoint or marks an upload complete without authoritative confirmation.

Alternative considered: keep the socket alive or poll in the background. iOS does not guarantee either behavior and would make correctness depend on unsupported residency.

### 7. Phase durable background transfers

Phase 1 uses the existing Rust upload/download path while the app is active. If the app is suspended, the persisted outbox, local file, partial download, and stable operation ID are recovered on foreground or next launch. Short foreground-originated work may request limited background execution time, but correctness never depends on it.

Phase 2, if required by acceptance criteria or real file sizes, introduces a Swift background transfer service using a single named background `URLSession`. Uploads use file-backed tasks; downloads move completion files into a permanent sandbox location. Native task identifiers map to persisted Rust operation IDs, and completion callbacks reconcile Storage and authoritative attachment metadata before marking cloud availability.

Alternative considered: implement background `URLSession` before the first device probe. It adds AppDelegate/scene lifecycle and reconciliation complexity before the core mobile build, authentication, preview, and sync path are proven.

### 8. Adapt the Vue UI with a platform capability model

Expose a startup platform/capability description to the frontend. The iOS route hides WebDAV and desktop integrations, replaces double-click/hover/right-click interactions with tap/long-press/explicit menus, and uses safe-area and dynamic viewport/keyboard layout. Native file, preview, and share actions are invoked through a service abstraction so desktop code paths remain intact.

Do not fork the entire frontend. Shared feed, composer, settings data, and sync status remain common; only platform-specific controls and layouts branch at focused boundaries.

Alternative considered: create a second independent mobile frontend. This duplicates message behavior and makes desktop/mobile feature parity harder to maintain.

### 9. Gate implementation with a vertical technical probe

Before full mobile UI adaptation, the implementation SHALL prove:

- iOS target compilation and generated Xcode project;
- simulator launch and physical-device development/release launch;
- Keychain Session restore;
- Supabase incremental pull and outbox text send;
- native image/video selection;
- ImageIO and AVFoundation preview generation;
- original and `preview.jpg` upload;
- desktop-to-iOS and iOS-to-desktop preview display;
- Quick Look and share sheet;
- background/foreground recovery without lost operations.

If a probe fails, revise the adapter or task plan before migrating the remaining UI.

### 10. Use a three-tier iOS verification strategy

The official Xcode iOS Simulator is the primary day-to-day development environment for Tauri startup, shared Vue layout, Swift plugin command contracts, Supabase flows, SQLite behavior, and repeatable automated tests. Simulator success is necessary but does not establish physical-device stability.

VPhone MAY be configured as an optional second environment on the Apple Silicon development Mac. It provides a patched full-iOS guest for IPA installation, Xcode/CoreDevice attachment, WebKit and system-framework smoke testing, snapshots, cloning, and automated regression. VPhone SHALL NOT be a release gate and SHALL NOT replace the official Simulator or physical-device checks because it changes the guest boot chain, code-signing policy, system services, and host security configuration. Its virtual-machine library SHOULD live on a dedicated APFS volume with sufficient free space rather than the constrained system disk.

The target iPhone 12 named `Jam` remains authoritative for development-signing, release-signing, Keychain, PhotosPicker/iCloud, security-scoped files, real lifecycle suspension, Wi-Fi/cellular transitions, media behavior, performance, and stability acceptance. A failure observed only in VPhone must be reproduced in the official Simulator or on `Jam` before it is treated as a product release blocker; a pass in VPhone never waives a failed or missing `Jam` check.

Alternative considered: use VPhone as the primary simulator because it runs a fuller iOS system. This would make routine development depend on Recovery-mode host security changes, large patched firmware images, and upstream research-VM compatibility, while still failing to reproduce important physical-device behavior.

## Risks / Trade-offs

- [Tauri iOS plugin and lifecycle behavior is less mature than desktop] → Own critical Swift integration, pin aligned Tauri/plugin versions, and test both debug and release on a physical device.
- [Existing monolithic Rust entry leaks desktop APIs into mobile builds] → Split bootstrap first and require iOS `cargo check` before feature work.
- [Large Rust transfers pause when iOS suspends the process] → Preserve outbox/local files and resume on foreground; add background `URLSession` only after the probe or acceptance data requires it.
- [Quick Look and AVPlayer support varies by codec and OS] → Test capability before presentation and provide type-card/share fallback without promising every extension.
- [Historical videos without preview could consume large bandwidth] → Never auto-download full historical video from list visibility; require explicit user open before completion.
- [WebView safe-area, keyboard, or resume layout defects] → Add device-size CSS tests, foreground layout refresh, and physical-device regression coverage; keep iPad outside the first supported-device claim if unresolved upstream defects remain.
- [Cargo mirror and Xcode build-script PATH produce nondeterministic builds] → Use project-local official sparse registry configuration for iOS builds, align tool versions, and document Xcode-visible tool paths.
- [Account switching leaks private cache state] → Include profile ID and Auth user ID in database/cache ownership keys and clear active views before binding the next account.
- [VPhone uses patched firmware and relaxed host policy] → Keep it optional, install only after explicit owner approval, isolate its library on a dedicated APFS volume, pin a verified Launchpad/Core Bundle series, and never use it as the sole evidence for release acceptance.
- [VPhone WebKit, graphics, signing, or lifecycle behavior differs from stock iOS] → Reproduce VPhone-only failures in the official Simulator or on `Jam`; keep all release-critical lifecycle, media, Keychain, network, and performance checks on the physical device.

## Migration Plan

1. Align tool versions, install the matching official iOS Simulator runtime, establish a reliable Cargo registry, and reconnect the target iPhone for signing.
2. Split the Rust entry point and add platform-specific configuration/capabilities until iOS target compilation and Xcode generation succeed.
3. Build the Swift plugin skeleton and complete the vertical technical probe. Do not begin broad mobile UI work until the probe passes on a physical device.
4. Optionally configure a pinned VPhone environment after explicit approval of the required Recovery-mode host changes; place its VM library on a dedicated APFS volume and use it only for supplemental full-iOS and IPA automation checks.
5. Add the Supabase-only settings/profile surface and touch-safe message feed while keeping shared desktop components and APIs stable.
6. Complete cross-device attachment, preview, Keychain, lifecycle, offline, and release-device verification on `Jam`.
7. Decide whether Phase 2 background `URLSession` is required based on real attachment sizes and the user's stability expectations; capture it as a follow-up change if deferred.
8. Deliver through direct signed development installation first, then TestFlight if the Apple account supports it.

Rollback consists of disabling the iOS build target and Swift plugin while retaining shared Rust refactors and existing Supabase preview objects. No Supabase schema rollback is required because the mobile client uses existing fields and paths. Desktop builds remain independently testable throughout.
