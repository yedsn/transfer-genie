import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP_URL = 'http://127.0.0.1:7120/';
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
].filter(Boolean);

function chromePath() {
  const found = CHROME_PATHS.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Chrome executable not found; set CHROME_PATH to run this smoke test.');
  return found;
}

async function waitForUrl(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch (_) {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function ensureDevServer() {
  try {
    const response = await fetch(APP_URL);
    if (response.ok) return null;
  } catch (_) {
    // Start a fresh dev server below.
  }
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const args = process.platform === 'win32' ? ['/c', 'npm', 'run', 'dev'] : ['run', 'dev'];
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: 'ignore',
    windowsHide: true,
  });
  await waitForUrl(APP_URL);
  return child;
}

async function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const child = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      child.on('close', resolve);
      child.on('error', resolve);
    });
  } else {
    try { process.kill(pid, 'SIGKILL'); } catch (_) { /* ignore */ }
  }
}

async function connectWebSocket(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return socket;
}

function createCdpClient(socket) {
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result || {});
    }
  });
  return {
    send(method, params = {}) {
      const requestId = ++id;
      socket.send(JSON.stringify({ id: requestId, method, params }));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error(`CDP command timed out: ${method}`));
        }, 20000);
        pending.set(requestId, {
          resolve: (value) => { clearTimeout(timer); resolve(value); },
          reject: (error) => { clearTimeout(timer); reject(error); },
        });
      });
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(client, expression, awaitPromise = true) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  }
  return result.result?.value;
}

function mockSettings() {
  return {
    sender_name: 'Smoke',
    refresh_interval_secs: 5,
    download_dir: '',
    auto_start: false,
    auto_update: false,
    global_hotkey_enabled: true,
    global_hotkey: 'alt+t',
    default_editor_format: 'text',
    webdav_endpoints: [],
    send: { copy_after_send: false },
    backup: {},
    telegram: {},
    ai: { enabled: false, provider: {}, actions: [] },
    speech_to_text: {
      enabled: true,
      provider_kind: 'volcengine_agent_plan',
      api_key: 'saved-for-smoke',
      resource_id: 'volc.seedasr.sauc.duration',
      endpoint: 'wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream',
      microphone_device_id: 'mic-1',
      capture_system_audio: false,
      system_audio_device_id: '',
      shortcut_enabled: true,
      shortcut: 'right-alt',
      max_duration_secs: 5,
      task_retention_count: 14,
      cue_sound_enabled: true,
      cue_sound_kind: 'system',
    },
  };
}

