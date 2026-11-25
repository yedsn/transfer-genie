import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const body = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

test('built image executable handles original and unavailable inputs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-image-binary-'));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  const original = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(Buffer.from([0,255,0,0]))), pngChunk('IEND', Buffer.alloc(0))]);
  const source = path.join(root, 'original.png');
  await fs.writeFile(source, original);
  const executable = path.resolve('tools/image-bot/transfer-genie-image-bot' + (process.platform === 'win32' ? '.exe' : ''));
  const child = spawn(executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = once(child, 'exit');
  const timer = setTimeout(() => child.kill(), 15000);
  const newline = String.fromCharCode(10);
  child.stdin.end(JSON.stringify({ protocol_version: 1, kind: 'invoke', request_id: 'r', task_id: 't', text: '', config: { download_dir: path.join(root, 'downloads') }, state_dir: path.join(root, 'state'), inputs: [
    { item_id: 'image', name: 'original.png', local_path: source },
    { item_id: 'missing', name: 'missing.png', error: '附件不可用' },
  ] }) + newline);
  try {
    const [code] = await exited;
    assert.equal(code, 0, stderr);
    const messages = stdout.trim().split(newline).map(line => JSON.parse(line));
    assert.equal(messages[0].kind, 'ready');
    const result = messages.find(message => message.kind === 'result');
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].status, 'succeeded', JSON.stringify(result));
    assert.equal(result.items[1].status, 'failed');
    assert.deepEqual(await fs.readFile(result.items[0].saved_path), original);
    assert.equal(messages.filter(message => message.kind === 'progress').length, 2);
    const recovered = spawn(executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let recoveryOutput = '';
    recovered.stdout.on('data', chunk => { recoveryOutput += chunk; });
    const recoveryExit = once(recovered, 'exit');
    await fs.unlink(source);
    recovered.stdin.end(JSON.stringify({ protocol_version: 1, kind: 'invoke', request_id: 'r2', task_id: 't', text: '', config: { download_dir: path.join(root, 'downloads') }, state_dir: path.join(root, 'state'), inputs: [{ item_id: 'image', name: 'original.png', local_path: source }] }) + newline);
    assert.equal((await recoveryExit)[0], 0);
    const recoveryResult = recoveryOutput.trim().split(newline).map(line => JSON.parse(line)).find(message => message.kind === 'result');
    assert.equal(recoveryResult.items[0].status, 'succeeded');
    assert.equal(recoveryResult.items[0].saved_path, result.items[0].saved_path);
    assert.equal((await fs.readdir(path.join(root, 'downloads'))).length, 1);
  } finally {
    clearTimeout(timer);
    await fs.rm(root, { recursive: true, force: true });
  }
});
