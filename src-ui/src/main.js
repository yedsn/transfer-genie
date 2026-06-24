// Webpack entry for Transfer Genie
// Bootstraps Vue 2 and loads legacy modules in correct order

import Vue from 'vue/dist/vue.esm.js';
import './styles.css';

// Make Vue available globally for legacy IIFE modules
window.Vue = Vue;

// Load runtime utilities in dependency order
require('./utils/settings-ops-runtime.js');
require('./utils/settings-runtime-status.js');

// Load Vue app shell (depends on Vue + runtime status)
require('./vue-app.js');

// Load feed/model utilities (depend on Vue app being ready)
require('./utils/feed-state.js');
require('./utils/feed-view-model.js');
require('./utils/settings-form-runtime.js');

// Load main application logic (depends on everything above)
require('./legacy-main.js');
