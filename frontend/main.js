const tauri = window.__TAURI__ || {};
const invoke = tauri.core?.invoke || tauri.invoke;
const openDialog = tauri.dialog?.open;
const saveDialog = tauri.dialog?.save;
const listen = tauri.event?.listen;

const messageList = document.getElementById('message-list');
const syncStatus = document.getElementById('sync-status');
const refreshButton = document.getElementById('refresh-btn');
const refreshLabel = refreshButton ? refreshButton.querySelector('.refresh-label') : null;
const refreshLabelDefault = refreshLabel ? refreshLabel.textContent : '';
const textInput = document.getElementById('text-input');
const sendTextButton = document.getElementById('send-text');
const sendFileButton = document.getElementById('send-file');
const saveSettingsButton = document.getElementById('save-settings');
const scrollToBottomButton = document.getElementById('scroll-to-bottom');
const composer = document.querySelector('.composer');
const feed = document.querySelector('.feed');
const tabButtons = Array.from(document.querySelectorAll('[data-tab-target]'));
const tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));

const endpointSelect = document.getElementById('active-endpoint');
const webdavList = document.getElementById('webdav-list');
const addWebdavButton = document.getElementById('add-webdav');
const senderNameInput = document.getElementById('sender-name');
const refreshIntervalInput = document.getElementById('refresh-interval');
const downloadDirInput = document.getElementById('download-dir');
const chooseDownloadDirButton = document.getElementById('choose-download-dir');
const downloadDirHint = document.getElementById('download-dir-hint');
const toggleSelectionButton = document.getElementById('toggle-selection');
const selectionBar = document.getElementById('selection-bar');
const selectionCount = document.getElementById('selection-count');
const selectAllButton = document.getElementById('select-all');
const deleteSelectedButton = document.getElementById('delete-selected');
const cancelSelectionButton = document.getElementById('cancel-selection');
const cleanupMessagesButton = document.getElementById('cleanup-messages');
const exportSettingsButton = document.getElementById('export-settings');
const importSettingsButton = document.getElementById('import-settings');

let refreshTimer = null;
let didInitialSync = false;
let webdavEndpoints = [];
let activeEndpointId = null;
const downloadProgress = new Map();
const pendingUploads = new Map();
let lastMessages = [];
const downloadSpeed = new Map();
const uploadSpeed = new Map();
let selectionMode = false;
const selectedMessages = new Set();

