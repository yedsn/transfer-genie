import './system-dictation.css';

const tauri = (window as any).__TAURI__ || {};
const invoke = tauri.core?.invoke || tauri.invoke;
const listen = tauri.event?.listen;

const capsule = document.querySelector('.dictation-capsule') as HTMLElement | null;
const wave = document.querySelector('.dictation-wave') as HTMLElement | null;
const statusText = document.getElementById('dictation-status');
const confirmButton = document.getElementById('dictation-confirm');
const cancelButton = document.getElementById('dictation-cancel');
const copyButton = document.createElement('button');
copyButton.id = 'dictation-copy';
copyButton.type = 'button';
copyButton.className = 'dictation-action copy';
copyButton.setAttribute('aria-label', '复制结果');
copyButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9h10v10H9z"></path><path d="M5 15H4V5h10v1"></path></svg>';
const closeButton = document.createElement('button');
closeButton.id = 'dictation-close';
closeButton.type = 'button';
closeButton.className = 'dictation-action close';
closeButton.setAttribute('aria-label', '关闭结果');
closeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>';
let displayedLevel = 0;
let targetLevel = 0;
let animationFrame = 0;
let lastLevelLogAt = 0;
let introPulseTimer = 0;
let currentCopyText = '';
let resultAutoCloseTimer = 0;
let resultHovered = false;
let latestRequestId = 0;

function clearResultAutoCloseTimer() {
  if (resultAutoCloseTimer) window.clearTimeout(resultAutoCloseTimer);
  resultAutoCloseTimer = 0;
}

function closeResult() {
  clearResultAutoCloseTimer();
  const requestId = latestRequestId + 1;
  setDictationStatusPayload({ text: '', copyText: '', requestId });
  void invoke?.('set_system_dictation_status', { text: '', copyText: '', requestId });
}

function scheduleResultAutoClose() {
  clearResultAutoCloseTimer();
  if (resultHovered || !currentCopyText) return;
  resultAutoCloseTimer = window.setTimeout(() => {
    if (!resultHovered && currentCopyText) closeResult();
  }, 3000);
}

function setWaveLevel(level: number) {
  const normalized = Math.max(0, Math.min(1, Number(level) || 0));
  targetLevel = Math.min(1, Math.max(0, normalized * 2.6));
  const now = Date.now();
  if (now - lastLevelLogAt > 1000) {
    lastLevelLogAt = now;
    console.info('[system-dictation-overlay] level received', JSON.stringify({ level: normalized, targetLevel }));
  }
}

(window as any).__transferGenieSetDictationLevel = setWaveLevel;

function setDictationStatus(text: string) {
  const value = String(text || '').trim();
  if (statusText) statusText.textContent = value;
  capsule?.classList.toggle('is-status', !!value);
  capsule?.classList.toggle('is-result', !!value && !!currentCopyText);
  capsule?.classList.toggle('is-recording', !value && !capsule.classList.contains('is-exiting'));
  if (value) targetLevel = 0;
}

async function copyResultText() {
  if (!currentCopyText) return;
  if (!invoke) return;
  try {
    await invoke('copy_dictation_text', { text: currentCopyText });
  } catch (error) {
    console.warn('system dictation copy failed', error);
  }
}

function setDictationStatusPayload(payload: any) {
  const value = typeof payload === 'string'
    ? payload.trim()
    : String(payload?.text || '').trim();
  const requestId = typeof payload === 'object' ? Number(payload?.requestId || 0) : 0;
  if (requestId && requestId < latestRequestId) return;
  if (requestId) latestRequestId = requestId;
  currentCopyText = typeof payload === 'string'
    ? ''
    : String(payload?.copyText || '').trim();
  resultHovered = !!capsule?.matches(':hover');
  setDictationStatus(value);
  copyButton.hidden = !value || !currentCopyText;
  copyButton.disabled = !currentCopyText;
  closeButton.hidden = !value || !currentCopyText;
  if (value && currentCopyText) scheduleResultAutoClose();
  else clearResultAutoCloseTimer();
}

(window as any).__transferGenieSetDictationStatus = setDictationStatusPayload;

