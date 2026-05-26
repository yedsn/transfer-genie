(function bootstrapSettingsRuntimeStatus(globalScope) {
  if (!globalScope) {
    return;
  }

  function getLocalHttpApiVisualState(status, fallbackAddress) {
    var currentStatus = status || {};
    var state = currentStatus.state || 'disabled';
    var running = state === 'running';
    var failed = state === 'start_failed';
    var pending = state === 'pending';
    var address = currentStatus.address || fallbackAddress || '';
    var lastError = currentStatus.lastError || currentStatus.last_error || '';
    var stateLabel = running
      ? '运行中'
      : failed
        ? '启动失败'
        : pending
          ? '状态获取中'
          : '已关闭';
    var summaryText = running
      ? (address ? '状态：已启用（' + address + '）' : '状态：已启用')
      : failed
        ? (lastError ? '状态：启动失败（' + lastError + '）' : '状态：启动失败')
        : pending
          ? '状态：正在获取...'
          : '状态：已关闭';

    return {
      state: state,
      running: running,
      failed: failed,
      pending: pending,
      address: address,
      lastError: lastError,
      stateLabel: stateLabel,
      addressText: address || '未配置',
      lastErrorText: lastError || '无',
      summaryText: summaryText,
    };
  }

  function getTelegramBridgeVisualState(status, formatRuntimeTime) {
    var currentStatus = status || null;
    if (!currentStatus) {
      return {
        running: false,
        stateLabel: '未获取',
        lastErrorText: '无',
      };
    }

    var formatTime = typeof formatRuntimeTime === 'function' ? formatRuntimeTime : function (value) {
      return String(value || '');
    };
    var running = !!currentStatus.running;
    var lastStartedMs = currentStatus.last_started_ms;
    var lastStoppedMs = currentStatus.last_stopped_ms;
    var stateLabel = running
      ? (lastStartedMs ? '运行中 · ' + formatTime(lastStartedMs) : '运行中')
      : (lastStoppedMs ? '已停止 · ' + formatTime(lastStoppedMs) : '未运行');

    return {
      running: running,
      stateLabel: stateLabel,
      lastErrorText: currentStatus.lastError || currentStatus.last_error || '无',
    };
  }

  function getTelegramControlState(options) {
    var state = options || {};
    var running = !!state.running;
    var isConfigured = !!state.isConfigured;
    return {
      startDisabled: running || !isConfigured,
      startHidden: running,
      stopDisabled: !running,
      stopHidden: !running,
    };
  }

  globalScope.transferGenieSettingsRuntimeStatus = {
    getLocalHttpApiVisualState: getLocalHttpApiVisualState,
    getTelegramBridgeVisualState: getTelegramBridgeVisualState,
    getTelegramControlState: getTelegramControlState,
  };
})(typeof window !== 'undefined' ? window : globalThis);
