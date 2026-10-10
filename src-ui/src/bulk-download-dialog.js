const tauri = window.__TAURI__ || {};
const tauriInvoke = tauri.core?.invoke || tauri.invoke;
const api = tauriInvoke ? { invoke: (command, args) => tauriInvoke(command, args) } : null;
const runtime = window.transferGenieBulkDownloadRuntime;
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
  let brush = null;
  let marquee = null;
  let autoScrollFrame = 0;
  let suppressClickUntil = 0;

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
      api.invoke('get_thumbnail', { filename: entry.filename })
        .then((path) => {
          const convert = window.__TAURI__?.core?.convertFileSrc || window.__TAURI__?.tauri?.convertFileSrc || window.__TAURI__?.path?.convertFileSrc;
          const image = document.createElement('img'); image.alt = ''; image.draggable = false; image.src = convert ? convert(path) : path;
          entry.target.replaceChildren(image);
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
        thumbnailQueue.push({ target, filename: target.dataset.thumbnailFilename }); runThumbnailQueue();
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
    if (resource.category === 'image') thumb.dataset.thumbnailFilename = resource.filename;
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
    item.addEventListener('click', (event) => { if (Date.now() >= suppressClickUntil && !brush && !marquee && !event.target.closest('input,button,a')) setResourceSelected(resource, !selection.has(resource.key)); });
    item.addEventListener('dragstart', (event) => event.preventDefault());
    item.addEventListener('pointerdown', (event) => startBrushCandidate(event, resource, item));
    return item;
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
  function closeModal() { stopPointerInteractions(); selection.clear(); modal.classList.remove('is-active'); modal.setAttribute('aria-hidden', 'true'); updateSelectionSummary(); }

  function finishBrush() { if (!brush) return; if (brush.active) suppressClickUntil = Date.now() + 350; clearTimeout(brush.timer); brush = null; content.classList.remove('is-brush-selecting'); cancelAnimationFrame(autoScrollFrame); autoScrollFrame = 0; }
  function stopPointerInteractions() { finishBrush(); finishMarquee(false); }

  function startBrushCandidate(event, resource, item) {
    if (event.button !== 0 || event.target.closest('input,button,a')) return;
    const startX = event.clientX; const startY = event.clientY;
    brush = { pointerId: event.pointerId, startX, startY, active: false, mode: !selection.has(resource.key), visited: new Set(), lastX: startX, lastY: startY, timer: 0 };
    brush.timer = window.setTimeout(() => {
      if (!brush) return; brush.active = true;
      try { item.setPointerCapture?.(event.pointerId); } catch (_) { /* synthetic pointer events used by smoke tests have no native capture */ }
      content.classList.add('is-brush-selecting'); applyBrushResource(resource);
    }, 300);
  }

  function applyBrushResource(resource) { if (!brush?.active || brush.visited.has(resource.key)) return; brush.visited.add(resource.key); selection.set(resource, brush.mode); updateSelectedClasses(); }

  function applyBrushAtPoint(clientX, clientY, includeNearby = false) {
    let item = document.elementFromPoint(clientX, clientY)?.closest?.('[data-resource-key]');
    if (!item && includeNearby) {
      let nearestDistance = 24;
      list.querySelectorAll('[data-resource-key]').forEach((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const deltaX = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
        const deltaY = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance < nearestDistance) { nearestDistance = distance; item = candidate; }
      });
    }
    const resource = state.resources.find((entry) => entry.key === item?.dataset.resourceKey);
    if (resource) applyBrushResource(resource);
  }

  function brushMove(event) {
    if (!brush || event.pointerId !== brush.pointerId) return; brush.lastX = event.clientX; brush.lastY = event.clientY;
    if (!brush.active && Math.hypot(event.clientX - brush.startX, event.clientY - brush.startY) > 8) { finishBrush(); return; }
    if (!brush?.active) return; event.preventDefault();
    applyBrushAtPoint(event.clientX, event.clientY);
    if (!autoScrollFrame) autoScrollFrame = requestAnimationFrame(autoScrollBrush);
  }

  function autoScrollBrush() {
    autoScrollFrame = 0; if (!brush?.active) return; const rect = content.getBoundingClientRect(); let delta = 0;
    if (brush.lastY < rect.top + 48) delta = -12; else if (brush.lastY > rect.bottom - 48) delta = 12;
    if (delta) { content.scrollTop += delta; applyBrushAtPoint(brush.lastX, brush.lastY, true); autoScrollFrame = requestAnimationFrame(autoScrollBrush); }
  }

  function startMarquee(event) {
    if (event.button !== 0 || !runtime.isBulkGridView(state.view) || event.target.closest('[data-resource-key],button,input,select,summary')) return;
    const rect = content.getBoundingClientRect(); marquee = { pointerId: event.pointerId, startX: event.clientX - rect.left + content.scrollLeft, startY: event.clientY - rect.top + content.scrollTop, currentX: 0, currentY: 0, preview: new Set() };
    content.setPointerCapture?.(event.pointerId); selectionBox.hidden = false; updateMarquee(event);
  }

  function updateMarquee(event) {
    if (!marquee || event.pointerId !== marquee.pointerId) return; event.preventDefault(); const rect = content.getBoundingClientRect();
    marquee.currentX = event.clientX - rect.left + content.scrollLeft; marquee.currentY = event.clientY - rect.top + content.scrollTop;
    const left = Math.min(marquee.startX, marquee.currentX); const top = Math.min(marquee.startY, marquee.currentY); const right = Math.max(marquee.startX, marquee.currentX); const bottom = Math.max(marquee.startY, marquee.currentY);
    Object.assign(selectionBox.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` }); marquee.preview.clear();
    list.querySelectorAll('[data-resource-key]').forEach((item) => {
      const itemRect = item.getBoundingClientRect(); const local = { left: itemRect.left - rect.left + content.scrollLeft, right: itemRect.right - rect.left + content.scrollLeft, top: itemRect.top - rect.top + content.scrollTop, bottom: itemRect.bottom - rect.top + content.scrollTop };
      const hit = runtime.rectanglesIntersect({ left, right, top, bottom }, local); item.classList.toggle('is-preview-selected', hit); if (hit) marquee.preview.add(item.dataset.resourceKey);
    });
  }

  function finishMarquee(commit = true) {
    if (!marquee) return; if (commit) marquee.preview.forEach((key) => { const resource = state.resources.find((entry) => entry.key === key); if (resource) selection.set(resource, true); });
    marquee = null; selectionBox.hidden = true; list.querySelectorAll('.is-preview-selected').forEach((item) => item.classList.remove('is-preview-selected')); updateSelectedClasses();
  }

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
  content.addEventListener('pointermove', (event) => { brushMove(event); updateMarquee(event); });
  content.addEventListener('pointerup', () => { finishBrush(); finishMarquee(true); });
  content.addEventListener('pointercancel', () => { finishBrush(); finishMarquee(false); });
  window.addEventListener('blur', stopPointerInteractions);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal.classList.contains('is-active')) { event.preventDefault(); closeModal(); } }, true);
  updateSelectionSummary();
  window.transferGenieBulkDownloadDialogReady = true;
}
