import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

// Official Simulator only: never changes a physical device's accessibility preferences.
const simulator = '6719E14E-8424-49B1-B96D-CB0A609311EA';
function contentSize(category) {
  const args = ['simctl', 'ui', simulator, 'content_size'];
  if (category) args.push(category);
  const result = spawnSync('xcrun', args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
const original = contentSize();
assert.equal(original, 'large', 'Start from the verified normal Simulator preference');
const command = spawn('xcodebuild', [
  '-project', 'tests/ios-ui/TransferGenieSimulatorUITests.xcodeproj',
  '-scheme', 'TransferGenieSimulatorUITests',
  '-destination', `platform=iOS Simulator,id=${simulator}`,
  '-derivedDataPath', '/tmp/tg-ios-running-system-text-20261027',
  '-only-testing:TransferGenieSimulatorUITests/TransferGenieSimulatorUITests/testSystemTextChangeUpdatesRunningWebView',
  'test',
]);
let output = '';
let enlarged = false;
let restored = false;
let markerError;
function consume(chunk) {
  const text = chunk.toString();
  process.stdout.write(text);
  output += text;
  try {
    if (!enlarged && output.includes('SYSTEM_TEXT_BASELINE_READY')) {
      contentSize('accessibility-extra-extra-extra-large');
      enlarged = true;
    }
    if (!restored && output.includes('SYSTEM_TEXT_ENLARGED_READY')) {
      contentSize(original);
      restored = true;
    }
  } catch (error) { markerError = error; command.kill('SIGTERM'); }
}
command.stdout.on('data', consume);
command.stderr.on('data', consume);
const timeout = setTimeout(() => command.kill('SIGTERM'), 180000);
try {
  const code = await new Promise((resolve, reject) => { command.on('error', reject); command.on('exit', resolve); });
  if (markerError) throw markerError;
  assert.equal(code, 0, 'Installed running-WebView text update test must pass');
  assert.ok(enlarged && restored, 'Both actual system category transitions were performed');
} finally {
  clearTimeout(timeout);
  contentSize(original);
}
