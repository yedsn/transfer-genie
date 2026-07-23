/**
 * 工作区状态启动恢复。
 *
 * 流程：从本地持久化读取 -> 反序列化与归一化 -> 校验标签内容可用性 ->
 * 缺失标签标记为 missing（可恢复状态），而非删除或崩溃。
 *
 * resolver(tab) 由调用方注入：返回 Promise<boolean> 或 boolean，
 * true 表示该标签引用的内容仍可用。默认总是返回 true。
 */
(function bootstrapWorkspaceRestore(globalScope) {
  "use strict";
  if (!globalScope) return;

  var core = globalScope.transferGenieWorkspaceCore;
  var persistence = globalScope.transferGenieWorkspacePersistence;

  function restoreSync(resolver) {
    if (!core || !persistence) {
      return { state: core ? core.createInitialState({}) : null, hadSavedState: false };
    }
    var raw = persistence.load();
    if (!raw) {
      return { state: core.createInitialState({}), hadSavedState: false };
    }
    var state = core.deserialize(raw);
    if (!state) {
      return { state: core.createInitialState({}), hadSavedState: false };
    }
    state = core.restoreWithValidation(state, resolver || function () { return true; });
    return { state: state, hadSavedState: true };
  }

  async function restoreAsync(resolver) {
    if (!core || !persistence) {
      return { state: core ? core.createInitialState({}) : null, hadSavedState: false };
    }
    var raw = persistence.load();
    if (!raw) {
      return { state: core.createInitialState({}), hadSavedState: false };
    }
    var state = core.deserialize(raw);
    if (!state) {
      return { state: core.createInitialState({}), hadSavedState: false };
    }
    var fn = typeof resolver === "function" ? resolver : function () { return true; };

    async function validateTabs(panes) {
      for (var i = 0; i < panes.length; i++) {
        for (var j = 0; j < panes[i].tabs.length; j++) {
          var t = panes[i].tabs[j];
          try {
            var ok = await fn(t);
            t.missing = !ok;
          } catch (e) {
            t.missing = true;
          }
        }
      }
    }

    await validateTabs(state.panes);
    return { state: state, hadSavedState: true };
  }

  var api = {
    restoreSync: restoreSync,
    restoreAsync: restoreAsync,
  };

  globalScope.transferGenieWorkspaceRestore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
