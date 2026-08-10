import { createApp } from "vue";
import { installTransferGenieBridge, useTransferGenieStore } from "./store";
import "./styles.css";
import ComposerWorkspace from "./workspace/ComposerWorkspace.vue";
import "./workspace/composer.css";
import { composerStore } from "./workspace/composer-store";


function loadLegacyScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(script);
  });
}

async function loadLegacyEditorDeps() {
  const editorCss = document.createElement("link");
  editorCss.rel = "stylesheet";
  editorCss.href = "lib/editor.md/css/editormd.min.css";
  document.head.appendChild(editorCss);

  await loadLegacyScript("lib/jquery/jquery.min.js");
  await loadLegacyScript("lib/editor.md/lib/marked.min.js");
  await loadLegacyScript("lib/editor.md/lib/prettify.min.js");
  await loadLegacyScript("lib/editor.md/lib/raphael.min.js");
  await loadLegacyScript("lib/editor.md/lib/underscore.min.js");
  await loadLegacyScript("lib/editor.md/lib/sequence-diagram.min.js");
  await loadLegacyScript("lib/editor.md/lib/flowchart.min.js");
  await loadLegacyScript("lib/editor.md/lib/jquery.flowchart.min.js");
  await loadLegacyScript("lib/editor.md/editormd.min.js");
}

installTransferGenieBridge();


const store = useTransferGenieStore();
const callAction = (name: string, ...args: any[]) => store.callAction(name, ...args);

const settingsRuntimeStatus = () => (window as any).transferGenieSettingsRuntimeStatus || null;

