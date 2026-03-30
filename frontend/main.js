const tauri = window.__TAURI__ || {};
const invoke = tauri.core?.invoke || tauri.invoke;
const openDialog = tauri.dialog?.open;
const saveDialog = tauri.dialog?.save;
const listen = tauri.event?.listen;
const convertFileSrc = tauri.path?.convertFileSrc;

const messageList = document.getElementById('message-list');
const syncStatus = document.getElementById('sync-status');
const deviceNameLabel = document.getElementById('device-name');
const refreshButton = document.getElementById('refresh-btn');
const refreshLabel = refreshButton ? refreshButton.querySelector('.refresh-label') : null;
const refreshLabelDefault = refreshLabel ? refreshLabel.textContent : '';
const openDownloadDirButton = document.getElementById('open-download-dir');
const downloadsOpenDownloadDirButton = document.getElementById('downloads-open-download-dir');
const uploadTaskPanel = document.getElementById('upload-task-panel');
const uploadTaskList = document.getElementById('upload-task-list');
const uploadTaskSummary = document.getElementById('upload-task-summary');
const downloadTaskPanel = document.getElementById('download-task-panel');
const downloadTaskList = document.getElementById('download-task-list');
const downloadTaskSummary = document.getElementById('download-task-summary');
const downloadTaskTabBadge = document.getElementById('download-task-tab-badge');
const transferTabDownloadsButton = document.getElementById('transfer-tab-downloads');
const transferTabDownloadsCount = document.getElementById('transfer-tab-downloads-count');
const transferTabUploadsButton = document.getElementById('transfer-tab-uploads');
const transferTabUploadsCount = document.getElementById('transfer-tab-uploads-count');
const transferClearButton = document.getElementById('transfer-clear-button');
const downloadToggleSelectionButton = document.getElementById('download-toggle-selection');
const downloadSelectionBar = document.getElementById('download-selection-bar');
const downloadSelectionCount = document.getElementById('download-selection-count');
const downloadSelectAllButton = document.getElementById('download-select-all');
const downloadDeleteSelectedButton = document.getElementById('download-delete-selected');
const downloadCancelSelectionButton = document.getElementById('download-cancel-selection');
const textInput = document.getElementById('text-input');
const markdownEditorContainer = document.getElementById('markdown-editor');
const formatInputs = document.querySelectorAll('input[name="message-format"]');
const sendTextButton = document.getElementById('send-text');
const sendFileButton = document.getElementById('send-file');
const saveSettingsButton = document.getElementById('save-settings');
const settingsPanel = document.querySelector('#tab-settings .settings');
const settingsBody = document.querySelector('#tab-settings .settings-body');
const settingsNavButtons = Array.from(document.querySelectorAll('[data-settings-nav-target]'));
const scrollToBottomButton = document.getElementById('scroll-to-bottom');
const composer = document.querySelector('.composer');
const composerFullscreenToggle = document.getElementById('composer-fullscreen-toggle');
const composerFullscreenIcon = document.getElementById('composer-fullscreen-icon');
const composerMarking = document.getElementById('composer-marking');
const composerMarkToggle = document.getElementById('composer-mark-toggle');
const composerMarkPanel = document.getElementById('composer-mark-panel');
const composerMarkSummary = document.getElementById('composer-mark-summary');
const composerMarkTagList = document.getElementById('composer-mark-tag-list');
const composerMarkNewTagInput = document.getElementById('composer-mark-new-tag-input');
const composerMarkAddTagButton = document.getElementById('composer-mark-add-tag');
const feed = document.querySelector('.feed');
const tabButtons = Array.from(document.querySelectorAll('[data-tab-target]'));
const tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));
const downloadsTabButton = document.querySelector('[data-tab-target="downloads"]');
const downloadsTabLabel = downloadsTabButton ? downloadsTabButton.querySelector('.tab-label') : null;
const downloadsTabCaption = downloadsTabButton ? downloadsTabButton.querySelector('.tab-caption') : null;
const downloadsPageTitle = document.querySelector('#tab-downloads .downloads-page-header h2');
const downloadsPageDescription = document.querySelector('#tab-downloads .downloads-page-header p');
const downloadsPageToolbar = document.querySelector('#tab-downloads .downloads-page-toolbar');
const transferListToolbar = document.querySelector('#tab-downloads .transfer-list-toolbar');
let selectionRow = document.getElementById('selection-row');
let downloadSelectionRow = document.getElementById('download-selection-row');
let transferListActions = document.querySelector('#tab-downloads .transfer-list-actions');
const downloadPanelTitle = downloadTaskPanel
  ? downloadTaskPanel.querySelector('.download-task-panel-header h3')
  : null;

const endpointSelect = document.getElementById('active-endpoint');
const webdavList = document.getElementById('webdav-list');
const addWebdavButton = document.getElementById('add-webdav');
const batchSpeedTestButton = document.getElementById('batch-speed-test');
const senderNameInput = document.getElementById('sender-name');
const telegramSenderNameInput = document.getElementById('telegram-sender-name');
const refreshIntervalInput = document.getElementById('refresh-interval');
const downloadDirInput = document.getElementById('download-dir');
const chooseDownloadDirButton = document.getElementById('choose-download-dir');
const downloadDirHint = document.getElementById('download-dir-hint');
const autoStartInput = document.getElementById('auto-start');
const localHttpApiEnabledInput = document.getElementById('local-http-api-enabled');
const localHttpApiBindAddressInput = document.getElementById('local-http-api-bind-address');
const localHttpApiBindPortInput = document.getElementById('local-http-api-bind-port');
const localHttpApiStatusLabel = document.getElementById('local-http-api-status');
const localHttpApiAddressLabel = document.getElementById('local-http-api-address');
const localHttpApiLastErrorLabel = document.getElementById('local-http-api-last-error');
const localHttpApiStatusText = document.getElementById('local-http-api-status-text');
const telegramAutoStartInput = document.getElementById('telegram-auto-start');
const telegramBotTokenInput = document.getElementById('telegram-bot-token');
const telegramProxyEnabledInput = document.getElementById('telegram-proxy-enabled');
const telegramProxyUrlInput = document.getElementById('telegram-proxy-url');
const telegramChatIdInput = document.getElementById('telegram-chat-id');
const telegramDiscoverChatIdButton = document.getElementById('telegram-discover-chat-id');
const telegramChatCandidates = document.getElementById('telegram-chat-candidates');
const telegramPollIntervalInput = document.getElementById('telegram-poll-interval');
const telegramStartServiceButton = document.getElementById('telegram-start-service');
const telegramStopServiceButton = document.getElementById('telegram-stop-service');
const telegramBridgeStatusLabel = document.getElementById('telegram-bridge-status');
const telegramBridgeLastErrorLabel = document.getElementById('telegram-bridge-last-error');
const globalHotkeyInput = document.getElementById('global-hotkey');
const globalHotkeyEnabledInput = document.getElementById('global-hotkey-enabled');
const sendHotkeyInputs = document.querySelectorAll('input[name="send-hotkey"]');
const toggleSelectionButton = document.getElementById('toggle-selection');
const selectionBar = document.getElementById('selection-bar');
const selectionCount = document.getElementById('selection-count');
const selectAllButton = document.getElementById('select-all');
const deleteSelectedButton = document.getElementById('delete-selected');
const cancelSelectionButton = document.getElementById('cancel-selection');
const cleanupMessagesButton = document.getElementById('cleanup-messages');
const exportSettingsButton = document.getElementById('export-settings');
const importSettingsButton = document.getElementById('import-settings');
const backupWebdavButton = document.getElementById('backup-webdav');
const restoreWebdavButton = document.getElementById('restore-webdav');
const openLogDirButton = document.getElementById('open-log-dir');
const openDataDirButton = document.getElementById('open-data-dir');
const filterMarkedButton = document.getElementById('filter-marked');
const markedTabBadge = document.getElementById('marked-tab-badge');
const markedMessageList = document.getElementById('marked-message-list');
const markedRefreshButton = document.getElementById('marked-refresh-btn');
const markedRefreshLabel = markedRefreshButton ? markedRefreshButton.querySelector('.refresh-label') : null;
const markedSearchInput = document.getElementById('marked-search-input');
const markedSearchButton = document.getElementById('marked-search-button');
const toggleMarkedTagFilterButton = document.getElementById('toggle-marked-tag-filter');
const markedTagFilterPanel = document.getElementById('marked-tag-filter-panel');
const markedTagFilterList = document.getElementById('marked-tag-filter-list');
const markedTagAddButton = document.getElementById('marked-tag-add-button');
let markedToggleSelectionButton = document.getElementById('marked-toggle-selection');
let markedSelectionRow = document.querySelector('.marked-selection-row');
let markedSelectionBar = document.getElementById('marked-selection-bar');
let markedSelectionCount = document.getElementById('marked-selection-count');
let markedSelectAllButton = document.getElementById('marked-select-all');
let markedEditTagsButton = document.getElementById('marked-edit-tags');
let markedDeleteSelectedButton = document.getElementById('marked-delete-selected');
let markedCancelSelectionButton = document.getElementById('marked-cancel-selection');
const markMessageModal = document.getElementById('mark-message-modal');
const markMessageCloseButton = document.getElementById('mark-message-close');
const markMessageCancelButton = document.getElementById('mark-message-cancel');
const markMessageConfirmButton = document.getElementById('mark-message-confirm');
const markMessageNewTagInput = document.getElementById('mark-message-new-tag-input');
const markMessageAddTagButton = document.getElementById('mark-message-add-tag');
const markMessageTagList = document.getElementById('mark-message-tag-list');
const markMessageSubtitle = document.getElementById('mark-message-subtitle');
const messagePreview = document.getElementById('message-preview');
const messagePreviewBody = document.getElementById('message-preview-body');
const messagePreviewMeta = document.getElementById('message-preview-meta');
const messagePreviewActions = document.getElementById('message-preview-actions');
const messagePreviewClose = document.querySelector('.message-preview-close');
const messagePreviewBackdrop = messagePreview ? messagePreview.querySelector('.message-preview-backdrop') : null;
const searchInput = document.getElementById('search-input');
let settingsSections = [];
let activeSettingsSectionId = '';
let settingsNavUpdateQueued = false;

function ensureInlineSelectionRows() {
  if (selectionBar && selectionCount && !selectionRow) {
    const toolbar = selectionBar.closest('.feed-toolbar');
    if (toolbar?.parentElement) {
      selectionRow = document.createElement('div');
      selectionRow.id = 'selection-row';
      selectionRow.className = 'selection-row';
      selectionRow.hidden = true;
      toolbar.insertAdjacentElement('afterend', selectionRow);
    }
  }

  if (selectionRow && selectionBar && selectionCount) {
    if (selectionBar.parentElement !== selectionRow) {
      selectionRow.appendChild(selectionBar);
    }
    if (selectionCount.parentElement !== selectionRow) {
      selectionRow.appendChild(selectionCount);
    }
  }

  if (downloadSelectionBar && downloadSelectionCount && !downloadSelectionRow) {
    const toolbar = document.querySelector('#tab-downloads .transfer-list-toolbar');
    if (toolbar?.parentElement) {
      downloadSelectionRow = document.createElement('div');
      downloadSelectionRow.id = 'download-selection-row';
      downloadSelectionRow.className = 'selection-row';
      downloadSelectionRow.hidden = true;
      toolbar.insertAdjacentElement('afterend', downloadSelectionRow);
    }
  }

  if (downloadSelectionRow && downloadSelectionBar && downloadSelectionCount) {
    if (transferListToolbar && downloadSelectionRow.previousElementSibling !== transferListToolbar) {
      transferListToolbar.insertAdjacentElement('afterend', downloadSelectionRow);
    }
    if (downloadSelectionBar.parentElement !== downloadSelectionRow) {
      downloadSelectionRow.appendChild(downloadSelectionBar);
    }
    if (downloadSelectionCount.parentElement !== downloadSelectionRow) {
      downloadSelectionRow.appendChild(downloadSelectionCount);
    }
  }
}

ensureInlineSelectionRows();

function ensureTransferToolbarActions() {
  if (!transferListToolbar || !transferClearButton) {
    return;
  }
  if (!transferListActions) {
    transferListActions = document.createElement('div');
    transferListActions.className = 'transfer-list-actions';
    transferListToolbar.appendChild(transferListActions);
  }
  if (transferClearButton.parentElement !== transferListActions) {
    transferListActions.appendChild(transferClearButton);
  }
  if (downloadToggleSelectionButton && downloadToggleSelectionButton.parentElement !== transferListActions) {
    transferListActions.appendChild(downloadToggleSelectionButton);
  }
}

ensureTransferToolbarActions();

function ensureMarkedSelectionControls() {
  if (markedSearchInput && !markedToggleSelectionButton) {
    const searchRow = markedSearchInput.closest('.marked-search');
    if (searchRow) {
      markedToggleSelectionButton = document.createElement('button');
      markedToggleSelectionButton.id = 'marked-toggle-selection';
      markedToggleSelectionButton.className = 'button ghost small';
      markedToggleSelectionButton.type = 'button';
      markedToggleSelectionButton.textContent = '选择';
    }
  }

  if (markedMessageList && !markedSelectionBar) {
    const content = markedMessageList.parentElement;
    if (content?.parentElement) {
      const selectionRow = document.createElement('div');
      selectionRow.className = 'marked-selection-row';
      selectionRow.hidden = true;
      markedSelectionRow = selectionRow;

      markedSelectionBar = document.createElement('div');
      markedSelectionBar.id = 'marked-selection-bar';
      markedSelectionBar.className = 'selection-bar';
      markedSelectionBar.hidden = true;

      markedSelectAllButton = document.createElement('button');
      markedSelectAllButton.id = 'marked-select-all';
      markedSelectAllButton.className = 'button ghost small';
      markedSelectAllButton.type = 'button';
      markedSelectAllButton.textContent = '全选';

      markedEditTagsButton = document.createElement('button');
      markedEditTagsButton.id = 'marked-edit-tags';
      markedEditTagsButton.className = 'button ghost small';
      markedEditTagsButton.type = 'button';
      markedEditTagsButton.textContent = '批量标签';

      markedDeleteSelectedButton = document.createElement('button');
      markedDeleteSelectedButton.id = 'marked-delete-selected';
      markedDeleteSelectedButton.className = 'button small';
      markedDeleteSelectedButton.type = 'button';
      markedDeleteSelectedButton.textContent = '删除';

      markedCancelSelectionButton = document.createElement('button');
      markedCancelSelectionButton.id = 'marked-cancel-selection';
      markedCancelSelectionButton.className = 'button ghost small';
      markedCancelSelectionButton.type = 'button';
      markedCancelSelectionButton.textContent = '取消';

      markedSelectionCount = document.createElement('span');
      markedSelectionCount.id = 'marked-selection-count';
      markedSelectionCount.className = 'selection-count';
      markedSelectionCount.hidden = true;
      markedSelectionCount.textContent = '已选中 0 项';

      markedSelectionBar.appendChild(markedSelectAllButton);
      markedSelectionBar.appendChild(markedEditTagsButton);
      markedSelectionBar.appendChild(markedDeleteSelectedButton);
      markedSelectionBar.appendChild(markedCancelSelectionButton);
      selectionRow.appendChild(markedSelectionBar);
      selectionRow.appendChild(markedSelectionCount);
      content.parentElement.insertBefore(selectionRow, content);
    }
  }
}

ensureMarkedSelectionControls();

if (markMessageConfirmButton) {
  markMessageConfirmButton.classList.add('has-spinner');
  if (!markMessageConfirmButton.querySelector('.button-spinner')) {
    const spinner = document.createElement('span');
    spinner.className = 'button-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    markMessageConfirmButton.appendChild(spinner);
  }
}

let selectedFiles = [];

let refreshTimer = null;
let activeRefreshIntervalSecs = 5;
let refreshCountdownSecs = 5;
let didInitialSync = false;
let webdavEndpoints = [];
let activeEndpointId = null;
const downloadProgress = new Map();
const downloadTasks = new Map();
const uploadHistoryTasks = new Map();
const pendingUploads = new Map();
const pendingSends = new Map(); // 待发送消息的状态管理
let lastMessages = [];
const downloadSpeed = new Map();
const uploadSpeed = new Map();
let selectionMode = false;
const selectedMessages = new Set();
let markedSelectionMode = false;
const selectedMarkedMessages = new Set();
let downloadSelectionMode = false;
const selectedDownloadTasks = new Set();
const selectedUploadTasks = new Set();
const expandedTextMessages = new Set();
let currentPreviewMessage = null;
const MESSAGE_BODY_COLLAPSE_HEIGHT = 260;
const MARKED_MESSAGE_BODY_COLLAPSE_HEIGHT = 130;
let isRefreshRunning = false;
let isLoadMessagesRunning = false;
let isLoadSyncStatusRunning = false;
let markedMessages = [];
let visibleMarkedMessages = [];
let markedTags = [];
let activeMarkedTagId = null;
let appliedMarkedSearchQuery = '';
let currentMarkingMessage = null;
let currentMarkingMessages = [];
let currentMarkingMode = 'single';
const selectedMarkTagIds = new Set();
let composerMarkEnabled = false;
const composerSelectedTagIds = new Set();
const composerDeletedTagIds = new Set();
let composerCreatedTags = [];
let composerTagDraftSequence = 0;
let composerMarkPanelHideTimer = null;
let composerMarkPanelRefreshPromise = null;

// 标记列表分页
let markedMessagesPage = 1;
const MARKED_MESSAGES_PER_PAGE = 10;
const UNTAGGED_MARKED_TAG_FILTER_ID = '__untagged__';
let telegramBridgeStatusPollTimer = null;
let currentTransferListView = 'downloads';
let downloadTasksPage = 1;
let uploadTasksPage = 1;
const transferTaskCounts = {
  downloads: 0,
  uploads: 0,
};
const TRANSFER_TASKS_PER_PAGE = 10;
const MANUAL_REFRESH_TIMEOUT_MS = 45_000;
const DEFAULT_TELEGRAM_POLL_INTERVAL_SECS = 5;
const DEFAULT_LOCAL_HTTP_API_BIND_ADDRESS = '127.0.0.1';
const DEFAULT_LOCAL_HTTP_API_BIND_PORT = 6011;
const TELEGRAM_BRIDGE_STATUS_POLL_MS = 5000;
const MAX_RECENT_DOWNLOAD_TASKS = 8;
const MAX_RECENT_UPLOAD_TASKS = 8;

// 发送状态常量
const SEND_STATUS = {
  SENDING: 'sending',
  SUCCESS: 'success',
  FAILED: 'failed',
};

const DEFAULT_GLOBAL_HOTKEY = 'alt+t';

const SEND_HOTKEY = {
  ENTER: 'enter',
  CTRL_ENTER: 'ctrl_enter',
};
let sendHotkey = SEND_HOTKEY.ENTER;
let isComposerFullscreen = false;
const LABEL_EXPAND_COMPOSER = '\u653e\u5927\u8f93\u5165\u6846'; // 放大输入框
const LABEL_EXIT_FULLSCREEN = '\u9000\u51fa\u5168\u5c4f'; // 退出全屏
const ICON_EXPAND = 'icons/fullscreen.svg';
const ICON_EXIT = 'icons/fullscreen-exit.svg';
const MARKDOWN_EDITOR_DEFAULT_HEIGHT = 200;

// Markdown Editor instance
let mdEditor = null;
let currentFormat = 'text';

function initMarkdownEditor() {
  if (mdEditor) return;
  
  mdEditor = editormd("markdown-editor", {
    width: "100%",
    height: MARKDOWN_EDITOR_DEFAULT_HEIGHT,
    path: "lib/editor.md/lib/",
    pluginPath: "lib/editor.md/plugins/",
    placeholder: "使用 Markdown 输入消息...",
    watch: true,
    toolbar: true,
    codeFold: true,
    searchReplace: true,
    flowChart: true,
    sequenceDiagram: true,
    toolbarIcons: function() {
      return ["bold", "italic", "quote", "|", "h1", "h2", "h3", "|", "list-ul", "list-ol", "|", "link", "code", "code-block", "table", "datetime", "|", "flowchart", "sequence-diagram", "|", "watch", "preview", "clear", "help"];
    },
    toolbarIconsClass: {
        flowchart: "fa-random", 
        "sequence-diagram": "fa-exchange"
    },
    toolbarHandlers: {
        flowchart: function(cm, icon, cursor, selection) {
            cm.replaceSelection("```flow\nst=>start: Start\nop=>operation: Your Operation\ncond=>condition: Yes or No?\ne=>end: End\n\nst->op->cond\ncond(yes)->e\ncond(no)->op\n```");
            if(selection === "") {
                cm.setCursor(cursor.line, cursor.ch + 8);
            }
        },
        "sequence-diagram": function(cm, icon, cursor, selection) {
            cm.replaceSelection("```seq\nAlice->Bob: Hello Bob, how are you?\nNote right of Bob: Bob thinks\nBob-->Alice: I am good thanks!\n```");
            if(selection === "") {
                cm.setCursor(cursor.line, cursor.ch + 8);
            }
        }
    },
    lang: {
        toolbar: {
            flowchart: "插入流程图",
            "sequence-diagram": "插入时序图"
        }
    },
    onload: function() {
      const cm = this.cm;
      cm.on("keydown", (cm, event) => {
        if (event.key === 'Escape') {
          minimizeAppWindow();
          return;
        }
        if (event.key === 'Enter') {
          const isCtrlLike = event.ctrlKey || event.metaKey;
          if (isCtrlLike) {
            event.preventDefault();
            sendText();
          }
        }
      });
    }
  });
}

function switchFormat(format) {
  currentFormat = format;
  if (format === 'markdown') {
    textInput.style.display = 'none';
    markdownEditorContainer.style.display = 'block';
    initMarkdownEditor();
  } else {
    textInput.style.display = 'block';
    markdownEditorContainer.style.display = 'none';
  }
}

function updateFormatToggleIndicator() {
  const toggle = document.querySelector('.format-toggle');
  if (!toggle) return;

  const indicator = toggle.querySelector('.active-tab-indicator');
  const activeRadio = toggle.querySelector('input[name="message-format"]:checked');
  if (!indicator || !activeRadio) return;
  
  const activeLabel = activeRadio.closest('.radio-tab');
  if (!activeLabel) return;

  indicator.style.left = `${activeLabel.offsetLeft}px`;
  indicator.style.width = `${activeLabel.offsetWidth}px`;
}

if (formatInputs) {
  formatInputs.forEach(input => {
    input.addEventListener('change', () => {
      if (input.checked) {
        switchFormat(input.value);
        setTimeout(updateFormatToggleIndicator, 50);
      }
    });
  });

  window.addEventListener('load', () => {
    setTimeout(updateFormatToggleIndicator, 50);
  });
  window.addEventListener('resize', () => {
    setTimeout(updateFormatToggleIndicator, 50);
  });
}

// 分页相关状态
const PAGE_SIZE = 10;
let currentOffset = 0;
let totalMessages = 0;
let hasMoreMessages = false;
let isLoadingMore = false;

function syncCurrentOffsetWithLoadedMessages() {
  currentOffset = Math.max(0, lastMessages.length - PAGE_SIZE);
}

function resetLoadedMessagesState() {
  currentOffset = 0;
  lastMessages = [];
  hasMoreMessages = false;
}

function formatBytes(bytes) {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
}

function formatTime(timestampMs) {
  if (!timestampMs) return '';
  return new Date(timestampMs).toLocaleString('zh-CN');
}

function setStatus(text) {
  syncStatus.textContent = text;
  syncStatus.style.color = '';
}

function setSuccessStatus(text) {
  syncStatus.textContent = text;
  syncStatus.style.color = '#2e7d32';
}

function setErrorStatus(text) {
  syncStatus.textContent = text;
  syncStatus.style.color = '#d6452d';
}

function normalizeSendHotkey(value) {
  const normalized = (value || '').toLowerCase().trim();
  if (normalized === SEND_HOTKEY.CTRL_ENTER || normalized === 'ctrl+enter') {
    return SEND_HOTKEY.CTRL_ENTER;
  }
  return SEND_HOTKEY.ENTER;
}

function updateComposerHint() {
  if (!textInput) return;
  if (sendHotkey === SEND_HOTKEY.CTRL_ENTER) {
    textInput.placeholder = '输入消息...（Enter 换行，Ctrl+Enter 发送）';
  } else {
    textInput.placeholder = '输入消息...（Enter 发送，Ctrl+Enter 换行）';
  }
}

function setSendHotkey(value) {
  sendHotkey = normalizeSendHotkey(value);
  if (sendHotkeyInputs && sendHotkeyInputs.length > 0) {
    sendHotkeyInputs.forEach((input) => {
      input.checked = input.value === sendHotkey;
    });
  }
  updateComposerHint();
}

setSendHotkey(sendHotkey);

async function persistSendHotkeySetting() {
  if (!invoke) return;
  try {
    await invoke('save_send_hotkey', { sendHotkey: sendHotkey });
  } catch (error) {
    console.warn('保存发送快捷键失败：', error);
  }
}

function setComposerFullscreen(enabled) {
  if (!composer) return;
  isComposerFullscreen = enabled;
  composer.classList.toggle('is-fullscreen', enabled);
  document.body.classList.toggle('composer-fullscreen-active', enabled);
  if (composerFullscreenToggle) {
    const label = enabled ? LABEL_EXIT_FULLSCREEN : LABEL_EXPAND_COMPOSER;
    composerFullscreenToggle.title = label;
    composerFullscreenToggle.setAttribute('aria-label', label);
    if (composerFullscreenIcon) {
      composerFullscreenIcon.src = enabled ? ICON_EXIT : ICON_EXPAND;
    }
  }
  if (mdEditor && typeof mdEditor.resize === 'function') {
    mdEditor.resize('100%', enabled ? '100%' : MARKDOWN_EDITOR_DEFAULT_HEIGHT);
  }
  if (enabled) {
    setTimeout(() => {
      if (currentFormat === 'markdown' && mdEditor) {
        mdEditor.focus();
      } else if (textInput) {
        textInput.focus();
      }
    }, 0);
  }
}

function exitComposerFullscreenAfterSendSuccess() {
  if (!isComposerFullscreen) return;
  setComposerFullscreen(false);
  focusHomeComposer({ scrollToBottom: false });
}

function nextComposerDraftTagId() {
  composerTagDraftSequence += 1;
  return `draft-tag-${Date.now()}-${composerTagDraftSequence}`;
}

function cancelComposerMarkPanelHide() {
  if (composerMarkPanelHideTimer) {
    clearTimeout(composerMarkPanelHideTimer);
    composerMarkPanelHideTimer = null;
  }
}

function refreshComposerMarkPanelTags() {
  if (!composerMarkPanelRefreshPromise) {
    composerMarkPanelRefreshPromise = loadMarkedTags().finally(() => {
      composerMarkPanelRefreshPromise = null;
    });
  }
  return composerMarkPanelRefreshPromise;
}

async function openComposerMarkPanel() {
  cancelComposerMarkPanelHide();
  composerMarking?.classList.add('is-open');
  await refreshComposerMarkPanelTags();
}

function scheduleComposerMarkPanelHide() {
  cancelComposerMarkPanelHide();
  composerMarkPanelHideTimer = setTimeout(() => {
    composerMarking?.classList.remove('is-open');
    composerMarkPanelHideTimer = null;
  }, 300);
}

function getComposerDraftTags() {
  const persisted = (Array.isArray(markedTags) ? markedTags : []).map((tag) => ({
    ...tag,
    isDraft: false,
    pendingDelete: composerDeletedTagIds.has(tag.id),
  }));
  const draft = composerCreatedTags.map((tag) => ({
    ...tag,
    isDraft: true,
    pendingDelete: false,
  }));
  return [...persisted, ...draft];
}

function pruneComposerSelectedTagIds() {
  const validIds = new Set(
    getComposerDraftTags()
      .filter((tag) => !tag.pendingDelete)
      .map((tag) => tag.id),
  );
  Array.from(composerSelectedTagIds).forEach((tagId) => {
    if (!validIds.has(tagId)) {
      composerSelectedTagIds.delete(tagId);
    }
  });
}

function syncComposerMarkToggleState() {
  if (!composerMarkToggle) return;
  composerMarkToggle.classList.toggle('is-marked', composerMarkEnabled);
  composerMarkToggle.setAttribute('aria-pressed', composerMarkEnabled ? 'true' : 'false');
  composerMarkToggle.title = composerMarkEnabled ? '取消标记' : '标记';
  composerMarkToggle.setAttribute('aria-label', composerMarkEnabled ? '取消标记' : '标记');
  if (composerMarkSummary) {
    const selectedCount = getComposerDraftTags().filter(
      (tag) => !tag.pendingDelete && composerSelectedTagIds.has(tag.id),
    ).length;
    composerMarkSummary.textContent = composerMarkEnabled
      ? selectedCount > 0
        ? `已标记 · ${selectedCount} 个标签`
        : '已标记 · 无标签'
      : '未标记';
    composerMarkSummary.classList.toggle('is-active', composerMarkEnabled);
  }
}

function renderComposerMarkTagList() {
  if (!composerMarkTagList) return;
  pruneComposerSelectedTagIds();
  composerMarkTagList.innerHTML = '';
  const tags = getComposerDraftTags();
  if (tags.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'marked-tag-empty';
    empty.textContent = '还没有标签，可先新增后发送。';
    composerMarkTagList.appendChild(empty);
    syncComposerMarkToggleState();
    return;
  }

  tags.forEach((tag) => {
    const item = document.createElement('label');
    item.className = 'mark-message-tag-item composer-mark-tag-item';
    item.classList.toggle('is-active', !tag.pendingDelete && composerSelectedTagIds.has(tag.id));
    item.classList.toggle('is-pending-delete', tag.pendingDelete);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !tag.pendingDelete && composerSelectedTagIds.has(tag.id);
    checkbox.disabled = tag.pendingDelete;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        composerSelectedTagIds.add(tag.id);
        composerMarkEnabled = true;
      } else {
        composerSelectedTagIds.delete(tag.id);
      }
      renderComposerMarkTagList();
    });

    const text = document.createElement('span');
    text.textContent = tag.pendingDelete ? `${tag.name}（发送后删除）` : tag.name;

    const removeButton = document.createElement('span');
    removeButton.className = 'marked-tag-chip-delete';
    removeButton.textContent = tag.isDraft ? '×' : tag.pendingDelete ? '撤' : '×';
    removeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (tag.isDraft) {
        composerCreatedTags = composerCreatedTags.filter((item) => item.id !== tag.id);
        composerSelectedTagIds.delete(tag.id);
      } else if (tag.pendingDelete) {
        composerDeletedTagIds.delete(tag.id);
      } else {
        composerDeletedTagIds.add(tag.id);
        composerSelectedTagIds.delete(tag.id);
      }
      renderComposerMarkTagList();
    });

    item.appendChild(checkbox);
    item.appendChild(text);
    item.appendChild(removeButton);
    composerMarkTagList.appendChild(item);
  });

  syncComposerMarkToggleState();
}

function resetComposerMarkDraft() {
  composerMarkEnabled = false;
  composerSelectedTagIds.clear();
  composerDeletedTagIds.clear();
  composerCreatedTags = [];
  if (composerMarkNewTagInput) {
    composerMarkNewTagInput.value = '';
  }
  renderComposerMarkTagList();
}

function normalizeComposerDraftAfterSuccessfulSend(result) {
  const resolvedTagIds = Array.isArray(result?.markedTagIds) ? result.markedTagIds : [];
  composerCreatedTags = [];
  composerDeletedTagIds.clear();
  composerSelectedTagIds.clear();
  resolvedTagIds.forEach((tagId) => composerSelectedTagIds.add(tagId));
  renderComposerMarkTagList();
}

function hasComposerDraftTagName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return false;
  return getComposerDraftTags()
    .filter((tag) => !tag.pendingDelete)
    .some((tag) => String(tag.name || '').trim().toLowerCase() === normalized);
}

function getComposerMarkedOptions() {
  return {
    marked: composerMarkEnabled,
    selectedTagIds: Array.from(composerSelectedTagIds).filter(
      (tagId) =>
        !composerDeletedTagIds.has(tagId)
        && !composerCreatedTags.some((tag) => tag.id === tagId),
    ),
    createdTags: composerCreatedTags.map((tag) => ({
      name: tag.name,
      selected: composerSelectedTagIds.has(tag.id),
    })),
    deletedTagIds: Array.from(composerDeletedTagIds),
  };
}

function cloneComposerMarkedOptions(options) {
  return {
    marked: !!options?.marked,
    selectedTagIds: Array.isArray(options?.selectedTagIds) ? [...options.selectedTagIds] : [],
    createdTags: Array.isArray(options?.createdTags)
      ? options.createdTags.map((tag) => ({
        name: tag.name,
        selected: !!tag.selected,
      }))
      : [],
    deletedTagIds: Array.isArray(options?.deletedTagIds) ? [...options.deletedTagIds] : [],
  };
}

