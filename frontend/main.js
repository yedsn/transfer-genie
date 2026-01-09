const tauri = window.__TAURI__ || {};
const invoke = tauri.core?.invoke || tauri.invoke;
const openDialog = tauri.dialog?.open;
const saveDialog = tauri.dialog?.save;
const listen = tauri.event?.listen;

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
const downloadDirInput = document.getElementById('download-dir');
const chooseDownloadDirButton = document.getElementById('choose-download-dir');
const downloadDirHint = document.getElementById('download-dir-hint');

let refreshTimer = null;
let didInitialSync = false;
const downloadProgress = new Map();
const pendingUploads = new Map();
let lastMessages = [];

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

function formatProgress(received, total, label = '已下载') {
  if (!total) {
    return `${formatBytes(received)} ${label}`;
  }
  const percent = Math.min(100, Math.round((received / total) * 100));
  return `${percent}% · ${formatBytes(received)} / ${formatBytes(total)}`;
}

function escapeSelector(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
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
    text.textContent = formatProgress(progress.received || 0, progress.total);
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
    text.textContent = formatProgress(upload.received || 0, upload.total || 0, '已上传');
  }
  wrap.classList.remove('hidden');
}

function setHint(element, text) {
  if (!element) return;
  element.textContent = text || '';
}

async function copyTextToClipboard(text) {
  if (!text) {
    setStatus('没有可复制的内容', true);
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
    setStatus('已复制到剪贴板');
  } catch (error) {
    setStatus(`复制失败：${error}`, true);
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
      setStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置', true);
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
        setStatus(`文件已保存到 ${retry.path || ''}`.trim());
      }
      return;
    }

    if (result.status === 'saved') {
      setStatus(`文件已保存到 ${result.path || ''}`.trim());
    }
  } catch (error) {
    console.error('[download] error', error);
    setStatus(`下载失败：${error}`, true);
  }
}

async function saveMessageFileAs(message) {
  try {
    console.info('[download] save as click', {
      filename: message.filename,
      original_name: message.original_name,
    });
    if (!invoke) {
      setStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置', true);
      return;
    }
    if (!saveDialog) {
      setStatus('未检测到保存对话框插件，请确认已启用 dialog 插件', true);
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
    setStatus(`文件已保存到 ${result.path || target}`.trim());
  } catch (error) {
    console.error('[download] save as error', error);
    setStatus(`另存为失败：${error}`, true);
  }
}

function renderMessages(messages) {
  lastMessages = Array.isArray(messages) ? messages : [];
  const merged = mergeMessages(lastMessages);
  messageList.innerHTML = '';
  if (!merged || merged.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'message-card';
    empty.textContent = '暂无消息';
    messageList.appendChild(empty);
    return;
  }

  merged.forEach((message) => {
    const item = document.createElement('li');
    item.className = 'message-card';
    item.dataset.filename = message.filename;

    const header = document.createElement('div');
    header.className = 'message-header';
    header.textContent = `${message.sender} · ${formatTime(message.timestamp_ms)}`;

    const body = document.createElement('div');
    body.className = 'message-body';
    body.textContent =
      message.kind === 'text' ? message.content || '' : message.original_name;

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

        menuList.appendChild(saveAsButton);
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
        progressText.textContent = formatProgress(progress.received || 0, progress.total);
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
          uploadText.textContent = formatProgress(upload.received || 0, upload.total, '已上传');
        } else {
          uploadWrap.classList.add('hidden');
        }

        item.appendChild(uploadWrap);
      }
    }
    messageList.appendChild(item);
  });
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
      local_path: null,
      download_exists: false,
      uploading: true,
    });
  });
  merged.sort((a, b) => (a.timestamp_ms || 0) - (b.timestamp_ms || 0));
  return merged;
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
    if (downloadDirInput) {
      downloadDirInput.value = settings.download_dir || '';
      setHint(downloadDirHint, '');
    }
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
    download_dir: downloadDirInput ? downloadDirInput.value.trim() : '',
  };

  try {
    if (!invoke) {
      setStatus('未检测到 Tauri API，请检查 app.withGlobalTauri 设置', true);
      return;
    }
    const updated = await invoke('save_settings', { settings: payload });
    setStatus('设置已保存');
    startRefreshTimer(updated.refresh_interval_secs || 5);
    setHint(downloadDirHint, '下载目录已保存');
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
  let clientId = null;
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
    clientId = `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const originalName = path.split(/[/\\]/).pop() || path;
    pendingUploads.set(clientId, {
      clientId,
      originalName,
      timestamp_ms: Date.now(),
      received: 0,
      total: 0,
      status: 'progress',
    });
    renderMessages(lastMessages);
    await invoke('send_file', { path, clientId });
    if (clientId) {
      pendingUploads.delete(clientId);
      renderMessages(lastMessages);
    }
    await loadMessages();
  } catch (error) {
    if (clientId) {
      pendingUploads.delete(clientId);
      renderMessages(lastMessages);
    }
    setStatus(`发送文件失败：${error}`, true);
  }
}

async function chooseDownloadDir() {
  try {
    if (!openDialog) {
      setStatus('未检测到对话框插件，请确认已启用 dialog 插件', true);
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
    setStatus(`选择下载目录失败：${error}`, true);
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

if (listen) {
  listen('download-progress', (event) => {
    const payload = event.payload || {};
    const filename = payload.filename;
    if (!filename) {
      return;
    }
    if (payload.status === 'progress') {
      setProgressFor(filename, payload);
      updateProgressUI(filename);
      return;
    }
    if (payload.status === 'complete') {
      downloadProgress.delete(filename);
      updateProgressUI(filename);
      loadMessages();
      return;
    }
    if (payload.status === 'error') {
      downloadProgress.delete(filename);
      updateProgressUI(filename);
      if (payload.error) {
        setStatus(`下载失败：${payload.error}`, true);
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
      updateUploadProgressUI(clientId);
      return;
    }
    if (payload.status === 'complete') {
      pendingUploads.delete(clientId);
      renderMessages(lastMessages);
      loadMessages();
      return;
    }
    if (payload.status === 'error') {
      pendingUploads.delete(clientId);
      renderMessages(lastMessages);
      if (payload.error) {
        setStatus(`上传失败：${payload.error}`, true);
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

loadSettings();
loadMessages();
loadSyncStatus();