const app = createApp({
  data() {
    return { ui: store.state };
  },
  computed: {
    runningModuleCount(): number {
      return (store.state.integrationModules || []).filter((m: any) => !!m.running).length;
    },
  },
  methods: {
    activateTab: store.activateTab,

    // --- Formatting ---
    formatRuntimeTime(timestamp: number): string {
      if (!timestamp) return "";
      return new Date(timestamp).toLocaleString();
    },
    formatBytes(value: number): string {
      const size = Number(value || 0);
      if (!isFinite(size) || size <= 0) return "0 B";
      const units = ["B", "KB", "MB", "GB", "TB"];
      const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
      const normalized = size / Math.pow(1024, unitIndex);
      const decimals = unitIndex === 0 || normalized >= 100 ? 0 : normalized >= 10 ? 1 : 2;
      return normalized.toFixed(decimals) + " " + units[unitIndex];
    },

    // --- Marked page ---
    markedPageState(): Record<string, any> {
      return store.state.markedPage || {};
    },
    currentMarkedMessages(): any[] {
      return this.markedPageState().messages || [];
    },
    hasMarkedPagination(): boolean {
      return Number(this.markedPageState().totalPages || 1) > 1;
    },
    markedPageLabel(): string {
      const state = this.markedPageState();
      return Number(state.currentPage || 1) + " / " + Number(state.totalPages || 1);
    },
    markedMessageCardClasses(message: any): Record<string, boolean> {
      return {
        "is-file": !!(message && message.isFile),
        "is-text": !!(message && message.isText),
        "is-pinned": !!(message && message.isPinned),
        "with-selection": !!(message && message.selectionMode),
        "is-selected": !!(message && message.isSelected),
      };
    },
    markedMessageBodyClasses(message: any): Record<string, boolean> {
      return {
        "is-collapsible": !!(message && message.isCollapsible),
        "is-collapsed": !!(message && message.isCollapsible && message.isCollapsed),
      };
    },
    markedMessageBodyStyle(message: any): Record<string, string> {
      const collapseHeight = (message && message.collapseHeight) || 130;
      return { "--message-collapse-height": String(collapseHeight) + "px" };
    },

    // --- Settings ops ---
    settingsOpsState(): Record<string, any> {
      return store.state.settingsOps || {};
    },
    backupWebdavLabel(): string {
      return this.settingsOpsState().backupLabel || "\u5907\u4efd WebDAV";
    },
    restoreWebdavLabel(): string {
      return this.settingsOpsState().restoreLabel || "\u6062\u590d WebDAV";
    },

    // --- Settings WebDAV ---
    settingsWebdavState(): Record<string, any> {
      return store.state.settingsWebdav || {};
    },
    settingsFormState(): Record<string, any> {
      return store.state.settingsForm || {};
    },
    aiActionCategories(): Array<{ name: string; total: number; enabled: number }> {
      const actions = Array.isArray(this.settingsFormState().aiActions) ? this.settingsFormState().aiActions : [];
      const map = new Map<string, { name: string; total: number; enabled: number }>();
      actions.forEach((action: any) => {
        const name = String(action && action.category ? action.category : "通用").trim() || "通用";
        const entry = map.get(name) || { name, total: 0, enabled: 0 };
        entry.total += 1;
        if (action && action.enabled !== false) entry.enabled += 1;
        map.set(name, entry);
      });
      const categories = Array.from(map.values());
      const favorites = actions.filter((action: any) => action && action.favorite);
      if (favorites.length) {
        categories.unshift({
          name: "收藏",
          total: favorites.length,
          enabled: favorites.filter((action: any) => action.enabled !== false).length,
        });
      }
      return categories;
    },
    activeAiActionCategory(): string {
      const categories = this.aiActionCategories();
      const active = String(this.settingsFormState().activeAiActionCategory || "");
      if (categories.some((category) => category.name === active)) return active;
      return categories[0]?.name || "";
    },
    aiActionsForActiveCategory(): Array<{ action: any; index: number }> {
      const active = this.activeAiActionCategory();
      const actions = Array.isArray(this.settingsFormState().aiActions) ? this.settingsFormState().aiActions : [];
      if (active === "收藏") {
        return actions
          .map((action: any, index: number) => ({ action, index }))
          .filter((item: any) => !!item.action?.favorite);
      }
      return actions
        .map((action: any, index: number) => ({ action, index }))
        .filter((item: any) => (String(item.action?.category || "通用").trim() || "通用") === active);
    },
    currentSettingsWebdavEndpoints(): any[] {
      return this.settingsWebdavState().endpoints || [];
    },
    settingsWebdavCardClasses(endpoint: any): Record<string, boolean> {
      return { "is-disabled": !!(endpoint && !endpoint.enabled) };
    },

    // --- Transfer tasks ---
    transferTaskState(): Record<string, any> {
      return store.state.transferTasks || {};
    },
    currentTransferTaskList(): any[] {
      const state = this.transferTaskState();
      return state.currentView === "uploads"
        ? state.uploadTasks || []
        : state.downloadTasks || [];
    },
    currentTransferSummary(): string {
      const state = this.transferTaskState();
      return state.currentView === "uploads"
        ? state.uploadSummary || ""
        : state.downloadSummary || "";
    },
    currentTransferPage(): number {
      const state = this.transferTaskState();
      return state.currentView === "uploads"
        ? Number(state.uploadPage || 1)
        : Number(state.downloadPage || 1);
    },
    currentTransferTotalPages(): number {
      const state = this.transferTaskState();
      return state.currentView === "uploads"
        ? Number(state.uploadTotalPages || 1)
        : Number(state.downloadTotalPages || 1);
    },
    hasTransferPagination(): boolean {
      return this.currentTransferTotalPages() > 1;
    },
    transferTaskPageLabel(): string {
      return this.currentTransferPage() + " / " + this.currentTransferTotalPages();
    },
    transferTaskRowClasses(task: any): Record<string, boolean> {
      return {
        "is-active": !!(task && task.isActive),
        "is-completed": !!(task && task.isCompleted),
        "is-failed": !!(task && task.isFailed),
        "is-selected": !!(task && task.isSelected),
        "with-selection": !!(task && task.selectionMode && task.selectable),
      };
    },
    transferTaskProgressStyle(task: any): Record<string, string> {
      const progress = Number(task && task.progress != null ? task.progress : 0);
      return { "--task-progress": Math.min(100, Math.max(0, progress)) + "%" };
    },

    // --- App version ---
    appVersionText(): string {
      return store.state.appVersion || "\u52A0\u8F7D\u4E2D...";
    },

    // --- Local HTTP API ---
    localHttpApiState(): any {
      return store.state.localHttpApiStatus || null;
    },
    localHttpApiStateLabel(): string {
      const status = this.localHttpApiState();
      const runtime = settingsRuntimeStatus();
      if (runtime && runtime.getLocalHttpApiVisualState) {
        return runtime.getLocalHttpApiVisualState(status).stateLabel;
      }
      const state = status && status.state ? status.state : "disabled";
      if (state === "running") return "\u8FD0\u884C\u4E2D";
      if (state === "start_failed") return "\u542F\u52A8\u5931\u8D25";
      return "\u5DF2\u5173\u95ED";
    },
    localHttpApiAddressText(): string {
      const status = this.localHttpApiState();
      const runtime = settingsRuntimeStatus();
      if (runtime && runtime.getLocalHttpApiVisualState) {
        return runtime.getLocalHttpApiVisualState(status).addressText;
      }
      return (status && status.address) || "\u672A\u914D\u7F6E";
    },
    localHttpApiLastErrorText(): string {
      const status = this.localHttpApiState();
      const runtime = settingsRuntimeStatus();
      if (runtime && runtime.getLocalHttpApiVisualState) {
        return runtime.getLocalHttpApiVisualState(status).lastErrorText;
      }
      return (status && (status.lastError || status.last_error)) || "\u65E0";
    },

    // --- Telegram bridge ---
    telegramBridgeState(): any {
      return store.state.telegramBridgeStatus || null;
    },
    telegramBridgeStateLabel(): string {
      const status = this.telegramBridgeState();
      const runtime = settingsRuntimeStatus();
      if (runtime && runtime.getTelegramBridgeVisualState) {
        return runtime.getTelegramBridgeVisualState(status, this.formatRuntimeTime.bind(this)).stateLabel;
      }
      if (!status) return "\u672A\u83B7\u53D6";
      if (status.running) {
        return status.last_started_ms
          ? "\u8FD0\u884C\u4E2D \u00B7 " + this.formatRuntimeTime(status.last_started_ms)
          : "\u8FD0\u884C\u4E2D";
      }
      if (status.last_stopped_ms) {
        return "\u5DF2\u505C\u6B62 \u00B7 " + this.formatRuntimeTime(status.last_stopped_ms);
      }
      return "\u672A\u8FD0\u884C";
    },
    telegramBridgeLastErrorText(): string {
      const status = this.telegramBridgeState();
      const runtime = settingsRuntimeStatus();
      if (runtime && runtime.getTelegramBridgeVisualState) {
        return runtime.getTelegramBridgeVisualState(status).lastErrorText;
      }
      return (status && (status.lastError || status.last_error)) || "\u65E0";
    },

    // --- Integration modules ---
    moduleKindLabel(module: any): string {
      return module && module.kind === "bridge" ? "Bridge Module" : "Sync Module";
    },
    moduleStateLabel(module: any): string {
      if (!module) return "Unknown";
      if (module.running) return "Running";
      if (module.enabled) return "Idle";
      return "Disabled";
    },
    moduleTimelineText(module: any): string {
      if (!module) return "\u6682\u65E0\u8FD0\u884C\u8BB0\u5F55";
      if (module.lastStartedMs) return "\u6700\u8FD1\u542F\u52A8\uFF1A" + this.formatRuntimeTime(module.lastStartedMs);
      if (module.lastStoppedMs) return "\u6700\u8FD1\u505C\u6B62\uFF1A" + this.formatRuntimeTime(module.lastStoppedMs);
      return "\u6682\u65E0\u8FD0\u884C\u8BB0\u5F55";
    },

    // --- Auto backup ---
    autoBackupStateLabel(): string {
      const state = store.state.settingsAutoBackup || {} as any;
      if (!state.enabled) return "\u5DF2\u5173\u95ED";
      return "\u5DF2\u542F\u7528";
    },
    autoBackupLastErrorText(): string {
      const state = store.state.settingsAutoBackup || {} as any;
      return state.lastError || "\u65E0";
    },
    autoBackupLastRunText(): string {
      const state = store.state.settingsAutoBackup || {} as any;
      if (!state.lastRunMs) return "\u6682\u65E0";
      return this.formatRuntimeTime(state.lastRunMs);
    },
    autoBackupLastSuccessText(): string {
      const state = store.state.settingsAutoBackup || {} as any;
      if (!state.lastSuccessMs) return "\u6682\u65E0";
      return this.formatRuntimeTime(state.lastSuccessMs);
    },
    autoBackupLastPathText(): string {
      const state = store.state.settingsAutoBackup || {} as any;
      return state.lastBackupPath || "\u6682\u65E0";
    },

    // --- Action delegates ---
    openMessagePreview: (...args: any[]) => callAction("openMessagePreview", ...args),
    toggleMessageMarked: (...args: any[]) => callAction("toggleMessageMarked", ...args),
    copyText: (...args: any[]) => callAction("copyText", ...args),
    downloadTextMessageAsFile: (...args: any[]) => callAction("downloadTextMessageAsFile", ...args),
    openMessageFile: (...args: any[]) => callAction("openMessageFile", ...args),
    downloadMessageFile: (...args: any[]) => callAction("downloadMessageFile", ...args),
    saveMessageFileAs: (...args: any[]) => callAction("saveMessageFileAs", ...args),
    deleteSingleMessage: (...args: any[]) => callAction("deleteSingleMessage", ...args),
    changeMarkedPage: (...args: any[]) => callAction("changeMarkedPage", ...args),
    toggleMarkedMessageSelection: (...args: any[]) => callAction("toggleMarkedMessageSelection", ...args),
    openMarkMessageModal: (...args: any[]) => callAction("openMarkMessageModal", ...args),
    toggleMarkedMessagePin: (...args: any[]) => callAction("toggleMarkedMessagePin", ...args),
    toggleMarkedMessageExpanded: (...args: any[]) => callAction("toggleMarkedMessageExpanded", ...args),
    changeTransferTaskPage: (...args: any[]) => callAction("changeTransferTaskPage", ...args),
    toggleTransferTaskSelection: (...args: any[]) => callAction("toggleTransferTaskSelection", ...args),
    saveDownloadHistoryAs: (...args: any[]) => callAction("saveDownloadHistoryAs", ...args),
    redownloadDownloadHistory: (...args: any[]) => callAction("redownloadDownloadHistory", ...args),
    openDownloadHistoryFile: (...args: any[]) => callAction("openDownloadHistoryFile", ...args),
    openDownloadHistoryDir: (...args: any[]) => callAction("openDownloadHistoryDir", ...args),
    deleteDownloadHistoryRecord: (...args: any[]) => callAction("deleteDownloadHistoryRecord", ...args),
    updateSettingsWebdavField: (...args: any[]) => callAction("updateSettingsWebdavField", ...args),
    toggleSettingsWebdavEnabled: (...args: any[]) => callAction("toggleSettingsWebdavEnabled", ...args),
    activateSettingsWebdavEndpoint: (...args: any[]) => callAction("activateSettingsWebdavEndpoint", ...args),
    removeSettingsWebdavEndpoint: (...args: any[]) => callAction("removeSettingsWebdavEndpoint", ...args),
    testSettingsWebdavEndpoint: (...args: any[]) => callAction("testSettingsWebdavEndpoint", ...args),
    refreshSettingsSnapshots: (...args: any[]) => callAction("refreshSettingsSnapshots", ...args),
    clearSettingsSnapshots: (...args: any[]) => callAction("clearSettingsSnapshots", ...args),
    restoreSettingsSnapshot: (...args: any[]) => callAction("restoreSettingsSnapshot", ...args),
    refreshSettingsBackupArchives: (...args: any[]) => callAction("refreshSettingsBackupArchives", ...args),
    clearSettingsBackupArchives: (...args: any[]) => callAction("clearSettingsBackupArchives", ...args),
    restoreSettingsBackupArchive: (...args: any[]) => callAction("restoreSettingsBackupArchive", ...args),
    createLocalDataBackup: (...args: any[]) => callAction("createLocalDataBackup", ...args),
    openManualBackupDialog: (...args: any[]) => callAction("openManualBackupDialog", ...args),
    closeManualBackupDialog: (...args: any[]) => callAction("closeManualBackupDialog", ...args),
    updateManualBackupDialogField: (...args: any[]) => callAction("updateManualBackupDialogField", ...args),
    submitManualBackupDialog: (...args: any[]) => callAction("submitManualBackupDialog", ...args),
    updateSettingsAutoBackupField: (...args: any[]) => callAction("updateSettingsAutoBackupField", ...args),
    updateSettingsFormField: (...args: any[]) => callAction("updateSettingsFormField", ...args),
    updateAiActionField: (...args: any[]) => callAction("updateAiActionField", ...args),
    updateAiActionFavorite: (...args: any[]) => callAction("updateAiActionFavorite", ...args),
    addAiAction: (...args: any[]) => callAction("addAiAction", ...args),
    saveComposerAiPrompt: (...args: any[]) => callAction("saveComposerAiPrompt", ...args),
    removeAiAction: (...args: any[]) => callAction("removeAiAction", ...args),
    selectAiActionCategory: (...args: any[]) => callAction("selectAiActionCategory", ...args),

    // --- Convenience handlers ---
    handleMarkedBodyClick: (message: any) => {
      if (!message || !message.isFile || message.selectionMode) return;
      callAction("openMessageFile", message.message || message);
    },
    handleMarkedCardDoubleClick: (message: any) => {
      if (!message || message.selectionMode) return;
      callAction("openMessagePreview", message.message || message);
    },

    // --- Composer workspace: 消息卡片拖拽源 ---
    startMessageDrag(event: any, card: any) {
      const drag = (window as any).transferGenieWorkspaceDrag;
      const ctx = (window as any).transferGenieComposerDragCtx;
      if (!drag || !ctx) return;
      const message = card?.message || card;
      ctx.payload = drag.createMessageDragPayload(message, card?.headerText || message?.sender);
      if (event.dataTransfer) {
        event.dataTransfer.setData("text/plain", message?.filename || "message");
        event.dataTransfer.effectAllowed = "copy";
      }
    },
    endMessageDrag() {
      const ctx = (window as any).transferGenieComposerDragCtx;
      if (ctx) ctx.payload = null;
    },
    // R3: 消息三点菜单 -> 添加到分栏（停靠为草稿到活动分栏）
    addMessageToWorkspace(message: any) {
      const store = (window as any).transferGenieComposerStore;
      if (store && store.dockMessageAsDraft) {
        const paneId = store.state.activePaneId || store.state.panes[0]?.id;
        if (paneId) store.dockMessageAsDraft(message, paneId, "center");
      }
    },
  },
});

// Shell components must support inline-template and render a single root <slot>
app.component("home-page-shell", { template: "<div style='display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden'><slot /></div>", inheritAttrs: false });
app.component("marked-page-shell", { template: "<div style='display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden'><slot /></div>", inheritAttrs: false });
app.component("downloads-page-shell", { template: "<div style='display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden'><slot /></div>", inheritAttrs: false });
app.component("settings-page-shell", { template: "<div style='display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden'><slot /></div>", inheritAttrs: false });
app.component("composer-workspace", ComposerWorkspace);
(window as any).transferGenieComposerStore = composerStore;

app.mount("#app-shell");
document.getElementById("app-boot-screen")?.remove();

async function loadLegacyRuntime() {
  await loadLegacyEditorDeps();
  await import("./utils/settings-ops-runtime.js");
  await import("./utils/settings-runtime-status.js");
  await import("./utils/feed-state.js");
  await import("./utils/feed-view-model.js");
  await import("./utils/settings-form-runtime.js");
  await import("./legacy-main.js");
}

loadLegacyRuntime();
