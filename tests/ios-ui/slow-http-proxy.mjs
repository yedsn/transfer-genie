import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';

// An opt-in, loopback-only proxy. No credentials, URL, header or body logs.
// Pass the installed app settings path; only its configured Supabase origins are allowed.
const [settingsPath, fixtureDirectory, mode = 'upload', listenHost = '127.0.0.1', listenPortText = '17992'] = process.argv.slice(2);
const listenPort = Number(listenPortText);
if (!settingsPath || !fixtureDirectory || !['upload', 'download'].includes(mode) || !listenHost || !Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
  throw new Error('Usage: node slow-http-proxy.mjs SETTINGS_PATH FIXTURE_DIRECTORY [upload|download] [LISTEN_HOST] [LISTEN_PORT]');
}
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const destinations = new Set((settings.storage_profiles || [])
  .filter((profile) => profile.provider_kind === 'supabase' && profile.supabase?.api_url)
  .map((profile) => new URL(profile.supabase.api_url).origin));
if (!destinations.size) throw new Error('No configured Supabase destination');

const fixtureName = `TG-IOS-SLOW-20261027-${mode}.bin`;
const fixturePath = path.join(fixtureDirectory, fixtureName);
const fixture = Buffer.alloc(8 * 1024 * 1024);
for (let offset = 0; offset < fixture.length; offset += 32) {
  createHash('sha256').update(`Transfer Genie disposable slow-transfer fixture ${offset}`).digest().copy(fixture, offset);
}
if (fs.existsSync(fixturePath)) {
  if (!fs.readFileSync(fixturePath).equals(fixture)) throw new Error('Refusing to overwrite a different source fixture');
} else fs.writeFileSync(fixturePath, fixture, { flag: 'wx' });
console.log(JSON.stringify({ fixtureName, size: fixture.length, sha256: createHash('sha256').update(fixture).digest('hex') }));

const stats = { tunnels: 0, active: 0, clientBytesForwarded: 0, serverBytesForwarded: 0, largeUploadBytesForwarded: 0, largeUploadAttempts: 0, largeDownloadBytesForwarded: 0, largeDownloadAttempts: 0, closed: 0 };
const sockets = new Set();
class SlowTransfer extends Transform {
  constructor(direction = 'upload', isFixture = false) { super(); this.direction = direction; this.isFixture = isFixture; }
  _transform(chunk, encoding, callback) {
    let offset = 0;
    const forward = () => {
      if (this.destroyed) { callback(); return; }
      const part = chunk.subarray(offset, offset + 16384);
      setTimeout(() => {
        if (this.destroyed) { callback(); return; }
        if (this.direction === 'upload') {
          stats.clientBytesForwarded += part.length;
          if (this.isFixture) stats.largeUploadBytesForwarded += part.length;
        } else {
          stats.serverBytesForwarded += part.length;
          if (this.isFixture) stats.largeDownloadBytesForwarded += part.length;
        }
        this.push(part);
        offset += part.length;
        if (offset < chunk.length) forward();
        else callback();
      }, part.length / 262144 * 1000);
    };
    forward();
  }
}
const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/status') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(stats));
    return;
  }
  let url;
  try { url = new URL(request.url); } catch { response.writeHead(400); response.end(); return; }
  if (url.protocol !== 'http:' || !destinations.has(url.origin)) { response.writeHead(403); response.end(); return; }
  const upstream = http.request(url, { method: request.method, headers: { ...request.headers, host: url.host }, timeout: 60000 });
  const isFixtureUpload = url.pathname.startsWith('/storage/v1/object/') && Number(request.headers['content-length']) === fixture.length;
  if (isFixtureUpload) stats.largeUploadAttempts += 1;
  const throttle = new SlowTransfer('upload', isFixtureUpload);
  let downloadThrottle;
  stats.tunnels += 1; stats.active += 1;
  let ended = false;
  const close = () => {
    if (ended) return;
    ended = true; stats.closed += 1; stats.active -= 1;
    throttle.destroy(); downloadThrottle?.destroy(); upstream.destroy();
    console.log(JSON.stringify({ event: 'http-request-closed', ...stats }));
  };
  request.on('aborted', close);
  response.on('close', close);
  upstream.on('timeout', () => upstream.destroy());
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); close(); });
  throttle.on('error', close);
  upstream.on('response', (result) => {
    response.writeHead(result.statusCode, result.headers);
    const isFixtureDownload = mode === 'download' && request.method === 'GET' && url.pathname.startsWith('/storage/v1/object/') && Number(result.headers['content-length']) === fixture.length;
    if (isFixtureDownload) {
      stats.largeDownloadAttempts += 1;
      downloadThrottle = new SlowTransfer('download', true);
      downloadThrottle.on('error', close);
      result.pipe(downloadThrottle).pipe(response);
    } else {
      result.on('data', (chunk) => { stats.serverBytesForwarded += chunk.length; });
      result.pipe(response);
    }
  });
  request.pipe(throttle).pipe(upstream);
});
server.on('connect', (request, client, head) => {
  if (!destinations.has(new URL(`https://${request.url}`).origin)) { client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  const separator = request.url.lastIndexOf(':');
  const upstream = net.connect(Number(request.url.slice(separator + 1)), request.url.slice(0, separator));
  const throttle = new SlowTransfer();
  let ended = false;
  const close = () => {
    if (ended) return;
    ended = true;
    stats.closed += 1; stats.active -= 1;
    throttle.destroy(); client.destroy(); upstream.destroy();
    sockets.delete(client); sockets.delete(upstream);
    console.log(JSON.stringify({ event: 'tunnel-closed', ...stats }));
  };
  stats.tunnels += 1; stats.active += 1;
  sockets.add(client); sockets.add(upstream);
  client.on('error', close); upstream.on('error', close);
  client.on('close', close); upstream.on('close', close);
  throttle.on('error', close);
  upstream.setTimeout(60000, close);
  upstream.on('connect', () => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) throttle.write(head);
    client.pipe(throttle).pipe(upstream);
    upstream.on('data', (chunk) => { stats.serverBytesForwarded += chunk.length; });
    upstream.pipe(client);
  });
});
server.listen(listenPort, listenHost, () => console.log(`Slow test proxy ready on ${listenHost}:${listenPort} (256 KiB/s ${mode})`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  for (const socket of sockets) socket.destroy();
  server.close(() => process.exit(0));
});
