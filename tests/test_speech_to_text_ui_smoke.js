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
    const detail = result.exceptionDetails.exception?.description
      || result.exceptionDetails.exception?.value
      || result.exceptionDetails.text
      || 'Browser evaluation failed';
    throw new Error(detail);
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
    active_webdav_id: 'endpoint-1',
    webdav_endpoints: [{
      id: 'endpoint-1',
      name: 'Smoke Endpoint',
      url: 'https://example.test/dav',
      username: 'smoke',
      password: 'secret',
      enabled: true,
    }],
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
      shortcut_enabled: false,
      shortcut: 'right-alt',
      system_dictation_enabled: true,
      system_dictation_shortcut: 'right-alt',
      max_duration_secs: 5,
      task_retention_count: 14,
      cue_sound_enabled: true,
      cue_sound_kind: 'system',
      polish_enabled: false,
      polish_action_id: 'polish',
    },
  };
}

function preloadScript() {
  return `(() => {
    const eventHandlers = {};
    const settings = ${JSON.stringify(mockSettings())};
    window.__speechSmoke = {
      calls: [],
      sentMessages: [],
      emittedEvents: [],
      eventHandlers,
      failTranscribe: false,
      denyMicrophone: false,
      failNextGetUserMedia: '',
      hangOverlayInvokes: false,
      hideGetUserMedia: false,
      getUserMediaDelayMs: 0,
      mediaRequests: [],
      stoppedStreams: 0,
      cueSounds: [],
      clipboardText: '',
      pastedText: '',
      focusCaptureCount: 0,
      focusDetectedAtDictationStart: true,
      pasteReturnsNoPaste: false,
      stealFocusOnOverlayShow: false,
      overlayFocusStealCount: 0,
      pasteWithoutFocus: false,
      downloads: [],
      aiRequests: [],
      failAiPolish: false,
      systemDictationStatus: '',
      chunkDurationMs: 0,
      nextSampleCount: 0,
      chunkTextPrefix: '',
      blankChunkNumbers: [],
      blankAllChunkRequests: false,
      repeatedChunkNumbers: [],
      repeatedPhraseChunkNumbers: [],
      transcribeChunkCallCount: 0,
      silentSamples: false,
      sendSpeechDelayMs: 0,
      sendTextDelayMs: 0,
      loadMessagesDelayMs: 0,
      fullscreenWasExitedBeforeLoadMessagesAfterSpeechSend: null,
    };
    window.__speechSmoke.longText = '语音识别文本'.repeat(20);
    const originalFetch = window.fetch?.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      if (url.startsWith('data:audio/') || url.includes('speech-message.wav')) {
        return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { 'Content-Type': 'audio/wav' } });
      }
      return originalFetch(input, init);
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text) => { window.__speechSmoke.clipboardText = String(text || ''); },
    } });
    window.__TAURI__ = {
      core: {
        invoke: async (command, args) => {
          window.__speechSmoke.calls.push({ command, args });
          if (command === 'get_settings') return structuredClone(settings);
          if (command === 'save_settings') return args.settings;
          if (command === 'paste_dictation_text') {
            const text = String(args?.text || '');
            const pasted = !window.__speechSmoke.pasteWithoutFocus && !window.__speechSmoke.pasteReturnsNoPaste;
            if (pasted) window.__speechSmoke.pastedText = text;
            window.__speechSmoke.clipboardText = text;
            return { focusDetected: !window.__speechSmoke.pasteWithoutFocus, pasted };
          }
          if (command === 'capture_system_dictation_focus_window') {
            window.__speechSmoke.focusCaptureCount += 1;
            window.__speechSmoke.capturedFocusTarget = document.activeElement || null;
            return { focusDetected: window.__speechSmoke.focusDetectedAtDictationStart };
          }
          if (command === 'process_text_with_ai') {
            if (window.__speechSmoke.failAiPolish) throw 'AI 润色失败';
            const request = args?.request || {};
            const text = String(request.text || '');
            const actionId = String(request.actionId || 'polish');
            window.__speechSmoke.aiRequests.push({ actionId, text });
            return { actionId, actionName: actionId, outputText: '润色：' + text, outputMode: 'preview_replace' };
          }
          if (command === 'show_system_dictation_window' || command === 'hide_system_dictation_window') {
            if (window.__speechSmoke.hangOverlayInvokes) return new Promise(() => {});
            if (command === 'show_system_dictation_window' && window.__speechSmoke.stealFocusOnOverlayShow) {
              window.__speechSmoke.overlayFocusStealCount += 1;
              document.activeElement?.blur?.();
            }
            return null;
          }
          if (command === 'set_system_dictation_level') return null;
          if (command === 'set_system_dictation_status') {
            window.__speechSmoke.systemDictationStatus = String(args?.text || '');
            return null;
          }
          if (command === 'copy_dictation_text') {
            window.__speechSmoke.dictationCopyText = String(args?.text || '');
            window.__speechSmoke.clipboardText = String(args?.text || '');
            return null;
          }
          if (command === 'transcribe_speech') {
            if (window.__speechSmoke.failTranscribe) throw 'ASR 凭据无效';
            if (window.__speechSmoke.chunkTextPrefix) {
              window.__speechSmoke.transcribeChunkCallCount += 1;
              if (window.__speechSmoke.blankAllChunkRequests && window.__speechSmoke.transcribeChunkCallCount <= 99) {
                throw 'ASR 未返回可用文本';
              }
              if (window.__speechSmoke.blankChunkNumbers.includes(window.__speechSmoke.transcribeChunkCallCount)) {
                throw 'ASR 未返回可用文本';
              }
              if (window.__speechSmoke.repeatedChunkNumbers.includes(window.__speechSmoke.transcribeChunkCallCount)) {
                return { text: '娘'.repeat(24), logId: 'smoke-log', timing: { totalMs: 1100, connectMs: 180, sendConfigMs: 30, sendAudioMs: 60, waitResultMs: 830, audioBytes: 30000 } };
              }
              if (window.__speechSmoke.repeatedPhraseChunkNumbers.includes(window.__speechSmoke.transcribeChunkCallCount)) {
                return { text: '五秒'.repeat(24), logId: 'smoke-log', timing: { totalMs: 1100, connectMs: 180, sendConfigMs: 30, sendAudioMs: 60, waitResultMs: 830, audioBytes: 30000 } };
              }
              return { text: window.__speechSmoke.chunkTextPrefix + window.__speechSmoke.transcribeChunkCallCount, logId: 'smoke-log', timing: { totalMs: 1200, connectMs: 200, sendConfigMs: 30, sendAudioMs: 70, waitResultMs: 900, audioBytes: 32000 } };
            }
            return { text: window.__speechSmoke.longText, logId: 'smoke-log', timing: { totalMs: 1500, connectMs: 250, sendConfigMs: 40, sendAudioMs: 80, waitResultMs: 1130, audioBytes: 64000 } };
          }
          if (command === 'send_speech_message') {
            const request = args?.request || {};
            const delayMs = Number(window.__speechSmoke.sendSpeechDelayMs || 0);
            if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
            window.__speechSmoke.fullscreenWasExitedBeforeLoadMessagesAfterSpeechSend = false;
            const message = {
              filename: 'speech-message.wav',
              original_name: request.originalName || 'speech-message.wav',
              endpoint_id: 'endpoint-1',
              sender: 'Smoke',
              timestamp_ms: Date.now(),
              size: Array.isArray(request.audioData) ? request.audioData.length : 0,
              kind: 'text',
              content: request.transcript || '',
              marked: false,
              marked_tag_ids: [],
              marked_pinned: false,
              format: 'text',
              transcript_source: 'speech-to-text',
              source_audio_mime_type: request.mimeType || 'audio/wav',
              transcript_raw_text: request.rawTranscript || '',
            };
            window.__speechSmoke.sentMessages = [message, ...window.__speechSmoke.sentMessages];
            return {
              filename: message.filename,
              originalName: message.original_name,
              endpointId: message.endpoint_id,
              transcriptSource: message.transcript_source,
              sourceAudioMimeType: message.source_audio_mime_type,
              transcriptText: message.content,
              transcriptRawText: message.transcript_raw_text,
            };
          }
          if (command === 'send_text') {
            const delayMs = Number(window.__speechSmoke.sendTextDelayMs || 0);
            if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
            const message = {
              filename: 'text-message.txt',
              original_name: 'message.txt',
              endpoint_id: 'endpoint-1',
              sender: 'Smoke',
              timestamp_ms: Date.now(),
              size: String(args?.text || '').length,
              kind: 'text',
              content: String(args?.text || ''),
              marked: false,
              marked_tag_ids: [],
              marked_pinned: false,
              format: args?.format || 'text',
            };
            window.__speechSmoke.sentMessages = [message, ...window.__speechSmoke.sentMessages];
            return { filename: message.filename, markedTagIds: [] };
          }
          if (command === 'send_file') {
            return { filename: 'file-message.bin', markedTagIds: [] };
          }
          if (command === 'get_message_source_audio_file') return 'data:audio/wav;base64,UklGRg==';
          if (command === 'download_message_file') {
            return { status: 'saved', path: 'C:/Downloads/speech-message.wav' };
          }
          if (command === 'list_messages_window') {
            const delayMs = Number(window.__speechSmoke.loadMessagesDelayMs || 0);
            if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
            if (window.__speechSmoke.fullscreenWasExitedBeforeLoadMessagesAfterSpeechSend === false) {
              window.__speechSmoke.fullscreenWasExitedBeforeLoadMessagesAfterSpeechSend = !document.documentElement.classList.contains('composer-fullscreen-active') && !document.body.classList.contains('composer-fullscreen-active');
            }
            return { messages: window.__speechSmoke.sentMessages, has_more_before: false, has_more_after: false };
          }
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
        },
        emit: async (name, payload) => {
          window.__speechSmoke.emittedEvents.push({ name, payload });
          if (eventHandlers[name]) await eventHandlers[name]({ payload });
        },
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
              if (!window.__speechSmoke.silentSamples) {
                for (let index = 0; index < samples.length; index += 1) samples[index] = Math.sin(index / 8) * 0.25;
              }
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
  return { child, userDataDir, port, browserClient, pageClient };
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
          window.__speechSmoke?.eventHandlers?.['system-dictation-toggle']
        ) resolve(true);
        else if (Date.now() - start > 15000) reject(new Error('speech UI did not initialize'));
        else setTimeout(tick, 100);
      };
      tick();
    })`);

    const dictationPageResult = await (async () => {
      const { targetId } = await chrome.browserClient.send('Target.createTarget', { url: `${APP_URL}system-dictation.html` });
      const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
      const target = targets.find((item) => item.id === targetId);
      const dictationClient = createCdpClient(await connectWebSocket(target.webSocketDebuggerUrl));
      try {
        await dictationClient.send('Runtime.enable');
        await evaluate(dictationClient, `new Promise((resolve, reject) => {
          const start = Date.now();
          const tick = () => {
            if (typeof window.__transferGenieSetDictationLevel === 'function' && document.querySelector('.dictation-wave span')) resolve(true);
            else if (Date.now() - start > 5000) reject(new Error('dictation overlay did not initialize'));
            else setTimeout(tick, 50);
          };
          tick();
        })`);
          return await evaluate(dictationClient, `(async () => {
          const wave = document.querySelector('.dictation-wave');
          const bar = document.querySelector('.dictation-wave span:nth-child(3)');
          const beforeMotion = wave.style.getPropertyValue('--dictation-motion');
          const beforeTransform = getComputedStyle(bar).transform;
          window.__transferGenieSetDictationLevel(0.65);
          await new Promise((resolve) => setTimeout(resolve, 220));
          window.__transferGenieSetDictationStatus({ text: '无焦点识别结果', copyText: '无焦点识别结果' });
          await new Promise((resolve) => setTimeout(resolve, 60));
          const statusElement = document.querySelector('#dictation-status');
          const resultStatus = statusElement?.textContent || '';
          const copyButton = document.querySelector('#dictation-copy');
          const copyVisible = !!copyButton && getComputedStyle(copyButton).display !== 'none' && !copyButton.hidden;
          const copyDisabled = copyButton?.disabled;
           const closeButton = document.querySelector('#dictation-close');
           const closeVisible = !!closeButton && getComputedStyle(closeButton).display !== 'none' && !closeButton.hidden;
           const resultMode = document.querySelector('.dictation-capsule')?.classList.contains('is-status') || false;
          const resultCapsule = document.querySelector('.dictation-capsule');
          const defaultResultBackground = resultCapsule ? getComputedStyle(resultCapsule).backgroundColor : '';
          const defaultResultShadow = resultCapsule ? getComputedStyle(resultCapsule).boxShadow : '';
          const defaultCopyBackground = copyButton ? getComputedStyle(copyButton).backgroundColor : '';
          const defaultCopyColor = copyButton ? getComputedStyle(copyButton).color : '';
          const resultHoverRule = Array.from(document.styleSheets)
            .flatMap((sheet) => Array.from(sheet.cssRules || []))
            .find((rule) => rule.selectorText === '.dictation-capsule.is-result:hover');
          const resultHoverBackground = resultHoverRule?.style?.backgroundColor || '';
          resultCapsule?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
           await new Promise((resolve) => setTimeout(resolve, 3100));
           const hoveredStatus = document.querySelector('#dictation-status')?.textContent || '';
           closeButton?.click();
           await new Promise((resolve) => setTimeout(resolve, 20));
           const closedStatus = document.querySelector('#dictation-status')?.textContent || '';
           window.__transferGenieSetDictationStatus({ text: '自动关闭的识别结果', copyText: '自动关闭的识别结果' });
           await new Promise((resolve) => setTimeout(resolve, 3100));
           const autoClosedStatus = document.querySelector('#dictation-status')?.textContent || '';
           window.__transferGenieSetDictationStatus({ text: '最新识别结果', copyText: '最新识别结果', requestId: 20 });
           window.__transferGenieSetDictationStatus({ text: '延迟的旧状态', copyText: '延迟的旧状态', requestId: 19 });
           const staleStatusIgnored = document.querySelector('#dictation-status')?.textContent || '';
           window.__transferGenieSetDictationStatus({ text: '正在进行润色', copyText: '' });
          await new Promise((resolve) => setTimeout(resolve, 20));
          const progressWidth = document.querySelector('.dictation-capsule')?.getBoundingClientRect().width || 0;
          const copyHiddenDuringProgress = copyButton?.hidden === true;
          return {
            functionReady: typeof window.__transferGenieSetDictationLevel === 'function',
            resultStatus,
            defaultResultBackground,
            defaultResultShadow,
            defaultCopyBackground,
            defaultCopyColor,
            resultHoverBackground,
            copyVisible,
            copyDisabled,
             closeVisible,
             hoveredStatus,
             closedStatus,
             autoClosedStatus,
            staleStatusIgnored,
            resultMode,
            copyHiddenDuringProgress,
            progressWidth,
            beforeMotion,
            afterMotion: wave.style.getPropertyValue('--dictation-motion'),
            beforeTransform,
            afterTransform: getComputedStyle(bar).transform,
          };
        })()`);
      } finally {
        dictationClient.close();
        await chrome.browserClient.send('Target.closeTarget', { targetId });
      }
    })();
    assert.equal(dictationPageResult.functionReady, true, 'system dictation overlay exposes level update function');
    assert.equal(dictationPageResult.resultStatus, '无焦点识别结果', 'system dictation overlay shows the copied result text');
    assert.equal(dictationPageResult.resultMode, true, 'system dictation overlay enters result mode');
    assert.equal(dictationPageResult.defaultResultBackground, 'rgba(8, 10, 14, 0.62)', 'system dictation result capsule uses a translucent readable background by default');
    assert.equal(dictationPageResult.defaultResultShadow, 'none', 'translucent result capsule does not cast a blocking shadow');
    assert.equal(dictationPageResult.defaultCopyBackground, 'rgba(0, 0, 0, 0)', 'result actions do not use opaque surfaces before hover');
    assert.equal(dictationPageResult.defaultCopyColor, 'rgb(255, 255, 255)', 'transparent result action icons remain readable on the translucent surface');
    assert.match(dictationPageResult.resultHoverBackground, /8, 10, 14/, 'system dictation result capsule restores an opaque surface on hover');
    assert.equal(dictationPageResult.copyVisible, true, 'system dictation result exposes a copy button');
    assert.equal(dictationPageResult.copyDisabled, false, 'system dictation copy button is enabled for the result');
    assert.equal(dictationPageResult.closeVisible, true, 'system dictation result exposes a close button');
    assert.equal(dictationPageResult.hoveredStatus, '无焦点识别结果', 'hovering over the result keeps it visible past the automatic close delay');
    assert.equal(dictationPageResult.closedStatus, '', 'system dictation close button clears the result');
    assert.equal(dictationPageResult.autoClosedStatus, '', 'unhovered result automatically closes after three seconds');
    assert.equal(dictationPageResult.staleStatusIgnored, '最新识别结果', 'delayed status from an older overlay request cannot replace the latest result');
    assert.equal(dictationPageResult.copyHiddenDuringProgress, true, 'system dictation progress status does not expose the copy button');
    assert.ok(dictationPageResult.progressWidth > 0 && dictationPageResult.progressWidth < 160, 'system dictation progress capsule fits its status text without hidden action space');
    assert.notEqual(dictationPageResult.afterMotion, '', 'system dictation overlay writes waveform motion CSS variable');
    assert.notEqual(dictationPageResult.afterMotion, dictationPageResult.beforeMotion, 'system dictation waveform responds to level changes');
    assert.notEqual(dictationPageResult.afterTransform, dictationPageResult.beforeTransform, 'system dictation waveform bar transform changes after level update');

    const unsupportedResult = await evaluate(client, `(async () => {
      window.__speechSmoke.hideGetUserMedia = true;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((r) => setTimeout(r, 80));
      const status = document.querySelector('#sync-status')?.textContent || '';
      window.__speechSmoke.hideGetUserMedia = false;
      return status;
    })()`);
    assert.match(unsupportedResult, /麦克风 API|macOS|系统设置/, 'missing getUserMedia shows actionable macOS microphone guidance');

    const sendButtonResult = await evaluate(client, `(async () => {
      window.__speechSmoke.calls = [];
      window.__speechSmoke.sentMessages = [];
      window.__speechSmoke.sendTextDelayMs = 120;
      const bridge = window.transferGenieComposer || {};
      bridge.setActiveDraftText?.('普通发送按钮测试');
      const draftBeforeSend = window.transferGenieComposerStore?.getActiveDraft?.()?.text || '';
      document.querySelector('#send-text')?.click();
      const clearedImmediately = window.transferGenieComposerStore?.getActiveDraft?.()?.text === '';
      bridge.setActiveDraftText?.('继续输入');
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const sent = window.__speechSmoke.sentMessages.some((message) => message.content === '普通发送按钮测试');
          if (sent) resolve();
          else if (Date.now() - start > 2500) reject(new Error('send button did not finish in background'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      return {
        clearedImmediately,
        draftBeforeSend,
        draftValue: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        sentText: window.__speechSmoke.sentMessages.at(-1)?.content || '',
        calls: window.__speechSmoke.calls.map((call) => call.command),
      };
    })()`);
    assert.equal(sendButtonResult.clearedImmediately, true, 'send button clears the editor immediately');
    assert.equal(sendButtonResult.draftBeforeSend, '普通发送按钮测试', 'send button reads the current draft before clearing');
    assert.equal(sendButtonResult.draftValue, '继续输入', 'background send does not overwrite new editor input');
    assert.equal(sendButtonResult.sentText, '普通发送按钮测试', 'send button still sends the original text in the background');
    await evaluate(client, `(async () => {
      window.__speechSmoke.sentMessages = [];
      window.__speechSmoke.calls = [];
      window.transferGenieComposer?.setActiveDraftText?.('');
      await new Promise((r) => setTimeout(r, 20));
      return true;
    })()`);

    const buttonResult = await evaluate(client, `(async () => {
      let markdownSyncCount = 0;
      window.transferGenieComposer = window.transferGenieComposer || {};
      window.transferGenieComposer._setActiveText = () => { markdownSyncCount += 1; };
      const cueCountBeforeToggle = window.__speechSmoke.cueSounds.length;
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (window.transferGenieLegacyFullscreen?.set) resolve();
          else if (Date.now() - start > 2000) reject(new Error('fullscreen bridge was not ready'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.transferGenieLegacyFullscreen.set(true);
      const fullscreenBeforeSend = window.transferGenieLegacyFullscreen.get();
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
          const status = document.querySelector('#sync-status')?.textContent || '';
          if (window.__speechSmoke.calls.some((call) => call.command === 'send_speech_message')) resolve();
          else if (/语音识别失败/.test(status)) reject(new Error(status));
          else if (Date.now() - start > 2500) reject(new Error('speech message was not sent'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const fullscreenExitedImmediately = !document.documentElement.classList.contains('composer-fullscreen-active') && !document.body.classList.contains('composer-fullscreen-active');
      const calls = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech');
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
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        request: calls.at(-1)?.args?.request,
        sendRequest: window.__speechSmoke.calls.find((call) => call.command === 'send_speech_message')?.args?.request || null,
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
        fullscreenBeforeSend,
        fullscreenExitedImmediately,
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
    assert.equal(buttonResult.text, '', 'recognized text is not inserted into the composer draft');
    assert.equal(buttonResult.sendRequest?.transcript, buttonResult.longText, 'recognized text is sent as a message');
    assert.equal(buttonResult.clipboardText, buttonResult.longText, 'recognized text is still copied for clipboard convenience');
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
    assert.match(buttonResult.sendRequest?.mimeType || '', /^audio\//, 'speech message sends a source audio mime type');
    assert.equal(buttonResult.cueEnabledChecked, true, 'speech cue sounds default to enabled');
    assert.equal(buttonResult.cueKindValue, 'system', 'speech cue sound defaults to system');
    assert.equal(buttonResult.systemAudioChecked, false, 'system audio capture defaults to disabled');
    assert.ok(buttonResult.cueSoundCount >= 2, 'speech recording plays start and stop cue sounds by default');
    assert.equal(buttonResult.startClickCueDelta, 1, 'speech button immediately plays cue when opening recording');
    assert.equal(buttonResult.stopClickCueDelta, 1, 'speech button immediately plays cue when closing recording');
    assert.equal(buttonResult.fullscreenBeforeSend, true, 'speech button test starts from fullscreen');
    assert.equal(buttonResult.fullscreenExitedImmediately, true, 'speech button exits fullscreen before message list refresh completes');
    assert.equal(buttonResult.markdownSyncCount, 0, 'markdown editor is not touched when speech is sent directly');
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
          const hasTask = document.querySelectorAll('.speech-task-item').length > 0;
          const sent = window.__speechSmoke.calls.some(
            (call) => call.command === 'send_speech_message' && call.args?.request?.transcript === '分片1\\n分片2\\n分片3',
          );
          if (sent && hasTask) resolve();
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
        sourceMessageFilename: newest.sourceMessageFilename || '',
        sourceAudioMimeType: newest.sourceAudioMimeType || '',
        fullTaskText: newest.text || '',
        chunkCount: newest.chunkCount || 0,
      };
    })()`);
    assert.ok(longRecordingResult.callsWhileRecording > 0, 'long recording transcribes completed chunks while recording continues');
    assert.equal(longRecordingResult.textWhileRecording, '', 'ordinary long recording does not write chunk text during recording');
    assert.ok(longRecordingResult.chunkCalls >= 3, `long recording is submitted as multiple ASR chunks: ${JSON.stringify(longRecordingResult)}`);
    assert.equal(longRecordingResult.text, '', 'ordinary long recording does not write merged text into composer');
    assert.equal(longRecordingResult.taskCount, 1, 'long recording still creates one visible speech task');
    assert.equal(longRecordingResult.taskTitle, '分片1\n分片2\n分片3', 'long recording task stores combined text');
    assert.equal(longRecordingResult.fullTaskText, '分片1\n分片2\n分片3', 'retained long recording task stores combined transcript');
    assert.equal(longRecordingResult.taskAudioBytes, 0, 'successful speech task does not retain a standalone audio blob');
    assert.equal(longRecordingResult.sourceMessageFilename, 'speech-message.wav', 'successful speech task references the sent message audio file');
    assert.equal(longRecordingResult.sourceAudioMimeType, 'audio/wav', 'successful speech task records the source audio mime type');
    assert.equal(longRecordingResult.chunkCount, longRecordingResult.chunkCalls, 'retained task records the internal chunk count without creating chunk tasks');

    const polishedLongRecordingResult = await evaluate(client, `(async () => {
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      window.__speechSmoke.aiRequests = [];
      window.__speechSmoke.failAiPolish = false;
      window.__speechSmoke.chunkDurationMs = 100;
      window.__speechSmoke.chunkTextPrefix = '润色分片';
      window.__speechSmoke.transcribeChunkCallCount = 0;
      window.__speechSmoke.nextSampleCount = 4800;
      document.querySelector('#speech-to-text-polish-enabled').checked = true;
      document.querySelector('#speech-to-text-polish-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#speech-to-text-polish-action').value = 'polish';
      document.querySelector('#speech-to-text-polish-action').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#save-settings')?.click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
          if (saved.polish_enabled === true && saved.polish_action_id === 'polish') resolve();
          else if (Date.now() - start > 2500) reject(new Error('long speech polish setting was not saved'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const beforeCalls = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').length;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('polished long recording did not enter recording state'));
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
          const sent = window.__speechSmoke.calls.some(
            (call) => call.command === 'send_speech_message' && call.args?.request?.transcript === '润色：润色分片1\\n润色分片2\\n润色分片3',
          );
          if (sent) resolve();
          else if (Date.now() - start > 3500) reject(new Error('polished long recording did not send final polished text'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const aiRequest = window.__speechSmoke.aiRequests.at(-1) || null;
      document.querySelector('#speech-to-text-polish-enabled').checked = false;
      document.querySelector('#speech-to-text-polish-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#save-settings')?.click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
          if (saved.polish_enabled === false) resolve();
          else if (Date.now() - start > 2500) reject(new Error('long speech polish disable was not saved'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.__speechSmoke.chunkDurationMs = 0;
      window.__speechSmoke.chunkTextPrefix = '';
      window.__speechSmoke.transcribeChunkCallCount = 0;
      return {
        callsWhileRecording,
        textWhileRecording,
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        sendTranscript: window.__speechSmoke.calls.filter((call) => call.command === 'send_speech_message').at(-1)?.args?.request?.transcript || '',
        aiRequest,
        aiRequestCount: window.__speechSmoke.aiRequests.length,
      };
    })()`);
    assert.ok(polishedLongRecordingResult.callsWhileRecording > 0, 'polished long recording still transcribes chunks during recording');
    assert.equal(polishedLongRecordingResult.textWhileRecording, '', 'polished long recording does not write chunk text during recording');
    assert.equal(polishedLongRecordingResult.aiRequestCount, 1, 'polished long recording runs polish once after all chunks are complete');
    assert.equal(polishedLongRecordingResult.aiRequest.text, '润色分片1\n润色分片2\n润色分片3', 'polished long recording sends the complete transcript to AI');
    assert.equal(polishedLongRecordingResult.text, '', 'polished long recording does not insert one final polished transcript');
    assert.equal(polishedLongRecordingResult.sendTranscript, '润色：润色分片1\n润色分片2\n润色分片3', 'polished long recording sends one final polished transcript');

    const blankAllChunkFallbackResult = await evaluate(client, `(async () => {
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      window.__speechSmoke.chunkDurationMs = 100;
      window.__speechSmoke.chunkTextPrefix = '空分片';
      window.__speechSmoke.blankAllChunkRequests = true;
      window.__speechSmoke.transcribeChunkCallCount = 0;
      window.__speechSmoke.nextSampleCount = 3200;
      const beforeCalls = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').length;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('blank-all fallback recording did not enter recording state'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((r) => setTimeout(r, 80));
      window.__speechSmoke.blankAllChunkRequests = false;
      window.__speechSmoke.chunkTextPrefix = '';
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const sent = window.__speechSmoke.sentMessages.some(
            (message) => message.content === window.__speechSmoke.longText,
          );
          if (sent) resolve();
          else if (Date.now() - start > 3000) reject(new Error('blank-all chunk fallback did not send full transcription'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const title = document.querySelector('.speech-task-item .speech-task-text')?.getAttribute('title') || '';
          if (title === window.__speechSmoke.longText) resolve();
          else if (Date.now() - start > 4000) reject(new Error('blank-all fallback task title was not updated'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const calls = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').slice(beforeCalls);
      const result = {
        callCount: calls.length,
        requestBytes: calls.map((call) => call.args?.request?.audioData?.length || 0),
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        sendTranscript: window.__speechSmoke.calls.filter((call) => call.command === 'send_speech_message').at(-1)?.args?.request?.transcript || '',
        taskTitle: document.querySelector('.speech-task-item .speech-task-text')?.getAttribute('title') || '',
        longText: window.__speechSmoke.longText,
      };
      window.__speechSmoke.chunkDurationMs = 0;
      window.__speechSmoke.chunkTextPrefix = '';
      window.__speechSmoke.blankAllChunkRequests = false;
      return result;
    })()`);
    assert.ok(blankAllChunkFallbackResult.callCount >= 3, 'blank live chunks fall back to a full-audio ASR request');
    assert.ok(
      blankAllChunkFallbackResult.requestBytes.at(-1) > Math.min(...blankAllChunkFallbackResult.requestBytes.slice(0, -1)),
      'blank live chunk fallback sends the retained full recording, not another chunk',
    );
    assert.equal(blankAllChunkFallbackResult.text, '', 'full-audio fallback does not insert text into composer');
    assert.equal(blankAllChunkFallbackResult.sendTranscript, blankAllChunkFallbackResult.longText, 'full-audio fallback sends text when live chunks are blank');
    assert.equal(blankAllChunkFallbackResult.taskTitle, blankAllChunkFallbackResult.longText, 'full-audio fallback stores task text');

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
          const sent = window.__speechSmoke.calls.some(
            (call) => call.command === 'send_speech_message' && call.args?.request?.transcript === '有效1\\n有效3',
          );
          if (/(语音识别完成|本地耗时)/.test(status) && sent) resolve();
          else if (/语音识别失败/.test(status)) reject(new Error(status));
          else if (Date.now() - start > 2500) reject(new Error('blank chunk recording did not send message'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const calls = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').slice(beforeCalls);
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const title = document.querySelector('.speech-task-item .speech-task-text')?.getAttribute('title') || '';
          if (title.includes('有效1') && title.includes('有效3')) resolve();
          else if (Date.now() - start > 4000) reject(new Error('blank chunk task title was not updated'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const taskItems = Array.from(document.querySelectorAll('.speech-task-item'));
      const result = {
        chunkCalls: calls.length,
        status: document.querySelector('#sync-status')?.textContent || '',
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        sendTranscript: window.__speechSmoke.calls.filter((call) => call.command === 'send_speech_message').at(-1)?.args?.request?.transcript || '',
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
    assert.equal(blankChunkResult.text, '', 'blank middle chunk is not written into the composer');
    assert.equal(blankChunkResult.sendTranscript, '有效1\n有效3', 'blank middle chunk is skipped while surrounding chunk text is preserved');
    assert.equal(blankChunkResult.taskCount, blankChunkResult.beforeTaskCount + 1, 'blank middle chunk still adds only one visible speech task');
    assert.equal(blankChunkResult.taskTitle, '有效1\n有效3', 'speech task stores the combined nonblank transcript');

    const hallucinatedChunkResult = await evaluate(client, `(async () => {
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      window.__speechSmoke.chunkDurationMs = 100;
      window.__speechSmoke.chunkTextPrefix = '正常';
      window.__speechSmoke.repeatedChunkNumbers = [2];
      window.__speechSmoke.repeatedPhraseChunkNumbers = [3];
      window.__speechSmoke.transcribeChunkCallCount = 0;
      window.__speechSmoke.nextSampleCount = 6400;
      const beforeCalls = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').length;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('hallucinated chunk recording did not enter recording state'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((r) => setTimeout(r, 80));
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          const idle = !button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing');
          const sent = window.__speechSmoke.calls.some(
            (call) => call.command === 'send_speech_message' && call.args?.request?.transcript === '正常1\\n正常4',
          );
          if (sent && idle) resolve();
          else if (Date.now() - start > 2500) reject(new Error('hallucinated chunk recording did not complete'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const calls = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').slice(beforeCalls);
      const result = {
        chunkCalls: calls.length,
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        sendTranscript: window.__speechSmoke.calls.filter((call) => call.command === 'send_speech_message').at(-1)?.args?.request?.transcript || '',
      };
      window.__speechSmoke.chunkDurationMs = 0;
      window.__speechSmoke.chunkTextPrefix = '';
      window.__speechSmoke.repeatedChunkNumbers = [];
      window.__speechSmoke.repeatedPhraseChunkNumbers = [];
      return result;
    })()`);
    assert.equal(hallucinatedChunkResult.chunkCalls, 4, 'pathological repeated chunks are detected after ASR returns');
    assert.equal(hallucinatedChunkResult.text, '', 'pathological repeated single-character and phrase text is not inserted');
    assert.equal(hallucinatedChunkResult.sendTranscript, '正常1\n正常4', 'pathological repeated single-character and phrase text is sent');

    const silentChunkResult = await evaluate(client, `(async () => {
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      window.__speechSmoke.chunkDurationMs = 100;
      window.__speechSmoke.chunkTextPrefix = '静音';
      window.__speechSmoke.transcribeChunkCallCount = 0;
      window.__speechSmoke.nextSampleCount = 3200;
      window.__speechSmoke.silentSamples = true;
      const beforeCalls = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').length;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('silent recording did not enter recording state'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((r) => setTimeout(r, 80));
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((r) => setTimeout(r, 120));
      const result = {
        callDelta: window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').length - beforeCalls,
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
      };
      window.__speechSmoke.chunkDurationMs = 0;
      window.__speechSmoke.chunkTextPrefix = '';
      window.__speechSmoke.silentSamples = false;
      return result;
    })()`);
    assert.equal(silentChunkResult.callDelta, 0, 'silent long-recording chunks are not sent to ASR');
    assert.equal(silentChunkResult.text, '', 'silent long-recording chunks do not insert hallucinated text');

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
      document.querySelector('#speech-to-text-cue-sound-kind').value = 'double';
      document.querySelector('#speech-to-text-cue-sound-kind').dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
      const beforeCues = window.__speechSmoke.cueSounds.length;
      const beforeRequests = window.__speechSmoke.mediaRequests.length;
      const beforeSaves = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').length;
      document.querySelector('#speech-to-text-cue-sound-preview').click();
      await new Promise((r) => setTimeout(r, 40));
      const cues = window.__speechSmoke.cueSounds.slice(beforeCues);
      const optionValues = Array.from(document.querySelector('#speech-to-text-cue-sound-kind')?.options || []).map((option) => option.value);
      return {
        cueDelta: window.__speechSmoke.cueSounds.length - beforeCues,
        requestDelta: window.__speechSmoke.mediaRequests.length - beforeRequests,
        saveDelta: window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').length - beforeSaves,
        previewDisabled: document.querySelector('#speech-to-text-cue-sound-preview').disabled,
        selectedKind: document.querySelector('#speech-to-text-cue-sound-kind').value,
        optionValues,
        cues,
      };
    })()`);
    assert.equal(cuePreviewResult.cueDelta, 2, 'double-beat cue preview plays two cue tones');
    assert.equal(cuePreviewResult.previewDisabled, false, 'cue preview button is enabled when cue sounds are enabled');
    assert.equal(cuePreviewResult.requestDelta, 0, 'cue preview does not start microphone recording');
    assert.equal(cuePreviewResult.saveDelta, 0, 'cue preview does not save settings');
    assert.equal(cuePreviewResult.selectedKind, 'double', 'cue settings include the new double-beat cue option');
    assert.ok(cuePreviewResult.optionValues.includes('double-bright'), 'cue settings include the bright double-beat option');
    assert.ok(cuePreviewResult.optionValues.includes('double-soft'), 'cue settings include the soft double-beat option');
    assert.deepEqual(cuePreviewResult.cues.map((cue) => cue.type), ['sine', 'sine'], 'double-beat cue uses two short sine tones');
    assert.deepEqual(cuePreviewResult.cues.map((cue) => cue.frequency), [720, 980], 'double-beat cue preview uses the two-tone start profile');

    const brightCuePreviewResult = await evaluate(client, `(async () => {
      document.querySelector('#speech-to-text-cue-sound-kind').value = 'double-bright';
      document.querySelector('#speech-to-text-cue-sound-kind').dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 40));
      const beforeCues = window.__speechSmoke.cueSounds.length;
      document.querySelector('#speech-to-text-cue-sound-preview').click();
      await new Promise((r) => setTimeout(r, 40));
      return { cues: window.__speechSmoke.cueSounds.slice(beforeCues) };
    })()`);
    assert.deepEqual(brightCuePreviewResult.cues.map((cue) => cue.frequency), [880, 1180], 'bright double-beat cue preview uses its own two-tone profile');

    const cueSaveResult = await evaluate(client, `(async () => {
      document.querySelector('#speech-to-text-cue-sound-kind').value = 'double-soft';
      document.querySelector('#speech-to-text-cue-sound-kind').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#save-settings')?.click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
          if (saved.cue_sound_kind === 'double-soft') resolve();
          else if (Date.now() - start > 2500) reject(new Error('new cue sound kind was not saved'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
      return { saved };
    })()`);
    assert.equal(cueSaveResult.saved.cue_sound_kind, 'double-soft', 'another double-beat cue sound kind is saved');

    const removedShortcutUiResult = await evaluate(client, `(async () => {
      return {
        shortcutToggleExists: !!document.querySelector('#speech-to-text-shortcut-enabled'),
        shortcutInputExists: !!document.querySelector('#speech-to-text-shortcut'),
        systemShortcutValue: document.querySelector('#system-dictation-shortcut')?.value || '',
      };
    })()`);
    assert.equal(removedShortcutUiResult.shortcutToggleExists, false, 'ordinary speech shortcut toggle is removed');
    assert.equal(removedShortcutUiResult.shortcutInputExists, false, 'ordinary speech shortcut input is removed');
    assert.equal(removedShortcutUiResult.systemShortcutValue, 'right-alt', 'system dictation accepts right Alt as its shortcut');

    const systemShortcutSaveResult = await evaluate(client, `(async () => {
      document.querySelector('#system-dictation-enabled').checked = true;
      document.querySelector('#system-dictation-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      const beforeSaves = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').length;
      const shortcutInput = document.querySelector('#system-dictation-shortcut');
      shortcutInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      shortcutInput.focus();
      shortcutInput.click();
      const captureValue = shortcutInput.value;
      const captureClass = shortcutInput.classList.contains('is-capturing-shortcut');
      shortcutInput.dispatchEvent(new KeyboardEvent('keydown', { code: 'AltRight', key: 'Alt', altKey: true, bubbles: true }));
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const saveCalls = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings');
          if (saveCalls.length > beforeSaves) resolve();
          else if (Date.now() - start > 2500) reject(new Error('right Alt system dictation shortcut was not saved'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
      return { captureValue, captureClass, inputValue: shortcutInput.value, saved };
    })()`);
    assert.equal(systemShortcutSaveResult.captureValue, '请按下快捷键...', 'shortcut input enters capture mode on focus');
    assert.equal(systemShortcutSaveResult.captureClass, true, 'shortcut input shows capture state');
    assert.equal(systemShortcutSaveResult.inputValue, 'right-alt', 'captured right Alt is shown in shortcut input');
    assert.equal(systemShortcutSaveResult.saved.shortcut_enabled, false, 'ordinary speech shortcut remains disabled when settings are saved');
    assert.equal(systemShortcutSaveResult.saved.enabled, true, 'system dictation enables speech-to-text when saved');
    assert.equal(systemShortcutSaveResult.saved.system_dictation_enabled, true, 'system dictation enabled flag is saved');
    assert.equal(systemShortcutSaveResult.saved.system_dictation_shortcut, 'right-alt', 'right Alt is saved as the system dictation shortcut');

    const comboShortcutCaptureResult = await evaluate(client, `(async () => {
      const beforeSaves = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').length;
      const shortcutInput = document.querySelector('#system-dictation-shortcut');
      shortcutInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      shortcutInput.focus();
      shortcutInput.click();
      shortcutInput.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd', altKey: true, bubbles: true }));
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const saveCalls = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings');
          if (saveCalls.length > beforeSaves) resolve();
          else if (Date.now() - start > 2500) reject(new Error('combo system dictation shortcut was not saved'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
      return { inputValue: shortcutInput.value, saved };
    })()`);
    assert.equal(comboShortcutCaptureResult.inputValue, 'alt+d', 'captured Alt+D is shown in shortcut input');
    assert.equal(comboShortcutCaptureResult.saved.system_dictation_shortcut, 'alt+d', 'Alt+D is saved as the system dictation shortcut');

    const systemDictationOnlyResult = await evaluate(client, `(async () => {
      document.querySelector('#speech-to-text-enabled').checked = false;
      document.querySelector('#speech-to-text-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#system-dictation-enabled').checked = true;
      document.querySelector('#system-dictation-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#save-settings')?.click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
          if (saved.enabled === true && saved.system_dictation_enabled === true) resolve();
          else if (Date.now() - start > 2500) reject(new Error('system dictation did not force speech-to-text enabled on save'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      return window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
    })()`);
    assert.equal(systemDictationOnlyResult.enabled, true, 'system dictation saves speech-to-text as enabled');
    assert.equal(systemDictationOnlyResult.system_dictation_enabled, true, 'system dictation remains enabled when saved alone');

    const buttonRecordingResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing')) resolve();
          else if (Date.now() - start > 2500) reject(new Error('speech button did not return to idle before button recording test'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.transferGenieActions?.updateSettingsFormField?.('speechToTextCueSoundEnabled', true);
      document.querySelector('#speech-to-text-capture-system-audio').checked = false;
      document.querySelector('#speech-to-text-capture-system-audio').dispatchEvent(new Event('change', { bubbles: true }));
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      window.__speechSmoke.calls = [];
      window.__speechSmoke.sentMessages = [];
      window.__speechSmoke.longText = '语音识别文本'.repeat(400);
      const beforeRequests = window.__speechSmoke.mediaRequests.length;
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('speech button did not enter recording state'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const requestDelta = window.__speechSmoke.mediaRequests.length - beforeRequests;
      await new Promise((r) => setTimeout(r, 80));
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const bodyText = document.querySelector('.message-card .message-body')?.textContent || '';
          const hasSourceAudioControls = !!document.querySelector('.message-card .speech-source-audio-controls[controls]');
          const status = document.querySelector('#sync-status')?.textContent || '';
          if (window.__speechSmoke.calls.some((call) => call.command === 'send_speech_message') && bodyText && hasSourceAudioControls) resolve();
          else if (/语音识别失败/.test(status)) reject(new Error(status));
          else if (Date.now() - start > 2500) reject(new Error('button recognition did not render sent message'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const audio = document.querySelector('.message-card .speech-source-audio-controls');
          const sourceRequested = window.__speechSmoke.calls.some((call) => call.command === 'get_message_source_audio_file');
          if (audio && sourceRequested) resolve();
          else if (Date.now() - start > 2000) reject(new Error('source audio controls did not load'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      document.querySelector('.message-card .message-actions .button.primary.small.icon-only')?.click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const downloadCall = window.__speechSmoke.calls.find((call) => call.command === 'download_message_file');
          if (downloadCall?.args?.filename === 'speech-message.wav') resolve();
          else if (Date.now() - start > 2000) reject(new Error('source audio download did not start'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      return {
        requestDelta,
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        sendCall: window.__speechSmoke.calls.find((call) => call.command === 'send_speech_message')?.args?.request || null,
        messagePreview: document.querySelector('.message-card .message-body')?.textContent || '',
        hasAudioControls: !!document.querySelector('.message-card .speech-source-audio-controls[controls]'),
        messagePreviewLength: document.querySelector('.message-card .message-body')?.textContent.length || 0,
        hasFullTextAction: !!document.querySelector('.message-card .message-view-full-text'),
        sourceAudioRequested: window.__speechSmoke.calls.some((call) => call.command === 'get_message_source_audio_file'),
        sourceAudioDownloadRequested: window.__speechSmoke.calls.some(
          (call) => call.command === 'download_message_file' && call.args?.filename === 'speech-message.wav',
        ),
        longText: window.__speechSmoke.longText,
      };
    })()`);
    assert.equal(buttonRecordingResult.requestDelta, 1, 'speech button starts one microphone request');
    assert.equal(buttonRecordingResult.text, '', 'speech button does not keep recognized text in the composer');
    assert.equal(buttonRecordingResult.sendCall?.transcript, buttonRecordingResult.longText, 'speech completion sends the recognized text');
    assert.equal(buttonRecordingResult.sendCall?.mimeType, 'audio/wav', 'speech completion sends the source audio mime type');
    assert.match(buttonRecordingResult.messagePreview, /语音识别文本/, 'sent speech message shows the transcript in the feed');
    assert.equal(buttonRecordingResult.messagePreviewLength, 2003, 'feed text preview is limited for long messages');
    assert.equal(buttonRecordingResult.hasFullTextAction, true, 'long feed text exposes a full-text action');
    assert.equal(buttonRecordingResult.hasAudioControls, true, 'sent speech message exposes inline audio controls');
    assert.equal(buttonRecordingResult.sourceAudioRequested, true, 'source audio preview uses the linked message audio file');
    assert.equal(buttonRecordingResult.sourceAudioDownloadRequested, true, 'speech download button downloads the linked audio file');

    const speechPolishResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing')) resolve();
          else if (Date.now() - start > 2500) reject(new Error('speech button did not return to idle before polish test'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      window.__speechSmoke.aiRequests = [];
      window.__speechSmoke.failAiPolish = false;
      window.__speechSmoke.sentMessages = [];
      window.__speechSmoke.longText = '需要润色的语音文本';
      window.transferGenieActions?.updateSettingsFormField?.('aiEnabled', true);
      window.transferGenieActions?.updateSettingsFormField?.('aiBaseUrl', 'https://example.test/v1');
      window.transferGenieActions?.updateSettingsFormField?.('aiApiKey', 'ai-key');
      window.transferGenieActions?.updateSettingsFormField?.('aiModel', 'smoke-model');
      document.querySelector('#speech-to-text-polish-enabled').checked = true;
      document.querySelector('#speech-to-text-polish-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#speech-to-text-polish-action').value = 'formalize';
      document.querySelector('#speech-to-text-polish-action').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#save-settings')?.click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
          if (saved.polish_enabled === true && saved.polish_action_id === 'formalize') resolve();
          else if (Date.now() - start > 2500) reject(new Error('speech polish settings were not saved'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('polish recording did not start'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((r) => setTimeout(r, 80));
      document.querySelector('#speech-to-text-toggle').click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const sent = window.__speechSmoke.calls.some(
            (call) => call.command === 'send_speech_message' && call.args?.request?.transcript === '润色：需要润色的语音文本' && call.args?.request?.rawTranscript === '需要润色的语音文本',
          );
          if (sent) resolve();
          else if (Date.now() - start > 3000) reject(new Error('polished speech text was not sent'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const text = document.querySelector('.message-card[data-filename="speech-message.wav"] .message-body')?.textContent || '';
          if (text === '润色：需要润色的语音文本') resolve();
          else if (Date.now() - start > 2000) reject(new Error('polished speech message was not rendered in the feed'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const result = {
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        sendTranscript: window.__speechSmoke.calls.filter((call) => call.command === 'send_speech_message').at(-1)?.args?.request?.transcript || '',
        sendRawTranscript: window.__speechSmoke.calls.filter((call) => call.command === 'send_speech_message').at(-1)?.args?.request?.rawTranscript || '',
        clipboardText: window.__speechSmoke.clipboardText,
        aiRequest: window.__speechSmoke.aiRequests.at(-1),
        feedTextBeforeToggle: document.querySelector('.message-card[data-filename="speech-message.wav"] .message-body')?.textContent || '',
        hasTranscriptToggle: !!document.querySelector('.message-card[data-filename="speech-message.wav"] .speech-transcript-toggle'),
        saved,
        selectDisabled: document.querySelector('#speech-to-text-polish-action').disabled,
      };
      const speechCard = document.querySelector('.message-card[data-filename="speech-message.wav"]');
      const copySpeechText = async () => {
        Array.from(speechCard?.querySelectorAll('.message-actions button') || [])
          .find((button) => button.querySelector('img[alt="复制"]'))
          ?.click();
        await new Promise((resolve) => setTimeout(resolve, 20));
      };
      await copySpeechText();
      result.copiedPolishedText = window.__speechSmoke.clipboardText;
      document.querySelector('.message-card[data-filename="speech-message.wav"] .speech-transcript-toggle-button:nth-child(2)')?.click();
      result.feedTextAfterToggle = document.querySelector('.message-card[data-filename="speech-message.wav"] .message-body')?.textContent || '';
      await copySpeechText();
      result.copiedRawText = window.__speechSmoke.clipboardText;
      document.querySelector('.message-card[data-filename="speech-message.wav"] .speech-transcript-toggle-button:nth-child(1)')?.click();
      await copySpeechText();
      result.copiedPolishedAgainText = window.__speechSmoke.clipboardText;
      window.__speechSmoke.longText = '语音识别文本'.repeat(20);
      return result;
    })()`);
    assert.equal(speechPolishResult.saved.polish_enabled, true, 'speech polish enabled flag is saved');
    assert.equal(speechPolishResult.saved.polish_action_id, 'formalize', 'speech polish action id is saved');
    assert.equal(speechPolishResult.aiRequest.actionId, 'formalize', 'speech polish uses the selected AI action');
    assert.equal(speechPolishResult.aiRequest.text, '需要润色的语音文本', 'speech polish sends raw transcript to AI');
    assert.equal(speechPolishResult.text, '', 'speech polish does not insert polished text into composer');
    assert.equal(speechPolishResult.sendTranscript, '润色：需要润色的语音文本', 'speech polish sends polished text');
    assert.equal(speechPolishResult.sendRawTranscript, '需要润色的语音文本', 'speech polish sends raw transcript metadata');
    assert.equal(speechPolishResult.feedTextBeforeToggle, '润色：需要润色的语音文本', 'speech feed defaults to polished text');
    assert.equal(speechPolishResult.hasTranscriptToggle, true, 'speech feed exposes a raw/polished toggle');
    assert.equal(speechPolishResult.feedTextAfterToggle, '需要润色的语音文本', 'speech feed can switch to raw transcript');
    assert.equal(speechPolishResult.clipboardText, '润色：需要润色的语音文本', 'speech polish copies polished text after completion');
    assert.equal(speechPolishResult.copiedPolishedText, '润色：需要润色的语音文本', 'copy action follows the polished transcript mode');
    assert.equal(speechPolishResult.copiedRawText, '需要润色的语音文本', 'copy action follows the raw transcript mode');
    assert.equal(speechPolishResult.copiedPolishedAgainText, '润色：需要润色的语音文本', 'copy action returns to polished text after switching back');
    assert.equal(speechPolishResult.selectDisabled, false, 'speech polish action selector is enabled when polish is enabled');

    const systemDictationResult = await evaluate(client, `(async () => {
      document.querySelector('#speech-to-text-polish-enabled').checked = false;
      document.querySelector('#speech-to-text-polish-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#save-settings')?.click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
          if (saved.polish_enabled === false) resolve();
          else if (Date.now() - start > 2500) reject(new Error('speech polish setting was not disabled before raw dictation test'));
          else setTimeout(tick, 20);
        };
        tick();
      });
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
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      window.__speechSmoke.pastedText = '';
      window.__speechSmoke.clipboardText = '';
      window.__speechSmoke.calls = [];
      window.__speechSmoke.sendSpeechDelayMs = 120;
      const cueCountBeforeToggle = window.__speechSmoke.cueSounds.length;
      document.activeElement?.blur?.();
      document.querySelector('.tab-button[data-tab-target="home"]')?.focus();
      await new Promise((r) => setTimeout(r, 30));
      document.querySelector('#system-dictation-enabled').checked = true;
      document.querySelector('#system-dictation-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('system dictation did not start recording'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((r) => setTimeout(r, 80));
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (window.__speechSmoke.pastedText === window.__speechSmoke.longText) resolve();
          else if (Date.now() - start > 1500) reject(new Error('system dictation did not paste immediately after transcription'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const sent = window.__speechSmoke.sentMessages.some(
            (message) => message.content === window.__speechSmoke.longText,
          );
          if (sent && window.__speechSmoke.pastedText === window.__speechSmoke.longText) resolve();
          else if (Date.now() - start > 2500) reject(new Error('system dictation did not send and paste message: ' + JSON.stringify({
            pastedText: window.__speechSmoke.pastedText,
            clipboardText: window.__speechSmoke.clipboardText,
            draftText: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
            status: document.querySelector('#sync-status')?.textContent || '',
            lastCommands: window.__speechSmoke.calls.slice(-12).map((call) => call.command),
          })));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const calls = window.__speechSmoke.calls.map((call) => call.command);
      return {
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        pastedText: window.__speechSmoke.pastedText,
        clipboardText: window.__speechSmoke.clipboardText,
        sendTranscript: window.__speechSmoke.calls.filter((call) => call.command === 'send_speech_message').at(-1)?.args?.request?.transcript || '',
        pasteCount: calls.filter((command) => command === 'paste_dictation_text').length,
        pasteBeforeSend: calls.indexOf('paste_dictation_text') >= 0 && calls.indexOf('send_speech_message') >= 0 && calls.indexOf('paste_dictation_text') < calls.indexOf('send_speech_message'),
        cueDelta: window.__speechSmoke.cueSounds.length - cueCountBeforeToggle,
        showCount: calls.filter((command) => command === 'show_system_dictation_window').length,
        hideCount: calls.filter((command) => command === 'hide_system_dictation_window').length,
        levelCount: calls.filter((command) => command === 'set_system_dictation_level').length,
        longText: window.__speechSmoke.longText,
      };
    })()`);
    assert.equal(systemDictationResult.text, '', 'shortcut speech does not append text to Transfer Genie composer');
    assert.equal(systemDictationResult.pastedText, systemDictationResult.longText, 'shortcut speech pastes recognized text into the focused app');
    assert.equal(systemDictationResult.clipboardText, systemDictationResult.longText, 'shortcut speech copies recognized text before pasting');
    assert.equal(systemDictationResult.pasteCount, 1, 'shortcut speech calls the paste command immediately');
    assert.equal(systemDictationResult.pasteBeforeSend, true, 'shortcut speech starts paste before background message send');
    assert.equal(systemDictationResult.sendTranscript, systemDictationResult.longText, 'shortcut speech sends recognized text as a message');
    assert.equal(systemDictationResult.cueDelta, 4, 'system dictation plays the selected double-beat start and stop cue sounds');
    assert.ok(systemDictationResult.showCount >= 1, 'system dictation shows the capsule window');
    assert.ok(systemDictationResult.hideCount >= 1, 'system dictation hides the capsule window after confirm');
    assert.ok(systemDictationResult.levelCount >= 1, 'system dictation updates waveform level');

    const polishedSystemDictationResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing')) resolve();
          else if (Date.now() - start > 2500) reject(new Error('speech button did not return to idle before polished dictation test'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      window.__speechSmoke.pastedText = '';
      window.__speechSmoke.clipboardText = '';
      window.__speechSmoke.aiRequests = [];
      window.__speechSmoke.systemDictationStatus = '';
      window.__speechSmoke.calls = [];
      window.__speechSmoke.sendSpeechDelayMs = 120;
      window.__speechSmoke.longText = '系统听写润色原文';
      document.querySelector('#speech-to-text-polish-enabled').checked = true;
      document.querySelector('#speech-to-text-polish-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#speech-to-text-polish-action').value = 'polish';
      document.querySelector('#speech-to-text-polish-action').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#save-settings')?.click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
          if (saved.polish_enabled === true && saved.polish_action_id === 'polish') resolve();
          else if (Date.now() - start > 2500) reject(new Error('polished dictation settings were not saved'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      document.activeElement?.blur?.();
      document.querySelector('.tab-button[data-tab-target="home"]')?.focus();
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('polished system dictation did not start'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((r) => setTimeout(r, 80));
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (window.__speechSmoke.pastedText === '润色：系统听写润色原文') resolve();
          else if (Date.now() - start > 1500) reject(new Error('polished shortcut speech did not paste immediately'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const sent = window.__speechSmoke.sentMessages.some(
            (message) => message.content === '润色：系统听写润色原文',
          );
          if (sent && window.__speechSmoke.pastedText === '润色：系统听写润色原文') resolve();
          else if (Date.now() - start > 3500) reject(new Error('polished shortcut speech did not send: ' + JSON.stringify({
            pastedText: window.__speechSmoke.pastedText,
            clipboardText: window.__speechSmoke.clipboardText,
            draftText: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
            aiRequests: window.__speechSmoke.aiRequests,
            settingsForm: window.transferGenieVue?.store?.settingsForm,
            statusCalls: window.__speechSmoke.calls.filter((call) => call.command === 'set_system_dictation_status').map((call) => call.args?.text || ''),
            pasteCalls: window.__speechSmoke.calls.filter((call) => call.command === 'paste_dictation_text').length,
            lastCommands: window.__speechSmoke.calls.slice(-12).map((call) => call.command),
            status: document.querySelector('#sync-status')?.textContent || '',
          })));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const statusCalls = window.__speechSmoke.calls.filter((call) => call.command === 'set_system_dictation_status').map((call) => call.args?.text || '');
      const result = {
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        pastedText: window.__speechSmoke.pastedText,
        clipboardText: window.__speechSmoke.clipboardText,
        sendTranscript: window.__speechSmoke.calls.filter((call) => call.command === 'send_speech_message').at(-1)?.args?.request?.transcript || '',
        aiRequest: window.__speechSmoke.aiRequests.at(-1),
        statusCalls,
      };
      window.__speechSmoke.longText = '语音识别文本'.repeat(20);
      return result;
    })()`);
    assert.equal(polishedSystemDictationResult.text, '', 'polished shortcut speech does not append text to Transfer Genie composer');
    assert.equal(polishedSystemDictationResult.pastedText, '润色：系统听写润色原文', 'polished shortcut speech pastes text immediately');
    assert.equal(polishedSystemDictationResult.clipboardText, '润色：系统听写润色原文', 'polished shortcut speech copies text before pasting');
    assert.equal(polishedSystemDictationResult.sendTranscript, '润色：系统听写润色原文', 'polished shortcut speech sends polished text as a message');
    assert.equal(polishedSystemDictationResult.aiRequest.actionId, 'polish', 'polished system dictation uses configured polish action');
    assert.ok(polishedSystemDictationResult.statusCalls.includes('正在进行润色'), 'system dictation shows polishing status');
    assert.equal(polishedSystemDictationResult.statusCalls.at(-1), '润色：系统听写润色原文', 'system dictation displays the final polished result after output');

    const failedPolishResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing')) resolve();
          else if (Date.now() - start > 2500) reject(new Error('speech button did not return to idle before polish failure test'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      window.__speechSmoke.failAiPolish = true;
      window.__speechSmoke.pastedText = '';
      window.__speechSmoke.calls = [];
      window.__speechSmoke.sendSpeechDelayMs = 120;
      window.__speechSmoke.longText = '润色失败后保留原文';
      document.querySelector('#speech-to-text-polish-enabled').checked = true;
      document.querySelector('#speech-to-text-polish-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#save-settings')?.click();
      document.activeElement?.blur?.();
      document.querySelector('.tab-button[data-tab-target="home"]')?.focus();
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('polish failure dictation did not start'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((r) => setTimeout(r, 80));
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (window.__speechSmoke.pastedText === '润色失败后保留原文') resolve();
          else if (Date.now() - start > 1500) reject(new Error('polish failure dictation did not paste immediately'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const sent = window.__speechSmoke.sentMessages.some(
            (message) => message.content === '润色失败后保留原文',
          );
          if (sent && window.__speechSmoke.pastedText === '润色失败后保留原文') resolve();
          else if (Date.now() - start > 3500) reject(new Error('polish failure did not send raw transcript'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.__speechSmoke.failAiPolish = false;
      document.querySelector('#speech-to-text-polish-enabled').checked = false;
      document.querySelector('#speech-to-text-polish-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#save-settings')?.click();
      window.__speechSmoke.longText = '语音识别文本'.repeat(20);
      return {
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        pastedText: window.__speechSmoke.pastedText,
        clipboardText: window.__speechSmoke.clipboardText,
        sendTranscript: window.__speechSmoke.calls.filter((call) => call.command === 'send_speech_message').at(-1)?.args?.request?.transcript || '',
      };
    })()`);
    assert.equal(failedPolishResult.text, '', 'failed shortcut polish does not append text to Transfer Genie composer');
    assert.equal(failedPolishResult.pastedText, '润色失败后保留原文', 'failed shortcut polish pastes raw text immediately');
    assert.equal(failedPolishResult.clipboardText, '润色失败后保留原文', 'failed shortcut polish copies raw text before pasting');
    assert.equal(failedPolishResult.sendTranscript, '润色失败后保留原文', 'failed shortcut polish keeps and sends the raw transcript');

    const noFocusDictationResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing')) resolve();
          else if (Date.now() - start > 2500) reject(new Error('speech button did not idle before no-focus dictation test'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.__speechSmoke.pastedText = '';
      window.__speechSmoke.clipboardText = '';
      window.__speechSmoke.calls = [];
      window.__speechSmoke.sentMessages = [];
      window.__speechSmoke.pasteWithoutFocus = true;
      window.__speechSmoke.focusDetectedAtDictationStart = false;
      window.__speechSmoke.longText = '没有系统焦点的识别结果';
      document.activeElement?.blur?.();
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('no-focus dictation did not start'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((r) => setTimeout(r, 80));
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const status = window.__speechSmoke.calls.find(
            (call) => call.command === 'set_system_dictation_status' && call.args?.text === '没有系统焦点的识别结果',
          );
          if (status && window.__speechSmoke.clipboardText === '没有系统焦点的识别结果') resolve();
          else if (Date.now() - start > 2500) reject(new Error('no-focus dictation result was not copied and shown'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const sent = window.__speechSmoke.sentMessages.some(
            (message) => message.content === '没有系统焦点的识别结果',
          );
          if (sent) resolve();
          else if (Date.now() - start > 2500) reject(new Error('no-focus dictation message was not sent'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const result = {
        pastedText: window.__speechSmoke.pastedText,
        clipboardText: window.__speechSmoke.clipboardText,
        pasteCount: window.__speechSmoke.calls.filter((call) => call.command === 'paste_dictation_text').length,
        statusCall: window.__speechSmoke.calls.find(
          (call) => call.command === 'set_system_dictation_status' && call.args?.text === '没有系统焦点的识别结果',
        )?.args || null,
      };
      window.__speechSmoke.pasteWithoutFocus = false;
      window.__speechSmoke.focusDetectedAtDictationStart = true;
      window.__speechSmoke.longText = '语音识别文本'.repeat(20);
      return result;
    })()`);
    assert.equal(noFocusDictationResult.pastedText, '', 'no-focus dictation does not claim a paste target');
    assert.equal(noFocusDictationResult.clipboardText, '没有系统焦点的识别结果', 'no-focus dictation automatically copies the result');
    assert.equal(noFocusDictationResult.pasteCount, 1, 'shortcut dictation attempts one paste regardless of initial focus detection');
    assert.equal(noFocusDictationResult.statusCall?.text, '没有系统焦点的识别结果', 'no-focus capsule displays the copied result text');
    assert.equal(noFocusDictationResult.statusCall?.copyText, '没有系统焦点的识别结果', 'no-focus capsule receives the result for its copy button');

    const failedPasteDictationResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing')) resolve();
          else if (Date.now() - start > 2500) reject(new Error('speech button did not idle before failed-paste dictation test'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.__speechSmoke.pastedText = '';
      window.__speechSmoke.clipboardText = '';
      window.__speechSmoke.calls = [];
      window.__speechSmoke.sentMessages = [];
      window.__speechSmoke.focusDetectedAtDictationStart = true;
      window.__speechSmoke.pasteReturnsNoPaste = true;
      window.__speechSmoke.longText = '粘贴失败时的识别结果';
      document.querySelector('.cw-textarea, #text-input')?.focus();
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('failed-paste dictation did not start'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((resolve) => setTimeout(resolve, 80));
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const status = window.__speechSmoke.calls.find(
            (call) => call.command === 'set_system_dictation_status' && call.args?.text === '粘贴失败时的识别结果',
          );
          if (status && window.__speechSmoke.clipboardText === '粘贴失败时的识别结果') resolve();
          else if (Date.now() - start > 2500) reject(new Error('failed-paste dictation result was not copied and shown'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const result = {
        pastedText: window.__speechSmoke.pastedText,
        clipboardText: window.__speechSmoke.clipboardText,
        pasteCount: window.__speechSmoke.calls.filter((call) => call.command === 'paste_dictation_text').length,
        statusCall: window.__speechSmoke.calls.find(
          (call) => call.command === 'set_system_dictation_status' && call.args?.text === '粘贴失败时的识别结果',
        )?.args || null,
      };
      window.__speechSmoke.pasteReturnsNoPaste = false;
      window.__speechSmoke.longText = '语音识别文本'.repeat(20);
      return result;
    })()`);
    assert.equal(failedPasteDictationResult.pastedText, '', 'failed paste does not claim that text reached the input');
    assert.equal(failedPasteDictationResult.clipboardText, '粘贴失败时的识别结果', 'failed paste still copies the result');
    assert.equal(failedPasteDictationResult.pasteCount, 1, 'failed paste attempts the captured input once');
    assert.equal(failedPasteDictationResult.statusCall?.text, '粘贴失败时的识别结果', 'failed paste displays the copied result text');
    assert.equal(failedPasteDictationResult.statusCall?.copyText, '粘贴失败时的识别结果', 'failed paste keeps the result available in the capsule');

    const focusedComposerDictationResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('speech button did not return to idle before focused composer dictation test'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      window.__speechSmoke.pastedText = '';
      window.__speechSmoke.clipboardText = '';
      window.__speechSmoke.calls = [];
      window.__speechSmoke.sendSpeechDelayMs = 120;
      window.__speechSmoke.longText = '当前编辑器焦点识别结果';
      document.querySelector('#speech-to-text-polish-enabled').checked = true;
      document.querySelector('#speech-to-text-polish-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#speech-to-text-polish-action').value = 'formalize';
      document.querySelector('#speech-to-text-polish-action').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#save-settings')?.click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
          if (saved.polish_enabled === true && saved.polish_action_id === 'formalize') resolve();
          else if (Date.now() - start > 2500) reject(new Error('speech polish setting was not enabled before focused composer dictation test'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const beforePasteCalls = window.__speechSmoke.calls.filter((call) => call.command === 'paste_dictation_text').length;
      const focusedInput = document.querySelector('.cw-textarea, #text-input');
      window.__speechSmoke.focusCaptureCount = 0;
      window.__speechSmoke.overlayFocusStealCount = 0;
      window.__speechSmoke.stealFocusOnOverlayShow = true;
      focusedInput?.focus();
      if (typeof focusedInput?.setSelectionRange === 'function') focusedInput.setSelectionRange(0, 0);
      await new Promise((r) => setTimeout(r, 30));
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('system dictation did not start with composer focused'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((r) => setTimeout(r, 30));
      const activeAfterOverlayShown = document.activeElement;
      await new Promise((r) => setTimeout(r, 80));
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (window.__speechSmoke.pastedText === '润色：当前编辑器焦点识别结果') resolve();
          else if (Date.now() - start > 1500) reject(new Error('focused composer dictation did not paste immediately'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          const idle = !button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing');
          const sent = window.__speechSmoke.sentMessages.some(
            (message) => message.content === '润色：当前编辑器焦点识别结果',
          );
          if (sent && window.__speechSmoke.pastedText === '润色：当前编辑器焦点识别结果' && idle) resolve();
          else if (Date.now() - start > 2500) reject(new Error('focused composer dictation did not send message'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const afterPasteCalls = window.__speechSmoke.calls.filter((call) => call.command === 'paste_dictation_text').length;
      const selectionAfterPaste = typeof focusedInput?.selectionStart === 'number' ? focusedInput.selectionStart : null;
      const result = {
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        pastedText: window.__speechSmoke.pastedText,
        clipboardText: window.__speechSmoke.clipboardText,
        sendTranscript: window.__speechSmoke.calls.filter((call) => call.command === 'send_speech_message').at(-1)?.args?.request?.transcript || '',
        pasteDelta: afterPasteCalls - beforePasteCalls,
        focusCaptureCount: window.__speechSmoke.focusCaptureCount,
        overlayFocusStealCount: window.__speechSmoke.overlayFocusStealCount,
        activeAfterOverlayShownIsFocusedInput: activeAfterOverlayShown === focusedInput,
        activeAfterPasteIsFocusedInput: document.activeElement === focusedInput,
        selectionAfterPaste,
      };
      window.__speechSmoke.longText = '语音识别文本'.repeat(20);
      window.__speechSmoke.stealFocusOnOverlayShow = false;
      return result;
    })()`);
    assert.equal(focusedComposerDictationResult.text, '', 'shortcut dictation does not append text when Transfer Genie composer is focused');
    assert.equal(focusedComposerDictationResult.pastedText, '润色：当前编辑器焦点识别结果', 'shortcut dictation pastes polished text into the focused app immediately');
    assert.equal(focusedComposerDictationResult.clipboardText, '润色：当前编辑器焦点识别结果', 'shortcut dictation copies polished text before pasting when focused in Transfer Genie');
    assert.equal(focusedComposerDictationResult.pasteDelta, 1, 'shortcut dictation calls paste when Transfer Genie composer is focused');
    assert.equal(focusedComposerDictationResult.sendTranscript, '润色：当前编辑器焦点识别结果', 'shortcut dictation sends the polished focused composer text as a message');
    assert.equal(focusedComposerDictationResult.focusCaptureCount, 1, 'shortcut dictation captures the focused window before showing the overlay');
    assert.equal(focusedComposerDictationResult.overlayFocusStealCount, 1, 'focused-editor test simulates overlay webview focus loss');
    assert.equal(focusedComposerDictationResult.activeAfterOverlayShownIsFocusedInput, false, 'shortcut dictation records its editor target before overlay focus loss');
    assert.equal(focusedComposerDictationResult.activeAfterPasteIsFocusedInput, true, 'focused composer remains the paste target after dictation completes');
    assert.equal(focusedComposerDictationResult.selectionAfterPaste, 0, 'focused composer restores the captured caret before paste');

    const stalledOverlayDictationResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('speech button did not return to idle before stalled overlay test'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      window.__speechSmoke.pastedText = '';
      window.__speechSmoke.clipboardText = '';
      window.__speechSmoke.calls = [];
      window.__speechSmoke.sendSpeechDelayMs = 120;
      window.__speechSmoke.longText = '卡住窗口后的识别结果';
      window.__speechSmoke.hangOverlayInvokes = true;
      document.querySelector('#speech-to-text-polish-enabled').checked = false;
      document.querySelector('#speech-to-text-polish-enabled').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#save-settings')?.click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const saved = window.__speechSmoke.calls.filter((call) => call.command === 'save_settings').at(-1)?.args?.settings?.speech_to_text || {};
          if (saved.polish_enabled === false) resolve();
          else if (Date.now() - start > 2500) reject(new Error('stalled overlay polish disable was not saved'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      document.activeElement?.blur?.();
      document.querySelector('.tab-button[data-tab-target="home"]')?.focus();
      await new Promise((r) => setTimeout(r, 30));
      const beforeTranscribeCalls = window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').length;
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('system dictation did not start while overlay invoke is stalled'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((r) => setTimeout(r, 80));
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (window.__speechSmoke.pastedText === '卡住窗口后的识别结果') resolve();
          else if (Date.now() - start > 1500) reject(new Error('stalled overlay dictation did not paste immediately'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          const idle = !button.classList.contains('is-recording') && !button.classList.contains('is-transcribing') && !button.classList.contains('is-preparing');
          const sent = window.__speechSmoke.sentMessages.some(
            (message) => message.content === '卡住窗口后的识别结果',
          );
          if (sent && window.__speechSmoke.pastedText === '卡住窗口后的识别结果' && idle) resolve();
          else if (Date.now() - start > 2500) reject(new Error('stalled overlay system dictation did not send message'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const result = {
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        pastedText: window.__speechSmoke.pastedText,
        clipboardText: window.__speechSmoke.clipboardText,
        sendTranscript: window.__speechSmoke.calls.filter((call) => call.command === 'send_speech_message').at(-1)?.args?.request?.transcript || '',
        transcribeDelta: window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').length - beforeTranscribeCalls,
      };
      window.__speechSmoke.hangOverlayInvokes = false;
      window.__speechSmoke.longText = '语音识别文本'.repeat(20);
      return result;
    })()`);
    assert.equal(stalledOverlayDictationResult.text, '', 'shortcut dictation does not append text to Transfer Genie composer when overlay command is stalled and another target is focused');
    assert.equal(stalledOverlayDictationResult.pastedText, '卡住窗口后的识别结果', 'shortcut dictation pastes text immediately even when overlay command is stalled');
    assert.equal(stalledOverlayDictationResult.clipboardText, '卡住窗口后的识别结果', 'shortcut dictation copies text before pasting when overlay is stalled');
    assert.equal(stalledOverlayDictationResult.sendTranscript, '卡住窗口后的识别结果', 'shortcut dictation sends text even when overlay command is stalled');
    assert.equal(stalledOverlayDictationResult.transcribeDelta, 1, 'stalled overlay does not block transcription invoke');

    const systemDictationCancelResult = await evaluate(client, `(async () => {
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('speech button did not return to idle before cancel test'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      window.transferGenieComposerStore?.clearActiveDraftAfterSend?.();
      window.__speechSmoke.pastedText = '';
      window.__speechSmoke.sendSpeechDelayMs = 0;
      const beforePasteCalls = window.__speechSmoke.calls.filter((call) => call.command === 'paste_dictation_text').length;
      const beforeSendCalls = window.__speechSmoke.calls.filter((call) => call.command === 'send_speech_message').length;
      await window.__speechSmoke.eventHandlers['system-dictation-toggle']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector('#speech-to-text-toggle').classList.contains('is-recording')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('system dictation did not start before cancel'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      await window.__speechSmoke.eventHandlers['system-dictation-cancel']({ payload: null });
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          const button = document.querySelector('#speech-to-text-toggle');
          if (!button.classList.contains('is-recording') && !button.classList.contains('is-transcribing')) resolve();
          else if (Date.now() - start > 2000) reject(new Error('system dictation cancel did not return to idle'));
          else setTimeout(tick, 20);
        };
        tick();
      });
      const afterPasteCalls = window.__speechSmoke.calls.filter((call) => call.command === 'paste_dictation_text').length;
      const afterSendCalls = window.__speechSmoke.calls.filter((call) => call.command === 'send_speech_message').length;
      const calls = window.__speechSmoke.calls.map((call) => call.command);
      return {
        text: window.transferGenieComposerStore?.getActiveDraft?.()?.text || '',
        pastedText: window.__speechSmoke.pastedText,
        pasteDelta: afterPasteCalls - beforePasteCalls,
        sendDelta: afterSendCalls - beforeSendCalls,
        hideCount: calls.filter((command) => command === 'hide_system_dictation_window').length,
      };
    })()`);
    assert.equal(systemDictationCancelResult.text, '', 'system dictation cancel does not append text');
    assert.equal(systemDictationCancelResult.pastedText, '', 'system dictation cancel does not paste');
    assert.equal(systemDictationCancelResult.pasteDelta, 0, 'system dictation cancel does not call paste command');
    assert.equal(systemDictationCancelResult.sendDelta, 0, 'system dictation cancel does not send a message');
    assert.ok(systemDictationCancelResult.hideCount >= 1, 'system dictation cancel hides the capsule window');

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
          else if (Date.now() - start > 3000) reject(new Error('failed transcription did not surface: ' + JSON.stringify({
            status,
            transcribeCalls: window.__speechSmoke.calls.filter((call) => call.command === 'transcribe_speech').length,
            failTranscribe: window.__speechSmoke.failTranscribe,
            speechClasses: document.querySelector('#speech-to-text-toggle')?.className || '',
            failedItems: Array.from(document.querySelectorAll('.speech-task-item')).map((item) => item.className),
          })));
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