function paintWave() {
  displayedLevel += (targetLevel - displayedLevel) * 0.34;
  const motion = displayedLevel < 0.035 ? 0 : Math.min(1, (displayedLevel - 0.035) / 0.965);
  const idleMotion = capsule?.classList.contains('is-recording') ? 1 : 0;
  capsule?.style.setProperty('--dictation-level', displayedLevel.toFixed(3));
  capsule?.style.setProperty('--dictation-motion', motion.toFixed(3));
  capsule?.style.setProperty('--dictation-idle-motion', String(idleMotion));
  wave?.style.setProperty('--dictation-level', displayedLevel.toFixed(3));
  wave?.style.setProperty('--dictation-motion', motion.toFixed(3));
  wave?.style.setProperty('--dictation-idle-motion', String(idleMotion));
  wave?.style.setProperty('--dictation-bar-1', (0.04 + displayedLevel * 0.78).toFixed(3));
  wave?.style.setProperty('--dictation-bar-2', (0.08 + displayedLevel * 0.92).toFixed(3));
  wave?.style.setProperty('--dictation-bar-3', (0.03 + displayedLevel * 0.74).toFixed(3));
  wave?.style.setProperty('--dictation-wave-from-1', (1 - 0.24 * motion).toFixed(3));
  wave?.style.setProperty('--dictation-wave-to-1', (1 + 0.36 * motion).toFixed(3));
  wave?.style.setProperty('--dictation-wave-from-2', (1 - 0.18 * motion).toFixed(3));
  wave?.style.setProperty('--dictation-wave-to-2', (1 + 0.44 * motion).toFixed(3));
  wave?.style.setProperty('--dictation-wave-from-3', (1 - 0.22 * motion).toFixed(3));
  wave?.style.setProperty('--dictation-wave-to-3', (1 + 0.32 * motion).toFixed(3));
  animationFrame = window.requestAnimationFrame(paintWave);
}

function showCapsule() {
  clearResultAutoCloseTimer();
  resultHovered = false;
  capsule?.classList.remove('is-exiting');
  capsule?.classList.remove('is-status');
  capsule?.classList.add('is-recording');
  if (statusText) statusText.textContent = '';
  copyButton.hidden = true;
  closeButton.hidden = true;
  currentCopyText = '';
  setWaveLevel(0.26);
  if (introPulseTimer) window.clearTimeout(introPulseTimer);
  introPulseTimer = window.setTimeout(() => setWaveLevel(0), 260);
  if (capsule) {
    capsule.style.animation = 'none';
    capsule.offsetHeight;
    capsule.style.animation = '';
  }
}

function hideCapsule() {
  clearResultAutoCloseTimer();
  resultHovered = false;
  targetLevel = 0;
  if (introPulseTimer) window.clearTimeout(introPulseTimer);
  introPulseTimer = 0;
  capsule?.classList.remove('is-recording');
  capsule?.classList.add('is-exiting');
  copyButton.hidden = true;
  closeButton.hidden = true;
  currentCopyText = '';
}

async function sendAction(action: 'confirm' | 'cancel') {
  if (!invoke) return;
  try {
    await invoke('system_dictation_action', { action });
  } catch (error) {
    console.warn('system dictation action failed', error);
  }
}

function preventOverlayFocus(event: MouseEvent) {
  event.preventDefault();
}

confirmButton?.addEventListener('mousedown', preventOverlayFocus);
confirmButton?.addEventListener('click', () => {
  void sendAction('confirm');
});

copyButton.addEventListener('mousedown', preventOverlayFocus);
copyButton.addEventListener('click', () => {
  void copyResultText();
});

capsule?.appendChild(copyButton);

closeButton.addEventListener('mousedown', preventOverlayFocus);
closeButton.addEventListener('click', () => {
  closeResult();
});

capsule?.appendChild(closeButton);

capsule?.addEventListener('pointerenter', () => {
  if (!currentCopyText) return;
  resultHovered = true;
  clearResultAutoCloseTimer();
});

cancelButton?.addEventListener('mousedown', preventOverlayFocus);
cancelButton?.addEventListener('click', () => {
  void sendAction('cancel');
});

void listen?.('system-dictation-level', (event: any) => {
  setWaveLevel(event.payload ?? 0);
});

void listen?.('system-dictation-show', (event: any) => {
  const requestId = Number(event.payload || 0);
  if (requestId && requestId < latestRequestId) return;
  if (requestId) latestRequestId = requestId;
  showCapsule();
});

void listen?.('system-dictation-hide', (event: any) => {
  const requestId = Number(event.payload || 0);
  if (requestId && requestId < latestRequestId) return;
  if (requestId) latestRequestId = requestId;
  hideCapsule();
});

void listen?.('system-dictation-status', (event: any) => {
  setDictationStatusPayload(event.payload ?? '');
});

capsule?.classList.add('is-recording');
showCapsule();
animationFrame = window.requestAnimationFrame(paintWave);

window.addEventListener('beforeunload', () => {
  if (animationFrame) window.cancelAnimationFrame(animationFrame);
  clearResultAutoCloseTimer();
});
