## Context

Transfer Genie is a desktop Tauri 2 application with a Rust backend, a static HTML/JS frontend, a persisted `Settings` model, and a custom in-app dialog system. The app already emits `trigger-show` when the main window is shown, which gives us a natural hook for a delayed background update check.

This change introduces a new external dependency on Tauri's updater plugin and adds a release-pipeline requirement: GitHub Releases will host both updater artifacts and the static `latest.json` metadata file. The design must keep the current lightweight frontend structure, avoid repeated prompts when the window is shown multiple times, and keep automatic update failures non-intrusive.

## Goals / Non-Goals

**Goals:**
- Add a persisted setting for enabling or disabling automatic update checks.
- Use GitHub Releases static metadata and signed updater artifacts for desktop updates.
- Run automatic checks only after the main window is shown and only once per app session.
- Reuse the existing frontend dialog system for update availability, install, and restart prompts.
- Expose updater operations through Rust Tauri commands so the static frontend does not need direct plugin bindings.

**Non-Goals:**
- Multi-channel release management such as stable/beta switching.
- Forced updates or mandatory install policies.
- Linux-specific packaging beyond keeping the design compatible with future support.
- Full CI automation for GitHub Releases in this change.

## Decisions

### 1. Use `tauri-plugin-updater` with GitHub Releases static JSON

- Decision: Configure Tauri updater with a GitHub Releases `latest.json` endpoint and signed updater artifacts.
- Rationale: This is the lowest-friction hosted solution for the project and aligns with the intended release model already documented in `docs/Tauri自动更新实现流程.md`.
- Alternatives considered:
  - Dynamic update API: more flexible later, but unnecessary complexity for the first version.
  - Manual in-app download links only: does not provide signed install flow or automatic version detection.

### 2. Keep updater logic in Rust and expose custom commands to the frontend

- Decision: Add Rust-side commands for checking, downloading/installing, and restarting updates instead of having the frontend call updater APIs directly.
- Rationale: The current frontend is plain static JavaScript without a package-managed Tauri guest binding setup, and the app already uses Rust commands as the backend boundary.
- Alternatives considered:
  - Direct frontend updater API usage: adds JS integration complexity and requires more frontend-side capability handling.
  - Fully backend-driven UI prompts: would bypass the existing custom dialog system and create inconsistent UX.

### 3. Hook automatic checks to the existing `trigger-show` event with session deduplication

- Decision: Schedule a delayed automatic check when the frontend receives `trigger-show`, but skip if the session has already checked or if a check is already in progress.
- Rationale: This avoids slowing initial render, works for tray reopen behavior, and keeps repeated window show events from spamming network checks.
- Alternatives considered:
  - Check immediately during Tauri setup: too early for UI coordination and potentially noisy during startup.
  - Check on every focus event: too frequent and likely to create repeated requests.

### 4. Separate silent automatic failures from explicit manual check results

- Decision: Automatic checks will log failures and stop silently; manual checks initiated from settings will surface success/failure status to the user.
- Rationale: Users expect background checks to be quiet, while manual actions need visible feedback.
- Alternatives considered:
  - Always show errors: too disruptive for background checks.
  - Always stay silent: makes manual checks feel broken.

### 5. Extend settings schema and import/export support for the new preference

- Decision: Add `auto_update_enabled` to persisted settings and include it in import/export payloads with backward-compatible defaults.
- Rationale: The feature must survive restarts and behave consistently with the project's centralized settings model.
- Alternatives considered:
  - Session-only flag: does not satisfy the user-facing setting requirement.
  - Separate updater config file: unnecessary fragmentation.

## Risks / Trade-offs

- [GitHub Release assets are incomplete or malformed] -> Validate `latest.json`, artifact URLs, and signatures during release preparation; keep errors visible in manual checks.
- [Repeated window show events trigger duplicate work] -> Track per-session frontend state and backend in-flight status.
- [Restart behavior differs by platform or plugin version] -> Wrap restart handling in a dedicated command and fall back to user-facing guidance if immediate relaunch fails.
- [New updater permissions broaden the app capability surface] -> Grant only the updater permissions needed for check/install flow.
- [First implementation only covers Windows/macOS release flow] -> Keep spec language desktop-focused and document Linux as future-compatible, not first-release guaranteed.

## Migration Plan

1. Add updater dependency and Tauri configuration, including GitHub Releases endpoint placeholder and updater permissions.
2. Extend settings persistence and settings UI with automatic update preference and manual check entry.
3. Implement Rust commands for update check, install, and restart; emit progress events for the frontend.
4. Wire the frontend dialogs and `trigger-show` auto-check behavior.
5. Update release documentation so signed assets and `latest.json` are produced and uploaded correctly.
6. Rollback path: ship a config/build without updater plugin usage and keep the `auto_update_enabled` setting defaulted off if release integration is not ready.

## Open Questions

- Should the first release include a visible download/install progress indicator or only a blocking “updating” dialog?
- Do we want to persist “skip this version” in a later follow-up, or explicitly leave that for a separate change?
- Should manual “check for updates” live as a button in settings only, or also be added to tray/menu later?