function normalizeGlobalHotkey(value) {
  if (!value) return '';
  const normalized = value.toLowerCase().trim();
  const parts = normalized
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return '';
  const hasModifier = parts.some((part) =>
    ['ctrl', 'control', 'alt', 'shift', 'meta', 'super', 'win', 'cmd', 'command'].includes(part),
  );
  if (!hasModifier) return '';
  return parts.join('+');
}

function isImagePath(path) {
    if (!path) return false;
    const lower = path.toLowerCase();
    return lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif') || lower.endsWith('.webp') || lower.endsWith('.bmp');
}

function isValidGlobalHotkey(value) {
  return !!normalizeGlobalHotkey(value);
}

function syncGlobalHotkeyInputState() {
  if (!globalHotkeyInput || !globalHotkeyEnabledInput) return;
  globalHotkeyInput.disabled = !globalHotkeyEnabledInput.checked;
}

async function minimizeAppWindow() {
  if (!invoke) {
    setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
    return;
  }
  try {
    await invoke('minimize_window');
  } catch (error) {
    setErrorStatus(`最小化失败：${error}`);
  }
}

async function tryOpenMessageFile(message) {
  if (!invoke) {
    return { ok: false, error: '未检测到 Tauri API，请检查 app.withGlobalTauri 设置' };
  }
  const originalName = message.original_name || message.filename || '';
  try {
    await invoke('open_message_file', {
      filename: message.filename,
      originalName,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

async function openMessageFile(message) {
  if (!message || message.kind !== 'file') {
    return;
  }
  if (message.uploading) {
    return;
  }
  if (!message.filename) {
    return;
  }
  if (hasLocalMessageFile(message)) {
    const opened = await tryOpenMessageFile(message);
    if (opened.ok) {
      return;
    }
    if (!opened.error || !opened.error.includes('文件不存在')) {
      setErrorStatus(`打开失败：${opened.error}`);
      return;
    }
  }
  if (!invoke) {
    setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
    return;
  }
  let task = null;
  try {
    task = createDownloadTask(message, 'open');
    const result = await invoke('download_message_file', {
      filename: message.filename,
      originalName: message.original_name,
      conflictAction: 'overwrite',
    });
    if (result.status && result.status !== 'saved') {
      setDownloadTaskResult(task.key, {
        status: 'error',
        error: '下载失败',
      });
      setErrorStatus('下载失败');
      return;
    }
    setDownloadTaskResult(task.key, {
      status: 'complete',
      path: result.path || '',
      error: '',
    });
    updateMessageDownloadStatus(message.filename, task.endpointId);
  } catch (error) {
    const key = task?.key || getDownloadTaskKey(message.filename, activeEndpointId || '');
    setDownloadTaskResult(key, {
      status: 'error',
      error: String(error),
    });
    setErrorStatus(`下载失败：${error}`);
    return;
  }
  const opened = await tryOpenMessageFile(message);
  if (!opened.ok) {
    setErrorStatus(`打开失败：${opened.error}`);
  }
}

function setRefreshLoading(loading) {
  if (!refreshButton) return;
  refreshButton.classList.toggle('is-loading', loading);
  refreshButton.disabled = loading;
  if (refreshLabel) {
    refreshLabel.textContent = loading ? '刷新中...' : refreshLabelDefault || '刷新';
  }
  updateRefreshCountdown();
}

function hasLocalMessageFile(message) {
  return !!(message && message.local_path && String(message.local_path).trim());
}

function prepareWindowForHide() {
  setComposerFullscreen(false);
  const textRadio = document.querySelector('input[name="message-format"][value="text"]');
  if (textRadio) {
    textRadio.checked = true;
  }
  switchFormat('text');
  requestAnimationFrame(updateFormatToggleIndicator);
  setActiveTab('home', { scrollToBottom: false, focusInput: false });
}

function generateEndpointId() {
  return `endpoint-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getEndpointLabel(endpoint) {
  const name = endpoint?.name?.trim();
  if (name) {
    return name;
  }
  const url = endpoint?.url?.trim() || '';
  if (!url) {
    return '未命名端点';
  }
  try {
    const parsed = new URL(url);
    const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/$/, '') : '';
    return path ? `${parsed.host}${path}` : parsed.host;
  } catch (error) {
    return url;
  }
}

function getActiveEndpoint() {
  return webdavEndpoints.find(
    (endpoint) => endpoint.id === activeEndpointId && endpoint.enabled && endpoint.url.trim(),
  );
}

function renderEndpointSelect() {
  if (!endpointSelect) return;
  endpointSelect.innerHTML = '';
  const enabledEndpoints = webdavEndpoints.filter(
    (endpoint) => endpoint.enabled && endpoint.url.trim(),
  );
  if (enabledEndpoints.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '未启用 WebDAV 端点';
    endpointSelect.appendChild(option);
    endpointSelect.disabled = true;
    return;
  }
  endpointSelect.disabled = false;
  const hasActive = enabledEndpoints.some((endpoint) => endpoint.id === activeEndpointId);
  if (!hasActive) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '请选择 WebDAV 端点';
    placeholder.disabled = true;
    placeholder.selected = true;
    endpointSelect.appendChild(placeholder);
  }
  enabledEndpoints.forEach((endpoint) => {
    const option = document.createElement('option');
    option.value = endpoint.id;
    option.textContent = getEndpointLabel(endpoint);
    if (endpoint.id === activeEndpointId) {
      option.selected = true;
    }
    endpointSelect.appendChild(option);
  });
}


function renderWebdavEndpoints() {
  if (!webdavList) return;
  webdavList.innerHTML = '';
  if (webdavEndpoints.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'endpoint-empty';
    empty.textContent = '暂无 WebDAV 端点';
    webdavList.appendChild(empty);
    syncTelegramControlsState();
    return;
  }
  webdavEndpoints.forEach((endpoint) => {
    const card = document.createElement('div');
    card.className = 'endpoint-card';
    card.dataset.endpointId = endpoint.id;
    card.classList.toggle('is-disabled', !endpoint.enabled);

    const header = document.createElement('div');
    header.className = 'endpoint-card-header';

    const title = document.createElement('span');
    title.className = 'endpoint-title';
    title.textContent = getEndpointLabel(endpoint);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'button ghost small';
    removeButton.textContent = '移除';

    header.appendChild(title);
    header.appendChild(removeButton);

    const fields = document.createElement('div');
    fields.className = 'endpoint-fields';

    const nameLabel = document.createElement('label');
    nameLabel.textContent = '名称';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = '例如：公司网盘';
    nameInput.value = endpoint.name || '';
    nameLabel.appendChild(nameInput);

    const urlLabel = document.createElement('label');
    urlLabel.textContent = 'WebDAV URL';
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'https://example.com/webdav/';
    urlInput.value = endpoint.url || '';
    urlLabel.appendChild(urlInput);

    const userLabel = document.createElement('label');
    userLabel.textContent = '用户名';
    const userInput = document.createElement('input');
    userInput.type = 'text';
    userInput.value = endpoint.username || '';
    userLabel.appendChild(userInput);

    const passLabel = document.createElement('label');
    passLabel.textContent = '密码';
    const passInput = document.createElement('input');
    passInput.type = 'password';
    passInput.value = endpoint.password || '';
    passLabel.appendChild(passInput);

    fields.appendChild(nameLabel);
    fields.appendChild(urlLabel);
    fields.appendChild(userLabel);
    fields.appendChild(passLabel);

    const actions = document.createElement('div');
    actions.className = 'endpoint-actions';

    const enabledLabel = document.createElement('label');
    enabledLabel.className = 'toggle';
    const enabledInput = document.createElement('input');
    enabledInput.type = 'checkbox';
    enabledInput.checked = !!endpoint.enabled;
    enabledLabel.appendChild(enabledInput);
    enabledLabel.append('启用');

    const activeLabel = document.createElement('label');
    activeLabel.className = 'toggle';
    const activeInput = document.createElement('input');
    activeInput.type = 'radio';
    activeInput.name = 'active-endpoint-radio';
    activeInput.checked = endpoint.id === activeEndpointId;
    activeInput.disabled = !endpoint.enabled;
    activeLabel.appendChild(activeInput);
    activeLabel.append('当前');

    const speedTestButton = document.createElement('button');
    speedTestButton.type = 'button';
    speedTestButton.className = 'button ghost small';
    speedTestButton.textContent = '测速';
    speedTestButton.disabled = !endpoint.url.trim();

    const speedTestResult = document.createElement('div');
    speedTestResult.className = 'speed-test-result';
    speedTestResult.style.display = 'none';

    actions.appendChild(enabledLabel);
    actions.appendChild(activeLabel);
    actions.appendChild(speedTestButton);

    nameInput.addEventListener('input', () => {
      endpoint.name = nameInput.value;
      title.textContent = getEndpointLabel(endpoint);
      renderEndpointSelect();
    });
    urlInput.addEventListener('input', () => {
      endpoint.url = urlInput.value;
      title.textContent = getEndpointLabel(endpoint);
      speedTestButton.disabled = !endpoint.url.trim();
      if (!endpoint.url.trim() && activeEndpointId === endpoint.id) {
        activeEndpointId = null;
        activeInput.checked = false;
      }
      renderEndpointSelect();
    });
    userInput.addEventListener('input', () => {
      endpoint.username = userInput.value;
    });
    passInput.addEventListener('input', () => {
      endpoint.password = passInput.value;
    });
    enabledInput.addEventListener('change', () => {
      endpoint.enabled = enabledInput.checked;
      card.classList.toggle('is-disabled', !endpoint.enabled);
      activeInput.disabled = !endpoint.enabled;
      if (!endpoint.enabled && activeEndpointId === endpoint.id) {
        activeEndpointId = null;
        activeInput.checked = false;
      }
      renderEndpointSelect();
    });
    activeInput.addEventListener('change', () => {
      if (activeInput.checked) {
        activeEndpointId = endpoint.id;
        renderEndpointSelect();
      }
    });
    removeButton.addEventListener('click', () => {
      webdavEndpoints = webdavEndpoints.filter((item) => item.id !== endpoint.id);
      if (activeEndpointId === endpoint.id) {
        activeEndpointId = null;
      }
      renderWebdavEndpoints();
      renderEndpointSelect();
    });

    speedTestButton.addEventListener('click', async () => {
      if (!endpoint.url.trim()) {
        setErrorStatus('请先填写 WebDAV URL');
        return;
      }
      speedTestButton.disabled = true;
      speedTestButton.textContent = '测速中...';
      speedTestResult.style.display = 'none';

      try {
        const result = await invoke('test_webdav_speed', {
          endpoint: {
            id: endpoint.id,
            name: endpoint.name,
            url: endpoint.url,
            username: endpoint.username,
            password: endpoint.password,
            enabled: endpoint.enabled,
          },
        });

        const uploadSpeed = result.upload_speed_mbps || 0;
        const downloadSpeed = result.download_speed_mbps || 0;
        speedTestResult.innerHTML = `
          <div class="speed-test-item">
            <span class="speed-test-label">上传：</span>
            <span class="speed-test-value">${uploadSpeed.toFixed(2)} MB/s</span>
          </div>
          <div class="speed-test-item">
            <span class="speed-test-label">下载：</span>
            <span class="speed-test-value">${downloadSpeed.toFixed(2)} MB/s</span>
          </div>
        `;
        speedTestResult.style.display = 'flex';
        setSuccessStatus('测速完成');
      } catch (error) {
        speedTestResult.innerHTML = '';
        speedTestResult.style.display = 'none';
        setErrorStatus(`测速失败：${error}`);
      } finally {
        speedTestButton.disabled = false;
        speedTestButton.textContent = '测速';
      }
    });


    card.appendChild(header);
    card.appendChild(fields);
    card.appendChild(actions);
    card.appendChild(speedTestResult);
    webdavList.appendChild(card);
  });
  syncTelegramControlsState();
}

function collectEndpointPayload() {
  return webdavEndpoints.map((endpoint) => ({
    id: endpoint.id,
    name: (endpoint.name || '').trim(),
    url: (endpoint.url || '').trim(),
    username: (endpoint.username || '').trim(),
    password: endpoint.password || '',
    enabled: !!endpoint.enabled,
  }));
}

function formatProgress(received, total, label = '已下载', speed = 0) {
  const speedText = speed > 0 ? `${formatBytes(speed)}/s` : '';
  if (!total) {
    return [formatBytes(received), label, speedText].filter(Boolean).join(' · ');
  }
  const percent = Math.min(100, Math.round((received / total) * 100));
  return [
    `${percent}%`,
    `${formatBytes(received)} / ${formatBytes(total)}`,
    speedText,
  ]
    .filter(Boolean)
    .join(' · ');
}

function normalizeByteOffset(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function getDownloadTransferModeLabel(task) {
  switch (task?.transferMode) {
    case 'resumed':
      return '\u7ee7\u7eed\u4e0b\u8f7d';
    case 'restarted':
      return '\u91cd\u65b0\u4e0b\u8f7d';
    case 'fresh':
      return '\u65b0\u4e0b\u8f7d';
    default:
      return '';
  }
}

function formatDownloadActiveRange(task) {
  const start = normalizeByteOffset(task?.rangeStart);
  const end = normalizeByteOffset(task?.rangeEnd);
  if (start === null && end === null) {
    return '';
  }
  if (start !== null && end !== null && end >= start) {
    return `\u5f53\u524d\u533a\u6bb5 ${formatBytes(start)} - ${formatBytes(end + 1)}`;
  }
  if (start !== null) {
    return `\u5f53\u524d\u4ece ${formatBytes(start)} \u5f00\u59cb`;
  }
  return '';
}

function formatDownloadProgressText(task, speed = 0, includeConnectionLabel = false) {
  const parts = [];
  if (includeConnectionLabel) {
    parts.push('\u5355\u8fde\u63a5');
  }
  const mode = getDownloadTransferModeLabel(task);
  if (mode) {
    parts.push(mode);
  }
  const range = formatDownloadActiveRange(task);
  if (range) {
    parts.push(range);
  }
  parts.push(formatProgress(task?.received || 0, task?.total, '\u5df2\u4e0b\u8f7d', speed));
  return parts.filter(Boolean).join(' | ');
}

function getDownloadTaskDisplayStateLabel(task) {
  if (!task) {
    return '';
  }
  if (task.status === 'progress') {
    if (task.transferMode === 'resumed') {
      return '\u7ee7\u7eed\u4e0b\u8f7d\u4e2d';
    }
    if (task.transferMode === 'restarted') {
      return '\u91cd\u65b0\u4e0b\u8f7d\u4e2d';
    }
  }
  return getDownloadTaskStateLabel(task);
}

function escapeSelector(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

function updateSpeedTracker(map, key, received) {
  const now = Date.now();
  const previous = map.get(key);
  let speed = 0;
  if (previous) {
    const deltaBytes = received - previous.received;
    const deltaMs = now - previous.timestamp;
    if (deltaMs > 0 && deltaBytes >= 0) {
      speed = deltaBytes / (deltaMs / 1000);
    } else {
      speed = previous.speed || 0;
    }
  }
  map.set(key, {
    received,
    timestamp: now,
    speed,
  });
  return speed;
}

function getSpeed(map, key) {
  return map.get(key)?.speed || 0;
}

function uploadStatusLabel(upload) {
  if (!upload || !upload.total) {
    return '已上传';
  }
  if (upload.received >= upload.total) {
    return '等待确认';
  }
  return '已上传';
}

function getCurrentEndpointMeta() {
  const endpoint = getActiveEndpoint();
  return {
    endpointId: endpoint?.id || activeEndpointId || '',
    endpointLabel: endpoint ? getEndpointLabel(endpoint) : '未选择端点',
  };
}

function getDownloadTaskKey(filename, endpointId = activeEndpointId) {
  return `${endpointId || 'default'}::${filename || ''}`;
}

function isDownloadTaskActive(task) {
  return !!task && (task.status === 'queued' || task.status === 'progress');
}

function getDownloadTask(filename, endpointId = activeEndpointId) {
  if (!filename) {
    return null;
  }
  if (endpointId) {
    const direct = downloadTasks.get(getDownloadTaskKey(filename, endpointId));
    if (direct) {
      return direct;
    }
  }
  for (const task of downloadTasks.values()) {
    if (task.filename === filename && isDownloadTaskActive(task)) {
      return task;
    }
  }
  return null;
}

function getDownloadTaskStateLabel(task) {
  if (!task) {
    return '';
  }
  if (task.status === 'complete') {
    return '已完成';
  }
  if (task.status === 'error') {
    return '失败';
  }
  if (task.status === 'progress') {
    return '下载中';
  }
  return '准备中';
}

function trimDownloadTasks() {
  const activeTasks = [];
  const inactiveTasks = [];
  downloadTasks.forEach((task) => {
    if (isDownloadTaskActive(task)) {
      activeTasks.push(task);
    } else {
      inactiveTasks.push(task);
    }
  });
  inactiveTasks.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const persistedKeys = inactiveTasks
    .filter((task) => task.persisted || task.historyId)
    .map((task) => task.key);
  const keepKeys = new Set([
    ...activeTasks.map((task) => task.key),
    ...persistedKeys,
    ...inactiveTasks
      .filter((task) => !(task.persisted || task.historyId))
      .slice(0, MAX_RECENT_DOWNLOAD_TASKS)
      .map((task) => task.key),
  ]);
  Array.from(downloadTasks.keys()).forEach((key) => {
    if (!keepKeys.has(key)) {
      downloadTasks.delete(key);
      downloadSpeed.delete(key);
    }
  });
}

function updateDownloadTaskEntry(task) {
  if (!task || !task.key) {
    return null;
  }
  const current = downloadTasks.get(task.key) || {};
  const next = {
    ...current,
    ...task,
    updatedAt: task.updatedAt || Date.now(),
  };
  downloadTasks.set(task.key, next);
  trimDownloadTasks();
  renderDownloadTasks();
  updateProgressUI(next.filename, next.endpointId);
  return next;
}

function createDownloadTask(message, mode = 'download') {
  const endpointId = activeEndpointId || '';
  const endpoint = endpointId
    ? webdavEndpoints.find((item) => item.id === endpointId)
    : null;
  const key = getDownloadTaskKey(message.filename, endpointId);
  const now = Date.now();
  return updateDownloadTaskEntry({
    key,
    filename: message.filename,
    originalName: message.original_name || message.filename || 'download.bin',
    endpointId,
    endpointLabel: endpoint ? getEndpointLabel(endpoint) : '未选择端点',
    mode,
    status: 'queued',
    received: 0,
    total: Number(message.size) || 0,
    createdAt: downloadTasks.get(key)?.createdAt || now,
    updatedAt: now,
    path: '',
    error: '',
    transferMode: null,
    rangeStart: null,
    rangeEnd: null,
  });
}

function createPersistedDownloadTask(record) {
  const endpoint = record?.endpoint_id
    ? webdavEndpoints.find((item) => item.id === record.endpoint_id)
    : null;
  return {
    key: getDownloadTaskKey(record?.filename, record?.endpoint_id || ''),
    historyId: record?.id || null,
    persisted: true,
    filename: record?.filename || '',
    originalName: record?.original_name || record?.filename || 'download.bin',
    endpointId: record?.endpoint_id || '',
    endpointLabel: endpoint ? getEndpointLabel(endpoint) : '链€夋嫨绔偣',
    mode: 'history',
    status: record?.status || 'complete',
    received: 0,
    total: Number(record?.file_size) || 0,
    createdAt: record?.created_at_ms || Date.now(),
    updatedAt: record?.updated_at_ms || Date.now(),
    path: record?.saved_path || '',
    error: record?.error || '',
    localExists: record?.local_exists !== false,
    transferMode: null,
    rangeStart: null,
    rangeEnd: null,
  };
}

function mergePersistedDownloadHistory(records) {
  const persistedKeys = new Set();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const next = createPersistedDownloadTask(record);
    persistedKeys.add(next.key);
    const current = downloadTasks.get(next.key);
    if (current && isDownloadTaskActive(current)) {
      downloadTasks.set(next.key, {
        ...current,
        historyId: next.historyId,
        persisted: true,
        localExists: next.localExists,
        path: next.path || current.path || '',
        total: next.total || current.total || 0,
        error: current.error || next.error || '',
        endpointLabel: next.endpointLabel,
      });
      return;
    }
    downloadTasks.set(next.key, {
      ...(current || {}),
      ...next,
    });
  });

  Array.from(downloadTasks.entries()).forEach(([key, task]) => {
    if ((task.persisted || task.historyId) && !persistedKeys.has(key) && !isDownloadTaskActive(task)) {
      downloadTasks.delete(key);
      downloadSpeed.delete(key);
    }
  });

  trimDownloadTasks();
  renderDownloadTasks();
}

async function loadPersistedDownloadHistory(options = {}) {
  const silent = options.silent !== false;
  if (!invoke) {
    return;
  }
  try {
    const records = await invoke('list_download_history');
    mergePersistedDownloadHistory(records);
  } catch (error) {
    if (!silent) {
      setErrorStatus(`加载下载历史失败：${error}`);
    }
    console.error('[download] load history error', error);
  }
}

function removeDownloadTask(key) {
  if (!key) {
    return;
  }
  downloadTasks.delete(key);
  downloadSpeed.delete(key);
  renderDownloadTasks();
}

function setDownloadTaskResult(key, patch = {}) {
  const task = downloadTasks.get(key);
  if (!task) {
    return null;
  }
  return updateDownloadTaskEntry({
    ...task,
    ...patch,
    key,
  });
}

function syncDownloadTaskProgress(payload) {
  const filename = payload?.filename;
  if (!filename) {
    return null;
  }
  const endpointId = payload.endpoint_id || payload.endpointId || activeEndpointId || '';
  const key = getDownloadTaskKey(filename, endpointId);
  const current =
    downloadTasks.get(key) ||
    updateDownloadTaskEntry({
      key,
      filename,
      originalName: filename,
      endpointId,
      endpointLabel: endpointId
        ? getEndpointLabel(webdavEndpoints.find((item) => item.id === endpointId))
        : '未选择端点',
      status: 'queued',
      received: 0,
      total: payload.total || 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      path: '',
      error: '',
    });
  return updateDownloadTaskEntry({
    ...current,
    endpointId,
    status: payload.status || current.status,
    received: payload.received || 0,
    total: payload.total || current.total || 0,
    transferMode: payload.transfer_mode || payload.transferMode || current.transferMode || null,
    rangeStart:
      normalizeByteOffset(payload.range_start ?? payload.rangeStart) ??
      normalizeByteOffset(current.rangeStart),
    rangeEnd:
      normalizeByteOffset(payload.range_end ?? payload.rangeEnd) ??
      normalizeByteOffset(current.rangeEnd),
    error: payload.error || '',
  });
}

function hasActiveDownloadTasks() {
  return Array.from(downloadTasks.values()).some((task) => isDownloadTaskActive(task));
}

function refreshDownloadTaskEndpointLabels() {
  let changed = false;
  downloadTasks.forEach((task, key) => {
    const endpoint = task.endpointId
      ? webdavEndpoints.find((item) => item.id === task.endpointId)
      : null;
    const nextLabel = endpoint ? getEndpointLabel(endpoint) : task.endpointLabel || '未选择端点';
    if (task.endpointLabel !== nextLabel) {
      downloadTasks.set(key, {
        ...task,
        endpointLabel: nextLabel,
      });
      changed = true;
    }
  });
  if (changed) {
    renderDownloadTasks();
  }
}

function updateTransferTaskIndicators() {
  if (!downloadTaskTabBadge) {
    return;
  }
  const downloadCount = Math.max(0, Number(transferTaskCounts.downloads) || 0);
  const uploadCount = Math.max(0, Number(transferTaskCounts.uploads) || 0);
  const totalCount = downloadCount + uploadCount;
  downloadTaskTabBadge.hidden = totalCount <= 0;
  downloadTaskTabBadge.textContent = totalCount > 99 ? '99+' : String(totalCount);
  if (transferTabDownloadsCount) {
    transferTabDownloadsCount.textContent = String(downloadCount);
  }
  if (transferTabUploadsCount) {
    transferTabUploadsCount.textContent = String(uploadCount);
  }
}

function getPendingTransferCount(tasks) {
  return (Array.isArray(tasks) ? tasks : []).filter((task) => task?.status !== 'complete').length;
}

function getClearableDownloadTasks() {
  return Array.from(downloadTasks.values()).filter(
    (task) => task?.historyId && !isDownloadTaskActive(task),
  );
}

function getVisibleUploadTasks() {
  const activeTasks = Array.from(pendingUploads.values()).map(createPendingUploadTask);
  const activeHistoryKeys = new Set(
    activeTasks
      .filter((task) => task.filename)
      .map((task) => getUploadHistoryKey(task.filename, task.endpointId)),
  );
  const persistedTasks = Array.from(uploadHistoryTasks.values()).filter(
    (task) => !activeHistoryKeys.has(task.key),
  );
  return [...activeTasks, ...persistedTasks].sort((a, b) => {
    const activityDelta = Number(b.status === 'progress') - Number(a.status === 'progress');
    if (activityDelta !== 0) {
      return activityDelta;
    }
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

function getClearableUploadTasks() {
  return getVisibleUploadTasks().filter((task) => task?.historyId && task.status !== 'progress');
}

function getSelectableUploadTasks() {
  return getVisibleUploadTasks().filter((task) => task?.historyId && task.status !== 'progress');
}

function getCurrentTransferSelectionSet() {
  return currentTransferListView === 'uploads' ? selectedUploadTasks : selectedDownloadTasks;
}

function getSelectableTransferTasks() {
  return currentTransferListView === 'uploads' ? getSelectableUploadTasks() : getSelectableDownloadTasks();
}

function updateTransferClearButton() {
  if (!transferClearButton) {
    return;
  }
  const isDownloads = currentTransferListView === 'downloads';
  const clearable = isDownloads ? getClearableDownloadTasks() : getClearableUploadTasks();
  transferClearButton.textContent = isDownloads ? '清空下载列表' : '清空上传列表';
  transferClearButton.disabled = clearable.length === 0;
}

function setTransferListView(view) {
  currentTransferListView = view === 'uploads' ? 'uploads' : 'downloads';
  if (transferTabDownloadsButton) {
    const active = currentTransferListView === 'downloads';
    transferTabDownloadsButton.classList.toggle('is-active', active);
    transferTabDownloadsButton.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  if (transferTabUploadsButton) {
    const active = currentTransferListView === 'uploads';
    transferTabUploadsButton.classList.toggle('is-active', active);
    transferTabUploadsButton.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  if (downloadTaskPanel) {
    downloadTaskPanel.hidden = currentTransferListView !== 'downloads';
  }
  if (uploadTaskPanel) {
    uploadTaskPanel.hidden = currentTransferListView !== 'uploads';
  }
  if (downloadsPageToolbar) {
    downloadsPageToolbar.hidden = currentTransferListView !== 'downloads';
  }
  updateTransferClearButton();
  updateDownloadSelectionBar();
}

function paginateTransferTasks(tasks, page) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const totalPages = Math.max(1, Math.ceil(safeTasks.length / TRANSFER_TASKS_PER_PAGE));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (currentPage - 1) * TRANSFER_TASKS_PER_PAGE;
  return {
    totalPages,
    currentPage,
    pageTasks: safeTasks.slice(startIndex, startIndex + TRANSFER_TASKS_PER_PAGE),
  };
}

function scrollTransferTaskListToTop(listElement) {
  if (!listElement) return;
  requestAnimationFrame(() => {
    listElement.scrollTop = 0;
  });
}

function renderTransferPagination(listElement, options = {}) {
  if (!listElement) return;
  const {
    id,
    currentPage = 1,
    totalPages = 1,
    onPageChange,
  } = options;
  const paginationContainer = document.createElement('li');
  paginationContainer.id = id;
  paginationContainer.className = 'transfer-pagination';

  const prevButton = document.createElement('button');
  prevButton.className = 'button ghost small';
  prevButton.textContent = '上一页';
  prevButton.disabled = currentPage <= 1 || totalPages <= 0;
  prevButton.addEventListener('click', () => {
    if (currentPage <= 1 || typeof onPageChange !== 'function') {
      return;
    }
    onPageChange(currentPage - 1);
    scrollTransferTaskListToTop(listElement);
  });
  paginationContainer.appendChild(prevButton);

  const pageInfo = document.createElement('span');
  pageInfo.className = 'pagination-info';
  pageInfo.textContent = totalPages <= 0 ? '0 / 0' : `${currentPage} / ${totalPages}`;
  paginationContainer.appendChild(pageInfo);

  const nextButton = document.createElement('button');
  nextButton.className = 'button ghost small';
  nextButton.textContent = '下一页';
  nextButton.disabled = currentPage >= totalPages || totalPages <= 0;
  nextButton.addEventListener('click', () => {
    if (currentPage >= totalPages || typeof onPageChange !== 'function') {
      return;
    }
    onPageChange(currentPage + 1);
    scrollTransferTaskListToTop(listElement);
  });
  paginationContainer.appendChild(nextButton);

  listElement.appendChild(paginationContainer);
}

function renderDownloadTasks() {
  if (!downloadTaskPanel || !downloadTaskList) {
    return;
  }
  const tasks = Array.from(downloadTasks.values()).sort((a, b) => {
    const activityDelta = Number(isDownloadTaskActive(b)) - Number(isDownloadTaskActive(a));
    if (activityDelta !== 0) {
      return activityDelta;
    }
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  pruneSelectedDownloadTasks();
  downloadTaskList.innerHTML = '';
  const { currentPage, totalPages, pageTasks } = paginateTransferTasks(tasks, downloadTasksPage);
  downloadTasksPage = currentPage;
  transferTaskCounts.downloads = getPendingTransferCount(tasks);
  const activeCount = tasks.filter((task) => isDownloadTaskActive(task)).length;
  updateTransferTaskIndicators();
  updateTransferClearButton();
  updateDownloadSelectionBar();
  updateDownloadSelectionToggleLabel();
  if (downloadTaskSummary) {
    downloadTaskSummary.textContent =
      activeCount > 0
        ? `${activeCount} 个任务进行中，消息列表刷新不会中断下载。`
        : tasks.length > 0
          ? '显示最近的下载结果，新的下载会在这里持续更新。'
          : '暂无进行中的下载任务。';
  }

  if (tasks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'download-task-empty';
    empty.textContent = '暂无下载任务，开始下载文件后会显示在这里。';
    downloadTaskList.appendChild(empty);
    return;
  }

  pageTasks.forEach((task) => {
    const item = document.createElement('li');
    item.className = 'download-task-item';
    item.classList.toggle('is-active', isDownloadTaskActive(task));
    item.classList.toggle('is-complete', task.status === 'complete');
    item.classList.toggle('is-error', task.status === 'error');
    item.classList.toggle('with-selection', downloadSelectionMode);
    item.classList.toggle('is-selected', selectedDownloadTasks.has(task.key));

    const badge = document.createElement('span');
    badge.className = 'download-task-badge';

    let selectionCheckbox = null;
    if (downloadSelectionMode) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'message-select download-task-select';
      checkbox.checked = selectedDownloadTasks.has(task.key);
      checkbox.disabled = !task.historyId || isDownloadTaskActive(task);
      checkbox.addEventListener('change', () => {
        toggleSelectedDownloadTask(task.key, checkbox.checked);
        item.classList.toggle('is-selected', checkbox.checked);
      });
      selectionCheckbox = checkbox;
      item.appendChild(checkbox);
    }

    const main = document.createElement('div');
    main.className = 'download-task-main';

    const titleRow = document.createElement('div');
    titleRow.className = 'download-task-title-row';

    const title = document.createElement('div');
    title.className = 'download-task-title';
    title.textContent = task.originalName || task.filename;

    const state = document.createElement('span');
    state.className = 'download-task-state';
    state.textContent = getDownloadTaskDisplayStateLabel(task);

    titleRow.appendChild(title);
    titleRow.appendChild(state);

    const meta = document.createElement('div');
    meta.className = 'download-task-meta';
    meta.textContent = `${task.endpointLabel || '未选择端点'} · ${formatBytes(task.total || 0)}`;

    main.appendChild(titleRow);
    main.appendChild(meta);

    if (isDownloadTaskActive(task)) {
      const progressWrap = document.createElement('div');
      progressWrap.className = 'download-task-progress';

      const progressBar = document.createElement('div');
      progressBar.className = 'download-task-progress-bar';

      const progressFill = document.createElement('div');
      progressFill.className = 'download-task-progress-fill';
      if (task.total) {
        const percent = Math.min(100, Math.round(((task.received || 0) / task.total) * 100));
        progressFill.style.width = `${percent}%`;
      } else {
        progressFill.style.width = '30%';
      }

      const detail = document.createElement('div');
      detail.className = 'download-task-detail';
      const progressText = formatDownloadProgressText(
        task,
        getSpeed(downloadSpeed, task.key),
        true,
      );
      detail.textContent = formatProgress(
        task.received || 0,
        task.total,
        '已下载',
        getSpeed(downloadSpeed, task.key),
      );

      detail.textContent = progressText;
      progressBar.appendChild(progressFill);
      progressWrap.appendChild(progressBar);
      progressWrap.appendChild(detail);
      main.appendChild(progressWrap);
    } else {
      const detail = document.createElement('div');
      detail.className = 'download-task-detail';
      if (task.status === 'error') {
        detail.textContent = task.error || '下载失败';
      } else if (task.path) {
        detail.textContent = task.localExists === false ? `${task.path}（文件不存在）` : task.path;
      } else {
        detail.textContent = task.status === 'complete' ? '文件已保存' : '等待下载';
      }
      main.appendChild(detail);

      if (task.historyId) {
        const actions = document.createElement('div');
        actions.className = 'download-task-actions';

        const saveAsButton = document.createElement('button');
        saveAsButton.className = 'button ghost small';
        saveAsButton.type = 'button';
        saveAsButton.textContent = '另存为';
        saveAsButton.addEventListener('click', () => saveDownloadHistoryAs(task));

        const redownloadButton = document.createElement('button');
        redownloadButton.className = 'button ghost small';
        redownloadButton.type = 'button';
        redownloadButton.textContent = '重新下载';
        redownloadButton.addEventListener('click', () => redownloadDownloadHistory(task));

        const openFileButton = document.createElement('button');
        openFileButton.className = 'button ghost small';
        openFileButton.type = 'button';
        openFileButton.textContent = '打开文件';
        openFileButton.disabled = task.localExists === false;
        openFileButton.addEventListener('click', () => openDownloadHistoryFile(task));

        const openDirButton = document.createElement('button');
        openDirButton.className = 'button ghost small';
        openDirButton.type = 'button';
        openDirButton.textContent = '打开目录';
        openDirButton.disabled = task.localExists === false;
        openDirButton.addEventListener('click', () => openDownloadHistoryDir(task));

        const deleteButton = document.createElement('button');
        deleteButton.className = 'button ghost small download-task-delete';
        deleteButton.type = 'button';
        deleteButton.textContent = '删除';
        deleteButton.addEventListener('click', () => deleteDownloadHistoryRecord(task));

        actions.appendChild(saveAsButton);
        actions.appendChild(redownloadButton);
        actions.appendChild(openFileButton);
        actions.appendChild(openDirButton);
        actions.appendChild(deleteButton);
        main.appendChild(actions);
      }
    }

    const updated = document.createElement('div');
    updated.className = 'download-task-updated';
    updated.textContent = formatTime(task.updatedAt || task.createdAt || Date.now());

    item.appendChild(badge);
    item.appendChild(main);
    item.appendChild(updated);
    downloadTaskList.appendChild(item);

    item.addEventListener('click', (event) => {
      if (!downloadSelectionMode || !selectionCheckbox || selectionCheckbox.disabled) {
        return;
      }
      if (event.target.closest('button, a, input, textarea, select, summary, details')) {
        return;
      }
      selectionCheckbox.checked = !selectionCheckbox.checked;
      toggleSelectedDownloadTask(task.key, selectionCheckbox.checked);
      item.classList.toggle('is-selected', selectionCheckbox.checked);
    });
  });

  renderTransferPagination(downloadTaskList, {
    id: 'download-task-pagination',
    currentPage,
    totalPages,
    onPageChange: (nextPage) => {
      downloadTasksPage = nextPage;
      renderDownloadTasks();
    },
  });
}

function getUploadHistoryKey(filename, endpointId = activeEndpointId) {
  return `${endpointId || 'default'}::${filename || ''}`;
}

function trimUploadHistoryTasks() {
  const items = Array.from(uploadHistoryTasks.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const keepKeys = new Set(items.slice(0, MAX_RECENT_UPLOAD_TASKS).map((task) => task.key));
  Array.from(uploadHistoryTasks.keys()).forEach((key) => {
    if (!keepKeys.has(key)) {
      uploadHistoryTasks.delete(key);
    }
  });
}

function createPersistedUploadTask(record) {
  const endpoint = record?.endpoint_id
    ? webdavEndpoints.find((item) => item.id === record.endpoint_id)
    : null;
  return {
    key: getUploadHistoryKey(record?.filename, record?.endpoint_id || ''),
    speedKey: null,
    historyId: record?.id || null,
    filename: record?.filename || '',
    originalName: record?.original_name || record?.filename || 'upload.bin',
    endpointId: record?.endpoint_id || '',
    endpointLabel: endpoint ? getEndpointLabel(endpoint) : '未选择端点',
    status: record?.status || 'complete',
    received: Number(record?.file_size) || 0,
    total: Number(record?.file_size) || 0,
    createdAt: record?.created_at_ms || Date.now(),
    updatedAt: record?.updated_at_ms || Date.now(),
    path: record?.local_path || '',
    error: record?.error || '',
    localExists: record?.local_exists !== false,
    persisted: true,
  };
}

function mergePersistedUploadHistory(records) {
  uploadHistoryTasks.clear();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const task = createPersistedUploadTask(record);
    uploadHistoryTasks.set(task.key, task);
  });
  trimUploadHistoryTasks();
  renderUploadTasks();
}

async function loadPersistedUploadHistory(options = {}) {
  const silent = options.silent !== false;
  if (!invoke) {
    return;
  }
  try {
    const records = await invoke('list_upload_history');
    mergePersistedUploadHistory(records);
  } catch (error) {
    if (!silent) {
      setErrorStatus(`加载上传历史失败：${error}`);
    }
    console.error('[upload] load history error', error);
  }
}

function applyTransferTabLabels() {
  if (downloadsTabLabel) {
    downloadsTabLabel.textContent = '传输';
  }
  if (downloadsTabCaption) {
    downloadsTabCaption.textContent = '上传 / 下载';
  }
  if (downloadsPageTitle) {
    downloadsPageTitle.textContent = '传输任务';
  }
  if (downloadsPageDescription) {
    downloadsPageDescription.textContent = '这里会集中显示上传和下载进度，最近的传输结果也会保留在这里。';
  }
  if (downloadPanelTitle) {
    downloadPanelTitle.textContent = '下载列表';
  }
  setTransferListView('downloads');
  updateTransferTaskIndicators();
}

function createPendingUploadTask(upload) {
  const endpoint = upload?.endpointId
    ? webdavEndpoints.find((item) => item.id === upload.endpointId)
    : null;
  return {
    key: `pending:${upload.clientId}`,
    speedKey: upload.clientId,
    historyId: null,
    filename: upload.filename || '',
    originalName: upload.originalName || upload.filename || '上传文件',
    endpointId: upload.endpointId || '',
    endpointLabel: endpoint ? getEndpointLabel(endpoint) : upload.endpointLabel || '未选择端点',
    status: upload.status || 'progress',
    received: upload.received || 0,
    total: upload.total || 0,
    createdAt: upload.timestamp_ms || Date.now(),
    updatedAt: upload.updatedAt || upload.timestamp_ms || Date.now(),
    path: upload.localPath || '',
    error: upload.error || '',
    localExists: true,
    persisted: false,
  };
}

function getUploadTaskStateLabel(task) {
  if (!task) {
    return '';
  }
  if (task.status === 'complete') {
    return '已完成';
  }
  if (task.status === 'error') {
    return '失败';
  }
  if (task.status === 'progress') {
    return '上传中';
  }
  return '准备中';
}

function renderUploadTasks() {
  if (!uploadTaskPanel || !uploadTaskList) {
    return;
  }
  const tasks = getVisibleUploadTasks();
  const activeTasks = tasks.filter((task) => task.status === 'progress');

  pruneSelectedUploadTasks();
  uploadTaskList.innerHTML = '';
  const { currentPage, totalPages, pageTasks } = paginateTransferTasks(tasks, uploadTasksPage);
  uploadTasksPage = currentPage;
  transferTaskCounts.uploads = getPendingTransferCount(tasks);
  updateTransferTaskIndicators();
  updateTransferClearButton();
  updateDownloadSelectionBar();
  updateDownloadSelectionToggleLabel();
  const activeCount = activeTasks.length;
  if (uploadTaskSummary) {
    uploadTaskSummary.textContent =
      activeCount > 0
        ? `${activeCount} 个上传任务进行中，新完成的文件会自动写入传输记录。`
        : tasks.length > 0
          ? '显示最近的上传结果，正在上传的文件也会实时出现在这里。'
          : '暂无上传任务。';
  }

  if (tasks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'download-task-empty';
    empty.textContent = '暂无上传任务，发送文件后会显示在这里。';
    uploadTaskList.appendChild(empty);
    return;
  }

  pageTasks.forEach((task) => {
    const item = document.createElement('li');
    item.className = 'download-task-item';
    item.classList.toggle('is-active', task.status === 'progress');
    item.classList.toggle('is-complete', task.status === 'complete');
    item.classList.toggle('is-error', task.status === 'error');
    item.classList.toggle('with-selection', downloadSelectionMode);
    item.classList.toggle('is-selected', selectedUploadTasks.has(task.key));

    const badge = document.createElement('span');
    badge.className = 'download-task-badge';

    let selectionCheckbox = null;
    if (downloadSelectionMode) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'message-select download-task-select';
      checkbox.checked = selectedUploadTasks.has(task.key);
      checkbox.disabled = !task.historyId || task.status === 'progress';
      checkbox.addEventListener('change', () => {
        toggleSelectedDownloadTask(task.key, checkbox.checked);
        item.classList.toggle('is-selected', checkbox.checked);
      });
      selectionCheckbox = checkbox;
      item.appendChild(checkbox);
    }

    const main = document.createElement('div');
    main.className = 'download-task-main';

    const titleRow = document.createElement('div');
    titleRow.className = 'download-task-title-row';

    const title = document.createElement('div');
    title.className = 'download-task-title';
    title.textContent = task.originalName || task.filename;

    const state = document.createElement('span');
    state.className = 'download-task-state';
    state.textContent = getUploadTaskStateLabel(task);

    titleRow.appendChild(title);
    titleRow.appendChild(state);

    const meta = document.createElement('div');
    meta.className = 'download-task-meta';
    meta.textContent = `${task.endpointLabel || '未选择端点'} · ${formatBytes(task.total || 0)}`;

    main.appendChild(titleRow);
    main.appendChild(meta);

    if (task.status === 'progress') {
      const progressWrap = document.createElement('div');
      progressWrap.className = 'download-task-progress';

      const progressBar = document.createElement('div');
      progressBar.className = 'download-task-progress-bar';

      const progressFill = document.createElement('div');
      progressFill.className = 'download-task-progress-fill';
      if (task.total) {
        const percent = Math.min(100, Math.round(((task.received || 0) / task.total) * 100));
        progressFill.style.width = `${percent}%`;
      } else {
        progressFill.style.width = '30%';
      }

      const detail = document.createElement('div');
      detail.className = 'download-task-detail';
      detail.textContent = formatProgress(
        task.received || 0,
        task.total || 0,
        uploadStatusLabel(task),
        getSpeed(uploadSpeed, task.speedKey || task.key),
      );

      progressBar.appendChild(progressFill);
      progressWrap.appendChild(progressBar);
      progressWrap.appendChild(detail);
      main.appendChild(progressWrap);
    } else {
      const detail = document.createElement('div');
      detail.className = 'download-task-detail';
      if (task.status === 'error') {
        detail.textContent = task.error || '上传失败';
      } else if (task.path) {
        detail.textContent = task.localExists === false ? `${task.path}（文件不存在）` : task.path;
      } else {
        detail.textContent = '上传已完成';
      }
      main.appendChild(detail);
    }

    const updated = document.createElement('div');
    updated.className = 'download-task-updated';
    updated.textContent = formatTime(task.updatedAt || task.createdAt || Date.now());

    item.appendChild(badge);
    item.appendChild(main);
    item.appendChild(updated);
    uploadTaskList.appendChild(item);

    item.addEventListener('click', (event) => {
      if (!downloadSelectionMode || !selectionCheckbox || selectionCheckbox.disabled) {
        return;
      }
      if (event.target.closest('button, a, input, textarea, select, summary, details')) {
        return;
      }
      selectionCheckbox.checked = !selectionCheckbox.checked;
      toggleSelectedDownloadTask(task.key, selectionCheckbox.checked);
      item.classList.toggle('is-selected', selectionCheckbox.checked);
    });
  });

  renderTransferPagination(uploadTaskList, {
    id: 'upload-task-pagination',
    currentPage,
    totalPages,
    onPageChange: (nextPage) => {
      uploadTasksPage = nextPage;
      renderUploadTasks();
    },
  });
}

function updateProgressUI(filename, endpointId = activeEndpointId) {
  const task = getDownloadTask(filename, endpointId);
  const cardSelector = `.message-card[data-filename="${escapeSelector(filename)}"]`;
  const card = document.querySelector(cardSelector);
  if (card) {
    card.classList.toggle('is-downloading', isDownloadTaskActive(task));
  }
  const selector = `.download-progress[data-filename="${escapeSelector(filename)}"]`;
  const wrap = document.querySelector(selector);
  if (!wrap) {
    return;
  }
  if (!task || !isDownloadTaskActive(task)) {
    wrap.classList.add('hidden');
    return;
  }
  const fill = wrap.querySelector('.download-progress-fill');
  const text = wrap.querySelector('.download-progress-text');
  if (task.total && task.received > 0) {
    const percent = Math.min(100, Math.round(((task.received || 0) / task.total) * 100));
    if (fill) {
      fill.style.width = `${percent}%`;
    }
  } else if (fill) {
    fill.style.width = '30%';
  }
  if (text) {
    text.textContent =
      task.status === 'queued'
        ? '准备下载...'
        : formatDownloadProgressText(task, getSpeed(downloadSpeed, task.key));
  }
  wrap.classList.remove('hidden');
}

function legacyUpdateProgressUI(filename) {
  const progress = downloadProgress.get(filename);
  const cardSelector = `.message-card[data-filename="${escapeSelector(filename)}"]`;
  const card = document.querySelector(cardSelector);
  if (card) {
    card.classList.toggle('is-downloading', !!progress);
  }
  const selector = `.download-progress[data-filename="${escapeSelector(filename)}"]`;
  const wrap = document.querySelector(selector);
  if (!wrap) return;
  if (!progress) {
    wrap.classList.add('hidden');
    return;
  }
  const fill = wrap.querySelector('.download-progress-fill');
  const text = wrap.querySelector('.download-progress-text');
  if (progress.total) {
    const percent = Math.min(100, Math.round((progress.received / progress.total) * 100));
    if (fill) {
      fill.style.width = `${percent}%`;
    }
  } else if (fill) {
    fill.style.width = '30%';
  }
  if (text) {
    text.textContent = formatProgress(
      progress.received || 0,
      progress.total,
      '已下载',
      getSpeed(downloadSpeed, filename),
    );
  }
  wrap.classList.remove('hidden');
}

function updateUploadProgressUI(uploadId) {
  const upload = pendingUploads.get(uploadId);
  const cardSelector = `.message-card[data-filename="${escapeSelector(uploadId)}"]`;
  const card = document.querySelector(cardSelector);
  if (card) {
    card.classList.toggle('is-uploading', !!upload);
  }
  const selector = `.upload-progress[data-upload-id="${escapeSelector(uploadId)}"]`;
  const wrap = document.querySelector(selector);
  if (!wrap) return;
  if (!upload || upload.status !== 'progress') {
    wrap.classList.add('hidden');
    return;
  }
  const fill = wrap.querySelector('.upload-progress-fill');
  const text = wrap.querySelector('.upload-progress-text');
  if (upload.total) {
    const percent = Math.min(100, Math.round((upload.received / upload.total) * 100));
    if (fill) {
      fill.style.width = `${percent}%`;
    }
  } else if (fill) {
    fill.style.width = '30%';
  }
  if (text) {
    text.textContent = formatProgress(
      upload.received || 0,
      upload.total || 0,
      uploadStatusLabel(upload),
      getSpeed(uploadSpeed, uploadId),
    );
  }
  wrap.classList.remove('hidden');
}

function setHint(element, text) {
  if (!element) return;
  element.textContent = text || '';
}

function updateSelectionBar() {
  if (!selectionRow || !selectionBar || !selectionCount || !deleteSelectedButton) return;
  const count = selectedMessages.size;
  const selectableCount = selectionMode ? getSelectableMessages().length : 0;
  selectionRow.hidden = !selectionMode;
  selectionRow.style.display = selectionMode ? 'flex' : 'none';
  selectionBar.hidden = !selectionMode;
  selectionBar.style.display = selectionMode ? 'flex' : 'none';
  selectionCount.hidden = !selectionMode;
  selectionCount.textContent = `已选中 ${count} 项`;
  deleteSelectedButton.disabled = count === 0;
  if (selectAllButton) {
    selectAllButton.disabled = selectableCount === 0;
  }
}

function updateSelectionToggleLabel() {
  if (!toggleSelectionButton) return;
  toggleSelectionButton.textContent = selectionMode ? '完成' : '选择';
}

function setSelectionMode(enabled) {
  selectionMode = enabled;
  if (!selectionMode) {
    selectedMessages.clear();
  }
  updateSelectionToggleLabel();
  updateSelectionBar();
  renderMessages(lastMessages);
}

function toggleSelectionMode() {
  setSelectionMode(!selectionMode);
}

function toggleSelectedMessage(filename, checked) {
  if (!filename) return;
  if (checked) {
    selectedMessages.add(filename);
  } else {
    selectedMessages.delete(filename);
  }
  updateSelectionBar();
}

function isMessageSelectionRefreshPaused() {
  return selectionMode;
}

function getSelectableMessages() {
  return mergeMessages(lastMessages).filter((message) => !message.uploading);
}

function selectAllMessages() {
  if (!selectionMode) {
    setSelectionMode(true);
  }
  selectedMessages.clear();
  const selectable = getSelectableMessages();
  selectable.forEach((message) => selectedMessages.add(message.filename));
  updateSelectionBar();
  renderMessages(lastMessages);
}

function getSelectableMarkedMessages() {
  return visibleMarkedMessages.filter((message) => !!message?.filename);
}

function pruneSelectedMarkedMessages() {
  const selectable = new Set(getSelectableMarkedMessages().map((message) => message.filename));
  Array.from(selectedMarkedMessages).forEach((filename) => {
    if (!selectable.has(filename)) {
      selectedMarkedMessages.delete(filename);
    }
  });
}

function updateMarkedSelectionBar() {
  if (
    !markedSelectionRow
    || !markedSelectionBar
    || !markedSelectionCount
    || !markedDeleteSelectedButton
    || !markedEditTagsButton
  ) {
    return;
  }
  const count = selectedMarkedMessages.size;
  const selectableCount = markedSelectionMode ? getSelectableMarkedMessages().length : 0;
  markedSelectionRow.hidden = !markedSelectionMode;
  markedSelectionRow.style.display = markedSelectionMode ? 'flex' : 'none';
  markedSelectionBar.hidden = !markedSelectionMode;
  markedSelectionBar.style.display = markedSelectionMode ? 'flex' : 'none';
  markedSelectionCount.hidden = !markedSelectionMode;
  markedSelectionCount.textContent = `已选中 ${count} 项`;
  markedDeleteSelectedButton.disabled = count === 0;
  markedEditTagsButton.disabled = count === 0;
  if (markedSelectAllButton) {
    markedSelectAllButton.disabled = selectableCount === 0;
  }
}

function updateMarkedSelectionToggleLabel() {
  if (!markedToggleSelectionButton) return;
  markedToggleSelectionButton.textContent = markedSelectionMode ? '完成' : '选择';
}

function setMarkedSelectionMode(enabled) {
  markedSelectionMode = enabled;
  if (!markedSelectionMode) {
    selectedMarkedMessages.clear();
  } else {
    pruneSelectedMarkedMessages();
  }
  updateMarkedSelectionToggleLabel();
  updateMarkedSelectionBar();
  renderMarkedMessages(markedMessages, {
    query: getAppliedMarkedSearchQuery(),
  });
}

function toggleMarkedSelectionMode() {
  setMarkedSelectionMode(!markedSelectionMode);
}

function toggleSelectedMarkedMessage(filename, checked) {
  if (!filename) return;
  if (checked) {
    selectedMarkedMessages.add(filename);
  } else {
    selectedMarkedMessages.delete(filename);
  }
  updateMarkedSelectionBar();
}

function selectAllMarkedMessages() {
  if (!markedSelectionMode) {
    setMarkedSelectionMode(true);
  }
  selectedMarkedMessages.clear();
  getSelectableMarkedMessages().forEach((message) => selectedMarkedMessages.add(message.filename));
  updateMarkedSelectionBar();
  renderMarkedMessages(markedMessages, {
    query: getAppliedMarkedSearchQuery(),
  });
}

function getSelectableDownloadTasks() {
  return Array.from(downloadTasks.values()).filter(
    (task) => task.historyId && !isDownloadTaskActive(task),
  );
}

function pruneSelectedUploadTasks() {
  const selectable = new Set(getSelectableUploadTasks().map((task) => task.key));
  Array.from(selectedUploadTasks).forEach((key) => {
    if (!selectable.has(key)) {
      selectedUploadTasks.delete(key);
    }
  });
}

function updateDownloadSelectionBar() {
  if (!downloadSelectionRow || !downloadSelectionBar || !downloadSelectionCount || !downloadDeleteSelectedButton) return;
  const count = getCurrentTransferSelectionSet().size;
  const selectableCount = downloadSelectionMode ? getSelectableTransferTasks().length : 0;
  downloadSelectionRow.hidden = !downloadSelectionMode;
  downloadSelectionRow.style.display = downloadSelectionMode ? 'flex' : 'none';
  downloadSelectionBar.hidden = !downloadSelectionMode;
  downloadSelectionBar.style.display = downloadSelectionMode ? 'flex' : 'none';
  downloadSelectionCount.hidden = !downloadSelectionMode;
  downloadSelectionCount.textContent = `已选中 ${count} 项`;
  downloadDeleteSelectedButton.disabled = count === 0;
  if (downloadSelectAllButton) {
    downloadSelectAllButton.disabled = selectableCount === 0;
  }
}

function updateDownloadSelectionToggleLabel() {
  if (!downloadToggleSelectionButton) return;
  downloadToggleSelectionButton.textContent = downloadSelectionMode ? '完成' : '选择';
}

function setDownloadSelectionMode(enabled) {
  downloadSelectionMode = enabled;
  if (!downloadSelectionMode) {
    selectedDownloadTasks.clear();
    selectedUploadTasks.clear();
  } else {
    pruneSelectedDownloadTasks();
    pruneSelectedUploadTasks();
  }
  updateDownloadSelectionToggleLabel();
  updateDownloadSelectionBar();
  renderDownloadTasks();
  renderUploadTasks();
}

function toggleDownloadSelectionMode() {
  setDownloadSelectionMode(!downloadSelectionMode);
}

function toggleSelectedDownloadTask(key, checked) {
  if (!key) return;
  const selectedTasks = getCurrentTransferSelectionSet();
  if (checked) {
    selectedTasks.add(key);
  } else {
    selectedTasks.delete(key);
  }
  updateDownloadSelectionBar();
}

function selectAllDownloadTasks() {
  if (!downloadSelectionMode) {
    setDownloadSelectionMode(true);
  }
  const selectedTasks = getCurrentTransferSelectionSet();
  selectedTasks.clear();
  getSelectableTransferTasks().forEach((task) => selectedTasks.add(task.key));
  updateDownloadSelectionBar();
  renderDownloadTasks();
  renderUploadTasks();
}

function pruneSelectedDownloadTasks() {
  Array.from(selectedDownloadTasks).forEach((key) => {
    const task = downloadTasks.get(key);
    if (!task || !task.historyId || isDownloadTaskActive(task)) {
      selectedDownloadTasks.delete(key);
    }
  });
}

function isMessageListAtBottom() {
  if (!messageList) return true;
  const threshold = 16;
  return (
    messageList.scrollTop + messageList.clientHeight >= messageList.scrollHeight - threshold
  );
}

function updateScrollToBottomButton() {
  if (!scrollToBottomButton) return;
  scrollToBottomButton.hidden = isMessageListAtBottom();
}

function scrollMessageListToBottom() {
  if (!messageList) return;
  requestAnimationFrame(() => {
    messageList.scrollTop = messageList.scrollHeight;
    updateScrollToBottomButton();
  });
}

function scrollMarkedMessageListToTop() {
  if (!markedMessageList) return;
  requestAnimationFrame(() => {
    markedMessageList.scrollTop = 0;
  });
}

function focusTextInput() {
  if (currentFormat === 'markdown' && mdEditor) {
    // editormd doesn't always have a simple focus() but we can try its cm instance
    if (mdEditor.cm) {
        mdEditor.cm.focus();
    }
    return;
  }
  if (!textInput) return;
  textInput.focus({ preventScroll: true });
  if (typeof textInput.setSelectionRange === 'function') {
    const valueLength = textInput.value.length;
    textInput.setSelectionRange(valueLength, valueLength);
  }
}

function getLineBoundaryIndex(value, caretIndex, key) {
  const lineStart = value.lastIndexOf('\n', Math.max(caretIndex - 1, 0)) + 1;
  const nextLineBreak = value.indexOf('\n', caretIndex);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  return key === 'Home' ? lineStart : lineEnd;
}

function handleTextareaLineBoundaryKey(textarea, event) {
  if (!textarea || event.defaultPrevented || event.isComposing) {
    return false;
  }
  if (!['Home', 'End'].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  if (typeof textarea.selectionStart !== 'number' || typeof textarea.selectionEnd !== 'number') {
    return false;
  }

  const selectionDirection = textarea.selectionDirection || 'none';
  const focusIndex = selectionDirection === 'backward'
    ? textarea.selectionStart
    : textarea.selectionEnd;
  const targetIndex = getLineBoundaryIndex(textarea.value, focusIndex, event.key);

  if (event.shiftKey) {
    const anchorIndex = selectionDirection === 'backward'
      ? textarea.selectionEnd
      : textarea.selectionStart;
    const rangeStart = Math.min(anchorIndex, targetIndex);
    const rangeEnd = Math.max(anchorIndex, targetIndex);
    const nextDirection = targetIndex < anchorIndex
      ? 'backward'
      : targetIndex > anchorIndex
        ? 'forward'
        : 'none';
    textarea.setSelectionRange(rangeStart, rangeEnd, nextDirection);
  } else {
    textarea.setSelectionRange(targetIndex, targetIndex, 'none');
  }

  event.preventDefault();
  return true;
}

function syncComposerOffset() {
  if (!composer || !feed) return;
  const offset = Math.round(composer.offsetHeight + 12);
  feed.style.setProperty('--composer-offset', `${offset}px`);
}

function ensureSettingsSectionTargets() {
  const dataGroup = exportSettingsButton ? exportSettingsButton.closest('.settings-group') : null;
  if (dataGroup && !dataGroup.id) {
    dataGroup.id = 'settings-section-data';
  }
  if (dataGroup && !Object.prototype.hasOwnProperty.call(dataGroup.dataset, 'settingsSection')) {
    dataGroup.dataset.settingsSection = '';
  }

  settingsSections = Array.from(document.querySelectorAll('[data-settings-section]')).filter(
    (section) => section.id,
  );
}

function setActiveSettingsSection(id) {
  if (!id || activeSettingsSectionId === id) {
    return;
  }
  activeSettingsSectionId = id;
  settingsNavButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.settingsNavTarget === id);
  });
}

function updateActiveSettingsSection() {
  if (!settingsPanel || !settingsSections.length) {
    return;
  }

  const panelTop = settingsPanel.getBoundingClientRect().top;
  const threshold = 120;
  let activeSection = settingsSections[0];

  settingsSections.forEach((section) => {
    const offsetTop = section.getBoundingClientRect().top - panelTop;
    if (offsetTop <= threshold) {
      activeSection = section;
    }
  });

  setActiveSettingsSection(activeSection.id);
}

function queueSettingsSectionUpdate() {
  if (settingsNavUpdateQueued) {
    return;
  }
  settingsNavUpdateQueued = true;
  requestAnimationFrame(() => {
    settingsNavUpdateQueued = false;
    updateActiveSettingsSection();
  });
}

function initializeSettingsNavigation() {
  ensureSettingsSectionTargets();
  if (!settingsPanel || !settingsBody || !settingsNavButtons.length || !settingsSections.length) {
    return;
  }

  if (!settingsPanel.dataset.settingsNavInitialized) {
    settingsNavButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const targetId = button.dataset.settingsNavTarget;
        const targetSection = document.getElementById(targetId);
        if (!targetSection) {
          return;
        }
        setActiveSettingsSection(targetId);
        targetSection.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest',
        });
      });
    });

    settingsPanel.addEventListener('scroll', queueSettingsSectionUpdate, { passive: true });
    window.addEventListener('resize', queueSettingsSectionUpdate);
    settingsPanel.dataset.settingsNavInitialized = 'true';
  }

  queueSettingsSectionUpdate();
}

function setActiveTab(name, options = {}) {
  const target = name || 'home';
  const { scrollToBottom = false, focusInput = false } = options;
  if (target !== 'marked' && markedSelectionMode) {
    setMarkedSelectionMode(false);
  }
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tabTarget === target;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === target;
    panel.classList.toggle('is-active', isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });
  if (target === 'downloads') {
    setTransferListView('downloads');
  }
  if (target === 'marked') {
    loadMarkedTags();
    loadMarkedMessages({ scrollToTop: true });
  }
  if (target === 'settings') {
    queueSettingsSectionUpdate();
  }
  if (target === 'home') {
    if (scrollToBottom) {
      scrollMessageListToBottom();
    }
    if (focusInput) {
      focusTextInput();
    }
    // 切换回首页时恢复自动刷新
    restartRefreshTimer();
  }
}

function focusHomeComposer(options = {}) {
  const scrollToBottom = options.scrollToBottom !== false;
  setActiveTab('home', { scrollToBottom, focusInput: true });
}

function showDeleteConfirmDialog(count) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'dialog';

    const title = document.createElement('h3');
    title.className = 'dialog-title';
    title.textContent = '确认删除';

    const message = document.createElement('p');
    message.className = 'dialog-text';
    message.textContent = `选择删除范围：仅本地删除将删除本地文件但保留消息记录，本地+远端删除将完全删除消息。`;

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const localButton = document.createElement('button');
    localButton.className = 'button small';
    localButton.textContent = '仅本地删除';

    const remoteButton = document.createElement('button');
    remoteButton.className = 'button primary small';
    remoteButton.textContent = '本地 + 远端删除';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'button ghost small';
    cancelButton.textContent = '取消';

    const cleanup = (choice) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(choice);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        cleanup('cancel');
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup('cancel');
      }
    });
    localButton.addEventListener('click', () => cleanup('local'));
    remoteButton.addEventListener('click', () => cleanup('remote'));
    cancelButton.addEventListener('click', () => cleanup('cancel'));

    actions.appendChild(localButton);
    actions.appendChild(remoteButton);
    actions.appendChild(cancelButton);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown);
  });
}

function showDownloadHistoryDeleteConfirmDialog(count) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'dialog';

    const title = document.createElement('h3');
    title.className = 'dialog-title';
    title.textContent = '确认删除';

    const message = document.createElement('p');
    message.className = 'dialog-text';
    message.textContent =
      count > 1
        ? `将处理 ${count} 条下载记录。仅删除记录会保留本地文件，删除记录和本地文件会同时移除记录与本地文件。`
        : '选择删除范围：仅删除记录会保留本地文件，删除记录和本地文件会同时移除记录与本地文件。';

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const recordButton = document.createElement('button');
    recordButton.className = 'button small';
    recordButton.textContent = '仅删除记录';

    const localFileButton = document.createElement('button');
    localFileButton.className = 'button primary small';
    localFileButton.textContent = '删除记录和本地文件';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'button ghost small';
    cancelButton.textContent = '取消';

    const cleanup = (choice) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(choice);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        cleanup('cancel');
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup('cancel');
      }
    });
    recordButton.addEventListener('click', () => cleanup('record'));
    localFileButton.addEventListener('click', () => cleanup('local'));
    cancelButton.addEventListener('click', () => cleanup('cancel'));

    actions.appendChild(recordButton);
    actions.appendChild(localFileButton);
    actions.appendChild(cancelButton);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown);
  });
}

function createDialogOption(name, value, labelText, checked) {
  const label = document.createElement('label');
  label.className = 'dialog-option';

  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = checked;

  const text = document.createElement('span');
  text.textContent = labelText;

  label.appendChild(input);
  label.appendChild(text);

  return { label, input };
}

function showCleanupConfirmDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'dialog';

    const title = document.createElement('h3');
    title.className = 'dialog-title';
    title.textContent = '清理旧数据';

    const message = document.createElement('p');
    message.className = 'dialog-text';
    message.textContent = '请选择清理时间范围与清理范围。';

    const rangeGroup = document.createElement('div');
    rangeGroup.className = 'dialog-options-group';

    const rangeTitle = document.createElement('div');
    rangeTitle.className = 'dialog-subtitle';
    rangeTitle.textContent = '时间范围';

    const rangeAll = createDialogOption('cleanup-range', 'all', '全部', false);
    const rangeBefore = createDialogOption('cleanup-range', 'before_7_days', '7天以前', true);

    rangeGroup.appendChild(rangeTitle);
    rangeGroup.appendChild(rangeAll.label);
    rangeGroup.appendChild(rangeBefore.label);

    const scopeGroup = document.createElement('div');
    scopeGroup.className = 'dialog-options-group';

    const scopeTitle = document.createElement('div');
    scopeTitle.className = 'dialog-subtitle';
    scopeTitle.textContent = '清理范围';

    const scopeLocal = createDialogOption('cleanup-scope', 'local_only', '仅本地', true);
    const scopeRemote = createDialogOption(
      'cleanup-scope',
      'with_remote',
      '包含 WebDAV 远端',
      false,
    );

    scopeGroup.appendChild(scopeTitle);
    scopeGroup.appendChild(scopeLocal.label);
    scopeGroup.appendChild(scopeRemote.label);

    const options = document.createElement('div');
    options.className = 'dialog-options';
    options.appendChild(rangeGroup);
    options.appendChild(scopeGroup);

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const confirmButton = document.createElement('button');
    confirmButton.className = 'button primary small';
    confirmButton.textContent = '开始清理';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'button ghost small';
    cancelButton.textContent = '取消';

    const cleanup = (choice) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(choice);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        cleanup(null);
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup(null);
      }
    });
    confirmButton.addEventListener('click', () => {
      const range = rangeGroup.querySelector('input[name="cleanup-range"]:checked')?.value;
      const scope = scopeGroup.querySelector('input[name="cleanup-scope"]:checked')?.value;
      if (!range || !scope) {
        return;
      }
      cleanup({ range, scope });
    });
    cancelButton.addEventListener('click', () => cleanup(null));

    actions.appendChild(confirmButton);
    actions.appendChild(cancelButton);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(options);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown);
  });
}

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-12px) scale(0.96)';
    setTimeout(() => {
      toast.remove();
    }, 250);
  }, 2000);
}

function showLoadingToast(message) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast loading';
  toast.textContent = message;

  container.appendChild(toast);

  return () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-12px) scale(0.96)';
    setTimeout(() => {
      toast.remove();
    }, 250);
  };
}

function showInfoDialog(options = {}) {
  const titleText = options.title || '提示';
  const messageText = options.message || '';
  const confirmText = options.confirmLabel || '知道了';
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'dialog';

    const title = document.createElement('h3');
    title.className = 'dialog-title';
    title.textContent = titleText;

    const message = document.createElement('p');
    message.className = 'dialog-text';
    message.textContent = messageText;

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const confirmButton = document.createElement('button');
    confirmButton.className = 'button primary small';
    confirmButton.textContent = confirmText;

    const close = () => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve();
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        close();
      }
    });
    confirmButton.addEventListener('click', close);

    actions.appendChild(confirmButton);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown);
  });
}

function showConfirmDialog(options = {}) {
  const titleText = options.title || '确认';
  const messageText = options.message || '';
  const confirmText = options.confirmLabel || '确认';
  const cancelText = options.cancelLabel || '取消';
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'dialog';

    const title = document.createElement('h3');
    title.className = 'dialog-title';
    title.textContent = titleText;

    const message = document.createElement('p');
    message.className = 'dialog-text';
    message.textContent = messageText;

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const confirmButton = document.createElement('button');
    confirmButton.className = 'button primary small';
    confirmButton.textContent = confirmText;

    const cancelButton = document.createElement('button');
    cancelButton.className = 'button ghost small';
    cancelButton.textContent = cancelText;

    const cleanup = (confirmed) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(confirmed);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        cleanup(false);
      }
      if (event.key === 'Enter') {
        cleanup(true);
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup(false);
      }
    });
    confirmButton.addEventListener('click', () => cleanup(true));
    cancelButton.addEventListener('click', () => cleanup(false));

    actions.appendChild(confirmButton);
    actions.appendChild(cancelButton);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown);
  });
}

async function showSettingsResultDialog(title, message) {
  await showInfoDialog({ title, message });
}

function showPasswordDialog(options = {}) {
  const titleText = options.title || '请输入密码';
  const messageText = options.message || '此操作需要密码。';
  const confirmText = options.confirmLabel || '确定';
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'dialog';

    const title = document.createElement('h3');
    title.className = 'dialog-title';
    title.textContent = titleText;

    const message = document.createElement('p');
    message.className = 'dialog-text';
    message.textContent = messageText;

    const input = document.createElement('input');
    input.className = 'dialog-input';
    input.type = 'password';
    input.placeholder = '请输入密码';
    input.autocomplete = 'new-password';

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const confirmButton = document.createElement('button');
    confirmButton.className = 'button primary small';
    confirmButton.textContent = confirmText;
    confirmButton.disabled = true;

    const cancelButton = document.createElement('button');
    cancelButton.className = 'button ghost small';
    cancelButton.textContent = '取消';

    const cleanup = (value) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(value);
    };

    const confirm = () => {
      const value = input.value.trim();
      if (!value) {
        return;
      }
      cleanup(value);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        cleanup(null);
      }
      if (event.key === 'Enter') {
        confirm();
      }
    };

    input.addEventListener('input', () => {
      confirmButton.disabled = input.value.trim().length === 0;
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup(null);
      }
    });
    confirmButton.addEventListener('click', confirm);
    cancelButton.addEventListener('click', () => cleanup(null));

    actions.appendChild(confirmButton);
    actions.appendChild(cancelButton);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(input);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown);
    setTimeout(() => input.focus(), 0);
  });
}

async function saveDiagramAsImage(container) {
  const svg = container.querySelector('svg');
  if (!svg) {
    showToast('未找到图片内容', 'error');
    return;
  }

  try {
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    // Using getBoundingClientRect for actual rendered size
    const rect = svg.getBoundingClientRect();
    const padding = 20;
    canvas.width = rect.width + padding * 2;
    canvas.height = rect.height + padding * 2;
    
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.drawImage(img, padding, padding, rect.width, rect.height);
    
    URL.revokeObjectURL(url);

    const pngDataUrl = canvas.toDataURL('image/png');
    const base64 = pngDataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    if (!saveDialog) {
      showToast('未检测到保存对话框插件', 'error');
      return;
    }

    const path = await saveDialog({
      defaultPath: 'diagram.png',
      filters: [{ name: 'Images', extensions: ['png'] }]
    });

    if (path) {
      await invoke('save_local_data', { path, data: Array.from(bytes) });
      showToast('图片已保存', 'success');
    }
  } catch (e) {
    console.error('Failed to save diagram', e);
    showToast(`保存失败: ${e}`, 'error');
  }
}

// Function to inject save/copy buttons into a container (used by both feed and preview dialog)
function injectMarkdownExtras(container) {
    if (!container) return;

    // Handle links to open in system browser
    container.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        
        // Skip if already handled
        if (link.dataset.linkHandled === 'true') return;
        link.dataset.linkHandled = 'true';
        
        // Only handle http/https links
        if (!href.startsWith('http://') && !href.startsWith('https://')) {
            return;
        }
        
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            try {
                // Use backend command to open URL in system browser
                const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
                if (invoke) {
                    await invoke('open_url', { url: href });
                } else {
                    // Fallback: use window.open as last resort
                    window.open(href, '_blank');
                }
            } catch (error) {
                console.error('Failed to open link:', error);
                // Fallback to default behavior
                window.open(href, '_blank');
            }
        });
    });

    // Add copy button to code blocks
    container.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.code-copy-btn')) return;
        
        const button = document.createElement('button');
        button.className = 'code-copy-btn';
        button.textContent = '复制';
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            let text = '';
            const list = pre.querySelector('ol.linenums');
            if (list) {
            const lines = [];
            list.querySelectorAll('li').forEach(li => {
                lines.push(li.textContent.replace(/\n$/, '')); 
            });
            text = lines.join('\n');
            } else {
            const code = pre.querySelector('code');
            text = code ? code.textContent : pre.textContent;
            }
            copyTextToClipboard(text); 
        });
        pre.appendChild(button);
        pre.style.position = 'relative';
    });

    // Add save as image button to diagrams
    container.querySelectorAll('.flowchart, .sequence-diagram').forEach(diag => {
        if (diag.querySelector('.diag-save-btn')) return;
        
        diag.style.position = 'relative';
        diag.style.cursor = 'default';

        const button = document.createElement('button');
        button.className = 'diag-save-btn';
        button.textContent = '保存图片';
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            saveDiagramAsImage(diag);
        });
        diag.appendChild(button);
    });
}

async function copyTextToClipboard(text) {
  if (!text) {
    showToast('没有可复制的内容', 'error');
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    showToast('已复制到剪贴板', 'success');
  } catch (error) {
    showToast(`复制失败：${String(error)}`, 'error');
  }
}

function buildTextMessageFilename(message) {
  const extension = message?.format === 'markdown' ? 'md' : 'txt';
  const sender = String(message?.sender || 'message')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_');
  const safeSender = sender || 'message';
  const timestamp = message?.timestamp_ms
    ? new Date(message.timestamp_ms).toISOString().replace(/[:.]/g, '-')
    : Date.now();
  return `${safeSender}-${timestamp}.${extension}`;
}

async function downloadTextMessageAsFile(message) {
  try {
    const content = message?.content || '';
    if (!content) {
      showToast('没有可下载的内容', 'error');
      return;
    }

    const defaultPath = message?.original_name || buildTextMessageFilename(message);
    if (saveDialog && invoke) {
      const target = await saveDialog({ defaultPath });
      if (!target) return;
      const bytes = new TextEncoder().encode(content);
      await invoke('save_local_data', { path: target, data: Array.from(bytes) });
      setSuccessStatus(`文件已保存到 ${target}`.trim());
      return;
    }

    const mime = message?.format === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = defaultPath;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('文件已开始下载', 'success');
  } catch (error) {
    setErrorStatus(`下载失败：${error}`);
  }
}

function applyMessageBodyCollapse(item, body, message, options = {}) {
  if (!item || !body || !message || message.kind !== 'text') {
    return;
  }

  const collapseHeight = Number(options.collapseHeight) > 0
    ? Number(options.collapseHeight)
    : MESSAGE_BODY_COLLAPSE_HEIGHT;

  const oldToggle = item.querySelector('.message-expand-toggle');
  if (oldToggle) {
    oldToggle.remove();
  }

  body.classList.remove('is-collapsible', 'is-collapsed');
  body.style.setProperty('--message-collapse-height', `${collapseHeight}px`);
  const exceedsLimit = body.scrollHeight > collapseHeight + 4;
  if (!exceedsLimit) {
    expandedTextMessages.delete(message.filename);
    return;
  }

  body.classList.add('is-collapsible');
  const isExpanded = expandedTextMessages.has(message.filename);
  if (!isExpanded) {
    body.classList.add('is-collapsed');
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'message-expand-toggle';
  toggle.textContent = isExpanded ? '收起' : '展开全文';
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const collapsed = body.classList.contains('is-collapsed');
    if (collapsed) {
      body.classList.remove('is-collapsed');
      expandedTextMessages.add(message.filename);
      toggle.textContent = '收起';
      return;
    }
    body.classList.add('is-collapsed');
    expandedTextMessages.delete(message.filename);
    toggle.textContent = '展开全文';
  });

  const footer = item.querySelector('.message-footer');
  if (footer) {
    item.insertBefore(toggle, footer);
  } else {
    item.appendChild(toggle);
  }
}

function showDownloadConflictDialog(filename) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'dialog';

    const title = document.createElement('h3');
    title.className = 'dialog-title';
    title.textContent = '文件已存在';

    const message = document.createElement('p');
    message.className = 'dialog-text';
    message.textContent = `下载目录已存在同名文件：${filename}`;

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const renameButton = document.createElement('button');
    renameButton.className = 'button small';
    renameButton.textContent = '自动改名';

    const overwriteButton = document.createElement('button');
    overwriteButton.className = 'button primary small';
    overwriteButton.textContent = '覆盖';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'button ghost small';
    cancelButton.textContent = '取消';

    const cleanup = (choice) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(choice);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        cleanup('cancel');
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup('cancel');
      }
    });
    renameButton.addEventListener('click', () => cleanup('rename'));
    overwriteButton.addEventListener('click', () => cleanup('overwrite'));
    cancelButton.addEventListener('click', () => cleanup('cancel'));

    actions.appendChild(renameButton);
    actions.appendChild(overwriteButton);
    actions.appendChild(cancelButton);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown);
  });
}

function showConfirmationDialog(options = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'dialog';

    const title = document.createElement('h3');
    title.className = 'dialog-title';
    title.textContent = options.title || '确认操作';

    const message = document.createElement('p');
    message.className = 'dialog-text';
    message.textContent = options.message || '确定要继续吗？';

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const confirmButton = document.createElement('button');
    confirmButton.className = 'button primary small';
    confirmButton.textContent = options.confirmLabel || '确认';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'button ghost small';
    cancelButton.textContent = '取消';

    const cleanup = (confirmed) => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(confirmed);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        cleanup(false);
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup(false);
      }
    });
    confirmButton.addEventListener('click', () => cleanup(true));
    cancelButton.addEventListener('click', () => cleanup(false));

    actions.appendChild(confirmButton);
    actions.appendChild(cancelButton);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown);
  });
}

function formatDownloadSuccessMessage(result, fallbackPath, defaultPrefix = '\u6587\u4ef6\u5df2\u4fdd\u5b58\u5230') {
  const path = (result?.path || fallbackPath || '').trim();
  if (result?.transfer_mode === 'resumed') {
    return `\u5df2\u7ee7\u7eed\u4e0b\u8f7d\u5e76\u4fdd\u5b58\u5230 ${path}`.trim();
  }
  if (result?.transfer_mode === 'restarted') {
    return `\u5df2\u91cd\u65b0\u4e0b\u8f7d\u5e76\u4fdd\u5b58\u5230 ${path}`.trim();
  }
  return `${defaultPrefix} ${path}`.trim();
}

async function downloadMessageFile(message) {
  let task = null;
  try {
    console.info('[download] click', {
      filename: message.filename,
      original_name: message.original_name,
    });
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    task = createDownloadTask(message, 'download');
    const result = await invoke('download_message_file', {
      filename: message.filename,
      originalName: message.original_name,
      conflictAction: 'prompt',
    });
    console.info('[download] result', result);

    if (result.status === 'conflict') {
      removeDownloadTask(task.key);
      const choice = await showDownloadConflictDialog(message.original_name);
      console.info('[download] conflict choice', choice);
      if (choice === 'cancel') {
        setStatus('已取消下载');
        return;
      }
      const retryTask = createDownloadTask(message, 'download');
      const retry = await invoke('download_message_file', {
        filename: message.filename,
        originalName: message.original_name,
        conflictAction: choice,
      });
      console.info('[download] retry result', retry);
      if (retry.status === 'saved') {
        setDownloadTaskResult(retryTask.key, {
          status: 'complete',
          path: retry.path || '',
          error: '',
        });
        updateMessageDownloadStatus(message.filename, retryTask.endpointId);
        setSuccessStatus(formatDownloadSuccessMessage(retry, retry.path || ''));
        await loadPersistedDownloadHistory({ silent: true });
      } else {
        setDownloadTaskResult(retryTask.key, {
          status: 'error',
          error: '下载失败',
        });
        await loadPersistedDownloadHistory({ silent: true });
      }
      return;
    }

    if (result.status === 'saved') {
      setDownloadTaskResult(task.key, {
        status: 'complete',
        path: result.path || '',
        error: '',
      });
      updateMessageDownloadStatus(message.filename, task.endpointId);
      setSuccessStatus(formatDownloadSuccessMessage(result, result.path || ''));
      await loadPersistedDownloadHistory({ silent: true });
    } else {
      setDownloadTaskResult(task.key, {
        status: 'error',
        error: '下载失败',
      });
      await loadPersistedDownloadHistory({ silent: true });
    }
  } catch (error) {
    const key = task?.key || getDownloadTaskKey(message.filename, activeEndpointId || '');
    setDownloadTaskResult(key, {
      status: 'error',
      error: String(error),
    });
    console.error('[download] error', error);
    setErrorStatus(`下载失败：${error}`);
    await loadPersistedDownloadHistory({ silent: true });
  }
}

async function saveMessageFileAs(message) {
  let task = null;
  try {
    console.info('[download] save as click', {
      filename: message.filename,
      original_name: message.original_name,
    });
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!saveDialog) {
      setErrorStatus('未检测到保存对话框插件，请确认已启用 dialog 插件');
      return;
    }
    const target = await saveDialog({
      defaultPath: message.original_name,
    });
    if (!target) {
      return;
    }
    console.info('[download] save as target', target);
    task = createDownloadTask(message, 'save_as');
    const result = await invoke('save_message_file_as', {
      filename: message.filename,
      targetPath: target,
    });
    console.info('[download] save as result', result);
    setDownloadTaskResult(task.key, {
      status: 'complete',
      path: result.path || target,
      error: '',
    });
    updateMessageDownloadStatus(message.filename, task.endpointId);
    setSuccessStatus(formatDownloadSuccessMessage(result, result.path || target));
  } catch (error) {
    const key = task?.key || getDownloadTaskKey(message.filename, activeEndpointId || '');
    setDownloadTaskResult(key, {
      status: 'error',
      error: String(error),
    });
    console.error('[download] save as error', error);
    setErrorStatus(`另存为失败：${error}`);
  }
}

async function saveDownloadHistoryAs(task) {
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!saveDialog) {
      setErrorStatus('未检测到保存对话框插件，请确认已启用 dialog 插件');
      return;
    }
    const target = await saveDialog({
      defaultPath: task.originalName || task.filename || 'download.bin',
    });
    if (!target) {
      return;
    }
    updateDownloadTaskEntry({
      ...task,
      status: 'queued',
      received: 0,
      error: '',
      updatedAt: Date.now(),
    });
    const result = await invoke('save_download_history_as', {
      recordId: task.historyId,
      targetPath: target,
    });
    setDownloadTaskResult(task.key, {
      status: 'complete',
      path: result.path || target,
      error: '',
      localExists: true,
    });
    setSuccessStatus(formatDownloadSuccessMessage(result, result.path || target));
    await loadPersistedDownloadHistory({ silent: true });
    await loadPersistedDownloadHistory({ silent: true });
  } catch (error) {
    console.error('[download] history save as error', error);
    setErrorStatus(`另存为失败：${error}`);
    await loadPersistedDownloadHistory({ silent: true });
    await showInfoDialog({
      title: '另存为失败',
      message: String(error),
    });
    await loadPersistedDownloadHistory({ silent: true });
  }
}

async function redownloadDownloadHistory(task) {
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    updateDownloadTaskEntry({
      ...task,
      mode: 'download',
      status: 'queued',
      received: 0,
      error: '',
      updatedAt: Date.now(),
    });
    const result = await invoke('redownload_download_history', {
      recordId: task.historyId,
    });
    setDownloadTaskResult(task.key, {
      status: 'complete',
      path: result.path || task.path || '',
      error: '',
      localExists: true,
    });
    setSuccessStatus(formatDownloadSuccessMessage(result, result.path || task.path || ''));
    await loadPersistedDownloadHistory({ silent: true });
  } catch (error) {
    console.error('[download] history redownload error', error);
    setErrorStatus(`重新下载失败：${error}`);
    await showInfoDialog({
      title: '重新下载失败',
      message: String(error),
    });
    await loadPersistedDownloadHistory({ silent: true });
  }
}

async function deleteDownloadHistoryRecord(task) {
  if (!task?.historyId) {
    return;
  }
  const choice = await showDownloadHistoryDeleteConfirmDialog(1);
  if (choice === 'cancel') {
    return;
  }
  const deleteLocalFile = choice === 'local';
  try {
    if (!invoke) {
      await showInfoDialog({
        title: '删除失败',
        message: '未检测到 Tauri API，请检查 app.withGlobalTauri 设置',
      });
      return;
    }
    await invoke('delete_download_history', {
      recordId: task.historyId,
      deleteLocalFile,
    });
    const successMessage = deleteLocalFile ? '已删除下载记录和本地文件' : '已删除下载记录';
    setSuccessStatus(successMessage);
    await showInfoDialog({
      title: '删除成功',
      message: successMessage,
    });
    await loadPersistedDownloadHistory({ silent: true });
    if (deleteLocalFile) {
      await loadMessages();
    }
  } catch (error) {
    console.error('[download] history delete error', error);
    setErrorStatus(`删除下载记录失败：${error}`);
    await showInfoDialog({
      title: '删除下载记录失败',
      message: String(error),
    });
  }
}

async function deleteSelectedDownloadTasks() {
  if (currentTransferListView === 'uploads') {
    const uploadTasksByKey = new Map(getVisibleUploadTasks().map((task) => [task.key, task]));
    const selectedUploads = Array.from(selectedUploadTasks)
      .map((key) => uploadTasksByKey.get(key))
      .filter((task) => task?.historyId && task.status !== 'progress');
    if (!selectedUploads.length) {
      await showInfoDialog({
        title: '删除失败',
        message: '请先选择要删除的上传记录',
      });
      return;
    }
    try {
      if (!invoke) {
        await showInfoDialog({
          title: '删除失败',
          message: '未检测到 Tauri API，请检查 app.withGlobalTauri 设置',
        });
        return;
      }
      const confirmed = await showConfirmationDialog({
        title: '删除上传记录',
        message: `确认删除 ${selectedUploads.length} 条上传记录，包括本地文件吗？`,
        confirmLabel: '删除',
      });
      if (!confirmed) {
        return;
      }
      const recordIds = selectedUploads
        .map((task) => task.historyId)
        .filter((id) => Number.isInteger(id));
      await invoke('clear_upload_history_records', { recordIds });
      setDownloadSelectionMode(false);
      await loadPersistedUploadHistory({ silent: true });
      const successMessage = `已删除 ${recordIds.length} 条上传记录`;
      setSuccessStatus(successMessage);
      await showInfoDialog({
        title: '删除成功',
        message: successMessage,
      });
    } catch (error) {
      console.error('[upload] delete selected history error', error);
      setErrorStatus(`删除上传记录失败：${error}`);
      await showInfoDialog({
        title: '删除上传记录失败',
        message: String(error),
      });
    }
    return;
  }

  const selected = Array.from(selectedDownloadTasks)
    .map((key) => downloadTasks.get(key))
    .filter((task) => task?.historyId && !isDownloadTaskActive(task));
  if (!selected.length) {
    await showInfoDialog({
      title: '删除失败',
      message: '请先选择要删除的下载记录',
    });
    return;
  }
  const choice = await showDownloadHistoryDeleteConfirmDialog(selected.length);
  if (choice === 'cancel') {
    return;
  }
  const deleteLocalFile = choice === 'local';
  try {
    if (!invoke) {
      await showInfoDialog({
        title: '删除失败',
        message: '未检测到 Tauri API，请检查 app.withGlobalTauri 设置',
      });
      return;
    }
    const results = await Promise.allSettled(
      selected.map((task) =>
        invoke('delete_download_history', {
          recordId: task.historyId,
          deleteLocalFile,
        }),
      ),
    );
    const failed = results.filter((result) => result.status === 'rejected');
    const deletedCount = results.length - failed.length;
    setDownloadSelectionMode(false);
    await loadPersistedDownloadHistory({ silent: true });
    if (deleteLocalFile) {
      await loadMessages();
    }
    if (failed.length > 0) {
      const title = deletedCount > 0 ? '删除完成' : '删除失败';
      const message =
        deletedCount > 0
          ? `已删除 ${deletedCount} 条下载记录${deleteLocalFile ? '和本地文件' : ''}，${failed.length} 条处理失败。`
          : String(failed[0].reason || '删除下载记录失败');
      if (deletedCount > 0) {
        setSuccessStatus(`已删除 ${deletedCount} 条下载记录${deleteLocalFile ? '和本地文件' : ''}`);
      }
      setErrorStatus(message);
      await showInfoDialog({ title, message });
      return;
    }
    const successMessage = `已删除 ${deletedCount} 条下载记录${deleteLocalFile ? '和本地文件' : ''}`;
    setSuccessStatus(successMessage);
    await showInfoDialog({
      title: '删除成功',
      message: successMessage,
    });
  } catch (error) {
    console.error('[download] delete selected history error', error);
    setErrorStatus(`删除下载记录失败：${error}`);
    await showInfoDialog({
      title: '删除下载记录失败',
      message: String(error),
    });
  }
}

function getActiveMainTab() {
  const activeButton = tabButtons.find((button) => button.classList.contains('is-active'));
  return activeButton?.dataset.tabTarget || 'home';
}

async function clearCurrentTransferList() {
  const isDownloads = currentTransferListView === 'downloads';
  const clearableTasks = isDownloads ? getClearableDownloadTasks() : getClearableUploadTasks();
  if (!clearableTasks.length) {
    return;
  }
  const confirmed = await showConfirmationDialog({
    title: isDownloads ? '清空下载列表' : '清空上传列表',
    message: isDownloads
      ? '只会清空下载记录，不会删除本地文件，也不会影响进行中的下载。确定继续吗？'
      : '只会清空上传记录，不会删除本地文件，也不会影响进行中的上传。确定继续吗？',
    confirmLabel: '清空',
  });
  if (!confirmed) {
    return;
  }
  try {
    if (!invoke) {
      await showInfoDialog({
        title: '清空失败',
        message: '未检测到 Tauri API，请检查应用配置。',
      });
      return;
    }
    const recordIds = clearableTasks.map((task) => task.historyId).filter((id) => Number.isInteger(id));
    if (isDownloads) {
      setDownloadSelectionMode(false);
      await invoke('clear_download_history_records', { recordIds });
      await loadPersistedDownloadHistory({ silent: true });
    } else {
      await invoke('clear_upload_history_records', { recordIds });
      await loadPersistedUploadHistory({ silent: true });
    }
    const successMessage = isDownloads
      ? `已清空 ${recordIds.length} 条下载记录`
      : `已清空 ${recordIds.length} 条上传记录`;
    setSuccessStatus(successMessage);
  } catch (error) {
    console.error('[transfer] clear list error', error);
    setErrorStatus(`清空列表失败：${error}`);
    await showInfoDialog({
      title: '清空列表失败',
      message: String(error),
    });
  }
}

async function openDownloadHistoryDir(task) {
  if (!task?.historyId) {
    return;
  }
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    await invoke('open_download_history_dir', {
      recordId: task.historyId,
    });
  } catch (error) {
    console.error('[download] open history dir error', error);
    setErrorStatus(`打开目录失败：${error}`);
    await showInfoDialog({
      title: '打开目录失败',
      message: String(error),
    });
  }
}

async function openDownloadHistoryFile(task) {
  if (!task?.historyId) {
    return;
  }
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 配置');
      return;
    }
    await invoke('open_download_history_file', {
      recordId: task.historyId,
    });
  } catch (error) {
    console.error('[download] open history file error', error);
    setErrorStatus(`打开文件失败：${error}`);
    await showInfoDialog({
      title: '打开文件失败',
      message: String(error),
    });
  }
}

async function deleteSingleMessage(message) {
  if (!message || !message.filename) {
    return false;
  }
  if (!invoke) {
    await showInfoDialog({
      title: '删除失败',
      message: '未检测到 Tauri API，请检查app.withGlobalTauri 设置',
    });
    return false;
  }
  const choice = await showDeleteConfirmDialog(1);
  if (choice === 'cancel') {
    return false;
  }
  let deleted = false;
  try {
    const result = await invoke('delete_messages', {
      filenames: [message.filename],
      deleteRemote: choice === 'remote',
    });
    const failed = result.failed || [];
    if (failed.length > 0) {
      await showInfoDialog({
        title: '删除失败',
        message: '删除失败，请稍后再试',
      });
    } else {
      if (choice === 'remote') {
        await showInfoDialog({
          title: '删除成功',
          message: '已删除1 条消息',
        });
      } else {
        await showInfoDialog({
          title: '删除成功',
          message: '已删除本地文件',
        });
      }
      deleted = true;
    }
    await Promise.all([
      loadMessages(),
      loadMarkedMessages(),
    ]);
    return deleted;
  } catch (error) {
    await showInfoDialog({
      title: '删除失败',
      message: String(error),
    });
    return false;
  }
}
async function deleteSelectedMessages() {
  const filenames = Array.from(selectedMessages);
  if (!filenames.length) {
    await showInfoDialog({
      title: '删除失败',
      message: '请先选择要删除的消息',
    });
    return;
  }
  if (!invoke) {
    await showInfoDialog({
      title: '删除失败',
      message: '未检测到 Tauri API，请检查 app.withGlobalTauri 设置',
    });
    return;
  }
  const choice = await showDeleteConfirmDialog(filenames.length);
  if (choice === 'cancel') {
    return;
  }
  try {
    const result = await invoke('delete_messages', {
      filenames,
      deleteRemote: choice === 'remote',
    });
    const failed = result.failed || [];
    if (failed.length > 0) {
      await showInfoDialog({
        title: '删除完成',
        message: `已删除 ${result.deleted || 0} 条消息，${failed.length} 条处理失败`,
      });
    } else {
      if (choice === 'remote') {
        await showInfoDialog({
          title: '删除成功',
          message: `已删除 ${result.deleted || filenames.length} 条消息`,
        });
      } else {
        await showInfoDialog({
          title: '删除成功',
          message: `已删除 ${result.deleted || filenames.length} 个文件的本地副本`,
        });
      }
    }
  } catch (error) {
    await showInfoDialog({
      title: '删除失败',
      message: String(error),
    });
  } finally {
    setSelectionMode(false);
    await Promise.all([
      loadMessages(),
      loadMarkedMessages(),
    ]);
  }
}
async function cleanupMessages() {
  if (!invoke) {
    setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
    return;
  }
  const options = await showCleanupConfirmDialog();
  if (!options) {
    return;
  }
  try {
    const result = await invoke('cleanup_messages', {
      range: options.range,
      scope: options.scope,
    });
    const failed = result.failed || [];
    if (failed.length > 0) {
      setErrorStatus(`清理完成，${failed.length} 条处理失败`);
      await showInfoDialog({
        title: '清理完成',
        message: `已清理 ${result.deleted || 0} 条消息，${failed.length} 条失败。`,
      });
    } else {
      setSuccessStatus(`已清理 ${result.deleted || 0} 条消息`);
      await showInfoDialog({
        title: '清理完成',
        message: `已清理 ${result.deleted || 0} 条消息。`,
      });
    }
    await Promise.all([
      loadMessages(),
      loadMarkedMessages(),
    ]);
  } catch (error) {
    setErrorStatus(`清理失败：${error}`);
    await showInfoDialog({
      title: '清理失败',
      message: String(error),
    });
  }
}

async function legacyToggleMessageMarked(message) {
  if (!message || !message.filename) return;
  if (!invoke) return;
  
  const newMarked = !message.marked;
  // Optimistic update
  message.marked = newMarked;
  
  // Update count optimistically
  let currentLabel = markedFilterLabel?.textContent || '已标记 (0)';
  let match = currentLabel.match(/\((\d+)\)/);
  let currentCount = match ? parseInt(match[1], 10) : 0;
  updateMarkedBadge(currentCount + (newMarked ? 1 : -1));

  // Direct DOM update instead of full re-render to prevent scrolling jumps
  const cardSelector = `.message-card[data-filename="${escapeSelector(message.filename)}"]`;
  const card = document.querySelector(cardSelector);
  if (card) {
    card.classList.toggle('is-marked', newMarked);
    const markBtn = card.querySelector('.mark-action');
    if (markBtn) {
      markBtn.classList.toggle('is-marked', newMarked);
    }
    
    // If we are in "Marked Only" mode and we unmark a message, remove it nicely
    if (markedFilterActive && !newMarked) {
        card.remove();
        if (messageList.children.length === 0) {
             renderMessages([]); // Show empty state
        }
    }
  } else {
      // Fallback if not found (unlikely)
      renderMessages(lastMessages);
  }
  
  try {
    const command = newMarked ? 'mark_message' : 'unmark_message';
    await invoke(command, { filename: message.filename });
  } catch (error) {
    // Revert on error
    message.marked = !newMarked;
    updateMarkedBadge(currentCount); // Revert count
    
    if (card) {
        card.classList.toggle('is-marked', !newMarked);
        const markBtn = card.querySelector('.mark-action');
        if (markBtn) {
            markBtn.classList.toggle('is-marked', !newMarked);
        }
        // If we removed it, we can't easily put it back without re-render or complex logic.
        // For simplicity, just re-render on error if we messed up the list structure.
        if (markedFilterActive && !newMarked) { // We tried to mark it but failed? No, we tried to UNmark.
             // If we unmarked and removed it, and now revert (mark again), we need to show it.
             renderMessages(lastMessages);
        }
    } else {
        renderMessages(lastMessages);
    }
    showToast(`操作失败: ${error}`, 'error');
  }
}

function legacyUpdateMarkedBadge(count) {
  if (!markedFilterLabel || !filterMarkedButton) return;
  const validCount = Math.max(0, count);
  markedFilterLabel.textContent = `已标记 (${validCount})`;
  filterMarkedButton.classList.toggle('has-marked', validCount > 0);
}


function legacySetMarkedFilterActive(active) {
  markedFilterActive = !!active;
  if (filterMarkedButton) {
    filterMarkedButton.classList.toggle('is-active', markedFilterActive);
  }
}

function legacyResetMarkedFilter(options = {}) {
  const shouldReload = options.reload !== false;
  if (!markedFilterActive) {
    return false;
  }

  legacySetMarkedFilterActive(false);
  resetLoadedMessagesState();

  if (shouldReload) {
    loadMessages(options.loadOptions || {});
  }

  return true;
}

function closeMessagePreview() {
  if (!messagePreview) return;
  currentPreviewMessage = null;
  if (messagePreviewBody) {
    messagePreviewBody.innerHTML = '';
  }
  if (messagePreviewActions) {
    messagePreviewActions.innerHTML = '';
  }
  messagePreview.classList.remove('is-active');
  messagePreview.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('preview-open');
}

function renderPreviewActions(message) {
  if (!messagePreviewActions) return;
  messagePreviewActions.className = 'message-preview-toolbar';
  messagePreviewActions.innerHTML = '';
  if (!message) return;

  const buttons = [];

  const markButton = document.createElement('button');
  markButton.type = 'button';
  markButton.className = 'button ghost small icon-only mark-action';
  markButton.title = message.marked ? '取消标记' : '标记';
  markButton.classList.toggle('is-marked', !!message.marked);
  const markIcon = document.createElement('img');
  markIcon.src = 'icons/mark.svg';
  markIcon.alt = '标记';
  markIcon.style.width = '16px';
  markIcon.style.height = '16px';
  markButton.appendChild(markIcon);
  markButton.addEventListener('click', async () => {
    await toggleMessageMarked(message);
    if (!messagePreview?.classList.contains('is-active')) {
      return;
    }
    if (currentPreviewMessage?.filename !== message.filename) {
      return;
    }
    currentPreviewMessage = message;
    renderPreviewActions(message);
  });
  buttons.push(markButton);

  if (message.kind === 'text') {
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'button ghost small';
    copyButton.textContent = '复制内容';
    copyButton.addEventListener('click', () => copyTextToClipboard(message.content || ''));
    buttons.push(copyButton);

    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.className = 'button ghost small';
    downloadButton.textContent = '下载文件';
    downloadButton.addEventListener('click', () => downloadTextMessageAsFile(message));
    buttons.push(downloadButton);
  } else {
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'button primary small';
    openButton.textContent = hasLocalMessageFile(message) ? '打开文件' : '下载并打开';
    openButton.addEventListener('click', () => openMessageFile(message));
    buttons.push(openButton);

    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.className = 'button ghost small';
    downloadButton.textContent = '下载';
    downloadButton.addEventListener('click', () => downloadMessageFile(message));
    buttons.push(downloadButton);

    const saveAsButton = document.createElement('button');
    saveAsButton.type = 'button';
    saveAsButton.className = 'button ghost small';
    saveAsButton.textContent = '另存为';
    saveAsButton.addEventListener('click', () => saveMessageFileAs(message));
    buttons.push(saveAsButton);
  }

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'button ghost small delete-action';
  deleteButton.textContent = '删除';
  deleteButton.addEventListener('click', async () => {
    const deleted = await deleteSingleMessage(message);
    if (deleted) {
      closeMessagePreview();
    }
  });
  buttons.push(deleteButton);

  buttons.forEach((button) => messagePreviewActions.appendChild(button));
}

function renderPreviewContent(message) {
  if (!messagePreviewBody || !messagePreviewMeta || !message) return;
  messagePreviewBody.innerHTML = '';
  messagePreviewBody.className = 'message-preview-body';

  const senderLabel = message.sender || '未知发送者';
  const timeLabel = formatTime(message.timestamp_ms) || '';
  messagePreviewMeta.textContent = timeLabel ? `${senderLabel} • ${timeLabel}` : senderLabel;
  renderPreviewActions(message);

  if (message.kind === 'text') {
    messagePreviewBody.classList.add('is-markdown');
    if (message.format === 'markdown' && window.editormd) {
      const holder = document.createElement('div');
      const uniqueId = `preview-md-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      holder.id = uniqueId;
      holder.className = 'markdown-body editormd-html-preview';
      messagePreviewBody.appendChild(holder);
      editormd.markdownToHTML(uniqueId, {
        markdown: message.content || '',
        htmlDecode: 'style,script,iframe',
        emoji: true,
        taskList: true,
        tex: false,
        flowChart: true,
        sequenceDiagram: true,
      });
      // Inject extras
      injectMarkdownExtras(holder);
    } else {
      messagePreviewBody.classList.remove('is-markdown');
      const textBlock = document.createElement('div');
      textBlock.textContent = message.content || '';
      messagePreviewBody.appendChild(textBlock);
    }
  } else {
    messagePreviewBody.classList.remove('is-markdown');
    
    const isImage = isImagePath(message.original_name || message.filename);
    const tauriConvert = window.__TAURI__?.tauri?.convertFileSrc || window.__TAURI__?.path?.convertFileSrc || window.__TAURI__?.core?.convertFileSrc;

    if (isImage && tauriConvert) {
      const imgContainer = document.createElement('div');
      imgContainer.className = 'message-preview-image-wrap';
      
      const img = document.createElement('img');
      img.className = 'message-preview-image';
      
      if (message.local_path) {
        img.src = tauriConvert(message.local_path);
      } else {
        // Try thumbnail first
        invoke('get_thumbnail', { filename: message.filename })
          .then(path => {
            if (!img.getAttribute('src')) {
              img.src = tauriConvert(path);
            }
          })
          .catch(() => {});
      }
      
      imgContainer.appendChild(img);
      messagePreviewBody.appendChild(imgContainer);
    }

    const title = document.createElement('div');
    title.className = 'message-preview-file-title';
    title.textContent = message.original_name || message.filename || '文件';

    const meta = document.createElement('div');
    meta.className = 'message-preview-file-meta';
    meta.textContent = `大小 ${formatBytes(message.size || 0)}`;

    const actions = document.createElement('div');
    actions.className = 'message-preview-actions';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'button primary small';
    openBtn.textContent = hasLocalMessageFile(message) ? '打开文件' : '下载并打开';
    openBtn.addEventListener('click', () => openMessageFile(message));

    actions.appendChild(openBtn);

    messagePreviewBody.appendChild(title);
    messagePreviewBody.appendChild(meta);
    messagePreviewBody.appendChild(actions);
  }
}

function openMessagePreview(message) {
  if (!messagePreview || !message) return;
  currentPreviewMessage = message;
  messagePreview.classList.add('is-active');
  messagePreview.setAttribute('aria-hidden', 'false');
  document.body.classList.add('preview-open');
  renderPreviewContent(message);
  if (message.kind === 'text' && message.format === 'markdown') {
    setTimeout(() => {
      if (currentPreviewMessage === message && messagePreview.classList.contains('is-active')) {
        renderPreviewContent(message);
      }
    }, 0);
  }
}

function shouldShowMenuAbove(item) {
  if (!messageList || !item) return false;
  
  const itemRect = item.getBoundingClientRect();
  const listRect = messageList.getBoundingClientRect();
  
  // 计算菜单的大概高度（约100px）
  const menuHeight = 100;
  const spaceBelow = listRect.bottom - itemRect.bottom;
  const spaceAbove = itemRect.top - listRect.top;
  
  // 如果下方空间不足，且上方空间足够，则在上方显示
  return spaceBelow < menuHeight && spaceAbove >= menuHeight;
}

function renderMessages(messages, options = {}) {
  const { scrollToBottom = false, preserveScroll = false, isSearchResult = false, query = '' } = options;
  // The `messages` parameter is now the single source of truth for this render pass.
  // We no longer modify the global `lastMessages` here.
  const merged = mergeMessages(messages, options);
  const previousScrollTop = messageList ? messageList.scrollTop : 0;
  const previousScrollHeight = messageList ? messageList.scrollHeight : 0;
  const available = new Set(merged.map((message) => message.filename));
  expandedTextMessages.forEach((filename) => {
    if (!available.has(filename)) {
      expandedTextMessages.delete(filename);
    }
  });
  selectedMessages.forEach((filename) => {
    if (!available.has(filename)) {
      selectedMessages.delete(filename);
    }
  });
  updateSelectionBar();
  messageList.innerHTML = '';
  
  const markdownRenderQueue = [];
  const collapseQueue = [];

  // 添加"加载更多"提示
  if (hasMoreMessages && !isSearchResult) {
    const loadMoreItem = document.createElement('li');
    loadMoreItem.className = 'load-more-hint';
    loadMoreItem.id = 'load-more-hint';
    loadMoreItem.textContent = isLoadingMore ? '加载中...' : '向上滚动加载更多';
    messageList.appendChild(loadMoreItem);
  }
  
  if (!merged || merged.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'message-card';
    if (isSearchResult) {
      empty.textContent = `没有找到与 "${query}" 匹配的消息`;
    } else {
      empty.textContent = '暂无消息';
    }
    messageList.appendChild(empty);
    updateScrollToBottomButton();
    return;
  }

  merged.forEach((message) => {
    const item = document.createElement('li');
    item.className = 'message-card';
    const isFile = message.kind === 'file';
    const selfName = senderNameInput?.value.trim();
    const isSelf = message.sender === '我' || (selfName && message.sender === selfName);
    let fileBodyClickTimer = null;
    item.classList.toggle('is-file', isFile);
    item.classList.toggle('is-text', !isFile);
    item.classList.toggle('is-self', isSelf);
    item.classList.toggle('is-marked', !!message.marked);
    item.classList.toggle('with-selection', selectionMode);
    item.dataset.filename = message.filename;
    item.classList.toggle('is-selected', selectedMessages.has(message.filename));

    const header = document.createElement('div');
    header.className = 'message-header';
    let selectionCheckbox = null;
    if (selectionMode) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'message-select';
      checkbox.checked = selectedMessages.has(message.filename);
      checkbox.disabled = !!message.uploading;
      checkbox.addEventListener('change', () => {
        toggleSelectedMessage(message.filename, checkbox.checked);
        item.classList.toggle('is-selected', checkbox.checked);
      });
      selectionCheckbox = checkbox;
      item.appendChild(checkbox);
    }
    const headerText = document.createElement('span');
    headerText.textContent = `${message.sender} · ${formatTime(message.timestamp_ms)}`;
    header.appendChild(headerText);

    const body = document.createElement('div');
    body.className = 'message-body';
    if (message.kind === 'text') {
      if (message.format === 'markdown') {
        body.classList.add('markdown-body', 'editormd-html-preview', 'is-markdown');
        // Generate a safe unique ID
        const uniqueId = `md-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        body.id = uniqueId;
        
        markdownRenderQueue.push({
          id: uniqueId,
          content: message.content || '',
        });
      } else {
        body.textContent = message.content || '';
      }
      collapseQueue.push({ item, body, message });
    } else {
      const isImage = isImagePath(message.original_name || message.filename);
      if (isImage) {
        body.classList.add('is-image-message');
        body.innerHTML = ''; // Clear existing content

        const thumbImg = document.createElement('img');
        thumbImg.className = 'message-thumbnail';
        thumbImg.alt = '缩略图';

        const fileNameSpan = document.createElement('span');
        fileNameSpan.textContent = message.original_name || message.filename || '';

        body.appendChild(thumbImg);
        body.appendChild(fileNameSpan);
        
        const tauriConvert = window.__TAURI__?.tauri?.convertFileSrc || window.__TAURI__?.path?.convertFileSrc || window.__TAURI__?.core?.convertFileSrc;
        
        invoke('get_thumbnail', { filename: message.filename })
          .then(path => {
            if (tauriConvert) {
              thumbImg.src = tauriConvert(path);
            }
          })
          .catch(err => {
            console.warn('Load thumbnail failed', err);
            thumbImg.style.display = 'none';
          });
          
        body.addEventListener('dblclick', () => {
          openMessagePreview(message);
        });
      } else {
        body.textContent = message.original_name || message.filename || '';
      }
      
    }

    body.addEventListener('click', (event) => {
      if (
        event.target.closest(
          'button, a, input, textarea, select, summary, details, .action-menu, .message-actions',
        )
      ) {
        return;
      }
      if (selectionMode) {
        if (message.uploading) {
          return;
        }
        if (fileBodyClickTimer) {
          clearTimeout(fileBodyClickTimer);
          fileBodyClickTimer = null;
        }
        const nextChecked = !selectedMessages.has(message.filename);
        toggleSelectedMessage(message.filename, nextChecked);
        item.classList.toggle('is-selected', nextChecked);
        if (selectionCheckbox) {
          selectionCheckbox.checked = nextChecked;
        }
        return;
      }
      if (message.kind !== 'file' || message.uploading) {
        return;
      }
      if (fileBodyClickTimer) {
        clearTimeout(fileBodyClickTimer);
      }
      fileBodyClickTimer = setTimeout(() => {
        openMessageFile(message);
        fileBodyClickTimer = null;
      }, 180);
    });

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = `大小 ${formatBytes(message.size || 0)}`;

    const actions = document.createElement('div');
    actions.className = 'message-actions';

    if (message.kind === 'text') {
      // 显示发送状态
      if (message.sending) {
        item.classList.add('is-sending');
        item.dataset.sendStatus = message.sendStatus;
        
        const statusTag = document.createElement('span');
        if (message.sendStatus === SEND_STATUS.SENDING) {
          statusTag.className = 'sending-tag';
          statusTag.textContent = '发送中...';
        } else if (message.sendStatus === SEND_STATUS.SUCCESS) {
          statusTag.className = 'send-success-tag';
          statusTag.textContent = '已发送';
        } else if (message.sendStatus === SEND_STATUS.FAILED) {
          statusTag.className = 'send-failed-tag';
          statusTag.textContent = '发送失败';
          statusTag.title = message.sendError || '';
          
          // 添加重试按钮
          const retryButton = document.createElement('button');
          retryButton.className = 'button ghost small';
          retryButton.textContent = '重试';
          retryButton.addEventListener('click', () => {
            pendingSends.delete(message.filename);
            const formatToUse = message.format || 'text';
            
            // Switch format UI
            const radio = document.querySelector(`input[name="message-format"][value="${formatToUse}"]`);
            if (radio) {
              radio.checked = true;
              switchFormat(formatToUse);
            }

            if (formatToUse === 'markdown' && mdEditor) {
              mdEditor.setMarkdown(message.content || '');
            } else {
              textInput.value = message.content || '';
            }
            renderMessages(lastMessages);
            sendText();
          });
          actions.appendChild(retryButton);
          
          // 添加取消按钮
          const cancelButton = document.createElement('button');
          cancelButton.className = 'button ghost small';
          cancelButton.textContent = '取消';
          cancelButton.addEventListener('click', () => {
            pendingSends.delete(message.filename);
            renderMessages(lastMessages);
          });
          actions.appendChild(cancelButton);
        }
        actions.appendChild(statusTag);
      } else {
        const markButton = document.createElement('button');
        markButton.className = 'button ghost small icon-only mark-action';
        markButton.classList.toggle('is-marked', !!message.marked);
        const markIcon = document.createElement('img');
        markIcon.src = 'icons/mark.svg';
        markIcon.alt = '标记';
        markIcon.style.width = '16px';
        markIcon.style.height = '16px';
        markButton.appendChild(markIcon);
        markButton.addEventListener('click', () => toggleMessageMarked(message));
        actions.appendChild(markButton);

        const copyButton = document.createElement('button');
        copyButton.className = 'button ghost small icon-only';
        const copyIcon = document.createElement('img');
        copyIcon.src = 'icons/copy.svg';
        copyIcon.alt = '复制';
        copyIcon.style.width = '16px';
        copyIcon.style.height = '16px';
        copyButton.appendChild(copyIcon);
        copyButton.addEventListener('click', () => copyTextToClipboard(message.content || ''));
        actions.appendChild(copyButton);

        const downloadTextButton = document.createElement('button');
        downloadTextButton.className = 'button primary small icon-only';
        const downloadTextIcon = document.createElement('img');
        downloadTextIcon.src = 'icons/download.svg';
        downloadTextIcon.alt = '下载为文件';
        downloadTextIcon.style.width = '16px';
        downloadTextIcon.style.height = '16px';
        downloadTextButton.appendChild(downloadTextIcon);
        downloadTextButton.addEventListener('click', () => downloadTextMessageAsFile(message));
        actions.appendChild(downloadTextButton);

        const menu = document.createElement('details');
        menu.className = 'action-menu';

        const summary = document.createElement('summary');
        summary.className = 'button ghost small icon-only';
        const iconImg = document.createElement('img');
        iconImg.src = 'icons/more.svg';
        iconImg.alt = '更多';
        iconImg.style.width = '16px';
        iconImg.style.height = '16px';
        summary.appendChild(iconImg);

        const menuList = document.createElement('div');
        menuList.className = 'action-menu-list';

        const deleteButton = document.createElement('button');
        deleteButton.className = 'button ghost small delete-action';
        deleteButton.textContent = '删除';
        deleteButton.addEventListener('click', () => {
          menu.open = false;
          deleteSingleMessage(message);
        });

        const downloadAsFileButton = document.createElement('button');
        downloadAsFileButton.className = 'button ghost small';
        downloadAsFileButton.textContent = '下载为文件';
        downloadAsFileButton.addEventListener('click', () => {
          menu.open = false;
          downloadTextMessageAsFile(message);
        });

        menuList.appendChild(downloadAsFileButton);
        menuList.appendChild(deleteButton);
        menu.appendChild(summary);
        menu.appendChild(menuList);
        actions.appendChild(menu);
        
        // 检测菜单是否应该在图标上方显示
        menu.addEventListener('toggle', () => {
          // 使用setTimeout确保DOM已更新
          setTimeout(() => {
            if (menu.open && shouldShowMenuAbove(item)) {
              menuList.classList.add('menu-up');
            } else {
              menuList.classList.remove('menu-up');
            }
          }, 0);
        });
      }
    } else {
      if (message.uploading) {
        item.classList.add('is-uploading');
        const uploadingTag = document.createElement('span');
        uploadingTag.className = 'uploading-tag';
        uploadingTag.textContent = '上传中';
        actions.appendChild(uploadingTag);
      } else {
        const downloadTask = getDownloadTask(message.filename, activeEndpointId);
        const isDownloading = isDownloadTaskActive(downloadTask);
        if (isDownloading) {
          item.classList.add('is-downloading');
        }

        const markButton = document.createElement('button');
        markButton.className = 'button ghost small icon-only mark-action';
        markButton.classList.toggle('is-marked', !!message.marked);
        const markIcon = document.createElement('img');
        markIcon.src = 'icons/mark.svg';
        markIcon.alt = '标记';
        markIcon.style.width = '16px';
        markIcon.style.height = '16px';
        markButton.appendChild(markIcon);
        markButton.addEventListener('click', () => toggleMessageMarked(message));
        actions.appendChild(markButton);

        const downloadButton = document.createElement('button');
        downloadButton.className = 'button primary small icon-only download-action';
        const downloadIcon = document.createElement('img');
        downloadIcon.src = 'icons/download.svg';
        downloadIcon.alt = '下载';
        downloadIcon.style.width = '16px';
        downloadIcon.style.height = '16px';
        downloadButton.appendChild(downloadIcon);
        downloadButton.addEventListener('click', () => downloadMessageFile(message));
        actions.appendChild(downloadButton);

        const downloadingTag = document.createElement('span');
        downloadingTag.className = 'downloading-tag download-progress-tag';
        downloadingTag.textContent = '下载中';
        actions.appendChild(downloadingTag);

        const menu = document.createElement('details');
        menu.className = 'action-menu';

        const summary = document.createElement('summary');
        summary.className = 'button ghost small icon-only';
        const iconImg = document.createElement('img');
        iconImg.src = 'icons/more.svg';
        iconImg.alt = '更多';
        iconImg.style.width = '16px';
        iconImg.style.height = '16px';
        summary.appendChild(iconImg);

        const menuList = document.createElement('div');
        menuList.className = 'action-menu-list';

        const saveAsButton = document.createElement('button');
        saveAsButton.className = 'button ghost small';
        saveAsButton.textContent = '另存为';
        saveAsButton.addEventListener('click', () => {
          menu.open = false;
          saveMessageFileAs(message);
        });

        const deleteButton = document.createElement('button');
        deleteButton.className = 'button ghost small delete-action';
        deleteButton.textContent = '删除';
        deleteButton.addEventListener('click', () => {
          menu.open = false;
          deleteSingleMessage(message);
        });

        menuList.appendChild(saveAsButton);
        menuList.appendChild(deleteButton);
        menu.appendChild(summary);
        menu.appendChild(menuList);
        actions.appendChild(menu);
        
        // 检测菜单是否应该在图标上方显示
        menu.addEventListener('toggle', () => {
          // 使用setTimeout确保DOM已更新
          setTimeout(() => {
            if (menu.open && shouldShowMenuAbove(item)) {
              menuList.classList.add('menu-up');
            } else {
              menuList.classList.remove('menu-up');
            }
          }, 0);
        });
      }
    }

    const footer = document.createElement('div');
    footer.className = 'message-footer';
    footer.appendChild(meta);
    footer.appendChild(actions);

    item.appendChild(header);
    item.appendChild(body);
    item.appendChild(footer);

    item.addEventListener('dblclick', (event) => {
      if (selectionMode) {
        return;
      }
      if (message.uploading) {
        return;
      }
      if (
        event.target.closest(
          'button, a, input, textarea, select, summary, details, .action-menu, .message-actions',
        )
      ) {
        return;
      }
      if (fileBodyClickTimer) {
        clearTimeout(fileBodyClickTimer);
        fileBodyClickTimer = null;
      }
      openMessagePreview(message);
    });

    item.addEventListener('click', (event) => {
      if (event.detail > 1) {
        return;
      }
      if (!selectionMode || !selectionCheckbox || selectionCheckbox.disabled) {
        return;
      }
      if (
        event.target.closest(
          'button, a, input, textarea, select, summary, details, .action-menu, .message-actions',
        )
      ) {
        return;
      }
      selectionCheckbox.checked = !selectionCheckbox.checked;
      toggleSelectedMessage(message.filename, selectionCheckbox.checked);
      item.classList.toggle('is-selected', selectionCheckbox.checked);
    });

    if (message.kind === 'file') {
      const progress = getDownloadTask(message.filename, activeEndpointId);
      const progressWrap = document.createElement('div');
      progressWrap.className = 'download-progress';
      progressWrap.dataset.filename = message.filename;

      const progressBar = document.createElement('div');
      progressBar.className = 'download-progress-bar';

      const progressFill = document.createElement('div');
      progressFill.className = 'download-progress-fill';
      progressBar.appendChild(progressFill);

      const progressText = document.createElement('div');
      progressText.className = 'download-progress-text';

      progressWrap.appendChild(progressBar);
      progressWrap.appendChild(progressText);

      if (progress && isDownloadTaskActive(progress)) {
        const total = progress.total || 0;
        if (total > 0) {
          const percent = Math.min(100, Math.round((progress.received / total) * 100));
          progressFill.style.width = `${percent}%`;
        }
        const progressTextValue = formatDownloadProgressText(
          progress,
          getSpeed(downloadSpeed, progress.key || message.filename),
        );
        progressText.textContent = formatProgress(
          progress.received || 0,
          progress.total,
          '已下载',
          getSpeed(downloadSpeed, message.filename),
        );
        progressText.textContent = progressTextValue;
      } else {
        progressWrap.classList.add('hidden');
      }

      item.appendChild(progressWrap);

      if (message.uploading) {
        const upload = pendingUploads.get(message.filename);
        const uploadWrap = document.createElement('div');
        uploadWrap.className = 'upload-progress';
        uploadWrap.dataset.uploadId = message.filename;

        const uploadBar = document.createElement('div');
        uploadBar.className = 'upload-progress-bar';

        const uploadFill = document.createElement('div');
        uploadFill.className = 'upload-progress-fill';
        uploadBar.appendChild(uploadFill);

        const uploadText = document.createElement('div');
        uploadText.className = 'upload-progress-text';

        uploadWrap.appendChild(uploadBar);
        uploadWrap.appendChild(uploadText);

        if (upload && upload.status === 'progress') {
          const total = upload.total || 0;
          if (total > 0) {
            const percent = Math.min(100, Math.round((upload.received / total) * 100));
            uploadFill.style.width = `${percent}%`;
          }
          uploadText.textContent = formatProgress(
            upload.received || 0,
            upload.total,
            uploadStatusLabel(upload),
            getSpeed(uploadSpeed, message.filename),
          );
        } else {
          uploadWrap.classList.add('hidden');
        }

        item.appendChild(uploadWrap);
      }
    }
    messageList.appendChild(item);
  });
  
  // Render pending markdown messages
  const runBodyCollapseCheck = () => {
    collapseQueue.forEach(({ item, body, message }) => {
      applyMessageBodyCollapse(item, body, message);
    });
  };
  if (markdownRenderQueue.length > 0 && window.editormd) {
    // execute after DOM update
    setTimeout(() => {
      markdownRenderQueue.forEach(item => {
        try {
          editormd.markdownToHTML(item.id, {
            markdown: item.content,
            htmlDecode: "style,script,iframe",
            emoji: true,
            taskList: true,
            tex: false, 
            flowChart: true, 
            sequenceDiagram: true,
          });

          // Inject extras (copy buttons, save image buttons)
          const container = document.getElementById(item.id);
          injectMarkdownExtras(container);
        } catch (e) {
          console.error("Failed to render markdown for", item.id, e);
          const el = document.getElementById(item.id);
          if (el) el.textContent = item.content;
        }
      });
      runBodyCollapseCheck();
    }, 0);
  } else {
    setTimeout(runBodyCollapseCheck, 0);
  }

  if (scrollToBottom) {
    scrollMessageListToBottom();
  } else if (preserveScroll && messageList) {
    // 加载更多时，保持滚动位置（补偿新增内容的高度）
    const newScrollHeight = messageList.scrollHeight;
    const scrollDiff = newScrollHeight - previousScrollHeight;
    messageList.scrollTop = previousScrollTop + scrollDiff;
    updateScrollToBottomButton();
  } else {
    if (messageList) {
      const maxScrollTop = Math.max(0, messageList.scrollHeight - messageList.clientHeight);
      messageList.scrollTop = Math.min(previousScrollTop, maxScrollTop);
    }
    updateScrollToBottomButton();
  }
}
function mergeMessages(messages, options = {}) {
  const { isSearchResult = false } = options;
  const merged = [...messages];
  
  if (!isSearchResult) {
    // 合并待发送的文本消息
    pendingSends.forEach((send) => {
      merged.push({
        filename: send.filename || send.tempId,
        sender: send.sender,
        timestamp_ms: send.timestamp_ms,
        size: send.size || (send.text ? send.text.length : 0),
        kind: 'text',
        original_name: send.format === 'markdown' ? 'message.md' : 'message.txt',
        content: send.content || send.text,
        local_path: null,
        download_exists: false,
        sending: true,
        sendStatus: send.sendStatus || send.status,
        sendError: send.sendError || send.error,
        format: send.format || 'text',
      });
    });
    
    // 合并待上传的文件
    pendingUploads.forEach((upload) => {
      merged.push({
        filename: upload.clientId,
        sender: senderNameInput.value.trim() || '我',
        timestamp_ms: upload.timestamp_ms,
        size: upload.total || 0,
        kind: 'file',
        original_name: upload.originalName || '上传文件',
        content: null,
        local_path: upload.localPath || null,
        download_exists: false,
        uploading: true,
      });
    });
  }
  
  merged.sort((a, b) => (a.timestamp_ms || 0) - (b.timestamp_ms || 0));
  return merged;
}

function hasActiveContentTransfer() {
  const hasSendingText = Array.from(pendingSends.values()).some((send) => {
    const status = send?.sendStatus || send?.status;
    return status === SEND_STATUS.SENDING;
  });
  return hasSendingText || pendingUploads.size > 0 || hasActiveDownloadTasks();
}

async function loadMessages(options = {}) {
  if (isLoadMessagesRunning && options.checkNew) {
    return;
  }
  if (options.checkNew && isMessageSelectionRefreshPaused()) {
    return;
  }
  isLoadMessagesRunning = true;
  const shouldScroll =
    typeof options.scrollToBottom === 'boolean'
      ? options.scrollToBottom
      : isMessageListAtBottom();
  const loadMore = options.loadMore || false;
  const checkNew = options.checkNew || false; // 新增：检查新消息模式
  
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!getActiveEndpoint()) {
      resetLoadedMessagesState();
      totalMessages = 0;
      renderMessages([], { scrollToBottom: shouldScroll });
      return;
    }
    
    if (loadMore) {
      // 加载更多历史消息
      if (isLoadingMore || !hasMoreMessages) return;
      isLoadingMore = true;
      const newOffset = currentOffset + PAGE_SIZE;
      const result = await invoke('list_messages', { limit: PAGE_SIZE, offset: newOffset });
      isLoadingMore = false;
      
      if (result.marked_count !== undefined) {
        updateMarkedBadge(result.marked_count);
      }

      if (result.messages && result.messages.length > 0) {
        // 将新加载的消息添加到开头
        lastMessages = [...result.messages, ...lastMessages];
        syncCurrentOffsetWithLoadedMessages();
        hasMoreMessages = result.has_more;
        totalMessages = result.total;
        renderMessages(lastMessages, { scrollToBottom: false, preserveScroll: true });
      }
    } else if (checkNew) {
      // 定时刷新模式：只检查新消息
      const result = await invoke('list_messages', { limit: PAGE_SIZE, offset: 0 });
      
      if (result.marked_count !== undefined) {
        updateMarkedBadge(result.marked_count);
      }

      const newMessages = result.messages || [];
      
      if (newMessages.length === 0) {
        // 没有任何消息
        if (lastMessages.length > 0) {
          resetLoadedMessagesState();
          totalMessages = 0;
          renderMessages([], { scrollToBottom: shouldScroll });
        }
        return;
      }
      
      if (lastMessages.length === 0) {
        // 本地没有消息，直接使用服务器返回的消息
        lastMessages = newMessages;
        syncCurrentOffsetWithLoadedMessages();
        totalMessages = result.total || 0;
        hasMoreMessages = result.has_more || false;
        renderMessages(lastMessages, { scrollToBottom: shouldScroll });
        return;
      }
      
      // 找出真正的新消息（不在当前列表中的）
      // 注意：消息按时间正序排列，最新的在数组末尾
      // 找出真正的新消息以及需要更新状态的消息
      const newMessagesMap = new Map(newMessages.map(msg => [msg.filename, msg]));
      let stateChanged = false;
      
      // 1. 更新现有消息的状态（标记状态、下载状态等）
      lastMessages = lastMessages.map(oldMsg => {
        if (newMessagesMap.has(oldMsg.filename)) {
          const newMsg = newMessagesMap.get(oldMsg.filename);
          // 检查是否有属性变更
          if (oldMsg.marked !== newMsg.marked || oldMsg.local_path !== newMsg.local_path) {
            stateChanged = true;
            return { ...oldMsg, ...newMsg };
          }
        }
        return oldMsg;
      });

      const existingFilenames = new Set(lastMessages.map(msg => msg.filename));
      const actualNewMessages = newMessages.filter(msg => !existingFilenames.has(msg.filename));
      
      if (actualNewMessages.length > 0 || stateChanged) {
        // 有新消息，添加到列表末尾（最新消息在后面）
        if (actualNewMessages.length > 0) {
          lastMessages = [...lastMessages, ...actualNewMessages];
        }
        syncCurrentOffsetWithLoadedMessages();
        totalMessages = result.total || 0;
        hasMoreMessages = result.has_more || false;
        
        // 如果当前在底部，自动滚动到底��显示新消息
        // 如果当前在底部，或者由于状态更新触发，自动滚动/重新渲染
        renderMessages(lastMessages, { scrollToBottom: false });
      } else {
        // 没有新消息，但可能总数变化了（比如有消息被删除）
        if (totalMessages !== result.total) {
          totalMessages = result.total || 0;
          hasMoreMessages = result.has_more || false;
          syncCurrentOffsetWithLoadedMessages();
        }
      }
    } else {
      // 初始加载或刷新：加载最新的消息
      const result = await invoke('list_messages', { limit: PAGE_SIZE, offset: 0 });
      
      if (result.marked_count !== undefined) {
        updateMarkedBadge(result.marked_count);
      }

      lastMessages = result.messages || [];
      syncCurrentOffsetWithLoadedMessages();
      totalMessages = result.total || 0;
      hasMoreMessages = result.has_more || false;
      renderMessages(lastMessages, { scrollToBottom: shouldScroll });
    }
  } catch (error) {
    isLoadingMore = false;
    setErrorStatus(`加载消息失败：${error}`);
  } finally {
    isLoadMessagesRunning = false;
    if (!loadMore && getActiveMainTab() === 'marked') {
      loadMarkedMessages();
    }
  }
}

async function loadSyncStatus() {
  if (isLoadSyncStatusRunning) {
    return;
  }
  isLoadSyncStatusRunning = true;
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!getActiveEndpoint()) {
      setStatus('未选择 WebDAV 端点');
      return;
    }
    const status = await invoke('get_sync_status');
    if (!isRefreshRunning) {
      setRefreshLoading(!!status.running);
    }
    if (status.last_error) {
      setErrorStatus(`同步错误：${status.last_error}`);
      return;
    }
    if (status.running) {
      setStatus(status.last_result || '同步中...');
    } else {
      setSuccessStatus(status.last_result || '已同步');
    }
  } catch (error) {
    setErrorStatus(`状态更新失败：${error}`);
  } finally {
    isLoadSyncStatusRunning = false;
  }
}

function startRefreshTimer(intervalSecs) {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  const interval = Math.max(1, Number(intervalSecs) || 5);
  activeRefreshIntervalSecs = interval;
  refreshCountdownSecs = interval;
  updateRefreshCountdown();
  refreshTimer = setInterval(async () => {
    if (isRefreshRunning) {
      updateRefreshCountdown();
      return;
    }

    if (!getActiveEndpoint()) {
      refreshCountdownSecs = interval;
      updateRefreshCountdown();
      return;
    }

    const hasSearchQuery = searchInput && searchInput.value.trim().length > 0;
    if (hasSearchQuery || hasActiveContentTransfer() || isMessageSelectionRefreshPaused()) {
      updateRefreshCountdown();
      return;
    }

    // 标签页不自动刷新
    if (getActiveMainTab() === 'marked') {
      refreshCountdownSecs = interval;
      updateRefreshCountdown();
      return;
    }

    refreshCountdownSecs = Math.max(0, refreshCountdownSecs - 1);
    updateRefreshCountdown();

    if (refreshCountdownSecs > 0) {
      return;
    }

    await refreshMessages({ manual: false });
  }, 1000);
}

function restartRefreshTimer() {
  startRefreshTimer(activeRefreshIntervalSecs);
}

function updateRefreshCountdown() {
  if (!refreshLabel || !refreshButton) {
    return;
  }

  if (!getActiveEndpoint()) {
    refreshLabel.textContent = refreshLabelDefault || '刷新';
    return;
  }

  if (isRefreshRunning) {
    refreshLabel.textContent = '刷新中...';
    return;
  }

  // 标签页时不显示倒计时
  if (getActiveMainTab() === 'marked') {
    refreshLabel.textContent = refreshLabelDefault || '刷新';
    return;
  }

  const remaining = Math.max(1, Math.ceil(Number(refreshCountdownSecs) || activeRefreshIntervalSecs || 1));
  refreshLabel.textContent = `${refreshLabelDefault || '刷新'} (${remaining}s)`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSyncToFinish(maxWaitMs = MANUAL_REFRESH_TIMEOUT_MS) {
  if (!invoke) {
    return null;
  }
  const deadline = Date.now() + Math.max(1000, maxWaitMs);
  while (Date.now() < deadline) {
    const status = await invoke('get_sync_status');
    if (!status?.running) {
      return status;
    }
    await delay(500);
  }
  return null;
}

function normalizeTelegramPollInterval(value) {
  return Math.max(DEFAULT_TELEGRAM_POLL_INTERVAL_SECS, Number(value) || DEFAULT_TELEGRAM_POLL_INTERVAL_SECS);
}

function getTelegramBridgeFormState() {
  const botToken = telegramBotTokenInput ? telegramBotTokenInput.value.trim() : '';
  const chatId = telegramChatIdInput ? telegramChatIdInput.value.trim() : '';
  const hasActiveEndpoint = !!getActiveEndpoint();
  return {
    botToken,
    chatId,
    isConfigured: !!botToken && /^-?\d+$/.test(chatId) && hasActiveEndpoint,
  };
}

function hasUsableActiveEndpoint() {
  return !!getActiveEndpoint();
}

function setLocalHttpApiStatusLegacy(status) {
  if (!localHttpApiStatusLabel || !localHttpApiAddressLabel || !localHttpApiLastErrorLabel) return;
  const state = status?.state || 'disabled';
  const running = state === 'running';
  const failed = state === 'start_failed';
  localHttpApiStatusLabel.classList.toggle('is-running', running);
  localHttpApiStatusLabel.classList.toggle('is-stopped', !running);
  localHttpApiStatusLabel.textContent = running
    ? '运行中'
    : failed
      ? '启动失败'
      : '已关闭';
  localHttpApiAddressLabel.textContent = status?.address || '未启用';
  localHttpApiLastErrorLabel.textContent = status?.lastError || status?.last_error || '无';
}

async function loadLocalHttpApiStatus(options = {}) {
  try {
    if (!invoke) return;
    const status = await invoke('get_local_http_api_status');
    renderLocalHttpApiStatus(status);
  } catch (error) {
    if (!options.silent) {
      setErrorStatus(`读取本机 HTTP 接口状态失败：${error}`);
    }
  }
}

function setLocalHttpApiStatusLegacyText(status) {
  if (!localHttpApiStatusText) return;
  const state = status?.state || 'disabled';
  const address = status?.address || '';
  const lastError = status?.lastError || status?.last_error || '';
  if (state === 'running') {
    localHttpApiStatusText.textContent = address ? `状态：已启用（${address}）` : '状态：已启用';
    return;
  }
  if (state === 'start_failed') {
    localHttpApiStatusText.textContent = lastError
      ? `状态：启动失败（${lastError}）`
      : '状态：启动失败';
    return;
  }
  localHttpApiStatusText.textContent = '状态：已关闭';
}


function normalizeLocalHttpApiBindPort(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }
  return parsed;
}

function getLocalHttpApiConfiguredUrl() {
  const bindAddress = localHttpApiBindAddressInput?.value?.trim() || DEFAULT_LOCAL_HTTP_API_BIND_ADDRESS;
  const bindPort =
    normalizeLocalHttpApiBindPort(localHttpApiBindPortInput?.value) || DEFAULT_LOCAL_HTTP_API_BIND_PORT;
  const wrappedAddress =
    bindAddress.includes(':') && !bindAddress.startsWith('[') ? `[${bindAddress}]` : bindAddress;
  return `http://${wrappedAddress}:${bindPort}/api/send-file`;
}

function renderLocalHttpApiStatus(status) {
  if (!localHttpApiStatusLabel || !localHttpApiAddressLabel || !localHttpApiLastErrorLabel) return;
  const state = status?.state || 'disabled';
  const running = state === 'running';
  const failed = state === 'start_failed';
  const pending = state === 'pending';
  const address = status?.address || getLocalHttpApiConfiguredUrl();
  const lastError = status?.lastError || status?.last_error || '';

  localHttpApiStatusLabel.classList.toggle('is-running', running);
  localHttpApiStatusLabel.classList.toggle('is-stopped', !running && !pending);
  localHttpApiStatusLabel.textContent = running
    ? '运行中'
    : failed
      ? '启动失败'
      : pending
        ? '状态获取中'
        : '已关闭';
  localHttpApiAddressLabel.textContent = address || '未配置';
  localHttpApiLastErrorLabel.textContent = lastError || '无';
}

function syncTelegramProxyControlsState() {
  const proxyEnabled = telegramProxyEnabledInput ? telegramProxyEnabledInput.checked : false;
  if (telegramProxyUrlInput) {
    telegramProxyUrlInput.disabled = !proxyEnabled;
  }
}

function syncTelegramControlsState() {
  const { isConfigured } = getTelegramBridgeFormState();
  const running = telegramBridgeStatusLabel?.dataset.running === 'true';
  if (telegramStartServiceButton) {
    telegramStartServiceButton.disabled = running || !isConfigured;
    telegramStartServiceButton.hidden = running;
  }
  if (telegramStopServiceButton) {
    telegramStopServiceButton.disabled = !running;
    telegramStopServiceButton.hidden = !running;
  }
}

function setTelegramBridgeStatus(status) {
  if (!telegramBridgeStatusLabel || !telegramBridgeLastErrorLabel) return;
  const running = !!status?.running;
  telegramBridgeStatusLabel.dataset.running = running ? 'true' : 'false';
  telegramBridgeStatusLabel.classList.toggle('is-running', running);
  telegramBridgeStatusLabel.classList.toggle('is-stopped', !running);
  if (running) {
    const startedAt = status?.last_started_ms ? formatTime(status.last_started_ms) : '';
    telegramBridgeStatusLabel.textContent = startedAt
      ? `运行中 · ${startedAt}`
      : '运行中';
  } else if (status?.last_stopped_ms) {
    telegramBridgeStatusLabel.textContent = `已停止 · ${formatTime(status.last_stopped_ms)}`;
  } else {
    telegramBridgeStatusLabel.textContent = '未运行';
  }
  telegramBridgeLastErrorLabel.textContent = status?.last_error || '无';
  syncTelegramControlsState();
}

async function loadTelegramBridgeStatus(options = {}) {
  try {
    if (!invoke) return;
    const status = await invoke('get_telegram_bridge_status');
    setTelegramBridgeStatus(status);
  } catch (error) {
    await showInfoDialog({
      title: '获取 Chat ID 失败',
      message: `获取 Chat ID 失败：${error}`,
    });
    if (!options.silent) {
      setErrorStatus(`读取 Telegram bridge 状态失败：${error}`);
    }
  }
}

async function loadTelegramBridgeStatus(options = {}) {
  try {
    if (!invoke) return;
    const status = await invoke('get_telegram_bridge_status');
    setTelegramBridgeStatus(status);
  } catch (error) {
    if (!options.silent) {
      setErrorStatus(`读取 Telegram bridge 状态失败：${error}`);
    }
  }
}

function clearTelegramChatCandidates() {
  if (!telegramChatCandidates) return;
  telegramChatCandidates.innerHTML = '';
  telegramChatCandidates.hidden = true;
}

function maybeApplyTelegramSenderName(candidate) {
  if (!telegramSenderNameInput || telegramSenderNameInput.value.trim()) return false;
  const nextSenderName = candidate?.sender_name ? String(candidate.sender_name).trim() : '';
  if (!nextSenderName) return false;
  telegramSenderNameInput.value = nextSenderName;
  return true;
}

function renderTelegramChatCandidates(candidates) {
  if (!telegramChatCandidates) return;
  telegramChatCandidates.innerHTML = '';
  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length === 0) {
    telegramChatCandidates.hidden = true;
    return;
  }

  list.forEach((candidate) => {
    const row = document.createElement('div');
    row.className = 'telegram-chat-candidate';

    const meta = document.createElement('div');
    meta.className = 'telegram-chat-candidate-meta';

    const title = document.createElement('div');
    title.className = 'telegram-chat-candidate-title';
    title.textContent = candidate.title || '未命名聊天';

    const subtitle = document.createElement('div');
    subtitle.className = 'telegram-chat-candidate-subtitle';
    subtitle.textContent = `${candidate.chat_type || 'chat'} · ${candidate.id || ''}`;

    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.className = 'button ghost small';
    applyButton.textContent = '使用';
    applyButton.addEventListener('click', () => {
      if (telegramChatIdInput) {
        telegramChatIdInput.value = candidate.id || '';
      }
      maybeApplyTelegramSenderName(candidate);
      syncTelegramControlsState();
      setSuccessStatus(`已填入 Chat ID：${candidate.id}`);
    });

    meta.appendChild(title);
    meta.appendChild(subtitle);
    row.appendChild(meta);
    row.appendChild(applyButton);
    telegramChatCandidates.appendChild(row);
  });

  telegramChatCandidates.hidden = false;
}

async function discoverTelegramChats() {
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    const botToken = telegramBotTokenInput ? telegramBotTokenInput.value.trim() : '';
    const proxyEnabled = telegramProxyEnabledInput ? telegramProxyEnabledInput.checked : false;
    const proxyUrl = proxyEnabled && telegramProxyUrlInput ? telegramProxyUrlInput.value.trim() : '';
    if (!botToken) {
      setErrorStatus('请先填写 Telegram Bot Token');
      return;
    }
    if (telegramDiscoverChatIdButton) {
      telegramDiscoverChatIdButton.disabled = true;
      telegramDiscoverChatIdButton.textContent = '获取中...';
    }
    const candidates = await invoke('discover_telegram_chats', { botToken, proxyUrl });
    if (candidates.length === 1) {
      if (telegramChatIdInput) {
        telegramChatIdInput.value = candidates[0].id || '';
      }
      maybeApplyTelegramSenderName(candidates[0]);
      clearTelegramChatCandidates();
      syncTelegramControlsState();
      await showInfoDialog({
        title: '获取 Chat ID 成功',
        message: `已自动填入 Chat ID：${candidates[0].id}`,
      });
      setSuccessStatus(`已自动填入 Chat ID：${candidates[0].id}`);
      return;
    }
    renderTelegramChatCandidates(candidates);
    await showInfoDialog({
      title: '获取 Chat ID 成功',
      message: `已发现 ${candidates.length} 个聊天候选，请在列表中点击“使用”应用到 Chat ID。`,
    });
    setSuccessStatus(`已发现 ${candidates.length} 个聊天候选`);
  } catch (error) {
    clearTelegramChatCandidates();
    setErrorStatus(`获取 Chat ID 失败：${error}`);
  } finally {
    if (telegramDiscoverChatIdButton) {
      telegramDiscoverChatIdButton.disabled = false;
      telegramDiscoverChatIdButton.textContent = '自动获取';
    }
  }
}

async function discoverTelegramChatsWithFeedback() {
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      await showInfoDialog({
        title: '获取 Chat ID 失败',
        message: '未检测到 Tauri API，请检查 app.withGlobalTauri 设置',
      });
      return;
    }
    const botToken = telegramBotTokenInput ? telegramBotTokenInput.value.trim() : '';
    const proxyEnabled = telegramProxyEnabledInput ? telegramProxyEnabledInput.checked : false;
    const proxyUrl = proxyEnabled && telegramProxyUrlInput ? telegramProxyUrlInput.value.trim() : '';
    if (!botToken) {
      setErrorStatus('请先填写 Telegram Bot Token');
      await showInfoDialog({
        title: '获取 Chat ID 失败',
        message: '请先填写 Telegram Bot Token',
      });
      return;
    }
    if (telegramDiscoverChatIdButton) {
      telegramDiscoverChatIdButton.disabled = true;
      telegramDiscoverChatIdButton.textContent = '获取中...';
    }

    const candidates = await invoke('discover_telegram_chats', { botToken, proxyUrl });
    if (candidates.length === 1) {
      if (telegramChatIdInput) {
        telegramChatIdInput.value = candidates[0].id || '';
      }
      maybeApplyTelegramSenderName(candidates[0]);
      clearTelegramChatCandidates();
      syncTelegramControlsState();
      setSuccessStatus(`已自动填入 Chat ID：${candidates[0].id}`);
      await showInfoDialog({
        title: '获取 Chat ID 成功',
        message: `已自动填入 Chat ID：${candidates[0].id}`,
      });
      return;
    }

    renderTelegramChatCandidates(candidates);
    setSuccessStatus(`已发现 ${candidates.length} 个聊天候选`);
    await showInfoDialog({
      title: '获取 Chat ID 成功',
      message: `已发现 ${candidates.length} 个聊天候选，请在列表中点击“使用”应用到 Chat ID。`,
    });
  } catch (error) {
    clearTelegramChatCandidates();
    setErrorStatus(`获取 Chat ID 失败：${error}`);
    await showInfoDialog({
      title: '获取 Chat ID 失败',
      message: `获取 Chat ID 失败：${error}`,
    });
  } finally {
    if (telegramDiscoverChatIdButton) {
      telegramDiscoverChatIdButton.disabled = false;
      telegramDiscoverChatIdButton.textContent = '自动获取';
    }
  }
}

async function startTelegramBridge() {
  try {
    if (!invoke) {
      await showSettingsResultDialog('启动 Telegram Bridge 失败', '未检测到 Tauri API，请检查应用环境。');
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    const saved = await saveSettings({
      requireTelegramBridgeConfig: true,
      silent: true,
    });
    if (!saved) {
      await showSettingsResultDialog(
        '启动 Telegram Bridge 失败',
        syncStatus?.textContent || '启动前配置校验失败，请检查 Telegram Bridge 设置。',
      );
      return;
    }
    const status = await invoke('start_telegram_bridge');
    setTelegramBridgeStatus(status);
    await showSettingsResultDialog('启动 Telegram Bridge 成功', 'Telegram bridge 已启动。');
    setSuccessStatus('Telegram bridge 已启动');
  } catch (error) {
    await loadTelegramBridgeStatus({ silent: true });
    await showSettingsResultDialog('启动 Telegram Bridge 失败', String(error));
    setErrorStatus(`启动 Telegram bridge 失败：${error}`);
  }
}

async function stopTelegramBridge() {
  try {
    if (!invoke) {
      await showSettingsResultDialog('停止 Telegram Bridge 失败', '未检测到 Tauri API，请检查应用环境。');
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    const status = await invoke('stop_telegram_bridge');
    setTelegramBridgeStatus(status);
    await showSettingsResultDialog('停止 Telegram Bridge 成功', 'Telegram bridge 已停止。');
    setSuccessStatus('Telegram bridge 已停止');
  } catch (error) {
    await loadTelegramBridgeStatus({ silent: true });
    await showSettingsResultDialog('停止 Telegram Bridge 失败', String(error));
    setErrorStatus(`停止 Telegram bridge 失败：${error}`);
  }
}

function startTelegramBridgeStatusPolling() {
  if (telegramBridgeStatusPollTimer) {
    clearInterval(telegramBridgeStatusPollTimer);
  }
  telegramBridgeStatusPollTimer = setInterval(() => {
    loadTelegramBridgeStatus({ silent: true });
  }, TELEGRAM_BRIDGE_STATUS_POLL_MS);
}

function applySettings(settings) {
  const previousActiveEndpointId = activeEndpointId;
  const endpoints = Array.isArray(settings.webdav_endpoints)
    ? settings.webdav_endpoints
    : [];
  webdavEndpoints = endpoints.map((endpoint) => ({
    id: endpoint.id || generateEndpointId(),
    name: endpoint.name || '',
    url: endpoint.url || '',
    username: endpoint.username || '',
    password: endpoint.password || '',
    enabled: endpoint.enabled !== false,
  }));
  activeEndpointId = settings.active_webdav_id || null;
  if (
    activeEndpointId &&
    !webdavEndpoints.some(
      (endpoint) =>
        endpoint.id === activeEndpointId && endpoint.enabled && endpoint.url.trim(),
    )
  ) {
    activeEndpointId = null;
  }
  if (senderNameInput) {
    senderNameInput.value = settings.sender_name || '';
  }
  setSenderNameDisplay(settings.sender_name || '');
  if (refreshIntervalInput) {
    refreshIntervalInput.value = settings.refresh_interval_secs || 5;
  }
  if (downloadDirInput) {
    downloadDirInput.value = settings.download_dir || '';
    setHint(downloadDirHint, '');
  }
  if (autoStartInput) {
    autoStartInput.checked = settings.auto_start || false;
  }
  if (localHttpApiEnabledInput) {
    localHttpApiEnabledInput.checked = !!settings.local_http_api?.enabled;
  }
  if (localHttpApiBindAddressInput) {
    localHttpApiBindAddressInput.value =
      settings.local_http_api?.bind_address || DEFAULT_LOCAL_HTTP_API_BIND_ADDRESS;
  }
  if (localHttpApiBindPortInput) {
    localHttpApiBindPortInput.value =
      settings.local_http_api?.bind_port || DEFAULT_LOCAL_HTTP_API_BIND_PORT;
  }
  renderLocalHttpApiStatus({
    state: settings.local_http_api?.enabled ? 'pending' : 'disabled',
    lastError: '',
  });
  if (localHttpApiStatusText) {
    localHttpApiStatusText.textContent = settings.local_http_api?.enabled
      ? '状态：正在获取...'
      : '状态：已关闭';
  }
  if (globalHotkeyInput) {
    globalHotkeyInput.value = (settings.global_hotkey || DEFAULT_GLOBAL_HOTKEY).toLowerCase();
  }
  if (globalHotkeyEnabledInput) {
    globalHotkeyEnabledInput.checked = settings.global_hotkey_enabled !== false;
  }
  const telegram = settings.telegram || {};
  if (telegramAutoStartInput) {
    telegramAutoStartInput.checked = telegram.auto_start || false;
  }
  if (telegramProxyEnabledInput) {
    telegramProxyEnabledInput.checked = telegram.proxy_enabled || false;
  }
  if (telegramBotTokenInput) {
    telegramBotTokenInput.value = telegram.bot_token || '';
  }
  if (telegramSenderNameInput) {
    telegramSenderNameInput.value = telegram.sender_name || '';
  }
  if (telegramProxyUrlInput) {
    telegramProxyUrlInput.value = telegram.proxy_url || 'http://127.0.0.1:7890';
  }
  if (telegramChatIdInput) {
    telegramChatIdInput.value = telegram.chat_id || '';
  }
  if (telegramPollIntervalInput) {
    telegramPollIntervalInput.value = normalizeTelegramPollInterval(telegram.poll_interval_secs);
  }
  syncGlobalHotkeyInputState();
  setSendHotkey(settings.send_hotkey || SEND_HOTKEY.ENTER);
  applyTransferTabLabels();
  renderWebdavEndpoints();
  renderEndpointSelect();
  renderUploadTasks();
  refreshDownloadTaskEndpointLabels();
  renderDownloadTasks();
  clearTelegramChatCandidates();
  syncTelegramProxyControlsState();
  syncTelegramControlsState();
  queueSettingsSectionUpdate();
  startRefreshTimer(settings.refresh_interval_secs || 5);
  if (previousActiveEndpointId !== activeEndpointId) {
    resetComposerMarkDraft();
  } else {
    renderComposerMarkTagList();
  }
}

async function loadSettings() {
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    const settings = await invoke('get_settings');
    applySettings(settings);
    await loadLocalHttpApiStatus({ silent: true });
    await loadPersistedUploadHistory({ silent: true });
    await loadPersistedDownloadHistory({ silent: true });
    await loadTelegramBridgeStatus({ silent: true });
    if (getActiveEndpoint()) {
      await loadMessages({ scrollToBottom: true });
    }
    if (!didInitialSync && getActiveEndpoint()) {
      didInitialSync = true;
      const syncStatus = await invoke('get_sync_status');
      if (syncStatus?.running) {
        setStatus(syncStatus.last_result || '同步中...');
        await waitForSyncToFinish();
        await loadMessages({ checkNew: true, scrollToBottom: true });
        await loadSyncStatus();
      } else {
        await refreshMessages();
      }
    }
  } catch (error) {
    setErrorStatus(`读取设置失败：${error}`);
  }
}

async function saveSettings(options = {}) {
  const requireTelegramBridgeConfig = !!options.requireTelegramBridgeConfig;
  const silent = !!options.silent;
  const endpoints = collectEndpointPayload();
  for (const endpoint of endpoints) {
    if (endpoint.enabled && !endpoint.url) {
      setErrorStatus('启用的 WebDAV 端点必须填写 URL');
      return;
    }
  }
  const globalHotkeyEnabled = globalHotkeyEnabledInput ? globalHotkeyEnabledInput.checked : true;
  const normalizedGlobalHotkey = normalizeGlobalHotkey(
    (globalHotkeyInput ? globalHotkeyInput.value : DEFAULT_GLOBAL_HOTKEY) || '',
  );
  if (globalHotkeyEnabled && !normalizedGlobalHotkey) {
    setErrorStatus('全局快捷键需包含修饰键，例如 Ctrl+Alt+T');
    return;
  }
  const telegramFormState = getTelegramBridgeFormState();
  const telegramBotToken = telegramBotTokenInput ? telegramBotTokenInput.value.trim() : '';
  const telegramProxyEnabled = telegramProxyEnabledInput ? telegramProxyEnabledInput.checked : false;
  const telegramProxyUrl = telegramProxyUrlInput ? telegramProxyUrlInput.value.trim() : '';
  const telegramChatId = telegramChatIdInput ? telegramChatIdInput.value.trim() : '';
  const telegramPollInterval = normalizeTelegramPollInterval(
    telegramPollIntervalInput ? telegramPollIntervalInput.value : DEFAULT_TELEGRAM_POLL_INTERVAL_SECS,
  );
  const localHttpApiBindAddress = localHttpApiBindAddressInput
    ? localHttpApiBindAddressInput.value.trim()
    : DEFAULT_LOCAL_HTTP_API_BIND_ADDRESS;
  const localHttpApiBindPort = normalizeLocalHttpApiBindPort(
    localHttpApiBindPortInput ? localHttpApiBindPortInput.value : DEFAULT_LOCAL_HTTP_API_BIND_PORT,
  );
  if (!localHttpApiBindAddress) {
    setErrorStatus('HTTP API 监听地址不能为空');
    return;
  }
  if (!localHttpApiBindPort) {
    setErrorStatus('HTTP API 监听端口必须是 1-65535 之间的整数');
    return;
  }
  const telegramEnabled =
    requireTelegramBridgeConfig || (telegramAutoStartInput ? telegramAutoStartInput.checked : false);
  if (telegramEnabled) {
    if (!telegramBotToken) {
      setErrorStatus('启用 Telegram bridge 前请先填写 Bot Token');
      return;
    }
    if (!telegramChatId) {
      setErrorStatus('启用 Telegram bridge 前请先填写 Chat ID');
      return;
    }
    if (!/^-?\d+$/.test(telegramChatId)) {
      setErrorStatus('Telegram Chat ID 格式无效');
      return;
    }
    if (!hasUsableActiveEndpoint()) {
      setErrorStatus('启用 Telegram bridge 前请先选择当前可用的 WebDAV 端点');
      return;
    }
  }
  const activeCandidate = endpoints.find(
    (endpoint) => endpoint.id === activeEndpointId && endpoint.enabled && endpoint.url,
  );
  const payload = {
    webdav_endpoints: endpoints,
    active_webdav_id: activeCandidate ? activeEndpointId : null,
    sender_name: senderNameInput.value.trim(),
    refresh_interval_secs: Number(refreshIntervalInput.value) || 5,
    download_dir: downloadDirInput ? downloadDirInput.value.trim() : '',
    global_hotkey_enabled: globalHotkeyEnabled,
    global_hotkey: normalizedGlobalHotkey || DEFAULT_GLOBAL_HOTKEY,
    send_hotkey: sendHotkey,
    auto_start: autoStartInput ? autoStartInput.checked : false,
    local_http_api: {
      enabled: localHttpApiEnabledInput ? localHttpApiEnabledInput.checked : false,
      bind_address: localHttpApiBindAddress,
      bind_port: localHttpApiBindPort,
    },
    telegram: {
      enabled: telegramFormState.isConfigured,
      auto_start: telegramAutoStartInput ? telegramAutoStartInput.checked : false,
      sender_name: telegramSenderNameInput ? telegramSenderNameInput.value.trim() : '',
      bot_token: telegramBotToken,
      proxy_enabled: telegramProxyEnabled,
      proxy_url: telegramProxyUrl,
      chat_id: telegramChatId,
      poll_interval_secs: telegramPollInterval,
    },
  };

  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    const previousActive = activeEndpointId;
    const updated = await invoke('save_settings', { settings: payload });
    setSuccessStatus('设置已保存');
    applySettings(updated);
    await loadLocalHttpApiStatus({ silent: true });
    await loadTelegramBridgeStatus({ silent: true });
    setHint(downloadDirHint, '下载目录已保存');
    if (previousActive !== activeEndpointId && getActiveEndpoint()) {
      setSelectionMode(false);
      pendingUploads.clear();
      uploadSpeed.clear();
      renderUploadTasks();
      await refreshMessages();
      didInitialSync = true;
    }
    return updated;
  } catch (error) {
    setErrorStatus(`保存设置失败：${error}`);
  }
}

async function saveSettingsWithFeedback() {
  const updated = await saveSettings();
  if (updated) {
    await showInfoDialog({
      title: '保存设置成功',
      message: '设置已保存并生效。',
    });
    return updated;
  }

  await showInfoDialog({
    title: '保存设置失败',
    message: syncStatus?.textContent || '保存设置失败，请检查输入后重试。',
  });
  return null;
}

async function exportSettings() {
  try {
    if (!invoke) {
      await showSettingsResultDialog('导出配置失败', '未检测到 Tauri API，请检查应用环境。');
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!saveDialog) {
      await showSettingsResultDialog('导出配置失败', '未检测到保存对话框插件，请检查应用配置。');
      setErrorStatus('未检测到保存对话框插件，请确认已启用 dialog 插件');
      return;
    }
    const target = await saveDialog({
      defaultPath: 'transfer-genie-settings.json',
      filters: [{ name: 'Transfer Genie 配置', extensions: ['json'] }],
    });
    if (!target) {
      return;
    }
    const password = await showPasswordDialog({
      title: '导出配置',
      message: '请输入导出密码，导入时需要输入同一密码。',
      confirmLabel: '导出',
    });
    if (!password) {
      return;
    }
    await invoke('export_settings', { path: target, password });
    await showSettingsResultDialog('导出配置成功', `配置已导出到：\n${target}`);
    setSuccessStatus(`配置已导出到 ${target}`.trim());
  } catch (error) {
    await showSettingsResultDialog('导出配置失败', String(error));
    setErrorStatus(`导出配置失败：${error}`);
  }
}

async function importSettings() {
  try {
    if (!invoke) {
      await showSettingsResultDialog('导入配置失败', '未检测到 Tauri API，请检查应用环境。');
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!openDialog) {
      await showSettingsResultDialog('导入配置失败', '未检测到文件对话框插件，请检查应用配置。');
      setErrorStatus('未检测到对话框插件，请确认已启用 dialog 插件');
      return;
    }
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: 'Transfer Genie 配置', extensions: ['json'] }],
    });
    if (!selected) {
      return;
    }
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) {
      return;
    }
    const password = await showPasswordDialog({
      title: '导入配置',
      message: '请输入导入密码，导入将覆盖当前设置。',
      confirmLabel: '导入',
    });
    if (!password) {
      return;
    }
    const previousActive = activeEndpointId;
    const updated = await invoke('import_settings', { path, password });
    applySettings(updated);
    await loadLocalHttpApiStatus({ silent: true });
    await loadTelegramBridgeStatus({ silent: true });
    setSuccessStatus('配置已导入并生效');
    if (previousActive !== activeEndpointId && getActiveEndpoint()) {
      setSelectionMode(false);
      pendingUploads.clear();
      uploadSpeed.clear();
      renderUploadTasks();
      await refreshMessages();
      didInitialSync = true;
    }
    await showSettingsResultDialog('导入配置成功', '配置已导入并生效。');
  } catch (error) {
    await showSettingsResultDialog('导入配置失败', String(error));
    setErrorStatus(`导入配置失败：${error}`);
  }
}

