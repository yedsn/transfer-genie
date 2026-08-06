export type TransferGenieTab = "home" | "marked" | "downloads" | "settings";

export interface TransferGenieActions {
  [key: string]: ((...args: any[]) => any) | null;
}

export interface TransferGenieState {
  activeTab: TransferGenieTab;
  settings: any;
  integrationModules: any[];
  telegramBridgeStatus: any;
  localHttpApiStatus: any;
  homeFeed: Record<string, any>;
  markedPage: Record<string, any>;
  transferTasks: Record<string, any>;
  settingsOps: Record<string, any>;
  settingsWebdav: Record<string, any>;
  settingsForm: Record<string, any>;
  settingsSnapshots: any[];
  settingsSnapshotsLoading: boolean;
  settingsBackupArchives: any[];
  settingsBackupArchivesLoading: boolean;
  manualBackupDialog: Record<string, any>;
  settingsAutoBackup: Record<string, any>;
  appVersion: string;
  lastSettingsSavedAt: number | null;
}

export interface TransferGenieBridge {
  isEnabled: boolean;
  store: TransferGenieState;
  activateTab: (tab: string) => void;
  syncActiveTab: (tab: string) => void;
  syncSettings: (settings: any) => void;
  syncIntegrationModules: (modules: any[]) => void;
  syncTelegramBridgeStatus: (status: any) => void;
  syncLocalHttpApiStatus: (status: any) => void;
  syncHomeFeed: (feedState: Record<string, any>) => void;
  syncMarkedPage: (markedState: Record<string, any>) => void;
  syncTransferTasks: (transferState: Record<string, any>) => void;
  syncSettingsOps: (settingsOpsState: Record<string, any>) => void;
  syncSettingsWebdav: (webdavState: Record<string, any>) => void;
  syncSettingsForm: (formState: Record<string, any>) => void;
  syncSettingsSnapshots: (snapshots: any[]) => void;
  syncSettingsSnapshotsLoading: (isLoading: boolean) => void;
  syncSettingsBackupArchives: (records: any[]) => void;
  syncSettingsBackupArchivesLoading: (isLoading: boolean) => void;
  syncManualBackupDialog: (dialogState: Record<string, any>) => void;
  syncSettingsAutoBackup: (autoBackupState: Record<string, any>) => void;
  syncAppVersion: (version: string) => void;
  callAction: (name: string, ...args: any[]) => any;
  setActions: (nextActions: TransferGenieActions) => void;
}

declare global {
  interface Window {
    transferGenieVue?: TransferGenieBridge;
    transferGenieLegacySetActiveTab?: (tab: string, options?: Record<string, any>) => void;
  }
}
