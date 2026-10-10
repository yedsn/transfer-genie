const tauri = window.__TAURI__ || {};
const tauriInvoke = tauri.core?.invoke || tauri.invoke;
const api = tauriInvoke ? { invoke: (command, args) => tauriInvoke(command, args) } : null;
const runtime = window.transferGenieBulkDownloadRuntime;
const mediaRuntime = window.transferGenieMediaRuntime;
const modal = document.getElementById('bulk-download-modal');
const openButton = document.getElementById('open-bulk-download');

if (api && runtime && modal && openButton) {
  const list = document.getElementById('bulk-download-list');
  const content = document.getElementById('bulk-download-content');
  const empty = document.getElementById('bulk-download-empty');
  const summary = document.getElementById('bulk-download-summary');
  const search = document.getElementById('bulk-download-search');
  const format = document.getElementById('bulk-download-format');
  const pageSize = document.getElementById('bulk-download-page-size');
  const pageLabel = document.getElementById('bulk-download-page-label');
  const previous = document.getElementById('bulk-download-prev');
  const next = document.getElementById('bulk-download-next');
  const selectionSummary = document.getElementById('bulk-download-selection-summary');
  const submitHint = document.getElementById('bulk-download-submit-hint');
  const submit = document.getElementById('bulk-download-submit');
  const selectionBox = document.getElementById('bulk-download-selection-box');
  const selection = runtime.createBulkSelectionStore();
  const state = {
    category: 'all', extension: '', searchQuery: '', page: 1, pageSize: 60, totalPages: 1, total: 0,
    resources: [], view: 'tiles', loading: false, querySequence: 0,
  };
  let searchTimer = null;
  let thumbnailObserver = null;
  const thumbnailQueue = [];
  let thumbnailActive = 0;
  let marquee = null;
  let autoScrollFrame = 0;
  let suppressClickUntil = 0;
  const mediaSession = mediaRuntime?.createMediaSession({
    onActivePath: (path) => api.invoke('set_active_media_playback_path', { path }).catch(() => {}),
  });
  let mediaOverlay = null;

  function formatBytes(value) {
    const size = Math.max(0, Number(value) || 0);
    if (size < 1024) return `${size} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let current = size / 1024;
    let unit = units[0];
    for (let index = 1; index < units.length && current >= 1024; index += 1) { current /= 1024; unit = units[index]; }
    return `${current >= 100 ? current.toFixed(0) : current.toFixed(1)} ${unit}`;
  }

  function formatTime(timestamp) {
    return new Date(Number(timestamp) || Date.now()).toLocaleString('zh-CN', { hour12: false });
  }

  function formatMediaTime(value) {
    const seconds = Math.max(0, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return hours
      ? hours + ':' + String(minutes).padStart(2, '0') + ':' + String(remainder).padStart(2, '0')
      : minutes + ':' + String(remainder).padStart(2, '0');
  }

  function categoryLabel(category) {
    return { all: '全部', file: '文件', image: '图片', audio: '音频', video: '视频' }[category] || '文件';
  }

  function statusLabel(status) {
    return { downloaded: '已下载', missing: '文件已丢失', resumable: '可继续下载', error: '下载失败', notDownloaded: '未下载' }[status] || '未下载';
  }

  function queryInput(includePage = true) {
    const input = { category: state.category, extension: state.extension || null, searchQuery: state.searchQuery || null };
    if (includePage) Object.assign(input, { page: state.page, pageSize: state.pageSize });
    return input;
  }

  function viewStorageKey() { return runtime.bulkViewStorageKey(state.category); }
  function restoreView() { state.view = localStorage.getItem(viewStorageKey()) || 'tiles'; }

  function setView(view) {
    mediaSession?.stop('view-change'); closeMediaOverlay();
    state.view = ['tiles', 'details', 'list', 'small-icons', 'large-icons'].includes(view) ? view : 'tiles';
    localStorage.setItem(viewStorageKey(), state.view);
    render();
  }

  function updateViewMenuState() {
    document.querySelectorAll('[data-bulk-view]').forEach((button) => {
      const active = button.dataset.bulkView === state.view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
    });
  }

  function updateSelectionSummary() {
    const selected = selection.summary();
    selectionSummary.textContent = `已选择 ${selected.count} 项 · ${formatBytes(selected.size)}`;
    submit.disabled = selected.count === 0;
    const counts = selection.values().reduce((result, resource) => {
      if (resource.status === 'downloaded') result.skipped += 1;
      else if (resource.status === 'resumable') result.resumable += 1;
      else if (resource.status === 'missing' || resource.status === 'error') result.redownload += 1;
      else result.newDownload += 1;
      return result;
    }, { newDownload: 0, resumable: 0, redownload: 0, skipped: 0 });
    submitHint.textContent = selected.count
      ? `预计新下载 ${counts.newDownload} · 续传 ${counts.resumable} · 重新下载 ${counts.redownload} · 跳过 ${counts.skipped}`
      : '';
  }

  function updateSelectedClasses() {
    list.querySelectorAll('[data-resource-key]').forEach((item) => {
      const checked = selection.has(item.dataset.resourceKey);
      item.classList.toggle('is-selected', checked);
      const checkbox = item.querySelector('.bulk-download-check');
      if (checkbox) checkbox.checked = checked;
    });
    updateSelectionSummary();
  }

  function setResourceSelected(resource, checked) { selection.set(resource, checked); updateSelectedClasses(); }

  function runThumbnailQueue() {
    while (thumbnailActive < 4 && thumbnailQueue.length) {
      const entry = thumbnailQueue.shift();
      thumbnailActive += 1;
      api.invoke('get_media_preview', { input: { endpointId: entry.endpointId, filename: entry.filename, originalName: entry.originalName } })
        .then((path) => {
          if (entry.sequence !== state.querySequence || !entry.target.isConnected) return;
          if (!path) throw new Error('媒体预览不存在');
          const convert = window.__TAURI__?.core?.convertFileSrc || window.__TAURI__?.tauri?.convertFileSrc || window.__TAURI__?.path?.convertFileSrc;
          const image = document.createElement('img'); image.alt = ''; image.draggable = false; image.src = convert ? convert(path) : path;
          const mediaAction = entry.target.querySelector('.bulk-download-thumb-play');
          entry.target.replaceChildren(image);
          if (mediaAction) entry.target.appendChild(mediaAction);
        })
        .catch(() => {})
        .finally(() => { thumbnailActive -= 1; runThumbnailQueue(); });
    }
  }

  function observeThumbnails() {
    thumbnailObserver?.disconnect();
    thumbnailObserver = new IntersectionObserver((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
        const target = entry.target; thumbnailObserver.unobserve(target);
        thumbnailQueue.push({ target, filename: target.dataset.thumbnailFilename, endpointId: target.dataset.endpointId, originalName: target.dataset.originalName, sequence: state.querySequence }); runThumbnailQueue();
      });
    }, { root: content, rootMargin: '120px' });
    list.querySelectorAll('[data-thumbnail-filename]').forEach((target) => thumbnailObserver.observe(target));
  }

  function createItem(resource) {
    const item = document.createElement('div'); item.className = 'bulk-download-item'; item.dataset.resourceKey = resource.key;
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'bulk-download-check'; checkbox.checked = selection.has(resource.key);
    checkbox.addEventListener('click', (event) => event.stopPropagation());
    checkbox.addEventListener('change', () => setResourceSelected(resource, checkbox.checked));
    const thumb = document.createElement('div'); thumb.className = 'bulk-download-thumb'; thumb.textContent = (resource.extension || categoryLabel(resource.category)).toUpperCase();
    if (resource.category === 'image' || resource.category === 'video') {
      thumb.dataset.thumbnailFilename = resource.filename;
      thumb.dataset.endpointId = resource.endpointId || '';
      thumb.dataset.originalName = resource.originalName || '';
    }
    if (resource.category === 'audio' || resource.category === 'video') {
      thumb.classList.add('has-media-action');
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'bulk-download-thumb-play';
      play.dataset.mediaControl = 'true';
      play.setAttribute('aria-label', resource.category === 'video' ? '预览视频' : '播放音频');
      play.title = resource.category === 'video' ? '预览视频' : '播放音频';
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '▶';
      play.appendChild(icon);
      play.addEventListener('pointerdown', (event) => event.stopPropagation());
      play.addEventListener('click', (event) => { event.stopPropagation(); playResource(resource, item, play); });
      thumb.appendChild(play);
    }
    const info = document.createElement('div'); info.className = 'bulk-download-info';
    const name = document.createElement('div'); name.className = 'bulk-download-name'; name.title = resource.originalName; name.textContent = resource.originalName;
    const meta = document.createElement('div'); meta.className = 'bulk-download-meta';
    const typeField = document.createElement('span'); typeField.className = 'bulk-download-detail-field'; typeField.textContent = (resource.extension || categoryLabel(resource.category)).toUpperCase();
    const sizeField = document.createElement('span'); sizeField.className = 'bulk-download-detail-field'; sizeField.textContent = formatBytes(resource.size);
    const timeField = document.createElement('span'); timeField.className = 'bulk-download-detail-field'; timeField.textContent = formatTime(resource.timestampMs);
    meta.append(typeField, document.createTextNode(` · ${formatBytes(resource.size)} · ${formatTime(resource.timestampMs)}`));
    const status = document.createElement('span'); status.className = 'bulk-download-status'; status.textContent = statusLabel(resource.status);
    info.append(name, meta, typeField.cloneNode(true), sizeField, timeField, status);
    item.append(checkbox, thumb, info);
    item.classList.toggle('is-selected', selection.has(resource.key));
    item.addEventListener('click', (event) => { if (Date.now() >= suppressClickUntil && !marquee && !event.target.closest('input,button,a,[data-media-control]')) setResourceSelected(resource, !selection.has(resource.key)); });
    item.addEventListener('dragstart', (event) => event.preventDefault());
    return item;
  }

  function convertMediaPath(path) {
    const convert = window.__TAURI__?.core?.convertFileSrc || window.__TAURI__?.tauri?.convertFileSrc || window.__TAURI__?.path?.convertFileSrc;
    return convert ? convert(path) : path;
  }

  function closeMediaOverlay() {
    mediaSession?.stopOwner('bulk-video');
    mediaOverlay?.remove();
    mediaOverlay = null;
  }

  function createAudioPlayer(media, resource, onClose) {
    const player = document.createElement('div');
    player.className = 'bulk-audio-player';
    player.dataset.mediaControl = 'true';
    player.setAttribute('role', 'group');
    player.setAttribute('aria-label', resource.originalName + ' 音频播放器');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'bulk-audio-toggle';
    toggle.dataset.mediaControl = 'true';

    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'bulk-audio-toggle-icon';
    toggleIcon.setAttribute('aria-hidden', 'true');
    toggle.appendChild(toggleIcon);

    const timeline = document.createElement('div');
    timeline.className = 'bulk-audio-timeline';
    const title = document.createElement('div');
    title.className = 'bulk-audio-title';
    title.textContent = resource.originalName;
    title.title = resource.originalName;

    const progress = document.createElement('input');
    progress.type = 'range';
    progress.className = 'bulk-audio-progress';
    progress.dataset.mediaControl = 'true';
    progress.min = '0';
    progress.max = '0';
    progress.step = '0.1';
    progress.value = '0';
    progress.disabled = true;
    progress.setAttribute('aria-label', '播放进度');
    progress.style.setProperty('--audio-progress', '0%');

    const time = document.createElement('span');
    time.className = 'bulk-audio-time';
    time.textContent = '0:00 / 0:00';
    time.setAttribute('aria-live', 'off');

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'bulk-audio-close';
    close.dataset.mediaControl = 'true';
    close.setAttribute('aria-label', '收起播放器');
    close.title = '收起播放器';
    close.textContent = '×';

    let playing = true;
    const duration = () => (Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0);
    const updateToggle = (nextPlaying) => {
      playing = nextPlaying;
      player.classList.toggle('is-playing', playing);
      toggleIcon.textContent = playing ? 'Ⅱ' : '▶';
      const action = playing ? '暂停' : '播放';
      toggle.setAttribute('aria-label', action);
      toggle.title = action;
    };
    const updateProgress = () => {
      const total = duration();
      const current = Math.min(Math.max(0, Number(media.currentTime) || 0), total || Number.MAX_SAFE_INTEGER);
      progress.max = String(total || 0);
      progress.value = String(total ? Math.min(current, total) : 0);
      progress.disabled = !total;
      progress.style.setProperty('--audio-progress', total ? Math.min(100, (current / total) * 100) + '%' : '0%');
      time.textContent = formatMediaTime(current) + ' / ' + formatMediaTime(total);
    };

    toggle.addEventListener('click', async (event) => {
      event.stopPropagation();
      try {
        if (playing) media.pause();
        else await media.play();
      } catch (error) {
        window.showToast?.('音频播放失败：' + error, 'error');
      }
    });
    progress.addEventListener('input', (event) => {
      event.stopPropagation();
      const total = duration();
      if (total) media.currentTime = Math.min(total, Math.max(0, Number(progress.value) || 0));
      updateProgress();
    });
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      onClose?.();
    });
    media.addEventListener('loadedmetadata', updateProgress);
    media.addEventListener('durationchange', updateProgress);
    media.addEventListener('timeupdate', updateProgress);
    media.addEventListener('play', () => updateToggle(true));
    media.addEventListener('pause', () => updateToggle(false));
    media.addEventListener('ended', () => { updateToggle(false); updateProgress(); });
    [player, toggle, timeline, progress, time, close].forEach((element) => {
      element.addEventListener('pointerdown', (event) => event.stopPropagation());
      element.addEventListener('click', (event) => event.stopPropagation());
    });

    updateToggle(true);
    updateProgress();
    timeline.append(title, progress);
    player.append(toggle, timeline, time, close, media);
    return player;
  }

  async function playResource(resource, item, button) {
    const owner = resource.category === 'video' ? 'bulk-video' : 'bulk-audio-' + resource.key;
    mediaSession?.stop('switch');
    button.disabled = true;
    button.classList.add('is-loading');
    button.querySelector('span').textContent = '…';
    try {
      const result = await api.invoke('resolve_media_playback_source', { input: { endpointId: resource.endpointId, filename: resource.filename, originalName: resource.originalName, variant: resource.isSpeechAudio ? 'speech-audio' : 'file' } });
      const media = document.createElement(resource.category); media.controls = true; media.preload = 'metadata'; media.dataset.mediaControl = 'true'; media.src = convertMediaPath(result.path);
      media.addEventListener('pointerdown', (event) => event.stopPropagation());
      media.addEventListener('click', (event) => event.stopPropagation());
      media.addEventListener('error', () => { window.showToast?.('当前格式不支持应用内播放，请下载后使用系统程序打开', 'error'); });
      if (resource.category === 'video') {
        closeMediaOverlay();
        mediaOverlay = document.createElement('div'); mediaOverlay.className = 'bulk-media-overlay'; mediaOverlay.dataset.mediaControl = 'true';
        const panel = document.createElement('div'); panel.className = 'bulk-media-panel';
        const title = document.createElement('div'); title.className = 'bulk-media-title'; title.textContent = resource.originalName;
        const close = document.createElement('button'); close.type = 'button'; close.className = 'bulk-media-close'; close.textContent = '×'; close.dataset.mediaControl = 'true'; close.addEventListener('click', closeMediaOverlay);
        media.className = 'bulk-media-video'; media.playsInline = true;
        panel.append(title, close, media); mediaOverlay.appendChild(panel); modal.appendChild(mediaOverlay);
        mediaOverlay.addEventListener('click', (event) => { if (event.target === mediaOverlay) closeMediaOverlay(); });
      } else {
        media.className = 'bulk-media-audio';
        media.controls = false;
        media.setAttribute('aria-hidden', 'true');
        item.classList.add('has-active-audio');
        item.appendChild(createAudioPlayer(media, resource, () => mediaSession?.stopOwner(owner)));
      }
      mediaSession?.activate({ owner, element: media, path: result.path, cleanup: () => {
        button.disabled = false;
        button.classList.remove('is-loading');
        button.querySelector('span').textContent = '▶';
        if (resource.category === 'audio' && item.isConnected) {
          item.classList.remove('has-active-audio');
          item.querySelector('.bulk-audio-player')?.remove();
        }
      } });
      await media.play();
    } catch (error) {
      mediaSession?.stopOwner(owner);
      button.disabled = false;
      button.classList.remove('is-loading');
      button.querySelector('span').textContent = '▶';
      window.showToast?.(`媒体预览失败：${error}`, 'error');
    }
  }

  function render() {
    list.className = `bulk-download-list view-${state.view}`; list.replaceChildren();
    empty.hidden = state.loading || state.resources.length > 0;
    state.resources.forEach((resource) => list.appendChild(createItem(resource)));
    summary.textContent = state.loading ? '正在加载资料...' : `共 ${state.total} 项 · 最新内容优先`;
    pageLabel.textContent = `${state.page} / ${state.totalPages}`; previous.disabled = state.page <= 1 || state.loading; next.disabled = state.page >= state.totalPages || state.loading;
    document.querySelectorAll('[data-bulk-category]').forEach((button) => button.classList.toggle('is-active', button.dataset.bulkCategory === state.category));
    updateViewMenuState();
    updateSelectedClasses(); observeThumbnails();
  }

  function updateFilterOptions(extensions) {
    const current = state.extension; format.replaceChildren(new Option('全部格式', ''));
    extensions.forEach((extension) => format.appendChild(new Option(extension.toUpperCase(), extension)));
    format.value = extensions.includes(current) ? current : '';
    state.extension = format.value;
  }

  async function loadResources() {
    mediaSession?.stop('resources-change'); closeMediaOverlay();
    const sequence = ++state.querySequence; state.loading = true; render();
    try {
      const result = await api.invoke('list_bulk_download_resources', { input: queryInput(true) });
      if (sequence !== state.querySequence) return;
      state.resources = result.resources || []; state.total = Number(result.total) || 0; state.page = Number(result.page) || 1; state.totalPages = Number(result.totalPages) || 1;
      updateFilterOptions(result.extensions || []);
      (result.categoryCounts || []).forEach((entry) => { const target = document.querySelector(`[data-bulk-category="${entry.category}"] span`); if (target) target.textContent = entry.count; });
    } catch (error) { state.resources = []; state.total = 0; state.totalPages = 1; window.showToast?.(`加载资料失败：${error}`, 'error'); }
    finally { if (sequence === state.querySequence) { state.loading = false; render(); } }
  }

  function openModal() { selection.clear(); state.page = 1; state.category = 'all'; state.extension = ''; state.searchQuery = ''; search.value = ''; restoreView(); modal.classList.add('is-active'); modal.setAttribute('aria-hidden', 'false'); loadResources(); }
  function closeModal() { stopPointerInteractions(); mediaSession?.stop('modal-close'); closeMediaOverlay(); selection.clear(); modal.classList.remove('is-active'); modal.setAttribute('aria-hidden', 'true'); updateSelectionSummary(); }

  function startMarquee(event) {
    if (event.button !== 0 || !runtime.isBulkGridView(state.view) || event.target.closest('button,input,select,summary,[data-media-control],audio,video')) return;
    const rect = content.getBoundingClientRect();
    const item = event.target.closest('[data-resource-key]');
    const startX = event.clientX - rect.left + content.scrollLeft;
    const startY = event.clientY - rect.top + content.scrollTop;
    marquee = {
      pointerId: event.pointerId, startX, startY, currentX: startX, currentY: startY,
      clientStartX: event.clientX, clientStartY: event.clientY, lastClientX: event.clientX, lastClientY: event.clientY,
      active: false, mode: item ? !selection.has(item.dataset.resourceKey) : true, preview: new Set(), timer: 0,
    };
    if (!item) activateMarquee(event);
    else marquee.timer = window.setTimeout(() => { if (marquee?.pointerId === event.pointerId) activateMarquee(event); }, 300);
  }

  function activateMarquee(event) {
    if (!marquee || marquee.active) return;
    marquee.active = true;
    try { content.setPointerCapture?.(marquee.pointerId); } catch (_) { /* synthetic pointer events used by smoke tests have no native capture */ }
    content.classList.add('is-marquee-selecting'); selectionBox.hidden = false; updateMarquee(event);
  }

  function updateMarquee(event) {
    if (!marquee || event.pointerId !== marquee.pointerId) return;
    marquee.lastClientX = event.clientX; marquee.lastClientY = event.clientY;
    if (!marquee.active) {
      if (Math.hypot(event.clientX - marquee.clientStartX, event.clientY - marquee.clientStartY) > 8) finishMarquee(false);
      return;
    }
    event.preventDefault(); const rect = content.getBoundingClientRect();
    marquee.currentX = event.clientX - rect.left + content.scrollLeft; marquee.currentY = event.clientY - rect.top + content.scrollTop;
    const left = Math.min(marquee.startX, marquee.currentX); const top = Math.min(marquee.startY, marquee.currentY); const right = Math.max(marquee.startX, marquee.currentX); const bottom = Math.max(marquee.startY, marquee.currentY);
    Object.assign(selectionBox.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` }); marquee.preview.clear();
    list.querySelectorAll('[data-resource-key]').forEach((item) => {
      const itemRect = item.getBoundingClientRect(); const local = { left: itemRect.left - rect.left + content.scrollLeft, right: itemRect.right - rect.left + content.scrollLeft, top: itemRect.top - rect.top + content.scrollTop, bottom: itemRect.bottom - rect.top + content.scrollTop };
      const hit = runtime.rectanglesIntersect({ left, right, top, bottom }, local);
      item.classList.toggle('is-preview-selected', hit && marquee.mode);
      item.classList.toggle('is-preview-unselected', hit && !marquee.mode);
      if (hit) marquee.preview.add(item.dataset.resourceKey);
    });
    if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(autoScrollMarquee);
  }

  function autoScrollMarquee() {
    autoScrollFrame = 0; if (!marquee?.active) return; const rect = content.getBoundingClientRect(); let delta = 0;
    if (marquee.lastClientY < rect.top + 48) delta = -12; else if (marquee.lastClientY > rect.bottom - 48) delta = 12;
    if (delta) {
      const previousTop = content.scrollTop; content.scrollTop += delta;
      if (content.scrollTop !== previousTop) {
        updateMarquee({ pointerId: marquee.pointerId, clientX: marquee.lastClientX, clientY: marquee.lastClientY, preventDefault() {} });
        return;
      }
      autoScrollFrame = requestAnimationFrame(autoScrollMarquee);
    }
  }

  function finishMarquee(commit = true) {
    if (!marquee) return;
    clearTimeout(marquee.timer);
    if (marquee.active) {
      if (commit) marquee.preview.forEach((key) => { const resource = state.resources.find((entry) => entry.key === key); if (resource) selection.set(resource, marquee.mode); });
      suppressClickUntil = Date.now() + 350;
    }
    marquee = null; selectionBox.hidden = true; content.classList.remove('is-marquee-selecting'); cancelAnimationFrame(autoScrollFrame); autoScrollFrame = 0;
    list.querySelectorAll('.is-preview-selected, .is-preview-unselected').forEach((item) => item.classList.remove('is-preview-selected', 'is-preview-unselected')); updateSelectedClasses();
  }

  function stopPointerInteractions() { finishMarquee(false); }

  const queue = runtime.createBulkDownloadQueue((resource) => window.transferGenieDownloadBulkResource(resource), {
    concurrency: 3,
    onState(resource, status, payload) {
      if (status === 'queued') window.transferGenieCreateBulkDownloadTask?.(resource);
      else window.transferGenieUpdateBulkDownloadTask?.(resource, status, payload);
    },
  });

  async function submitSelection() {
    const chosen = selection.values(); if (!chosen.length) return;
    let prepared = chosen;
    try {
      const result = await api.invoke('prepare_bulk_download_resources', { input: { keys: chosen.map((resource) => resource.key) } });
      prepared = result.resources || chosen;
      const counts = result.statusCounts;
      if (counts) submitHint.textContent = `预计新下载 ${counts.newDownload || 0} · 续传 ${counts.resumable || 0} · 重新下载 ${counts.redownload || 0} · 跳过 ${counts.skipped || 0}`;
    } catch (_) { /* use the visible snapshot when preparation is unavailable */ }
    const downloadable = prepared.filter((resource) => resource.status !== 'downloaded');
    closeModal(); window.showToast?.(`已加入 ${downloadable.length} 个下载任务`, 'success');
    downloadable.forEach((resource) => queue.enqueue(resource).catch(() => {}));
  }

  openButton.addEventListener('click', openModal);
  document.getElementById('bulk-download-close').addEventListener('click', closeModal);
  document.getElementById('bulk-download-cancel').addEventListener('click', closeModal);
  modal.querySelector('.message-preview-backdrop').addEventListener('click', closeModal);
  document.getElementById('bulk-download-open-dir').addEventListener('click', () => api.invoke('open_download_dir'));
  document.querySelectorAll('[data-bulk-category]').forEach((button) => button.addEventListener('click', () => { state.category = button.dataset.bulkCategory; state.extension = ''; state.page = 1; restoreView(); loadResources(); }));
  document.querySelectorAll('[data-bulk-view]').forEach((button) => button.addEventListener('click', () => { setView(button.dataset.bulkView); document.getElementById('bulk-download-view-menu').open = false; }));
  search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.searchQuery = search.value.trim(); state.page = 1; loadResources(); }, 250); });
  format.addEventListener('change', () => { state.extension = format.value; state.page = 1; loadResources(); });
  pageSize.addEventListener('change', () => { state.pageSize = Number(pageSize.value) || 60; state.page = 1; loadResources(); });
  previous.addEventListener('click', () => { if (state.page > 1) { state.page -= 1; loadResources(); content.scrollTop = 0; } });
  next.addEventListener('click', () => { if (state.page < state.totalPages) { state.page += 1; loadResources(); content.scrollTop = 0; } });
  document.getElementById('bulk-download-select-page').addEventListener('click', () => { selection.setMany(state.resources, true); updateSelectedClasses(); });
  document.getElementById('bulk-download-unselect-page').addEventListener('click', () => { selection.setMany(state.resources, false); updateSelectedClasses(); });
  document.getElementById('bulk-download-clear-selection').addEventListener('click', () => { selection.clear(); updateSelectedClasses(); });
  document.getElementById('bulk-download-select-all').addEventListener('click', async () => { const result = await api.invoke('resolve_bulk_download_selection', { input: queryInput(false) }); selection.setMany(result.resources || [], true); updateSelectedClasses(); window.showToast?.(`已选择全部 ${result.total || 0} 项`, 'success'); });
  submit.addEventListener('click', submitSelection);
  content.addEventListener('pointerdown', startMarquee);
  content.addEventListener('pointermove', updateMarquee);
  content.addEventListener('pointerup', () => finishMarquee(true));
  content.addEventListener('pointercancel', () => finishMarquee(false));
  window.addEventListener('blur', stopPointerInteractions);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal.classList.contains('is-active')) { event.preventDefault(); closeModal(); } }, true);
  updateSelectionSummary();
  window.transferGenieBulkDownloadDialogReady = true;
}
