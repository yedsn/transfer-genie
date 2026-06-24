# Change: Migrate Frontend to Vue + Webpack Build

## Why
The current frontend uses static script tags and Vue 2 loaded from vendor bundles in rontend/lib/. There is no module bundler, making it hard to use npm packages, ES modules, or Vue SFCs. Migrating to webpack enables proper dependency management, hot reload during development, and prepares for Vue 3 upgrade.

## What Changes
- Add webpack 5 build pipeline with Vue 2 loader (ue-loader@15), CSS extraction, and asset handling.
- Convert existing IIFE modules (	auri-api.js, eed-state.js, eed-view-model.js, ormat.js, settings-*.js) into ES modules imported by the webpack entry.
- Replace ue-app.js IIFE Vue 2 app bootstrap with a webpack entry that creates the Vue instance.
- Move inline HTML templates from index.html into Vue SFC components (home-page.vue, marked-page.vue, downloads-page.vue, settings-page.vue).
- Replace CDN/vendor lib/vue/vue.min.js with npm ue@2 package.
- Keep editor.md and its jQuery dependency loaded via CopyWebpackPlugin for now (large legacy editor).
- Update 	auri.conf.json to point rontendDist and devUrl to webpack output.
- Preserve all existing behavior and Chinese text encoding.

## Impact
- Affected specs: pp-shell, message-feed, client-settings
- Affected code: rontend/ directory restructured, 	auri.conf.json build config, package.json build scripts
