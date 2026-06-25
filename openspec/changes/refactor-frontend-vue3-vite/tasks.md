## 1. Build Setup
- [x] 1.1 Add Vite, Vue 3, TypeScript, vue-tsc, and `@vitejs/plugin-vue` dependencies.
- [x] 1.2 Add OpenDock-style `vite.config.ts` with `root: "src-ui"`, port `5180`, and output `dist/`.
- [x] 1.3 Add `tsconfig.json` and `src-ui/env.d.ts` for Vue SFC and Tauri typings.
- [x] 1.4 Update npm scripts from webpack commands to Vite/Vue 3 commands.

## 2. Vue 3 App Shell
- [x] 2.1 Create `src-ui/src/main.ts` using `createApp(App)`.
- [x] 2.2 Create `src-ui/src/store.ts` using Vue 3 `reactive()` state and bridge sync methods.
- [x] 2.3 Create `src-ui/src/types.ts` for shared frontend state and bridge types.
- [x] 2.4 Create `src-ui/src/App.vue` with the current tab shell and legacy compatibility containers.

## 3. Runtime Compatibility
- [x] 3.1 Keep existing legacy runtime load order after Vue 3 mounts.
- [x] 3.2 Preserve `window.transferGenieVue` bridge methods used by `legacy-main.js`.
- [x] 3.3 Preserve static assets under `src-ui/public/icons` and `src-ui/public/lib`.
- [x] 3.4 Remove direct Vue 2 globals and webpack-only runtime requirements.

## 4. Cleanup
- [x] 4.1 Remove obsolete webpack config and Vue 2 dependencies.
- [x] 4.2 Ensure Tauri build config still points to `http://127.0.0.1:5180` and `./dist`.
- [x] 4.3 Update OpenSpec checklist after verification.

## 5. Verification
- [x] 5.1 Run `npx openspec validate refactor-frontend-vue3-vite --strict`.
- [x] 5.2 Run `npm install --package-lock-only`.
- [x] 5.3 Run `npm run typecheck`.
- [x] 5.4 Run `npm run build`.