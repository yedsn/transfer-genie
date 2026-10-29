#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundleId = 'com.transfergenie';
const pbxPath = join(projectRoot, 'gen/apple/transfer-genie.xcodeproj/project.pbxproj');
const teamPattern = /DEVELOPMENT_TEAM = "[^"]*";/g;
const log = (text) => console.log('[ios-virtual] ' + text);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// Literal dotenv values only; never execute the file or export unrelated secrets.
export function readConfig(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

export function selectSimulator(listing, configured) {
  const devices = Object.values(listing.devices || {}).flat().filter((device) => device.isAvailable);
  const matches = configured
    ? devices.filter((device) => device.udid === configured || device.name === configured)
    : devices.filter((device) => /iPhone/i.test(device.name) && device.state === 'Booted');
  if (!configured && matches.length === 0) matches.push(...devices.filter((device) => /iPhone/i.test(device.name)));
  assert(matches.length === 1, 'Configure TRANSFER_GENIE_IOS_SIMULATOR in .env with one available name or UDID (xcrun simctl list devices available)');
  return matches[0];
}

function command(name, args, { allowFailure = false, env = process.env, input } = {}) {
  const result = spawnSync(name, args, { cwd: projectRoot, env, input, encoding: 'utf8', timeout: 60_000, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert(allowFailure || result.status === 0, name + ' failed: ' + (result.stderr || result.stdout));
  return result;
}

function json(name, args) { return JSON.parse(command(name, args).stdout); }

async function run(name, args, env) {
  const child = spawn(name, args, { cwd: projectRoot, env, stdio: 'inherit', detached: true });
  const stop = (signal) => { try { process.kill(-child.pid, signal); } catch {} };
  const interrupt = () => stop('SIGINT');
  const terminate = () => stop('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    await new Promise((resolveRun, reject) => {
      child.on('error', reject);
      child.on('exit', (code, signal) => code === 0 ? resolveRun() : reject(new Error(name + ' stopped (' + (signal || code) + ')')));
    });
  } finally {
    stop('SIGTERM');
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  }
}

function simulatorDraftGuard(udid) {
  const listing = command('xcrun', ['simctl', 'listapps', udid]).stdout;
  const apps = JSON.parse(command('plutil', ['-convert', 'json', '-o', '-', '-'], { input: listing }).stdout);
  if (!apps[bundleId]) return;
  const container = command('xcrun', ['simctl', 'get_app_container', udid, bundleId, 'data']).stdout.trim();
  const database = join(container, 'Library/Application Support', bundleId, 'messages.sqlite');
  assert(existsSync(database), 'Installed Simulator app database cannot be verified; refusing replacement');
  const result = command('sqlite3', ['-readonly', database, '.timeout 5000', 'PRAGMA quick_check; SELECT COUNT(*) FROM mobile_composer_drafts;']).stdout.trim();
  assert(result === 'ok\n0', 'Simulator has saved drafts or an unverifiable database. Finish/preserve drafts before deployment');
  log('Simulator database and empty saved-draft guard passed');
}

function simulatorDevArgs(simulator) {
  assertSimulatorDevTarget(json('xcrun', ['xcdevice', 'list']), simulator);
  const args = ['tauri', 'ios', 'dev', simulator.name];
  const port = new URL(JSON.parse(readFileSync(join(projectRoot, 'tauri.conf.json'), 'utf8')).build.devUrl).port;
  const listeners = command('lsof', ['-t', '-nP', '-iTCP:' + port, '-sTCP:LISTEN'], { allowFailure: true }).stdout.trim();
  if (listeners) {
    for (const pid of new Set(listeners.split('\n'))) {
      const cwd = command('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn']).stdout.split('\n').find((line) => line.startsWith('n'))?.slice(1);
      assert(cwd && resolve(cwd) === projectRoot, 'Dev server port ' + port + ' is occupied by another project; stop it before starting');
    }
    log('Reusing this project\'s existing dev server on port ' + port + '; keep its terminal running too');
    args.push('--config', JSON.stringify({ build: { beforeDevCommand: '' } }));
  }
  return args;
}

