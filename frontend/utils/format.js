// Format utilities for Transfer Genie frontend

(function(globalScope) {
  if (!globalScope) {
    return;
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

  function formatPercent(value, total) {
    if (!total || total <= 0) return '0%';
    const percent = Math.min(100, Math.max(0, (value / total) * 100));
    return `${percent.toFixed(1)}%`;
  }

  function formatProgress(downloaded, total) {
    if (!total || total <= 0) return formatBytes(downloaded);
    return `${formatBytes(downloaded)} / ${formatBytes(total)} (${formatPercent(downloaded, total)})`;
  }

  var api = {
    formatBytes: formatBytes,
    formatTime: formatTime,
    formatPercent: formatPercent,
    formatProgress: formatProgress,
  };

  globalScope.transferGenieFormat = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
