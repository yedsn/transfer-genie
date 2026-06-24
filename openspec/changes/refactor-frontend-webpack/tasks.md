## 1. Frontend Build Setup
- [x] 1.1 Add Vue 2 + webpack dependencies and npm scripts.
- [x] 1.2 Add webpack configuration for app entry, CSS, assets, and vendor static copy.
- [x] 1.3 Update Tauri build config to use webpack dev server and dist output.

## 2. Module Migration
- [x] 2.1 Convert frontend utility/runtime files to webpack-loaded modules while preserving global compatibility.
- [x] 2.2 Convert Vue app bootstrap to a webpack entry.
- [x] 2.3 Keep legacy `main.js` behavior available after bundling.

## 3. Component Migration
- [x] 3.1 Keep page shell templates in HTML during this migration to avoid large Chinese template rewrite risk.
- [x] 3.2 Wire existing bridge actions and state through the bundled Vue app without behavior changes.
- [x] 3.3 Remove direct `lib/vue/vue.min.js` script loading from the app HTML.

## 4. Verification
- [x] 4.1 Run webpack production build.
- [x] 4.2 Validate OpenSpec change.
- [x] 4.3 Update checklist after verification.
