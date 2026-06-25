# Design: Vue 3 + Vite Frontend Refactor

## Architecture
Transfer Genie will follow the same frontend structure as OpenDock:

```text
src-ui/
  index.html
  env.d.ts
  public/
    icons/
    lib/
  src/
    components/
    services/
    utils/
    App.vue
    main.ts
    store.ts
    types.ts
    styles.css
vite.config.ts
tsconfig.json
```

## Migration Strategy
Use an incremental compatibility-first migration:

1. Establish the Vue 3 + Vite build pipeline and TypeScript entry points.
2. Port the Vue app shell from `vue-app.js` to `store.ts` + `App.vue` while keeping the existing global bridge surface (`window.transferGenieVue`) available for the legacy runtime.
3. Load the legacy runtime after Vue 3 mounts so existing DOM/Tauri workflows continue to work.
4. Convert pure utility/runtime files to typed modules where safe, while temporarily exposing compatible globals for unchanged legacy code.
5. Remove webpack and Vue 2 dependencies after the Vite build passes.

## Compatibility Decisions
- The first migration phase may keep `legacy-main.js` as a compatibility runtime to preserve behavior while the app shell becomes Vue 3/Vite.
- `window.transferGenieVue` remains as a bridge object during migration so existing logic can continue calling sync methods.
- `window.__TAURI__` compatibility remains available because `tauri.conf.json` currently uses `withGlobalTauri: true`; new modules should prefer `@tauri-apps/api` imports.
- `src-ui/public/lib/editor.md` stays as static public assets because it is a large vendor editor bundle.

## Validation
- `npm run typecheck`
- `npm run build`
- `cargo test` if backend behavior is touched
