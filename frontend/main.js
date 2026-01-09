const tauri = window.__TAURI__ || {};
const invoke = tauri.core?.invoke || tauri.invoke;
const openDialog = tauri.dialog?.open;

const messageList = document.getElementById('message-list');
const syncStatus = document.getElementById('sync-status');
const refreshButton = document.getElementById('refresh-btn');
const textInput = document.getElementById('text-input');
const sendTextButton = document.getElementById('send-text');
const sendFileButton = document.getElementById('send-file');
const saveSettingsButton = document.getElementById('save-settings');

const webdavUrlInput = document.getElementById('webdav-url');
const webdavUserInput = document.getElementById('webdav-user');
const webdavPassInput = document.getElementById('webdav-pass');
const senderNameInput = document.getElementById('sender-name');
const refreshIntervalInput = document.getElementById('refresh-interval');

let refreshTimer = null;
let didInitialSync = false;

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

function setStatus(text, isError = false) {
  syncStatus.textContent = text;
  syncStatus.style.color = isError ? '#d6452d' : '';
}

function renderMessages(messages) {
  messageList.innerHTML = '';
  if (!messages || messages.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'message-card';
    empty.textContent = '暂无消息';
    messageList.appendChild(empty);
    return;
  }

  messages.forEach((message) => {
    const item = document.createElement('li');
    item.className = 'message-card';

    const header = document.createElement('div');
    header.className = 'message-header';
    header.textContent = `${message.sender} · ${formatTime(message.timestamp_ms)}`;

    const body = document.createElement('div');
    body.className = 'message-body';
    body.textContent = message.kind === 'text' ? message.content || '' : message.original_name;

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = `大小 ${formatBytes(message.size || 0)}`;

    item.appendChild(header);
    item.appendChild(body);
    item.appendChild(meta);
    messageList.appendChild(item);
  });
}

async function loadMessages() {
  try {
    if (!invoke) {
      setStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置', true);
      return;
    }
    const messages = await invoke('list_messages');
    renderMessages(messages);
  } catch (error) {
    setStatus(`加载消息失败：${error}`, true);
  }
}

async function loadSyncStatus() {
  try {
    if (!invoke) {
      setStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置', true);
      return;
    }
    const status = await invoke('get_sync_status');
    if (status.last_error) {
      setStatus(`同步错误：${status.last_error}`, true);
      return;
    }
    if (status.running) {
      setStatus(status.last_result || '同步中');
    } else {
      setStatus(status.last_result || '已同步');
    }
  } catch (error) {
    setStatus(`状态更新失败：${error}`, true);
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

async function loadSettings() {
  try {
    if (!invoke) {
      setStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置', true);
      return;
    }
    const settings = await invoke('get_settings');
    webdavUrlInput.value = settings.webdav_url || '';
    webdavUserInput.value = settings.username || '';
    webdavPassInput.value = settings.password || '';
    senderNameInput.value = settings.sender_name || '';
    refreshIntervalInput.value = settings.refresh_interval_secs || 5;
    startRefreshTimer(settings.refresh_interval_secs || 5);
    if (!didInitialSync && settings.webdav_url && settings.webdav_url.trim()) {
      didInitialSync = true;
      await manualRefresh();
    }
  } catch (error) {
    setStatus(`读取设置失败：${error}`, true);
  }
}

async function saveSettings() {
  const payload = {
    webdav_url: webdavUrlInput.value.trim(),
    username: webdavUserInput.value.trim(),
    password: webdavPassInput.value,
    sender_name: senderNameInput.value.trim(),
    refresh_interval_secs: Number(refreshIntervalInput.value) || 5,
  };

  try {
    if (!invoke) {
      setStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置', true);
      return;
    }
    const updated = await invoke('save_settings', { settings: payload });
    setStatus('设置已保存');
    startRefreshTimer(updated.refresh_interval_secs || 5);
  } catch (error) {
    setStatus(`保存设置失败：${error}`, true);
  }
}

async function sendText() {
  const text = textInput.value.trim();
  if (!text) {
    return;
  }
  try {
    if (!invoke) {
      setStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置', true);
      return;
    }
    await invoke('send_text', { text });
    textInput.value = '';
    await loadMessages();
  } catch (error) {
    setStatus(`发送失败：${error}`, true);
  }
}

async function sendFile() {
  try {
    if (!invoke) {
      setStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置', true);
      return;
    }
    if (!openDialog) {
      setStatus('未检测到对话框插件，请确认已启用 dialog 插件', true);
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
    await invoke('send_file', { path });
    await loadMessages();
  } catch (error) {
    setStatus(`发送文件失败：${error}`, true);
  }
}

async function manualRefresh() {
  try {
    if (!invoke) {
      setStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置', true);
      return;
    }
    await invoke('manual_refresh');
    await loadMessages();
    await loadSyncStatus();
  } catch (error) {
    setStatus(`手动刷新失败：${error}`, true);
  }
}

refreshButton.addEventListener('click', manualRefresh);
sendTextButton.addEventListener('click', sendText);
sendFileButton.addEventListener('click', sendFile);
saveSettingsButton.addEventListener('click', saveSettings);

loadSettings();
loadMessages();
loadSyncStatus();