async function backupWebdav() {
  const originalText = backupWebdavButton ? backupWebdavButton.textContent : '备份';
  try {
    if (!invoke) {
      await showSettingsResultDialog('备份 WebDAV 失败', '未检测到 Tauri API，请检查应用环境。');
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!getActiveEndpoint()) {
      await showSettingsResultDialog('备份 WebDAV 失败', '请先选择 WebDAV 端点。');
      setErrorStatus('请先选择 WebDAV 端点');
      return;
    }
    if (!saveDialog) {
      await showSettingsResultDialog('备份 WebDAV 失败', '未检测到保存对话框插件，请检查应用配置。');
      setErrorStatus('未检测到保存对话框插件，请确认已启用 dialog 插件');
      return;
    }
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const target = await saveDialog({
      defaultPath: `transfer-genie-webdav-backup-${timestamp}.zip`,
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
    });
    if (!target) {
      return;
    }

    if (backupWebdavButton) {
      backupWebdavButton.classList.add('is-loading');
      backupWebdavButton.disabled = true;
      backupWebdavButton.textContent = '备份中...';
    }
    setStatus('正在备份 WebDAV 数据...');

    await invoke('backup_webdav', { path: target });
    
    setSuccessStatus('备份成功');
    // showToast(`WebDAV 数据已备份到 ${target}`, 'success');
    await showInfoDialog({
      title: '备份成功',
      message: `WebDAV 数据已成功备份到：\n${target}`,
    });
  } catch (error) {
    setErrorStatus(`备份失败：${error}`);
    showToast(`备份失败：${error}`, 'error');
    await showInfoDialog({
      title: '备份失败',
      message: String(error),
    });
  } finally {
    if (backupWebdavButton) {
      backupWebdavButton.classList.remove('is-loading');
      backupWebdavButton.disabled = false;
      backupWebdavButton.textContent = originalText;
    }
  }
}