function preloadScript() {
  return `(() => {
    const eventHandlers = {};
    const settings = ${JSON.stringify(mockSettings())};
    window.__speechSmoke = {
      calls: [],
      eventHandlers,
      failTranscribe: false,
      denyMicrophone: false,
      failNextGetUserMedia: '',
      hideGetUserMedia: false,
      getUserMediaDelayMs: 0,
      mediaRequests: [],
      stoppedStreams: 0,
      cueSounds: [],
      clipboardText: '',
      downloads: [],
      chunkDurationMs: 0,
      nextSampleCount: 0,
      chunkTextPrefix: '',
      blankChunkNumbers: [],
      transcribeChunkCallCount: 0,
    };
    window.__speechSmoke.longText = '语音识别文本'.repeat(20);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text) => { window.__speechSmoke.clipboardText = String(text || ''); },
    } });
    window.__TAURI__ = {
      core: {
        invoke: async (command, args) => {
          window.__speechSmoke.calls.push({ command, args });
          if (command === 'get_settings') return structuredClone(settings);
          if (command === 'save_settings') return args.settings;
          if (command === 'transcribe_speech') {
            if (window.__speechSmoke.failTranscribe) throw 'ASR 凭据无效';
            if (window.__speechSmoke.chunkTextPrefix) {
              window.__speechSmoke.transcribeChunkCallCount += 1;
              if (window.__speechSmoke.blankChunkNumbers.includes(window.__speechSmoke.transcribeChunkCallCount)) {
                throw 'ASR 未返回可用文本';
              }
              return { text: window.__speechSmoke.chunkTextPrefix + window.__speechSmoke.transcribeChunkCallCount, logId: 'smoke-log', timing: { totalMs: 1200, connectMs: 200, sendConfigMs: 30, sendAudioMs: 70, waitResultMs: 900, audioBytes: 32000 } };
            }
            return { text: window.__speechSmoke.longText, logId: 'smoke-log', timing: { totalMs: 1500, connectMs: 250, sendConfigMs: 40, sendAudioMs: 80, waitResultMs: 1130, audioBytes: 64000 } };
          }
          if (command === 'list_messages_window') return { messages: [], has_more_before: false, has_more_after: false };
          if (command === 'get_sync_status') return { state: 'idle', syncing: false, pending: false };
          if (command === 'get_local_http_api_status') return { state: 'disabled', running: false };
          if (command === 'get_telegram_bridge_status') return { running: false };
          if (command === 'list_integration_modules') return [];
          if (command === 'get_app_version') return '0.0.0-smoke';
          if (command === 'list_marked_tags') return [];
          if (command === 'get_marked_messages') return { records: [], total: 0 };
          if (command === 'list_download_history' || command === 'list_upload_history') return { records: [], total: 0 };
          return null;
        }
      },
      event: {
        listen: async (name, handler) => {
          eventHandlers[name] = handler;
          return () => { delete eventHandlers[name]; };
        }
      },
      path: { convertFileSrc: (value) => value },
      dialog: { open: async () => null, save: async () => null }
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      enumerateDevices: async () => ([
        { kind: 'audioinput', deviceId: 'mic-1', label: 'Desk Mic' },
        { kind: 'audioinput', deviceId: 'mic-2', label: 'Backup Mic' },
        { kind: 'audioinput', deviceId: 'blackhole-1', label: 'BlackHole 2ch' },
      ]),
      addEventListener() {},
    } });
    const mediaDevicesValue = navigator.mediaDevices;
    Object.defineProperty(mediaDevicesValue, 'getUserMedia', {
      configurable: true,
      get() {
        if (window.__speechSmoke.hideGetUserMedia) return undefined;
        return async (constraints) => {
          window.__speechSmoke.mediaRequests.push(constraints);
          if (window.__speechSmoke.getUserMediaDelayMs) {
            await new Promise((resolve) => setTimeout(resolve, window.__speechSmoke.getUserMediaDelayMs));
          }
          if (window.__speechSmoke.denyMicrophone) {
            const error = new Error('Permission denied');
            error.name = 'NotAllowedError';
            throw error;
          }
          if (window.__speechSmoke.failNextGetUserMedia) {
            const error = new Error(window.__speechSmoke.failNextGetUserMedia);
            error.name = window.__speechSmoke.failNextGetUserMedia;
            window.__speechSmoke.failNextGetUserMedia = '';
            throw error;
          }
          return { getTracks: () => [{ stop() { window.__speechSmoke.stoppedStreams += 1; } }] };
        };
      },
    });
    class FakeAudioContext {
      constructor(options = {}) { this.sampleRate = options.sampleRate || 16000; this.destination = {}; this.currentTime = 0; this.state = 'suspended'; }
      async resume() { this.state = 'running'; }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createMediaStreamDestination() { return { stream: {}, connect() {}, disconnect() {} }; }
      createOscillator() {
        const oscillator = {
          type: 'sine',
          frequency: {
            setValueAtTime(value) { oscillator.frequencyValue = value; },
            exponentialRampToValueAtTime(value) { oscillator.frequencyRampValue = value; },
          },
          connect() {},
          start() { window.__speechSmoke.cueSounds.push({ type: oscillator.type, frequency: oscillator.frequencyValue || 0 }); },
          stop() {},
        };
        return oscillator;
      }
      createScriptProcessor() {
        const processor = {
          onaudioprocess: null,
          connect() {
            setTimeout(() => {
              if (!processor.onaudioprocess) return;
              const sampleCount = window.__speechSmoke.nextSampleCount || 1600;
              window.__speechSmoke.nextSampleCount = 0;
              const samples = new Float32Array(sampleCount);
              for (let index = 0; index < samples.length; index += 1) samples[index] = Math.sin(index / 8) * 0.25;
              processor.onaudioprocess({ inputBuffer: { numberOfChannels: 2, getChannelData: () => samples } });
            }, 20);
          },
          disconnect() {},
        };
        return processor;
      }
      createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
      async close() { this.state = 'closed'; }
    }
    window.AudioContext = FakeAudioContext;
  })();`;
}

