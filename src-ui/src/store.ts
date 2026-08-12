import { reactive } from "vue";
import type { TransferGenieActions, TransferGenieState, TransferGenieTab } from "./types";

const DEFAULT_TAB: TransferGenieTab = "home";
const VALID_TABS: TransferGenieTab[] = ["home", "marked", "downloads", "settings"];

function cloneValue<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeTab(tab: string): TransferGenieTab {
  return VALID_TABS.includes(tab as TransferGenieTab) ? (tab as TransferGenieTab) : DEFAULT_TAB;
}

export const transferGenieState = reactive<TransferGenieState>({
  activeTab: DEFAULT_TAB,
  settings: null,
  integrationModules: [],
  telegramBridgeStatus: null,
  localHttpApiStatus: null,
  homeFeed: {
    searchQuery: "",
    visibleCount: 0,
    hasMoreMessages: false,
    isLoadingMore: false,
    loadMoreHintText: "",
    emptyMessage: "",
    messageCards: [],
    useVueList: false,
  },
  markedPage: {
    useVueList: false,
    emptyMessage: "",
    currentPage: 1,
    totalPages: 1,
    selectionMode: false,
    selectionCount: 0,
    messages: [],
  },
  transferTasks: {
    useVuePanels: false,
    currentView: "downloads",
    selectionMode: false,
    selectionCount: 0,
    downloadsCount: 0,
    uploadsCount: 0,
    downloadSummary: "",
    uploadSummary: "",
    downloadPage: 1,
    downloadTotalPages: 1,
    uploadPage: 1,
    uploadTotalPages: 1,
    downloadTasks: [],
    uploadTasks: [],
  },
  settingsOps: {
    backupLabel: "\u5907\u4efd WebDAV",
    backupRunning: false,
    restoreLabel: "\u6062\u590d WebDAV",
    restoreRunning: false,
  },
  settingsWebdav: {
    useVueList: false,
    emptyMessage: "",
    endpoints: [],
  },
  settingsForm: {
    senderName: "",
    refreshIntervalSecs: 5,
    defaultEditorFormat: "text",
    downloadDir: "",
    autoStart: false,
    autoUpdateEnabled: false,
    globalHotkeyEnabled: true,
    globalHotkey: "alt+t",
    localHttpApiEnabled: false,
    localHttpApiBindAddress: "127.0.0.1",
    localHttpApiBindPort: 6011,
    copyAfterSend: false,
    telegramAutoStart: false,
    telegramBotToken: "",
    telegramProxyEnabled: false,
    telegramProxyUrl: "http://127.0.0.1:7890",
    telegramChatId: "",
    telegramSenderName: "",
    telegramPollIntervalSecs: 10,
    aiEnabled: false,
    aiProviderKind: "openai_compatible",
    aiBaseUrl: "",
    aiApiKey: "",
    aiModel: "",
    aiTemperature: 0.3,
    aiTimeoutSecs: 60,
    aiDefaultActionId: "polish",
    aiActions: [],
    activeAiActionCategory: "",
    speechToTextEnabled: false,
    speechToTextApiKey: "",
    speechToTextResourceId: "volc.seedasr.sauc.duration",
    speechToTextEndpoint: "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream",
    speechToTextMicrophoneDeviceId: "",
    speechToTextCaptureSystemAudio: false,
    speechToTextSystemAudioDeviceId: "",
    speechToTextShortcutEnabled: false,
    speechToTextShortcut: "right-alt",
    speechToTextMaxDurationSecs: 60,
    speechToTextTaskRetentionCount: 14,
    speechToTextCueSoundEnabled: true,
    speechToTextCueSoundKind: "system",
  },
  settingsSnapshots: [],
  settingsSnapshotsLoading: false,
  settingsBackupArchives: [],
  settingsBackupArchivesLoading: false,
  manualBackupDialog: {
    open: false,
    target: "local-data",
    title: "手动备份",
    name: "",
    note: "",
    loading: false,
  },
  settingsAutoBackup: {
    enabled: false,
    intervalMinutes: 5,
    retainCount: 7,
    settingsSnapshotRetainCount: 7,
    directory: "",
    keepAllDays: 3,
    keepDailyDays: 7,
    hasActiveEndpoint: false,
    lastRunMs: null,
    lastSuccessMs: null,
    lastError: null,
    lastBackupPath: "",
  },
  appVersion: "",
  lastSettingsSavedAt: null,
});

