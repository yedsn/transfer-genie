/**
 * 工作区状态本地持久化。
 *
 * 设计决策：工作区布局属于本地 UI 偏好，存于本地（localStorage），
 * 不写入 WebDAV 消息历史，避免多设备冲突与意外同步。
 *
 * 该模块仅依赖 localStorage（浏览器/Tauri webview 均可用），
 * 不依赖 Vue 或 Tauri IPC，便于测试。
 */
(function bootstrapWorkspacePersistence(globalScope) {
  "use strict";
  if (!globalScope) return;

  var STORAGE_KEY = "transfer-genie:workspace-state";
  var pendingTimer = null;
  var PERSIST_DEBOUNCE_MS = 300;

  function getStorage() {
    if (typeof globalScope !== "undefined" && globalScope.localStorage) {
      return globalScope.localStorage;
    }
    return null;
  }

  function save(state, options) {
    options = options || {};
    var storage = getStorage();
    if (!storage) return false;
    try {
      var json = JSON.stringify(state);
      if (options.immediate) {
        storage.setItem(STORAGE_KEY, json);
        return true;
      }
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(function () {
        pendingTimer = null;
        try { storage.setItem(STORAGE_KEY, json); } catch (e) { /* 配额或不可用，静默 */ }
      }, PERSIST_DEBOUNCE_MS);
      return true;
    } catch (e) {
      return false;
    }
  }

  function saveImmediate(state) {
    return save(state, { immediate: true });
  }

  function load() {
    var storage = getStorage();
    if (!storage) return null;
    try {
      var raw = storage.getItem(STORAGE_KEY);
      return raw || null;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    var storage = getStorage();
    if (!storage) return;
    try { storage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  function flush() {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    save: save,
    saveImmediate: saveImmediate,
    load: load,
    clear: clear,
    flush: flush,
  };

  globalScope.transferGenieWorkspacePersistence = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