// 分页相关状态
const PAGE_SIZE = 10;
let currentOffset = 0;
let totalMessages = 0;
let hasMoreMessages = false;
let isLoadingMore = false;

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
  if (message.download_exists || (message.local_path && message.local_path.trim())) {
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
  try {
    const result = await invoke('download_message_file', {
      filename: message.filename,
      originalName: message.original_name,
      conflictAction: 'overwrite',
    });
    if (result.status && result.status !== 'saved') {
      setErrorStatus('下载失败');
      return;
    }
  } catch (error) {
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
    return;
  }
  webdavEndpoints.forEach((endpoint) => {
    const card = document.createElement('div');
    card.className = 'endpoint-card';
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

    actions.appendChild(enabledLabel);
    actions.appendChild(activeLabel);

    nameInput.addEventListener('input', () => {
      endpoint.name = nameInput.value;
      title.textContent = getEndpointLabel(endpoint);
      renderEndpointSelect();
    });
    urlInput.addEventListener('input', () => {
      endpoint.url = urlInput.value;
      title.textContent = getEndpointLabel(endpoint);
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

    card.appendChild(header);
    card.appendChild(fields);
    card.appendChild(actions);
    webdavList.appendChild(card);
  });
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

function setProgressFor(filename, payload) {
  if (!filename) return;
  if (!payload || payload.status !== 'progress') {
    downloadProgress.delete(filename);
    return;
  }
  downloadProgress.set(filename, payload);
}

function updateProgressUI(filename) {
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
  if (!selectionBar || !selectionCount || !deleteSelectedButton) return;
  const count = selectedMessages.size;
  const selectableCount = selectionMode ? getSelectableMessages().length : 0;
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

function syncComposerOffset() {
  if (!composer || !feed) return;
  const offset = Math.round(composer.offsetHeight + 12);
  feed.style.setProperty('--composer-offset', `${offset}px`);
}

function setActiveTab(name, options = {}) {
  const target = name || 'home';
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
  if (target === 'home' && options.scrollToBottom) {
    scrollMessageListToBottom();
  }
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
    message.textContent = `将删除 ${count} 条消息，选择删除范围。`;

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

async function copyTextToClipboard(text) {
  if (!text) {
    await showInfoDialog({
      title: '复制失败',
      message: '没有可复制的内容',
    });
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
    await showInfoDialog({
      title: '复制成功',
      message: '已复制到剪贴板',
    });
  } catch (error) {
    await showInfoDialog({
      title: '复制失败',
      message: String(error),
    });
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

async function downloadMessageFile(message) {
  try {
    console.info('[download] click', {
      filename: message.filename,
      original_name: message.original_name,
    });
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    const result = await invoke('download_message_file', {
      filename: message.filename,
      originalName: message.original_name,
      conflictAction: 'prompt',
    });
    console.info('[download] result', result);

    if (result.status === 'conflict') {
      const choice = await showDownloadConflictDialog(message.original_name);
      console.info('[download] conflict choice', choice);
      if (choice === 'cancel') {
        setStatus('已取消下载');
        return;
      }
      const retry = await invoke('download_message_file', {
        filename: message.filename,
        originalName: message.original_name,
        conflictAction: choice,
      });
      console.info('[download] retry result', retry);
      if (retry.status === 'saved') {
        setSuccessStatus(`文件已保存到 ${retry.path || ''}`.trim());
      }
      return;
    }

    if (result.status === 'saved') {
      setSuccessStatus(`文件已保存到 ${result.path || ''}`.trim());
    }
  } catch (error) {
    console.error('[download] error', error);
    setErrorStatus(`下载失败：${error}`);
  }
}

async function saveMessageFileAs(message) {
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
    const result = await invoke('save_message_file_as', {
      filename: message.filename,
      targetPath: target,
    });
    console.info('[download] save as result', result);
    setSuccessStatus(`文件已保存到 ${result.path || target}`.trim());
  } catch (error) {
    console.error('[download] save as error', error);
    setErrorStatus(`另存为失败：${error}`);
  }
}

async function deleteSingleMessage(message) {
  if (!message || !message.filename) {
    return;
  }
  if (!invoke) {
    await showInfoDialog({
      title: '删除失败',
      message: '未检测到 Tauri API，请检查 app.withGlobalTauri 设置',
    });
    return;
  }
  const choice = await showDeleteConfirmDialog(1);
  if (choice === 'cancel') {
    return;
  }
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
      await showInfoDialog({
        title: '删除成功',
        message: '已删除 1 条消息',
      });
    }
    await loadMessages();
  } catch (error) {
    await showInfoDialog({
      title: '删除失败',
      message: String(error),
    });
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
      await showInfoDialog({
        title: '删除成功',
        message: `已删除 ${result.deleted || filenames.length} 条消息`,
      });
    }
  } catch (error) {
    await showInfoDialog({
      title: '删除失败',
      message: String(error),
    });
  } finally {
    setSelectionMode(false);
    await loadMessages();
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
    await loadMessages();
  } catch (error) {
    setErrorStatus(`清理失败：${error}`);
    await showInfoDialog({
      title: '清理失败',
      message: String(error),
    });
  }
}
function renderMessages(messages, options = {}) {
  lastMessages = Array.isArray(messages) ? messages : [];
  const merged = mergeMessages(lastMessages);
  const { scrollToBottom = false, preserveScroll = false } = options;
  const previousScrollTop = messageList ? messageList.scrollTop : 0;
  const previousScrollHeight = messageList ? messageList.scrollHeight : 0;
  const available = new Set(merged.map((message) => message.filename));
  selectedMessages.forEach((filename) => {
    if (!available.has(filename)) {
      selectedMessages.delete(filename);
    }
  });
  updateSelectionBar();
  messageList.innerHTML = '';
  
  // 添加"加载更多"提示
  if (hasMoreMessages) {
    const loadMoreItem = document.createElement('li');
    loadMoreItem.className = 'load-more-hint';
    loadMoreItem.id = 'load-more-hint';
    loadMoreItem.textContent = isLoadingMore ? '加载中...' : '向上滚动加载更多';
    messageList.appendChild(loadMoreItem);
  }
  
  if (!merged || merged.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'message-card';
    empty.textContent = '暂无消息';
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
    item.classList.toggle('is-file', isFile);
    item.classList.toggle('is-text', !isFile);
    item.classList.toggle('is-self', isSelf);
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
      body.textContent = message.content || '';
    } else {
      body.textContent = message.original_name || message.filename || '';
      body.addEventListener('click', (event) => {
        if (selectionMode) {
          return;
        }
        if (message.uploading) {
          return;
        }
        if (event.target.closest('button, a, input, textarea, select, summary, details')) {
          return;
        }
        openMessageFile(message);
      });
    }

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = `大小 ${formatBytes(message.size || 0)}`;

    const actions = document.createElement('div');
    actions.className = 'message-actions';

    if (message.kind === 'text') {
      const copyButton = document.createElement('button');
      copyButton.className = 'button ghost small';
      copyButton.textContent = '复制';
      copyButton.addEventListener('click', () => copyTextToClipboard(message.content || ''));
      actions.appendChild(copyButton);
    } else {
      if (message.uploading) {
        item.classList.add('is-uploading');
        const uploadingTag = document.createElement('span');
        uploadingTag.className = 'uploading-tag';
        uploadingTag.textContent = '上传中';
        actions.appendChild(uploadingTag);
      } else {
        const progress = downloadProgress.get(message.filename);
        const isDownloading = progress && progress.status === 'progress';
        if (isDownloading) {
          item.classList.add('is-downloading');
        }

        if (!message.download_exists) {
          const downloadButton = document.createElement('button');
          downloadButton.className = 'button primary small download-action';
          downloadButton.textContent = '下载';
          downloadButton.addEventListener('click', () => downloadMessageFile(message));
          actions.appendChild(downloadButton);

          const downloadingTag = document.createElement('span');
          downloadingTag.className = 'downloading-tag download-progress-tag';
          downloadingTag.textContent = '下载中';
          actions.appendChild(downloadingTag);
        } else {
          const downloadedTag = document.createElement('span');
          downloadedTag.className = 'downloaded-tag';
          downloadedTag.textContent = '已下载';
          actions.appendChild(downloadedTag);
        }

        const menu = document.createElement('details');
        menu.className = 'action-menu';

        const summary = document.createElement('summary');
        summary.className = 'button ghost small';
        summary.textContent = '更多';

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
        deleteButton.className = 'button ghost small';
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
      }
    }

    const footer = document.createElement('div');
    footer.className = 'message-footer';
    footer.appendChild(meta);
    footer.appendChild(actions);

    item.appendChild(header);
    item.appendChild(body);
    item.appendChild(footer);

    item.addEventListener('click', (event) => {
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
      const progress = downloadProgress.get(message.filename);
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

      if (progress && progress.status === 'progress') {
        const total = progress.total || 0;
        if (total > 0) {
          const percent = Math.min(100, Math.round((progress.received / total) * 100));
          progressFill.style.width = `${percent}%`;
        }
        progressText.textContent = formatProgress(
          progress.received || 0,
          progress.total,
          '已下载',
          getSpeed(downloadSpeed, message.filename),
        );
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
function mergeMessages(messages) {
  const merged = [...messages];
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
  merged.sort((a, b) => (a.timestamp_ms || 0) - (b.timestamp_ms || 0));
  return merged;
}

async function loadMessages(options = {}) {
  const shouldScroll =
    typeof options.scrollToBottom === 'boolean'
      ? options.scrollToBottom
      : isMessageListAtBottom();
  const loadMore = options.loadMore || false;
  
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!getActiveEndpoint()) {
      lastMessages = [];
      totalMessages = 0;
      hasMoreMessages = false;
      currentOffset = 0;
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
      
      if (result.messages && result.messages.length > 0) {
        // 将新加载的消息添加到开头
        lastMessages = [...result.messages, ...lastMessages];
        currentOffset = newOffset;
        hasMoreMessages = result.has_more;
        totalMessages = result.total;
        renderMessages(lastMessages, { scrollToBottom: false, preserveScroll: true });
      }
    } else {
      // 初始加载或刷新：加载最新的消息
      currentOffset = 0;
      const result = await invoke('list_messages', { limit: PAGE_SIZE, offset: 0 });
      lastMessages = result.messages || [];
      totalMessages = result.total || 0;
      hasMoreMessages = result.has_more || false;
      renderMessages(lastMessages, { scrollToBottom: shouldScroll });
    }
  } catch (error) {
    isLoadingMore = false;
    setErrorStatus(`加载消息失败：${error}`);
  }
}

async function loadSyncStatus() {
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
    if (status.last_error) {
      setErrorStatus(`同步错误：${status.last_error}`);
      return;
    }
    if (status.running) {
      setStatus(status.last_result || '同步中');
    } else {
      setSuccessStatus(status.last_result || '已同步');
    }
  } catch (error) {
    setErrorStatus(`状态更新失败：${error}`);
  }
}

function startRefreshTimer(intervalSecs) {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  const interval = Math.max(1, Number(intervalSecs) || 5);
  refreshTimer = setInterval(() => {
    loadMessages();
    loadSyncStatus();
  }, interval * 1000);
}

function applySettings(settings) {
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
  if (refreshIntervalInput) {
    refreshIntervalInput.value = settings.refresh_interval_secs || 5;
  }
  if (downloadDirInput) {
    downloadDirInput.value = settings.download_dir || '';
    setHint(downloadDirHint, '');
  }
  renderWebdavEndpoints();
  renderEndpointSelect();
  startRefreshTimer(settings.refresh_interval_secs || 5);
}

async function loadSettings() {
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    const settings = await invoke('get_settings');
    applySettings(settings);
    if (!didInitialSync && getActiveEndpoint()) {
      didInitialSync = true;
      await manualRefresh();
    }
  } catch (error) {
    setErrorStatus(`读取设置失败：${error}`);
  }
}

async function saveSettings() {
  const endpoints = collectEndpointPayload();
  for (const endpoint of endpoints) {
    if (endpoint.enabled && !endpoint.url) {
      setErrorStatus('启用的 WebDAV 端点必须填写 URL');
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
    setHint(downloadDirHint, '下载目录已保存');
    if (previousActive !== activeEndpointId && getActiveEndpoint()) {
      setSelectionMode(false);
      downloadProgress.clear();
      downloadSpeed.clear();
      pendingUploads.clear();
      uploadSpeed.clear();
      await manualRefresh();
      didInitialSync = true;
    }
  } catch (error) {
    setErrorStatus(`保存设置失败：${error}`);
  }
}

async function exportSettings() {
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
    setSuccessStatus(`配置已导出到 ${target}`.trim());
  } catch (error) {
    setErrorStatus(`导出配置失败：${error}`);
  }
}

async function importSettings() {
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!openDialog) {
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
    setSuccessStatus('配置已导入并生效');
    if (previousActive !== activeEndpointId && getActiveEndpoint()) {
      setSelectionMode(false);
      downloadProgress.clear();
      downloadSpeed.clear();
      pendingUploads.clear();
      uploadSpeed.clear();
      await manualRefresh();
      didInitialSync = true;
    }
  } catch (error) {
    setErrorStatus(`导入配置失败：${error}`);
  }
}

async function sendText() {
  const text = textInput.value.trim();
  if (!text) {
    return;
  }
  if (!getActiveEndpoint()) {
    setErrorStatus('请先选择 WebDAV 端点');
    return;
  }
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    await invoke('send_text', { text });
    textInput.value = '';
    await loadMessages({ scrollToBottom: true });
    setSuccessStatus('发送成功');
  } catch (error) {
    setErrorStatus(`发送失败：${error}`);
  }
}

async function sendFile() {
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
    const selected = await openDialog({ multiple: false, directory: false });
    if (!selected) {
      return;
    }
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) {
      return;
    }
    clientId = `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const originalName = path.split(/[/\\]/).pop() || path;
    pendingUploads.set(clientId, {
      clientId,
      originalName,
      localPath: path,
      timestamp_ms: Date.now(),
      received: 0,
      total: 0,
      status: 'progress',
    });
    renderMessages(lastMessages, { scrollToBottom: true });
    await invoke('send_file', { path, clientId });
    if (clientId) {
      pendingUploads.delete(clientId);
      renderMessages(lastMessages);
    }
    await loadMessages({ scrollToBottom: true });
    setSuccessStatus('发送成功');
  } catch (error) {
    if (clientId) {
      pendingUploads.delete(clientId);
      renderMessages(lastMessages);
    }
    setErrorStatus(`发送文件失败：${error}`);
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
    downloadProgress.clear();
    downloadSpeed.clear();
    pendingUploads.clear();
    uploadSpeed.clear();
    await manualRefresh();
    didInitialSync = true;
  } catch (error) {
    setErrorStatus(`切换端点失败：${error}`);
    renderEndpointSelect();
  }
}

async function manualRefresh() {
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!getActiveEndpoint()) {
      setErrorStatus('请先选择 WebDAV 端点');
      return;
    }
    setRefreshLoading(true);
    await invoke('manual_refresh');
    await loadMessages();
    await loadSyncStatus();
  } catch (error) {
    setErrorStatus(`手动刷新失败：${error}`);
  } finally {
    setRefreshLoading(false);
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
      setProgressFor(filename, payload);
      updateSpeedTracker(downloadSpeed, filename, payload.received || 0);
      updateProgressUI(filename);
      return;
    }
    if (payload.status === 'complete') {
      downloadProgress.delete(filename);
      downloadSpeed.delete(filename);
      updateProgressUI(filename);
      loadMessages();
      return;
    }
    if (payload.status === 'error') {
      downloadProgress.delete(filename);
      downloadSpeed.delete(filename);
      updateProgressUI(filename);
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
      entry.received = payload.received || 0;
      entry.total = payload.total || 0;
      entry.status = 'progress';
      pendingUploads.set(clientId, entry);
      updateSpeedTracker(uploadSpeed, clientId, entry.received);
      updateUploadProgressUI(clientId);
      return;
    }
    if (payload.status === 'complete') {
      pendingUploads.delete(clientId);
      uploadSpeed.delete(clientId);
      renderMessages(lastMessages);
      loadMessages();
      return;
    }
    if (payload.status === 'error') {
      pendingUploads.delete(clientId);
      uploadSpeed.delete(clientId);
      renderMessages(lastMessages);
      if (payload.error) {
        setErrorStatus(`上传失败：${payload.error}`);
      }
    }
  });
}

refreshButton.addEventListener('click', manualRefresh);
sendTextButton.addEventListener('click', sendText);
sendFileButton.addEventListener('click', sendFile);
saveSettingsButton.addEventListener('click', saveSettings);
if (chooseDownloadDirButton) {
  chooseDownloadDirButton.addEventListener('click', chooseDownloadDir);
}
if (addWebdavButton) {
  addWebdavButton.addEventListener('click', addWebdavEndpoint);
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
if (cleanupMessagesButton) {
  cleanupMessagesButton.addEventListener('click', cleanupMessages);
}
if (exportSettingsButton) {
  exportSettingsButton.addEventListener('click', exportSettings);
}
if (importSettingsButton) {
  importSettingsButton.addEventListener('click', importSettings);
}

if (scrollToBottomButton) {
  scrollToBottomButton.addEventListener('click', scrollMessageListToBottom);
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

if (textInput) {
  textInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
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
  minimizeAppWindow();
});

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.tabTarget;
    setActiveTab(target, { scrollToBottom: target === 'home' });
  });
});

loadSettings();
loadMessages({ scrollToBottom: true });
loadSyncStatus();
setActiveTab('home', { scrollToBottom: true });

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
    pendingUploads.set(clientId, {
      clientId,
      originalName,
      localPath: path,
      timestamp_ms: Date.now(),
      received: 0,
      total: 0,
      status: 'progress',
    });
    renderMessages(lastMessages, { scrollToBottom: true });
    await invoke('send_file', { path, clientId });
    if (clientId) {
      pendingUploads.delete(clientId);
      renderMessages(lastMessages);
    }
    await loadMessages({ scrollToBottom: true });
    setSuccessStatus('发送成功');
  } catch (error) {
    if (clientId) {
      pendingUploads.delete(clientId);
      renderMessages(lastMessages);
    }
    setErrorStatus(`发送文件失败：${error}`);
  }
}

function isPointInElement(x, y, element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function setDragOverState(active) {
  if (composerRow) {
    composerRow.classList.toggle('is-drag-over', active);
  }
}

if (listen) {
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
    
    // 逐个发送文件
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
    pendingUploads.set(clientId, {
      clientId,
      originalName,
      localPath: null,
      timestamp_ms: Date.now(),
      received: 0,
      total: data.length,
      status: 'progress',
    });
    renderMessages(lastMessages, { scrollToBottom: true });
    await invoke('send_file_data', { data: Array.from(data), originalName, clientId });
    if (clientId) {
      pendingUploads.delete(clientId);
      renderMessages(lastMessages);
    }
    await loadMessages({ scrollToBottom: true });
    setSuccessStatus('发送成功');
  } catch (error) {
    if (clientId) {
      pendingUploads.delete(clientId);
      renderMessages(lastMessages);
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