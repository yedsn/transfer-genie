const tauri = window.__TAURI__ || {};
const invoke = tauri.core?.invoke || tauri.invoke;
const openDialog = tauri.dialog?.open;
const saveDialog = tauri.dialog?.save;
const listen = tauri.event?.listen;
const convertFileSrc = tauri.path?.convertFileSrc;
const vueBridge = window.transferGenieVue || null;
const hasVueAppShell = true;
const feedState = window.transferGenieFeedState || null;
const feedViewModel = window.transferGenieFeedViewModel || null;
const settingsFormRuntime = window.transferGenieSettingsFormRuntime || null;
const settingsOpsRuntime = window.transferGenieSettingsOpsRuntime || null;
const settingsRuntimeStatus = window.transferGenieSettingsRuntimeStatus || null;
const DEFAULT_EDITOR_FORMAT_STORAGE_KEY = 'transfer-genie.default-editor-format';
const HOME_LAYOUT_STORAGE_KEY = 'transfer-genie.home-layout';
const DEFAULT_SPEECH_CUE_SOUND_KIND = 'system';

function normalizeEditorFormat(format) {
  return format === 'markdown' ? 'markdown' : 'text';
}

function loadDefaultEditorFormat() {
  try {
    return normalizeEditorFormat(window.localStorage?.getItem(DEFAULT_EDITOR_FORMAT_STORAGE_KEY));
  } catch (error) {
    return 'text';
  }
}

function saveDefaultEditorFormat(format) {
  try {
    window.localStorage?.setItem(DEFAULT_EDITOR_FORMAT_STORAGE_KEY, normalizeEditorFormat(format));
  } catch (error) {
    // Ignore storage failures; the in-memory setting still applies this session.
  }
}

function loadHomeLayoutState() {
  try {
    const parsed = JSON.parse(window.localStorage?.getItem(HOME_LAYOUT_STORAGE_KEY) || '{}');
    return { composerVisible: parsed.composerVisible !== false };
  } catch (error) {
    return { composerVisible: true };
  }
}

function saveHomeLayoutState(state) {
  try {
    window.localStorage?.setItem(HOME_LAYOUT_STORAGE_KEY, JSON.stringify({
      composerVisible: state?.composerVisible !== false,
    }));
  } catch (error) {
    // Ignore storage failures; the layout still changes for this session.
  }
}

function applyDefaultEditorFormat(format) {
  const normalized = normalizeEditorFormat(format);
  currentFormat = normalized;
  const cw = window.transferGenieComposer;
  if (cw && cw.isActive && cw.isActive() && cw.getActiveDraft) {
    const draft = cw.getActiveDraft();
    if (!draft || !String(draft.text || '').trim()) {
      cw.setActiveDraftFormat?.(normalized);
    }
    return;
  }
  if (textInput && !String(textInput.value || '').trim()) {
    switchFormat(normalized);
  }
}

function syncVueActiveTab(tab) {
  vueBridge?.syncActiveTab?.(tab);
}

function syncVueSettings(settings) {
  vueBridge?.syncSettings?.(settings);
}

function syncVueIntegrationModules(modules) {
  vueBridge?.syncIntegrationModules?.(modules);
}

function syncVueTelegramBridgeStatus(status) {
  vueBridge?.syncTelegramBridgeStatus?.(status);
}

function syncVueLocalHttpApiStatus(status) {
  vueBridge?.syncLocalHttpApiStatus?.(status);
}

function syncVueHomeFeed(feedState) {
  vueBridge?.syncHomeFeed?.(feedState);
}

function syncVueMarkedPage(markedState) {
  vueBridge?.syncMarkedPage?.(markedState);
}

function syncVueTransferTasks(transferState) {
  vueBridge?.syncTransferTasks?.(transferState);
}

function syncVueSettingsOps(settingsOpsState) {
  vueBridge?.syncSettingsOps?.(settingsOpsState);
}

function syncVueSettingsWebdav(webdavState) {
  vueBridge?.syncSettingsWebdav?.(webdavState);
}

function syncVueSettingsForm(formState) {
  vueBridge?.syncSettingsForm?.(formState);
}

function syncVueSettingsSnapshots(snapshots) {
  vueBridge?.syncSettingsSnapshots?.(snapshots);
}

function syncVueSettingsSnapshotsLoading(isLoading) {
  vueBridge?.syncSettingsSnapshotsLoading?.(isLoading);
}

function syncVueSettingsBackupArchives(records) {
  vueBridge?.syncSettingsBackupArchives?.(records);
}

function syncVueSettingsBackupArchivesLoading(isLoading) {
  vueBridge?.syncSettingsBackupArchivesLoading?.(isLoading);
}

function syncVueManualBackupDialog(dialogState) {
  vueBridge?.syncManualBackupDialog?.(dialogState);
}

function syncVueSettingsAutoBackup(autoBackupState) {
  vueBridge?.syncSettingsAutoBackup?.(autoBackupState);
}

let settingsAutoSaveTimer = null;
let settingsAutoSaveRunning = false;
let settingsAutoSavePending = false;
const SETTINGS_AUTO_SAVE_DELAY_MS = 650;

function queueSettingsAutoSave(options = {}) {
  if (options.skipAutoSave) {
    return;
  }
  settingsAutoSavePending = true;
  if (settingsAutoSaveTimer) {
    window.clearTimeout(settingsAutoSaveTimer);
  }
  settingsAutoSaveTimer = window.setTimeout(() => {
    settingsAutoSaveTimer = null;
    void flushSettingsAutoSave();
  }, Number(options.delayMs ?? SETTINGS_AUTO_SAVE_DELAY_MS));
}

async function flushSettingsAutoSave() {
  if (settingsAutoSaveRunning || !settingsAutoSavePending) {
    return;
  }
  settingsAutoSavePending = false;
  settingsAutoSaveRunning = true;
  try {
    await saveSettings({ silent: true, source: 'auto' });
    setSuccessStatus('设置已自动生效');
  } catch (error) {
    setErrorStatus(`自动应用设置失败：${error}`);
  } finally {
    settingsAutoSaveRunning = false;
    if (settingsAutoSavePending) {
      queueSettingsAutoSave({ delayMs: 120 });
    }
  }
}

function updateSettingsAutoBackupField(field, value, options = {}) {
  if (!field) {
    return;
  }
  currentAutoBackupStatusState = {
    ...currentAutoBackupStatusState,
    [field]: value,
  };
  syncVueSettingsAutoBackup(currentAutoBackupStatusState);
  queueSettingsAutoSave(options);
}

function updateSettingsFormField(field, value, options = {}) {
  if (!field) {
    return;
  }
  currentSettingsFormState = {
    ...currentSettingsFormState,
    [field]: value,
  };
  if (field === 'defaultEditorFormat') {
    saveDefaultEditorFormat(value);
    applyDefaultEditorFormat(value);
  }
  if (field === 'speechToTextCueSoundEnabled' || field === 'speechToTextCueSoundKind') {
    syncSpeechCueSoundControls();
  }
  syncVueSettingsForm(currentSettingsFormState);
  syncSendOptionsMenuState();
  queueSettingsAutoSave(options);
}

function defaultAiActions() {
  return [
    {
      id: 'polish',
      name: '润色',
      category: '通用',
      builtin: true,
      favorite: true,
      enabled: true,
      system_prompt: '你是一个中文写作助手。',
      user_prompt: '请润色下面的内容，保持原意不变，让表达更清晰、自然。如果输入是 Markdown，请保持 Markdown 结构。只输出润色后的文本。\n\n{{text}}',
      output_mode: 'preview_replace',
    },
    {
      id: 'formalize',
      name: '正式一点',
      category: '通用',
      builtin: true,
      favorite: false,
      enabled: true,
      system_prompt: '你是一个中文写作助手。',
      user_prompt: '请将下面的内容改写得更正式、得体，保持原意不变。如果输入是 Markdown，请保持 Markdown 结构。只输出改写后的文本。\n\n{{text}}',
      output_mode: 'preview_replace',
    },
    {
      id: 'shorten',
      name: '简洁一点',
      category: '通用',
      builtin: true,
      favorite: false,
      enabled: true,
      system_prompt: '你是一个中文写作助手。',
      user_prompt: '请压缩下面的内容，去掉冗余表达，保留关键信息。如果输入是 Markdown，请保持 Markdown 结构。只输出处理后的文本。\n\n{{text}}',
      output_mode: 'preview_replace',
    },
    {
      id: 'dev-explain',
      name: '解释代码/技术内容',
      category: '开发',
      builtin: true,
      favorite: false,
      enabled: true,
      system_prompt: '你是一个资深软件工程师，擅长用清晰、准确的中文解释技术内容。',
      user_prompt: '请解释下面的代码或技术内容，先说明核心作用，再列出关键逻辑和注意事项。保持简洁，不要编造上下文。\n\n{{text}}',
      output_mode: 'preview_replace',
    },
    {
      id: 'dev-pr-summary',
      name: '生成变更说明',
      category: '开发',
      builtin: true,
      favorite: false,
      enabled: true,
      system_prompt: '你是一个严谨的软件工程协作者。',
      user_prompt: '请把下面的开发记录整理成简洁的变更说明，包含用户可见变化和验证方式。如果输入是 Markdown，请保持 Markdown 结构。\n\n{{text}}',
      output_mode: 'preview_replace',
    },
    {
      id: 'dev-requirements-brief',
      name: '梳理需求',
      category: '开发',
      builtin: true,
      favorite: false,
      enabled: true,
      system_prompt: '你是一个严谨的产品需求分析师和软件工程协作者，擅长把零散想法整理成可执行需求。',
      user_prompt: '请把下面的需求描述整理成结构清晰的需求说明，包含：目标、范围、核心流程、功能点、验收标准、待确认问题。保持原意，不要编造不存在的信息；如果信息不足，请放入待确认问题。\n\n{{text}}',
      output_mode: 'preview_replace',
    },
    {
      id: 'design-feedback',
      name: '设计反馈',
      category: '设计',
      builtin: true,
      favorite: false,
      enabled: true,
      system_prompt: '你是一个注重产品质感和可用性的设计工程师。',
      user_prompt: '请对下面的界面或交互描述给出设计反馈，重点关注信息层级、可用性、视觉一致性和可落地的优化建议。只输出反馈内容。\n\n{{text}}',
      output_mode: 'preview_replace',
    },
    {
      id: 'design-copy',
      name: '优化界面文案',
      category: '设计',
      builtin: true,
      favorite: false,
      enabled: true,
      system_prompt: '你是一个中文产品文案设计师，擅长写清晰、克制、可操作的界面文案。',
      user_prompt: '请优化下面的界面文案，让它更清晰、自然、符合产品语境。保留原意，只输出优化后的文案。\n\n{{text}}',
      output_mode: 'preview_replace',
    },
    {
      id: 'film-logline',
      name: '影视一句话梗概',
      category: '影视',
      builtin: true,
      favorite: false,
      enabled: true,
      system_prompt: '你是一个影视策划编辑，擅长提炼故事卖点。',
      user_prompt: '请把下面的影视创意或剧情整理成一句话梗概，突出主角、目标、冲突和看点。只输出梗概。\n\n{{text}}',
      output_mode: 'preview_replace',
    },
    {
      id: 'film-scene-polish',
      name: '润色场景描述',
      category: '影视',
      builtin: true,
      favorite: false,
      enabled: true,
      system_prompt: '你是一个影视剧本文案编辑，擅长增强画面感和节奏感。',
      user_prompt: '请润色下面的场景描述，增强画面感、动作节奏和情绪氛围，保持原始信息不变。只输出润色后的文本。\n\n{{text}}',
      output_mode: 'preview_replace',
    },
  ];
}

function normalizeAiActions(actions) {
  const builtins = defaultAiActions();
  const builtinById = new Map(builtins.map((action) => [action.id, action]));
  const source = Array.isArray(actions) && actions.length ? actions : builtins;
  const normalized = source
    .map((action, index) => {
      const id = String(action?.id || `custom-${index + 1}`).trim();
      const builtin = builtinById.get(id);
      return {
        id,
        name: String(action?.name || action?.id || builtin?.name || `动作 ${index + 1}`).trim(),
        category: String(action?.category || builtin?.category || '通用').trim() || '通用',
        builtin: !!builtin || !!action?.builtin,
        favorite: !!action?.favorite,
        enabled: action?.enabled !== false,
        system_prompt: String(action?.system_prompt || action?.systemPrompt || builtin?.system_prompt || ''),
        user_prompt: String(action?.user_prompt || action?.userPrompt || builtin?.user_prompt || ''),
        output_mode: String(action?.output_mode || action?.outputMode || 'preview_replace'),
      };
    })
    .filter((action) => action.id && action.user_prompt.trim());
  const existingIds = new Set(normalized.map((action) => action.id));
  builtins.forEach((action) => {
    if (!existingIds.has(action.id)) {
      normalized.push({ ...action });
    }
  });
  return normalized;
}

function updateAiActionField(index, field, value, options = {}) {
  const actions = normalizeAiActions(currentSettingsFormState.aiActions).map((action) => ({ ...action }));
  if (!actions[index]) return;
  actions[index][field] = value;
  if (field === 'category') {
    currentSettingsFormState = {
      ...currentSettingsFormState,
      aiActions: actions,
      activeAiActionCategory: String(value || '通用').trim() || '通用',
    };
    syncVueSettingsForm(currentSettingsFormState);
    queueSettingsAutoSave(options);
    return;
  }
  updateSettingsFormField('aiActions', actions, options);
}

function makeCustomAiAction() {
  const existing = normalizeAiActions(currentSettingsFormState.aiActions);
  let nextIndex = existing.length + 1;
  let id = `custom-${nextIndex}`;
  const usedIds = new Set(existing.map((action) => action.id));
  while (usedIds.has(id)) {
    nextIndex += 1;
    id = `custom-${nextIndex}`;
  }
  return {
    id,
    name: `自定义提示词 ${nextIndex}`,
    category: '自定义',
    builtin: false,
    favorite: false,
    enabled: true,
    system_prompt: '你是一个可靠的中文内容处理助手。',
    user_prompt: '请根据下面的内容完成处理。只输出处理后的文本。\n\n{{text}}',
    output_mode: 'preview_replace',
  };
}

async function saveComposerAiPrompt(payload = {}) {
  const prompt = String(payload.userPrompt || payload.user_prompt || '').trim();
  const name = String(payload.name || '').trim();
  const category = String(payload.category || '').trim();
  if (!prompt) throw new Error('请先输入提示词');
  if (!name) throw new Error('请填写提示词名称');
  if (!category) throw new Error('请填写提示词类型');
  const actions = normalizeAiActions(currentSettingsFormState.aiActions).map((action) => ({ ...action }));
  const usedIds = new Set(actions.map((action) => action.id));
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'prompt';
  let id = `custom-${slug}`;
  let index = 2;
  while (usedIds.has(id)) {
    id = `custom-${slug}-${index}`;
    index += 1;
  }
  const action = {
    id,
    name,
    category,
    builtin: false,
    favorite: false,
    enabled: true,
    system_prompt: String(payload.systemPrompt || payload.system_prompt || '你是一个可靠的中文内容处理助手。').trim(),
    user_prompt: prompt,
    output_mode: String(payload.outputMode || payload.output_mode || 'preview_replace'),
  };
  actions.push(action);
  currentSettingsFormState = {
    ...currentSettingsFormState,
    aiActions: actions,
    activeAiActionCategory: category,
  };
  syncVueSettingsForm(currentSettingsFormState);
  await saveSettings({ silent: true });
  return action;
}

function addAiAction() {
  const actions = normalizeAiActions(currentSettingsFormState.aiActions).map((action) => ({ ...action }));
  const action = makeCustomAiAction();
  actions.push(action);
  currentSettingsFormState = {
    ...currentSettingsFormState,
    aiActions: actions,
    activeAiActionCategory: action.category,
  };
  syncVueSettingsForm(currentSettingsFormState);
  queueSettingsAutoSave();
}

function removeAiAction(index) {
  const actions = normalizeAiActions(currentSettingsFormState.aiActions).map((action) => ({ ...action }));
  const action = actions[index];
  if (!action || action.builtin) return;
  actions.splice(index, 1);
  const nextDefault = actions.some((item) => item.id === currentSettingsFormState.aiDefaultActionId)
    ? currentSettingsFormState.aiDefaultActionId
    : actions[0]?.id || 'polish';
  currentSettingsFormState = {
    ...currentSettingsFormState,
    aiActions: actions,
    aiDefaultActionId: nextDefault,
  };
  syncVueSettingsForm(currentSettingsFormState);
  queueSettingsAutoSave();
}

function selectAiActionCategory(category) {
  updateSettingsFormField('activeAiActionCategory', String(category || ''));
}

async function updateAiActionFavorite(index, value, options = {}) {
  updateAiActionField(index, 'favorite', !!value, { skipAutoSave: !!options.save });
  if (options.save) {
    await saveSettings({ silent: true });
  }
}

function getCurrentSenderName() {
  if (settingsFormRuntime?.getCurrentSenderName) {
    return settingsFormRuntime.getCurrentSenderName(
      currentSettingsFormState,
      senderNameInput?.value,
    );
  }
  return senderNameInput?.value?.trim?.() || '';
}

function applyTelegramChatIdValue(chatId) {
  const nextChatId = chatId || '';
  if (telegramChatIdInput) {
    telegramChatIdInput.value = nextChatId;
  }
  updateSettingsFormField('telegramChatId', nextChatId);
}

function buildMessageBoundary(message) {
  if (feedState?.buildMessageBoundary) {
    return feedState.buildMessageBoundary(message);
  }
  if (!message?.filename) {
    return null;
  }
  return {
    timestamp_ms: message.timestamp_ms || 0,
    filename: message.filename,
  };
}

function syncVueSettingsOpsState() {
  if (!hasVueAppShell) {
    return;
  }
  syncVueSettingsOps(currentSettingsOpsState);
}

function buildVueWebdavEndpointState() {
  return {
    useVueList: hasVueAppShell,
    emptyMessage: '暂无 WebDAV 端点',
    endpoints: webdavEndpoints.map((endpoint) => ({
      id: endpoint.id,
      title: getEndpointLabel(endpoint),
      name: endpoint.name || '',
      url: endpoint.url || '',
      username: endpoint.username || '',
      password: endpoint.password || '',
      enabled: !!endpoint.enabled,
      isActive: endpoint.id === activeEndpointId,
      activeDisabled: !endpoint.enabled,
      speedTestDisabled: !!endpoint.speedTestRunning || !(endpoint.url || '').trim(),
      speedTestRunning: !!endpoint.speedTestRunning,
      speedTestLabel: endpoint.speedTestRunning ? '测速中...' : '测速',
      speedTestResult: endpoint.speedTestResult || null,
    })),
  };
}

function syncVueSettingsWebdavState() {
  if (!hasVueAppShell) {
    return;
  }
  syncVueSettingsWebdav(buildVueWebdavEndpointState());
}

function createMessageViewModel(message) {
  if (feedViewModel?.createMessageViewModel) {
    return feedViewModel.createMessageViewModel(message, {
      senderName: currentSettingsFormState.senderName,
      formatTime,
      formatBytes,
      isImagePath,
      hasLocalMessageFile,
      isDownloadTaskActive: (source) =>
        isDownloadTaskActive(getDownloadTask(source?.filename, activeEndpointId)),
    });
  }
  return {
    filename: message?.filename || '',
    originalName: message?.original_name || message?.filename || '',
    kind: message?.kind || 'text',
    format: message?.format || 'text',
    isFile: message?.kind === 'file',
    isText: message?.kind !== 'file',
    isMarkdown: message?.kind !== 'file' && message?.format === 'markdown',
    isImage: message?.kind === 'file' && isImagePath(message?.original_name || message?.filename),
    isSelf:
      message?.sender === '我' ||
      (!!currentSettingsFormState.senderName?.trim() &&
        message?.sender === currentSettingsFormState.senderName.trim()),
    isMarked: !!message?.marked,
    isUploading: !!message?.uploading,
    isSending: !!message?.sending,
    sendStatus: message?.sendStatus || '',
    sendError: message?.sendError || '',
    headerText: `${message?.sender || ''} · ${formatTime(message?.timestamp_ms || 0)}`,
    bodyText:
      message?.kind === 'file'
        ? (message?.original_name || message?.filename || '')
        : (message?.content || ''),
    metaText: `大小 ${formatBytes(message?.size || 0)}`,
    message,
  };
}

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
const sendTextButton = document.getElementById('send-text');
const speechToTextButton = document.getElementById('speech-to-text-toggle');
const speechToTextLabel = document.getElementById('speech-to-text-label');
const sendOptionsToggle = document.getElementById('send-options-toggle');
const sendOptionsMenu = document.getElementById('send-options-menu');
const quickCopyAfterSendInput = document.getElementById('quick-copy-after-send');
const sendFileButton = document.getElementById('send-file');
const layoutToggle = document.getElementById('layout-toggle');
const layoutToggleLabel = document.getElementById('layout-toggle-label');
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
const composerMarkDueDateInput = document.getElementById('composer-mark-due-date');
const composerMarkDueClearButton = document.getElementById('composer-mark-due-clear');
const composerMarkNewTagInput = document.getElementById('composer-mark-new-tag-input');
const composerMarkAddTagButton = document.getElementById('composer-mark-add-tag');
const feed = document.querySelector('.feed');
const feedContent = document.querySelector('#tab-home .feed-content');
const tabButtons = Array.from(document.querySelectorAll('[data-tab-target]'));
const tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));
const downloadsTabButton = document.querySelector('[data-tab-target="downloads"]');
const downloadsTabLabel = downloadsTabButton ? downloadsTabButton.querySelector('.tab-label') : null;
const downloadsTabCaption = downloadsTabButton ? downloadsTabButton.querySelector('.tab-caption') : null;
const downloadsPageTitle = document.querySelector('#tab-downloads .downloads-page-header h2');
const downloadsPageDescription = document.querySelector('#tab-downloads .downloads-page-header p');
const downloadsPageToolbar = document.querySelector('#tab-downloads .downloads-page-toolbar');
const transferListToolbar = document.querySelector('#tab-downloads .transfer-list-toolbar');

function getCurrentMessageList() {
  const vueList = document.getElementById('message-list-vue');
  if (vueList && !vueList.hidden && vueList.offsetParent !== null) {
    return vueList;
  }
  return messageList;
}

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
const saveFilenameRuleInput = document.getElementById('save-filename-rule');
const chooseDownloadDirButton = document.getElementById('choose-download-dir');
const downloadDirHint = document.getElementById('download-dir-hint');
const autoStartInput = document.getElementById('auto-start');
const autoUpdateEnabledInput = document.getElementById('auto-update-enabled');
const checkUpdateButton = document.getElementById('check-update');
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
const speechToTextEnabledInput = document.getElementById('speech-to-text-enabled');
const speechToTextApiKeyInput = document.getElementById('speech-to-text-api-key');
const speechToTextResourceIdInput = document.getElementById('speech-to-text-resource-id');
const speechToTextEndpointInput = document.getElementById('speech-to-text-endpoint');
const speechToTextMicrophoneInput = document.getElementById('speech-to-text-microphone');
const speechToTextCaptureSystemAudioInput = document.getElementById('speech-to-text-capture-system-audio');
const speechToTextSystemAudioDeviceInput = document.getElementById('speech-to-text-system-audio-device');
const speechToTextShortcutEnabledInput = document.getElementById('speech-to-text-shortcut-enabled');
const speechToTextShortcutInput = document.getElementById('speech-to-text-shortcut');
const speechToTextTaskRetentionInput = document.getElementById('speech-to-text-task-retention');
const speechToTextCueSoundEnabledInput = document.getElementById('speech-to-text-cue-sound-enabled');
const speechToTextCueSoundKindInput = document.getElementById('speech-to-text-cue-sound-kind');
const speechToTextCueSoundPreviewButton = document.getElementById('speech-to-text-cue-sound-preview');
const speechTaskHistorySummary = document.getElementById('speech-task-history-summary');
const speechTaskHistoryList = document.getElementById('speech-task-history-list');
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
const createLocalDataBackupButton = document.getElementById('create-local-data-backup');
const backupDirectoryInput = document.getElementById('backup-directory');
const backupKeepAllDaysInput = document.getElementById('backup-keep-all-days');
const backupKeepDailyDaysInput = document.getElementById('backup-keep-daily-days');
const openLogDirButton = document.getElementById('open-log-dir');
const openDataDirButton = document.getElementById('open-data-dir');
const filterMarkedButton = document.getElementById('filter-marked');
const markedTabBadge = document.getElementById('marked-tab-badge');
const markedMessageList = document.getElementById('marked-message-list');
const markedRefreshButton = document.getElementById('marked-refresh-btn');
const markedRefreshLabel = markedRefreshButton ? markedRefreshButton.querySelector('.refresh-label') : null;
const markedSearchInput = document.getElementById('marked-search-input');
const markedSearchButton = document.getElementById('marked-search-button');
const markedPendingFilterButton = document.getElementById('marked-pending-filter');
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
const markMessageDueToggle = document.getElementById('mark-message-due-toggle');
const markMessageDueDateInput = document.getElementById('mark-message-due-date');
const markMessageDueValue = document.getElementById('mark-message-due-value');
const markMessageDueValueText = document.getElementById('mark-message-due-value-text');
const markMessageDueClearButton = document.getElementById('mark-message-due-clear');
const markMessageSubtitle = document.getElementById('mark-message-subtitle');
const messagePreview = document.getElementById('message-preview');
const messagePreviewBody = document.getElementById('message-preview-body');
const messagePreviewMeta = document.getElementById('message-preview-meta');
const messagePreviewActions = document.getElementById('message-preview-actions');
const messagePreviewClose = document.querySelector('.message-preview-close');
const messagePreviewBackdrop = messagePreview ? messagePreview.querySelector('.message-preview-backdrop') : null;
const feedSearch = document.getElementById('feed-search');
const feedSearchCloseButton = document.getElementById('feed-search-close');
const feedSearchButton = document.getElementById('feed-search-button');
const searchInput = document.getElementById('search-input');
let settingsSections = [];
let activeSettingsSectionId = '';
let settingsNavUpdateQueued = false;
let hasAutoUpdateCheckedThisSession = false;
let isAutoUpdateChecking = false;
let autoUpdateCheckTimer = null;
let updateInstallDialogController = null;

const APP_UPDATE_EVENT = 'app-update-event';
const TRAY_CHECK_UPDATE_EVENT = 'tray-check-update';