async function restoreWebdav() {
  const originalText = restoreWebdavButton ? restoreWebdavButton.textContent : '恢复';
  try {
    if (!invoke) {
      await showSettingsResultDialog('恢复 WebDAV 失败', '未检测到 Tauri API，请检查应用环境。');
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!getActiveEndpoint()) {
      await showSettingsResultDialog('恢复 WebDAV 失败', '请先选择 WebDAV 端点。');
      setErrorStatus('请先选择 WebDAV 端点');
      return;
    }
    if (!openDialog) {
      await showSettingsResultDialog('恢复 WebDAV 失败', '未检测到文件对话框插件，请检查应用配置。');
      setErrorStatus('未检测到对话框插件，请确认已启用 dialog 插件');
      return;
    }
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
    });
    if (!selected) {
      return;
    }
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) {
      return;
    }
    const confirmed = await showConfirmationDialog({
      title: '确认恢复',
      message: '恢复将覆盖当前 WebDAV 端点上的所有数据。此操作无法撤销。确定要继续吗？',
      confirmLabel: '恢复并覆盖',
    });
    if (!confirmed) {
      return;
    }

    if (restoreWebdavButton) {
      restoreWebdavButton.classList.add('is-loading');
      restoreWebdavButton.disabled = true;
      restoreWebdavButton.textContent = '恢复中...';
    }
    setStatus('正在从备份恢复 WebDAV 数据...');

    await invoke('restore_webdav', { path });
    
    setSuccessStatus('恢复成功');
    await showInfoDialog({
      title: '恢复成功',
      message: 'WebDAV 数据已成功恢复',
    });
    await refreshMessages();
  } catch (error) {
    setErrorStatus(`恢复失败：${error}`);
    showToast(`恢复失败：${error}`, 'error');
    await showInfoDialog({
      title: '恢复失败',
      message: String(error),
    });
  } finally {
    if (restoreWebdavButton) {
      restoreWebdavButton.classList.remove('is-loading');
      restoreWebdavButton.disabled = false;
      restoreWebdavButton.textContent = originalText;
    }
  }
}

