export function createBulkSelectionStore() {
  const selected = new Map();
  return {
    selected,
    has(key) { return selected.has(String(key || '')); },
    set(resource, checked = true) {
      const key = String(resource?.key || '');
      if (!key) return;
      if (checked) selected.set(key, resource);
      else selected.delete(key);
    },
    setMany(resources, checked = true) {
      (Array.isArray(resources) ? resources : []).forEach((resource) => this.set(resource, checked));
    },
    clear() { selected.clear(); },
    values() { return Array.from(selected.values()); },
    summary() {
      const values = this.values();
      return {
        count: values.length,
        size: values.reduce((sum, resource) => sum + Math.max(0, Number(resource?.size) || 0), 0),
      };
    },
  };
}

export function createBulkDownloadQueue(worker, options = {}) {
  const concurrency = Math.max(1, Number(options.concurrency) || 3);
  const pending = [];
  let active = 0;
  const pump = () => {
    while (active < concurrency && pending.length) {
      const entry = pending.shift();
      active += 1;
      options.onState?.(entry.item, 'progress');
      Promise.resolve()
        .then(() => worker(entry.item))
        .then((value) => {
          active -= 1;
          options.onState?.(entry.item, 'complete', value);
          entry.resolve(value);
          pump();
        })
        .catch((error) => {
          active -= 1;
          options.onState?.(entry.item, 'error', error);
          entry.reject(error);
          pump();
        });
    }
  };
  return {
    enqueue(item) {
      options.onState?.(item, 'queued');
      const promise = new Promise((resolve, reject) => pending.push({ item, resolve, reject }));
      pump();
      return promise;
    },
    stats() { return { active, pending: pending.length, concurrency }; },
  };
}

export function rectanglesIntersect(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export function isBulkGridView(view) {
  return ['tiles', 'small-icons', 'large-icons'].includes(view);
}

export function bulkViewStorageKey(category) {
  return `transfer-genie.bulk-download.view.v1.${category || 'all'}`;
}

if (typeof window !== 'undefined') {
  window.transferGenieBulkDownloadRuntime = {
    createBulkSelectionStore, createBulkDownloadQueue, rectanglesIntersect, isBulkGridView, bulkViewStorageKey,
  };
}
if (typeof globalThis !== 'undefined' && !globalThis.transferGenieBulkDownloadRuntime) {
  globalThis.transferGenieBulkDownloadRuntime = {
    createBulkSelectionStore, createBulkDownloadQueue, rectanglesIntersect, isBulkGridView, bulkViewStorageKey,
  };
}