function cancelPendingAutoUpdateCheck() {
  if (autoUpdateCheckTimer) {
    window.clearTimeout(autoUpdateCheckTimer);
    autoUpdateCheckTimer = null;
  }
}

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
let settingsSnapshots = [];
let settingsBackupArchives = [];
let currentSettingsFormState = {
  senderName: '',
  refreshIntervalSecs: 5,
  defaultEditorFormat: loadDefaultEditorFormat(),
  downloadDir: '',
  autoStart: false,
  autoUpdateEnabled: false,
  globalHotkeyEnabled: true,
  globalHotkey: 'alt+t',
  localHttpApiEnabled: false,
  localHttpApiBindAddress: '127.0.0.1',
  localHttpApiBindPort: 6011,
  copyAfterSend: false,
  telegramAutoStart: false,
  telegramBotToken: '',
  telegramProxyEnabled: false,
  telegramProxyUrl: 'http://127.0.0.1:7890',
  telegramChatId: '',
  telegramSenderName: '',
  telegramPollIntervalSecs: 10,
  aiEnabled: false,
  aiProviderKind: 'openai_compatible',
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  aiTemperature: 0.3,
  aiTimeoutSecs: 60,
  aiDefaultActionId: 'polish',
  aiActions: [],
  speechToTextEnabled: false,
  speechToTextApiKey: '',
  speechToTextResourceId: 'volc.seedasr.sauc.duration',
  speechToTextEndpoint: 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream',
  speechToTextMicrophoneDeviceId: '',
  speechToTextCaptureSystemAudio: false,
  speechToTextSystemAudioDeviceId: '',
  speechToTextShortcutEnabled: false,
  speechToTextShortcut: 'right-alt',
  speechToTextTaskRetentionCount: 14,
  speechToTextCueSoundEnabled: true,
  speechToTextCueSoundKind: DEFAULT_SPEECH_CUE_SOUND_KIND,
};
let currentAutoBackupStatusState = {
  enabled: false,
  intervalMinutes: 5,
  retainCount: 7,
  settingsSnapshotRetainCount: 7,
  directory: '',
  keepAllDays: 3,
  keepDailyDays: 7,
  hasActiveEndpoint: false,
  lastRunMs: null,
  lastSuccessMs: null,
  lastError: null,
  lastBackupPath: '',
};
let manualBackupDialogState = {
  open: false,
  target: 'local-data',
  title: '手动备份',
  name: '',
  note: '',
  loading: false,
};
let currentSettingsOpsState = settingsOpsRuntime?.createDefaultSettingsOpsState
  ? settingsOpsRuntime.createDefaultSettingsOpsState()
  : {
      backupLabel: '备份 WebDAV',
      backupRunning: false,
      restoreLabel: '恢复 WebDAV',
      restoreRunning: false,
    };
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
let forceScrollToBottomUntil = 0;
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
let markedMessagesTotal = 0;
let markedPendingOnly = false;
const MARKED_MESSAGES_PER_PAGE = 10;
const UNTAGGED_MARKED_TAG_FILTER_ID = '__untagged__';
let currentMarkedPageState = {
  useVueList: false,
  emptyMessage: '',
  currentPage: 1,
  totalPages: 1,
  selectionMode: false,
  selectionCount: 0,
  messages: [],
};
let telegramBridgeStatusPollTimer = null;
let currentTransferListView = 'downloads';
let downloadTasksPage = 1;
let uploadTasksPage = 1;
let downloadHistoryTotal = 0;
let uploadHistoryTotal = 0;
let currentDownloadTaskPageState = {
  summary: '',
  currentPage: 1,
  totalPages: 1,
  tasks: [],
};
let currentUploadTaskPageState = {
  summary: '',
  currentPage: 1,
  totalPages: 1,
  tasks: [],
};
const transferTaskCounts = {
  downloads: 0,
  uploads: 0,
};
const TRANSFER_TASKS_PER_PAGE = 10;
const MANUAL_REFRESH_TIMEOUT_MS = 45_000;
const DEFAULT_TELEGRAM_POLL_INTERVAL_SECS = 5;
const DEFAULT_LOCAL_HTTP_API_BIND_ADDRESS = '127.0.0.1';
const DEFAULT_LOCAL_HTTP_API_BIND_PORT = 6011;
const DEFAULT_SAVE_FILENAME_RULE = '{filename}.{file_suffix}';
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
const DEFAULT_SPEECH_TO_TEXT_RESOURCE_ID = 'volc.seedasr.sauc.duration';
const DEFAULT_SPEECH_TO_TEXT_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream';
const DEFAULT_SPEECH_TO_TEXT_SHORTCUT = 'right-alt';

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
  if (!window.editormd) {
    console.error('editormd not loaded');
    return;
  }

  mdEditor = window.editormd("markdown-editor", {
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
  // 输入框即工作区：格式切换作用于活动草稿，不切换 legacy 编辑器视图
  const cw = window.transferGenieComposer;
  if (cw && cw.isActive && cw.isActive()) {
    if (cw.setActiveDraftFormat) cw.setActiveDraftFormat(format);
    return;
  }
  if (format === 'markdown') {
    textInput.style.display = 'none';
    markdownEditorContainer.style.display = 'block';
    initMarkdownEditor();
  } else {
    textInput.style.display = 'block';
    markdownEditorContainer.style.display = 'none';
  }
}


// 分页相关状态
const PAGE_SIZE = 10;
const LOAD_MORE_TRIGGER_TOP = 50;
const LOAD_MORE_DEBOUNCE_MS = 120;
let totalMessages = 0;
let hasMoreMessages = false;
let isLoadingMore = false;
let loadMoreDebounceTimer = null;
let lastMessageListScrollTop = 0;
let oldestLoadedMessageRef = null;
let newestLoadedMessageRef = null;

function syncLoadedMessageBoundaries() {
  if (feedState?.syncLoadedMessageBoundaries) {
    const boundaries = feedState.syncLoadedMessageBoundaries(lastMessages);
    oldestLoadedMessageRef = boundaries.oldestLoadedMessageRef;
    newestLoadedMessageRef = boundaries.newestLoadedMessageRef;
    return;
  }
  oldestLoadedMessageRef = lastMessages.length > 0 ? buildMessageBoundary(lastMessages[0]) : null;
  newestLoadedMessageRef =
    lastMessages.length > 0 ? buildMessageBoundary(lastMessages[lastMessages.length - 1]) : null;
}

function resetLoadedMessagesState() {
  if (feedState?.resetLoadedMessagesState) {
    const nextState = feedState.resetLoadedMessagesState();
    lastMessages = nextState.lastMessages;
    totalMessages = nextState.totalMessages;
    hasMoreMessages = nextState.hasMoreMessages;
    oldestLoadedMessageRef = nextState.oldestLoadedMessageRef;
    newestLoadedMessageRef = nextState.newestLoadedMessageRef;
    return;
  }
  lastMessages = [];
  totalMessages = 0;
  hasMoreMessages = false;
  oldestLoadedMessageRef = null;
  newestLoadedMessageRef = null;
}

function pruneLoadedMessagesByFilenames(filenames, options = {}) {
  const result = feedState?.pruneLoadedMessagesState
    ? feedState.pruneLoadedMessagesState(
        {
          lastMessages,
          totalMessages,
          hasMoreMessages,
          oldestLoadedMessageRef,
          newestLoadedMessageRef,
        },
        filenames,
      )
    : null;
  const removedCount = result ? result.removedCount : 0;
  if (removedCount <= 0) {
    return 0;
  }
  if (result) {
    lastMessages = result.state.lastMessages;
    totalMessages = result.state.totalMessages;
    hasMoreMessages = result.state.hasMoreMessages;
    oldestLoadedMessageRef = result.state.oldestLoadedMessageRef;
    newestLoadedMessageRef = result.state.newestLoadedMessageRef;
  } else {
    totalMessages = Math.max(0, totalMessages - removedCount);
    syncLoadedMessageBoundaries();
    hasMoreMessages = totalMessages > lastMessages.length;
  }
  if (options.render !== false) {
    renderCurrentMessageView({ preserveScroll: true, scrollToBottom: false });
  }
  return removedCount;
}

function resolveDeletedFilenames(requestedFilenames, failedFilenames) {
  if (feedState?.resolveDeletedFilenames) {
    return feedState.resolveDeletedFilenames(requestedFilenames, failedFilenames);
  }
  const failed = new Set(
    (Array.isArray(failedFilenames) ? failedFilenames : [])
      .map((filename) => String(filename || '').trim())
      .filter(Boolean),
  );
  return (Array.isArray(requestedFilenames) ? requestedFilenames : [])
    .map((filename) => String(filename || '').trim())
    .filter((filename) => filename && !failed.has(filename));
}

async function refreshMessageListsAfterDelete(filenames, options = {}) {
  const deletedFilenames = (Array.isArray(filenames) ? filenames : [])
    .map((filename) => String(filename || '').trim())
    .filter(Boolean);
  if (deletedFilenames.length > 0) {
    deletedFilenames.forEach((filename) => selectedMessages.delete(filename));
    deletedFilenames.forEach((filename) => selectedMarkedMessages.delete(filename));
    pruneLoadedMessagesByFilenames(deletedFilenames, {
      render: options.render !== false,
    });
    updateSelectionBar();
    updateMarkedSelectionBar();
  }
  await Promise.all([
    loadMessages({ checkNew: true, scrollToBottom: false }),
    loadMarkedMessages(),
  ]);
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

function todayDateString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function normalizeMarkedDueDate(value) {
  const normalized = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function isMarkedMessagePending(message) {
  if (!message?.marked) return false;
  const dueDate = normalizeMarkedDueDate(message.marked_due_date);
  return !dueDate || dueDate <= todayDateString();
}

function formatMarkedDueDateText(value) {
  const dueDate = normalizeMarkedDueDate(value);
  return dueDate ? `处理 ${dueDate}` : '';
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

function formatPercent(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0%';
  }
  if (value >= 100) {
    return '100%';
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function formatUpdateDate(value) {
  if (!value) {
    return '未知';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN');
}

function buildUpdateMessage(updateResult) {
  const update = updateResult?.update || {};
  const lines = [
    `当前版本：${update.currentVersion || updateResult?.currentVersion || '未知'}`,
    `最新版本：${update.version || '未知'}`,
    `发布时间：${formatUpdateDate(update.pubDate)}`,
  ];
  const notes = (update.notes || '').trim();
  if (notes) {
    lines.push('', `更新说明：\n${notes}`);
  } else {
    lines.push('', '更新说明：暂无');
  }
  return lines.join('\n');
}

function closeUpdateInstallProgressDialog() {
  if (!updateInstallDialogController) {
    return;
  }
  updateInstallDialogController.close();
  updateInstallDialogController = null;
}

function showUpdateInstallProgressDialog() {
  closeUpdateInstallProgressDialog();

  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'dialog';

  const title = document.createElement('h3');
  title.className = 'dialog-title';
  title.textContent = '正在安装更新';

  const message = document.createElement('p');
  message.className = 'dialog-text';
  message.style.whiteSpace = 'pre-wrap';
  message.textContent = '准备更新...';

  dialog.appendChild(title);
  dialog.appendChild(message);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  updateInstallDialogController = {
    setMessage(text) {
      message.textContent = text || '准备更新...';
    },
    close() {
      overlay.remove();
    },
  };

  return updateInstallDialogController;
}

function updateInstallProgressMessage(payload = {}) {
  if (!updateInstallDialogController) {
    return;
  }
  const stage = payload.stage || '';
  if (stage === 'download_started') {
    const total = payload.contentLength ? formatBytes(payload.contentLength) : '未知大小';
    updateInstallDialogController.setMessage(`开始下载更新...\n总大小：${total}`);
    return;
  }
  if (stage === 'download_progress') {
    const downloaded = Number(payload.downloadedBytes || 0);
    const total = Number(payload.contentLength || 0);
    const progress = total > 0 ? formatPercent((downloaded / total) * 100) : '下载中';
    const totalText = total > 0 ? formatBytes(total) : '未知大小';
    updateInstallDialogController.setMessage(
      `正在下载更新...\n已下载：${formatBytes(downloaded)} / ${totalText}\n进度：${progress}`,
    );
    return;
  }
  if (stage === 'download_finished') {
    updateInstallDialogController.setMessage('下载完成，正在安装更新...');
    return;
  }
  if (stage === 'installed') {
    updateInstallDialogController.setMessage('更新已安装完成。');
    return;
  }
  if (stage === 'failed') {
    updateInstallDialogController.setMessage(payload.message || '安装更新失败');
  }
}

function normalizeSendHotkey(value) {
  const normalized = (value || '').toLowerCase().trim();
  if (normalized === SEND_HOTKEY.CTRL_ENTER || normalized === 'ctrl+enter') {
    return SEND_HOTKEY.CTRL_ENTER;
  }
  return SEND_HOTKEY.ENTER;
}

function sendHotkeyLabel() {
  return sendHotkey === SEND_HOTKEY.CTRL_ENTER ? 'Ctrl+Enter' : 'Enter';
}

function updateComposerHint() {
  if (!textInput) return;
  if (sendHotkey === SEND_HOTKEY.CTRL_ENTER) {
    textInput.placeholder = '输入消息...（Enter 换行，Ctrl+Enter 发送）';
  } else {
    textInput.placeholder = '输入消息...（Enter 发送，Ctrl+Enter 换行）';
  }
  if (sendTextButton) {
    sendTextButton.title = `发送（${sendHotkeyLabel()}）`;
  }
}

function setSendHotkey(value) {
  sendHotkey = normalizeSendHotkey(value);
  window.transferGenieSendHotkey = sendHotkey;
  window.dispatchEvent(new CustomEvent('transfer-genie:send-hotkey-change', { detail: { sendHotkey } }));
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
  const nextEnabled = !!enabled;
  isComposerFullscreen = nextEnabled;
  document.documentElement.classList.toggle('composer-fullscreen-active', nextEnabled);
  document.body.classList.toggle('composer-fullscreen-active', nextEnabled);
  if (composerFullscreenToggle) {
    const label = nextEnabled ? LABEL_EXIT_FULLSCREEN : LABEL_EXPAND_COMPOSER;
    composerFullscreenToggle.title = label;
    composerFullscreenToggle.setAttribute('aria-label', label);
    if (composerFullscreenIcon) {
      composerFullscreenIcon.src = nextEnabled ? ICON_EXIT : ICON_EXPAND;
    }
  }
  if (mdEditor && typeof mdEditor.resize === 'function') {
    mdEditor.resize('100%', nextEnabled ? '100%' : MARKDOWN_EDITOR_DEFAULT_HEIGHT);
  }
  window.dispatchEvent(new CustomEvent('transfer-genie:composer-fullscreen-change', { detail: { enabled: nextEnabled } }));
  if (nextEnabled) {
    setTimeout(() => {
      if (currentFormat === 'markdown' && mdEditor) {
        mdEditor.focus();
      } else if (textInput) {
        textInput.focus();
      }
    }, 0);
  }
}

function setComposerVisible(visible, options = {}) {
  const nextVisible = visible !== false;
  if (!nextVisible) {
    setComposerFullscreen(false);
  }
  document.documentElement.classList.toggle('composer-hidden-active', !nextVisible);
  document.body.classList.toggle('composer-hidden-active', !nextVisible);
  if (layoutToggle) {
    const label = nextVisible ? '隐藏编辑' : '显示编辑';
    const shortLabel = label;
    layoutToggle.classList.toggle('is-hidden', !nextVisible);
    layoutToggle.title = label;
    layoutToggle.setAttribute('aria-label', label);
    layoutToggle.setAttribute('aria-pressed', nextVisible ? 'false' : 'true');
    if (layoutToggleLabel) {
      layoutToggleLabel.textContent = shortLabel;
    }
  }
  if (options.persist !== false) {
    saveHomeLayoutState({ composerVisible: nextVisible });
  }
  window.requestAnimationFrame(() => {
    syncComposerOffset();
    window.dispatchEvent(new CustomEvent('transfer-genie:composer-visibility-change', { detail: { visible: nextVisible } }));
  });
}

function applyHomeLayoutState() {
  const state = loadHomeLayoutState();
  setComposerVisible(state.composerVisible, { persist: false });
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

function getComposerMarkDueDate() {
  return normalizeMarkedDueDate(composerMarkDueDateInput?.value);
}

function hasActiveComposerMarkDetails() {
  const selectedCount = getComposerDraftTags().filter(
    (tag) => !tag.pendingDelete && composerSelectedTagIds.has(tag.id),
  ).length;
  return selectedCount > 0 || !!getComposerMarkDueDate();
}

function syncComposerMarkDueState() {
  const dueDate = getComposerMarkDueDate();
  composerMarkDueDateInput?.classList.toggle('has-value', !!dueDate);
  if (composerMarkDueClearButton) {
    composerMarkDueClearButton.hidden = !dueDate;
  }
}

function syncComposerMarkToggleState() {
  if (!composerMarkToggle) return;
  syncComposerMarkDueState();
  composerMarkToggle.classList.toggle('is-marked', composerMarkEnabled);
  composerMarkToggle.setAttribute('aria-pressed', composerMarkEnabled ? 'true' : 'false');
  composerMarkToggle.title = composerMarkEnabled ? '取消标记' : '标记';
  composerMarkToggle.setAttribute('aria-label', composerMarkEnabled ? '取消标记' : '标记');
  if (composerMarkSummary) {
    const selectedCount = getComposerDraftTags().filter(
      (tag) => !tag.pendingDelete && composerSelectedTagIds.has(tag.id),
    ).length;
    const dueDate = getComposerMarkDueDate();
    const summaryParts = [];
    if (selectedCount > 0) {
      summaryParts.push(`${selectedCount} 个标签`);
    }
    if (dueDate) {
      summaryParts.push(dueDate);
    }
    composerMarkSummary.textContent = composerMarkEnabled
      ? summaryParts.length > 0
        ? `已标记 · ${summaryParts.join(' · ')}`
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
  if (composerMarkDueDateInput) {
    composerMarkDueDateInput.value = '';
  }
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
  if (composerMarkDueDateInput) {
    composerMarkDueDateInput.value = '';
  }
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
  const dueDate = getComposerMarkDueDate();
  const marked = composerMarkEnabled;
  return {
    marked,
    dueDate: marked ? dueDate || null : null,
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
    dueDate: normalizeMarkedDueDate(options?.dueDate) || null,
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

function normalizeSpeechHotkey(value) {
  const normalized = String(value || '').toLowerCase().trim().replace(/\s+/g, '');
  if (['rightalt', 'right-alt', 'alt-right', 'altright', 'right_alt'].includes(normalized)) return 'right-alt';
  if (['leftalt', 'left-alt', 'alt-left', 'altleft', 'left_alt'].includes(normalized)) return 'left-alt';
  return normalizeGlobalHotkey(value);
}

function isSideAltSpeechHotkey(value) {
  return ['right-alt', 'left-alt'].includes(normalizeSpeechHotkey(value));
}

let activeSideAltSpeechKey = '';

function getSpeechSideAltEventCode() {
  if (!currentSettingsFormState.speechToTextShortcutEnabled) return '';
  const shortcut = normalizeSpeechHotkey(currentSettingsFormState.speechToTextShortcut || DEFAULT_SPEECH_TO_TEXT_SHORTCUT);
  if (shortcut === 'right-alt') return 'AltRight';
  if (shortcut === 'left-alt') return 'AltLeft';
  return '';
}

function isSpeechSideAltEvent(event, targetCode) {
  if (!targetCode || event.code === targetCode) return !!targetCode;
  if (targetCode === 'AltRight') {
    return event.key === 'AltGraph' || (event.key === 'Alt' && event.altKey && event.ctrlKey);
  }
  return false;
}

function handleSpeechSideAltKeydown(event) {
  const targetCode = getSpeechSideAltEventCode();
  if (!isSpeechSideAltEvent(event, targetCode) || event.repeat || activeSideAltSpeechKey === targetCode) return;
  activeSideAltSpeechKey = targetCode;
  event.preventDefault();
  toggleSpeechRecording();
}

function handleSpeechSideAltKeyup(event) {
  if (isSpeechSideAltEvent(event, activeSideAltSpeechKey)) {
    activeSideAltSpeechKey = '';
  }
}

let speechStream = null;
let speechSystemAudioStream = null;
let speechAudioContext = null;
let speechCueAudioContext = null;
let speechSourceNode = null;
let speechSystemAudioSourceNode = null;
let speechMixDestinationNode = null;
let speechProcessorNode = null;
let speechSilentGainNode = null;
let speechCapturedSegments = [];
let speechPendingAsrSamples = [];
let speechPendingAsrSampleCount = 0;
let speechLiveTranscriptionChain = Promise.resolve();
let speechLiveTranscriptionTexts = [];
let speechLiveTranscriptionError = null;
let speechLiveTranscriptionChunkCount = 0;
let speechLiveTranscriptionStarted = false;
let speechLiveTranscriptionGeneration = 0;
let speechLiveTaskId = '';
let speechCaptureSampleRate = 16000;
let speechState = 'idle';
let speechLastLevel = 0;
let speechSessionId = 0;

function setSpeechLevel(level) {
  const normalized = Math.max(0, Math.min(1, Number(level) || 0));
  speechLastLevel = (speechLastLevel * 0.45) + (normalized * 0.55);
  const speechMotion = speechLastLevel < 0.04 ? 0 : Math.min(1, (speechLastLevel - 0.04) / 0.96);
  const button = document.getElementById('speech-to-text-toggle');
  if (!button) return;
  button.style.setProperty('--speech-level', speechLastLevel.toFixed(3));
  button.style.setProperty('--speech-motion', speechMotion.toFixed(3));
  button.style.setProperty('--speech-bar-1', (0.04 + speechLastLevel * 0.78).toFixed(3));
  button.style.setProperty('--speech-bar-2', (0.08 + speechLastLevel * 0.92).toFixed(3));
  button.style.setProperty('--speech-bar-3', (0.03 + speechLastLevel * 0.74).toFixed(3));
  button.style.setProperty('--speech-wave-from-1', (1 - 0.24 * speechMotion).toFixed(3));
  button.style.setProperty('--speech-wave-to-1', (1 + 0.36 * speechMotion).toFixed(3));
  button.style.setProperty('--speech-wave-from-2', (1 - 0.18 * speechMotion).toFixed(3));
  button.style.setProperty('--speech-wave-to-2', (1 + 0.44 * speechMotion).toFixed(3));
  button.style.setProperty('--speech-wave-from-3', (1 - 0.22 * speechMotion).toFixed(3));
  button.style.setProperty('--speech-wave-to-3', (1 + 0.32 * speechMotion).toFixed(3));
}

function syncSpeechButtonState() {
  const button = document.getElementById('speech-to-text-toggle');
  const label = document.getElementById('speech-to-text-label');
  if (!button) return;
  button.classList.toggle('is-preparing', speechState === 'preparing');
  button.classList.toggle('is-recording', speechState === 'recording');
  button.classList.toggle('is-transcribing', speechState === 'transcribing');
  button.disabled = speechState === 'transcribing';
  button.setAttribute('aria-pressed', speechState === 'recording' ? 'true' : 'false');
  if (label) {
    label.textContent = speechState === 'preparing'
      ? '准备中'
      : speechState === 'recording'
      ? '结束'
      : speechState === 'transcribing'
        ? '识别中'
        : '语音';
  }
  if (speechState === 'idle') setSpeechLevel(0);
}

function isCurrentSpeechSession(sessionId) {
  return sessionId === speechSessionId;
}

function closeSpeechStream(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => track.stop());
  } catch (error) { /* ignore */ }
}

function closeSpeechAudioContext(context) {
  if (!context?.close) return;
  try {
    void context.close().catch(() => {});
  } catch (error) { /* ignore */ }
}

function waitSpeechRetryDelay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildSpeechAudioConstraints(deviceId, options = {}) {
  const processed = options.processed !== false;
  return {
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      ...(processed ? { channelCount: 1 } : {}),
      echoCancellation: processed,
      noiseSuppression: processed,
      autoGainControl: processed,
    },
  };
}

async function openSpeechSystemAudioInput() {
  if (!currentSettingsFormState.speechToTextCaptureSystemAudio) return null;
  const deviceId = String(currentSettingsFormState.speechToTextSystemAudioDeviceId || '').trim();
  if (!deviceId) {
    showToast('请先在设置中选择电脑内部声音设备，例如 BlackHole 或 Loopback', 'warning');
    return null;
  }
  try {
    return await navigator.mediaDevices.getUserMedia(buildSpeechAudioConstraints(deviceId, { processed: false }));
  } catch (error) {
    showToast(`电脑内部声音设备打开失败，已继续录制麦克风：${describeSpeechMicError(error)}`, 'warning');
    return null;
  }
}

function readSpeechInputSamples(inputBuffer) {
  const channelCount = Math.max(1, Number(inputBuffer?.numberOfChannels || 1));
  const firstChannel = inputBuffer.getChannelData(0);
  if (channelCount === 1) return firstChannel;
  const mixed = new Float32Array(firstChannel.length);
  for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
    const channel = inputBuffer.getChannelData(channelIndex);
    for (let sampleIndex = 0; sampleIndex < channel.length; sampleIndex += 1) {
      mixed[sampleIndex] += channel[sampleIndex] / channelCount;
    }
  }
  return mixed;
}

function connectSpeechInputSources(audioContext, micStream, systemAudioStream) {
  speechSourceNode = audioContext.createMediaStreamSource(micStream);
  if (systemAudioStream) {
    speechMixDestinationNode = audioContext.createMediaStreamDestination();
    speechSourceNode.connect(speechMixDestinationNode);
    speechSystemAudioSourceNode = audioContext.createMediaStreamSource(systemAudioStream);
    speechSystemAudioSourceNode.connect(speechMixDestinationNode);
    const mixedSourceNode = audioContext.createMediaStreamSource(speechMixDestinationNode.stream);
    speechSourceNode = mixedSourceNode;
  }
  speechSourceNode.connect(speechProcessorNode);
}

function isRecoverableSpeechMicError(error) {
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();
  if (name.includes('notallowed') || name.includes('security') || message.includes('permission')) return false;
  if (name.includes('notfound') || name.includes('devicesnotfound')) return false;
  return true;
}

function describeSpeechMicError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || error || '未知错误');
  if (name === 'NotAllowedError' || message.toLowerCase().includes('permission')) return '麦克风权限被拒绝；macOS 上请在系统设置 > 隐私与安全性 > 麦克风中允许 Transfer Genie，必要时执行 tccutil reset Microphone com.transfergenie 后重试';
  if (name === 'SecurityError') return '麦克风权限不可用，请确认 macOS 打包包含 NSMicrophoneUsageDescription 和 com.apple.security.device.audio-input 权限声明';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return '未找到可用麦克风，请检查输入设备连接';
  if (name === 'NotReadableError' || name === 'TrackStartError') return '麦克风被其他应用占用或暂时不可用，请稍后重试';
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') return '指定麦克风不可用，已尝试切换到系统默认麦克风';
  return message;
}

function describeSpeechRecordingUnsupported() {
  const hasMediaDevices = !!navigator.mediaDevices;
  const hasGetUserMedia = !!navigator.mediaDevices?.getUserMedia;
  const hasAudioContext = !!(window.AudioContext || window.webkitAudioContext);
  if (!hasMediaDevices || !hasGetUserMedia) {
    return '当前环境没有暴露麦克风 API；macOS 上请确认应用已包含麦克风权限声明，并在系统设置中允许 Transfer Genie 使用麦克风';
  }
  if (!hasAudioContext) {
    return '当前环境缺少音频处理能力 AudioContext，无法录制麦克风音频';
  }
  return '当前环境不支持麦克风录音';
}

function normalizeSpeechCueSoundKind(value) {
  return ['system', 'soft', 'none'].includes(String(value || '').trim())
    ? String(value || '').trim()
    : DEFAULT_SPEECH_CUE_SOUND_KIND;
}

function syncSpeechCueSoundControls() {
  const enabled = currentSettingsFormState.speechToTextCueSoundEnabled !== false;
  if (speechToTextCueSoundEnabledInput) speechToTextCueSoundEnabledInput.checked = enabled;
  if (speechToTextCueSoundKindInput) {
    speechToTextCueSoundKindInput.value = normalizeSpeechCueSoundKind(currentSettingsFormState.speechToTextCueSoundKind);
    speechToTextCueSoundKindInput.disabled = !enabled;
  }
  if (speechToTextCueSoundPreviewButton) {
    speechToTextCueSoundPreviewButton.disabled = !enabled;
  }
}

async function getSpeechCueAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!speechCueAudioContext || speechCueAudioContext.state === 'closed') {
    speechCueAudioContext = new AudioContextClass();
  }
  if (speechCueAudioContext.state === 'suspended' && speechCueAudioContext.resume) {
    await speechCueAudioContext.resume();
  }
  return speechCueAudioContext;
}

async function playSpeechCueSound(phase, options = {}) {
  const enabled = options.enabled ?? currentSettingsFormState.speechToTextCueSoundEnabled;
  if (enabled === false) return;
  const kind = normalizeSpeechCueSoundKind(options.kind ?? currentSettingsFormState.speechToTextCueSoundKind);
  if (kind === 'none') return;
  try {
    const context = await getSpeechCueAudioContext();
    if (!context || context.state === 'suspended') return;
    const now = context.currentTime || 0;
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    const isStop = phase === 'stop';
    const profile = kind === 'soft'
      ? { start: 660, stop: 440, volume: 0.14, duration: 0.14, type: 'sine' }
      : { start: 880, stop: 520, volume: 0.18, duration: 0.12, type: 'triangle' };
    oscillator.type = profile.type;
    oscillator.frequency.setValueAtTime(isStop ? profile.stop : profile.start, now);
    if (oscillator.frequency.exponentialRampToValueAtTime) {
      oscillator.frequency.exponentialRampToValueAtTime(isStop ? profile.stop * 0.8 : profile.start * 1.18, now + profile.duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(profile.volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + profile.duration + 0.02);
    oscillator.onended = () => {
      try { oscillator.disconnect(); } catch (error) { /* ignore */ }
      try { gain.disconnect(); } catch (error) { /* ignore */ }
    };
  } catch (error) {
    // Audio cues are non-critical; recording should continue if playback is blocked.
  }
}

function previewSpeechCueSound() {
  const enabled = speechToTextCueSoundEnabledInput
    ? !!speechToTextCueSoundEnabledInput.checked
    : currentSettingsFormState.speechToTextCueSoundEnabled !== false;
  const kind = normalizeSpeechCueSoundKind(
    speechToTextCueSoundKindInput?.value || currentSettingsFormState.speechToTextCueSoundKind || DEFAULT_SPEECH_CUE_SOUND_KIND,
  );
  void playSpeechCueSound('start', { enabled, kind });
}

function setSpeechState(state) {
  speechState = state || 'idle';
  syncSpeechButtonState();
}

function encodeSpeechWav(samples, sampleRate) {
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const writeString = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] || 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

function mergeSpeechSamples(chunks) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Float32Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function downsampleSpeechSamples(samples, sourceRate, targetSampleRate) {
  const sourceLength = samples.length || 0;
  if (!sourceLength) return new Float32Array();
  if (!sourceRate || sourceRate === targetSampleRate) return samples;
  const targetLength = Math.max(1, Math.round(sourceLength * targetSampleRate / sourceRate));
  const output = new Float32Array(targetLength);
  for (let index = 0; index < targetLength; index += 1) {
    const sourceIndex = Math.min(sourceLength - 1, Math.floor(index * sourceRate / targetSampleRate));
    output[index] = samples[sourceIndex] || 0;
  }
  return output;
}

function buildCapturedSpeechWav(segments = speechCapturedSegments) {
  const targetSampleRate = 16000;
  const samples = mergeSpeechSamples(segments);
  return {
    bytes: encodeSpeechWav(samples, targetSampleRate),
    sampleRate: targetSampleRate,
    channels: 1,
    bitsPerSample: 16,
    durationMs: Math.round((samples.length / targetSampleRate) * 1000),
    mimeType: 'audio/wav',
    format: 'wav',
  };
}

const SPEECH_ASR_CHUNK_DURATION_MS = 20 * 1000;

function getSpeechAsrChunkDurationMs() {
  const testValue = Number(window.__speechSmoke?.chunkDurationMs || 0);
  if (testValue > 0) return Math.max(100, testValue);
  return SPEECH_ASR_CHUNK_DURATION_MS;
}

function buildSpeechWavFromSamples(samples, sampleRate) {
  return {
    bytes: encodeSpeechWav(samples, sampleRate),
    sampleRate,
    channels: 1,
    bitsPerSample: 16,
    durationMs: Math.round((samples.length / sampleRate) * 1000),
    mimeType: 'audio/wav',
    format: 'wav',
  };
}

function resetLiveSpeechTranscription() {
  speechLiveTranscriptionGeneration += 1;
  speechPendingAsrSamples = [];
  speechPendingAsrSampleCount = 0;
  speechLiveTranscriptionChain = Promise.resolve();
  speechLiveTranscriptionTexts = [];
  speechLiveTranscriptionError = null;
  speechLiveTranscriptionChunkCount = 0;
  speechLiveTranscriptionStarted = false;
  speechLiveTaskId = '';
}

function takeSpeechPendingSamples(sampleCount) {
  let remaining = sampleCount;
  const taken = [];
  while (remaining > 0 && speechPendingAsrSamples.length) {
    const chunk = speechPendingAsrSamples[0];
    if (chunk.length <= remaining) {
      taken.push(chunk);
      speechPendingAsrSamples.shift();
      remaining -= chunk.length;
      continue;
    }
    taken.push(chunk.slice(0, remaining));
    speechPendingAsrSamples[0] = chunk.slice(remaining);
    remaining = 0;
  }
  speechPendingAsrSampleCount = Math.max(0, speechPendingAsrSampleCount - sampleCount + remaining);
  return mergeSpeechSamples(taken);
}

function enqueueLiveSpeechTranscription(samples, sampleRate) {
  if (!samples?.length || speechLiveTranscriptionError) return;
  const audio = buildSpeechWavFromSamples(samples, sampleRate);
  speechLiveTranscriptionChunkCount += 1;
  speechLiveTranscriptionStarted = true;
  const chunkNumber = speechLiveTranscriptionChunkCount;
  const generation = speechLiveTranscriptionGeneration;
  speechLiveTranscriptionChain = speechLiveTranscriptionChain.then(async () => {
    if (generation !== speechLiveTranscriptionGeneration) return;
    setStatus(`正在识别语音 ${chunkNumber}...`);
    const result = await transcribeSpeechAudioAllowBlank(audio);
    if (generation !== speechLiveTranscriptionGeneration) return;
    if (result?.text) {
      const text = String(result.text);
      speechLiveTranscriptionTexts.push(text);
      appendTextAfterSpeechChunk(text);
      reportSpeechTiming(result.timing, `chunk ${chunkNumber}`);
      if (speechLiveTaskId) {
        void updateSpeechTask(speechLiveTaskId, {
          text: speechLiveTranscriptionTexts.join('\n').trim(),
          chunkCount: speechLiveTranscriptionChunkCount,
        });
      }
      void copySpeechTranscriptToClipboard(speechLiveTranscriptionTexts.join('\n'));
    }
  }).catch((error) => {
    if (generation === speechLiveTranscriptionGeneration) {
      speechLiveTranscriptionError = error;
    }
  });
}

function appendLiveSpeechSamples(input, sampleRate = speechCaptureSampleRate) {
  if (!input?.length || speechLiveTranscriptionError) return;
  const targetSampleRate = 16000;
  const samples = downsampleSpeechSamples(input, sampleRate, targetSampleRate);
  if (!samples.length) return;
  speechPendingAsrSamples.push(samples);
  speechPendingAsrSampleCount += samples.length;
  const chunkSampleCount = Math.max(1, Math.floor(targetSampleRate * getSpeechAsrChunkDurationMs() / 1000));
  while (speechPendingAsrSampleCount >= chunkSampleCount) {
    enqueueLiveSpeechTranscription(takeSpeechPendingSamples(chunkSampleCount), targetSampleRate);
  }
}

async function finishLiveSpeechTranscription() {
  if (speechPendingAsrSampleCount > 0) {
    enqueueLiveSpeechTranscription(takeSpeechPendingSamples(speechPendingAsrSampleCount), 16000);
  }
  const generation = speechLiveTranscriptionGeneration;
  await speechLiveTranscriptionChain;
  if (generation !== speechLiveTranscriptionGeneration) throw new Error('语音录制已取消');
  if (speechLiveTranscriptionError) throw speechLiveTranscriptionError;
  const text = speechLiveTranscriptionTexts.join('\n').trim();
  return { text, logId: null, chunkCount: speechLiveTranscriptionChunkCount || 1 };
}

function decodeSpeechWavPcm16(audio) {
  const bytes = audio?.bytes instanceof Uint8Array ? audio.bytes : new Uint8Array(audio?.bytes || []);
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readString = (offset, length) => String.fromCharCode(...bytes.slice(offset, offset + length));
  if (readString(0, 4) !== 'RIFF' || readString(8, 4) !== 'WAVE') return null;
  let offset = 12;
  let format = null;
  let dataOffset = 0;
  let dataLength = 0;
  while (offset + 8 <= bytes.length) {
    const chunkId = readString(offset, 4);
    const chunkLength = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    if (chunkId === 'fmt ' && chunkLength >= 16) {
      format = {
        audioFormat: view.getUint16(chunkDataOffset, true),
        channels: view.getUint16(chunkDataOffset + 2, true),
        sampleRate: view.getUint32(chunkDataOffset + 4, true),
        bitsPerSample: view.getUint16(chunkDataOffset + 14, true),
      };
    } else if (chunkId === 'data') {
      dataOffset = chunkDataOffset;
      dataLength = Math.min(chunkLength, bytes.length - chunkDataOffset);
      break;
    }
    offset = chunkDataOffset + chunkLength + (chunkLength % 2);
  }
  if (!format || !dataOffset || format.audioFormat !== 1 || format.channels !== 1 || format.bitsPerSample !== 16) {
    return null;
  }
  const sampleCount = Math.floor(dataLength / 2);
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(dataOffset + index * 2, true) / 0x8000;
  }
  return { samples, sampleRate: format.sampleRate };
}

function splitSpeechAudioForAsr(audio) {
  const decoded = decodeSpeechWavPcm16(audio);
  if (!decoded?.samples?.length) return [audio];
  const chunkSampleCount = Math.max(
    decoded.sampleRate,
    Math.floor(decoded.sampleRate * getSpeechAsrChunkDurationMs() / 1000),
  );
  if (decoded.samples.length <= chunkSampleCount) return [audio];
  const chunks = [];
  for (let start = 0; start < decoded.samples.length; start += chunkSampleCount) {
    chunks.push(buildSpeechWavFromSamples(decoded.samples.slice(start, start + chunkSampleCount), decoded.sampleRate));
  }
  return chunks;
}

const SPEECH_TASK_DB_NAME = 'transfer-genie-speech-tasks';
const SPEECH_TASK_STORE_NAME = 'tasks';
let speechTaskDbPromise = null;
let speechTaskAudioUrl = '';

function getSpeechTaskRetentionCount() {
  return Math.max(1, Math.min(100, Number(currentSettingsFormState.speechToTextTaskRetentionCount) || 14));
}

function openSpeechTaskDb() {
  if (!window.indexedDB) return Promise.resolve(null);
  if (speechTaskDbPromise) return speechTaskDbPromise;
  speechTaskDbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(SPEECH_TASK_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SPEECH_TASK_STORE_NAME)) {
        db.createObjectStore(SPEECH_TASK_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('打开转录任务存储失败'));
  });
  return speechTaskDbPromise;
}

function runSpeechTaskStore(mode, handler) {
  return openSpeechTaskDb().then((db) => new Promise((resolve, reject) => {
    if (!db) {
      resolve(handler(null));
      return;
    }
    const transaction = db.transaction(SPEECH_TASK_STORE_NAME, mode);
    const store = transaction.objectStore(SPEECH_TASK_STORE_NAME);
    let value;
    try {
      value = handler(store);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error || new Error('访问转录任务存储失败'));
  }));
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('读取转录任务失败'));
  });
}

