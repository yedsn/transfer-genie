// Pure download progress formatting shared by the transfer page and message cards.
(function bootstrapDownloadProgressRuntime(globalScope) {
  if (!globalScope) {
    return;
  }

  var TRANSFER_MODE_LABELS = {
    resumed: '继续下载',
    restarted: '重新下载',
    fresh: '新下载',
  };

  function normalizeByteOffset(value) {
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function normalizeSegmentCount(value) {
    var count = Number(value);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  }

  function getTransferModeLabel(transferMode) {
    return TRANSFER_MODE_LABELS[transferMode] || '';
  }

  // Multi-segment downloads have no single active byte range, so the label
  // describes the connection count instead of a misleading 0 - size window.
  function getChannelLabel(segments) {
    var count = normalizeSegmentCount(segments);
    return count > 1 ? count + ' 段并发' : '单连接';
  }

  function computeProgressPercent(received, total) {
    var bytes = Number(received) || 0;
    var size = Number(total) || 0;
    if (size <= 0) {
      return null;
    }
    return Math.min(100, Math.max(0, Math.round((Math.max(0, bytes) / size) * 100)));
  }

  function formatActiveRange(task, formatBytes) {
    var formatter = typeof formatBytes === 'function' ? formatBytes : function (value) { return String(value); };
    var state = task || {};
    if (normalizeSegmentCount(state.segments) > 1) {
      return '';
    }
    var start = normalizeByteOffset(state.rangeStart);
    var end = normalizeByteOffset(state.rangeEnd);
    var total = normalizeByteOffset(state.total);
    if (start === null && end === null) {
      return '';
    }
    if (start !== null && end !== null && end >= start) {
      if (start === 0 && total !== null && end + 1 >= total) {
        return '';
      }
      return '当前区段 ' + formatter(start) + ' - ' + formatter(end + 1);
    }
    if (start !== null && start > 0) {
      return '当前从 ' + formatter(start) + ' 开始';
    }
    return '';
  }

  function formatBytesPair(received, total, label, speed, formatBytes) {
    var formatter = typeof formatBytes === 'function' ? formatBytes : function (value) { return String(value); };
    var speedText = speed > 0 ? formatter(speed) + '/s' : '';
    var size = Number(total) || 0;
    if (size <= 0) {
      return [formatter(Number(received) || 0), label, speedText].filter(Boolean).join(' · ');
    }
    var percent = computeProgressPercent(received, size);
    return [
      percent + '%',
      formatter(Number(received) || 0) + ' / ' + formatter(size),
      speedText,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  function formatProgressText(task, options) {
    var settings = options || {};
    var state = task || {};
    var parts = [];
    if (settings.includeChannel) {
      parts.push(getChannelLabel(state.segments));
    }
    var mode = getTransferModeLabel(state.transferMode);
    if (mode) {
      parts.push(mode);
    }
    var range = formatActiveRange(state, settings.formatBytes);
    if (range) {
      parts.push(range);
    }
    parts.push(
      formatBytesPair(
        state.received || 0,
        state.total,
        '已下载',
        Number(settings.speed) || 0,
        settings.formatBytes
      )
    );
    return parts.filter(Boolean).join(' | ');
  }

  globalScope.transferGenieDownloadProgressRuntime = {
    normalizeByteOffset: normalizeByteOffset,
    normalizeSegmentCount: normalizeSegmentCount,
    getTransferModeLabel: getTransferModeLabel,
    getChannelLabel: getChannelLabel,
    computeProgressPercent: computeProgressPercent,
    formatActiveRange: formatActiveRange,
    formatProgressText: formatProgressText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
