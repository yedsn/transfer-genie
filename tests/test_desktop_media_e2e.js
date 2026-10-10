import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const ROOT = process.cwd();
const APP_EXE = join(ROOT, 'target', 'debug', 'transfer-genie.exe');
const FFMPEG = join(ROOT, 'tools', 'ffmpeg', 'ffmpeg.exe');
const APP_URL = 'http://127.0.0.1:7120/';
const BUNDLED_APP_URL = 'http://tauri.localhost/';

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitFor(check, label, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (_) { /* retry */ }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function killTree(pid) {
  if (!pid) return;
  await new Promise((resolve) => {
    const child = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    child.on('close', resolve);
    child.on('error', resolve);
  });
}

async function ensureDevServer() {
  try {
    if ((await fetch(APP_URL)).ok) return null;
  } catch (_) { /* start below */ }
  const child = spawn('cmd.exe', ['/c', 'npm', 'run', 'dev'], { cwd: ROOT, stdio: 'ignore', windowsHide: true });
  await waitFor(async () => {
    try { return (await fetch(APP_URL)).ok; } catch (_) { return false; }
  }, 'Vite dev server');
  return child;
}

function davServer() {
  const files = new Map();
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (request.method === 'PUT') { files.set(path, body); response.writeHead(201).end(); return; }
    if (request.method === 'MKCOL') { response.writeHead(201).end(); return; }
    if (request.method === 'DELETE') { response.writeHead(files.delete(path) ? 204 : 404).end(); return; }
    if (request.method === 'GET' || request.method === 'HEAD') {
      const value = files.get(path);
      if (!value) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'content-length': value.length, etag: `\"${value.length}-${path.length}\"` });
      if (request.method === 'GET') response.end(value); else response.end();
      return;
    }
    if (request.method === 'PROPFIND') {
      const prefix = path.replace(/\/+$/, '');
      const children = [...files.entries()]
        .filter(([name]) => name.startsWith(prefix ? `${prefix}/` : ''))
        .filter(([name]) => !name.slice(prefix.length + (prefix ? 1 : 0)).includes('/'))
        .map(([name, value]) => `<d:response><d:href>/${encodeURI(name)}</d:href><d:propstat><d:prop><d:displayname>${basename(name)}</d:displayname><d:getcontentlength>${value.length}</d:getcontentlength><d:getlastmodified>${new Date().toUTCString()}</d:getlastmodified><d:getetag>\"${value.length}-${name.length}\"</d:getetag><d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`)
        .join('');
      const xml = `<?xml version=\"1.0\"?><d:multistatus xmlns:d=\"DAV:\"><d:response><d:href>/${encodeURI(prefix)}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>${children}</d:multistatus>`;
      response.writeHead(207, { 'content-type': 'application/xml' }).end(xml);
      return;
    }
    response.writeHead(405).end();
  });
  return {
    files,
    async start() { await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}/`; },
    close() { return new Promise((resolve) => server.close(resolve)); },
  };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(`${command} failed (${code}): ${output}`)));
  });
}

async function createFixtures(dir) {
  mkdirSync(dir, { recursive: true });
  const png = join(dir, 'photo.png');
  const wav = join(dir, 'tone.wav');
  const mp3 = join(dir, 'tone.mp3');
  const mp4 = join(dir, 'movie.mp4');
  const webm = join(dir, 'movie.webm');
  const mkv = join(dir, 'unsupported.mkv');
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x2878dc:s=320x180', '-frames:v', '1', png, '-y']);
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=44100', '-t', '1.5', wav, '-y']);
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '5', mp3, '-y']);
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', mp4, '-y']);
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-t', '2', '-c:v', 'libvpx-vp9', '-b:v', '250k', webm, '-y']);
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-t', '1', '-c:v', 'ffv1', mkv, '-y']);
  return { png, wav, mp3, mp4, webm, mkv };
}

async function connectWebSocket(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  return socket;
}

function cdp(socket) {
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result || {});
  });
  return {
    send(method, params = {}) {
      const requestId = ++id;
      socket.send(JSON.stringify({ id: requestId, method, params }));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
        pending.set(requestId, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
      });
    },
    close() { socket.close(); },
  };
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    const exception = result.exceptionDetails.exception || {};
    throw new Error(exception.description || exception.value || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitForDesktopUi(client) {
  return waitFor(
    () => evaluate(client, `!!(window.__TAURI__?.core?.invoke && document.querySelector('#message-list'))`),
    'desktop UI ready state',
    20000,
  );
}

async function waitForDesktopTarget(port, app, getAppOutput, timeoutMs = 60000) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    if (app.exitCode !== null) {
      throw new Error(`Desktop app exited before WebView startup (code ${app.exitCode}).\n${getAppOutput()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find((item) =>
        item.type === 'page'
        && item.url !== 'http://tauri.localhost/system-dictation.html'
        && (item.url === APP_URL || item.url === BUNDLED_APP_URL || item.title === 'Transfer Genie')
      );
      if (target) return target;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for desktop Tauri WebView on port ${port}${lastError ? ` (${lastError})` : ''}.\n${getAppOutput()}`);
}

async function runTest() {
  assert.ok(existsSync(APP_EXE), `Missing desktop binary: ${APP_EXE}`);
  assert.ok(existsSync(FFMPEG), `Missing FFmpeg sidecar: ${FFMPEG}`);
  const work = mkdtempSync(join(tmpdir(), 'transfer-genie-desktop-media-'));
  const appData = join(work, 'app-data');
  const fixtures = await createFixtures(join(work, 'fixtures'));
  const dav = davServer();
  const base = await dav.start();
  const endpoints = [
    { id: 'desktop-a', name: 'Desktop A', url: `${base}dav-a/`, username: '', password: '', enabled: true },
    { id: 'desktop-b', name: 'Desktop B', url: `${base}dav-b/`, username: '', password: '', enabled: true },
  ];
  mkdirSync(appData, { recursive: true });
  writeFileSync(join(appData, 'settings.json'), JSON.stringify({
    webdav_endpoints: endpoints, active_webdav_id: 'desktop-a', sender_name: 'DesktopE2E', refresh_interval_secs: 3600, download_dir: join(appData, 'downloads'), shortcuts_enabled: false, global_hotkey_enabled: false, auto_start: false, auto_update_enabled: false, local_http_api: { enabled: false }, send: {}, backup: {}, telegram: {}, ai: {}, speech_to_text: {},
  }, null, 2));

  const devServer = await ensureDevServer();
  const port = 9500 + Math.floor(Math.random() * 300);
  let appOutput = '';
  const app = spawn(APP_EXE, [], {
    cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TRANSFER_GENIE_APP_DATA_DIR: appData,
      TRANSFER_GENIE_FFMPEG: FFMPEG,
      WEBVIEW2_USER_DATA_FOLDER: join(work, 'webview2'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --autoplay-policy=no-user-gesture-required`,
    },
  });
  const captureAppOutput = (chunk) => {
    appOutput = `${appOutput}${chunk}`.slice(-12000);
  };
  app.stdout.on('data', captureAppOutput);
  app.stderr.on('data', captureAppOutput);
  let client;
  try {
    const target = await waitForDesktopTarget(port, app, () => appOutput);
    client = cdp(await connectWebSocket(target.webSocketDebuggerUrl));
    await client.send('Runtime.enable');
    await waitForDesktopUi(client);
    // Vite can perform one final navigation while the desktop WebView is starting.
    // Wait for the document to remain usable before issuing stateful upload calls.
    await delay(500);
    await waitForDesktopUi(client);

    const fixtureList = Object.values(fixtures);
    console.log('Desktop E2E: uploading endpoint A fixtures');
    const uploadA = await evaluate(client, `(async () => { const invoke = window.__TAURI__.core.invoke; const paths = ${JSON.stringify(fixtureList)}; const results = []; for (const path of paths) results.push(await invoke('send_file', { path, clientId: 'desktop-e2e-' + results.length, markedOptions: null })); return results; })()`);
    assert.equal(uploadA.length, 6);

    console.log('Desktop E2E: switching to endpoint B');
    const settingsB = await evaluate(client, `(async () => { const invoke = window.__TAURI__.core.invoke; const settings = await invoke('get_settings'); settings.active_webdav_id = 'desktop-b'; return invoke('save_settings', { settings }); })()`);
    assert.equal(settingsB.active_webdav_id, 'desktop-b');
    const uploadB = await evaluate(client, `window.__TAURI__.core.invoke('send_file', { path: ${JSON.stringify(fixtures.png)}, clientId: 'desktop-e2e-b', markedOptions: null })`);
    assert.equal(uploadB.endpointId, 'desktop-b');

    console.log('Desktop E2E: waiting for generated previews');
    const byOriginal = new Map(uploadA.map((item) => [item.originalName, item]));
    for (const name of ['photo.png', 'movie.mp4', 'movie.webm', 'unsupported.mkv']) {
      const item = byOriginal.get(name);
      const preview = await waitFor(async () => {
        try { return await evaluate(client, `window.__TAURI__.core.invoke('get_media_preview', { input: { endpointId: 'desktop-a', filename: ${JSON.stringify(item.filename)}, originalName: ${JSON.stringify(name)} } })`); } catch (_) { return null; }
      }, `${name} generated preview`, 30000);
      assert.ok(existsSync(preview), `${name} preview file should exist`);
    }
    const previewA = await evaluate(client, `window.__TAURI__.core.invoke('get_media_preview', { input: { endpointId: 'desktop-a', filename: ${JSON.stringify(byOriginal.get('photo.png').filename)}, originalName: 'photo.png' } })`);
    const previewB = await waitFor(async () => {
      try { return await evaluate(client, `window.__TAURI__.core.invoke('get_media_preview', { input: { endpointId: 'desktop-b', filename: ${JSON.stringify(uploadB.filename)}, originalName: 'photo.png' } })`); } catch (_) { return null; }
    }, 'endpoint B image preview');
    assert.notEqual(previewA, previewB);
    assert.match(previewA, /desktop-a/i);
    assert.match(previewB, /desktop-b/i);

    console.log('Desktop E2E: verifying remote playback cache');
    await evaluate(client, `(async () => { const invoke = window.__TAURI__.core.invoke; const settings = await invoke('get_settings'); settings.active_webdav_id = 'desktop-a'; return invoke('save_settings', { settings }); })()`);
    const remoteTarget = byOriginal.get('movie.mp4');
    const messagesA = await evaluate(client, `window.__TAURI__.core.invoke('list_messages', { limit: 100 })`);
    const remoteMessage = messagesA.messages.find((item) => item.filename === remoteTarget.filename);
    assert.ok(remoteMessage?.local_path);
    unlinkSync(remoteMessage.local_path);
    const playback = await evaluate(client, `window.__TAURI__.core.invoke('resolve_media_playback_source', { input: { endpointId: 'desktop-a', filename: ${JSON.stringify(remoteTarget.filename)}, originalName: 'movie.mp4', variant: 'file' } })`);
    assert.equal(playback.source, 'remoteCache');
    assert.ok(existsSync(playback.path));
    const bulkA = await evaluate(client, `window.__TAURI__.core.invoke('list_bulk_download_resources', { input: { page: 1, pageSize: 100 } })`);
    assert.equal(bulkA.resources.find((item) => item.filename === remoteTarget.filename)?.status, 'notDownloaded');

    console.log('Desktop E2E: rendering and exercising media UI');
    await evaluate(client, `(async () => { const invoke = window.__TAURI__.core.invoke; const settings = await invoke('get_settings'); settings.active_webdav_id = 'desktop-a'; await invoke('save_settings', { settings }); await invoke('refresh'); return true; })()`);
    await evaluate(client, `new Promise((resolve, reject) => { const started = Date.now(); const tick = () => document.querySelectorAll('#message-list .message-card').length >= 6 ? resolve(true) : Date.now() - started > 20000 ? reject(new Error('messages not rendered')) : setTimeout(tick, 100); tick(); })`);
    const ui = await evaluate(client, `(async () => {
      const cards = [...document.querySelectorAll('#message-list .message-card')];
      const byName = (name) => cards.find((card) => card.querySelector('.message-file-name')?.textContent?.includes(name) || card.textContent.includes(name));
      const imageCard = byName('photo.png'); const mp3Card = byName('tone.mp3'); const wavCard = byName('tone.wav'); const mp4Card = byName('movie.mp4'); const webmCard = byName('movie.webm'); const mkvCard = byName('unsupported.mkv');
      imageCard?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      const imageOpened = !!document.querySelector('#message-preview.is-active .message-preview-image');
      document.querySelector('#message-preview .message-preview-close')?.click();
      const playAndClose = async (card) => { card?.querySelector('.message-media-play-button')?.click(); await new Promise((r) => setTimeout(r, 80)); const load = document.querySelector('#message-preview .message-preview-media-load'); load?.click(); await new Promise((r) => setTimeout(r, 350)); const ready = !!document.querySelector('#message-preview audio:not([hidden]), #message-preview video:not([hidden])'); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return ready && !document.querySelector('#message-preview')?.classList.contains('is-active'); };
      const mp3Played = await playAndClose(mp3Card); const wavPlayed = await playAndClose(wavCard); const mp4Played = await playAndClose(mp4Card); const webmPlayed = await playAndClose(webmCard);
      mkvCard?.querySelector('.message-media-play-button')?.click(); document.querySelector('#message-preview .message-preview-media-load')?.click(); await new Promise((r) => setTimeout(r, 500)); const unsupported = document.querySelector('#message-preview .message-preview-media-status')?.textContent || ''; document.querySelector('#message-preview .message-preview-close')?.click();
      document.querySelector('#open-bulk-download')?.click();
      await new Promise((r) => setTimeout(r, 500));
      const bulkItem = [...document.querySelectorAll('.bulk-download-item')].find((item) => item.textContent.includes('movie.mp4'));
      const before = bulkItem?.classList.contains('is-selected');
      bulkItem?.querySelector('.bulk-download-thumb-play')?.click();
      await new Promise((r) => setTimeout(r, 350));
      const after = bulkItem?.classList.contains('is-selected');
      document.querySelector('[data-bulk-category="audio"]')?.click();
      await new Promise((r) => setTimeout(r, 350));
      const bulkAudioItem = [...document.querySelectorAll('.bulk-download-item')].find((item) => item.textContent.includes('tone.mp3'));
      const audioBefore = bulkAudioItem?.classList.contains('is-selected');
      const bulkAudioHeightBefore = bulkAudioItem?.getBoundingClientRect().height || 0;
      bulkAudioItem?.querySelector('.bulk-download-thumb-play')?.click();
      await new Promise((r) => setTimeout(r, 500));
      const bulkAudioPlayer = bulkAudioItem?.querySelector('.bulk-audio-player');
      const bulkAudioHeightAfter = bulkAudioItem?.getBoundingClientRect().height || 0;
      const bulkAudioProgress = bulkAudioPlayer?.querySelector('.bulk-audio-progress');
      const bulkAudioTime = bulkAudioPlayer?.querySelector('.bulk-audio-time')?.textContent || '';
      const audioAfter = bulkAudioItem?.classList.contains('is-selected');
      document.querySelector('#bulk-download-close')?.click();
      return {
        imageOpened, mp3Played, wavPlayed, mp4Played, webmPlayed, unsupported,
        bulkSelectionIsolated: before === after,
        bulkAudioPlayer: !!bulkAudioPlayer,
        bulkAudioProgressReady: !!bulkAudioProgress && !bulkAudioProgress.disabled && Number(bulkAudioProgress.max) > 0,
        bulkAudioTime,
        bulkAudioCardHeightStable: Math.abs(bulkAudioHeightAfter - bulkAudioHeightBefore) < 1,
        bulkAudioSelectionIsolated: audioBefore === audioAfter,
      };
    })()`);
    assert.equal(ui.imageOpened, true);
    assert.equal(ui.mp3Played, true);
    assert.equal(ui.wavPlayed, true);
    assert.equal(ui.mp4Played, true);
    assert.equal(ui.webmPlayed, true);
    assert.match(ui.unsupported, /不支持应用内播放/);
    assert.equal(ui.bulkSelectionIsolated, true);
    assert.equal(ui.bulkAudioPlayer, true);
    assert.equal(ui.bulkAudioProgressReady, true);
    assert.ok(ui.bulkAudioTime.startsWith('0:') && ui.bulkAudioTime.includes(' / 0:0'));
    assert.equal(ui.bulkAudioCardHeightStable, true);
    assert.equal(ui.bulkAudioSelectionIsolated, true);

    console.log(JSON.stringify({ endpoints: 2, formats: ['PNG', 'MP3', 'WAV', 'MP4', 'WebM', 'MKV'], remotePlaybackSource: playback.source, bulkStatus: 'notDownloaded', ui }, null, 2));
  } finally {
    client?.close();
    await killTree(app.pid);
    if (devServer) await killTree(devServer.pid);
    await dav.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

runTest().catch((error) => { console.error(error); process.exitCode = 1; });
