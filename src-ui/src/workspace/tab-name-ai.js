/** 编辑器标签 AI 命名的可测试纯逻辑。 */
(function bootstrapTabNameAi(globalScope) {
  "use strict";
  if (!globalScope) return;
  var DEFAULT_PROMPT = "阅读以下草稿，生成一个不超过 16 个汉字的标签名称。只输出名称，不要引号、解释、标点结尾或换行。\n\n<draft>\n{{text}}\n</draft>";

  function availability(draft, settings) {
    if (!draft || !String(draft.text || "").trim()) {
      return { available: false, status: "empty", message: "输入草稿内容后可生成 AI 名称" };
    }
    if (!settings || !settings.aiEnabled || !String(settings.aiBaseUrl || "").trim()
      || !String(settings.aiApiKey || "").trim() || !String(settings.aiModel || "").trim()) {
      return { available: false, status: "unavailable", message: "请先在设置中启用并配置 AI" };
    }
    return { available: true, status: "loading", message: "正在根据草稿生成名称…" };
  }

  function buildRequest(draft, prompt) {
    var userPrompt = String(prompt || "").trim() || DEFAULT_PROMPT;
    return {
      text: String(draft.text || ""),
      format: draft.format === "markdown" ? "markdown" : "text",
      temporaryPrompt: {
        name: "生成标签名称",
        category: "命名",
        systemPrompt: "你负责为编辑器草稿生成简洁、准确、便于识别的中文标签名称。",
        userPrompt: userPrompt,
        outputMode: "preview_replace",
      },
    };
  }

  function normalizeSuggestion(value) {
    var firstLine = String(value || "").split(/\r?\n/).map(function (line) { return line.trim(); }).find(Boolean) || "";
    var normalized = firstLine.replace(/^[\s"'“”‘’《》「」『』]+|[\s"'“”‘’《》「」『』]+$/g, "").trim();
    return Array.from(normalized).slice(0, 16).join("");
  }

  async function generate(draft, settings, processText) {
    var state = availability(draft, settings);
    if (!state.available) return state;
    if (typeof processText !== "function") {
      return { available: false, status: "unavailable", message: "当前环境无法调用 AI" };
    }
    try {
      var result = await processText(buildRequest(draft, settings.aiTabNamePrompt));
      var suggestion = normalizeSuggestion(result && result.outputText);
      if (!suggestion) throw new Error("AI 未返回可用名称");
      return { available: true, status: "ready", message: "AI 建议", suggestion: suggestion };
    } catch (error) {
      return { available: true, status: "error", message: String(error || "AI 名称生成失败") };
    }
  }

  function createRequestSession() {
    var current = 0;
    return {
      begin: function () { current += 1; return current; },
      cancel: function () { current += 1; },
      isCurrent: function (requestId) { return requestId === current; },
    };
  }

  var api = { DEFAULT_PROMPT: DEFAULT_PROMPT, availability: availability, buildRequest: buildRequest, normalizeSuggestion: normalizeSuggestion, generate: generate, createRequestSession: createRequestSession };
  globalScope.transferGenieTabNameAi = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