// Tauri tries fuzzy matching connected devices before looking at Simulators.
export function assertSimulatorDevTarget(devices, simulator) {
  const normalize = (name) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const query = normalize(simulator.name);
  assert(query, 'Simulator dev requires a distinctive name');
  for (const device of devices.filter((item) => !item.simulator && item.platform === 'com.apple.platform.iphoneos')) {
    const name = normalize(device.name || '');
    let index = 0;
    for (const char of name) if (char === query[index]) index += 1;
    assert(index !== query.length, 'Simulator name could match a connected iOS device in Tauri dev. Rename the Simulator to a distinctive name before starting');
  }
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/ios-virtual-deploy.mjs <simulator|vphone> <deploy|dev> [--debug] [--check-only]\n\n' +
      'simulator deploy      Embedded frontend, in-place install and open\n' +
      'simulator dev         Tauri/Vite watch mode; keep terminal running\n' +
      'vphone deploy         Ad-hoc iPhoneOS build, guarded install and smoke\n' +
      'vphone deploy --debug Debug rebuild/redeploy, NOT live HMR\n\n' +
      'Configure .env using .env.example. Process environment overrides .env.\n' +
      '--check-only verifies the target without booting/building/installing.\n' +
      'These commands never select a physical iPhone.');
    return;
  }
  const [target, action, ...flags] = args;
  assert(['simulator', 'vphone'].includes(target) && ['deploy', 'dev'].includes(action), 'Expected simulator|vphone and deploy|dev; see --help');
  assert(flags.every((flag) => ['--debug', '--check-only'].includes(flag)), 'Unknown option; see --help');
  assert(target !== 'vphone' || action !== 'dev', 'VPhone HMR is not verified; use vphone deploy --debug');
  assert(process.platform === 'darwin', 'iOS deployment requires macOS and Xcode');
  const configFile = process.env.TRANSFER_GENIE_IOS_CONFIG || join(projectRoot, '.env');
  const config = existsSync(configFile) ? readConfig(readFileSync(configFile, 'utf8')) : {};
  const value = (key) => process.env[key] || config[key] || '';
  const env = { ...process.env, CARGO_HOME: resolve(projectRoot, value('TRANSFER_GENIE_IOS_CARGO_HOME') || '.cargo-ios') };
  const checkOnly = flags.includes('--check-only');
  let simulator;
  let machine;
  let cli;
  let library;
  if (target === 'simulator') {
    simulator = selectSimulator(json('xcrun', ['simctl', 'list', 'devices', 'available', '--json']), value('TRANSFER_GENIE_IOS_SIMULATOR'));
    env.APPLE_DEVELOPMENT_TEAM = value('TRANSFER_GENIE_IOS_SIMULATOR_TEAM') || value('APPLE_DEVELOPMENT_TEAM');
    assert(env.APPLE_DEVELOPMENT_TEAM && !env.APPLE_DEVELOPMENT_TEAM.startsWith('YOUR_'), 'Configure APPLE_DEVELOPMENT_TEAM or TRANSFER_GENIE_IOS_SIMULATOR_TEAM in .env');
    log('Simulator: ' + simulator.name + ' (' + simulator.udid + '), ' + simulator.state);
    if (simulator.state === 'Booted') simulatorDraftGuard(simulator.udid);
  } else {
    cli = value('VPHONE_CLI') || '/Applications/vphone-launchpad.app/Contents/MacOS/vphone-launchpad-cli';
    library = value('VPHONE_LIBRARY_ROOT');
    const name = value('VPHONE_MACHINE');
    assert(name && library && existsSync(library), 'Configure VPHONE_MACHINE and a mounted VPHONE_LIBRARY_ROOT in .env');
    const status = json(cli, ['status']);
    assert(status.hostReady && status.bundleReady && status.helper?.startsWith('ready'), 'VPhone host/bundle/helper is not ready; inspect Launchpad');
    machine = json(cli, ['vm', 'list']).find((item) => item.name === name && resolve(item.libraryRoot) === resolve(library));
    assert(machine && !machine.panicked, 'Configured VPhone machine not found or panicked');
    log('VPhone: ' + machine.name + ', library ' + library + ', ' + machine.state);
    env.VPHONE_CLI = cli;
  }
  if (checkOnly) { log('Target check passed; no boot, build, install or termination performed'); return; }

  // Platforms share the Tauri archive and generated project: do not race them.
  const buildDir = join(projectRoot, 'gen/apple/build');
  const originalTeams = readFileSync(pbxPath, 'utf8').match(teamPattern) || [];
  mkdirSync(buildDir, { recursive: true });
  const lock = join(buildDir, '.virtual-deploy.lock');
  try { mkdirSync(lock); } catch { throw new Error('Another virtual deployment is active. After an abnormal exit, verify no build/dev process is running before removing ' + lock); }
  writeFileSync(join(lock, 'pid'), String(process.pid));
  let staging;
  try {
    if (target === 'simulator') {
      if (simulator.state !== 'Booted') command('xcrun', ['simctl', 'boot', simulator.udid]);
      await run('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b'], env);
      command('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', simulator.udid]);
      simulatorDraftGuard(simulator.udid);
      if (action === 'dev') {
        const sameName = Object.values(json('xcrun', ['simctl', 'list', 'devices', 'available', '--json']).devices).flat().filter((device) => device.name === simulator.name);
        assert(sameName.length === 1, 'Tauri dev selects by name; rename duplicate Simulator names before starting');
        log('Vite HMR + Tauri Rust watch mode; stop this terminal to end development');
        await run('npx', simulatorDevArgs(simulator), env);
        return;
      }
    } else if (machine.state !== 'running') {
      await run(cli, ['vm', 'start', machine.name, '--root', library, '--wait', '--timeout', '900'], env);
    }
    const buildArgs = ['tauri', 'ios', 'build', '--target', target === 'simulator' ? 'aarch64-sim' : 'aarch64', '--archive-only', '--ci'];
    if (flags.includes('--debug')) buildArgs.push('--debug');
    buildArgs.push(...(target === 'simulator' ? ['--export-method', 'debugging'] : ['--no-sign']));
    await run('npx', buildArgs, env);
    const applications = join(buildDir, 'transfer-genie_iOS.xcarchive/Products/Applications');
    const apps = readdirSync(applications).filter((name) => name.endsWith('.app'));
    assert(apps.length === 1, 'Expected exactly one app in the newly built archive');
    const app = join(applications, apps[0]);
    const plist = (key) => command('plutil', ['-extract', key, 'raw', '-o', '-', join(app, 'Info.plist')]).stdout.trim();
    assert(plist('DTPlatformName') === (target === 'simulator' ? 'iphonesimulator' : 'iphoneos'), 'Archive platform mismatch; refusing install');
    assert(plist('CFBundleIdentifier') === bundleId, 'Archive bundle ID mismatch; refusing install');
    log('Built ' + plist('CFBundleShortVersionString') + ' for ' + plist('DTPlatformName'));
    if (target === 'simulator') {
      command('codesign', ['--verify', '--deep', '--strict', app]);
      simulatorDraftGuard(simulator.udid);
      command('xcrun', ['simctl', 'terminate', simulator.udid, bundleId], { allowFailure: true });
      await run('xcrun', ['simctl', 'install', simulator.udid, app], env);
      command('xcrun', ['simctl', 'launch', simulator.udid, bundleId]);
      log('Installed in place and opened; embedded frontend does not need Vite');
    } else {
      staging = mkdtempSync(join(buildDir, 'vphone-deploy-'));
      const guestApp = join(staging, apps[0]);
      command('ditto', [app, guestApp]);
      command('codesign', ['--force', '--deep', '--sign', '-', '--entitlements', join(projectRoot, 'gen/apple/transfer-genie_iOS/transfer-genie_iOS.entitlements'), guestApp]);
      command('codesign', ['--verify', '--deep', '--strict', guestApp]);
      const artifacts = resolve(projectRoot, value('VPHONE_ARTIFACT_DIR') || join(buildDir, 'vphone-smoke'), new Date().toISOString().replace(/[:.]/g, '-'));
      log('Ad-hoc VPhone-only package. Existing draft guards must pass before install/termination');
      await run(process.execPath, ['tests/vphone/test_vphone_smoke.mjs', '--app', guestApp, '--machine', machine.name, '--root', library, '--artifact-dir', artifacts, '--reinstall-count', '1', '--cold-starts', '1'], {
        ...env, TMPDIR: staging,
        VPHONE_SEND_TEXT: '', VPHONE_EXPECT_REMOTE_TEXT: '', VPHONE_ATTACHMENT_TEXT: '', VPHONE_SNAPSHOT_RESET: '',
        VPHONE_ALLOW_SUPABASE_WRITES: '0', VPHONE_ALLOW_SNAPSHOT_REVERT: '0',
      });
      log('VPhone deployment and supplemental smoke passed; app is open');
    }
  } finally {
    // Restore only Team fields synchronized by Tauri, never overwrite other edits.
    const current = readFileSync(pbxPath, 'utf8');
    if ((current.match(teamPattern) || []).length === originalTeams.length) {
      let index = 0;
      const restored = current.replace(teamPattern, () => originalTeams[index++]);
      if (restored !== current) writeFileSync(pbxPath, restored);
    } else console.error('[ios-virtual] Team field structure changed; inspect the generated project diff');
    if (staging) rmSync(staging, { recursive: true, force: true });
    rmSync(lock, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error('[ios-virtual] ' + error.message); process.exitCode = 1; });
}