async function listSpeechTasks() {
  const db = await openSpeechTaskDb();
  if (!db) return [];
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SPEECH_TASK_STORE_NAME, 'readonly');
    const store = transaction.objectStore(SPEECH_TASK_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const tasks = Array.isArray(request.result) ? request.result : [];
      resolve(tasks.sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0)));
    };
    request.onerror = () => reject(request.error || new Error('读取转录任务失败'));
  });
}

async function getSpeechTask(id) {
  const db = await openSpeechTaskDb();
  if (!db) return null;
  const transaction = db.transaction(SPEECH_TASK_STORE_NAME, 'readonly');
  return requestToPromise(transaction.objectStore(SPEECH_TASK_STORE_NAME).get(id));
}

async function putSpeechTask(task) {
  try {
    await runSpeechTaskStore('readwrite', (store) => store?.put(task));
    await pruneSpeechTasks();
    await renderSpeechTaskHistory();
  } catch (error) {
    console.warn('保存转录任务失败', error);
  }
}

async function updateSpeechTask(id, patch) {
  try {
    const task = await getSpeechTask(id);
    if (!task) return null;
    const nextTask = { ...task, ...patch, updatedAtMs: Date.now() };
    await runSpeechTaskStore('readwrite', (store) => store?.put(nextTask));
    await renderSpeechTaskHistory();
    return nextTask;
  } catch (error) {
    console.warn('更新转录任务失败', error);
    return null;
  }
}

async function removeSpeechTask(id) {
  try {
    await runSpeechTaskStore('readwrite', (store) => store?.delete(id));
    await renderSpeechTaskHistory();
    showToast('转录任务已删除', 'success');
  } catch (error) {
    showToast(`删除转录任务失败：${error}`, 'error');
  }
}

async function pruneSpeechTasks() {
  const tasks = await listSpeechTasks();
  const keepCount = getSpeechTaskRetentionCount();
  const expired = tasks.slice(keepCount);
  if (!expired.length) return;
  await runSpeechTaskStore('readwrite', (store) => {
    expired.forEach((task) => store?.delete(task.id));
  });
}

function formatSpeechTaskTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function formatSpeechTaskDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.round(Number(durationMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function speechTaskStatusText(status) {
  if (status === 'success') return '成功';
  if (status === 'failed') return '失败';
  if (status === 'transcribing') return '识别中';
  return '待识别';
}

function getSpeechTaskPreviewText(value) {
  const text = String(value || '');
  const maxLength = 80;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function buildSpeechTaskRequest(audio) {
  return {
    audioData: Array.from(audio.bytes || []),
    mimeType: audio.mimeType,
    format: audio.format,
    sampleRate: audio.sampleRate,
    channels: audio.channels,
    bitsPerSample: audio.bitsPerSample,
  };
}

async function transcribeSpeechAudio(audio) {
  return invoke('transcribe_speech', { request: buildSpeechTaskRequest(audio) });
}

function formatSpeechTimingMs(value) {
  const ms = Math.max(0, Math.round(Number(value) || 0));
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)}s`;
  return `${ms}ms`;
}

function formatSpeechTimingBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${Math.round(bytes)}B`;
}

function summarizeSpeechTiming(timing) {
  if (!timing) return '';
  return `语音耗时：总 ${formatSpeechTimingMs(timing.totalMs)}，连接 ${formatSpeechTimingMs(timing.connectMs)}，上传 ${formatSpeechTimingMs((timing.sendConfigMs || 0) + (timing.sendAudioMs || 0))}，等待 ${formatSpeechTimingMs(timing.waitResultMs)}，音频 ${formatSpeechTimingBytes(timing.audioBytes)}`;
}

function mergeSpeechTimings(timings) {
  const values = (timings || []).filter(Boolean);
  if (!values.length) return null;
  return values.reduce((merged, timing) => ({
    totalMs: merged.totalMs + (Number(timing.totalMs) || 0),
    connectMs: merged.connectMs + (Number(timing.connectMs) || 0),
    sendConfigMs: merged.sendConfigMs + (Number(timing.sendConfigMs) || 0),
    sendAudioMs: merged.sendAudioMs + (Number(timing.sendAudioMs) || 0),
    waitResultMs: merged.waitResultMs + (Number(timing.waitResultMs) || 0),
    audioBytes: merged.audioBytes + (Number(timing.audioBytes) || 0),
  }), { totalMs: 0, connectMs: 0, sendConfigMs: 0, sendAudioMs: 0, waitResultMs: 0, audioBytes: 0 });
}

function reportSpeechTiming(timing, context = '') {
  const summary = summarizeSpeechTiming(timing);
  if (!summary) return;
  console.info(`[speech-to-text]${context ? ` ${context}` : ''} ${summary}`, timing);
  setStatus(summary);
}

function summarizeSpeechLocalTiming(timing) {
  if (!timing) return '';
  return `本地耗时：总 ${formatSpeechTimingMs(timing.totalMs)}，停止 ${formatSpeechTimingMs(timing.stopMs)}，构建音频 ${formatSpeechTimingMs(timing.buildAudioMs)}，存任务 ${formatSpeechTimingMs(timing.saveTaskMs)}，调用ASR ${formatSpeechTimingMs(timing.transcribeMs)}，更新任务 ${formatSpeechTimingMs(timing.updateTaskMs)}，写入 ${formatSpeechTimingMs(timing.insertMs)}，复制 ${formatSpeechTimingMs(timing.copyMs)}`;
}

function reportSpeechLocalTiming(timing, asrTiming, context = '') {
  const localSummary = summarizeSpeechLocalTiming(timing);
  if (!localSummary) return;
  const asrSummary = summarizeSpeechTiming(asrTiming);
  console.info(`[speech-to-text]${context ? ` ${context}` : ''} ${localSummary}`, timing);
  setStatus(asrSummary ? `${localSummary}；${asrSummary}` : localSummary);
}

function saveSpeechTaskInBackground(task, label = '保存任务') {
  const startedAt = performance.now();
  void putSpeechTask(task).then(() => {
    console.info(`[speech-to-text] history ${label} ${formatSpeechTimingMs(performance.now() - startedAt)}`);
  }).catch((error) => {
    console.warn(`[speech-to-text] history ${label} 失败`, error);
  });
}

function updateSpeechTaskInBackground(id, patch, label = '更新任务') {
  const startedAt = performance.now();
  void updateSpeechTask(id, patch).then(() => {
    console.info(`[speech-to-text] history ${label} ${formatSpeechTimingMs(performance.now() - startedAt)}`);
  }).catch((error) => {
    console.warn(`[speech-to-text] history ${label} 失败`, error);
  });
}

function copySpeechTranscriptInBackground(text) {
  const startedAt = performance.now();
  void copySpeechTranscriptToClipboard(text).then((copied) => {
    if (copied) {
      console.info(`[speech-to-text] clipboard 复制结果 ${formatSpeechTimingMs(performance.now() - startedAt)}`);
    }
  }).catch((error) => {
    console.warn('[speech-to-text] clipboard 复制结果失败', error);
  });
}

async function transcribeSpeechAudioAllowBlank(audio) {
  try {
    const result = await transcribeSpeechAudio(audio);
    const text = String(result?.text || '').trim();
    if (!text) return null;
    return { ...result, text };
  } catch (error) {
    if (String(error || '').includes('ASR 未返回可用文本')) {
      return null;
    }
    throw error;
  }
}

function appendTextAfterSpeechChunk(text) {
  const value = String(text || '').trim();
  if (!value) return;
  insertTextIntoComposer(value);
}

async function transcribeSpeechAudioInChunks(audio) {
  const chunks = splitSpeechAudioForAsr(audio);
  const texts = [];
  const timings = [];
  let logId = null;
  for (let index = 0; index < chunks.length; index += 1) {
    if (chunks.length > 1) {
      setStatus(`正在识别语音 ${index + 1}/${chunks.length}...`);
    }
    const result = await transcribeSpeechAudioAllowBlank(chunks[index]);
    if (result?.text) texts.push(String(result.text));
    if (!logId && result?.logId) logId = result.logId;
    if (result?.timing) timings.push(result.timing);
  }
  return { text: texts.join('\n').trim(), logId, chunkCount: chunks.length, timing: mergeSpeechTimings(timings) };
}

async function copySpeechTranscriptToClipboard(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  await copyTextToClipboard(value);
  return true;
}

async function playSpeechTask(id) {
  const task = await getSpeechTask(id);
  if (!task?.audio?.bytes?.length) {
    showToast('没有可重听的录音', 'error');
    return;
  }
  if (speechTaskAudioUrl) URL.revokeObjectURL(speechTaskAudioUrl);
  speechTaskAudioUrl = URL.createObjectURL(new Blob([new Uint8Array(task.audio.bytes)], { type: task.audio.mimeType || 'audio/wav' }));
  const audio = new Audio(speechTaskAudioUrl);
  await audio.play();
}

async function downloadSpeechTaskAudio(id) {
  const task = await getSpeechTask(id);
  if (!task?.audio?.bytes?.length) {
    showToast('没有可下载的录音', 'error');
    return;
  }
  const created = task.createdAtMs
    ? new Date(task.createdAtMs).toISOString().replace(/[:.]/g, '-')
    : Date.now();
  const filename = `speech-${created}.wav`;
  const blob = new Blob([new Uint8Array(task.audio.bytes)], { type: task.audio.mimeType || 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('音频已开始下载', 'success');
}

async function retrySpeechTask(id) {
  const task = await getSpeechTask(id);
  if (!task?.audio?.bytes?.length) {
    showToast('没有可重试的录音', 'error');
    return;
  }
  await updateSpeechTask(id, { status: 'transcribing', error: '' });
  try {
    const result = await transcribeSpeechAudioInChunks(task.audio);
    await updateSpeechTask(id, { status: 'success', text: result?.text || '', error: '', chunkCount: result?.chunkCount || 1 });
    await copySpeechTranscriptToClipboard(result?.text || '');
    showToast('重新转录完成', 'success');
  } catch (error) {
    await updateSpeechTask(id, { status: 'failed', error: String(error), text: task.text || '' });
    showToast(`重新转录失败：${error}`, 'error');
  }
}

async function renderSpeechTaskHistory() {
  if (!speechTaskHistoryList) return;
  const keepCount = getSpeechTaskRetentionCount();
  const tasks = await listSpeechTasks();
  if (speechTaskHistorySummary) {
    speechTaskHistorySummary.textContent = `保留最近 ${keepCount} 条，共 ${tasks.length} 条`;
  }
  speechTaskHistoryList.innerHTML = '';
  if (!tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'speech-task-empty';
    empty.textContent = '暂无转录任务';
    speechTaskHistoryList.appendChild(empty);
    return;
  }
  tasks.forEach((task) => {
    const item = document.createElement('div');
    item.className = `speech-task-item is-${task.status || 'pending'}`;
    const main = document.createElement('div');
    main.className = 'speech-task-main';
    const meta = document.createElement('div');
    meta.className = 'speech-task-meta';
    meta.textContent = `${formatSpeechTaskTime(task.createdAtMs)} · ${speechTaskStatusText(task.status)} · ${formatSpeechTaskDuration(task.durationMs)}`;
    const text = document.createElement('div');
    text.className = 'speech-task-text';
    const fullText = task.status === 'failed' ? (task.error || '转录失败') : (task.text || '暂无结果');
    text.textContent = getSpeechTaskPreviewText(fullText);
    text.title = fullText;
    main.appendChild(meta);
    main.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'speech-task-actions';
    const playButton = document.createElement('button');
    playButton.className = 'button ghost small';
    playButton.type = 'button';
    playButton.textContent = '重听';
    playButton.addEventListener('click', () => void playSpeechTask(task.id));
    const retryButton = document.createElement('button');
    retryButton.className = 'button ghost small';
    retryButton.type = 'button';
    retryButton.textContent = task.status === 'failed' ? '重试' : '重新转录';
    retryButton.disabled = task.status === 'transcribing';
    retryButton.addEventListener('click', () => void retrySpeechTask(task.id));
    const downloadButton = document.createElement('button');
    downloadButton.className = 'button ghost small';
    downloadButton.type = 'button';
    downloadButton.textContent = '下载音频';
    downloadButton.addEventListener('click', () => void downloadSpeechTaskAudio(task.id));
    const copyButton = document.createElement('button');
    copyButton.className = 'button ghost small';
    copyButton.type = 'button';
    copyButton.textContent = '复制结果';
    copyButton.disabled = !task.text;
    copyButton.addEventListener('click', () => copyTextToClipboard(task.text || ''));
    const deleteButton = document.createElement('button');
    deleteButton.className = 'button ghost small';
    deleteButton.type = 'button';
    deleteButton.textContent = '删除';
    deleteButton.addEventListener('click', () => void removeSpeechTask(task.id));
    actions.appendChild(playButton);
    actions.appendChild(retryButton);
    actions.appendChild(downloadButton);
    actions.appendChild(copyButton);
    actions.appendChild(deleteButton);
    item.appendChild(main);
    item.appendChild(actions);
    speechTaskHistoryList.appendChild(item);
  });
}

function renderSpeechInputDeviceOptions(select, devices, selectedDeviceId, defaultLabel, fallbackLabelPrefix) {
  if (!select) return;
  const currentValue = selectedDeviceId || select.value || '';
  select.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = defaultLabel;
  select.appendChild(defaultOption);
  (devices || []).forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `${fallbackLabelPrefix} ${index + 1}`;
    select.appendChild(option);
  });
  select.value = Array.from(select.options)
    .some((option) => option.value === currentValue)
    ? currentValue
    : '';
}

function renderSpeechMicrophoneOptions(devices, selectedDeviceId) {
  renderSpeechInputDeviceOptions(
    speechToTextMicrophoneInput,
    devices,
    selectedDeviceId,
    '系统默认麦克风',
    '麦克风',
  );
}

function renderSpeechSystemAudioDeviceOptions(devices, selectedDeviceId) {
  renderSpeechInputDeviceOptions(
    speechToTextSystemAudioDeviceInput,
    devices,
    selectedDeviceId,
    '选择 BlackHole / Loopback 等输入设备',
    '输入设备',
  );
  if (speechToTextSystemAudioDeviceInput) {
    speechToTextSystemAudioDeviceInput.disabled = !currentSettingsFormState.speechToTextCaptureSystemAudio;
  }
}

async function refreshSpeechMicrophoneOptions() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    renderSpeechMicrophoneOptions([], currentSettingsFormState.speechToTextMicrophoneDeviceId || '');
    renderSpeechSystemAudioDeviceOptions([], currentSettingsFormState.speechToTextSystemAudioDeviceId || '');
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const microphones = devices.filter((device) => device.kind === 'audioinput');
    renderSpeechMicrophoneOptions(microphones, currentSettingsFormState.speechToTextMicrophoneDeviceId || '');
    renderSpeechSystemAudioDeviceOptions(microphones, currentSettingsFormState.speechToTextSystemAudioDeviceId || '');
  } catch (error) {
    renderSpeechMicrophoneOptions([], currentSettingsFormState.speechToTextMicrophoneDeviceId || '');
    renderSpeechSystemAudioDeviceOptions([], currentSettingsFormState.speechToTextSystemAudioDeviceId || '');
  }
}

function insertTextIntoComposer(text) {
  const value = String(text || '');
  if (!value) return;
  const cw = window.transferGenieComposer;
  if (cw && cw.isActive && cw.isActive() && cw.getActiveDraft && cw.setActiveDraftText) {
    const draft = cw.getActiveDraft() || {};
    const previous = String(draft.text || '');
    const separator = previous && !previous.endsWith('\n') ? '\n' : '';
    cw.setActiveDraftText(`${previous}${separator}${value}`);
    cw.focusActiveDraft?.();
    return;
  }
  if (currentFormat === 'markdown' && mdEditor) {
    const previous = mdEditor.getMarkdown ? mdEditor.getMarkdown() : '';
    const separator = previous && !previous.endsWith('\n') ? '\n' : '';
    mdEditor.setMarkdown(`${previous}${separator}${value}`);
    focusTextInput();
    return;
  }
  if (!textInput) return;
  const start = Number.isInteger(textInput.selectionStart) ? textInput.selectionStart : textInput.value.length;
  const end = Number.isInteger(textInput.selectionEnd) ? textInput.selectionEnd : start;
  const before = textInput.value.slice(0, start);
  const after = textInput.value.slice(end);
  const spacer = before && !before.endsWith('\n') && !before.endsWith(' ') ? ' ' : '';
  textInput.value = `${before}${spacer}${value}${after}`;
  const cursor = before.length + spacer.length + value.length;
  textInput.focus({ preventScroll: true });
  textInput.setSelectionRange(cursor, cursor);
}

function stopSpeechStream() {
  if (speechProcessorNode) {
    speechProcessorNode.onaudioprocess = null;
    try { speechProcessorNode.disconnect(); } catch (error) { /* ignore */ }
    speechProcessorNode = null;
  }
  if (speechSourceNode) {
    try { speechSourceNode.disconnect(); } catch (error) { /* ignore */ }
    speechSourceNode = null;
  }
  if (speechSystemAudioSourceNode) {
    try { speechSystemAudioSourceNode.disconnect(); } catch (error) { /* ignore */ }
    speechSystemAudioSourceNode = null;
  }
  if (speechMixDestinationNode) {
    try { speechMixDestinationNode.disconnect(); } catch (error) { /* ignore */ }
    speechMixDestinationNode = null;
  }
  if (speechSilentGainNode) {
    try { speechSilentGainNode.disconnect(); } catch (error) { /* ignore */ }
    speechSilentGainNode = null;
  }
  if (speechStream) {
    closeSpeechStream(speechStream);
    speechStream = null;
  }
  if (speechSystemAudioStream) {
    closeSpeechStream(speechSystemAudioStream);
    speechSystemAudioStream = null;
  }
  if (speechAudioContext) {
    const context = speechAudioContext;
    speechAudioContext = null;
    closeSpeechAudioContext(context);
  }
}