async function sendText() {
  if (!invoke) {
    setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
    return;
  }
  
  let text = '';
  if (currentFormat === 'markdown' && mdEditor) {
    text = mdEditor.getMarkdown();
  } else {
    text = textInput.value;
  }

  if (!text.trim() && selectedFiles.length === 0) {
    return;
  }

  const settings = await invoke('get_settings');
  const activeEndpoint = settings.webdav_endpoints.find(
    (e) => e.id === settings.active_webdav_id,
  );
  if (!activeEndpoint) {
    setErrorStatus('请先选择 WebDAV 端点');
    return;
  }

  let activeMarkedOptions = cloneComposerMarkedOptions(getComposerMarkedOptions());
  let hadSendFailure = false;

  const applySuccessfulSendResult = (result) => {
    normalizeComposerDraftAfterSuccessfulSend(result);
    activeMarkedOptions = {
      marked: !!activeMarkedOptions.marked,
      selectedTagIds: Array.isArray(result?.markedTagIds) ? [...result.markedTagIds] : [],
      createdTags: [],
      deletedTagIds: [],
    };
  };

  if (text.trim()) {
      const timestamp_ms = Date.now();
      const filename = `sending-${timestamp_ms}`;
      
      pendingSends.set(filename, {
        filename,
        sender: '我',
        timestamp_ms,
        size: new Blob([text]).size,
        kind: 'text',
        content: text,
        sending: true,
        sendStatus: SEND_STATUS.SENDING,
        format: currentFormat,
        marked: activeMarkedOptions.marked,
        marked_tag_ids: [...activeMarkedOptions.selectedTagIds],
      });

      if (currentFormat === 'markdown' && mdEditor) {
        mdEditor.setMarkdown('');
      } else {
        textInput.value = '';
      }
      
      renderMessages(lastMessages);
      scrollMessageListToBottom();

      try {
        const result = await invoke('send_text', {
          text,
          format: currentFormat,
          markedOptions: activeMarkedOptions,
        });
        pendingSends.set(filename, {
          ...pendingSends.get(filename),
          sendStatus: SEND_STATUS.SUCCESS,
        });
        applySuccessfulSendResult(result);
        exitComposerFullscreenAfterSendSuccess();
        setTimeout(() => {
          pendingSends.delete(filename);
          loadMessages();
        }, 1000);
      } catch (error) {
        hadSendFailure = true;
        pendingSends.set(filename, {
          ...pendingSends.get(filename),
          sendStatus: SEND_STATUS.FAILED,
          sendError: String(error),
        });
        renderMessages(lastMessages);
        setErrorStatus(`发送失败：${error}`);
      }
  }
  
  if (selectedFiles.length > 0) {
    const filesToUpload = [...selectedFiles];
    selectedFiles = [];
    renderSelectedFiles();
    
    for (const path of filesToUpload) {
        let clientId = null;
        try {
            clientId = `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const originalName = path.split(/[/\\]/).pop() || path;
            const endpointMeta = getCurrentEndpointMeta();
            pendingUploads.set(clientId, {
              clientId,
              originalName,
              localPath: path,
              endpointId: endpointMeta.endpointId,
              endpointLabel: endpointMeta.endpointLabel,
              timestamp_ms: Date.now(),
              received: 0,
              total: 0,
              status: 'progress',
            });
            renderMessages(lastMessages, { scrollToBottom: true });
            renderUploadTasks();
            const result = await invoke('send_file', {
              path,
              clientId,
              markedOptions: activeMarkedOptions,
            });
            if (clientId) {
              pendingUploads.delete(clientId);
              renderMessages(lastMessages);
              renderUploadTasks();
            }
            await loadMessages({ scrollToBottom: true });
            await loadPersistedUploadHistory({ silent: true });
            applySuccessfulSendResult(result);
            exitComposerFullscreenAfterSendSuccess();
            setSuccessStatus('发送成功');
        } catch (error) {
            hadSendFailure = true;
            if (clientId) {
              pendingUploads.delete(clientId);
              renderMessages(lastMessages);
              renderUploadTasks();
            }
            setErrorStatus(`发送文件失败：${error}`);
        }
    }
  }

  if (!hadSendFailure) {
    resetComposerMarkDraft();
  }
}

async function selectFiles() {
  let clientId = null;
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!getActiveEndpoint()) {
      setErrorStatus('请先选择 WebDAV 端点');
      return;
    }
    if (!openDialog) {
      setErrorStatus('未检测到对话框插件，请确认已启用 dialog 插件');
      return;
    }
    const selected = await openDialog({ multiple: true, directory: false });
    if (!selected) {
      return;
    }
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const path of paths) {
        if (path && !selectedFiles.includes(path)) {
            selectedFiles.push(path);
        }
    }
    renderSelectedFiles();
  } catch (error) {
    setErrorStatus(`选择文件失败：${error}`);
  }
}

function renderSelectedFiles() {
  const container = document.getElementById('selected-files-container');
  if (!container) return;

  container.innerHTML = '';
  if (selectedFiles.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'grid';

  selectedFiles.forEach((path, index) => {
    const fileItem = document.createElement('div');
    fileItem.className = 'selected-file-item';

    if (isImagePath(path)) {
        const tauriConvert = window.__TAURI__?.tauri?.convertFileSrc || window.__TAURI__?.path?.convertFileSrc || window.__TAURI__?.core?.convertFileSrc;
        if (tauriConvert) {
            const img = document.createElement('img');
            img.className = 'selected-file-preview';
            img.src = tauriConvert(path);
            fileItem.appendChild(img);
            
            // Double click to preview
            img.addEventListener('dblclick', () => {
              const filename = path.split(/[/\\]/).pop() || path;
              openMessagePreview({
                kind: 'file',
                filename: filename,
                original_name: filename,
                local_path: path,
                size: 0, // Unknown here
                sender: '本地',
                timestamp_ms: Date.now()
              });
            });
        } else {
            fileItem.style.backgroundColor = 'red'; // Visual debug hint
        }
    } else {
        const fileIcon = document.createElement('div');
        fileIcon.className = 'selected-file-icon';
        const extension = path.split('.').pop() || '';
        fileIcon.textContent = extension.toLowerCase();
        fileItem.appendChild(fileIcon);
    }

    const fileInfo = document.createElement('div');
    fileInfo.className = 'selected-file-info';
    
    const fileName = document.createElement('span');
    fileName.className = 'selected-file-name';
    fileName.textContent = path.split(/[/\\]/).pop() || path;
    fileInfo.appendChild(fileName);
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-file-btn';
    removeBtn.textContent = '×';
    removeBtn.title = '移除';
    removeBtn.type = 'button';
    removeBtn.addEventListener('click', () => {
      removeSelectedFile(index);
    });

    fileItem.appendChild(fileInfo);
    fileItem.appendChild(removeBtn);
    container.appendChild(fileItem);
  });
}

function removeSelectedFile(index) {
  if (index >= 0 && index < selectedFiles.length) {
    selectedFiles.splice(index, 1);
    renderSelectedFiles();
  }
}

async function chooseDownloadDir() {
  try {
    if (!openDialog) {
      setErrorStatus('未检测到对话框插件，请确认已启用 dialog 插件');
      return;
    }
    const selected = await openDialog({ multiple: false, directory: true });
    if (!selected) {
      return;
    }
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path || !downloadDirInput) {
      return;
    }
    downloadDirInput.value = path;
    setHint(downloadDirHint, '已选择下载目录，保存后生效');
  } catch (error) {
    setErrorStatus(`选择下载目录失败：${error}`);
  }
}

async function openDownloadDir() {
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请确认应用环境正常');
      return;
    }
    await invoke('open_download_dir');
  } catch (error) {
    setErrorStatus(`打开下载目录失败：${error}`);
  }
}

async function openLogDir() {
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请确认应用环境正常');
      return;
    }
    await invoke('open_log_dir');
  } catch (error) {
    setErrorStatus(`打开日志目录失败：${error}`);
  }
}

async function openDataDir() {
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请确认应用环境正常');
      return;
    }
    await invoke('open_data_dir');
  } catch (error) {
    setErrorStatus(`打开数据目录失败：${error}`);
  }
}

function addWebdavEndpoint() {
  webdavEndpoints.push({
    id: generateEndpointId(),
    name: '',
    url: '',
    username: '',
    password: '',
    enabled: false,
  });
  renderWebdavEndpoints();
}

async function batchSpeedTest() {
  if (!batchSpeedTestButton) return;

  // 获取所有已填写 URL 的端点
  const validEndpoints = webdavEndpoints.filter(
    (endpoint) => endpoint.url && endpoint.url.trim(),
  );

  if (validEndpoints.length === 0) {
    setErrorStatus('没有可测试的端点（请至少填写一个端点的 URL）');
    await showSettingsResultDialog('批量测速失败', '没有可测速的端点，请至少填写一个端点的 URL。');
    return;
  }

  batchSpeedTestButton.disabled = true;
  batchSpeedTestButton.textContent = `批量测速中（${validEndpoints.length}）...`;

  // 为每个端点找到对应的卡片和按钮
  const testPromises = validEndpoints.map(async (endpoint) => {
    const card = document.querySelector(`[data-endpoint-id="${endpoint.id}"]`);
    if (!card) return;

    // 找到测速按钮（在 actions 中的最后一个按钮）
    const actions = card.querySelector('.endpoint-actions');
    if (!actions) return;
    const buttons = Array.from(actions.querySelectorAll('.button.ghost.small[type="button"]'));
    const speedTestButton = buttons[buttons.length - 1]; // 最后一个按钮是测速按钮
    const speedTestResult = card.querySelector('.speed-test-result');

    if (speedTestButton && speedTestResult) {
      speedTestButton.disabled = true;
      speedTestButton.textContent = '测速中...';
      speedTestResult.style.display = 'none';

      try {
        const result = await invoke('test_webdav_speed', {
          endpoint: {
            id: endpoint.id,
            name: endpoint.name,
            url: endpoint.url,
            username: endpoint.username,
            password: endpoint.password,
            enabled: endpoint.enabled,
          },
        });

        const uploadSpeed = result.upload_speed_mbps || 0;
        const downloadSpeed = result.download_speed_mbps || 0;
        speedTestResult.innerHTML = `
          <div class="speed-test-item">
            <span class="speed-test-label">上传：</span>
            <span class="speed-test-value">${uploadSpeed.toFixed(2)} MB/s</span>
          </div>
          <div class="speed-test-item">
            <span class="speed-test-label">下载：</span>
            <span class="speed-test-value">${downloadSpeed.toFixed(2)} MB/s</span>
          </div>
        `;
        speedTestResult.style.display = 'flex';
      } catch (error) {
        speedTestResult.innerHTML = '';
        speedTestResult.style.display = 'none';
        // 批量测速时不在状态栏显示单个错误，只显示在结果区域
      } finally {
        speedTestButton.disabled = false;
        speedTestButton.textContent = '测速';
      }
    }
  });

  try {
    await Promise.all(testPromises);
    setSuccessStatus(`批量测速完成（${validEndpoints.length} 个端点）`);
    await showSettingsResultDialog('批量测速成功', `已完成 ${validEndpoints.length} 个端点的测速。`);
  } catch (error) {
    setErrorStatus(`批量测速失败：${error}`);
    await showSettingsResultDialog('批量测速失败', String(error));
  } finally {
    batchSpeedTestButton.disabled = false;
    batchSpeedTestButton.textContent = '批量测速';
  }
}

async function switchActiveEndpoint() {
  const targetId = endpointSelect?.value;
  if (!targetId || targetId === activeEndpointId) {
    return;
  }
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    const settings = await invoke('get_settings');
    settings.active_webdav_id = targetId;
    const updated = await invoke('save_settings', { settings });
    applySettings(updated);
    setSelectionMode(false);
    setMarkedSelectionMode(false);
    pendingUploads.clear();
    uploadSpeed.clear();
    renderUploadTasks();
    await refreshMessages();
    await loadMarkedTags();
    await loadMarkedMessages();
    didInitialSync = true;
  } catch (error) {
    setErrorStatus(`切换端点失败：${error}`);
    renderEndpointSelect();
  }
}

function updateMessageDownloadStatus(filename, endpointId = activeEndpointId) {
  if (!filename || (endpointId && activeEndpointId && endpointId !== activeEndpointId)) return;

  let changed = false;
  lastMessages = lastMessages.map((msg) => {
    if (msg.filename === filename) {
      changed = true;
      return { ...msg };
    }
    return msg;
  });

  if (!changed) {
    return;
  }

  const cardSelector = `.message-card[data-filename="${escapeSelector(filename)}"]`;
  const card = document.querySelector(cardSelector);
  if (card) {
    card.classList.remove('is-downloading');

    const actions = card.querySelector('.message-actions');
    if (actions) {
      const downloadButton = actions.querySelector('.download-action');
      if (downloadButton) {
        downloadButton.remove();
      }
      const downloadingTag = actions.querySelector('.downloading-tag.download-progress-tag');
      if (downloadingTag) {
        downloadingTag.remove();
      }
    }
  }

  if (currentPreviewMessage && currentPreviewMessage.filename === filename) {
    currentPreviewMessage = { ...currentPreviewMessage };
    renderPreviewContent(currentPreviewMessage);
  }
}

function setSenderNameDisplay(name) {
  if (!deviceNameLabel) return;
  const value = String(name || '').trim();
  const text = value ? `TransferGenie（${value}）` : 'TransferGenie（未设置发送者）';
  deviceNameLabel.textContent = text;
  deviceNameLabel.title = text;
}

async function refreshMessages(options = {}) {
  const manual = options.manual !== false;
  let didStartRefresh = false;
  if (isRefreshRunning) {
    setStatus('正在刷新...');
    return;
  }

  if (manual && searchInput) {
    searchInput.value = '';
  }
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!getActiveEndpoint()) {
      setErrorStatus('请先选择 WebDAV 端点');
      return;
    }
    didStartRefresh = true;
    isRefreshRunning = true;
    setRefreshLoading(true);
    await invoke('refresh');
    const refreshTasks = [
      loadMessages(manual ? { scrollToBottom: true } : { checkNew: true, scrollToBottom: false }),
      loadSyncStatus(),
    ];
    if (getActiveMainTab() === 'marked') {
      refreshTasks.push(loadMarkedTags(), loadMarkedMessages());
    }
    await Promise.all(refreshTasks);
  } catch (error) {
    const reason = String(error || '');
    if (reason.includes('已取消')) {
      setStatus('已取消刷新');
    } else {
      setErrorStatus(`刷新失败：${error}`);
    }
  } finally {
    isRefreshRunning = false;
    setRefreshLoading(false);
    if (didStartRefresh) {
      restartRefreshTimer();
    }
  }
}

if (listen) {
  listen('download-progress', (event) => {
    const payload = event.payload || {};
    const filename = payload.filename;
    if (!filename) {
      return;
    }
    if (payload.status === 'progress') {
      const task = syncDownloadTaskProgress(payload);
      if (task) {
        updateSpeedTracker(downloadSpeed, task.key, payload.received || 0);
        updateProgressUI(filename, task.endpointId);
      }
      return;
    }
    if (payload.status === 'complete') {
      const task = syncDownloadTaskProgress(payload);
      if (task) {
        downloadSpeed.delete(task.key);
        updateMessageDownloadStatus(filename, task.endpointId);
      // 下载完成后重新获取消息以更新下载状态
      }
      return;
    }
    if (payload.status === 'error') {
      const task = syncDownloadTaskProgress(payload);
      if (task) {
        downloadSpeed.delete(task.key);
      }
      if (payload.error) {
        setErrorStatus(`下载失败：${payload.error}`);
      }
    }
  });

  listen('upload-progress', (event) => {
    const payload = event.payload || {};
    const clientId = payload.client_id || payload.clientId;
    if (!clientId) {
      return;
    }
    const entry = pendingUploads.get(clientId) || {
      clientId,
      originalName: payload.original_name || payload.originalName || '上传文件',
      timestamp_ms: Date.now(),
      received: 0,
      total: payload.total || 0,
      status: 'progress',
    };
    if (payload.status === 'progress') {
      entry.filename = payload.filename || entry.filename || '';
      entry.updatedAt = Date.now();
      entry.received = payload.received || 0;
      entry.total = payload.total || 0;
      entry.status = 'progress';
      pendingUploads.set(clientId, entry);
      updateSpeedTracker(uploadSpeed, clientId, entry.received);
      updateUploadProgressUI(clientId);
      renderUploadTasks();
      return;
    }
    if (payload.status === 'complete') {
      pendingUploads.delete(clientId);
      uploadSpeed.delete(clientId);
      renderMessages(lastMessages);
      renderUploadTasks();
      loadPersistedUploadHistory({ silent: true });
      // 上传完成后使用增量更新，避免打断用户浏览
      loadMessages({ checkNew: true });
      return;
    }
    if (payload.status === 'error') {
      pendingUploads.delete(clientId);
      uploadSpeed.delete(clientId);
      renderMessages(lastMessages);
      renderUploadTasks();
      if (payload.error) {
        setErrorStatus(`上传失败：${payload.error}`);
      }
    }
  });

  listen('webdav-backup-progress', (event) => {
    const payload = event.payload || {};
    const { current, total, state } = payload;
    
    if (state === 'finished') {
       return;
    }
    
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const text = state === 'scanning' ? '扫描中...' : 
                 state === 'downloading' ? `备份中 ${percent}%` :
                 state;
                 
    if (backupWebdavButton) {
        backupWebdavButton.textContent = text;
    }
  });

  listen('webdav-restore-progress', (event) => {
    const payload = event.payload || {};
    const { current, total, state } = payload;
    
    if (state === 'finished') {
       return;
    }
    
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const text = state === 'scanning' ? '清理旧数据...' : 
                 state === 'uploading' ? `恢复中 ${percent}%` :
                 state;
                 
    if (restoreWebdavButton) {
        restoreWebdavButton.textContent = text;
    }
  });
}

refreshButton.addEventListener('click', async () => {
  if (hasActiveContentTransfer()) {
    setStatus('发送进行中，暂不刷新');
    return;
  }
  await refreshMessages();
});

// 标签页刷新按钮
if (markedRefreshButton) {
  markedRefreshButton.addEventListener('click', async () => {
    if (!getActiveEndpoint()) {
      showToast('请先选择 WebDAV 端点', 'error');
      return;
    }
    markedRefreshButton.disabled = true;
    markedRefreshButton.classList.add('is-loading');
    if (markedRefreshLabel) {
      markedRefreshLabel.textContent = '刷新中...';
    }
    try {
      await Promise.all([loadMarkedTags(), loadMarkedMessages()]);
      scrollMarkedMessageListToTop();
      showToast('刷新成功', 'success');
    } catch (error) {
      showToast(`刷新失败: ${error}`, 'error');
    } finally {
      markedRefreshButton.disabled = false;
      markedRefreshButton.classList.remove('is-loading');
      if (markedRefreshLabel) {
        markedRefreshLabel.textContent = '刷新';
      }
    }
  });
}
if (openDownloadDirButton) {
  openDownloadDirButton.addEventListener('click', openDownloadDir);
}
if (downloadsOpenDownloadDirButton) {
  downloadsOpenDownloadDirButton.addEventListener('click', openDownloadDir);
}
if (transferTabDownloadsButton) {
  transferTabDownloadsButton.addEventListener('click', () => setTransferListView('downloads'));
}
if (transferTabUploadsButton) {
  transferTabUploadsButton.addEventListener('click', () => setTransferListView('uploads'));
}
if (transferClearButton) {
  transferClearButton.addEventListener('click', clearCurrentTransferList);
}
sendTextButton.addEventListener('click', sendText);
sendFileButton.addEventListener('click', selectFiles);
if (composerMarkToggle) {
  composerMarkToggle.addEventListener('click', () => {
    composerMarkEnabled = !composerMarkEnabled;
    syncComposerMarkToggleState();
  });
  composerMarkToggle.addEventListener('mouseenter', openComposerMarkPanel);
  composerMarkToggle.addEventListener('focus', openComposerMarkPanel);
}
if (composerMarkAddTagButton) {
  composerMarkAddTagButton.addEventListener('click', () => {
    const trimmed = String(composerMarkNewTagInput?.value || '').trim();
    if (!trimmed) {
      return;
    }
    if (hasComposerDraftTagName(trimmed)) {
      showToast('标签名已存在', 'error');
      return;
    }
    const draftTag = {
      id: nextComposerDraftTagId(),
      name: trimmed,
    };
    composerCreatedTags = [...composerCreatedTags, draftTag];
    composerSelectedTagIds.add(draftTag.id);
    composerMarkEnabled = true;
    if (composerMarkNewTagInput) {
      composerMarkNewTagInput.value = '';
    }
    renderComposerMarkTagList();
  });
}
if (composerMarkNewTagInput) {
  composerMarkNewTagInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      composerMarkAddTagButton?.click();
    }
  });
}
if (composerMarking) {
  composerMarking.addEventListener('mouseenter', openComposerMarkPanel);
  composerMarking.addEventListener('mouseleave', scheduleComposerMarkPanelHide);
}
if (composerMarkPanel) {
  composerMarkPanel.addEventListener('mouseenter', openComposerMarkPanel);
  composerMarkPanel.addEventListener('mouseleave', scheduleComposerMarkPanelHide);
}
saveSettingsButton.addEventListener('click', saveSettingsWithFeedback);
if (chooseDownloadDirButton) {
  chooseDownloadDirButton.addEventListener('click', chooseDownloadDir);
}
if (addWebdavButton) {
  addWebdavButton.addEventListener('click', addWebdavEndpoint);
}
if (batchSpeedTestButton) {
  batchSpeedTestButton.addEventListener('click', batchSpeedTest);
}
if (globalHotkeyEnabledInput) {
  globalHotkeyEnabledInput.addEventListener('change', syncGlobalHotkeyInputState);
}
if (localHttpApiEnabledInput) {
  localHttpApiEnabledInput.addEventListener('change', () => {
    if (localHttpApiStatusText) {
      localHttpApiStatusText.textContent = '状态：更改将在保存后生效';
    }
  });
}
if (localHttpApiEnabledInput) {
  localHttpApiEnabledInput.addEventListener('change', () => {
    renderLocalHttpApiStatus({ state: 'pending', lastError: '' });
  });
}
if (localHttpApiBindAddressInput) {
  localHttpApiBindAddressInput.addEventListener('input', () => {
    renderLocalHttpApiStatus({ state: 'pending', lastError: '' });
  });
}
if (localHttpApiBindPortInput) {
  localHttpApiBindPortInput.addEventListener('input', () => {
    renderLocalHttpApiStatus({ state: 'pending', lastError: '' });
  });
}
if (telegramProxyEnabledInput) {
  telegramProxyEnabledInput.addEventListener('change', () => {
    syncTelegramProxyControlsState();
    clearTelegramChatCandidates();
    syncTelegramControlsState();
  });
}
if (telegramBotTokenInput) {
  telegramBotTokenInput.addEventListener('input', () => {
    clearTelegramChatCandidates();
    syncTelegramControlsState();
  });
}
if (telegramProxyUrlInput) {
  telegramProxyUrlInput.addEventListener('input', clearTelegramChatCandidates);
}
if (telegramChatIdInput) {
  telegramChatIdInput.addEventListener('input', syncTelegramControlsState);
}
if (telegramDiscoverChatIdButton) {
  telegramDiscoverChatIdButton.addEventListener('click', discoverTelegramChatsWithFeedback);
}
if (sendHotkeyInputs && sendHotkeyInputs.length > 0) {
  sendHotkeyInputs.forEach((input) => {
    input.addEventListener('change', async () => {
      if (input.checked) {
        setSendHotkey(input.value);
        await persistSendHotkeySetting();
      }
    });
  });
}
if (senderNameInput) {
  senderNameInput.addEventListener('input', () => {
    setSenderNameDisplay(senderNameInput.value);
  });
}
if (endpointSelect) {
  endpointSelect.addEventListener('change', switchActiveEndpoint);
}
if (toggleSelectionButton) {
  toggleSelectionButton.addEventListener('click', toggleSelectionMode);
}
if (selectAllButton) {
  selectAllButton.addEventListener('click', selectAllMessages);
}
if (deleteSelectedButton) {
  deleteSelectedButton.addEventListener('click', deleteSelectedMessages);
}
if (cancelSelectionButton) {
  cancelSelectionButton.addEventListener('click', () => setSelectionMode(false));
}
if (markedToggleSelectionButton) {
  markedToggleSelectionButton.addEventListener('click', toggleMarkedSelectionMode);
}
if (markedSelectAllButton) {
  markedSelectAllButton.addEventListener('click', selectAllMarkedMessages);
}
if (markedEditTagsButton) {
  markedEditTagsButton.addEventListener('click', editSelectedMarkedMessageTags);
}
if (markedDeleteSelectedButton) {
  markedDeleteSelectedButton.addEventListener('click', deleteSelectedMarkedMessages);
}
if (markedCancelSelectionButton) {
  markedCancelSelectionButton.addEventListener('click', () => setMarkedSelectionMode(false));
}
if (downloadToggleSelectionButton) {
  downloadToggleSelectionButton.addEventListener('click', toggleDownloadSelectionMode);
}
if (downloadSelectAllButton) {
  downloadSelectAllButton.addEventListener('click', selectAllDownloadTasks);
}
if (downloadDeleteSelectedButton) {
  downloadDeleteSelectedButton.addEventListener('click', deleteSelectedDownloadTasks);
}
if (downloadCancelSelectionButton) {
  downloadCancelSelectionButton.addEventListener('click', () => setDownloadSelectionMode(false));
}
if (cleanupMessagesButton) {
  cleanupMessagesButton.addEventListener('click', cleanupMessages);
}
if (exportSettingsButton) {
  exportSettingsButton.addEventListener('click', exportSettings);
}
if (importSettingsButton) {
  importSettingsButton.addEventListener('click', importSettings);
}
if (backupWebdavButton) {
  backupWebdavButton.addEventListener('click', backupWebdav);
}
if (restoreWebdavButton) {
  restoreWebdavButton.addEventListener('click', restoreWebdav);
}
if (openLogDirButton) {
  openLogDirButton.addEventListener('click', openLogDir);
}
if (openDataDirButton) {
  openDataDirButton.addEventListener('click', openDataDir);
}
if (markedTagAddButton) {
  markedTagAddButton.addEventListener('click', async () => {
    const name = window.prompt('新增标签');
    if (name === null) return;
    try {
      await createMarkedTagRecord(name);
    } catch (error) {
      showToast(`新增标签失败: ${error}`, 'error');
    }
  });
}
if (markMessageAddTagButton) {
  markMessageAddTagButton.addEventListener('click', async () => {
    const name = markMessageNewTagInput?.value || '';
    try {
      const tag = await createMarkedTagRecord(name);
      if (tag) {
        selectedMarkTagIds.add(tag.id);
        renderMarkMessageTagList();
      }
      if (markMessageNewTagInput) {
        markMessageNewTagInput.value = '';
      }
    } catch (error) {
      showToast(`新增标签失败: ${error}`, 'error');
    }
  });
}
if (markMessageConfirmButton) {
  markMessageConfirmButton.addEventListener('click', confirmMarkMessage);
}
if (markMessageCancelButton) {
  markMessageCancelButton.addEventListener('click', closeMarkMessageModal);
}
if (markMessageCloseButton) {
  markMessageCloseButton.addEventListener('click', closeMarkMessageModal);
}
if (telegramStartServiceButton) {
  telegramStartServiceButton.addEventListener('click', startTelegramBridge);
}
if (telegramStopServiceButton) {
  telegramStopServiceButton.addEventListener('click', stopTelegramBridge);
}

if (scrollToBottomButton) {
  scrollToBottomButton.addEventListener('click', scrollMessageListToBottom);
}

if (composerFullscreenToggle) {
  composerFullscreenToggle.addEventListener('click', () => {
    setComposerFullscreen(!isComposerFullscreen);
  });
  // Ensure icon and labels reflect initial state
  setComposerFullscreen(false);
}

if (messageList) {
  messageList.addEventListener('scroll', updateScrollToBottomButton);
  
  // 向上滚动加载更多
  messageList.addEventListener('scroll', () => {
    if (messageList.scrollTop < 50 && hasMoreMessages && !isLoadingMore) {
      loadMessages({ loadMore: true });
    }
  });
}

syncComposerOffset();
window.addEventListener('resize', syncComposerOffset);

// 点击外部区域关闭更多菜单
document.addEventListener('click', (event) => {
  const target = event.target;
  
  // 如果点击的是summary元素或其子元素，不处理（让默认行为执行）
  if (target.closest('.action-menu summary')) {
    return;
  }
  
  // 关闭所有打开的菜单（如果点击不在菜单内部）
  const openMenus = document.querySelectorAll('.action-menu[open]');
  openMenus.forEach((menu) => {
    if (!menu.contains(target)) {
      menu.open = false;
    }
  });
});

if (textInput) {
  textInput.addEventListener('keydown', (event) => {
    if (handleTextareaLineBoundaryKey(textInput, event)) {
      return;
    }
    if (event.key !== 'Enter') {
      return;
    }
    const isCtrlLike = event.ctrlKey || event.metaKey;
    const isAlt = event.altKey;
    const isShift = event.shiftKey;

    if (sendHotkey === SEND_HOTKEY.ENTER) {
      if (!isCtrlLike && !isAlt && !isShift) {
        event.preventDefault();
        sendText();
      }
      return;
    }

    if (isCtrlLike && !isAlt) {
      event.preventDefault();
      sendText();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) {
    return;
  }
  if (document.querySelector('.dialog-overlay')) {
    return;
  }
  if (isComposerFullscreen) {
    setComposerFullscreen(false);
    return;
  }
  minimizeAppWindow();
});

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.tabTarget;
    setActiveTab(target, {
      scrollToBottom: target === 'home',
      focusInput: target === 'home',
    });
  });
});

function handleWindowFocus() {
  focusHomeComposer();
}

syncTelegramProxyControlsState();
syncTelegramControlsState();
startTelegramBridgeStatusPolling();
renderComposerMarkTagList();
initializeSettingsNavigation();
loadSettings();
loadMessages({ scrollToBottom: true });
loadMarkedTags();
loadMarkedMessages();
loadSyncStatus();
focusHomeComposer();

// 拖拽上传功能
const composerRow = document.querySelector('.composer-row');

async function sendFileByPath(path) {
  let clientId = null;
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!getActiveEndpoint()) {
      setErrorStatus('请先选择 WebDAV 端点');
      return;
    }
    clientId = `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const originalName = path.split(/[/\\]/).pop() || path;
    const endpointMeta = getCurrentEndpointMeta();
    pendingUploads.set(clientId, {
      clientId,
      originalName,
      localPath: path,
      endpointId: endpointMeta.endpointId,
      endpointLabel: endpointMeta.endpointLabel,
      timestamp_ms: Date.now(),
      received: 0,
      total: 0,
      status: 'progress',
    });
    renderMessages(lastMessages, { scrollToBottom: true });
    renderUploadTasks();
    const result = await invoke('send_file', {
      path,
      clientId,
      markedOptions: cloneComposerMarkedOptions(getComposerMarkedOptions()),
    });
    if (clientId) {
      pendingUploads.delete(clientId);
      renderMessages(lastMessages);
      renderUploadTasks();
    }
    await loadMessages({ scrollToBottom: true });
    await loadPersistedUploadHistory({ silent: true });
    normalizeComposerDraftAfterSuccessfulSend(result);
    exitComposerFullscreenAfterSendSuccess();
    resetComposerMarkDraft();
    setSuccessStatus('发送成功');
  } catch (error) {
    if (clientId) {
      pendingUploads.delete(clientId);
      renderMessages(lastMessages);
      renderUploadTasks();
    }
    setErrorStatus(`发送文件失败：${error}`);
  }
}

function setDragOverState(active) {
  if (composerRow) {
    composerRow.classList.toggle('is-drag-over', active);
  }
}

if (listen) {
  listen('trigger-hide', prepareWindowForHide);

  // 全局快捷键的特定监听器
  listen('trigger-show', handleWindowFocus);

  // 用于非侵入性操作的通用焦点监听器
  listen('tauri://focus', () => {
    loadSyncStatus();
    loadTelegramBridgeStatus({ silent: true });
  });

  // 拖放事件监听器
  listen('tauri://drag-enter', () => {
    setDragOverState(true);
  });

  listen('tauri://drag-leave', () => {
    setDragOverState(false);
  });

  listen('tauri://drag-drop', async (event) => {
    setDragOverState(false);
    const payload = event.payload || {};
    const paths = payload.paths || [];
    if (paths.length === 0) return;
    
    for (const filePath of paths) {
      await sendFileByPath(filePath);
    }
  });
}

// 粘贴上传功能
async function sendFileData(data, originalName) {
  let clientId = null;
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!getActiveEndpoint()) {
      setErrorStatus('请先选择 WebDAV 端点');
      return;
    }
    clientId = `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const endpointMeta = getCurrentEndpointMeta();
    pendingUploads.set(clientId, {
      clientId,
      originalName,
      localPath: null,
      endpointId: endpointMeta.endpointId,
      endpointLabel: endpointMeta.endpointLabel,
      timestamp_ms: Date.now(),
      received: 0,
      total: data.length,
      status: 'progress',
    });
    renderMessages(lastMessages, { scrollToBottom: true });
    renderUploadTasks();
    const result = await invoke('send_file_data', {
      data: Array.from(data),
      originalName,
      clientId,
      markedOptions: cloneComposerMarkedOptions(getComposerMarkedOptions()),
    });
    if (clientId) {
      pendingUploads.delete(clientId);
      renderMessages(lastMessages);
      renderUploadTasks();
    }
    await loadMessages({ scrollToBottom: true });
    await loadPersistedUploadHistory({ silent: true });
    normalizeComposerDraftAfterSuccessfulSend(result);
    exitComposerFullscreenAfterSendSuccess();
    resetComposerMarkDraft();
    setSuccessStatus('发送成功');
  } catch (error) {
    if (clientId) {
      pendingUploads.delete(clientId);
      renderMessages(lastMessages);
      renderUploadTasks();
    }
    setErrorStatus(`发送文件失败：${error}`);
  }
}

function generatePastedFileName(mimeType) {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const ext = mimeType.split('/')[1] || 'bin';
  return `image_${timestamp}.${ext}`;
}

function isDefaultPastedFileName(name) {
  // 浏览器粘贴截图时的默认文件名
  const defaultNames = ['image.png', 'image.jpeg', 'image.jpg', 'image.gif', 'image.webp', 'image.bmp'];
  return !name || defaultNames.includes(name.toLowerCase());
}

if (messagePreviewClose) {
  messagePreviewClose.addEventListener('click', closeMessagePreview);
}

if (messagePreviewBackdrop) {
  messagePreviewBackdrop.addEventListener('click', closeMessagePreview);
}

if (markMessageModal) {
  const modalBackdrop = markMessageModal.querySelector('.message-preview-backdrop');
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', closeMarkMessageModal);
  }
  markMessageModal.addEventListener('click', (event) => {
    if (event.target === markMessageModal) {
      closeMarkMessageModal();
    }
  });
}

if (messagePreview) {
  messagePreview.addEventListener('click', (event) => {
    if (event.target === messagePreview) {
      closeMessagePreview();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && markMessageModal?.classList.contains('is-active')) {
    closeMarkMessageModal();
    return;
  }
  if (event.key === 'Escape' && messagePreview?.classList.contains('is-active')) {
    closeMessagePreview();
  }
});

document.addEventListener('paste', async (event) => {
  // 如果在输入框中粘贴文本，不处理
  if (event.target === textInput && !event.clipboardData.files.length) {
    return;
  }
  
  const items = event.clipboardData?.items;
  if (!items || items.length === 0) return;
  
  for (const item of items) {
    if (item.kind === 'file') {
      event.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;
      
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      // 如果是默认文件名（如 image.png），使用时间戳重新命名
      const originalName = isDefaultPastedFileName(file.name)
        ? generatePastedFileName(file.type)
        : file.name;
      await sendFileData(data, originalName);
    }
  }
});

function updateMarkedBadge(count) {
  // 标记tab图标不显示数量
  if (markedTabBadge) {
    markedTabBadge.hidden = true;
  }
}

function renderMarkMessageTagList() {
  if (!markMessageTagList) return;
  markMessageTagList.innerHTML = '';
  if (!markedTags.length) {
    const empty = document.createElement('div');
    empty.className = 'marked-tag-empty';
    empty.textContent = '还没有标签，可以直接确认无标签标记。';
    markMessageTagList.appendChild(empty);
    return;
  }

  markedTags.forEach((tag) => {
    const item = document.createElement('label');
    item.className = 'mark-message-tag-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedMarkTagIds.has(tag.id);
    item.classList.toggle('is-active', checkbox.checked);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedMarkTagIds.add(tag.id);
      } else {
        selectedMarkTagIds.delete(tag.id);
      }
      item.classList.toggle('is-active', checkbox.checked);
    });

    const text = document.createElement('span');
    text.textContent = tag.name;

    const removeButton = document.createElement('span');
    removeButton.className = 'marked-tag-chip-delete';
    removeButton.textContent = '×';
    removeButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await deleteMarkedTagRecord(tag.id);
    });

    item.appendChild(checkbox);
    item.appendChild(text);
    item.appendChild(removeButton);
    markMessageTagList.appendChild(item);
  });
}

function closeMarkMessageModal() {
  if (!markMessageModal) return;
  markMessageModal.classList.remove('is-active');
  markMessageModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('preview-open');
  if (markMessageConfirmButton) {
    markMessageConfirmButton.disabled = false;
    markMessageConfirmButton.classList.remove('is-loading');
  }
  currentMarkingMessage = null;
  currentMarkingMessages = [];
  currentMarkingMode = 'single';
  selectedMarkTagIds.clear();
  if (markMessageNewTagInput) {
    markMessageNewTagInput.value = '';
  }
}

async function loadMarkedTags() {
  if (!invoke) return;
  if (!getActiveEndpoint()) {
    markedTags = [];
    renderMarkedTagFilters();
    renderMarkMessageTagList();
    renderComposerMarkTagList();
    return;
  }

  try {
    markedTags = await invoke('list_marked_tags');
    if (
      activeMarkedTagId
      && activeMarkedTagId !== UNTAGGED_MARKED_TAG_FILTER_ID
      && !markedTags.some((tag) => tag.id === activeMarkedTagId)
    ) {
      activeMarkedTagId = null;
    }
    renderMarkedTagFilters();
    renderMarkMessageTagList();
    renderComposerMarkTagList();
  } catch (error) {
    showToast(`读取标签失败: ${error}`, 'error');
  }
}

async function createMarkedTagRecord(name) {
  if (!invoke) return null;
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const tag = await invoke('create_marked_tag', { name: trimmed });
  await loadMarkedTags();
  return tag;
}

async function promptCreateMarkedTag() {
  const name = window.prompt('新增标签');
  if (name === null) return null;
  try {
    return await createMarkedTagRecord(name);
  } catch (error) {
    showToast(`新增标签失败: ${error}`, 'error');
    return null;
  }
}

async function deleteMarkedTagRecord(tagId) {
  if (!invoke || !tagId) return;
  const tag = markedTags.find((item) => item.id === tagId);
  const confirmed = await showConfirmDialog({
    title: '删除标签',
    message: tag
      ? `确认删除标签“${tag.name}”吗？已引用该标签的消息会移除这个标签。`
      : '确认删除这个标签吗？已引用该标签的消息会移除这个标签。',
    confirmLabel: '删除',
  });
  if (!confirmed) {
    return;
  }
  try {
    await invoke('delete_marked_tag', { tagId });
    selectedMarkTagIds.delete(tagId);
    if (activeMarkedTagId === tagId) {
      activeMarkedTagId = null;
    }
    await Promise.all([
      loadMarkedTags(),
      loadMessages(),
      loadMarkedMessages(),
    ]);
  } catch (error) {
    showToast(`删除标签失败: ${error}`, 'error');
  }
}

async function renameMarkedTagRecord(tag) {
  if (!invoke || !tag) return;
  const nextName = window.prompt('编辑标签', tag.name);
  if (nextName === null) return;
  const trimmed = nextName.trim();
  if (!trimmed || trimmed === tag.name) return;
  try {
    await invoke('rename_marked_tag', { tagId: tag.id, name: trimmed });
    await Promise.all([
      loadMarkedTags(),
      loadMarkedMessages(),
    ]);
  } catch (error) {
    showToast(`重命名标签失败: ${error}`, 'error');
  }
}

function renderMarkedTagFilters() {
  if (!markedTagFilterList) return;
  const previousScrollLeft = markedTagFilterList.scrollLeft;
  const previousScrollTop = markedTagFilterList.scrollTop;
  if (markedTagFilterPanel) {
    markedTagFilterPanel.hidden = false;
    if (markedToggleSelectionButton && markedToggleSelectionButton.parentElement !== markedTagFilterPanel) {
      if (markedRefreshButton && markedRefreshButton.parentElement === markedTagFilterPanel) {
        markedTagFilterPanel.insertBefore(markedToggleSelectionButton, markedRefreshButton);
      } else {
        markedTagFilterPanel.appendChild(markedToggleSelectionButton);
      }
    }
    if (markedRefreshButton && markedRefreshButton.parentElement !== markedTagFilterPanel) {
      markedTagFilterPanel.appendChild(markedRefreshButton);
    }
  }
  markedTagFilterList.innerHTML = '';

  const prefix = document.createElement('span');
  prefix.className = 'marked-tag-filter-prefix';
  prefix.textContent = '标签：';
  markedTagFilterList.appendChild(prefix);

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'marked-tag-chip';
  allChip.classList.toggle('is-active', !activeMarkedTagId);
  allChip.textContent = '全部';
  allChip.addEventListener('click', async () => {
    activeMarkedTagId = null;
    renderMarkedTagFilters();
    await loadMarkedMessages();
  });
  markedTagFilterList.appendChild(allChip);

  const untaggedChip = document.createElement('button');
  untaggedChip.type = 'button';
  untaggedChip.className = 'marked-tag-chip';
  untaggedChip.classList.toggle('is-active', activeMarkedTagId === UNTAGGED_MARKED_TAG_FILTER_ID);
  untaggedChip.textContent = '无标签';
  untaggedChip.addEventListener('click', async () => {
    activeMarkedTagId =
      activeMarkedTagId === UNTAGGED_MARKED_TAG_FILTER_ID ? null : UNTAGGED_MARKED_TAG_FILTER_ID;
    renderMarkedTagFilters();
    await loadMarkedMessages();
  });
  markedTagFilterList.appendChild(untaggedChip);

  markedTags.forEach((tag) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'marked-tag-chip';
    chip.classList.toggle('is-active', activeMarkedTagId === tag.id);
    chip.textContent = tag.name;
    chip.addEventListener('click', async () => {
      activeMarkedTagId = activeMarkedTagId === tag.id ? null : tag.id;
      renderMarkedTagFilters();
      await loadMarkedMessages();
    });
    chip.addEventListener('dblclick', (event) => {
      event.preventDefault();
      renameMarkedTagRecord(tag);
    });

    const removeButton = document.createElement('span');
    removeButton.className = 'marked-tag-chip-delete';
    removeButton.textContent = '×';
    removeButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await deleteMarkedTagRecord(tag.id);
    });

    chip.appendChild(removeButton);
    markedTagFilterList.appendChild(chip);
  });

  const addChip = document.createElement('button');
  addChip.type = 'button';
  addChip.className = 'marked-tag-chip marked-tag-chip-add';
  addChip.setAttribute('aria-label', '新增标签');
  addChip.textContent = '+';
  addChip.addEventListener('click', async () => {
    await promptCreateMarkedTag();
  });
  markedTagFilterList.appendChild(addChip);

  requestAnimationFrame(() => {
    if (!markedTagFilterList) return;
    markedTagFilterList.scrollLeft = previousScrollLeft;
    markedTagFilterList.scrollTop = previousScrollTop;
  });
}

async function openMarkMessageModal(messageOrMessages, options = {}) {
  if (!markMessageModal) return;
  const messages = Array.isArray(messageOrMessages)
    ? messageOrMessages.filter(Boolean)
    : [messageOrMessages].filter(Boolean);
  if (!messages.length) return;
  currentMarkingMessage = messages[0];
  currentMarkingMessages = messages;
  currentMarkingMode = options.mode || (messages.length > 1 ? 'batch' : 'single');
  selectedMarkTagIds.clear();
  if (currentMarkingMode !== 'batch') {
    (messages[0].marked_tag_ids || []).forEach((tagId) => selectedMarkTagIds.add(tagId));
  }
  await loadMarkedTags();
  if (markMessageSubtitle) {
    markMessageSubtitle.textContent = `${message.sender || '消息'}：选择标签后确认，也可以直接确认为无标签标记。`;
  }
  renderMarkMessageTagList();
  markMessageModal.classList.add('is-active');
  markMessageModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('preview-open');
}

async function confirmMarkMessage() {
  if (!invoke || !currentMarkingMessage?.filename) return;
  try {
    await invoke('mark_message', {
      filename: currentMarkingMessage.filename,
      tagIds: Array.from(selectedMarkTagIds),
    });
    closeMarkMessageModal();
    await Promise.all([
      loadMessages(),
      loadMarkedMessages(),
    ]);
  } catch (error) {
    showToast(`标记失败: ${error}`, 'error');
  }
}

async function openMarkMessageModal(messageOrMessages, options = {}) {
  if (!markMessageModal) return;
  const messages = Array.isArray(messageOrMessages)
    ? messageOrMessages.filter(Boolean)
    : [messageOrMessages].filter(Boolean);
  if (!messages.length) return;
  currentMarkingMessages = messages;
  currentMarkingMode = options.mode || (messages.length > 1 ? 'batch' : 'single');
  selectedMarkTagIds.clear();
  if (currentMarkingMode !== 'batch') {
    (messages[0].marked_tag_ids || []).forEach((tagId) => selectedMarkTagIds.add(tagId));
  }
  await loadMarkedTags();
  if (markMessageSubtitle) {
    if (currentMarkingMode === 'batch') {
      markMessageSubtitle.textContent = `已选中 ${messages.length} 条消息。确认后会统一覆盖这些消息的标签集合。`;
    } else {
      const message = messages[0];
      markMessageSubtitle.textContent = `${message.sender || '消息'}：选择标签后确认，也可以直接确认为无标签标记。`;
    }
  }
  renderMarkMessageTagList();
  markMessageModal.classList.add('is-active');
  markMessageModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('preview-open');
}

async function confirmMarkMessage() {
  if (!invoke || currentMarkingMessages.length === 0) return;
  if (markMessageConfirmButton) {
    markMessageConfirmButton.disabled = true;
    markMessageConfirmButton.classList.add('is-loading');
  }
  try {
    if (currentMarkingMode === 'batch') {
      await invoke('set_marked_messages_tags', {
        filenames: currentMarkingMessages.map((message) => message.filename),
        tagIds: Array.from(selectedMarkTagIds),
      });
      closeMarkMessageModal();
      setMarkedSelectionMode(false);
    } else {
      await invoke('mark_message', {
        filename: currentMarkingMessages[0].filename,
        tagIds: Array.from(selectedMarkTagIds),
      });
      closeMarkMessageModal();
    }
    await Promise.all([
      loadMessages(),
      loadMarkedMessages(),
    ]);
  } catch (error) {
    showToast(`标记失败: ${error}`, 'error');
  } finally {
    if (markMessageConfirmButton) {
      markMessageConfirmButton.disabled = false;
      markMessageConfirmButton.classList.remove('is-loading');
    }
  }
}

async function editSelectedMarkedMessageTags() {
  const messages = getSelectableMarkedMessages().filter((message) =>
    selectedMarkedMessages.has(message.filename),
  );
  if (!messages.length) {
    showToast('请先选择要设置标签的消息', 'error');
    return;
  }
  await openMarkMessageModal(messages, { mode: 'batch' });
}

async function deleteSelectedMarkedMessages() {
  const filenames = Array.from(selectedMarkedMessages);
  if (!filenames.length) {
    await showInfoDialog({
      title: '删除失败',
      message: '请先选择要删除的标记消息',
    });
    return;
  }
  if (!invoke) {
    await showInfoDialog({
      title: '删除失败',
      message: '未检测到 Tauri API，请检查 app.withGlobalTauri 配置',
    });
    return;
  }

  const choice = await showDeleteConfirmDialog(filenames.length);
  if (choice === 'cancel') {
    return;
  }

  try {
    const result = await invoke('delete_messages', {
      filenames,
      deleteRemote: choice === 'remote',
    });
    const failed = result.failed || [];
    if (failed.length > 0) {
      await showInfoDialog({
        title: '删除完成',
        message: `已删除 ${result.deleted || 0} 条标记消息，${failed.length} 条处理失败`,
      });
    } else if (choice === 'remote') {
      await showInfoDialog({
        title: '删除成功',
        message: `已删除 ${result.deleted || filenames.length} 条标记消息`,
      });
    } else {
      await showInfoDialog({
        title: '删除成功',
        message: `已删除 ${result.deleted || filenames.length} 个文件的本地副本`,
      });
    }
  } catch (error) {
    await showInfoDialog({
      title: '删除失败',
      message: String(error),
    });
  } finally {
    setMarkedSelectionMode(false);
    await Promise.all([
      loadMessages(),
      loadMarkedMessages(),
    ]);
  }
}

async function toggleMarkedMessagePin(message, button) {
  if (!invoke || !message?.filename) return;
  if (button) {
    button.disabled = true;
    button.classList.add('is-loading');
  }
  try {
    await invoke('toggle_marked_message_pin', { filename: message.filename });
    await Promise.all([
      loadMessages(),
      loadMarkedMessages(),
    ]);
  } catch (error) {
    showToast(`置顶失败: ${error}`, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  }
}

async function toggleMessageMarked(message) {
  if (!message || !message.filename || !invoke) return;
  if (!message.marked) {
    if (currentPreviewMessage?.filename === message.filename) {
      closeMessagePreview();
    }
    await openMarkMessageModal(message);
    return;
  }

  try {
    await invoke('unmark_message', { filename: message.filename });
    await Promise.all([
      loadMessages(),
      loadMarkedMessages(),
    ]);
    if (currentPreviewMessage?.filename === message.filename) {
      closeMessagePreview();
    }
  } catch (error) {
    showToast(`操作失败: ${error}`, 'error');
  }
}

function getAppliedMarkedSearchQuery() {
  return appliedMarkedSearchQuery;
}

async function executeMarkedSearch() {
  appliedMarkedSearchQuery = markedSearchInput ? markedSearchInput.value.trim() : '';
  markedMessagesPage = 1;
  await loadMarkedMessages();
}

function renderMarkedMessages(messages = [], options = {}) {
  if (!markedMessageList) return;
  const { query = '' } = options;
  markedMessageList.innerHTML = '';
  visibleMarkedMessages = [];

  if (!messages.length) {
    pruneSelectedMarkedMessages();
    updateMarkedSelectionBar();
    const empty = document.createElement('li');
    empty.className = 'message-card';
    empty.textContent = query
      ? `没有找到与 "${query}" 匹配的标记消息`
      : (activeMarkedTagId ? '当前标签下暂无标记消息' : '暂无标记消息');
    markedMessageList.appendChild(empty);
    renderMarkedPagination(0, 0);
    return;
  }

  // 分页计算
  const totalPages = Math.ceil(messages.length / MARKED_MESSAGES_PER_PAGE);
  const validPage = Math.max(1, Math.min(markedMessagesPage, totalPages));
  markedMessagesPage = validPage;
  
  const startIndex = (markedMessagesPage - 1) * MARKED_MESSAGES_PER_PAGE;
  const endIndex = Math.min(startIndex + MARKED_MESSAGES_PER_PAGE, messages.length);
  const pageMessages = messages.slice(startIndex, endIndex);
  visibleMarkedMessages = pageMessages;
  pruneSelectedMarkedMessages();
  updateMarkedSelectionBar();

  pageMessages.forEach((message) => {
    const item = document.createElement('li');
    item.className = 'message-card';
    item.dataset.filename = message.filename;
    item.classList.toggle('is-file', message.kind === 'file');
    item.classList.toggle('is-text', message.kind !== 'file');
    item.classList.toggle('is-pinned', !!message.marked_pinned);
    item.classList.toggle('with-selection', markedSelectionMode);
    item.classList.toggle('is-selected', selectedMarkedMessages.has(message.filename));

    if (message.marked_pinned) {
      const pinnedBadge = document.createElement('span');
      pinnedBadge.className = 'marked-message-corner-badge';
      pinnedBadge.textContent = '置顶';
      pinnedBadge.setAttribute('aria-label', '已置顶');
      item.appendChild(pinnedBadge);
    }

    const header = document.createElement('div');
    header.className = 'message-header';
    if (markedSelectionMode) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'message-select';
      checkbox.checked = selectedMarkedMessages.has(message.filename);
      checkbox.addEventListener('change', () => {
        toggleSelectedMarkedMessage(message.filename, checkbox.checked);
        item.classList.toggle('is-selected', checkbox.checked);
      });
      item.appendChild(checkbox);
    }
    const headerText = document.createElement('span');
    headerText.textContent = `${message.sender} · ${formatTime(message.timestamp_ms)}`;
    header.appendChild(headerText);

    const body = document.createElement('div');
    body.className = 'message-body';
    body.textContent = message.kind === 'text'
      ? (message.content || '')
      : (message.original_name || message.filename || '');
    if (message.kind === 'file') {
      body.addEventListener('click', (event) => {
        if (markedSelectionMode) return;
        if (event.target.closest('button, summary, details')) return;
        openMessageFile(message);
      });
    }

    if (markedSelectionMode) {
      item.addEventListener('click', (event) => {
        if (
          event.target.closest(
            'button, a, input, textarea, select, summary, details, .action-menu, .message-actions',
          )
        ) {
          return;
        }
        const nextChecked = !selectedMarkedMessages.has(message.filename);
        toggleSelectedMarkedMessage(message.filename, nextChecked);
        item.classList.toggle('is-selected', nextChecked);
        const checkbox = item.querySelector('.message-select');
        if (checkbox) {
          checkbox.checked = nextChecked;
        }
      });
    }

    const tagRow = document.createElement('div');
    tagRow.className = 'marked-message-tags';
    const resolvedTags = (message.marked_tag_ids || [])
      .map((tagId) => markedTags.find((tag) => tag.id === tagId))
      .filter(Boolean);
    if (resolvedTags.length) {
      resolvedTags.forEach((tag) => {
        const chip = document.createElement('span');
        chip.className = 'marked-message-tag-chip';
        chip.textContent = tag.name;
        tagRow.appendChild(chip);
      });
    } else {
      const emptyTag = document.createElement('span');
      emptyTag.className = 'marked-message-tag-chip is-empty';
      emptyTag.textContent = '无标签';
      tagRow.appendChild(emptyTag);
    }

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = `大小 ${formatBytes(message.size || 0)}`;

    const actions = document.createElement('div');
    actions.className = 'message-actions';


    const markButton = document.createElement('button');
    markButton.className = 'button ghost small icon-only mark-action is-marked';
    const markIcon = document.createElement('img');
    markIcon.src = 'icons/mark.svg';
    markIcon.alt = '取消标记';
    markIcon.style.width = '16px';
    markIcon.style.height = '16px';
    markButton.appendChild(markIcon);
    markButton.addEventListener('click', () => toggleMessageMarked(message));
    actions.appendChild(markButton);

    const tagButton = document.createElement('button');
    tagButton.className = 'button ghost small';
    tagButton.textContent = '标签';
    tagButton.addEventListener('click', () => openMarkMessageModal(message));
    actions.appendChild(tagButton);

    const pinButton = document.createElement('button');
    pinButton.className = `button small has-spinner marked-pin-button ${message.marked_pinned ? 'primary' : 'ghost'}`;
    pinButton.classList.toggle('is-active', !!message.marked_pinned);
    pinButton.textContent = message.marked_pinned ? '已置顶' : '置顶';
    const pinSpinner = document.createElement('span');
    pinSpinner.className = 'button-spinner';
    pinSpinner.setAttribute('aria-hidden', 'true');
    pinButton.appendChild(pinSpinner);
    pinButton.addEventListener('click', () => toggleMarkedMessagePin(message, pinButton));
    actions.appendChild(pinButton);

    if (message.kind === 'text') {
      const copyButton = document.createElement('button');
      copyButton.className = 'button ghost small icon-only';
      const copyIcon = document.createElement('img');
      copyIcon.src = 'icons/copy.svg';
      copyIcon.alt = '复制';
      copyIcon.style.width = '16px';
      copyIcon.style.height = '16px';
      copyButton.appendChild(copyIcon);
      copyButton.addEventListener('click', () => copyTextToClipboard(message.content || ''));
      actions.appendChild(copyButton);

      const downloadButton = document.createElement('button');
      downloadButton.className = 'button primary small icon-only';
      const downloadIcon = document.createElement('img');
      downloadIcon.src = 'icons/download.svg';
      downloadIcon.alt = '下载为文件';
      downloadIcon.style.width = '16px';
      downloadIcon.style.height = '16px';
      downloadButton.appendChild(downloadIcon);
      downloadButton.addEventListener('click', () => downloadTextMessageAsFile(message));
      actions.appendChild(downloadButton);
    } else {
      const downloadButton = document.createElement('button');
      downloadButton.className = 'button primary small icon-only download-action';
      const downloadIcon = document.createElement('img');
      downloadIcon.src = 'icons/download.svg';
      downloadIcon.alt = '下载';
      downloadIcon.style.width = '16px';
      downloadIcon.style.height = '16px';
      downloadButton.appendChild(downloadIcon);
      downloadButton.addEventListener('click', () => downloadMessageFile(message));
      actions.appendChild(downloadButton);
    }

    const menu = document.createElement('details');
    menu.className = 'action-menu';
    const summary = document.createElement('summary');
    summary.className = 'button ghost small icon-only';
    const moreIcon = document.createElement('img');
    moreIcon.src = 'icons/more.svg';
    moreIcon.alt = '更多';
    moreIcon.style.width = '16px';
    moreIcon.style.height = '16px';
    summary.appendChild(moreIcon);

    const menuList = document.createElement('div');
    menuList.className = 'action-menu-list';
    if (message.kind === 'text') {
      const downloadAsFileButton = document.createElement('button');
      downloadAsFileButton.className = 'button ghost small';
      downloadAsFileButton.textContent = '下载为文件';
      downloadAsFileButton.addEventListener('click', () => {
        menu.open = false;
        downloadTextMessageAsFile(message);
      });
      menuList.appendChild(downloadAsFileButton);
    } else {
      const saveAsButton = document.createElement('button');
      saveAsButton.className = 'button ghost small';
      saveAsButton.textContent = '另存为';
      saveAsButton.addEventListener('click', () => {
        menu.open = false;
        saveMessageFileAs(message);
      });
      menuList.appendChild(saveAsButton);
    }

    const deleteButton = document.createElement('button');
    deleteButton.className = 'button ghost small delete-action';
    deleteButton.textContent = '删除';
    deleteButton.addEventListener('click', () => {
      menu.open = false;
      deleteSingleMessage(message);
    });
    menuList.appendChild(deleteButton);
    menu.appendChild(summary);
    menu.appendChild(menuList);
    actions.appendChild(menu);

    const footer = document.createElement('div');
    footer.className = 'message-footer';
    footer.appendChild(meta);
    footer.appendChild(actions);

    item.appendChild(header);
    item.appendChild(body);
    item.appendChild(tagRow);
    item.appendChild(footer);
    item.addEventListener('dblclick', (event) => {
      if (markedSelectionMode) {
        return;
      }
      if (
        event.target.closest(
          'button, a, input, textarea, select, summary, details, .action-menu, .message-actions',
        )
      ) {
        return;
      }
      openMessagePreview(message);
    });
    markedMessageList.appendChild(item);
    if (message.kind === 'text') {
      applyMessageBodyCollapse(item, body, message, {
        collapseHeight: MARKED_MESSAGE_BODY_COLLAPSE_HEIGHT,
      });
    }
  });

  // 渲染分页控件
  renderMarkedPagination(messages.length, totalPages);
}

function renderMarkedPagination(totalCount, totalPages) {
  // 移除旧的分页控件
  const existingPagination = document.getElementById('marked-pagination');
  if (existingPagination) {
    existingPagination.remove();
  }

  const paginationContainer = document.createElement('li');
  paginationContainer.id = 'marked-pagination';
  paginationContainer.className = 'marked-pagination';

  // 上一页按钮
  const prevButton = document.createElement('button');
  prevButton.className = 'button ghost small';
  prevButton.textContent = '上一页';
  prevButton.disabled = markedMessagesPage <= 1 || totalPages === 0;
  prevButton.addEventListener('click', () => {
    if (markedMessagesPage > 1) {
      markedMessagesPage--;
      renderMarkedMessages(markedMessages, {
        query: getAppliedMarkedSearchQuery(),
      });
    }
  });
  paginationContainer.appendChild(prevButton);

  // 页码信息
  const pageInfo = document.createElement('span');
  pageInfo.className = 'pagination-info';
  pageInfo.textContent = totalPages === 0 ? '0 / 0' : `${markedMessagesPage} / ${totalPages}`;
  paginationContainer.appendChild(pageInfo);

  // 下一页按钮
  const nextButton = document.createElement('button');
  nextButton.className = 'button ghost small';
  nextButton.textContent = '下一页';
  nextButton.disabled = markedMessagesPage >= totalPages || totalPages === 0;
  nextButton.addEventListener('click', () => {
    if (markedMessagesPage < totalPages) {
      markedMessagesPage++;
      renderMarkedMessages(markedMessages, {
        query: getAppliedMarkedSearchQuery(),
      });
    }
  });
  paginationContainer.appendChild(nextButton);

  // 插入到消息列表后面
  if (markedMessageList) {
    markedMessageList.appendChild(paginationContainer);
  }
}

async function loadMarkedMessages(options = {}) {
  if (!invoke || !markedMessageList) return;
  const { scrollToTop = false } = options;
  if (!getActiveEndpoint()) {
    markedMessages = [];
    visibleMarkedMessages = [];
    setMarkedSelectionMode(false);
    renderMarkedMessages([]);
    updateMarkedBadge(0);
    if (scrollToTop) {
      scrollMarkedMessageListToTop();
    }
    return;
  }

  try {
    const result = await invoke('list_marked_messages', {
      tagId:
        activeMarkedTagId && activeMarkedTagId !== UNTAGGED_MARKED_TAG_FILTER_ID
          ? activeMarkedTagId
          : null,
      searchQuery: getAppliedMarkedSearchQuery() || null,
    });
    markedMessages = result.messages || [];
    if (activeMarkedTagId === UNTAGGED_MARKED_TAG_FILTER_ID) {
      markedMessages = markedMessages.filter(
        (message) => !Array.isArray(message.marked_tag_ids) || message.marked_tag_ids.length === 0,
      );
    }
    // 切换标签时重置页码
    markedMessagesPage = 1;
    updateMarkedBadge(result.marked_count || 0);
    renderMarkedMessages(markedMessages, {
      query: getAppliedMarkedSearchQuery(),
    });
    if (scrollToTop) {
      scrollMarkedMessageListToTop();
    }
  } catch (error) {
    showToast(`读取标记列表失败: ${error}`, 'error');
  }
}

document.addEventListener('pointerdown', (event) => {
  const openMenu = document.querySelector('details.action-menu[open]');
  if (openMenu && !openMenu.contains(event.target)) {
    openMenu.open = false;
  }
});

function updateAndRender(options = {}) {
  const query = searchInput.value.trim().toLowerCase();
  
  const messagesToRender = !query 
    ? lastMessages
    : lastMessages.filter(message => {
        if (message.kind === 'text') {
            return (message.content || '').toLowerCase().includes(query);
        }
        if (message.kind === 'file') {
            return (message.original_name || '').toLowerCase().includes(query);
        }
        return false;
    });
  
  const renderOptions = {
    ...options,
    isSearchResult: !!query,
    query
  };

  renderMessages(messagesToRender, renderOptions);
}

if (searchInput) {
  searchInput.addEventListener('input', () => {
    updateAndRender({ preserveScroll: true });
  });
}

if (markedSearchButton) {
  markedSearchButton.addEventListener('click', async () => {
    await executeMarkedSearch();
  });
}

if (markedSearchInput) {
  markedSearchInput.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    await executeMarkedSearch();
  });
}
