import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Scope the preference change to the official Simulator, and restore it even on failure.
const simulator = '6719E14E-8424-49B1-B96D-CB0A609311EA';
const opened = spawnSync('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', simulator], { encoding: 'utf8' });
assert.equal(opened.status, 0, opened.stderr);
const menuItem = 'menu item "Connect Hardware Keyboard" of menu 1 of menu item "Keyboard" of menu 1 of menu bar item "I/O" of menu bar 1 of process "Simulator"';
function simulatorMenu(action) {
  const result = spawnSync('osascript', ['-e', 'tell application "System Events" to ' + action + ' ' + menuItem], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function connected() {
  return simulatorMenu('get value of attribute "AXMenuItemMarkChar" of') === '✓';
}
async function setConnected(value) {
  if (connected() === value) return;
  simulatorMenu('click');
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (connected() === value) return;
  }
  assert.equal(connected(), value, 'Simulator keyboard preference did not settle');
}
const original = connected();
function contentSize(category) {
  const args = ["simctl", "ui", simulator, "content_size"];
  if (category) args.push(category);
  const result = spawnSync("xcrun", args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
const originalTextSize = contentSize();
const derivedData = process.env.KEYBOARD_DERIVED_DATA || '/tmp/tg-ios-real-software-keyboard-20261027';
const captureDirectory = join(derivedData, 'framebuffers');
mkdirSync(captureDirectory, { recursive: true });
const testName = process.env.KEYBOARD_ATTACHMENT
  ? 'testAccessibilityComposerAttachmentWithSoftwareKeyboard'
  : process.env.KEYBOARD_PICKER_CANCEL
  ? (process.env.KEYBOARD_TEXT_SIZE ? 'testAccessibilityComposerPickersCanBeCancelledWithSoftwareKeyboard' : 'testComposerPickersCanBeCancelledWithSoftwareKeyboard')
  : (process.env.KEYBOARD_TEXT_SIZE ? 'testAccessibilityComposerActionsRemainReachableWithSoftwareKeyboard' : 'testComposerActionsStayAboveSoftwareKeyboardInBothOrientations');
let command;
let timeout;
let output = '';
const captured = new Set();
let captureError;
let outputError;
function handleOutputError(error) {
  outputError = error;
  command?.kill('SIGTERM');
}
process.stdout.on('error', handleOutputError);
process.stderr.on('error', handleOutputError);
try {
  if (process.env.KEYBOARD_TEXT_SIZE) contentSize(process.env.KEYBOARD_TEXT_SIZE);
  await setConnected(false);
  assert.equal(connected(), false, 'A full software keyboard must be enabled');
  command = spawn('xcodebuild', [
    '-project', 'tests/ios-ui/TransferGenieSimulatorUITests.xcodeproj',
    '-scheme', 'TransferGenieSimulatorUITests',
    '-destination', 'platform=iOS Simulator,id=' + simulator,
    '-derivedDataPath', derivedData,
    '-only-testing:TransferGenieSimulatorUITests/TransferGenieSimulatorUITests/' + testName,
    'COMPILATION_CACHE_ENABLE_CACHING=NO',
    'CODE_INDEX_ENABLE_BUILD_ARENA=NO',
    'test',
  ]);
  function consume(chunk) {
    output += chunk.toString();
    if (!outputError) process.stdout.write(chunk);
    for (const orientation of [1, 3]) for (const stage of ['READY', 'FAILURE', 'SEND', 'ATTACHMENT']) {
      const key = stage + '_' + orientation;
      if (captured.has(key) || !output.includes('SOFTWARE_KEYBOARD_CAPTURE_' + key)) continue;
      captured.add(key);
      // CoreSimulator's screenshot service cannot always write to external volumes.
      // Capture a small uniquely named temporary image, then preserve it with the run.
      const temporaryImage = join(mkdtempSync(join(tmpdir(), 'tg-keyboard-frame-')), 'orientation-' + orientation + '.png');
      const result = spawnSync('xcrun', ['simctl', 'io', simulator, 'screenshot', temporaryImage], { encoding: 'utf8' });
      if (result.status !== 0) captureError = result.stderr;
      else copyFileSync(temporaryImage, join(captureDirectory, stage.toLowerCase() + '-orientation-' + orientation + '.png'));
    }
  }
  command.stdout.on('data', consume);
  command.stderr.on('data', consume);
  timeout = setTimeout(() => command.kill('SIGTERM'), 240000);
  const code = await new Promise((resolve, reject) => { command.on('error', reject); command.on('exit', resolve); });
  assert.equal(outputError, undefined, 'Test output must be preserved without a disk-write error');
  assert.equal(code, 0, 'Both installed-app software-keyboard layouts must pass');
  assert.ok(!output.includes('Test skipped') && !output.includes('1 test skipped'), 'Skipped keyboard coverage is not a pass');
  assert.equal(captureError, undefined);
  assert.ok(captured.has('READY_1') && captured.has('READY_3'), 'Capture both actual Simulator orientations');
  if (process.env.KEYBOARD_ATTACHMENT) assert.ok(captured.has('ATTACHMENT_1') && captured.has('ATTACHMENT_3'), 'Capture enabled send with the actual attachment in both orientations');
} finally {
  clearTimeout(timeout);
  const container = spawnSync('xcrun', ['simctl', 'get_app_container', simulator, 'com.transfergenie', 'data'], { encoding: 'utf8' });
  const probe = join(container.stdout.trim(), 'tmp', 'mobile-layout-probe.jsonl');
  if (container.status === 0 && existsSync(probe)) copyFileSync(probe, join(derivedData, 'mobile-layout-probe.jsonl'));
  contentSize(originalTextSize);
  await setConnected(original);
  assert.equal(connected(), original, 'Restore the original hardware-keyboard preference');
}