async function startSpeechRecording() {
  if (!currentSettingsFormState.speechToTextEnabled) {
    setErrorStatus('请先在设置中启用语音转文字');
    showToast('请先在设置中启用语音转文字', 'error');
    return;
  }
  if (!currentSettingsFormState.speechToTextApiKey) {
    setErrorStatus('启用语音转文字前请先填写 API Key');
    showToast('启用语音转文字前请先填写 API Key', 'error');
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {
    const message = describeSpeechRecordingUnsupported();
    setErrorStatus(message);
    showToast(message, 'error');
    return;
  }
  const sessionId = speechSessionId + 1;
  speechSessionId = sessionId;
  setSpeechState('preparing');
  setStatus('正在打开麦克风...');
  try {
    speechCapturedSegments = [];
    resetLiveSpeechTranscription();
    const deviceId = String(currentSettingsFormState.speechToTextMicrophoneDeviceId || '').trim();
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia(buildSpeechAudioConstraints(deviceId));
    } catch (error) {
      if (!isCurrentSpeechSession(sessionId) || speechState !== 'preparing' || !isRecoverableSpeechMicError(error)) {
        throw error;
      }
      setStatus('打开麦克风失败，正在重试...');
      await waitSpeechRetryDelay(160);
      if (!isCurrentSpeechSession(sessionId) || speechState !== 'preparing') return;
      stream = await navigator.mediaDevices.getUserMedia(buildSpeechAudioConstraints(''));
    }
    if (!isCurrentSpeechSession(sessionId) || speechState !== 'preparing') {
      closeSpeechStream(stream);
      return;
    }
    const audioContext = new AudioContextClass({ sampleRate: 16000 });
    if (audioContext.resume) {
      await audioContext.resume();
    }
    if (!isCurrentSpeechSession(sessionId) || speechState !== 'preparing') {
      closeSpeechStream(stream);
      closeSpeechAudioContext(audioContext);
      return;
    }
    speechStream = stream;
    speechSystemAudioStream = await openSpeechSystemAudioInput();
    if (!isCurrentSpeechSession(sessionId) || speechState !== 'preparing') {
      stopSpeechStream();
      closeSpeechAudioContext(audioContext);
      return;
    }
    speechAudioContext = audioContext;
    speechCaptureSampleRate = speechAudioContext.sampleRate || 16000;
    speechProcessorNode = speechAudioContext.createScriptProcessor(4096, 1, 1);
    speechSilentGainNode = speechAudioContext.createGain();
    speechSilentGainNode.gain.value = 0;
    speechProcessorNode.onaudioprocess = (event) => {
      if (speechState !== 'recording') return;
      const input = readSpeechInputSamples(event.inputBuffer);
      const downsampled = downsampleSpeechSamples(input, speechCaptureSampleRate, 16000);
      if (downsampled.length) {
        speechCapturedSegments.push(new Float32Array(downsampled));
        appendLiveSpeechSamples(downsampled, 16000);
      }
      let sum = 0;
      for (let index = 0; index < input.length; index += 1) {
        sum += input[index] * input[index];
      }
      setSpeechLevel(Math.min(1, Math.sqrt(sum / input.length) * 8));
    };
    connectSpeechInputSources(speechAudioContext, speechStream, speechSystemAudioStream);
    speechProcessorNode.connect(speechSilentGainNode);
    speechSilentGainNode.connect(speechAudioContext.destination);
    setSpeechState('recording');
    setStatus('正在录音，再点一次结束');
  } catch (error) {
    if (!isCurrentSpeechSession(sessionId)) return;
    stopSpeechStream();
    resetLiveSpeechTranscription();
    setSpeechState('idle');
    const message = describeSpeechMicError(error);
    setErrorStatus(`启动录音失败：${message}`);
    showToast(`启动录音失败：${message}`, 'error');
  }
}

function stopSpeechRecording(options = {}) {
  if (speechState === 'recording') {
    if (options.playCue) {
      void playSpeechCueSound('stop');
    }
    speechSessionId += 1;
    void finishSpeechRecording();
    return;
  }
  speechSessionId += 1;
  stopSpeechStream();
  resetLiveSpeechTranscription();
  setSpeechState('idle');
}

async function finishSpeechRecording() {
  const localStartedAt = performance.now();
  const chunks = speechCapturedSegments.slice();
  speechCapturedSegments = [];
  const sourceSampleRate = speechCaptureSampleRate;
  const stopStartedAt = performance.now();
  stopSpeechStream();
  const stopMs = performance.now() - stopStartedAt;
  if (!chunks.length) {
    resetLiveSpeechTranscription();
    setSpeechState('idle');
    setErrorStatus('没有可识别的录音数据');
    return;
  }
  setSpeechState('transcribing');
  setStatus('正在识别语音...');
  let taskId = '';
  let pendingSpeechTask = null;
  try {
    speechCaptureSampleRate = sourceSampleRate;
    const buildAudioStartedAt = performance.now();
    const audio = buildCapturedSpeechWav(chunks);
    const buildAudioMs = performance.now() - buildAudioStartedAt;
    taskId = `speech-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    speechLiveTaskId = taskId;
    const taskBase = {
      id: taskId,
      text: '',
      error: '',
      durationMs: audio.durationMs,
      audio: { ...audio, bytes: Array.from(audio.bytes) },
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };
    pendingSpeechTask = taskBase;
    let saveTaskMs = 0;
    const saveTaskStartedAt = performance.now();
    if (speechLiveTranscriptionStarted) {
      await putSpeechTask({ ...taskBase, status: 'transcribing' });
      saveTaskMs = performance.now() - saveTaskStartedAt;
    }
    const transcribeStartedAt = performance.now();
    const result = speechLiveTranscriptionStarted
      ? await finishLiveSpeechTranscription()
      : await transcribeSpeechAudioAllowBlank(audio);
    const transcribeMs = performance.now() - transcribeStartedAt;
    const insertStartedAt = performance.now();
    if (!speechLiveTranscriptionStarted) {
      insertTextIntoComposer(result?.text || '');
    }
    const insertMs = performance.now() - insertStartedAt;
    const copyStartedAt = performance.now();
    copySpeechTranscriptInBackground(result?.text || '');
    const copyMs = performance.now() - copyStartedAt;
    const updateTaskStartedAt = performance.now();
    if (speechLiveTranscriptionStarted) {
      updateSpeechTaskInBackground(taskId, { status: 'success', text: result?.text || '', error: '', chunkCount: result?.chunkCount || 1 }, '更新长录音任务');
    } else {
      saveSpeechTaskInBackground({
        ...taskBase,
        status: 'success',
        text: result?.text || '',
        error: '',
        chunkCount: result?.chunkCount || 1,
        updatedAtMs: Date.now(),
      }, '保存短录音任务');
    }
    const updateTaskMs = performance.now() - updateTaskStartedAt;
    const localTiming = {
      totalMs: performance.now() - localStartedAt,
      stopMs,
      buildAudioMs,
      saveTaskMs,
      transcribeMs,
      updateTaskMs,
      insertMs,
      copyMs,
    };
    setSpeechState('idle');
    setSuccessStatus('语音识别完成');
    reportSpeechLocalTiming(localTiming, result?.timing, speechLiveTranscriptionStarted ? 'session' : 'short');
    resetLiveSpeechTranscription();
  } catch (error) {
    if (taskId && pendingSpeechTask) {
      saveSpeechTaskInBackground({ ...pendingSpeechTask, status: 'failed', error: String(error), updatedAtMs: Date.now() }, '保存失败任务');
    } else if (taskId) {
      updateSpeechTaskInBackground(taskId, { status: 'failed', error: String(error) }, '更新失败任务');
    }
    resetLiveSpeechTranscription();
    setSpeechState('idle');
    setErrorStatus(`语音识别失败：${error}`);
  }
}

function toggleSpeechRecording() {
  if (speechState === 'recording' || speechState === 'preparing') {
    void playSpeechCueSound('stop');
    stopSpeechRecording();
  } else if (speechState === 'idle') {
    void playSpeechCueSound('start');
    void startSpeechRecording();
  }
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
  globalHotkeyInput.disabled = !currentSettingsFormState.globalHotkeyEnabled;
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

function findWebdavEndpoint(endpointId) {
  if (!endpointId) {
    return null;
  }
  return webdavEndpoints.find((endpoint) => endpoint.id === endpointId) || null;
}

function refreshWebdavEndpointViews() {
  if (hasVueAppShell) {
    syncVueSettingsWebdavState();
    syncTelegramControlsState();
    return;
  }
  renderWebdavEndpoints();
}

async function runVueWebdavSpeedTest(endpointId) {
  const endpoint = findWebdavEndpoint(endpointId);
  if (!endpoint) {
    return null;
  }
  if (!(endpoint.url || '').trim()) {
    setErrorStatus('请先填写 WebDAV URL');
    return null;
  }
  endpoint.speedTestRunning = true;
  endpoint.speedTestResult = null;
  refreshWebdavEndpointViews();
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
    const uploadSpeed = Number(result?.upload_speed_mbps || 0);
    const downloadSpeed = Number(result?.download_speed_mbps || 0);
    endpoint.speedTestResult = {
      uploadText: `${uploadSpeed.toFixed(2)} MB/s`,
      downloadText: `${downloadSpeed.toFixed(2)} MB/s`,
    };
    setSuccessStatus('测速完成');
    return endpoint.speedTestResult;
  } catch (error) {
    endpoint.speedTestResult = null;
    setErrorStatus(`测速失败：${error}`);
    throw error;
  } finally {
    endpoint.speedTestRunning = false;
    refreshWebdavEndpointViews();
  }
}

function renderWebdavEndpoints() {
  if (!webdavList) return;
  if (hasVueAppShell) {
    syncVueSettingsWebdavState();
    syncTelegramControlsState();
    return;
  }
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
      queueSettingsAutoSave();
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
      queueSettingsAutoSave();
    });
    userInput.addEventListener('input', () => {
      endpoint.username = userInput.value;
      queueSettingsAutoSave();
    });
    passInput.addEventListener('input', () => {
      endpoint.password = passInput.value;
      queueSettingsAutoSave();
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
      queueSettingsAutoSave({ delayMs: 0 });
    });
    activeInput.addEventListener('change', () => {
      if (activeInput.checked) {
        activeEndpointId = endpoint.id;
        renderEndpointSelect();
        queueSettingsAutoSave({ delayMs: 0 });
      }
    });
    removeButton.addEventListener('click', () => {
      webdavEndpoints = webdavEndpoints.filter((item) => item.id !== endpoint.id);
      if (activeEndpointId === endpoint.id) {
        activeEndpointId = null;
      }
      renderWebdavEndpoints();
      renderEndpointSelect();
      queueSettingsAutoSave({ delayMs: 0 });
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
  Array.from(downloadTasks.entries()).forEach(([key, task]) => {
    if ((task.persisted || task.historyId) && !isDownloadTaskActive(task)) {
      downloadTasks.delete(key);
      downloadSpeed.delete(key);
    }
  });
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

  trimDownloadTasks();
  renderDownloadTasks();
}

async function loadPersistedDownloadHistory(options = {}) {
  const silent = options.silent !== false;
  const page = Math.max(1, Number(options.page || downloadTasksPage) || 1);
  if (!invoke) {
    return;
  }
  try {
    const result = await invoke('list_download_history', {
      limit: TRANSFER_TASKS_PER_PAGE,
      offset: (page - 1) * TRANSFER_TASKS_PER_PAGE,
    });
    const records = Array.isArray(result) ? result : (result.records || []);
    downloadHistoryTotal = Array.isArray(result) ? records.length : (result.total || 0);
    const totalPages = Math.max(1, Math.ceil(downloadHistoryTotal / TRANSFER_TASKS_PER_PAGE));
    if (page > totalPages) {
      downloadTasksPage = totalPages;
      return loadPersistedDownloadHistory({ silent, page: totalPages });
    }
    downloadTasksPage = page;
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
  syncVueTransferTaskState();
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

function buildTransferTaskViewModel(task, options = {}) {
  const kind = options.kind === 'upload' ? 'upload' : 'download';
  const isDownload = kind === 'download';
  const isActive = isDownload ? isDownloadTaskActive(task) : task?.status === 'progress';
  const isComplete = task?.status === 'complete';
  const isError = task?.status === 'error';
  const progressPercent = task?.total
    ? Math.min(100, Math.round(((task.received || 0) / task.total) * 100))
    : (isActive ? 30 : 0);
  let detailText = '';
  if (isActive) {
    detailText = isDownload
      ? formatDownloadProgressText(task, getSpeed(downloadSpeed, task.key), true)
      : formatProgress(
          task.received || 0,
          task.total || 0,
          uploadStatusLabel(task),
          getSpeed(uploadSpeed, task.speedKey || task.key)
        );
  } else if (isError) {
    detailText = task?.error || (isDownload ? '下载失败' : '上传失败');
  } else if (task?.path) {
    detailText = task.localExists === false ? `${task.path}（文件不存在）` : task.path;
  } else if (isDownload) {
    detailText = isComplete ? '文件已保存' : '等待下载';
  } else {
    detailText = '上传已完成';
  }

  return {
    key: task?.key || '',
    kind,
    historyId: task?.historyId || null,
    title: task?.originalName || task?.filename || '',
    stateLabel: isDownload ? getDownloadTaskDisplayStateLabel(task) : getUploadTaskStateLabel(task),
    metaText: `${task?.endpointLabel || '未选择端点'} · ${formatBytes(task?.total || 0)}`,
    detailText,
    updatedText: formatTime(task?.updatedAt || task?.createdAt || Date.now()),
    isActive,
    isComplete,
    isError,
    selectionMode: !!options.selectionMode,
    isSelected: !!options.isSelected,
    selectable: !!options.selectable,
    showProgress: isActive,
    progressPercent,
    showHistoryActions: isDownload && !!task?.historyId && !isActive,
    canOpenFile: task?.localExists !== false,
  };
}

function syncVueTransferTaskState() {
  if (!hasVueAppShell) {
    return;
  }
  const downloadTasksForVue = (currentDownloadTaskPageState.tasks || []).map((task) =>
    buildTransferTaskViewModel(task, {
      kind: 'download',
      selectionMode: downloadSelectionMode,
      isSelected: selectedDownloadTasks.has(task?.key),
      selectable: !!(task?.historyId && !isDownloadTaskActive(task)),
    })
  );
  const uploadTasksForVue = (currentUploadTaskPageState.tasks || []).map((task) =>
    buildTransferTaskViewModel(task, {
      kind: 'upload',
      selectionMode: downloadSelectionMode,
      isSelected: selectedUploadTasks.has(task?.key),
      selectable: !!(task?.historyId && task?.status !== 'progress'),
    })
  );
  syncVueTransferTasks({
    useVuePanels: true,
    currentView: currentTransferListView,
    selectionMode: downloadSelectionMode,
    selectionCount: getCurrentTransferSelectionSet().size,
    downloadsCount: Math.max(0, Number(transferTaskCounts.downloads) || 0),
    uploadsCount: Math.max(0, Number(transferTaskCounts.uploads) || 0),
    downloadSummary: currentDownloadTaskPageState.summary || '',
    uploadSummary: currentUploadTaskPageState.summary || '',
    downloadPage: currentDownloadTaskPageState.currentPage || 1,
    downloadTotalPages: currentDownloadTaskPageState.totalPages || 1,
    uploadPage: currentUploadTaskPageState.currentPage || 1,
    uploadTotalPages: currentUploadTaskPageState.totalPages || 1,
    downloadTasks: downloadTasksForVue,
    uploadTasks: uploadTasksForVue,
  });
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
  const totalPages = Math.max(1, Math.ceil(Math.max(downloadHistoryTotal, tasks.length) / TRANSFER_TASKS_PER_PAGE));
  const currentPage = Math.max(1, Math.min(downloadTasksPage, totalPages));
  const pageTasks = tasks;
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

  currentDownloadTaskPageState = {
    summary: downloadTaskSummary ? downloadTaskSummary.textContent : '',
    currentPage,
    totalPages,
    tasks: pageTasks,
  };
  syncVueTransferTaskState();
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
      loadPersistedDownloadHistory({ silent: true, page: nextPage });
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
  renderUploadTasks();
}

async function loadPersistedUploadHistory(options = {}) {
  const silent = options.silent !== false;
  const page = Math.max(1, Number(options.page || uploadTasksPage) || 1);
  if (!invoke) {
    return;
  }
  try {
    const result = await invoke('list_upload_history', {
      limit: TRANSFER_TASKS_PER_PAGE,
      offset: (page - 1) * TRANSFER_TASKS_PER_PAGE,
    });
    const records = Array.isArray(result) ? result : (result.records || []);
    uploadHistoryTotal = Array.isArray(result) ? records.length : (result.total || 0);
    const totalPages = Math.max(1, Math.ceil(uploadHistoryTotal / TRANSFER_TASKS_PER_PAGE));
    if (page > totalPages) {
      uploadTasksPage = totalPages;
      return loadPersistedUploadHistory({ silent, page: totalPages });
    }
    uploadTasksPage = page;
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
  const totalPages = Math.max(1, Math.ceil(Math.max(uploadHistoryTotal, tasks.length) / TRANSFER_TASKS_PER_PAGE));
  const currentPage = Math.max(1, Math.min(uploadTasksPage, totalPages));
  const pageTasks = tasks;
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
    currentUploadTaskPageState = {
      summary: uploadTaskSummary ? uploadTaskSummary.textContent : '',
      currentPage,
      totalPages,
      tasks: pageTasks,
    };
    syncVueTransferTaskState();
    return;
  }

  currentUploadTaskPageState = {
    summary: uploadTaskSummary ? uploadTaskSummary.textContent : '',
    currentPage,
    totalPages,
    tasks: pageTasks,
  };
  syncVueTransferTaskState();

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
      loadPersistedUploadHistory({ silent: true, page: nextPage });
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
  renderCurrentMessageView();
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
  if (feedState?.isMessageSelectionRefreshPaused) {
    return feedState.isMessageSelectionRefreshPaused(selectionMode);
  }
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
  renderCurrentMessageView();
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
  currentMarkedPageState.selectionCount = selectedMarkedMessages.size;
  currentMarkedPageState.messages = (currentMarkedPageState.messages || []).map((message) =>
    message.filename === filename
      ? { ...message, isSelected: checked }
      : message
  );
  syncVueMarkedPageState();
}

function buildPatchedMarkedMessage(message, patch = {}) {
  const next = {
    ...message,
    ...patch,
  };
  if (patch.marked_tag_ids !== undefined) {
    next.marked_tag_ids = Array.isArray(patch.marked_tag_ids) ? patch.marked_tag_ids.slice() : [];
  } else {
    next.marked_tag_ids = Array.isArray(message?.marked_tag_ids) ? message.marked_tag_ids.slice() : [];
  }
  if (patch.marked !== undefined) {
    next.marked = !!patch.marked;
    if (!next.marked) {
      next.marked_tag_ids = [];
      next.marked_pinned = false;
    }
  }
  if (patch.marked_pinned !== undefined) {
    next.marked_pinned = !!patch.marked_pinned;
  }
  if (patch.marked_due_date !== undefined) {
    next.marked_due_date = normalizeMarkedDueDate(patch.marked_due_date) || null;
  }
  return next;
}

function markedMessageMatchesCurrentView(message) {
  if (!message?.marked) {
    return false;
  }
  if (markedPendingOnly && !isMarkedMessagePending(message)) {
    return false;
  }
  const tagIds = Array.isArray(message.marked_tag_ids) ? message.marked_tag_ids : [];
  if (activeMarkedTagId === UNTAGGED_MARKED_TAG_FILTER_ID && tagIds.length > 0) {
    return false;
  }
  if (
    activeMarkedTagId
    && activeMarkedTagId !== UNTAGGED_MARKED_TAG_FILTER_ID
    && !tagIds.includes(activeMarkedTagId)
  ) {
    return false;
  }
  const query = String(getAppliedMarkedSearchQuery() || '').trim().toLowerCase();
  if (!query) {
    return true;
  }
  const haystack = [
    message.sender,
    message.content,
    message.original_name,
    message.filename,
  ].map((value) => String(value || '').toLowerCase()).join('\n');
  return haystack.includes(query);
}

function applyLocalMarkedPatch(filenames, patch, options = {}) {
  const targetSet = new Set(
    (Array.isArray(filenames) ? filenames : [filenames])
      .map((filename) => String(filename || '').trim())
      .filter(Boolean),
  );
  if (targetSet.size === 0) {
    return new Map();
  }

  const beforeMarkedByFilename = new Map();
  const captureBeforeMarked = (message) => {
    if (message?.filename && targetSet.has(message.filename) && !beforeMarkedByFilename.has(message.filename)) {
      beforeMarkedByFilename.set(message.filename, !!message.marked);
    }
  };
  lastMessages.forEach(captureBeforeMarked);
  markedMessages.forEach(captureBeforeMarked);
  (Array.isArray(options.sourceMessages) ? options.sourceMessages : []).forEach(captureBeforeMarked);
  captureBeforeMarked(currentPreviewMessage);

  const updated = new Map();
  const patchMessage = (message) => {
    if (!message?.filename || !targetSet.has(message.filename)) {
      return message;
    }
    const next = buildPatchedMarkedMessage(message, patch);
    updated.set(message.filename, next);
    return next;
  };

  let homeChanged = false;
  lastMessages = lastMessages.map((message) => {
    const next = patchMessage(message);
    if (next !== message) {
      homeChanged = true;
    }
    return next;
  });

  let markedChanged = false;
  markedMessages = markedMessages
    .map((message) => {
      const next = patchMessage(message);
      if (next !== message) {
        markedChanged = true;
      }
      return next;
    })
    .filter((message) => {
      const keep = markedMessageMatchesCurrentView(message);
      if (!keep && targetSet.has(message.filename)) {
        markedChanged = true;
      }
      return keep;
    });

  const sourceMessages = Array.isArray(options.sourceMessages) ? options.sourceMessages : [];
  sourceMessages.forEach((message) => {
    if (!message?.filename || !targetSet.has(message.filename)) {
      return;
    }
    const next = updated.get(message.filename) || buildPatchedMarkedMessage(message, patch);
    updated.set(message.filename, next);
    Object.assign(message, next);
  });

  if (patch.marked !== undefined) {
    let markedTotalDelta = 0;
    targetSet.forEach((filename) => {
      const wasMarked = beforeMarkedByFilename.get(filename);
      if (wasMarked === true && !patch.marked) {
        markedTotalDelta -= 1;
      } else if (wasMarked === false && patch.marked) {
        markedTotalDelta += 1;
      }
    });
    if (markedTotalDelta !== 0) {
      markedMessagesTotal = Math.max(0, Number(markedMessagesTotal || 0) + markedTotalDelta);
    }
  }
  updateMarkedBadgeFromLocalMessages();

  if (currentPreviewMessage?.filename && targetSet.has(currentPreviewMessage.filename)) {
    currentPreviewMessage = updated.get(currentPreviewMessage.filename)
      || buildPatchedMarkedMessage(currentPreviewMessage, patch);
    if (messagePreview?.classList.contains('is-active')) {
      renderPreviewActions(currentPreviewMessage);
    }
  }

  currentMarkingMessages = currentMarkingMessages.map((message) => patchMessage(message));

  if (homeChanged && options.renderHome !== false) {
    updated.forEach((message, filename) => {
      const homeCard = document.querySelector(
        `#message-list .message-card[data-filename="${escapeSelector(filename)}"], #message-list-vue .message-card[data-filename="${escapeSelector(filename)}"]`,
      );
      patchMessageCardElement(homeCard, message, patch);
    });
    syncVueHomeFeedView({
      messages: lastMessages,
      query: searchInput ? searchInput.value.trim() : '',
    });
  }
  if (markedChanged && options.renderMarked !== false) {
    updated.forEach((message, filename) => {
      if (!markedMessageMatchesCurrentView(message)) {
        removeMarkedCardFromCurrentView(filename);
        return;
      }
      const markedCard = document.querySelector(
        `#marked-message-list .message-card[data-filename="${escapeSelector(filename)}"]`,
      );
      patchMessageCardElement(markedCard, message, patch);
    });
    currentMarkedPageState.messages = (currentMarkedPageState.messages || []).map((viewModel) => {
      const message = updated.get(viewModel.filename);
      return message ? buildMarkedMessageViewModel(message) : viewModel;
    });
    currentMarkedPageState.selectionCount = selectedMarkedMessages.size;
    syncVueMarkedPageState();
  }

  return updated;
}

function patchMessageCardElement(card, message, patch = {}) {
  if (!card || !message) {
    return false;
  }

  const next = buildPatchedMarkedMessage(message, patch);
  const isMarked = !!next.marked;
  card.classList.toggle('is-marked', isMarked);
  card.classList.toggle('is-pinned', !!next.marked_pinned);

  const markButton = card.querySelector('.mark-action');
  if (markButton) {
    markButton.classList.toggle('is-marked', isMarked);
    const markIcon = markButton.querySelector('img');
    if (markIcon) {
      markIcon.alt = isMarked ? '取消标记' : '标记';
    }
  }

  const pinButton = card.querySelector('.marked-pin-button');
  if (pinButton) {
    pinButton.classList.toggle('primary', !!next.marked_pinned);
    pinButton.classList.toggle('ghost', !next.marked_pinned);
    pinButton.classList.toggle('is-active', !!next.marked_pinned);
    const label = pinButton.querySelector('.marked-pin-label');
    if (label) {
      label.textContent = next.marked_pinned ? '已置顶' : '置顶';
    }
  }

  const tagRow = card.querySelector('.marked-message-tags');
  if (tagRow) {
    tagRow.innerHTML = '';
    const dueDateText = formatMarkedDueDateText(next.marked_due_date);
    if (dueDateText) {
      const dueChip = document.createElement('span');
      dueChip.className = 'marked-message-due-chip';
      dueChip.classList.toggle('is-pending', isMarkedMessagePending(next));
      dueChip.textContent = dueDateText;
      tagRow.appendChild(dueChip);
    }
    const resolvedTags = (next.marked_tag_ids || [])
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
  }

  return true;
}

