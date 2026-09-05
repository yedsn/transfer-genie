import './system-dictation.css';

const tauri = (window as any).__TAURI__ || {};
const invoke = tauri.core?.invoke || tauri.invoke;
const listen = tauri.event?.listen;

const capsule = document.querySelector('.dictation-capsule') as HTMLElement | null;
const wave = document.querySelector('.dictation-wave') as HTMLElement | null;
const statusText = document.getElementById('dictation-status');
const confirmButton = document.getElementById('dictation-confirm');
const cancelButton = document.getElementById('dictation-cancel');
let displayedLevel = 0;
let targetLevel = 0;
let animationFrame = 0;
let lastLevelLogAt = 0;
let introPulseTimer = 0;

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
  capsule?.classList.toggle('is-recording', !value && !capsule.classList.contains('is-exiting'));
  if (value) targetLevel = 0;
}

(window as any).__transferGenieSetDictationStatus = setDictationStatus;

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
  capsule?.classList.remove('is-exiting');
  capsule?.classList.remove('is-status');
  capsule?.classList.add('is-recording');
  if (statusText) statusText.textContent = '';
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
  targetLevel = 0;
  if (introPulseTimer) window.clearTimeout(introPulseTimer);
  introPulseTimer = 0;
  capsule?.classList.remove('is-recording');
  capsule?.classList.add('is-exiting');
}

async function sendAction(action: 'confirm' | 'cancel') {
  if (!invoke) return;
  try {
    await invoke('system_dictation_action', { action });
  } catch (error) {
    console.warn('system dictation action failed', error);
  }
}

confirmButton?.addEventListener('click', () => {
  void sendAction('confirm');
});

cancelButton?.addEventListener('click', () => {
  void sendAction('cancel');
});

void listen?.('system-dictation-level', (event: any) => {
  setWaveLevel(event.payload ?? 0);
});

void listen?.('system-dictation-show', () => {
  showCapsule();
});

void listen?.('system-dictation-hide', () => {
  hideCapsule();
});

void listen?.('system-dictation-status', (event: any) => {
  setDictationStatus(event.payload ?? '');
});

capsule?.classList.add('is-recording');
showCapsule();
animationFrame = window.requestAnimationFrame(paintWave);

window.addEventListener('beforeunload', () => {
  if (animationFrame) window.cancelAnimationFrame(animationFrame);
});