const actions: TransferGenieActions = {};

function callAction(name: string, ...args: any[]): any {
  const action = actions[name];
  if (typeof action === "function") return action(...args);
  return undefined;
}

function syncActiveTab(tab: string) {
  transferGenieState.activeTab = normalizeTab(tab);
}

function activateTab(tab: string) {
  const normalized = normalizeTab(tab);
  syncActiveTab(normalized);
  if (typeof window !== "undefined" && typeof window.transferGenieLegacySetActiveTab === "function") {
    window.transferGenieLegacySetActiveTab(normalized, {
      scrollToBottom: normalized === "home",
      focusInput: normalized === "home",
    });
  }
}

function syncSettings(settings: any) {
  transferGenieState.settings = cloneValue(settings);
  transferGenieState.lastSettingsSavedAt = Date.now();
}

function setActions(nextActions: TransferGenieActions) {
  Object.assign(actions, nextActions || {});
}

export function installTransferGenieBridge() {
  window.transferGenieVue = {
    isEnabled: true,
    store: transferGenieState,
    activateTab,
    syncActiveTab,
    syncSettings,
    syncIntegrationModules: (modules: any[]) => { transferGenieState.integrationModules = Array.isArray(modules) ? cloneValue(modules) : []; },
    syncTelegramBridgeStatus: (status: any) => { transferGenieState.telegramBridgeStatus = cloneValue(status); },
    syncLocalHttpApiStatus: (status: any) => { transferGenieState.localHttpApiStatus = cloneValue(status); },
    syncHomeFeed: (feedState: Record<string, any>) => { transferGenieState.homeFeed = Object.assign({}, transferGenieState.homeFeed, cloneValue(feedState || {})); },
    syncMarkedPage: (markedState: Record<string, any>) => { transferGenieState.markedPage = Object.assign({}, transferGenieState.markedPage, cloneValue(markedState || {})); },
    syncTransferTasks: (transferState: Record<string, any>) => { transferGenieState.transferTasks = Object.assign({}, transferGenieState.transferTasks, cloneValue(transferState || {})); },
    syncSettingsOps: (settingsOpsState: Record<string, any>) => { transferGenieState.settingsOps = Object.assign({}, transferGenieState.settingsOps, cloneValue(settingsOpsState || {})); },
    syncSettingsWebdav: (webdavState: Record<string, any>) => { transferGenieState.settingsWebdav = Object.assign({}, transferGenieState.settingsWebdav, cloneValue(webdavState || {})); },
    syncSettingsForm: (formState: Record<string, any>) => { transferGenieState.settingsForm = Object.assign({}, transferGenieState.settingsForm, cloneValue(formState || {})); },
    syncSettingsSnapshots: (snapshots: any[]) => { transferGenieState.settingsSnapshots = Array.isArray(snapshots) ? cloneValue(snapshots) : []; },
    syncSettingsSnapshotsLoading: (isLoading: boolean) => { transferGenieState.settingsSnapshotsLoading = !!isLoading; },
    syncSettingsBackupArchives: (records: any[]) => { transferGenieState.settingsBackupArchives = Array.isArray(records) ? cloneValue(records) : []; },
    syncSettingsBackupArchivesLoading: (isLoading: boolean) => { transferGenieState.settingsBackupArchivesLoading = !!isLoading; },
    syncManualBackupDialog: (dialogState: Record<string, any>) => { transferGenieState.manualBackupDialog = Object.assign({}, transferGenieState.manualBackupDialog, cloneValue(dialogState || {})); },
    syncSettingsAutoBackup: (autoBackupState: Record<string, any>) => { transferGenieState.settingsAutoBackup = Object.assign({}, transferGenieState.settingsAutoBackup, cloneValue(autoBackupState || {})); },
    syncAppVersion: (version: string) => { transferGenieState.appVersion = String(version || ""); },
    callAction,
    setActions,
  };
}

export function useTransferGenieStore() {
  return { state: transferGenieState, actions, callAction, activateTab };
}
