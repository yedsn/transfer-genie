import './system-dictation.css';

const tauri = (window as any).__TAURI__ || {};
const invoke = tauri.core?.invoke || tauri.invoke;
const listen = tauri.event?.listen;

const capsule = document.querySelector('.dictation-capsule') as HTMLElement | null;
const wave = document.querySelector('.dictation-wave') as HTMLElement | null;
const confirmButton = document.getElementById('dictation-confirm');
const cancelButton = document.getElementById('dictation-cancel');
let displayedLevel = 0;
let targetLevel = 0;
let animationFrame = 0;
let lastLevelLogAt = 0;

function setWaveLevel(level: number) {
  const normalized = Math.max(0, Math.min(1, Number(level) || 0));
  targetLevel = Math.min(1, Math.max(0, normalized * 2.6));
  const now = Date.now();
  if (now - lastLevelLogAt > 1000) {
    lastLevelLogAt = now;
    console.info('[system-dictation-overlay] level received', JSON.stringify({ level: normalized, targetLevel }));
  }
}

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
  animationFrame = window.requestAnimationFrame(paintWave);
}

function showCapsule() {
  capsule?.classList.remove('is-exiting');
  capsule?.classList.add('is-recording');
  if (capsule) {
    capsule.style.animation = 'none';
    capsule.offsetHeight;
    capsule.style.animation = '';
  }
}

function hideCapsule() {
  targetLevel = 0;
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

capsule?.classList.add('is-recording');
setWaveLevel(0);
animationFrame = window.requestAnimationFrame(paintWave);

window.addEventListener('beforeunload', () => {
  if (animationFrame) window.cancelAnimationFrame(animationFrame);
});
