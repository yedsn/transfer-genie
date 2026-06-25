# Change: Refactor Frontend to Vue 3 + Vite Architecture

## Why
The current desktop frontend is still a Vue 2 + webpack compatibility layer. It keeps a large legacy DOM runtime, global IIFE modules, and a Vue 2 bridge (`Vue.observable` + `new Vue()`), which makes ongoing maintenance and component migration difficult.

The OpenDock project already uses the desired Tauri 2 frontend architecture: `src-ui/` as the Vite root, Vue 3, TypeScript, `@vitejs/plugin-vue`, `createApp(App)`, focused bridge modules, and reactive store modules. Transfer Genie should adopt the same stack and code layout while preserving existing Tauri commands and user-visible behavior.

## What Changes
- Replace webpack build setup with Vite + Vue 3 + TypeScript, following the OpenDock-style `src-ui/` root and `dist/` output convention.
- Replace Vue 2 runtime usage with Vue 3 `createApp`, Composition API, and a focused reactive store.
- Convert frontend entry files to `main.ts`, `App.vue`, `store.ts`, `types.ts`, and focused service/helper modules.
- Keep the existing Tauri build contract: dev URL on `127.0.0.1:5180`, production output in `dist/`, and static vendor assets available under `src-ui/public`.
- Preserve Transfer Genie’s existing main tabs, WebDAV/message/settings workflows, Tauri command names, and Chinese UI text.
- Remove obsolete webpack/Vue 2 dependencies and scripts after the Vite build path is working.

## Impact
- Affected specs: `app-shell`
- Affected code: `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `src-ui/`, `tauri.conf.json`, legacy webpack artifacts
- Risk: large Chinese templates and legacy DOM behavior require careful incremental migration to avoid encoding and behavior regressions.