async function launchChrome() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'transfer-genie-chrome-'));
  const port = 9333 + Math.floor(Math.random() * 1000);
  const child = spawn(chromePath(), [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  await waitForUrl(`http://127.0.0.1:${port}/json/version`);
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browserClient = createCdpClient(await connectWebSocket(version.webSocketDebuggerUrl));
  const { targetId } = await browserClient.send('Target.createTarget', { url: 'about:blank' });
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((item) => item.id === targetId);
  const pageClient = createCdpClient(await connectWebSocket(target.webSocketDebuggerUrl));
  return { child, userDataDir, browserClient, pageClient };
}

async function run() {
  console.log('starting speech-to-text UI smoke test');
  const server = await ensureDevServer();
  console.log('dev server is ready');
  const chrome = await launchChrome();
  console.log('chrome is ready');
  try {
    const client = chrome.pageClient;
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: preloadScript() });
    await client.send('Page.navigate', { url: APP_URL });
    await evaluate(client, `new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (
          document.querySelector('#speech-to-text-toggle') &&
          document.querySelector('#speech-to-text-enabled')?.checked &&
          document.querySelector('#speech-to-text-api-key')?.value === 'saved-for-smoke' &&
          document.querySelector('#speech-to-text-microphone')?.value === 'mic-1' &&
          window.__speechSmoke?.eventHandlers?.['speech-to-text-toggle']
        ) resolve(true);
        else if (Date.now() - start > 15000) reject(new Error('speech UI did not initialize'));
        else setTimeout(tick, 100);
      };
      tick();
    })`);

    const unsupportedResult = await evaluate(client, `(async () => {
      window.__speechSmoke.hideGetUserMedia = true;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((r) => setTimeout(r, 80));
      const status = document.querySelector('#sync-status')?.textContent || '';
      window.__speechSmoke.hideGetUserMedia = false;
      return status;
    })()`);
    assert.match(unsupportedResult, /麦克风 API|macOS|系统设置/, 'missing getUserMedia shows actionable macOS microphone guidance');

    const buttonResult = await evaluate(client, `(async () => {
      let markdownSyncCount = 0;
      window.transferGenieComposer = window.transferGenieComposer || {};
      window.transferGenieComposer._setActiveText = () => { markdownSyncCount += 1; };
      const cueCountBeforeToggle = window.__speechSmoke.cueSounds.length;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((r) => setTimeout(r, 20));
      const cueCountImmediatelyAfterStartClick = window.__speechSmoke.cueSounds.length;
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('button did not enter recording state'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const recording = document.querySelector('#speech-to-text-toggle').classList.contains('is-recording');
      await new Promise((r) => setTimeout(r, 80));
      const button = document.querySelector('#speech-to-text-toggle');
      const waveBars = Array.from(document.querySelectorAll('#speech-to-text-toggle .speech-wave span'));
      const liveWaveState = {
        speechLevel: button.style.getPropertyValue('--speech-level'),
        speechMotion: button.style.getPropertyValue('--speech-motion'),
        speechWaveTo2: button.style.getPropertyValue('--speech-wave-to-2'),
        waveHeights: waveBars.map((bar) => getComputedStyle(bar).height),
        waveAnimations: waveBars.map((bar) => getComputedStyle(bar).animationName),
      };
      const cueCountBeforeStopClick = window.__speechSmoke.cueSounds.length;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((r) => setTimeout(r, 20));
      const cueCountImmediatelyAfterStopClick = window.__speechSmoke.cueSounds.length;
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const text = window.transferGenieComposerStore?.getActiveDraft?.()?.text || '';
          const status = document.querySelector('#sync-status')?.textContent || '';
          if (text) resolve();
          else if (/语音识别失败/.test(status)) reject(new Error(status));
          else if (Date.now() - start > 2500) reject(new Error('recognized text was not inserted'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const calls = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech');
      const activeDraft = window.transferGenieComposerStore?.getActiveDraft?.();
      const autoClipboardText = window.__speechSmoke.clipboardText;
      if (!window.__speechSmoke.downloadHookInstalled) {
        window.__speechSmoke.downloadHookInstalled = true;
        const originalAppendChild = document.body.appendChild.bind(document.body);
        document.body.appendChild = (node) => {
          if (node?.tagName === 'A') {
            node.click = () => window.__speechSmoke.downloads.push({ href: node.href, download: node.download });
          }
          return originalAppendChild(node);
        };
      }
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelectorAll('.speech-task-item').length > 0) resolve();
          else if (Date.now() - start > 4000) reject(new Error('background speech task was not saved'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const taskItems = Array.from(document.querySelectorAll('.speech-task-item'));
      taskItems[0]?.querySelector('button:nth-child(3)')?.click();
      await new Promise((r) => setTimeout(r, 20));
      taskItems[0]?.querySelector('button:nth-child(4)')?.click();
      await new Promise((r) => setTimeout(r, 20));
      taskItems[0]?.querySelector('button:nth-child(5)')?.click();
      await new Promise((r) => setTimeout(r, 20));
      return {
        recording,
        text: activeDraft?.text || '',
        request: calls.at(-1)?.args?.request,
        mediaRequest: window.__speechSmoke.mediaRequests.at(-1),
        speechTaskCount: taskItems.length,
        speechTaskText: taskItems[0]?.querySelector('.speech-task-text')?.textContent || '',
        speechTaskTitle: taskItems[0]?.querySelector('.speech-task-text')?.getAttribute('title') || '',
        speechTaskMeta: taskItems[0]?.querySelector('.speech-task-meta')?.textContent || '',
        autoClipboardText,
        clipboardText: window.__speechSmoke.clipboardText,
        downloadName: window.__speechSmoke.downloads.at(-1)?.download || '',
        speechTaskCountAfterDelete: document.querySelectorAll('.speech-task-item').length,
        cueSoundCount: window.__speechSmoke.cueSounds.length,
        startClickCueDelta: cueCountImmediatelyAfterStartClick - cueCountBeforeToggle,
        stopClickCueDelta: cueCountImmediatelyAfterStopClick - cueCountBeforeStopClick,
        longText: window.__speechSmoke.longText,
        markdownSyncCount,
        ...liveWaveState,
        buttonClass: document.querySelector('#speech-to-text-toggle').className,
        status: document.querySelector('#sync-status')?.textContent || '',
        mediaDevices: !!navigator.mediaDevices?.getUserMedia,
        cueEnabledChecked: document.querySelector('#speech-to-text-cue-sound-enabled')?.checked,
        cueKindValue: document.querySelector('#speech-to-text-cue-sound-kind')?.value,
        systemAudioChecked: document.querySelector('#speech-to-text-capture-system-audio')?.checked,
        calls: window.__speechSmoke.calls.map((call) => call.command),
      };
    })()`);
    assert.equal(buttonResult.recording, true, `speech button enters recording state: ${JSON.stringify(buttonResult)}`);
    assert.equal(buttonResult.text, buttonResult.longText, 'recognized text is inserted into composer draft');
    assert.equal(buttonResult.clipboardText, buttonResult.longText, 'recognized text is copied to clipboard after transcription');
    assert.equal(buttonResult.speechTaskCount, 1, 'successful transcription creates a retained task');
    assert.ok(buttonResult.speechTaskText.length < buttonResult.longText.length, 'transcription task list shows a shortened preview');
    assert.ok(buttonResult.speechTaskText.endsWith('...'), 'long transcription task preview is ellipsized');
    assert.equal(buttonResult.speechTaskTitle, buttonResult.longText, 'transcription task keeps full text in title');
    assert.match(buttonResult.speechTaskMeta, /\d+:\d{2}/, 'transcription task shows recording duration');
    assert.equal(buttonResult.autoClipboardText, buttonResult.longText, 'recognized text is copied to clipboard after transcription');
    assert.equal(buttonResult.clipboardText, buttonResult.longText, 'transcription task copy uses the full result');
    assert.match(buttonResult.downloadName, /^speech-.*\.wav$/, 'transcription task audio can be downloaded as wav');
    assert.match(buttonResult.status, /本地耗时.*语音耗时/, 'local and ASR timing diagnostics are visible after transcription');
    assert.equal(buttonResult.speechTaskCountAfterDelete, 0, 'transcription task can be deleted');
    assert.equal(buttonResult.cueEnabledChecked, true, 'speech cue sounds default to enabled');
    assert.equal(buttonResult.cueKindValue, 'system', 'speech cue sound defaults to system');
    assert.equal(buttonResult.systemAudioChecked, false, 'system audio capture defaults to disabled');
    assert.ok(buttonResult.cueSoundCount >= 2, 'speech recording plays start and stop cue sounds by default');
    assert.equal(buttonResult.startClickCueDelta, 1, 'speech button immediately plays cue when opening recording');
    assert.equal(buttonResult.stopClickCueDelta, 1, 'speech button immediately plays cue when closing recording');
    assert.ok(buttonResult.markdownSyncCount > 0, 'markdown editor is refreshed after speech insertion');
    assert.equal(buttonResult.request.format, 'wav', 'recording is transcoded to WAV before sending to backend');
    assert.equal(buttonResult.request.mimeType, 'audio/wav', 'WAV mime type is sent to backend');
    assert.equal(buttonResult.request.sampleRate, 16000, 'WAV sample rate is sent to backend');
    assert.equal(buttonResult.request.channels, 1, 'WAV channel count is sent to backend');
    assert.equal(buttonResult.request.bitsPerSample, 16, 'WAV bit depth is sent to backend');
    assert.ok(buttonResult.request.audioData.length > 0, 'recorded audio bytes are sent to backend');
    assert.equal(buttonResult.mediaRequest.audio.deviceId.exact, 'mic-1', 'selected microphone is used for recording');
    assert.ok(Number(buttonResult.speechLevel) > 0, 'recording button reflects input level');
    assert.ok(Number(buttonResult.speechMotion) > 0, 'recording waveform motion reflects input level');
    assert.ok(Number(buttonResult.speechWaveTo2) > 1, 'recording waveform pulse scale reflects input level');
    assert.ok(
      buttonResult.waveHeights.some((height) => Number.parseFloat(height) > 4),
      `recording waveform bars respond to input level: ${buttonResult.waveHeights.join(', ')}`,
    );
    assert.ok(
      buttonResult.waveAnimations.every((animationName) => animationName === 'speechLevelWave'),
      `recording waveform bars use live motion animation: ${buttonResult.waveAnimations.join(', ')}`,
    );

    const longRecordingResult = await evaluate(client, `(async () => {
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      window.__speechSmoke.chunkDurationMs = 100;
      window.__speechSmoke.chunkTextPrefix = '分片';
      window.__speechSmoke.transcribeChunkCallCount = 0;
      window.__speechSmoke.nextSampleCount = 4800;
      const beforeCalls = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').length;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('long recording did not enter recording state'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((r) => setTimeout(r, 80));
      const callsWhileRecording = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').length - beforeCalls;
      const textWhileRecording = window.transferGenieComposerStore?.getActiveDraft?.()?.text || '';
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const text = window.transferGenieComposerStore?.getActiveDraft?.()?.text || '';
          const hasTask = document.querySelectorAll('.speech-task-item').length > 0;
          if (text.includes('分片1') && text.includes('分片2') && text.includes('分片3') && hasTask) resolve();
          else if (Date.now() - start > 2500) reject(new Error('long recording chunks were not transcribed'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const calls = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').slice(beforeCalls);
      const taskItems = Array.from(document.querySelectorAll('.speech-task-item'));
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('transfer-genie-speech-tasks', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tasks = await new Promise((resolve, reject) => {
        const transaction = db.transaction('tasks', 'readonly');
        const request = transaction.objectStore('tasks').getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      const newest = tasks.sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0))[0] || {};
      window.__speechSmoke.chunkDurationMs = 0;
      window.__speechSmoke.chunkTextPrefix = '';
      return {
        callsWhileRecording,
        textWhileRecording,
        chunkCalls: calls.length,
        chunkTexts: calls.map((call) => call.args?.request?.audioData?.length || 0),
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        taskCount: taskItems.length,
        taskTitle: taskItems[0]?.querySelector('.speech-task-text')?.getAttribute('title') || '',
        taskAudioBytes: newest.audio?.bytes?.length || 0,
        fullTaskText: newest.text || '',
        chunkCount: newest.chunkCount || 0,
      };
    })()`);
    assert.ok(longRecordingResult.callsWhileRecording > 0, 'long recording transcribes completed chunks while recording continues');
    assert.ok(longRecordingResult.textWhileRecording.includes('分片1'), 'first chunk is written during recording');
    assert.ok(longRecordingResult.chunkCalls >= 3, `long recording is submitted as multiple ASR chunks: ${JSON.stringify(longRecordingResult)}`);
    assert.equal(longRecordingResult.text, '分片1\n分片2\n分片3', 'long recording chunk text is merged in chronological order');
    assert.equal(longRecordingResult.taskCount, 1, 'long recording still creates one visible speech task');
    assert.equal(longRecordingResult.taskTitle, '分片1\n分片2\n分片3', 'long recording task stores combined text');
    assert.equal(longRecordingResult.fullTaskText, '分片1\n分片2\n分片3', 'retained long recording task stores combined transcript');
    assert.ok(longRecordingResult.taskAudioBytes > Math.max(...longRecordingResult.chunkTexts), 'retained long recording task keeps the complete audio, not a chunk');
    assert.equal(longRecordingResult.chunkCount, longRecordingResult.chunkCalls, 'retained task records the internal chunk count without creating chunk tasks');

    const blankChunkResult = await evaluate(client, `(async () => {
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      window.__speechSmoke.chunkDurationMs = 100;
      window.__speechSmoke.chunkTextPrefix = '有效';
      window.__speechSmoke.blankChunkNumbers = [2];
      window.__speechSmoke.transcribeChunkCallCount = 0;
      window.__speechSmoke.nextSampleCount = 4800;
      const beforeCalls = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').length;
      const beforeTaskCount = document.querySelectorAll('.speech-task-item').length;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('blank chunk recording did not enter recording state'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((r) => setTimeout(r, 80));
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const status = document.querySelector('#sync-status')?.textContent || '';
          const text = window.transferGenieComposerStore?.getActiveDraft?.()?.text || '';
          if (/(语音识别完成|本地耗时)/.test(status) && text.includes('有效1') && text.includes('有效3')) resolve();
          else if (/语音识别失败/.test(status)) reject(new Error(status));
          else if (Date.now() - start > 2500) reject(new Error('blank chunk recording did not complete'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const calls = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').slice(beforeCalls);
      const taskItems = Array.from(document.querySelectorAll('.speech-task-item'));
      const result = {
        chunkCalls: calls.length,
        status: document.querySelector('#sync-status')?.textContent || '',
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        beforeTaskCount,
        taskCount: taskItems.length,
        taskTitle: taskItems[0]?.querySelector('.speech-task-text')?.getAttribute('title') || '',
      };
      window.__speechSmoke.chunkDurationMs = 0;
      window.__speechSmoke.chunkTextPrefix = '';
      window.__speechSmoke.blankChunkNumbers = [];
      return result;
    })()`);
    assert.equal(blankChunkResult.chunkCalls, 3, 'blank middle chunk is still counted as one internal ASR chunk');
    assert.equal(blankChunkResult.text, '有效1\n有效3', 'blank middle chunk is skipped while surrounding chunk text is preserved');
    assert.equal(blankChunkResult.taskCount, blankChunkResult.beforeTaskCount + 1, 'blank middle chunk still adds only one visible speech task');
    assert.equal(blankChunkResult.taskTitle, '有效1\n有效3', 'speech task stores the combined nonblank transcript');

    const rapidToggleResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('speech button did not return to idle'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.__speechSmoke.getUserMediaDelayMs = 160;
      const beforeStops = window.__speechSmoke.stoppedStreams;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-preparing')) resolve();
          else if (Date.now() - start > 1000) reject(new Error('button did not enter preparing state'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((r) => setTimeout(r, 220));
      const button = document.querySelector('#speech-to-text-toggle');
      const afterCancel = {
        idle: !button.classList.contains('is-preparing') && !button.classList.contains('is-recording') && !button.classList.contains('is-transcribing'),
        stoppedDelta: window.__speechSmoke.stoppedStreams - beforeStops,
      };
      window.__speechSmoke.getUserMediaDelayMs = 0;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (button.classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('recording did not recover after rapid cancel'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const recovered = button.classList.contains('is-recording');
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((r) => setTimeout(r, 60));
      return { ...afterCancel, recovered };
    })()`);
    assert.equal(rapidToggleResult.idle, true, 'rapid cancel while preparing returns button to idle');
    assert.ok(rapidToggleResult.stoppedDelta >= 1, 'late microphone stream is closed after rapid cancel');
    assert.equal(rapidToggleResult.recovered, true, 'speech recording can start again after rapid cancel');

    const micRetryResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('speech button did not return to idle'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const beforeRequests = window.__speechSmoke.mediaRequests.length;
      window.__speechSmoke.failNextGetUserMedia = 'NotReadableError';
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2500) reject(new Error('microphone retry did not enter recording state'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const requests = window.__speechSmoke.mediaRequests.slice(beforeRequests);
      const recording = document.querySelector('#speech-to-text-toggle').classList.contains('is-recording');
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((r) => setTimeout(r, 60));
      return { recording, requests };
    })()`);
    assert.equal(micRetryResult.recording, true, 'recording starts after recoverable microphone open failure');
    assert.equal(micRetryResult.requests.length, 2, 'recoverable microphone open failure retries once');
    assert.equal(micRetryResult.requests[0].audio.deviceId.exact, 'mic-1', 'first microphone attempt uses selected device');
    assert.equal(!!micRetryResult.requests[1].audio.deviceId, false, 'retry falls back to default microphone');

    const disabledCueResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('speech button did not return to idle'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      document.querySelector('#speech-to-text-cue-sound-enabled').checked = false;
      document.querySelector('#speech-to-text-cue-sound-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#speech-to-text-cue-sound-kind').value = 'soft';
      document.querySelector('#speech-to-text-cue-sound-kind').dispatchEvent(new Event('change', { bubbles: true }));
      const beforeCues = window.__speechSmoke.cueSounds.length;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('recording did not start with disabled cues'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((r) => setTimeout(r, 80));
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
          if (saved.cue_sound_enabled === false && saved.cue_sound_kind === 'soft') resolve();
          else if (Date.now() - start > 2500) reject(new Error('cue sound settings were not auto-saved'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
      return {
        cueDelta: window.__speechSmoke.cueSounds.length - beforeCues,
        kindDisabled: document.querySelector('#speech-to-text-cue-sound-kind').disabled,
        saved,
      };
    })()`);
    assert.equal(disabledCueResult.cueDelta, 0, 'disabled cue setting suppresses start and stop cue sounds');
    assert.equal(disabledCueResult.kindDisabled, true, 'cue sound selector is disabled when cue sounds are disabled');
    assert.equal(disabledCueResult.saved.cue_sound_enabled, false, 'cue sound enabled flag is saved');
    assert.equal(disabledCueResult.saved.cue_sound_kind, 'soft', 'cue sound kind is saved');

    const systemAudioResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('speech button did not return to idle'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      document.querySelector('#speech-to-text-capture-system-audio').checked = true;
      document.querySelector('#speech-to-text-capture-system-audio').dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const select = document.querySelector('#speech-to-text-system-audio-device');
          if (Array.from(select?.options || []).some((option) => option.value === 'blackhole-1')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('BlackHole option did not appear'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      document.querySelector('#speech-to-text-system-audio-device').value = 'blackhole-1';
      document.querySelector('#speech-to-text-system-audio-device').dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
          if (saved.capture_system_audio === true && saved.system_audio_device_id === 'blackhole-1') resolve();
          else if (Date.now() - start > 2500) reject(new Error('system audio settings were not auto-saved'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const beforeMic = window.__speechSmoke.mediaRequests.length;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2500) reject(new Error('system audio recording did not start'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((r) => setTimeout(r, 80));
      const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
      return {
        micDelta: window.__speechSmoke.mediaRequests.length - beforeMic,
        micRequests: window.__speechSmoke.mediaRequests.slice(beforeMic),
        hasDisplayMedia: !!navigator.mediaDevices.getDisplayMedia,
        systemAudioSelectValue: document.querySelector('#speech-to-text-system-audio-device')?.value,
        saved,
      };
    })()`);
    assert.equal(systemAudioResult.saved.capture_system_audio, true, 'system audio capture setting is saved');
    assert.equal(systemAudioResult.saved.system_audio_device_id, 'blackhole-1', 'computer audio device is saved');
    assert.equal(systemAudioResult.systemAudioSelectValue, 'blackhole-1', 'computer audio device selection stays visible');
    assert.equal(systemAudioResult.micDelta, 2, 'computer audio setting records mic and internal audio as two input requests');
    assert.equal(systemAudioResult.micRequests[0].audio.deviceId.exact, 'mic-1', 'first request uses the selected microphone device');
    assert.equal(systemAudioResult.micRequests[1].audio.deviceId.exact, 'blackhole-1', 'second request uses the selected computer-audio device');
    assert.equal(systemAudioResult.micRequests[1].audio.echoCancellation, false, 'computer audio input keeps raw audio without echo cancellation');
    assert.equal(systemAudioResult.micRequests[1].audio.noiseSuppression, false, 'computer audio input keeps raw audio without noise suppression');
    assert.equal(systemAudioResult.micRequests[1].audio.autoGainControl, false, 'computer audio input keeps raw audio without auto gain control');
    assert.equal(systemAudioResult.hasDisplayMedia, false, 'computer audio setting does not expose or call display capture in the smoke harness');

    const cuePreviewResult = await evaluate(client, `(async () => {
      document.querySelector('#speech-to-text-cue-sound-enabled').checked = true;
      document.querySelector('#speech-to-text-cue-sound-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#speech-to-text-cue-sound-kind').value = 'soft';
      document.querySelector('#speech-to-text-cue-sound-kind').dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
      const beforeCues = window.__speechSmoke.cueSounds.length;
      const beforeRequests = window.__speechSmoke.mediaRequests.length;
      const beforeSaves = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').length;
      document.querySelector('#speech-to-text-cue-sound-preview').click();
      await new Promise((r) => setTimeout(r, 40));
      const cue = window.__speechSmoke.cueSounds.at(-1) || {};
      return {
        cueDelta: window.__speechSmoke.cueSounds.length - beforeCues,
        requestDelta: window.__speechSmoke.mediaRequests.length - beforeRequests,
        saveDelta: window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').length - beforeSaves,
        previewDisabled: document.querySelector('#speech-to-text-cue-sound-preview').disabled,
        cue,
      };
    })()`);
    assert.equal(cuePreviewResult.cueDelta, 1, 'cue preview plays one cue sound');
    assert.equal(cuePreviewResult.previewDisabled, false, 'cue preview button is enabled when cue sounds are enabled');
    assert.equal(cuePreviewResult.requestDelta, 0, 'cue preview does not start microphone recording');
    assert.equal(cuePreviewResult.saveDelta, 0, 'cue preview does not save settings');
    assert.equal(cuePreviewResult.cue.type, 'sine', 'cue preview uses the current unsaved selected cue kind');

    const rightAltResult = await evaluate(client, `(async () => {
      window.transferGenieActions?.updateSettingsFormField?.('speechToTextCueSoundEnabled', true);
      document.querySelector('#speech-to-text-capture-system-audio').checked = false;
      document.querySelector('#speech-to-text-capture-system-audio').dispatchEvent(new Event('change', { bubbles: true }));
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      const beforeRequests = window.__speechSmoke.mediaRequests.length;
      const editor = document.querySelector('#text-input');
      editor.addEventListener('keydown', (event) => event.stopPropagation(), { once: true });
      editor.focus();
      editor.dispatchEvent(new KeyboardEvent('keydown', { code: 'AltRight', key: 'Alt', altKey: true, bubbles: true }));
      editor.dispatchEvent(new KeyboardEvent('keydown', { code: 'AltRight', key: 'Alt', altKey: true, repeat: true, bubbles: true }));
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('right Alt did not enter recording state'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const requestDeltaWhileHeld = window.__speechSmoke.mediaRequests.length - beforeRequests;
      editor.dispatchEvent(new KeyboardEvent('keyup', { code: 'AltRight', key: 'Alt', altKey: false, bubbles: true }));
      editor.dispatchEvent(new KeyboardEvent('keydown', { code: 'AltLeft', key: 'Alt', altKey: true, bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
      const stillRecordingAfterLeftAlt = document.querySelector('#speech-to-text-toggle').classList.contains('is-recording');
      editor.dispatchEvent(new KeyboardEvent('keyup', { code: 'AltLeft', key: 'Alt', altKey: false, bubbles: true }));
      editor.dispatchEvent(new KeyboardEvent('keydown', { code: '', key: 'AltGraph', altKey: true, ctrlKey: true, bubbles: true }));
      await new Promise((r) => setTimeout(r, 80));
      editor.dispatchEvent(new KeyboardEvent('keyup', { code: '', key: 'AltGraph', altKey: false, ctrlKey: false, bubbles: true }));
      return {
        requestDeltaWhileHeld,
        stillRecordingAfterLeftAlt,
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        longText: window.__speechSmoke.longText,
      };
    })()`);
    assert.equal(rightAltResult.stillRecordingAfterLeftAlt, true, 'left Alt does not toggle when right Alt is configured');
    assert.equal(rightAltResult.requestDeltaWhileHeld, 1, 'holding right Alt does not start duplicate microphone requests');
    assert.equal(rightAltResult.text, rightAltResult.longText, 'right Alt toggles speech recording and inserts text');

    const shortcutResult = await evaluate(client, `(async () => {
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      await window.__speechSmoke.eventHandlers['speech-to-text-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('shortcut did not enter recording state'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const recording = document.querySelector('#speech-to-text-toggle').classList.contains('is-recording');
      await new Promise((r) => setTimeout(r, 80));
      await window.__speechSmoke.eventHandlers['speech-to-text-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const text = window.transferGenieComposerStore?.getActiveDraft?.()?.text || '';
          const status = document.querySelector('#sync-status')?.textContent || '';
          if (text) resolve();
          else if (/语音识别失败/.test(status)) reject(new Error(status));
          else if (Date.now() - start > 2500) reject(new Error('shortcut recognition did not insert text'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      return { recording, text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '', longText: window.__speechSmoke.longText };
    })()`);
    assert.equal(shortcutResult.recording, true, 'speech shortcut event enters recording state');
    assert.equal(shortcutResult.text, shortcutResult.longText, 'shortcut-triggered recognition inserts text');

    const deniedResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('speech button did not return to idle'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.__speechSmoke.denyMicrophone = true;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((r) => setTimeout(r, 50));
      window.__speechSmoke.denyMicrophone = false;
      return document.querySelector('#sync-status').textContent;
    })()`);
    assert.match(deniedResult, /启动录音失败/, 'permission denial is surfaced to the user');

    const invalidCredentialResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('speech button did not return to idle'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.__speechSmoke.failTranscribe = true;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((r) => setTimeout(r, 80));
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const status = document.querySelector('#sync-status')?.textContent || '';
          const failedItem = Array.from(document.querySelectorAll('.speech-task-item'))
            .find((item) => item.classList.contains('is-failed'));
          if (/语音识别失败/.test(status) && failedItem) resolve();
          else if (Date.now() - start > 2000) reject(new Error('failed transcription did not surface'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.__speechSmoke.failTranscribe = false;
      const failedItem = Array.from(document.querySelectorAll('.speech-task-item'))
        .find((item) => item.classList.contains('is-failed'));
      const failedText = failedItem?.querySelector('.speech-task-text')?.textContent || '';
      failedItem?.querySelector('button:nth-child(2)')?.click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const item = document.querySelector('.speech-task-item');
          const text = item?.querySelector('.speech-task-text')?.textContent || '';
          if (text.endsWith('...')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('failed task did not retry successfully'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      return {
        status: document.querySelector('#sync-status').textContent,
        failedText,
        failedTaskFound: !!failedItem,
        retryText: document.querySelector('.speech-task-item .speech-task-text')?.textContent || '',
        longText: window.__speechSmoke.longText,
      };
    })()`);
    assert.equal(invalidCredentialResult.failedTaskFound, true, 'ASR credential failure creates a failed speech task');
    assert.match(invalidCredentialResult.failedText, /ASR 凭据无效/, 'failed transcription task shows ASR error');
    assert.ok(invalidCredentialResult.retryText.length < invalidCredentialResult.longText.length, 'failed transcription task can be retried and shows a preview');

    const retentionResult = await evaluate(client, `(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('transfer-genie-speech-tasks', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('tasks', 'readwrite');
        const store = transaction.objectStore('tasks');
        [0, 1, 2].forEach((index) => store.put({
          id: 'retention-' + index,
          status: 'success',
          text: '保留测试 ' + index,
          error: '',
          durationMs: 1200 + index,
          audio: { bytes: [82, 73, 70, 70], mimeType: 'audio/wav', format: 'wav', sampleRate: 16000, channels: 1, bitsPerSample: 16 },
          createdAtMs: Date.now() + index,
          updatedAtMs: Date.now() + index,
        }));
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      const input = document.querySelector('#speech-to-text-task-retention');
      input.value = '2';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 120));
      const items = Array.from(document.querySelectorAll('.speech-task-item .speech-task-text')).map((item) => item.textContent || '');
      return { count: items.length, items, summary: document.querySelector('#speech-task-history-summary')?.textContent || '' };
    })()`);
    assert.equal(retentionResult.count, 2, `speech task retention keeps configured count: ${JSON.stringify(retentionResult)}`);
    assert.match(retentionResult.summary, /保留最近 2 条/, 'speech task retention summary reflects configured count');

    console.log('speech-to-text UI smoke tests passed');
  } finally {
    chrome.pageClient.close();
    chrome.browserClient.close();
    await killProcessTree(chrome.child.pid);
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (server) await killProcessTree(server.pid);
    try {
      rmSync(chrome.userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (_) {
      // Chrome can hold profile sqlite files briefly after shutdown; leave the temp dir for OS cleanup.
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
}).then(() => process.exit(0));
