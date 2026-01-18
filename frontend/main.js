const tauri = window.__TAURI__ || {};
const invoke = tauri.core?.invoke || tauri.invoke;
const openDialog = tauri.dialog?.open;
const saveDialog = tauri.dialog?.save;
const listen = tauri.event?.listen;
const convertFileSrc = tauri.path?.convertFileSrc;

const messageList = document.getElementById('message-list');
const syncStatus = document.getElementById('sync-status');
const refreshButton = document.getElementById('refresh-btn');
const refreshLabel = refreshButton ? refreshButton.querySelector('.refresh-label') : null;
const refreshLabelDefault = refreshLabel ? refreshLabel.textContent : '';
const openDownloadDirButton = document.getElementById('open-download-dir');
const textInput = document.getElementById('text-input');
const markdownEditorContainer = document.getElementById('markdown-editor');
const formatInputs = document.querySelectorAll('input[name="message-format"]');
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
const batchSpeedTestButton = document.getElementById('batch-speed-test');
const senderNameInput = document.getElementById('sender-name');
const refreshIntervalInput = document.getElementById('refresh-interval');
const downloadDirInput = document.getElementById('download-dir');
const chooseDownloadDirButton = document.getElementById('choose-download-dir');
const downloadDirHint = document.getElementById('download-dir-hint');
const autoStartInput = document.getElementById('auto-start');
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
const markedFilterLabel = document.getElementById('marked-filter-label');
const messagePreview = document.getElementById('message-preview');
const messagePreviewBody = document.getElementById('message-preview-body');
const messagePreviewMeta = document.getElementById('message-preview-meta');
const messagePreviewActions = document.getElementById('message-preview-actions');
const messagePreviewClose = document.querySelector('.message-preview-close');
const messagePreviewBackdrop = messagePreview ? messagePreview.querySelector('.message-preview-backdrop') : null;
const searchInput = document.getElementById('search-input');

let selectedFiles = [];

let refreshTimer = null;
let didInitialSync = false;
let webdavEndpoints = [];
let activeEndpointId = null;
const downloadProgress = new Map();
const pendingUploads = new Map();
const pendingSends = new Map(); // 待发送消息的状态管理
let lastMessages = [];
const downloadSpeed = new Map();
const uploadSpeed = new Map();
let selectionMode = false;
let markedFilterActive = false;
const selectedMessages = new Set();
let currentPreviewMessage = null;

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

// Markdown Editor instance
let mdEditor = null;
let currentFormat = 'text';

