# Repository Guidelines

## Project Structure & Module Organization
`transfer-genie` is a Tauri desktop app with a Rust backend and a static frontend. Core logic lives in `src/` (`main.rs`, `webdav.rs`, `db.rs`, `history.rs`, `telegram_bridge.rs`, `types.rs`). Helper binaries are in `src/bin/`. The UI is in `frontend/` with `index.html`, `main.js`, `styles.css`, plus assets under `frontend/icons/` and `frontend/lib/`. Integration checks live in `tests/`, user docs in `docs/`, and release helpers in `scripts/`.

## Build, Test, and Development Commands
- `cargo tauri dev` — run the desktop app locally with the Tauri shell.
- `cargo tauri build` — create a production bundle under `target/release/bundle/`.
- `cargo test` — run Rust unit and async tests.
- `node tests/test_local_http_api.js --help` — inspect options for the local HTTP API smoke test.
- `cargo install tauri-cli --locked` — install the required Tauri CLI if `cargo tauri` is missing.

## Coding Style & Naming Conventions
Follow Rust 2021 defaults: 4-space indentation, `snake_case` for functions/modules, `CamelCase` for types, and small focused modules. Keep payload structs explicit. In `frontend/`, preserve the lightweight static structure and prefer clear DOM helpers over framework-like abstractions. Add comments only when behavior is not obvious.

## Testing Guidelines
Add Rust tests close to the code they validate, especially for WebDAV sync, history storage, and bridge behavior. Keep broader API or workflow checks in `tests/`. Name tests by behavior, for example `syncs_text_message_from_webdav`. Before a PR, run `cargo test` and, for HTTP changes, a targeted `node tests/test_local_http_api.js ...` check.

## Commit & Pull Request Guidelines
Recent history favors short, direct commit titles such as `README`, `docs`, `release: v0.2.1`, and `self-hosted run`. Keep the subject concise and imperative; use a scoped prefix when it adds clarity. PRs should describe user-visible changes, list verification steps, link related issues or OpenSpec changes, and include screenshots for UI updates.

## OpenSpec & Configuration Notes
For new features, breaking behavior, or architecture changes, read `openspec/AGENTS.md` first and follow the proposal workflow before implementation. Never commit real WebDAV, Telegram, or local API credentials; keep examples sanitized.

<!-- OPENSPEC:START -->
Always open `@/openspec/AGENTS.md` for proposals, specs, plans, and other work that changes capabilities or architecture. Keep this managed block so `openspec update` can refresh it.
<!-- OPENSPEC:END -->
