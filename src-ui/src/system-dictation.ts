import './system-dictation.css';

const tauri = (window as any).__TAURI__ || {};
const invoke = tauri.core?.invoke || tauri.invoke;
const listen = tauri.event?.listen;

const wave = document.querySelector('.dictation-wave') as HTMLElement | null;
const confirmButton = document.getElementById('dictation-confirm');
const cancelButton = document.getElementById('dictation-cancel');

function setWaveLevel(level: number) {
  const normalized = Math.max(0, Math.min(1, Number(level) || 0));
  wave?.style.setProperty('--dictation-level', String(normalized));
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

setWaveLevel(0);