function removeMarkedCardFromCurrentView(filename) {
  if (!filename) {
    return false;
  }
  const selector = `#marked-message-list .message-card[data-filename="${escapeSelector(filename)}"]`;
  const card = document.querySelector(selector);
  if (card) {
    card.remove();
    visibleMarkedMessages = visibleMarkedMessages.filter((message) => message.filename !== filename);
    currentMarkedPageState.messages = (currentMarkedPageState.messages || []).filter((message) => message.filename !== filename);
    currentMarkedPageState.selectionCount = selectedMarkedMessages.size;
    syncVueMarkedPageState();
    return true;
  }
  return false;
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

function buildMarkedMessageViewModel(message) {
  const resolvedTags = (message?.marked_tag_ids || [])
    .map((tagId) => markedTags.find((tag) => tag.id === tagId))
    .filter(Boolean)
    .map((tag) => tag.name);
  const bodyText = message?.kind === 'text'
    ? (message?.content || '')
    : (message?.original_name || message?.filename || '');
  const estimatedCollapsible = message?.kind === 'text'
    && (
      bodyText.length > 240
      || (bodyText.match(/\n/g) || []).length >= 5
    );
  const isCollapsed = estimatedCollapsible && !expandedTextMessages.has(message?.filename);

  return {
    key: message?.filename || '',
    filename: message?.filename || '',
    headerText: `${message?.sender || ''} · ${formatTime(message?.timestamp_ms || 0)}`,
    bodyText,
    metaText: `大小 ${formatBytes(message?.size || 0)}`,
    isFile: message?.kind === 'file',
    isText: message?.kind !== 'file',
    isPinned: !!message?.marked_pinned,
    isPending: isMarkedMessagePending(message),
    dueDateText: formatMarkedDueDateText(message?.marked_due_date),
    tags: resolvedTags,
    isSelected: selectedMarkedMessages.has(message?.filename),
    selectionMode: markedSelectionMode,
    isCollapsible: !!estimatedCollapsible,
    isCollapsed,
    collapseHeight: MARKED_MESSAGE_BODY_COLLAPSE_HEIGHT,
    expandLabel: isCollapsed ? '展开全文' : '收起',
    message,
  };
}

function syncVueMarkedPageState() {
  if (!hasVueAppShell) {
    return;
  }
  syncVueMarkedPage(currentMarkedPageState);
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
  syncVueTransferTaskState();
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
  const list = getCurrentMessageList();
  if (!list) return true;
  const threshold = 16;
  return (
    list.scrollTop + list.clientHeight >= list.scrollHeight - threshold
  );
}

function updateScrollToBottomButton() {
  if (!scrollToBottomButton) return;
  scrollToBottomButton.hidden = isMessageListAtBottom();
}

function scrollMessageListToBottom() {
  const apply = () => {
    const list = getCurrentMessageList();
    if (!list) return;
    const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
    list.scrollTop = maxScrollTop;
    lastMessageListScrollTop = list.scrollTop;
    updateScrollToBottomButton();
  };
  requestAnimationFrame(() => {
    apply();
    setTimeout(apply, 0);
    setTimeout(apply, 80);
  });
}

function forceScrollMessageListToBottom(durationMs = 1500) {
  forceScrollToBottomUntil = Date.now() + durationMs;
  scrollMessageListToBottom();
}

function applyForcedScrollToBottomIfNeeded() {
  if (Date.now() <= forceScrollToBottomUntil) {
    scrollMessageListToBottom();
  }
}

function scrollMessageIntoViewAtBottom(filename) {
  const list = getCurrentMessageList();
  if (!list || !filename) return false;
  const selector = `.message-card[data-filename="${escapeSelector(filename)}"]`;
  const item = list.querySelector(selector);
  if (!item) return false;
  const targetScrollTop = Math.max(
    0,
    item.offsetTop + item.offsetHeight - list.clientHeight,
  );
  list.scrollTop = targetScrollTop;
  lastMessageListScrollTop = list.scrollTop;
  updateScrollToBottomButton();
  return true;
}

function forceScrollMessageIntoViewAtBottom(filename, durationMs = 2500) {
  forceScrollMessageListToBottom(durationMs);
  const apply = () => {
    if (!scrollMessageIntoViewAtBottom(filename)) {
      scrollMessageListToBottom();
    }
  };
  requestAnimationFrame(() => {
    apply();
    setTimeout(apply, 0);
    setTimeout(apply, 80);
    setTimeout(apply, 250);
  });
}

function queueLoadMoreIfNeeded() {
  if (!getCurrentMessageList() || loadMoreDebounceTimer) return;
  loadMoreDebounceTimer = setTimeout(() => {
    loadMoreDebounceTimer = null;
    const list = getCurrentMessageList();
    if (!list) return;
    if (list.scrollTop < LOAD_MORE_TRIGGER_TOP && hasMoreMessages && !isLoadingMore) {
      loadMessages({ loadMore: true });
    }
  }, LOAD_MORE_DEBOUNCE_MS);
}

function handleMessageListScroll() {
  const list = getCurrentMessageList();
  if (!list) return;
  updateScrollToBottomButton();
  const currentScrollTop = list.scrollTop;
  const isScrollingUp = currentScrollTop <= lastMessageListScrollTop;
  lastMessageListScrollTop = currentScrollTop;
  if (isScrollingUp && currentScrollTop < LOAD_MORE_TRIGGER_TOP && hasMoreMessages && !isLoadingMore) {
    queueLoadMoreIfNeeded();
  }
}

function scrollMarkedMessageListToTop() {
  if (!markedMessageList) return;
  requestAnimationFrame(() => {
    markedMessageList.scrollTop = 0;
  });
}

function focusTextInput() {
  // 输入框即工作区：聚焦活动草稿编辑器
  const cw = window.transferGenieComposer;
  if (cw && cw.isActive && cw.isActive() && cw.focusActiveDraft) {
    cw.focusActiveDraft();
    return;
  }
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
  const hidden = document.documentElement.classList.contains('composer-hidden-active') || document.body.classList.contains('composer-hidden-active');
  const offset = hidden ? 0 : Math.round(composer.offsetHeight + 12);
  feed.style.setProperty('--composer-offset', `${offset}px`);
}

function openFeedSearch() {
  if (!feedSearch || !searchInput) return;
  feedSearch.hidden = false;
  window.requestAnimationFrame(() => {
    searchInput.focus({ preventScroll: true });
    if (typeof searchInput.select === 'function') searchInput.select();
  });
}

async function closeFeedSearch(options = {}) {
  if (!feedSearch) return;
  const clear = options.clear !== false;
  feedSearch.hidden = true;
  if (clear && searchInput && searchInput.value) {
    searchInput.value = '';
    await executeSearch();
  }
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
  syncVueActiveTab(target);
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

if (typeof window !== 'undefined') {
  window.transferGenieLegacySetActiveTab = setActiveTab;
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
    if (options.preserveWhitespace) {
      message.style.whiteSpace = 'pre-wrap';
    }

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
    if (options.preserveWhitespace) {
      message.style.whiteSpace = 'pre-wrap';
    }

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

async function loadSettingsSnapshots(options = {}) {
  const silent = !!options.silent;
  syncVueSettingsSnapshotsLoading(true);
  try {
    if (!invoke) {
      if (!silent) {
        setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      }
      return;
    }
    const snapshots = await invoke('list_settings_snapshots');
    settingsSnapshots = Array.isArray(snapshots) ? snapshots : [];
    syncVueSettingsSnapshots(settingsSnapshots);
  } catch (error) {
    settingsSnapshots = [];
    syncVueSettingsSnapshots(settingsSnapshots);
    if (!silent) {
      setErrorStatus(`读取设置快照失败：${error}`);
      await showInfoDialog({
        title: '读取设置快照失败',
        message: String(error),
      });
    }
  } finally {
    syncVueSettingsSnapshotsLoading(false);
  }
}

async function clearSettingsSnapshots() {
  const confirmed = await showConfirmationDialog({
    title: '清空设置快照',
    message: '清空后将删除所有本地设置历史快照，当前配置不会被删除。确定继续吗？',
    confirmLabel: '清空',
  });
  if (!confirmed) {
    return;
  }
  try {
    if (!invoke) {
      await showSettingsResultDialog('清空设置快照失败', '未检测到 Tauri API，请检查应用环境。');
      return;
    }
    const removed = await invoke('clear_settings_snapshots');
    await loadSettingsSnapshots({ silent: true });
    setSuccessStatus('设置快照已清空');
    await showSettingsResultDialog('清空设置快照成功', `已删除 ${Number(removed || 0)} 个设置快照。`);
  } catch (error) {
    await showSettingsResultDialog('清空设置快照失败', String(error));
    setErrorStatus(`清空设置快照失败：${error}`);
  }
}

async function loadSettingsBackupArchives(options = {}) {
  const silent = !!options.silent;
  syncVueSettingsBackupArchivesLoading(true);
  try {
    if (!invoke) {
      if (!silent) {
        setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 配置');
      }
      return;
    }
    const records = await invoke('list_local_backup_archives');
    const localRecords = await invoke('list_local_data_backups');
    settingsBackupArchives = [
      ...(Array.isArray(localRecords) ? localRecords : []),
      ...(Array.isArray(records) ? records : []),
    ];
    syncVueSettingsBackupArchives(settingsBackupArchives);
  } catch (error) {
    settingsBackupArchives = [];
    syncVueSettingsBackupArchives(settingsBackupArchives);
    if (!silent) {
      setErrorStatus(`读取本地备份记录失败：${error}`);
      await showInfoDialog({
        title: '读取本地备份记录失败',
        message: String(error),
      });
    }
  } finally {
    syncVueSettingsBackupArchivesLoading(false);
  }
}

async function clearSettingsBackupArchives() {
  const confirmed = await showConfirmationDialog({
    title: '清空本地备份归档',
    message: '清空后将删除当前列表中的本地备份归档文件及元数据记录。确定继续吗？',
    confirmLabel: '清空',
  });
  if (!confirmed) {
    return;
  }
  try {
    if (!invoke) {
      await showSettingsResultDialog('清空本地备份归档失败', '未检测到 Tauri API，请检查应用环境。');
      return;
    }
    syncVueSettingsBackupArchivesLoading(true);
    const removed = await invoke('clear_local_backup_archives');
    await loadSettingsBackupArchives({ silent: true });
    setSuccessStatus('本地备份归档已清空');
    await showSettingsResultDialog('清空本地备份归档成功', `已删除 ${Number(removed || 0)} 个归档文件。`);
  } catch (error) {
    await showSettingsResultDialog('清空本地备份归档失败', String(error));
    setErrorStatus(`清空本地备份归档失败：${error}`);
  } finally {
    syncVueSettingsBackupArchivesLoading(false);
  }
}

async function loadAutoBackupStatus(options = {}) {
  const silent = !!options.silent;
  try {
    if (!invoke) {
      if (!silent) {
        setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 配置');
      }
      return;
    }
    const status = await invoke('get_auto_backup_status');
    currentAutoBackupStatusState = {
      enabled: !!status?.enabled,
      intervalMinutes: Number(status?.intervalMinutes || status?.interval_minutes || 5),
      retainCount: Number(status?.retainCount || status?.retain_count || 7),
      settingsSnapshotRetainCount: Number(
        status?.settingsSnapshotRetainCount || status?.settings_snapshot_retain_count || 7,
      ),
      directory: status?.directory || '',
      keepAllDays: Number(status?.keepAllDays || status?.keep_all_days || 3),
      keepDailyDays: Number(status?.keepDailyDays || status?.keep_daily_days || 7),
      hasActiveEndpoint: !!(status?.hasActiveEndpoint ?? status?.has_active_endpoint),
      lastRunMs: status?.lastRunMs ?? status?.last_run_ms ?? null,
      lastSuccessMs: status?.lastSuccessMs ?? status?.last_success_ms ?? null,
      lastError: status?.lastError ?? status?.last_error ?? null,
      lastBackupPath: status?.lastBackupPath ?? status?.last_backup_path ?? '',
    };
    syncVueSettingsAutoBackup(currentAutoBackupStatusState);
  } catch (error) {
    if (!silent) {
      setErrorStatus(`读取自动备份状态失败：${error}`);
    }
  }
}

async function restoreSettingsSnapshotRecord(snapshot) {
  if (!snapshot?.path) {
    return;
  }
  const confirmed = await showConfirmationDialog({
    title: '恢复设置快照',
    message: '恢复后将使用该历史设置覆盖当前配置，并立即重新应用相关运行状态。确定继续吗？',
    confirmLabel: '恢复',
  });
  if (!confirmed) {
    return;
  }

  try {
    if (!invoke) {
      await showSettingsResultDialog('恢复设置快照失败', '未检测到 Tauri API，请检查应用环境。');
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    const restored = await invoke('restore_settings_snapshot', { snapshotPath: snapshot.path });
    applySettings(restored);
    syncVueSettings(restored);
    await loadLocalHttpApiStatus({ silent: true });
    await loadAutoBackupStatus({ silent: true });
    await loadTelegramBridgeStatus({ silent: true });
    await loadIntegrationModules({ silent: true });
    await loadSettingsSnapshots({ silent: true });
    await showSettingsResultDialog('恢复设置快照成功', '历史设置快照已恢复并重新应用。');
    setSuccessStatus('设置快照已恢复');
  } catch (error) {
    await showSettingsResultDialog('恢复设置快照失败', String(error));
    setErrorStatus(`恢复设置快照失败：${error}`);
  }
}

async function restoreSettingsBackupArchiveRecord(record) {
  if (!record?.backupPath || !record.exists) {
    return;
  }
  if ((record.source || '') === 'local-data') {
    const confirmed = await showConfirmationDialog({
      title: '恢复本地数据备份',
      message: '恢复会覆盖当前设置、本地消息索引和本地工作区数据。系统会先创建 rollback 备份。确定继续吗？',
      confirmLabel: '恢复',
    });
    if (!confirmed) {
      return;
    }
    try {
      const restored = await invoke('restore_local_data_backup', {
        path: record.backupPath,
        confirmed: true,
      });
      applySettings(restored);
      syncVueSettings(restored);
      await loadSettingsBackupArchives({ silent: true });
      await showSettingsResultDialog('恢复本地数据备份成功', '本地数据备份已恢复。');
      setSuccessStatus('本地数据已恢复');
    } catch (error) {
      await showSettingsResultDialog('恢复本地数据备份失败', String(error));
      setErrorStatus(`恢复本地数据失败：${error}`);
    }
    return;
  }
  const confirmed = await showConfirmationDialog({
    title: '恢复本地备份归档',
    message: '恢复后将使用该本地备份归档覆盖当前 WebDAV 数据，并重新加载相关列表。确定继续吗？',
    confirmLabel: '恢复',
  });
  if (!confirmed) {
    return;
  }

  const originalText = restoreWebdavButton ? restoreWebdavButton.textContent : '恢复';
  try {
    if (!invoke) {
      await showSettingsResultDialog('恢复本地备份归档失败', '未检测到 Tauri API，请检查应用环境。');
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 配置');
      return;
    }
    currentSettingsOpsState = settingsOpsRuntime?.withRestoreRunning
      ? settingsOpsRuntime.withRestoreRunning(currentSettingsOpsState)
      : {
          ...currentSettingsOpsState,
          restoreRunning: true,
          restoreLabel: '恢复中...',
        };
    syncVueSettingsOpsState();
    if (restoreWebdavButton) {
      restoreWebdavButton.classList.add('is-loading');
      restoreWebdavButton.disabled = true;
      restoreWebdavButton.textContent = '恢复中...';
    }
    await invoke('restore_webdav', { path: record.backupPath });
    pendingUploads.clear();
    uploadSpeed.clear();
    renderUploadTasks();
    await refreshMessages();
    await loadMarkedTags();
    await loadMarkedMessages();
    await loadSettingsBackupArchives({ silent: true });
    await showSettingsResultDialog('恢复本地备份归档成功', '已从本地归档恢复 WebDAV 数据。');
    setSuccessStatus('本地备份归档已恢复');
  } catch (error) {
    await showSettingsResultDialog('恢复本地备份归档失败', String(error));
    setErrorStatus(`恢复本地备份归档失败：${error}`);
  } finally {
    currentSettingsOpsState = settingsOpsRuntime?.withRestoreIdle
      ? settingsOpsRuntime.withRestoreIdle(currentSettingsOpsState)
      : {
          ...currentSettingsOpsState,
          restoreRunning: false,
          restoreLabel: '恢复 WebDAV',
        };
    syncVueSettingsOpsState();
    if (restoreWebdavButton) {
      restoreWebdavButton.classList.remove('is-loading');
      restoreWebdavButton.disabled = false;
      restoreWebdavButton.textContent = originalText;
    }
  }
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

async function copySentTextAfterSend(text) {
  if (!currentSettingsFormState.copyAfterSend || !String(text || '').trim()) {
    return;
  }
  await copyTextToClipboard(text);
}

function syncSendOptionsMenuState() {
  if (quickCopyAfterSendInput) {
    quickCopyAfterSendInput.checked = !!currentSettingsFormState.copyAfterSend;
  }
}

function closeSendOptionsMenu() {
  if (sendOptionsMenu) {
    sendOptionsMenu.hidden = true;
  }
  if (sendOptionsToggle) {
    sendOptionsToggle.setAttribute('aria-expanded', 'false');
  }
}

function toggleSendOptionsMenu(event) {
  event?.stopPropagation?.();
  if (!sendOptionsMenu || !sendOptionsToggle) {
    return;
  }
  const nextHidden = !sendOptionsMenu.hidden;
  sendOptionsMenu.hidden = nextHidden;
  sendOptionsToggle.setAttribute('aria-expanded', nextHidden ? 'false' : 'true');
  syncSendOptionsMenuState();
}

async function updateQuickSendOption(field, checked) {
  updateSettingsFormField(field, !!checked, { skipAutoSave: true });
  try {
    await saveSettings({ silent: true });
    showToast('发送设置已更新', 'success');
  } catch (error) {
    showToast(`发送设置保存失败：${error}`, 'error');
    await loadSettings();
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

function stripMarkdownForFilename(value) {
  const source = String(value || '');
  const underscoreToken = 'TRANSFER_GENIE_FILENAME_UNDERSCORE';
  const protectedSource = source.replaceAll('_', underscoreToken);
  const markedRuntime = window.marked || window.marked?.marked;
  if (markedRuntime?.parseInline) {
    const holder = document.createElement('div');
    holder.innerHTML = markedRuntime.parseInline(protectedSource);
    return (holder.textContent || holder.innerText || '').replaceAll(underscoreToken, '_');
  }
  return protectedSource
    .replace(/^\s{0,3}#{1,6}\s+/g, '')
    .replace(/^\s{0,3}>\s?/g, '')
    .replace(/^\s*[-*+]\s+/g, '')
    .replace(/^\s*\d+[.)]\s+/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*~]/g, '')
    .replaceAll(underscoreToken, '_');
}

function buildTextDownloadFilename(message) {
  const extension = message?.format === 'markdown' ? 'md' : 'txt';
  const firstLine = String(message?.content || '')
    .split(/\r?\n/)
    .find((line) => line.trim())
    ?.trim();
  const titleSource = message?.format === 'markdown'
    ? stripMarkdownForFilename(firstLine)
    : firstLine;
  const title = String(titleSource || 'message')
    .replace(/[\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '')
    .slice(0, 80);
  return `${title || 'message'}.${extension}`;
}

function splitDownloadFilenameParts(originalName) {
  const safeName = String(originalName || 'download.bin').split(/[/\\]/).pop() || 'download.bin';
  const dotIndex = safeName.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === safeName.length - 1) {
    return { filename: safeName, fileSuffix: '' };
  }
  return {
    filename: safeName.slice(0, dotIndex),
    fileSuffix: safeName.slice(dotIndex + 1),
  };
}

function formatDownloadDate(timestampMs) {
  const date = new Date(Number(timestampMs) || Date.now());
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function buildDownloadFilenameFromRule(message, fallbackName) {
  const originalName = message?.original_name || fallbackName || 'download.bin';
  const rule = settingsFormRuntime?.normalizeSaveFilenameRule
    ? settingsFormRuntime.normalizeSaveFilenameRule(
        currentSettingsFormState.saveFilenameRule,
        DEFAULT_SAVE_FILENAME_RULE,
      )
    : String(currentSettingsFormState.saveFilenameRule || DEFAULT_SAVE_FILENAME_RULE).trim();
  const parts = splitDownloadFilenameParts(originalName);
  const ruleWithSuffix = parts.fileSuffix ? rule : rule.replaceAll('.{file_suffix}', '');
  const rendered = ruleWithSuffix
    .replaceAll('{yyyymmdd}', formatDownloadDate(message?.timestamp_ms))
    .replaceAll('{filename}', parts.filename)
    .replaceAll('{file_suffix}', parts.fileSuffix);
  return String(rendered || originalName).split(/[/\\]/).pop() || originalName;
}

async function downloadTextMessageAsFile(message) {
  try {
    const content = message?.content || '';
    if (!content) {
      showToast('没有可下载的内容', 'error');
      return;
    }

    const textFilename = buildTextDownloadFilename(message);
    const defaultPath = buildDownloadFilenameFromRule(
      { ...message, original_name: textFilename },
      textFilename,
    );
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
  let deletedFilenames = [];
  try {
    const result = await invoke('delete_messages', {
      filenames: [message.filename],
      deleteRemote: choice === 'remote',
    });
    const failed = result.failed || [];
    deletedFilenames = resolveDeletedFilenames([message.filename], failed);
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
    await refreshMessageListsAfterDelete(deletedFilenames);
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
  let deletedFilenames = [];
  try {
    const result = await invoke('delete_messages', {
      filenames,
      deleteRemote: choice === 'remote',
    });
    const failed = result.failed || [];
    deletedFilenames = resolveDeletedFilenames(filenames, failed);
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
    if (deletedFilenames.length > 0) {
      await refreshMessageListsAfterDelete(deletedFilenames, { render: false });
    } else {
      await Promise.all([
        loadMessages({ checkNew: true, scrollToBottom: false }),
        loadMarkedMessages(),
      ]);
    }
  }
}

window.setActiveTab = setActiveTab;
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
      renderCurrentMessageView();
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
             renderCurrentMessageView();
        }
    } else {
        renderCurrentMessageView();
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
      window.editormd.markdownToHTML(uniqueId, {
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
    meta.textContent = viewModel.metaText;

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

function captureMessageListAnchor() {
  const list = getCurrentMessageList();
  if (!list) return null;
  const listRect = list.getBoundingClientRect();
  const items = Array.from(list.querySelectorAll('.message-card[data-filename]'));
  const anchorItem = items.find((item) => item.getBoundingClientRect().bottom > listRect.top + 1) || items[0];
  if (!anchorItem) {
    return null;
  }
  const anchorRect = anchorItem.getBoundingClientRect();
  return {
    filename: anchorItem.dataset.filename || '',
    offsetTop: anchorRect.top - listRect.top,
  };
}

function restoreMessageListAnchor(anchor, previousScrollTop, previousScrollHeight) {
  const list = getCurrentMessageList();
  if (!list) return;

  if (anchor?.filename) {
    const items = Array.from(list.querySelectorAll('.message-card[data-filename]'));
    const anchorItem = items.find((item) => item.dataset.filename === anchor.filename);
    if (anchorItem) {
      const listRect = list.getBoundingClientRect();
      const anchorRect = anchorItem.getBoundingClientRect();
      list.scrollTop += anchorRect.top - listRect.top - anchor.offsetTop;
      lastMessageListScrollTop = list.scrollTop;
      updateScrollToBottomButton();
      return;
    }
  }

  const newScrollHeight = list.scrollHeight;
  const scrollDiff = newScrollHeight - previousScrollHeight;
  list.scrollTop = previousScrollTop + scrollDiff;
  lastMessageListScrollTop = list.scrollTop;
  updateScrollToBottomButton();
}

function getLoadMoreHintText(options = {}) {
  const { isSearchResult = false } = options;
  if (isLoadingMore) {
    return isSearchResult ? '加载中，继续筛选更多结果...' : '加载中...';
  }
  return isSearchResult ? '向上滚动加载更多并保持搜索结果' : '向上滚动加载更多';
}

function buildHomeFeedViewState(options = {}) {
  const query =
    typeof options.query === 'string' ? options.query : (searchInput ? searchInput.value.trim() : '');
  const visibleCount = Array.isArray(options.messages) ? options.messages.length : 0;
  const messageCards = Array.isArray(options.messages)
    ? options.messages.map((message) => createMessageViewModel(message))
    : [];
  const useVueList =
    hasVueAppShell &&
    visibleCount > 0 &&
    !selectionMode &&
    messageCards.length === visibleCount &&
    messageCards.every((card) => card.canRenderInVue);
  const hasQuery = query.length > 0;
  let emptyMessage = '';
  if (visibleCount === 0) {
    emptyMessage = hasQuery ? `没有找到与 "${query}" 匹配的消息` : '暂无消息';
  }
  return {
    searchQuery: query,
    visibleCount,
    hasMoreMessages: !!hasMoreMessages,
    isLoadingMore: !!isLoadingMore,
    loadMoreHintText:
      hasMoreMessages || isLoadingMore
        ? getLoadMoreHintText({ isSearchResult: hasQuery })
        : '',
    emptyMessage,
    messageCards,
    useVueList,
  };
}

function syncVueHomeFeedView(options = {}) {
  syncVueHomeFeed(buildHomeFeedViewState(options));
}

function renderMessages(messages, options = {}) {
  const { scrollToBottom = false, preserveScroll = false, isSearchResult = false, query = '' } = options;
  // The `messages` parameter is now the single source of truth for this render pass.
  // We no longer modify the global `lastMessages` here.
  const merged = mergeMessages(messages, options);
  const currentList = getCurrentMessageList();
  const previousScrollTop = currentList ? currentList.scrollTop : 0;
  const previousScrollHeight = currentList ? currentList.scrollHeight : 0;
  const scrollAnchor = preserveScroll ? captureMessageListAnchor() : null;
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
  const applyPreservedScroll = () => {
    if (!preserveScroll || !messageList) {
      return;
    }
    restoreMessageListAnchor(scrollAnchor, previousScrollTop, previousScrollHeight);
  };

  if (!merged || merged.length === 0) {
    syncVueHomeFeedView({
      query,
      messages: [],
    });
    updateScrollToBottomButton();
    return;
  }

  merged.forEach((message) => {
    const viewModel = createMessageViewModel(message);
    const item = document.createElement('li');
    item.className = 'message-card';
    const selfName = (currentSettingsFormState.senderName || '').trim();
    const isSelf = message.sender === '我' || (selfName && message.sender === selfName);
    let fileBodyClickTimer = null;
    item.classList.toggle('is-file', viewModel.isFile);
    item.classList.toggle('is-text', viewModel.isText);
    item.classList.toggle('is-self', viewModel.isSelf);
    item.classList.toggle('is-marked', viewModel.isMarked);
    item.classList.toggle('with-selection', selectionMode);
    item.dataset.filename = viewModel.filename;
    item.classList.toggle('is-selected', selectedMessages.has(viewModel.filename));

    const header = document.createElement('div');
    header.className = 'message-header';
    let selectionCheckbox = null;
    if (selectionMode) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'message-select';
      checkbox.checked = selectedMessages.has(viewModel.filename);
      checkbox.disabled = !!message.uploading;
      checkbox.addEventListener('change', () => {
        toggleSelectedMessage(viewModel.filename, checkbox.checked);
        item.classList.toggle('is-selected', checkbox.checked);
      });
      selectionCheckbox = checkbox;
      item.appendChild(checkbox);
    }
    const headerText = document.createElement('span');
    headerText.textContent = viewModel.headerText;
    header.appendChild(headerText);

    const body = document.createElement('div');
    body.className = 'message-body';
    if (message.kind === 'text') {
      if (viewModel.isMarkdown) {
        body.classList.add('markdown-body', 'editormd-html-preview', 'is-markdown');
        // Generate a safe unique ID
        const uniqueId = `md-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        body.id = uniqueId;
        
        markdownRenderQueue.push({
          id: uniqueId,
          content: viewModel.bodyText,
        });
      } else {
        body.textContent = viewModel.bodyText;
      }
      collapseQueue.push({ item, body, message });
    } else {
      if (viewModel.isImage) {
        body.classList.add('is-image-message');
        body.innerHTML = ''; // Clear existing content

        const thumbImg = document.createElement('img');
        thumbImg.className = 'message-thumbnail';
        thumbImg.alt = '缩略图';

        const fileNameSpan = document.createElement('span');
        fileNameSpan.textContent = viewModel.originalName;

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
        body.textContent = viewModel.bodyText;
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
        const nextChecked = !selectedMessages.has(viewModel.filename);
        toggleSelectedMessage(viewModel.filename, nextChecked);
        item.classList.toggle('is-selected', nextChecked);
        if (selectionCheckbox) {
          selectionCheckbox.checked = nextChecked;
        }
        return;
      }
      if (!viewModel.isFile || message.uploading) {
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
            const contentToUse = message.content || '';
            const cw = window.transferGenieComposer;
            if (cw && cw.isActive && cw.isActive()) {
              if (cw.setActiveDraftFormat) cw.setActiveDraftFormat(formatToUse);
              if (cw.setActiveDraftText) cw.setActiveDraftText(contentToUse);
            } else {
              switchFormat(formatToUse);
              if (formatToUse === 'markdown' && mdEditor) {
                mdEditor.setMarkdown(contentToUse);
              } else {
                textInput.value = contentToUse;
              }
            }
            renderCurrentMessageView();
            sendText();
          });
          actions.appendChild(retryButton);
          
          // 添加取消按钮
          const cancelButton = document.createElement('button');
          cancelButton.className = 'button ghost small';
          cancelButton.textContent = '取消';
          cancelButton.addEventListener('click', () => {
            pendingSends.delete(message.filename);
            renderCurrentMessageView();
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
        const addToPaneTextBtn = document.createElement('button');
        addToPaneTextBtn.className = 'button ghost small';
        addToPaneTextBtn.textContent = '添加到分栏';
        addToPaneTextBtn.addEventListener('click', () => {
          menu.open = false;
          const store = window.transferGenieComposerStore;
          if (store && store.dockMessageAsDraft) {
            const paneId = store.state.activePaneId || (store.state.panes[0] && store.state.panes[0].id);
            if (paneId) store.dockMessageAsDraft(message, paneId, 'center');
          }
        });
        menuList.appendChild(addToPaneTextBtn);
        menuList.appendChild(deleteButton);
        menu.appendChild(summary);
        menu.appendChild(menuList);
        actions.appendChild(menu);
        
        // 检测菜单是否应该在图标上方显示
        menu.addEventListener('toggle', () => {
          setTimeout(() => positionActionMenu(menu), 0);
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
        const addToPaneBtn = document.createElement('button');
        addToPaneBtn.className = 'button ghost small';
        addToPaneBtn.textContent = '添加到分栏';
        addToPaneBtn.addEventListener('click', () => {
          menu.open = false;
          const store = window.transferGenieComposerStore;
          if (store && store.dockMessageAsDraft) {
            const paneId = store.state.activePaneId || (store.state.panes[0] && store.state.panes[0].id);
            if (paneId) store.dockMessageAsDraft(message, paneId, 'center');
          }
        });
        menuList.appendChild(addToPaneBtn);
        menuList.appendChild(deleteButton);
        menu.appendChild(summary);
        menu.appendChild(menuList);
        actions.appendChild(menu);
        
        // 检测菜单是否应该在图标上方显示
        menu.addEventListener('toggle', () => {
          setTimeout(() => positionActionMenu(menu), 0);
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
      toggleSelectedMessage(viewModel.filename, selectionCheckbox.checked);
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
  
  // Render "Load More" item at the top if not searching
  if (!isSearchResult && messageList) {
    const loadMoreItem = document.createElement('li');
    loadMoreItem.id = 'feed-load-more-item';
    loadMoreItem.className = 'message-card feed-load-more-card';
    
    if (hasMoreMessages) {
      loadMoreItem.textContent = '加载更多消息';
      loadMoreItem.addEventListener('click', () => {
        loadMessages({ loadMore: true });
      });
    } else {
      loadMoreItem.textContent = '没有更多消息';
      loadMoreItem.classList.add('is-disabled');
    }
    messageList.prepend(loadMoreItem);
  }

  // Render pending markdown messages
  const runBodyCollapseCheck = () => {
    collapseQueue.forEach(({ item, body, message }) => {
      applyMessageBodyCollapse(item, body, message);
    });
    if (preserveScroll) {
      requestAnimationFrame(applyPreservedScroll);
    }
    applyForcedScrollToBottomIfNeeded();
  };
  if (markdownRenderQueue.length > 0 && window.editormd) {
    // execute after DOM update
    setTimeout(() => {
      markdownRenderQueue.forEach(item => {
        try {
          window.editormd.markdownToHTML(item.id, {
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

  syncVueHomeFeedView({
    query,
    messages: merged,
  });

  if (scrollToBottom) {
    forceScrollMessageListToBottom();
  } else if (preserveScroll && messageList) {
    // 加载更多历史消息时，优先按首个可见消息锚点恢复视口位置。
    applyPreservedScroll();
  } else {
    const list = getCurrentMessageList();
    if (list) {
      const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
      list.scrollTop = Math.min(previousScrollTop, maxScrollTop);
      lastMessageListScrollTop = list.scrollTop;
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
        sender: getCurrentSenderName() || '我',
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
  
  const loadMoreItem = document.getElementById('feed-load-more-item');
  if (options.loadMore && loadMoreItem && !loadMoreItem.classList.contains('is-disabled')) {
    loadMoreItem.textContent = '加载中...';
    loadMoreItem.classList.add('is-disabled'); // prevent clicks during load
  }

  const shouldScroll =
    typeof options.scrollToBottom === 'boolean'
      ? options.scrollToBottom
      : isMessageListAtBottom();
  const forceScrollToBottom = !!options.forceScrollToBottom;
  const preserveScroll = !!options.preserveScroll;
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
      renderCurrentMessageView({ scrollToBottom: shouldScroll, preserveScroll });
      return;
    }
    
    if (loadMore) {
      // 加载更多历史消息
      if (isLoadingMore || !hasMoreMessages || !oldestLoadedMessageRef) return;
      isLoadingMore = true;
      updateLoadMoreHintForCurrentView();
      const result = await invoke('list_messages_window', {
        input: {
          limit: PAGE_SIZE,
          beforeTimestampMs: oldestLoadedMessageRef.timestamp_ms,
          beforeFilename: oldestLoadedMessageRef.filename,
        },
      });
      isLoadingMore = false;
      hasMoreMessages = result.hasMoreBefore || false;
      totalMessages = result.total || totalMessages;
      updateLoadMoreHintForCurrentView();
      
      if (result.marked_count !== undefined) {
        updateMarkedBadge(result.marked_count);
      }

      if (result.messages && result.messages.length > 0) {
        // 将新加载的消息添加到开头
        lastMessages = [...result.messages, ...lastMessages];
        syncLoadedMessageBoundaries();
        renderCurrentMessageView({ scrollToBottom: false, preserveScroll: true });
      }
    } else if (checkNew) {
      // 定时刷新模式：只检查新消息
      const latestResult = await invoke('list_messages_window', { input: { limit: PAGE_SIZE } });
      
      if (latestResult.marked_count !== undefined) {
        updateMarkedBadge(latestResult.marked_count);
      }

      const newerResult = newestLoadedMessageRef
        ? await invoke('list_messages_window', {
            input: {
              limit: PAGE_SIZE,
              afterTimestampMs: newestLoadedMessageRef.timestamp_ms,
              afterFilename: newestLoadedMessageRef.filename,
            },
          })
        : latestResult;

      const newMessages = newerResult.messages || [];

      if (feedState?.reconcileCheckNewState) {
        const reconciled = feedState.reconcileCheckNewState(
          {
            lastMessages,
            totalMessages,
            hasMoreMessages,
            oldestLoadedMessageRef,
            newestLoadedMessageRef,
          },
          latestResult.messages || [],
          newMessages,
          latestResult.total || 0,
          latestResult.hasMoreBefore || false,
        );
        lastMessages = reconciled.state.lastMessages;
        totalMessages = reconciled.state.totalMessages;
        hasMoreMessages = reconciled.state.hasMoreMessages;
        oldestLoadedMessageRef = reconciled.state.oldestLoadedMessageRef;
        newestLoadedMessageRef = reconciled.state.newestLoadedMessageRef;
        if (reconciled.shouldRender) {
          renderCurrentMessageView({
            scrollToBottom: lastMessages.length === reconciled.appendedCount ? shouldScroll : false,
          });
        }
        return;
      }
      
      if (newMessages.length === 0) {
        if (lastMessages.length > 0) {
          const latestMessages = latestResult.messages || [];
          const latestMessagesMap = new Map(latestMessages.map((msg) => [msg.filename, msg]));
          let stateChanged = false;
          lastMessages = lastMessages.map((oldMsg) => {
            const next = latestMessagesMap.get(oldMsg.filename);
            if (!next) {
              return oldMsg;
            }
            if (
              oldMsg.marked !== next.marked ||
              oldMsg.local_path !== next.local_path ||
              oldMsg.marked_pinned !== next.marked_pinned ||
              JSON.stringify(oldMsg.marked_tag_ids || []) !== JSON.stringify(next.marked_tag_ids || [])
            ) {
              stateChanged = true;
              return { ...oldMsg, ...next };
            }
            return oldMsg;
          });
          totalMessages = latestResult.total || totalMessages;
          hasMoreMessages = latestResult.hasMoreBefore || false;
          syncLoadedMessageBoundaries();
          if (stateChanged) {
            renderCurrentMessageView({ scrollToBottom: false });
          }
        }
        return;
      }
      
      if (lastMessages.length === 0) {
        lastMessages = newMessages;
        syncLoadedMessageBoundaries();
        totalMessages = latestResult.total || 0;
        hasMoreMessages = latestResult.hasMoreBefore || false;
        renderCurrentMessageView({ scrollToBottom: shouldScroll });
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
        if (actualNewMessages.length > 0) {
          lastMessages = [...lastMessages, ...actualNewMessages];
        }
        syncLoadedMessageBoundaries();
        totalMessages = latestResult.total || 0;
        hasMoreMessages = latestResult.hasMoreBefore || false;
        
        // 如果当前在底部，自动滚动到底��显示新消息
        // 如果当前在底部，或者由于状态更新触发，自动滚动/重新渲染
        renderCurrentMessageView({ scrollToBottom: false });
      } else {
        // 没有新消息，但可能总数变化了（比如有消息被删除）
        if (totalMessages !== latestResult.total) {
          totalMessages = latestResult.total || 0;
          hasMoreMessages = latestResult.hasMoreBefore || false;
          syncLoadedMessageBoundaries();
        }
      }
    } else {
      // 初始加载或刷新：加载最新的消息
      const result = await invoke('list_messages_window', { input: { limit: PAGE_SIZE } });
      
      if (result.marked_count !== undefined) {
        updateMarkedBadge(result.marked_count);
      }

      lastMessages = result.messages || [];
      syncLoadedMessageBoundaries();
      totalMessages = result.total || 0;
      hasMoreMessages = result.hasMoreBefore || false;
      renderCurrentMessageView({ scrollToBottom: shouldScroll });
    }
  } catch (error) {
    isLoadingMore = false;
    updateLoadMoreHintForCurrentView();
    setErrorStatus(`加载消息失败：${error}`);
    if (loadMoreItem && hasMoreMessages) {
       loadMoreItem.textContent = '加载更多消息';
       loadMoreItem.classList.remove('is-disabled');
    }
  } finally {
    isLoadMessagesRunning = false;
    if (!loadMore && getActiveMainTab() === 'marked') {
      loadMarkedMessages();
    }
    if (forceScrollToBottom) {
      forceScrollMessageListToBottom(2500);
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
    if (status.conflict) {
      await handleWebdavConflictStatus(status.conflict);
      return;
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

    if (feedState?.shouldAutoRefreshTick) {
      const tickResult = feedState.shouldAutoRefreshTick({
        isRefreshRunning,
        hasActiveEndpoint: !!getActiveEndpoint(),
        hasSearchQuery,
        hasActiveTransfer: hasActiveContentTransfer(),
        selectionPaused: isMessageSelectionRefreshPaused(),
        activeTab: getActiveMainTab(),
        refreshCountdownSecs,
        intervalSecs: interval,
      });
      refreshCountdownSecs = tickResult.nextCountdownSecs;
      updateRefreshCountdown();
      if (tickResult.shouldRefresh) {
        await refreshMessages({ manual: false });
      }
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
  if (settingsFormRuntime?.normalizeTelegramPollInterval) {
    return settingsFormRuntime.normalizeTelegramPollInterval(
      value,
      DEFAULT_TELEGRAM_POLL_INTERVAL_SECS,
    );
  }
  return Math.max(DEFAULT_TELEGRAM_POLL_INTERVAL_SECS, Number(value) || DEFAULT_TELEGRAM_POLL_INTERVAL_SECS);
}

function getTelegramBridgeFormState() {
  if (settingsFormRuntime?.getTelegramBridgeFormState) {
    return settingsFormRuntime.getTelegramBridgeFormState(
      currentSettingsFormState,
      !!getActiveEndpoint(),
    );
  }
  const botToken = (currentSettingsFormState.telegramBotToken || '').trim();
  const chatId = (currentSettingsFormState.telegramChatId || '').trim();
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
    syncVueLocalHttpApiStatus(status);
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
  if (settingsFormRuntime?.normalizeLocalHttpApiBindPort) {
    return settingsFormRuntime.normalizeLocalHttpApiBindPort(value);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }
  return parsed;
}

function getLocalHttpApiConfiguredUrl() {
  if (settingsFormRuntime?.getLocalHttpApiConfiguredUrl) {
    return settingsFormRuntime.getLocalHttpApiConfiguredUrl(currentSettingsFormState, {
      defaultBindAddress: DEFAULT_LOCAL_HTTP_API_BIND_ADDRESS,
      defaultBindPort: DEFAULT_LOCAL_HTTP_API_BIND_PORT,
    });
  }
  const bindAddress =
    (currentSettingsFormState.localHttpApiBindAddress || DEFAULT_LOCAL_HTTP_API_BIND_ADDRESS).trim();
  const bindPort =
    normalizeLocalHttpApiBindPort(currentSettingsFormState.localHttpApiBindPort) ||
    DEFAULT_LOCAL_HTTP_API_BIND_PORT;
  const wrappedAddress =
    bindAddress.includes(':') && !bindAddress.startsWith('[') ? `[${bindAddress}]` : bindAddress;
  return `http://${wrappedAddress}:${bindPort}/api/send-file`;
}

function renderLocalHttpApiStatus(status) {
  if (!localHttpApiStatusLabel || !localHttpApiAddressLabel || !localHttpApiLastErrorLabel) return;
  const visualState = settingsRuntimeStatus?.getLocalHttpApiVisualState
    ? settingsRuntimeStatus.getLocalHttpApiVisualState(status, getLocalHttpApiConfiguredUrl())
    : null;
  const state = visualState?.state || status?.state || 'disabled';
  const running = !!visualState?.running || state === 'running';
  const failed = !!visualState?.failed || state === 'start_failed';
  const pending = !!visualState?.pending || state === 'pending';
  const address = visualState?.address || status?.address || getLocalHttpApiConfiguredUrl();
  const lastError = visualState?.lastError || status?.lastError || status?.last_error || '';

  localHttpApiStatusLabel.classList.toggle('is-running', running);
  localHttpApiStatusLabel.classList.toggle('is-stopped', !running && !pending);
  localHttpApiStatusLabel.textContent = visualState?.stateLabel || (running
    ? '运行中'
    : failed
      ? '启动失败'
      : pending
        ? '状态获取中'
        : '已关闭');
  localHttpApiAddressLabel.textContent = visualState?.addressText || address || '未配置';
  localHttpApiLastErrorLabel.textContent = visualState?.lastErrorText || lastError || '无';
}

function syncTelegramProxyControlsState() {
  const proxyEnabled = !!currentSettingsFormState.telegramProxyEnabled;
  if (telegramProxyUrlInput) {
    telegramProxyUrlInput.disabled = !proxyEnabled;
  }
}

function syncTelegramControlsState() {
  const { isConfigured } = getTelegramBridgeFormState();
  const running = telegramBridgeStatusLabel?.dataset.running === 'true';
  const controls = settingsRuntimeStatus?.getTelegramControlState
    ? settingsRuntimeStatus.getTelegramControlState({ isConfigured, running })
    : null;
  if (telegramStartServiceButton) {
    telegramStartServiceButton.disabled = controls
      ? controls.startDisabled
      : running || !isConfigured;
    telegramStartServiceButton.hidden = controls ? controls.startHidden : running;
  }
  if (telegramStopServiceButton) {
    telegramStopServiceButton.disabled = controls ? controls.stopDisabled : !running;
    telegramStopServiceButton.hidden = controls ? controls.stopHidden : !running;
  }
}

function setTelegramBridgeStatus(status) {
  if (!telegramBridgeStatusLabel || !telegramBridgeLastErrorLabel) return;
  const visualState = settingsRuntimeStatus?.getTelegramBridgeVisualState
    ? settingsRuntimeStatus.getTelegramBridgeVisualState(status, formatTime)
    : null;
  const running = visualState ? !!visualState.running : !!status?.running;
  telegramBridgeStatusLabel.dataset.running = running ? 'true' : 'false';
  telegramBridgeStatusLabel.classList.toggle('is-running', running);
  telegramBridgeStatusLabel.classList.toggle('is-stopped', !running);
  telegramBridgeStatusLabel.textContent = visualState?.stateLabel || '未运行';
  telegramBridgeLastErrorLabel.textContent =
    visualState?.lastErrorText || status?.last_error || '无';
  syncTelegramControlsState();
}

async function loadTelegramBridgeStatus(options = {}) {
  try {
    if (!invoke) return;
    const status = await invoke('get_telegram_bridge_status');
    setTelegramBridgeStatus(status);
    syncVueTelegramBridgeStatus(status);
  } catch (error) {
    if (!options.silent) {
      setErrorStatus(`读取 Telegram bridge 状态失败：${error}`);
    }
  }
}

async function loadIntegrationModules(options = {}) {
  try {
    if (!invoke) return;
    const modules = await invoke('list_integration_modules');
    syncVueIntegrationModules(modules);
  } catch (error) {
    if (!options.silent) {
      setErrorStatus(`读取集成模块状态失败：${error}`);
    }
  }
}

function clearTelegramChatCandidates() {
  if (!telegramChatCandidates) return;
  telegramChatCandidates.innerHTML = '';
  telegramChatCandidates.hidden = true;
}

function maybeApplyTelegramSenderName(candidate) {
  if ((currentSettingsFormState.telegramSenderName || '').trim()) return false;
  const nextSenderName = candidate?.sender_name ? String(candidate.sender_name).trim() : '';
  if (!nextSenderName) return false;
  if (telegramSenderNameInput) {
    telegramSenderNameInput.value = nextSenderName;
  }
  updateSettingsFormField('telegramSenderName', nextSenderName);
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
      applyTelegramChatIdValue(candidate.id || '');
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
    const botToken = (currentSettingsFormState.telegramBotToken || '').trim();
    const proxyEnabled = !!currentSettingsFormState.telegramProxyEnabled;
    const proxyUrl = proxyEnabled ? (currentSettingsFormState.telegramProxyUrl || '').trim() : '';
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
      applyTelegramChatIdValue(candidates[0].id || '');
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
    const botToken = (currentSettingsFormState.telegramBotToken || '').trim();
    const proxyEnabled = !!currentSettingsFormState.telegramProxyEnabled;
    const proxyUrl = proxyEnabled ? (currentSettingsFormState.telegramProxyUrl || '').trim() : '';
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
      applyTelegramChatIdValue(candidates[0].id || '');
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
    syncVueTelegramBridgeStatus(status);
    await loadIntegrationModules({ silent: true });
    await showSettingsResultDialog('启动 Telegram Bridge 成功', 'Telegram bridge 已启动。');
    setSuccessStatus('Telegram bridge 已启动');
  } catch (error) {
    await loadTelegramBridgeStatus({ silent: true });
    await loadIntegrationModules({ silent: true });
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
    syncVueTelegramBridgeStatus(status);
    await loadIntegrationModules({ silent: true });
    await showSettingsResultDialog('停止 Telegram Bridge 成功', 'Telegram bridge 已停止。');
    setSuccessStatus('Telegram bridge 已停止');
  } catch (error) {
    await loadTelegramBridgeStatus({ silent: true });
    await loadIntegrationModules({ silent: true });
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

async function installAvailableAppUpdate(updateResult) {
  if (!invoke) {
    await showInfoDialog({
      title: '安装更新失败',
      message: '未检测到 Tauri API，请检查应用环境。',
    });
    return false;
  }

  const controller = showUpdateInstallProgressDialog();
  controller.setMessage(`准备安装 ${updateResult?.update?.version || '新版本'}...`);

  try {
    await invoke('download_and_install_update');
    closeUpdateInstallProgressDialog();

    const shouldRestart = await showConfirmDialog({
      title: '更新已安装',
      message: '更新已安装完成，是否立即重启应用？',
      confirmLabel: '立即重启',
      cancelLabel: '稍后重启',
    });

    if (shouldRestart) {
      await invoke('restart_app');
    } else {
      setSuccessStatus('更新已安装，将在下次重启后完成切换');
    }

    return true;
  } catch (error) {
    closeUpdateInstallProgressDialog();
    await showInfoDialog({
      title: '安装更新失败',
      message: String(error),
      preserveWhitespace: true,
    });
    setErrorStatus(`安装更新失败：${error}`);
    return false;
  }
}

async function checkForAppUpdate(options = {}) {
  const silent = !!options.silent;
  const source = options.source || 'manual';

  if (!invoke) {
    if (!silent) {
      await showInfoDialog({
        title: '检查更新失败',
        message: '未检测到 Tauri API，请检查应用环境。',
      });
    }
    return null;
  }

  if (isAutoUpdateChecking) {
    if (!silent) {
      await showInfoDialog({
        title: '检查更新',
        message: '当前正在检查更新，请稍候再试。',
      });
      setErrorStatus('检查更新失败：当前正在检查更新，请稍候再试');
    }
    return null;
  }

  if (source !== 'auto') {
    cancelPendingAutoUpdateCheck();
  }

  isAutoUpdateChecking = true;
  hasAutoUpdateCheckedThisSession = true;

  if (checkUpdateButton && source === 'manual') {
    checkUpdateButton.disabled = true;
    checkUpdateButton.textContent = '检查中...';
  }

  try {
    const result = await invoke('check_app_update');
    if (!result?.available) {
      if (!silent) {
        await showInfoDialog({
          title: '检查更新',
          message: `当前已是最新版本（${result?.currentVersion || '未知版本'}）。`,
        });
      }
      return result;
    }

    const confirmed = await showConfirmDialog({
      title: '发现新版本',
      message: buildUpdateMessage(result),
      confirmLabel: '立即更新',
      cancelLabel: '稍后再说',
      preserveWhitespace: true,
    });

    if (!confirmed) {
      if (!silent) {
        setSuccessStatus(`已跳过本次更新：${result.update?.version || ''}`.trim());
      }
      return result;
    }

    await installAvailableAppUpdate(result);
    return result;
  } catch (error) {
    if (!silent) {
      await showInfoDialog({
        title: '检查更新失败',
        message: String(error),
        preserveWhitespace: true,
      });
      setErrorStatus(`检查更新失败：${error}`);
    } else {
      console.warn('自动检查更新失败：', error);
    }
    return null;
  } finally {
    isAutoUpdateChecking = false;
    if (checkUpdateButton && source === 'manual') {
      checkUpdateButton.disabled = false;
      checkUpdateButton.textContent = '检查更新';
    }
  }
}

function scheduleAutoUpdateCheck() {
  if (!currentSettingsFormState.autoUpdateEnabled) {
    return;
  }
  if (hasAutoUpdateCheckedThisSession || isAutoUpdateChecking) {
    return;
  }
  cancelPendingAutoUpdateCheck();
  autoUpdateCheckTimer = window.setTimeout(() => {
    autoUpdateCheckTimer = null;
    if (!currentSettingsFormState.autoUpdateEnabled) {
      return;
    }
    checkForAppUpdate({ silent: true, source: 'auto' });
  }, 3000);
}

function applySettings(settings) {
  syncVueSettings(settings);
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
    speedTestRunning: false,
    speedTestResult: null,
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
  const telegram = settings.telegram || {};
  const ai = settings.ai || {};
  const speechToText = settings.speech_to_text || {};
  const send = settings.send || {};
  const aiProvider = ai.provider || {};
  const aiActions = normalizeAiActions(ai.actions);
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
  if (saveFilenameRuleInput) {
    saveFilenameRuleInput.value = settings.save_filename_rule || DEFAULT_SAVE_FILENAME_RULE;
  }
  if (autoStartInput) {
    autoStartInput.checked = settings.auto_start || false;
  }
  if (autoUpdateEnabledInput) {
    autoUpdateEnabledInput.checked = !!settings.auto_update_enabled;
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
  if (speechToTextEnabledInput) speechToTextEnabledInput.checked = !!speechToText.enabled;
  if (speechToTextApiKeyInput) speechToTextApiKeyInput.value = speechToText.api_key || '';
  if (speechToTextResourceIdInput) speechToTextResourceIdInput.value = speechToText.resource_id || DEFAULT_SPEECH_TO_TEXT_RESOURCE_ID;
  if (speechToTextEndpointInput) speechToTextEndpointInput.value = speechToText.endpoint || DEFAULT_SPEECH_TO_TEXT_ENDPOINT;
  if (speechToTextMicrophoneInput) speechToTextMicrophoneInput.value = speechToText.microphone_device_id || '';
  if (speechToTextCaptureSystemAudioInput) speechToTextCaptureSystemAudioInput.checked = !!speechToText.capture_system_audio;
  if (speechToTextSystemAudioDeviceInput) speechToTextSystemAudioDeviceInput.value = speechToText.system_audio_device_id || '';
  if (speechToTextShortcutEnabledInput) speechToTextShortcutEnabledInput.checked = !!speechToText.shortcut_enabled;
  if (speechToTextShortcutInput) speechToTextShortcutInput.value = (speechToText.shortcut || DEFAULT_SPEECH_TO_TEXT_SHORTCUT).toLowerCase();
  if (speechToTextTaskRetentionInput) speechToTextTaskRetentionInput.value = Number(speechToText.task_retention_count || 14);
  if (speechToTextCueSoundEnabledInput) speechToTextCueSoundEnabledInput.checked = speechToText.cue_sound_enabled !== false;
  if (speechToTextCueSoundKindInput) speechToTextCueSoundKindInput.value = normalizeSpeechCueSoundKind(speechToText.cue_sound_kind || DEFAULT_SPEECH_CUE_SOUND_KIND);
  currentSettingsFormState = {
    senderName: settings.sender_name || '',
    refreshIntervalSecs: Number(settings.refresh_interval_secs || 5),
    defaultEditorFormat: normalizeEditorFormat(
      settings.default_editor_format || loadDefaultEditorFormat() || currentSettingsFormState.defaultEditorFormat,
    ),
    downloadDir: settings.download_dir || '',
    saveFilenameRule: settings.save_filename_rule || DEFAULT_SAVE_FILENAME_RULE,
    autoStart: !!settings.auto_start,
    autoUpdateEnabled: !!settings.auto_update_enabled,
    globalHotkeyEnabled: settings.global_hotkey_enabled !== false,
    globalHotkey: (settings.global_hotkey || DEFAULT_GLOBAL_HOTKEY).toLowerCase(),
    localHttpApiEnabled: !!settings.local_http_api?.enabled,
    localHttpApiBindAddress:
      settings.local_http_api?.bind_address || DEFAULT_LOCAL_HTTP_API_BIND_ADDRESS,
    localHttpApiBindPort:
      settings.local_http_api?.bind_port || DEFAULT_LOCAL_HTTP_API_BIND_PORT,
    copyAfterSend: !!send.copy_after_send,
    telegramAutoStart: !!telegram.auto_start,
    telegramBotToken: telegram.bot_token || '',
    telegramProxyEnabled: !!telegram.proxy_enabled,
    telegramProxyUrl: telegram.proxy_url || 'http://127.0.0.1:7890',
    telegramChatId: telegram.chat_id || '',
    telegramSenderName: telegram.sender_name || '',
    telegramPollIntervalSecs: normalizeTelegramPollInterval(telegram.poll_interval_secs),
    aiEnabled: !!ai.enabled,
    aiProviderKind: aiProvider.kind || 'openai_compatible',
    aiBaseUrl: aiProvider.base_url || '',
    aiApiKey: aiProvider.api_key || '',
    aiModel: aiProvider.model || '',
    aiTemperature: Number(aiProvider.temperature ?? 0.3),
    aiTimeoutSecs: Number(aiProvider.timeout_secs || 60),
    aiDefaultActionId: ai.default_action_id || aiActions[0]?.id || 'polish',
    aiActions,
    activeAiActionCategory: currentSettingsFormState.activeAiActionCategory || aiActions[0]?.category || '通用',
    speechToTextEnabled: !!speechToText.enabled,
    speechToTextApiKey: speechToText.api_key || '',
    speechToTextResourceId: speechToText.resource_id || DEFAULT_SPEECH_TO_TEXT_RESOURCE_ID,
    speechToTextEndpoint: speechToText.endpoint || DEFAULT_SPEECH_TO_TEXT_ENDPOINT,
    speechToTextMicrophoneDeviceId: speechToText.microphone_device_id || '',
    speechToTextCaptureSystemAudio: !!speechToText.capture_system_audio,
    speechToTextSystemAudioDeviceId: speechToText.system_audio_device_id || '',
    speechToTextShortcutEnabled: !!speechToText.shortcut_enabled,
    speechToTextShortcut: (speechToText.shortcut || DEFAULT_SPEECH_TO_TEXT_SHORTCUT).toLowerCase(),
    speechToTextTaskRetentionCount: Number(speechToText.task_retention_count || 14),
    speechToTextCueSoundEnabled: speechToText.cue_sound_enabled !== false,
    speechToTextCueSoundKind: normalizeSpeechCueSoundKind(speechToText.cue_sound_kind || DEFAULT_SPEECH_CUE_SOUND_KIND),
  };
  syncVueSettingsForm(currentSettingsFormState);
  syncSpeechCueSoundControls();
  void refreshSpeechMicrophoneOptions();
  void renderSpeechTaskHistory();
  syncSendOptionsMenuState();
  applyDefaultEditorFormat(currentSettingsFormState.defaultEditorFormat);
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
  currentAutoBackupStatusState = {
    ...currentAutoBackupStatusState,
    enabled: !!settings.backup?.enabled,
    intervalMinutes: Number(settings.backup?.interval_minutes || 5),
    retainCount: Number(settings.backup?.retain_count || 1),
    directory: settings.backup?.directory || currentAutoBackupStatusState.directory || '',
    keepAllDays: Number(settings.backup?.keep_all_days || 3),
    keepDailyDays: Number(settings.backup?.keep_daily_days || 7),
    hasActiveEndpoint: !!getActiveEndpoint(),
  };
  if (backupDirectoryInput) {
    backupDirectoryInput.value = currentAutoBackupStatusState.directory || '';
  }
  if (backupKeepAllDaysInput) {
    backupKeepAllDaysInput.value = currentAutoBackupStatusState.keepAllDays || 3;
  }
  if (backupKeepDailyDaysInput) {
    backupKeepDailyDaysInput.value = currentAutoBackupStatusState.keepDailyDays || 7;
  }
  syncVueSettingsAutoBackup(currentAutoBackupStatusState);
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
    await loadAutoBackupStatus({ silent: true });
    await loadIntegrationModules({ silent: true });
    await loadSettingsSnapshots({ silent: true });
    await loadSettingsBackupArchives({ silent: true });
    await loadPersistedUploadHistory({ silent: true });
    await loadPersistedDownloadHistory({ silent: true });
    await loadTelegramBridgeStatus({ silent: true });
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
    scheduleAutoUpdateCheck();
  } catch (error) {
    setErrorStatus(`读取设置失败：${error}`);
  }
}

async function saveSettings(options = {}) {
  const requireTelegramBridgeConfig = !!options.requireTelegramBridgeConfig;
  const silent = !!options.silent;
  const isAutoSave = options.source === 'auto';
  const endpoints = collectEndpointPayload();
  for (const endpoint of endpoints) {
    if (endpoint.enabled && !endpoint.url) {
      setErrorStatus('启用的 WebDAV 端点必须填写 URL');
      return;
    }
  }
  const globalHotkeyEnabled = !!currentSettingsFormState.globalHotkeyEnabled;
  const normalizedGlobalHotkey = normalizeGlobalHotkey(
    (currentSettingsFormState.globalHotkey || DEFAULT_GLOBAL_HOTKEY) || '',
  );
  if (globalHotkeyEnabled && !normalizedGlobalHotkey) {
    setErrorStatus('全局快捷键需包含修饰键，例如 Ctrl+Alt+T');
    return;
  }
  const speechToTextEnabled = !!currentSettingsFormState.speechToTextEnabled;
  const speechToTextApiKey = (currentSettingsFormState.speechToTextApiKey || '').trim();
  const speechToTextResourceId = (currentSettingsFormState.speechToTextResourceId || DEFAULT_SPEECH_TO_TEXT_RESOURCE_ID).trim();
  const speechToTextEndpoint = (currentSettingsFormState.speechToTextEndpoint || DEFAULT_SPEECH_TO_TEXT_ENDPOINT).trim();
  const speechToTextMicrophoneDeviceId = (currentSettingsFormState.speechToTextMicrophoneDeviceId || '').trim();
  const speechToTextCaptureSystemAudio = !!currentSettingsFormState.speechToTextCaptureSystemAudio;
  const speechToTextSystemAudioDeviceId = (currentSettingsFormState.speechToTextSystemAudioDeviceId || '').trim();
  const speechToTextShortcutEnabled = !!currentSettingsFormState.speechToTextShortcutEnabled;
  const normalizedSpeechShortcut = normalizeSpeechHotkey(
    currentSettingsFormState.speechToTextShortcut || DEFAULT_SPEECH_TO_TEXT_SHORTCUT,
  );
  const speechToTextCueSoundEnabled = !!currentSettingsFormState.speechToTextCueSoundEnabled;
  const speechToTextCueSoundKind = normalizeSpeechCueSoundKind(currentSettingsFormState.speechToTextCueSoundKind || DEFAULT_SPEECH_CUE_SOUND_KIND);
  const speechToTextMaxDurationSecs = 60;
  const speechToTextTaskRetentionCount = Math.max(
    1,
    Math.min(100, Number(currentSettingsFormState.speechToTextTaskRetentionCount) || 14),
  );
  if (speechToTextEnabled && !speechToTextApiKey) {
    setErrorStatus('启用语音转文字前请先填写 API Key');
    return;
  }
  if (speechToTextEnabled && !speechToTextResourceId) {
    setErrorStatus('启用语音转文字前请先填写 Resource ID');
    return;
  }
  if (speechToTextEnabled && !speechToTextEndpoint.startsWith('wss://openspeech.bytedance.com/api/v3/plan/sauc/')) {
    setErrorStatus('语音转文字接口地址无效，需要使用 Agent Plan ASR WebSocket 地址');
    return;
  }
  if (speechToTextShortcutEnabled && !normalizedSpeechShortcut) {
    setErrorStatus('语音录制快捷键格式无效，可填写 right-alt、left-alt 或 Alt+R');
    return;
  }
  const telegramBotToken = (currentSettingsFormState.telegramBotToken || '').trim();
  const telegramProxyEnabled = !!currentSettingsFormState.telegramProxyEnabled;
  const telegramProxyUrl = (currentSettingsFormState.telegramProxyUrl || '').trim();
  const telegramChatId = (currentSettingsFormState.telegramChatId || '').trim();
  const telegramPollInterval = normalizeTelegramPollInterval(
    currentSettingsFormState.telegramPollIntervalSecs || DEFAULT_TELEGRAM_POLL_INTERVAL_SECS,
  );
  const localHttpApiBindAddress =
    (currentSettingsFormState.localHttpApiBindAddress || DEFAULT_LOCAL_HTTP_API_BIND_ADDRESS).trim();
  const localHttpApiBindPort = normalizeLocalHttpApiBindPort(
    currentSettingsFormState.localHttpApiBindPort || DEFAULT_LOCAL_HTTP_API_BIND_PORT,
  );
  const telegramFormState = {
    botToken: telegramBotToken,
    chatId: telegramChatId,
    isConfigured: !!telegramBotToken && /^-?\d+$/.test(telegramChatId) && hasUsableActiveEndpoint(),
  };
  const backupEnabled = !!currentAutoBackupStatusState.enabled;
  const backupIntervalMinutes = Math.max(5, Number(currentAutoBackupStatusState.intervalMinutes) || 5);
  const backupRetainCount = Math.max(1, Number(currentAutoBackupStatusState.retainCount) || 7);
  const settingsSnapshotRetainCount = Math.max(
    1,
    Number(currentAutoBackupStatusState.settingsSnapshotRetainCount) || 7,
  );
  const backupDirectory = (
    backupDirectoryInput?.value ||
    currentAutoBackupStatusState.directory ||
    ''
  ).trim();
  const backupKeepAllDays = Math.max(
    1,
    Number(backupKeepAllDaysInput?.value || currentAutoBackupStatusState.keepAllDays) || 3,
  );
  const backupKeepDailyDays = Math.max(
    backupKeepAllDays,
    Number(backupKeepDailyDaysInput?.value || currentAutoBackupStatusState.keepDailyDays) || 7,
  );
  const aiActions = normalizeAiActions(currentSettingsFormState.aiActions);
  const aiDefaultActionId = aiActions.some((action) => action.id === currentSettingsFormState.aiDefaultActionId)
    ? currentSettingsFormState.aiDefaultActionId
    : aiActions[0]?.id || 'polish';
  if (currentSettingsFormState.aiEnabled) {
    if (!(currentSettingsFormState.aiBaseUrl || '').trim()) {
      setErrorStatus('启用 AI 前请先填写 Provider Base URL');
      return;
    }
    if (!(currentSettingsFormState.aiApiKey || '').trim()) {
      setErrorStatus('启用 AI 前请先填写 API Key');
      return;
    }
    if (!(currentSettingsFormState.aiModel || '').trim()) {
      setErrorStatus('启用 AI 前请先填写模型');
      return;
    }
  }
  if (!localHttpApiBindAddress) {
    setErrorStatus('HTTP API 监听地址不能为空');
    return;
  }
  if (!localHttpApiBindPort) {
    setErrorStatus('HTTP API 监听端口必须是 1-65535 之间的整数');
    return;
  }
  const telegramEnabled =
    requireTelegramBridgeConfig || !!currentSettingsFormState.telegramAutoStart;
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
    sender_name: (currentSettingsFormState.senderName || '').trim(),
    refresh_interval_secs: Number(currentSettingsFormState.refreshIntervalSecs) || 5,
    default_editor_format: currentSettingsFormState.defaultEditorFormat === 'markdown' ? 'markdown' : 'text',
    download_dir: (currentSettingsFormState.downloadDir || '').trim(),
    save_filename_rule: settingsFormRuntime?.normalizeSaveFilenameRule
      ? settingsFormRuntime.normalizeSaveFilenameRule(
          currentSettingsFormState.saveFilenameRule,
          DEFAULT_SAVE_FILENAME_RULE,
        )
      : (currentSettingsFormState.saveFilenameRule || DEFAULT_SAVE_FILENAME_RULE).trim(),
    global_hotkey_enabled: globalHotkeyEnabled,
    global_hotkey: normalizedGlobalHotkey || DEFAULT_GLOBAL_HOTKEY,
    send_hotkey: sendHotkey,
    auto_start: !!currentSettingsFormState.autoStart,
    auto_update_enabled: !!currentSettingsFormState.autoUpdateEnabled,
    backup: {
      enabled: backupEnabled,
      interval_minutes: backupIntervalMinutes,
      retain_count: backupRetainCount,
      settings_snapshot_retain_count: settingsSnapshotRetainCount,
      directory: backupDirectory,
      keep_all_days: backupKeepAllDays,
      keep_daily_days: backupKeepDailyDays,
    },
    local_http_api: {
      enabled: !!currentSettingsFormState.localHttpApiEnabled,
      bind_address: localHttpApiBindAddress,
      bind_port: localHttpApiBindPort,
    },
    send: {
      copy_after_send: !!currentSettingsFormState.copyAfterSend,
    },
    telegram: {
      enabled: telegramFormState.isConfigured,
      auto_start: !!currentSettingsFormState.telegramAutoStart,
      sender_name: (currentSettingsFormState.telegramSenderName || '').trim(),
      bot_token: telegramBotToken,
      proxy_enabled: telegramProxyEnabled,
      proxy_url: telegramProxyUrl,
      chat_id: telegramChatId,
      poll_interval_secs: telegramPollInterval,
    },
    ai: {
      enabled: !!currentSettingsFormState.aiEnabled,
      provider: {
        kind: currentSettingsFormState.aiProviderKind || 'openai_compatible',
        base_url: (currentSettingsFormState.aiBaseUrl || '').trim(),
        api_key: (currentSettingsFormState.aiApiKey || '').trim(),
        model: (currentSettingsFormState.aiModel || '').trim(),
        temperature: Number(currentSettingsFormState.aiTemperature ?? 0.3),
        timeout_secs: Number(currentSettingsFormState.aiTimeoutSecs || 60),
      },
      default_action_id: aiDefaultActionId,
      actions: aiActions,
    },
    speech_to_text: {
      enabled: speechToTextEnabled,
      provider_kind: 'volcengine_agent_plan',
      api_key: speechToTextApiKey,
      resource_id: speechToTextResourceId,
      endpoint: speechToTextEndpoint,
      microphone_device_id: speechToTextMicrophoneDeviceId,
      capture_system_audio: speechToTextCaptureSystemAudio,
      system_audio_device_id: speechToTextSystemAudioDeviceId,
      shortcut_enabled: speechToTextShortcutEnabled,
      shortcut: normalizedSpeechShortcut || DEFAULT_SPEECH_TO_TEXT_SHORTCUT,
      max_duration_secs: speechToTextMaxDurationSecs,
      task_retention_count: speechToTextTaskRetentionCount,
      cue_sound_enabled: speechToTextCueSoundEnabled,
      cue_sound_kind: speechToTextCueSoundKind,
    },
  };

  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    const previousActive = activeEndpointId;
    const updated = await invoke('save_settings', { settings: payload });
    if (!silent) {
      setSuccessStatus('设置已保存');
    }
    applySettings(updated);
    await pruneSpeechTasks();
    await renderSpeechTaskHistory();
    await loadLocalHttpApiStatus({ silent: true });
    await loadAutoBackupStatus({ silent: true });
    await loadIntegrationModules({ silent: true });
    await loadSettingsSnapshots({ silent: true });
    await loadTelegramBridgeStatus({ silent: true });
    if (!silent || isAutoSave) {
      setHint(downloadDirHint, '下载目录已保存');
    }
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
    if (!silent) {
      setErrorStatus(`保存设置失败：${error}`);
    }
    if (silent || isAutoSave) {
      throw error;
    }
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
    syncVueSettings(updated);
    await loadLocalHttpApiStatus({ silent: true });
    await loadAutoBackupStatus({ silent: true });
    await loadSettingsSnapshots({ silent: true });
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

async function handleWebdavConflictStatus(conflict) {
  const filename = conflict.filename || '';
  const choice = window.prompt(
    `WebDAV sync conflict: ${filename}\nType "remote" to download remote over local, or "local" to upload local over remote.`,
    'remote',
  );
  if (!choice) {
    setErrorStatus('WebDAV 同步冲突等待处理');
    return;
  }
  const normalized = choice.trim().toLowerCase();
  const action = normalized === 'local' ? 'local-over-remote' : 'remote-over-local';
  try {
    await invoke('resolve_webdav_conflict', { action });
    setSuccessStatus('WebDAV 冲突已处理');
    await refreshMessages();
  } catch (error) {
    setErrorStatus(`处理 WebDAV 冲突失败：${error}`);
  }
}

async function createLocalDataBackup() {
  try {
    if (!invoke) {
      await showSettingsResultDialog('本地数据备份失败', '未检测到 Tauri API，请检查应用环境。');
      return;
    }
    setStatus('正在创建本地数据备份...');
    const result = await invoke('create_local_data_backup');
    await loadSettingsBackupArchives({ silent: true });
    setSuccessStatus('本地数据备份完成');
    await showInfoDialog({
      title: '本地数据备份完成',
      message: `备份已创建：\n${result?.path || ''}`,
    });
  } catch (error) {
    setErrorStatus(`本地数据备份失败：${error}`);
    await showInfoDialog({ title: '本地数据备份失败', message: String(error) });
  }
}

function syncManualBackupDialogState(nextState = {}) {
  manualBackupDialogState = settingsFormRuntime?.getManualBackupDialogState
    ? settingsFormRuntime.getManualBackupDialogState(manualBackupDialogState, nextState)
    : {
        ...manualBackupDialogState,
        ...nextState,
      };
  syncVueManualBackupDialog(manualBackupDialogState);
}

function openManualBackupDialog(target = 'local-data') {
  const normalizedTarget = target === 'settings-snapshot' ? 'settings-snapshot' : 'local-data';
  syncManualBackupDialogState({
    open: true,
    target: normalizedTarget,
    title: normalizedTarget === 'settings-snapshot' ? '手动备份设置快照' : '手动备份本地归档',
    name: '',
    note: '',
    loading: false,
  });
}

function closeManualBackupDialog() {
  if (manualBackupDialogState.loading) {
    return;
  }
  syncManualBackupDialogState({ open: false });
}

function updateManualBackupDialogField(field, value) {
  if (field !== 'name' && field !== 'note') {
    return;
  }
  syncManualBackupDialogState({ [field]: value });
}

async function submitManualBackupDialog() {
  if (!manualBackupDialogState.open || manualBackupDialogState.loading) {
    return;
  }
  try {
    if (!invoke) {
      await showSettingsResultDialog('手动备份失败', '未检测到 Tauri API，请检查应用环境。');
      return;
    }
    syncManualBackupDialogState({ loading: true });
    const payload = {
      name: String(manualBackupDialogState.name || ''),
      note: String(manualBackupDialogState.note || ''),
    };
    if (manualBackupDialogState.target === 'settings-snapshot') {
      await invoke('create_manual_settings_snapshot', payload);
      await loadSettingsSnapshots({ silent: true });
    } else {
      await invoke('create_manual_local_data_backup', payload);
      await loadSettingsBackupArchives({ silent: true });
    }
    syncManualBackupDialogState({ open: false, loading: false, name: '', note: '' });
    setSuccessStatus('手动备份已创建');
    await showSettingsResultDialog('手动备份成功', '已创建手动备份，自动清理不会删除该记录。');
  } catch (error) {
    syncManualBackupDialogState({ loading: false });
    setErrorStatus(`手动备份失败：${error}`);
    await showSettingsResultDialog('手动备份失败', String(error));
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

    currentSettingsOpsState = settingsOpsRuntime?.withBackupRunning
      ? settingsOpsRuntime.withBackupRunning(currentSettingsOpsState)
      : {
          ...currentSettingsOpsState,
          backupRunning: true,
          backupLabel: '备份中...',
        };
    syncVueSettingsOpsState();
    if (backupWebdavButton) {
      backupWebdavButton.classList.add('is-loading');
      backupWebdavButton.disabled = true;
      backupWebdavButton.textContent = '备份中...';
    }
    setStatus('正在备份 WebDAV 数据...');

    await invoke('backup_webdav', { path: target });
    await loadSettingsBackupArchives({ silent: true });
    
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
    currentSettingsOpsState = settingsOpsRuntime?.withBackupIdle
      ? settingsOpsRuntime.withBackupIdle(currentSettingsOpsState)
      : {
          ...currentSettingsOpsState,
          backupRunning: false,
          backupLabel: '备份 WebDAV',
        };
    syncVueSettingsOpsState();
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

    currentSettingsOpsState = settingsOpsRuntime?.withRestoreRunning
      ? settingsOpsRuntime.withRestoreRunning(currentSettingsOpsState)
      : {
          ...currentSettingsOpsState,
          restoreRunning: true,
          restoreLabel: '恢复中...',
        };
    syncVueSettingsOpsState();
    if (restoreWebdavButton) {
      restoreWebdavButton.classList.add('is-loading');
      restoreWebdavButton.disabled = true;
      restoreWebdavButton.textContent = '恢复中...';
    }
    setStatus('正在从备份恢复 WebDAV 数据...');

    await invoke('restore_webdav', { path });
    await loadSettingsBackupArchives({ silent: true });
    
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
    currentSettingsOpsState = settingsOpsRuntime?.withRestoreIdle
      ? settingsOpsRuntime.withRestoreIdle(currentSettingsOpsState)
      : {
          ...currentSettingsOpsState,
          restoreRunning: false,
          restoreLabel: '恢复 WebDAV',
        };
    syncVueSettingsOpsState();
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
 const cw = window.transferGenieComposer;
 if (cw && cw.isActive && cw.isActive() && cw.getActiveDraft) {
   const draft = cw.getActiveDraft();
    if (draft && draft.format) currentFormat = draft.format;
   text = draft ? (draft.text || '') : '';
 } else if (currentFormat === 'markdown' && mdEditor) {
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
      dueDate: activeMarkedOptions.dueDate || null,
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
        marked_due_date: activeMarkedOptions.dueDate || null,
      });

      if (currentFormat === 'markdown' && mdEditor) {
        mdEditor.setMarkdown('');
      } else {
        textInput.value = '';
      }
      // 输入框即工作区：发送成功后清空活动草稿
      if (cw && cw.clearActiveDraftAfterSend) cw.clearActiveDraftAfterSend();
      
      renderCurrentMessageView();
      forceScrollMessageListToBottom();

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
        renderCurrentMessageView({ preserveScroll: true });
        applySuccessfulSendResult(result);
        await copySentTextAfterSend(text);
        exitComposerFullscreenAfterSendSuccess();
        setTimeout(async () => {
          const shouldStickToBottom = isMessageListAtBottom();
          pendingSends.delete(filename);
          await loadMessages({
            scrollToBottom: shouldStickToBottom,
            preserveScroll: !shouldStickToBottom,
            forceScrollToBottom: shouldStickToBottom,
          });
        }, 1000);
      } catch (error) {
        hadSendFailure = true;
        pendingSends.set(filename, {
          ...pendingSends.get(filename),
          sendStatus: SEND_STATUS.FAILED,
          sendError: String(error),
        });
        renderCurrentMessageView();
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
            renderCurrentMessageView({ scrollToBottom: true });
            renderUploadTasks();
            const result = await invoke('send_file', {
              path,
              clientId,
              markedOptions: activeMarkedOptions,
            });
            if (clientId) {
              pendingUploads.delete(clientId);
              renderCurrentMessageView();
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
              renderCurrentMessageView();
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
    updateSettingsFormField('downloadDir', path);
    setHint(downloadDirHint, '已选择下载目录，正在自动生效');
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
    speedTestRunning: false,
    speedTestResult: null,
  });
  renderWebdavEndpoints();
  queueSettingsAutoSave({ delayMs: 0 });
}

function updateVueWebdavEndpointField(endpointMeta, field, value) {
  const endpoint = findWebdavEndpoint(endpointMeta?.id);
  if (!endpoint || !field) {
    return;
  }
  endpoint[field] = value;
  if (field === 'url') {
    endpoint.speedTestResult = null;
    if (!(endpoint.url || '').trim() && activeEndpointId === endpoint.id) {
      activeEndpointId = null;
    }
  }
  renderEndpointSelect();
  refreshWebdavEndpointViews();
  queueSettingsAutoSave();
}

function toggleVueWebdavEndpointEnabled(endpointMeta, checked) {
  const endpoint = findWebdavEndpoint(endpointMeta?.id);
  if (!endpoint) {
    return;
  }
  endpoint.enabled = !!checked;
  if (!endpoint.enabled && activeEndpointId === endpoint.id) {
    activeEndpointId = null;
  }
  renderEndpointSelect();
  refreshWebdavEndpointViews();
  queueSettingsAutoSave({ delayMs: 0 });
}

function activateVueWebdavEndpoint(endpointMeta, checked) {
  if (!checked) {
    return;
  }
  const endpoint = findWebdavEndpoint(endpointMeta?.id);
  if (!endpoint || !endpoint.enabled) {
    return;
  }
  activeEndpointId = endpoint.id;
  renderEndpointSelect();
  refreshWebdavEndpointViews();
  queueSettingsAutoSave({ delayMs: 0 });
}

function removeVueWebdavEndpoint(endpointMeta) {
  if (!endpointMeta?.id) {
    return;
  }
  webdavEndpoints = webdavEndpoints.filter((item) => item.id !== endpointMeta.id);
  if (activeEndpointId === endpointMeta.id) {
    activeEndpointId = null;
  }
  renderEndpointSelect();
  refreshWebdavEndpointViews();
  queueSettingsAutoSave({ delayMs: 0 });
}

async function batchSpeedTest() {
  if (!batchSpeedTestButton) return;

  // 获取所有已填写 URL 的端点
  const validEndpoints = webdavEndpoints.filter(
    (endpoint) => endpoint.url && endpoint.url.trim(),
  );

  if (hasVueAppShell) {
    if (validEndpoints.length === 0) {
      setErrorStatus('没有可测速的端点，请至少填写一个端点的 URL');
      await showSettingsResultDialog('批量测速失败', '没有可测速的端点，请至少填写一个端点的 URL。');
      return;
    }
    batchSpeedTestButton.disabled = true;
    batchSpeedTestButton.textContent = `批量测速中（${validEndpoints.length}）...`;
    try {
      await Promise.all(validEndpoints.map((endpoint) => runVueWebdavSpeedTest(endpoint.id).catch(() => null)));
      setSuccessStatus(`批量测速完成（${validEndpoints.length} 个端点）`);
      await showSettingsResultDialog('批量测速成功', `已完成 ${validEndpoints.length} 个端点的测速。`);
    } catch (error) {
      setErrorStatus(`批量测速失败：${error}`);
      await showSettingsResultDialog('批量测速失败', String(error));
    } finally {
      batchSpeedTestButton.disabled = false;
      batchSpeedTestButton.textContent = '批量测速';
    }
    return;
  }

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
  const label = value ? value.slice(0, 2).toUpperCase() : 'TG';
  const title = value ? `发送者：${value}` : '发送者：未设置';
  deviceNameLabel.textContent = label;
  deviceNameLabel.title = title;
  deviceNameLabel.setAttribute('aria-label', title);
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
      renderCurrentMessageView();
      renderUploadTasks();
      loadPersistedUploadHistory({ silent: true });
      // 上传完成后使用增量更新，避免打断用户浏览
      loadMessages({ checkNew: true });
      return;
    }
    if (payload.status === 'error') {
      pendingUploads.delete(clientId);
      uploadSpeed.delete(clientId);
      renderCurrentMessageView();
      renderUploadTasks();
      loadPersistedUploadHistory({ silent: true });
      if (payload.error) {
        setErrorStatus(`上传失败：${payload.error}`);
      }
    }
  });

  listen('webdav-backup-progress', (event) => {
    const payload = event.payload || {};
    const text = settingsOpsRuntime?.getBackupProgressLabel
      ? settingsOpsRuntime.getBackupProgressLabel(payload)
      : null;
    if (!text) {
      return;
    }

    currentSettingsOpsState = settingsOpsRuntime?.withBackupRunning
      ? settingsOpsRuntime.withBackupRunning(currentSettingsOpsState, text)
      : {
          ...currentSettingsOpsState,
          backupRunning: true,
          backupLabel: text,
        };
    syncVueSettingsOpsState();
    if (backupWebdavButton) {
      backupWebdavButton.textContent = text;
    }
  });

  listen('webdav-restore-progress', (event) => {
    const payload = event.payload || {};
    const text = settingsOpsRuntime?.getRestoreProgressLabel
      ? settingsOpsRuntime.getRestoreProgressLabel(payload)
      : null;
    if (!text) {
      return;
    }

    currentSettingsOpsState = settingsOpsRuntime?.withRestoreRunning
      ? settingsOpsRuntime.withRestoreRunning(currentSettingsOpsState, text)
      : {
          ...currentSettingsOpsState,
          restoreRunning: true,
          restoreLabel: text,
        };
    syncVueSettingsOpsState();
    if (restoreWebdavButton) {
      restoreWebdavButton.textContent = text;
    }
  });

  listen('auto-backup-status', (event) => {
    const payload = event.payload || {};
    currentAutoBackupStatusState = {
      ...currentAutoBackupStatusState,
      lastRunMs: payload.lastRunMs ?? payload.last_run_ms ?? currentAutoBackupStatusState.lastRunMs,
      lastSuccessMs: payload.lastSuccessMs ?? payload.last_success_ms ?? currentAutoBackupStatusState.lastSuccessMs,
      lastError: payload.lastError ?? payload.last_error ?? null,
      lastBackupPath: payload.lastBackupPath ?? payload.last_backup_path ?? '',
    };
    syncVueSettingsAutoBackup(currentAutoBackupStatusState);
  });

  listen('speech-to-text-toggle', () => {
    toggleSpeechRecording();
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
window.addEventListener('keydown', handleSpeechSideAltKeydown, true);
window.addEventListener('keyup', handleSpeechSideAltKeyup, true);
document.addEventListener('click', (event) => {
  if (event.target?.closest?.('#speech-to-text-toggle')) {
    toggleSpeechRecording();
  }
});
if (sendOptionsToggle) {
  sendOptionsToggle.addEventListener('click', toggleSendOptionsMenu);
}
if (sendOptionsMenu) {
  sendOptionsMenu.addEventListener('click', (event) => event.stopPropagation());
}
if (speechToTextMicrophoneInput) {
  speechToTextMicrophoneInput.addEventListener('change', (event) => {
    currentSettingsFormState = {
      ...currentSettingsFormState,
      speechToTextMicrophoneDeviceId: event.target.value || '',
    };
    syncVueSettingsForm(currentSettingsFormState);
  });
}
if (speechToTextCaptureSystemAudioInput) {
  speechToTextCaptureSystemAudioInput.addEventListener('change', (event) => {
    currentSettingsFormState = {
      ...currentSettingsFormState,
      speechToTextCaptureSystemAudio: !!event.target.checked,
    };
    syncVueSettingsForm(currentSettingsFormState);
    renderSpeechSystemAudioDeviceOptions([], currentSettingsFormState.speechToTextSystemAudioDeviceId || '');
    void refreshSpeechMicrophoneOptions();
  });
}
if (speechToTextSystemAudioDeviceInput) {
  speechToTextSystemAudioDeviceInput.addEventListener('change', (event) => {
    currentSettingsFormState = {
      ...currentSettingsFormState,
      speechToTextSystemAudioDeviceId: event.target.value || '',
    };
    syncVueSettingsForm(currentSettingsFormState);
  });
}
if (speechToTextShortcutInput) {
  speechToTextShortcutInput.addEventListener('input', () => {
    activeSideAltSpeechKey = '';
  });
}
if (speechToTextShortcutEnabledInput) {
  speechToTextShortcutEnabledInput.addEventListener('change', () => {
    activeSideAltSpeechKey = '';
  });
}
if (speechToTextTaskRetentionInput) {
  speechToTextTaskRetentionInput.addEventListener('change', () => {
    const nextCount = Math.max(1, Math.min(100, Number(speechToTextTaskRetentionInput.value) || 14));
    currentSettingsFormState = {
      ...currentSettingsFormState,
      speechToTextTaskRetentionCount: nextCount,
    };
    speechToTextTaskRetentionInput.value = String(nextCount);
    syncVueSettingsForm(currentSettingsFormState);
    void pruneSpeechTasks().then(() => renderSpeechTaskHistory());
  });
}
if (speechToTextCueSoundEnabledInput) {
  speechToTextCueSoundEnabledInput.addEventListener('change', (event) => {
    currentSettingsFormState = {
      ...currentSettingsFormState,
      speechToTextCueSoundEnabled: !!event.target.checked,
    };
    syncVueSettingsForm(currentSettingsFormState);
    syncSpeechCueSoundControls();
  });
}
if (speechToTextCueSoundKindInput) {
  speechToTextCueSoundKindInput.addEventListener('change', (event) => {
    currentSettingsFormState = {
      ...currentSettingsFormState,
      speechToTextCueSoundKind: normalizeSpeechCueSoundKind(event.target.value || DEFAULT_SPEECH_CUE_SOUND_KIND),
    };
    syncVueSettingsForm(currentSettingsFormState);
    syncSpeechCueSoundControls();
  });
}
if (speechToTextCueSoundPreviewButton) {
  speechToTextCueSoundPreviewButton.addEventListener('click', previewSpeechCueSound);
}
if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    void refreshSpeechMicrophoneOptions();
  });
}
if (quickCopyAfterSendInput) {
  quickCopyAfterSendInput.addEventListener('change', (event) => {
    updateQuickSendOption('copyAfterSend', event.target.checked);
  });
}
document.addEventListener('click', closeSendOptionsMenu);
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
if (composerMarkDueDateInput) {
  composerMarkDueDateInput.addEventListener('change', () => {
    const dueDate = getComposerMarkDueDate();
    if (dueDate) {
      composerMarkEnabled = true;
    } else if (!hasActiveComposerMarkDetails()) {
      composerMarkEnabled = false;
    }
    syncComposerMarkToggleState();
  });
}
if (composerMarkDueClearButton) {
  composerMarkDueClearButton.addEventListener('click', () => {
    if (composerMarkDueDateInput) {
      composerMarkDueDateInput.value = '';
    }
    if (!hasActiveComposerMarkDetails()) {
      composerMarkEnabled = false;
    }
    syncComposerMarkToggleState();
    composerMarkDueDateInput?.focus();
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
if (saveSettingsButton) {
  saveSettingsButton.addEventListener('click', saveSettingsWithFeedback);
}
if (checkUpdateButton) {
  checkUpdateButton.addEventListener('click', () => {
    checkForAppUpdate({ source: 'manual' });
  });
}
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
      localHttpApiStatusText.textContent = '状态：正在自动应用...';
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
  senderNameInput.addEventListener('input', (event) => {
    setSenderNameDisplay(event.target?.value || '');
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
if (markedPendingFilterButton) {
  markedPendingFilterButton.addEventListener('click', toggleMarkedPendingFilter);
  updateMarkedPendingFilterButton();
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
if (createLocalDataBackupButton) {
  createLocalDataBackupButton.addEventListener('click', createLocalDataBackup);
}
if (backupDirectoryInput) {
  backupDirectoryInput.addEventListener('input', (event) => {
    updateSettingsAutoBackupField('directory', event.target.value);
  });
}
if (backupKeepAllDaysInput) {
  backupKeepAllDaysInput.addEventListener('input', (event) => {
    updateSettingsAutoBackupField('keepAllDays', Number(event.target.value || 3));
  });
}
if (backupKeepDailyDaysInput) {
  backupKeepDailyDaysInput.addEventListener('input', (event) => {
    updateSettingsAutoBackupField('keepDailyDays', Number(event.target.value || 7));
  });
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
if (markMessageDueToggle) {
  markMessageDueToggle.addEventListener('click', () => {
    if (markMessageDueToggle.disabled) return;
    if (typeof markMessageDueDateInput?.showPicker === 'function') {
      markMessageDueDateInput.showPicker();
    } else {
      markMessageDueDateInput?.focus();
      markMessageDueDateInput?.click();
    }
  });
}
if (markMessageDueDateInput) {
  markMessageDueDateInput.addEventListener('change', updateMarkMessageDueValue);
}
if (markMessageDueClearButton) {
  markMessageDueClearButton.addEventListener('click', () => {
    if (markMessageDueDateInput?.disabled) return;
    if (markMessageDueDateInput) {
      markMessageDueDateInput.value = '';
    }
    updateMarkMessageDueValue();
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
    const isActuallyFullscreen = !!(
      document.documentElement.classList.contains('composer-fullscreen-active') ||
      document.body.classList.contains('composer-fullscreen-active')
    );
    setComposerFullscreen(!isActuallyFullscreen);
  });
  // Ensure icon and labels reflect initial state
  setComposerFullscreen(false);
}

if (layoutToggle) {
  layoutToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const visible = !document.documentElement.classList.contains('composer-hidden-active') && !document.body.classList.contains('composer-hidden-active');
    setComposerVisible(!visible);
  });
}

applyHomeLayoutState();
// R5: 暴露全屏切换给 Vue 工具栏按钮（放大按钮已合并到工作区工具栏）
window.transferGenieLegacyFullscreen = {
  set: function (enabled) { setComposerFullscreen(enabled); },
  exit: function () { setComposerFullscreen(false); },
  get: function () {
    return document.documentElement.classList.contains('composer-fullscreen-active') ||
      document.body.classList.contains('composer-fullscreen-active');
  },
};
window.transferGenieSendHotkey = sendHotkey;
window.transferGenieSendActiveDraft = function () { sendText(); };

if (feedContent) {
  feedContent.addEventListener(
    'scroll',
    (event) => {
      if (event.target === getCurrentMessageList()) {
        handleMessageListScroll();
      }
    },
    true,
  );
}

syncComposerOffset();
window.addEventListener('resize', syncComposerOffset);
window.addEventListener('transfer-genie:composer-visibility-change', syncComposerOffset);

// 使用 fixed 定位菜单，避免被 overflow 容器裁切
function positionActionMenu(menu) {
  if (!menu) return;
  const menuList = menu.querySelector('.action-menu-list');
  if (!menuList) return;
  if (!menu.open) {
    menuList.style.left = '';
    menuList.style.top = '';
    menuList.classList.remove('menu-up');
    return;
  }
  const summary = menu.querySelector('summary');
  if (!summary) return;
  const rect = summary.getBoundingClientRect();
  // 先让菜单可见以测量尺寸
  menuList.style.left = rect.right + 'px';
  menuList.style.top = rect.bottom + 'px';
  const menuW = menuList.offsetWidth;
  const menuH = menuList.offsetHeight || 120;
  const spaceBelow = window.innerHeight - rect.bottom;
  let left = rect.right - menuW;
  if (left < 8) left = 8;
  let top;
  if (spaceBelow < menuH + 12 && rect.top > menuH + 12) {
    top = rect.top - menuH - 8;
    menuList.classList.add('menu-up');
  } else {
    top = rect.bottom + 8;
    menuList.classList.remove('menu-up');
  }
  menuList.style.left = left + 'px';
  menuList.style.top = top + 'px';
}

// 全局 toggle 监听：处理 Vue 渲染的 action-menu
document.addEventListener('toggle', function(e) {
  var target = e.target;
  if (target && target.classList && target.classList.contains('action-menu')) {
    setTimeout(function() { positionActionMenu(target); }, 0);
  }
}, true);

// 窗口滚动/缩放时重新定位已打开的菜单
function repositionOpenActionMenus() {
  document.querySelectorAll('.action-menu[open]').forEach(positionActionMenu);
}
window.addEventListener('resize', repositionOpenActionMenus);
window.addEventListener('scroll', repositionOpenActionMenus, true);

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
  if (event.defaultPrevented || event.key !== 'Enter' || event.isComposing) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element) || !target.closest('.cw-editor')) {
    return;
  }
  if (target.closest('button, input[type="radio"], input[type="checkbox"], select')) {
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
}, true);

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

if (!hasVueAppShell) {
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.tabTarget;
      setActiveTab(target, {
        scrollToBottom: target === 'home',
        focusInput: target === 'home',
      });
    });
  });
}

function handleWindowFocus() {
  focusHomeComposer();
  scheduleAutoUpdateCheck();
}

syncTelegramProxyControlsState();
syncTelegramControlsState();
startTelegramBridgeStatusPolling();
renderComposerMarkTagList();
initializeSettingsNavigation();
syncVueSettingsOpsState();
syncManualBackupDialogState();
vueBridge?.setActions?.({
  refreshSettingsSnapshots: () => {
    loadSettingsSnapshots();
  },
  clearSettingsSnapshots: () => {
    clearSettingsSnapshots();
  },
  refreshSettingsBackupArchives: () => {
    loadSettingsBackupArchives();
  },
  clearSettingsBackupArchives: () => {
    clearSettingsBackupArchives();
  },
  restoreSettingsSnapshot: (snapshot) => {
    restoreSettingsSnapshotRecord(snapshot);
  },
  restoreSettingsBackupArchive: (record) => {
    restoreSettingsBackupArchiveRecord(record);
  },
  createLocalDataBackup: () => {
    createLocalDataBackup();
  },
  openManualBackupDialog: (target) => {
    openManualBackupDialog(target);
  },
  closeManualBackupDialog: () => {
    closeManualBackupDialog();
  },
  updateManualBackupDialogField: (field, value) => {
    updateManualBackupDialogField(field, value);
  },
  submitManualBackupDialog: () => {
    submitManualBackupDialog();
  },
  updateSettingsAutoBackupField: (field, value) => {
    updateSettingsAutoBackupField(field, value);
  },
  updateSettingsFormField: (field, value) => {
    updateSettingsFormField(field, value);
  },
  updateAiActionField: (index, field, value) => {
    updateAiActionField(index, field, value);
  },
  addAiAction: () => {
    addAiAction();
  },
  saveComposerAiPrompt: (payload) => saveComposerAiPrompt(payload),
  removeAiAction: (index) => {
    removeAiAction(index);
  },
  selectAiActionCategory: (category) => {
    selectAiActionCategory(category);
  },
  updateAiActionFavorite: (index, value, options) => {
    updateAiActionFavorite(index, value, options);
  },
  openMessagePreview: (message) => {
    openMessagePreview(message);
  },
  toggleMessageMarked: (message) => {
    toggleMessageMarked(message);
  },
  copyText: (message) => {
    copyTextToClipboard(message?.content || '');
  },
  downloadTextMessageAsFile: (message) => {
    downloadTextMessageAsFile(message);
  },
  openMessageFile: (message) => {
    openMessageFile(message);
  },
  downloadMessageFile: (message) => {
    downloadMessageFile(message);
  },
  saveMessageFileAs: (message) => {
    saveMessageFileAs(message);
  },
  deleteSingleMessage: (message) => {
    deleteSingleMessage(message);
  },
  changeMarkedPage: (nextPage) => {
    markedMessagesPage = Math.max(1, Number(nextPage) || 1);
    renderMarkedMessages(markedMessages, {
      query: getAppliedMarkedSearchQuery(),
    });
  },
  toggleMarkedMessageSelection: (message, checked) => {
    toggleSelectedMarkedMessage(message?.filename, checked);
  },
  openMarkMessageModal: (message) => {
    openMarkMessageModal(message?.message || message);
  },
  toggleMarkedMessagePin: (message) => {
    toggleMarkedMessagePin(message?.message || message);
  },
  toggleMarkedMessageExpanded: (message) => {
    const filename = message?.filename;
    if (!filename) {
      return;
    }
    if (expandedTextMessages.has(filename)) {
      expandedTextMessages.delete(filename);
    } else {
      expandedTextMessages.add(filename);
    }
    renderMarkedMessages(markedMessages, {
      query: getAppliedMarkedSearchQuery(),
    });
  },
  changeTransferTaskPage: (view, nextPage) => {
    if (view === 'uploads') {
      uploadTasksPage = nextPage;
      renderUploadTasks();
      return;
    }
    downloadTasksPage = nextPage;
    renderDownloadTasks();
  },
  toggleTransferTaskSelection: (task, checked) => {
    toggleSelectedDownloadTask(task?.key, checked);
  },
  saveDownloadHistoryAs: (task) => {
    saveDownloadHistoryAs(task);
  },
  redownloadDownloadHistory: (task) => {
    redownloadDownloadHistory(task);
  },
  openDownloadHistoryFile: (task) => {
    openDownloadHistoryFile(task);
  },
  openDownloadHistoryDir: (task) => {
    openDownloadHistoryDir(task);
  },
  deleteDownloadHistoryRecord: (task) => {
    deleteDownloadHistoryRecord(task);
  },
  updateSettingsWebdavField: (endpoint, field, value) => {
    updateVueWebdavEndpointField(endpoint, field, value);
  },
  toggleSettingsWebdavEnabled: (endpoint, checked) => {
    toggleVueWebdavEndpointEnabled(endpoint, checked);
  },
  activateSettingsWebdavEndpoint: (endpoint, checked) => {
    activateVueWebdavEndpoint(endpoint, checked);
  },
  removeSettingsWebdavEndpoint: (endpoint) => {
    removeVueWebdavEndpoint(endpoint);
  },
  testSettingsWebdavEndpoint: (endpoint) => {
    runVueWebdavSpeedTest(endpoint?.id);
  },
});
loadSettings();
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
    renderCurrentMessageView({ scrollToBottom: true });
    renderUploadTasks();
    const result = await invoke('send_file', {
      path,
      clientId,
      markedOptions: cloneComposerMarkedOptions(getComposerMarkedOptions()),
    });
    if (clientId) {
      pendingUploads.delete(clientId);
      renderCurrentMessageView();
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
      renderCurrentMessageView();
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
  listen(APP_UPDATE_EVENT, (event) => {
    updateInstallProgressMessage(event.payload || {});
  });
  listen(TRAY_CHECK_UPDATE_EVENT, () => {
    checkForAppUpdate({ source: 'tray' });
  });

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
    renderCurrentMessageView({ scrollToBottom: true });
    renderUploadTasks();
    const result = await invoke('send_file_data', {
      data: Array.from(data),
      originalName,
      clientId,
      markedOptions: cloneComposerMarkedOptions(getComposerMarkedOptions()),
    });
    if (clientId) {
      pendingUploads.delete(clientId);
      renderCurrentMessageView();
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
      renderCurrentMessageView();
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
  if (markedTabBadge) {
    const value = Math.max(0, Number(count || 0));
    markedTabBadge.textContent = value > 99 ? '99+' : String(value);
    markedTabBadge.hidden = value === 0;
  }
}

function updateMarkedBadgeFromLocalMessages() {
  const seen = new Set();
  let count = 0;
  [...lastMessages, ...markedMessages].forEach((message) => {
    if (!message?.filename || seen.has(message.filename)) return;
    seen.add(message.filename);
    if (isMarkedMessagePending(message)) {
      count += 1;
    }
  });
  updateMarkedBadge(count);
}

function updateMarkMessageDueValue() {
  const dueDate = normalizeMarkedDueDate(markMessageDueDateInput?.value);
  if (markMessageDueValueText) {
    markMessageDueValueText.textContent = dueDate;
  }
  if (markMessageDueValue) {
    markMessageDueValue.hidden = false;
    markMessageDueValue.classList.toggle('is-visible', !!dueDate);
    markMessageDueValue.setAttribute('aria-hidden', dueDate ? 'false' : 'true');
  }
  markMessageDueToggle?.closest('.mark-message-extra-tools')?.classList.toggle('has-due-date', !!dueDate);
  if (markMessageDueToggle) {
    markMessageDueToggle.classList.toggle('is-active', !!dueDate);
  }
}

function setMarkMessageDueToolDisabled(disabled) {
  if (markMessageDueToggle) {
    markMessageDueToggle.disabled = disabled;
  }
  if (markMessageDueDateInput) {
    markMessageDueDateInput.disabled = disabled;
  }
  if (markMessageDueValue) {
    markMessageDueValue.classList.toggle('is-disabled', disabled);
  }
  updateMarkMessageDueValue();
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
  if (markMessageDueDateInput) {
    markMessageDueDateInput.value = '';
  }
  setMarkMessageDueToolDisabled(false);
  updateMarkMessageDueValue();
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
  currentMarkingMessages = messages;
  currentMarkingMode = options.mode || (messages.length > 1 ? 'batch' : 'single');
  selectedMarkTagIds.clear();
  if (currentMarkingMode !== 'batch') {
    (messages[0].marked_tag_ids || []).forEach((tagId) => selectedMarkTagIds.add(tagId));
    const existingDueDate = normalizeMarkedDueDate(messages[0].marked_due_date);
    if (markMessageDueDateInput) {
      markMessageDueDateInput.value = existingDueDate;
    }
    setMarkMessageDueToolDisabled(false);
    updateMarkMessageDueValue();
  } else {
    if (markMessageDueDateInput) {
      markMessageDueDateInput.value = '';
    }
    setMarkMessageDueToolDisabled(true);
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
  const filenames = currentMarkingMessages.map((message) => message.filename).filter(Boolean);
  const dueDate = currentMarkingMode === 'batch'
    ? ''
    : normalizeMarkedDueDate(markMessageDueDateInput?.value);
  const previousState = new Map(
    currentMarkingMessages
      .filter((message) => message?.filename)
      .map((message) => [message.filename, buildPatchedMarkedMessage(message)]),
  );
  const nextPatch = currentMarkingMode === 'batch'
    ? { marked_tag_ids: Array.from(selectedMarkTagIds) }
    : { marked: true, marked_tag_ids: Array.from(selectedMarkTagIds), marked_due_date: dueDate || null };
  applyLocalMarkedPatch(filenames, nextPatch, {
    sourceMessages: currentMarkingMessages,
    renderHome: true,
    renderMarked: true,
  });
  try {
    if (currentMarkingMode === 'batch') {
      await invoke('set_marked_messages_tags', {
        filenames,
        tagIds: Array.from(selectedMarkTagIds),
      });
      closeMarkMessageModal();
      setMarkedSelectionMode(false);
    } else {
      await invoke('mark_message', {
        filename: currentMarkingMessages[0].filename,
        tagIds: Array.from(selectedMarkTagIds),
        dueDate: dueDate || null,
      });
      closeMarkMessageModal();
    }
  } catch (error) {
    previousState.forEach((message, filename) => {
      applyLocalMarkedPatch(filename, {
        marked: message.marked,
        marked_tag_ids: message.marked_tag_ids,
        marked_pinned: message.marked_pinned,
        marked_due_date: message.marked_due_date,
      }, {
        sourceMessages: currentMarkingMessages,
        renderHome: true,
        renderMarked: true,
      });
    });
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

  let deletedFilenames = [];
  try {
    const result = await invoke('delete_messages', {
      filenames,
      deleteRemote: choice === 'remote',
    });
    const failed = result.failed || [];
    deletedFilenames = resolveDeletedFilenames(filenames, failed);
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
    if (deletedFilenames.length > 0) {
      await refreshMessageListsAfterDelete(deletedFilenames, { render: false });
    } else {
      await Promise.all([
        loadMessages({ checkNew: true, scrollToBottom: false }),
        loadMarkedMessages(),
      ]);
    }
  }
}

async function toggleMarkedMessagePin(message, button) {
  if (!invoke || !message?.filename) return;
  if (button) {
    button.disabled = true;
    button.classList.add('is-loading');
  }
  const previous = buildPatchedMarkedMessage(message);
  const nextPinned = !message.marked_pinned;
  applyLocalMarkedPatch(message.filename, { marked_pinned: nextPinned }, {
    sourceMessages: [message],
    renderHome: true,
    renderMarked: true,
  });
  try {
    await invoke('toggle_marked_message_pin', { filename: message.filename });
  } catch (error) {
    applyLocalMarkedPatch(message.filename, {
      marked: previous.marked,
      marked_tag_ids: previous.marked_tag_ids,
      marked_pinned: previous.marked_pinned,
    }, {
      sourceMessages: [message],
      renderHome: true,
      renderMarked: true,
    });
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

  const confirmed = await showConfirmationDialog({
    title: '取消标记',
    message: '取消标记后，这条消息会从标记列表中移除，已设置的标签、置顶和到期时间也会清空。确定继续吗？',
    confirmLabel: '取消标记',
  });
  if (!confirmed) {
    return;
  }

  const previous = buildPatchedMarkedMessage(message);
  applyLocalMarkedPatch(message.filename, { marked: false, marked_tag_ids: [], marked_pinned: false, marked_due_date: null }, {
    sourceMessages: [message],
    renderHome: true,
    renderMarked: true,
  });
  if (currentPreviewMessage?.filename === message.filename) {
    closeMessagePreview();
  }

  try {
    await invoke('unmark_message', { filename: message.filename });
  } catch (error) {
    applyLocalMarkedPatch(message.filename, {
      marked: previous.marked,
      marked_tag_ids: previous.marked_tag_ids,
      marked_pinned: previous.marked_pinned,
      marked_due_date: previous.marked_due_date,
    }, {
      sourceMessages: [message],
      renderHome: true,
      renderMarked: true,
    });
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

function updateMarkedPendingFilterButton() {
  if (!markedPendingFilterButton) return;
  markedPendingFilterButton.classList.toggle('is-active', markedPendingOnly);
  markedPendingFilterButton.setAttribute('aria-pressed', markedPendingOnly ? 'true' : 'false');
}

async function toggleMarkedPendingFilter() {
  markedPendingOnly = !markedPendingOnly;
  markedMessagesPage = 1;
  updateMarkedPendingFilterButton();
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
    currentMarkedPageState = {
      useVueList: true,
      emptyMessage: query
        ? `没有找到与 "${query}" 匹配的标记消息`
        : (activeMarkedTagId ? '当前标签下暂无标记消息' : '暂无标记消息'),
      currentPage: 1,
      totalPages: Math.max(1, Math.ceil((markedMessagesTotal || 0) / MARKED_MESSAGES_PER_PAGE)),
      selectionMode: markedSelectionMode,
      selectionCount: selectedMarkedMessages.size,
      messages: [],
    };
    syncVueMarkedPageState();
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
  const totalCount = Math.max(markedMessagesTotal || messages.length, messages.length);
  const totalPages = Math.max(1, Math.ceil(totalCount / MARKED_MESSAGES_PER_PAGE));
  const validPage = Math.max(1, Math.min(markedMessagesPage, totalPages));
  markedMessagesPage = validPage;

  const pageMessages = messages;
  visibleMarkedMessages = pageMessages;
  pruneSelectedMarkedMessages();
  updateMarkedSelectionBar();
  currentMarkedPageState = {
    useVueList: true,
    emptyMessage: '',
    currentPage: markedMessagesPage,
    totalPages,
    selectionMode: markedSelectionMode,
    selectionCount: selectedMarkedMessages.size,
    messages: pageMessages.map(buildMarkedMessageViewModel),
  };
  syncVueMarkedPageState();

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
    const dueDateText = formatMarkedDueDateText(message.marked_due_date);
    if (dueDateText) {
      const dueChip = document.createElement('span');
      dueChip.className = 'marked-message-due-chip';
      dueChip.classList.toggle('is-pending', isMarkedMessagePending(message));
      dueChip.textContent = dueDateText;
      tagRow.appendChild(dueChip);
    }
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
    const pinLabel = document.createElement('span');
    pinLabel.className = 'marked-pin-label';
    pinLabel.textContent = message.marked_pinned ? '已置顶' : '置顶';
    pinButton.appendChild(pinLabel);
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
  renderMarkedPagination(totalCount, totalPages);
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
      loadMarkedMessages({ preservePage: true, scrollToTop: true });
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
      loadMarkedMessages({ preservePage: true, scrollToTop: true });
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
  const { scrollToTop = false, preservePage = false } = options;
  if (!getActiveEndpoint()) {
    markedMessages = [];
    visibleMarkedMessages = [];
    markedMessagesTotal = 0;
    setMarkedSelectionMode(false);
    renderMarkedMessages([]);
    updateMarkedBadge(0);
    if (scrollToTop) {
      scrollMarkedMessageListToTop();
    }
    return;
  }

  try {
    if (!preservePage) {
      markedMessagesPage = 1;
    }
    const offset = Math.max(0, (markedMessagesPage - 1) * MARKED_MESSAGES_PER_PAGE);
    const result = await invoke('list_marked_messages', {
      tagId:
        activeMarkedTagId
          ? activeMarkedTagId
          : null,
      searchQuery: getAppliedMarkedSearchQuery() || null,
      limit: MARKED_MESSAGES_PER_PAGE,
      offset,
      pendingOnly: markedPendingOnly,
    });
    markedMessages = result.messages || [];
    markedMessagesTotal = result.total || 0;
    const totalPages = Math.max(1, Math.ceil(markedMessagesTotal / MARKED_MESSAGES_PER_PAGE));
    if (markedMessagesPage > totalPages) {
      markedMessagesPage = totalPages;
      return loadMarkedMessages({ scrollToTop, preservePage: true });
    }
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

function getCurrentMessageSearchState() {
  if (feedState?.getCurrentMessageSearchState) {
    return feedState.getCurrentMessageSearchState(searchInput ? searchInput.value : '');
  }
  const rawQuery = searchInput ? searchInput.value.trim() : '';
  const normalizedQuery = rawQuery.toLowerCase();
  return {
    rawQuery,
    normalizedQuery,
    hasQuery: normalizedQuery.length > 0,
  };
}

function updateLoadMoreHintForCurrentView() {
  const filtered = feedState?.filterMessagesForSearch
    ? feedState.filterMessagesForSearch(lastMessages, searchInput ? searchInput.value : '')
    : null;
  const { rawQuery, normalizedQuery, hasQuery } = filtered
    ? filtered.searchState
    : getCurrentMessageSearchState();
  const messagesToRender = filtered
    ? filtered.messages
    : !hasQuery
      ? lastMessages
      : lastMessages.filter((message) => {
          if (message.kind === 'text') {
            return (message.content || '').toLowerCase().includes(normalizedQuery);
          }
          if (message.kind === 'file') {
            return (message.original_name || '').toLowerCase().includes(normalizedQuery);
          }
          return false;
        });
  syncVueHomeFeedView({
    query: rawQuery,
    messages: messagesToRender,
  });
}

function renderCurrentMessageView(options = {}) {
  const filtered = feedState?.filterMessagesForSearch
    ? feedState.filterMessagesForSearch(lastMessages, searchInput ? searchInput.value : '')
    : null;
  const { rawQuery, normalizedQuery, hasQuery } = filtered
    ? filtered.searchState
    : getCurrentMessageSearchState();
  const messagesToRender = filtered
    ? filtered.messages
    : !hasQuery
      ? lastMessages
      : lastMessages.filter((message) => {
          if (message.kind === 'text') {
            return (message.content || '').toLowerCase().includes(normalizedQuery);
          }
          if (message.kind === 'file') {
            return (message.original_name || '').toLowerCase().includes(normalizedQuery);
          }
          return false;
        });

  renderMessages(messagesToRender, {
    ...options,
    isSearchResult: hasQuery,
    query: rawQuery,
  });
}

function updateAndRender(options = {}) {
  renderCurrentMessageView(options);
}

let searchDebounceTimer = null;
const SEARCH_DEBOUNCE_MS = 300;

async function executeSearch() {
  const query = searchInput ? searchInput.value.trim() : '';
  if (!invoke || !getActiveEndpoint()) {
    renderCurrentMessageView({ preserveScroll: true });
    return;
  }
  
  if (!query) {
    // 无搜索词时恢复正常加载
    await loadMessages({ scrollToBottom: false });
    return;
  }
  
  try {
    const result = await invoke('list_messages', {
      limit: null,
      offset: null,
      onlyMarked: null,
      searchQuery: query,
    });
    lastMessages = result.messages || [];
    totalMessages = result.total || 0;
    hasMoreMessages = false;
    oldestLoadedMessageRef = null;
    newestLoadedMessageRef = null;
    syncLoadedMessageBoundaries();
    renderCurrentMessageView({ preserveScroll: true, isSearchResult: true, query });
    if (result.marked_count !== undefined) {
      updateMarkedBadge(result.marked_count);
    }
    updateLoadMoreHintForCurrentView();
  } catch (error) {
    showToast('搜索失败: ' + error, 'error');
  }
}

if (searchInput) {
  searchInput.addEventListener('input', () => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = setTimeout(() => {
      executeSearch();
    }, SEARCH_DEBOUNCE_MS);
  });
  searchInput.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      await executeSearch();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      await closeFeedSearch({ clear: true });
    }
  });
}

if (feedSearchButton) {
  feedSearchButton.addEventListener('click', async () => {
    await executeSearch();
  });
}

if (feedSearchCloseButton) {
  feedSearchCloseButton.addEventListener('click', async () => {
    await closeFeedSearch({ clear: true });
  });
}

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.key.toLowerCase() !== 'f' || event.isComposing) return;
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  const target = event.target;
  if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], .cw-editor, .CodeMirror')) return;
  const homePanel = document.querySelector('[data-tab-panel="home"]');
  if (homePanel && !homePanel.classList.contains('is-active')) return;
  if (document.querySelector('.dialog-overlay, .message-preview.is-active')) return;
  event.preventDefault();
  openFeedSearch();
});

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

async function loadAppVersion() {
  const versionElement = document.getElementById('app-version');
  if (!versionElement) return;
  try {
    const version = await invoke('get_app_version');
    versionElement.textContent = version;
    vueBridge?.syncAppVersion?.(version);
  } catch (error) {
    console.error('Failed to load app version:', error);
    versionElement.textContent = '未知';
  }
}

loadAppVersion();