function initMarkdownEditor() {
  if (mdEditor) return;
  
  mdEditor = editormd("markdown-editor", {
    width: "100%",
    height: 200,
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
        updateFormatToggleIndicator();
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

function syncComposerOffset() {
  if (!composer || !feed) return;
  const offset = Math.round(composer.offsetHeight + 12);
  feed.style.setProperty('--composer-offset', `${offset}px`);
}

function setActiveTab(name, options = {}) {
  const target = name || 'home';
  const { scrollToBottom = false, focusInput = false } = options;
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
  if (target === 'home') {
    if (scrollToBottom) {
      scrollMessageListToBottom();
    }
    if (focusInput) {
      focusTextInput();
    }
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
    await loadMessages();
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

async function toggleMessageMarked(message) {
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

function updateMarkedBadge(count) {
  if (!markedFilterLabel || !filterMarkedButton) return;
  const validCount = Math.max(0, count);
  markedFilterLabel.textContent = `已标记 (${validCount})`;
  filterMarkedButton.classList.toggle('has-marked', validCount > 0);
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
  } else {
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'button primary small';
    openButton.textContent = message.download_exists ? '打开文件' : '下载并打开';
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
    openBtn.textContent = message.download_exists ? '打开文件' : '下载并打开';
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
  selectedMessages.forEach((filename) => {
    if (!available.has(filename)) {
      selectedMessages.delete(filename);
    }
  });
  updateSelectionBar();
  messageList.innerHTML = '';
  
  const markdownRenderQueue = [];

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
    } else {
      const isImage = isImagePath(message.original_name || message.filename);
      if (isImage) {
        body.classList.add('is-image-message');
        const thumbImg = document.createElement('img');
        thumbImg.className = 'message-thumbnail';
        thumbImg.alt = '缩略图';
        // Add loading placeholder
        body.innerHTML = '';
        body.appendChild(thumbImg);
        
        const tauriConvert = window.__TAURI__?.tauri?.convertFileSrc || window.__TAURI__?.path?.convertFileSrc || window.__TAURI__?.core?.convertFileSrc;
        
        invoke('get_thumbnail', { filename: message.filename })
          .then(path => {
            if (tauriConvert) {
              thumbImg.src = tauriConvert(path);
            }
          })
          .catch(err => {
            console.warn('Load thumbnail failed', err);
            body.textContent = message.original_name || message.filename || '';
          });
          
        body.addEventListener('dblclick', () => {
          openMessagePreview(message);
        });
      } else {
        body.textContent = message.original_name || message.filename || '';
      }
      
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
        if (fileBodyClickTimer) {
          clearTimeout(fileBodyClickTimer);
        }
        fileBodyClickTimer = setTimeout(() => {
          openMessageFile(message);
          fileBodyClickTimer = null;
        }, 180);
      });
    }

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
        const progress = downloadProgress.get(message.filename);
        const isDownloading = progress && progress.status === 'progress';
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

        if (!message.download_exists) {
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
        } else {
          const downloadedTag = document.createElement('span');
          downloadedTag.className = 'downloaded-tag';
          downloadedTag.textContent = '已下载';
          actions.appendChild(downloadedTag);
        }

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
  
  // Render pending markdown messages
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
    }, 0);
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

async function loadMessages(options = {}) {
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
      const result = await invoke('list_messages', { limit: PAGE_SIZE, offset: newOffset, onlyMarked: markedFilterActive });
      isLoadingMore = false;
      
      if (result.marked_count !== undefined) {
        updateMarkedBadge(result.marked_count);
      }

      if (result.messages && result.messages.length > 0) {
        // 将新加载的消息添加到开头
        lastMessages = [...result.messages, ...lastMessages];
        currentOffset = newOffset;
        hasMoreMessages = result.has_more;
        totalMessages = result.total;
        renderMessages(lastMessages, { scrollToBottom: false, preserveScroll: true });
      }
    } else if (checkNew) {
      // 定时刷新模式：只检查新消息
      const result = await invoke('list_messages', { limit: PAGE_SIZE, offset: 0, onlyMarked: markedFilterActive });
      
      if (result.marked_count !== undefined) {
        updateMarkedBadge(result.marked_count);
      }

      const newMessages = result.messages || [];
      
      if (newMessages.length === 0) {
        // 没有任何消息
        if (lastMessages.length > 0) {
          lastMessages = [];
          totalMessages = 0;
          hasMoreMessages = false;
          currentOffset = 0;
          renderMessages([], { scrollToBottom: shouldScroll });
        }
        return;
      }
      
      if (lastMessages.length === 0) {
        // 本地没有消息，直接使用服务器返回的消息
        lastMessages = newMessages;
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
          if (oldMsg.marked !== newMsg.marked || oldMsg.download_exists !== newMsg.download_exists) {
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
        totalMessages = result.total || 0;
        hasMoreMessages = result.has_more || false;
        
        // 如果当前在底部，自动滚动到底��显示新消息
        // 如果当前在底部，或者由于状态更新触发，自动滚动/重新渲染
        const autoScroll = isMessageListAtBottom();
        renderMessages(lastMessages, { scrollToBottom: autoScroll });
      } else {
        // 没有新消息，但可能总数变化了（比如有消息被删除）
        if (totalMessages !== result.total) {
          totalMessages = result.total || 0;
          hasMoreMessages = result.has_more || false;
        }
      }
    } else {
      // 初始加载或手动刷新：加载最新的消息
      currentOffset = 0;
      const result = await invoke('list_messages', { limit: PAGE_SIZE, offset: 0, onlyMarked: markedFilterActive });
      
      if (result.marked_count !== undefined) {
        updateMarkedBadge(result.marked_count);
      }

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
      setStatus(status.last_result || '同步中...');
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
    const hasSearchQuery = searchInput && searchInput.value.trim().length > 0;
    if (hasSearchQuery) {
      return; // Don't refresh if searching
    }
    // 使用 checkNew 模式进行增量更新，不清空现有数据
    loadMessages({ checkNew: true });
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
  if (autoStartInput) {
    autoStartInput.checked = settings.auto_start || false;
  }
  if (globalHotkeyInput) {
    globalHotkeyInput.value = (settings.global_hotkey || DEFAULT_GLOBAL_HOTKEY).toLowerCase();
  }
  if (globalHotkeyEnabledInput) {
    globalHotkeyEnabledInput.checked = settings.global_hotkey_enabled !== false;
  }
  syncGlobalHotkeyInputState();
  setSendHotkey(settings.send_hotkey || SEND_HOTKEY.ENTER);
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
  const globalHotkeyEnabled = globalHotkeyEnabledInput ? globalHotkeyEnabledInput.checked : true;
  const normalizedGlobalHotkey = normalizeGlobalHotkey(
    (globalHotkeyInput ? globalHotkeyInput.value : DEFAULT_GLOBAL_HOTKEY) || '',
  );
  if (globalHotkeyEnabled && !normalizedGlobalHotkey) {
    setErrorStatus('全局快捷键需包含修饰键，例如 Ctrl+Alt+T');
    return;
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

async function backupWebdav() {
  const originalText = backupWebdavButton ? backupWebdavButton.textContent : '备份';
  try {
    if (!invoke) {
      setErrorStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置');
      return;
    }
    if (!getActiveEndpoint()) {
      setErrorStatus('请先选择 WebDAV 端点');
      return;
    }
    if (!saveDialog) {
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
      setErrorStatus('未���测到 Tauri API，请检查 app.withGlobalTauri 设置');
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
    await manualRefresh();
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
      });

      if (currentFormat === 'markdown' && mdEditor) {
        mdEditor.setMarkdown('');
      } else {
        textInput.value = '';
      }
      
      renderMessages(lastMessages);
      scrollMessageListToBottom();

      try {
        await invoke('send_text', { text, format: currentFormat });
        pendingSends.set(filename, {
          ...pendingSends.get(filename),
          sendStatus: SEND_STATUS.SUCCESS,
        });
        setTimeout(() => {
          pendingSends.delete(filename);
          loadMessages();
        }, 1000);
      } catch (error) {
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
  } catch (error) {
    setErrorStatus(`批量测速失败：${error}`);
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

async function updateMessageDownloadStatus(filename) {
  try {
    if (!invoke || !getActiveEndpoint()) {
      return;
    }
    // 重新加载当前页的消息列表以获取最新的下载状态
    const result = await invoke('list_messages', { limit: PAGE_SIZE, offset: currentOffset });
    const updatedMessages = result.messages || [];
    
    // 创建消息映射以便快速查找
    const messageMap = new Map(updatedMessages.map(msg => [msg.filename, msg]));
    
    // 如果目标消息在当前页返回的消息中，更新 lastMessages 数组中对应的消息
    if (messageMap.has(filename)) {
      const updatedMessage = messageMap.get(filename);
      lastMessages = lastMessages.map(msg => {
        if (msg.filename === filename) {
          return updatedMessage;
        }
        return msg;
      });
      
      // 重新渲染消息列表，保留滚动位置
      renderMessages(lastMessages, { preserveScroll: true });
    }
  } catch (error) {
    console.error('更新下载状态失败：', error);
  }
}

async function manualRefresh() {
  if (searchInput) {
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
      // 下载完成后重新获取消息以更新下载状态
      updateMessageDownloadStatus(filename);
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
      // 上传完成后使用增量更新，避免打断用户浏览
      loadMessages({ checkNew: true });
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

refreshButton.addEventListener('click', manualRefresh);
if (openDownloadDirButton) {
  openDownloadDirButton.addEventListener('click', openDownloadDir);
}
sendTextButton.addEventListener('click', sendText);
sendFileButton.addEventListener('click', selectFiles);
saveSettingsButton.addEventListener('click', saveSettings);
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
if (sendHotkeyInputs && sendHotkeyInputs.length > 0) {
  sendHotkeyInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) {
        setSendHotkey(input.value);
      }
    });
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
  // 切换到纯文本模式
  const textRadio = document.querySelector('input[name="message-format"][value="text"]');
  if (textRadio) {
    textRadio.checked = true;
  }
  switchFormat('text');
  
  focusHomeComposer();
}

loadSettings();
loadMessages({ scrollToBottom: true });
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

function setDragOverState(active) {
  if (composerRow) {
    composerRow.classList.toggle('is-drag-over', active);
  }
}

if (listen) {
  // 全局快捷键的特定监听器
  listen('trigger-show', handleWindowFocus);

  // 用于非侵入性操作的通用焦点监听器
  listen('tauri://focus', () => {
    loadSyncStatus();
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

if (messagePreviewClose) {
  messagePreviewClose.addEventListener('click', closeMessagePreview);
}

if (messagePreviewBackdrop) {
  messagePreviewBackdrop.addEventListener('click', closeMessagePreview);
}

if (messagePreview) {
  messagePreview.addEventListener('click', (event) => {
    if (event.target === messagePreview) {
      closeMessagePreview();
    }
  });
}

document.addEventListener('keydown', (event) => {
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

if (filterMarkedButton) {
  filterMarkedButton.addEventListener('click', () => {
    markedFilterActive = !markedFilterActive;
    filterMarkedButton.classList.toggle('is-active', markedFilterActive);
    currentOffset = 0;
    lastMessages = [];
    hasMoreMessages = false;
    loadMessages();
  });
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
