import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixture = mkdtempSync(join(tmpdir(), 'tg-ios-confirm-'));
const configPath = join(fixture, '.env');
const script = new URL('../scripts/ios-wireless-update.sh', import.meta.url).pathname;
const secret = 'fixture-secret-must-not-be-printed';

try {
  writeFileSync(configPath, [
    'TRANSFER_GENIE_IOS_DEVICE="Fixture iPhone"',
    "APPLE_DEVELOPMENT_TEAM='FIXTURETEAM'",
    'TRANSFER_GENIE_IOS_CARGO_HOME=.cargo-confirm',
    'GITEE_ACCESS_TOKEN=' + secret,
    'VPHONE_LIBRARY_ROOT=/unrelated/fixture',
  ].join('\r\n'));
  // Never connect to hardware or build: external deployment tools are stubs.
  for (const name of ['jq', 'sqlite3', 'security', 'plutil', 'codesign', 'npm', 'xcrun']) {
    writeFileSync(join(fixture, name), '#!/bin/sh\necho STUB_' + name + '\nexit 73\n', { mode: 0o700 });
  }
  const env = { ...process.env, PATH: fixture + ':/usr/bin:/bin', TRANSFER_GENIE_IOS_CONFIG: configPath };
  for (const key of ['TRANSFER_GENIE_IOS_DEVICE', 'APPLE_DEVELOPMENT_TEAM', 'TRANSFER_GENIE_IOS_CARGO_HOME']) delete env[key];
  const run = (args, input, overrides = {}) => spawnSync('/bin/bash', [script, ...args], { env: { ...env, ...overrides }, input, encoding: 'utf8', timeout: 5000 });
  const assertPreview = (result) => {
    assert.match(result.stdout, /同一个 Wi-Fi/);
    assert.ok(result.stdout.includes(configPath));
    assert.match(result.stdout, /TRANSFER_GENIE_IOS_DEVICE\s+Fixture iPhone/);
    assert.match(result.stdout, /APPLE_DEVELOPMENT_TEAM\s+FIXTURETEAM/);
    assert.match(result.stdout, /TRANSFER_GENIE_IOS_CARGO_HOME\s+.*\/.cargo-confirm/);
    assert.match(result.stdout, /网络提醒[\s\S]+生效配置[\s\S]+本次操作/);
    assert.ok(!result.stdout.includes('\u001b['), 'Piped logs should not contain ANSI colors');
    assert.ok(!result.stdout.includes(secret));
    assert.ok(!result.stdout.includes('/unrelated/fixture'));
  };
  for (const input of ['\n', 'n\n', 'invalid\n', '']) {
    const result = run(['--confirm'], input);
    assert.equal(result.status, 0, result.stderr);
    assertPreview(result);
    assert.match(result.stdout, /已取消/);
    assert.ok(!result.stdout.includes('STUB_'));
  }
  const launch = run(['--launch', '--confirm', '--debug'], 'n\n');
  assertPreview(launch);
  assert.match(launch.stdout, /原位更新后打开 App/);
  assert.match(launch.stdout, /构建模式\s+debug/);
  const overrides = run(['--confirm', '--device', 'CLI iPhone', '--team', 'CLITEAM'], 'n\n', { TRANSFER_GENIE_IOS_DEVICE: 'Env iPhone', APPLE_DEVELOPMENT_TEAM: 'ENVTEAM' });
  assert.match(overrides.stdout, /TRANSFER_GENIE_IOS_DEVICE\s+CLI iPhone/);
  assert.match(overrides.stdout, /APPLE_DEVELOPMENT_TEAM\s+CLITEAM/);
  const environment = run(['--confirm'], 'n\n', { TRANSFER_GENIE_IOS_DEVICE: 'Env iPhone', APPLE_DEVELOPMENT_TEAM: 'ENVTEAM' });
  assert.match(environment.stdout, /TRANSFER_GENIE_IOS_DEVICE\s+Env iPhone/);
  assert.match(environment.stdout, /APPLE_DEVELOPMENT_TEAM\s+ENVTEAM/);
  const terminalDriver = [
    'import os, pty, subprocess, sys',
    'master, slave = pty.openpty()',
    'child = subprocess.Popen(["/bin/bash", sys.argv[1], "--confirm"] + sys.argv[3:], stdin=slave, stdout=slave, stderr=slave)',
    'os.close(slave)',
    'os.write(master, sys.argv[2].encode())',
    'while True:',
    '    try: chunk = os.read(master, 65536)',
    '    except OSError: break',
    '    if not chunk: break',
    '    sys.stdout.buffer.write(chunk)',
    'os.close(master)',
    'sys.exit(child.wait())',
  ].join('\n');
  const runTerminal = (overrides = {}, args = [], input = 'n\n') => spawnSync('/usr/bin/python3', ['-c', terminalDriver, script, input, ...args], {
    env: { ...env, TERM: 'xterm-256color', ...overrides }, input: 'n\n', encoding: 'utf8', timeout: 5000,
  });
  const colored = runTerminal({ NO_COLOR: undefined });
  assert.equal(colored.status, 0, colored.stderr);
  for (const code of ['1;36', '33', '1', '2', '0']) assert.ok(colored.stdout.includes('\u001b[' + code + 'm'));
  assert.ok(!colored.stdout.includes(secret));
  const uncolored = runTerminal({ NO_COLOR: '' });
  assert.equal(uncolored.status, 0, uncolored.stderr);
  assert.ok(!uncolored.stdout.includes('\u001b['));
  const basic = runTerminal({ TERM: 'dumb', NO_COLOR: undefined });
  assert.equal(basic.status, 0, basic.stderr);
  assert.ok(!basic.stdout.includes('\u001b['));
  const confirmed = runTerminal({ NO_COLOR: undefined }, ['--device', 'YOUR_PREVIEW_DEVICE'], 'y\n');
  assert.equal(confirmed.status, 1);
  assert.ok(confirmed.stdout.includes('\u001b[32m'), 'Confirmation should be green');
  assert.ok(confirmed.stdout.includes('\u001b[31m'), 'Validation errors should be red');
  assert.ok(!confirmed.stdout.includes('STUB_'), 'Placeholder validation must stop before connecting');
  for (const input of ['y\n', 'yes\n', 'Y\n']) {
    const result = run(['--confirm'], input);
    assert.equal(result.status, 73, result.stderr);
    assert.match(result.stdout, /已确认/);
    // First stub fails; no device contact or build is possible.
    assert.ok(!result.stdout.includes('STUB_npm'));
  }
  const direct = run([], '');
  assert.equal(direct.status, 73);
  assert.ok(!direct.stdout.includes('[y/N]'));
  const help = run(['--confirm', '--help'], '');
  assert.equal(help.status, 0);
  assert.ok(!help.stdout.includes('[y/N]'));
  const launchConfig = JSON.parse(readFileSync(new URL('../.vscode/launch.json', import.meta.url)));
  for (const name of ['ios:wireless-update', 'ios:wireless-update:launch']) {
    assert.match(launchConfig.configurations.find(item => item.name === name).command, / -- --confirm$/);
  }
  console.log('iOS wireless confirmation passed: safe preview, cancellation/EOF, explicit consent, overrides and launch wiring; hardware/build tools stubbed');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
