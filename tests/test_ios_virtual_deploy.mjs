import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertSimulatorDevTarget, main, readConfig, selectSimulator } from '../scripts/ios-virtual-deploy.mjs';

const config = readConfig('# ignored\r\nVPHONE_MACHINE="A VM"\r\nVPHONE_LIBRARY_ROOT=/Volumes/My Disk/machines\nIGNORED\nVALUE=first\nVALUE=last\nLITERAL=$(do-not-execute)\nSINGLE=\'value\'\n');
assert.equal(config.VPHONE_MACHINE, 'A VM');
assert.equal(config.VPHONE_LIBRARY_ROOT, '/Volumes/My Disk/machines');
assert.equal(config.VALUE, 'last');
assert.equal(config.LITERAL, '$(do-not-execute)');
assert.equal(config.SINGLE, 'value');
assert.equal(config.IGNORED, undefined);

const phone = { name: 'Test iPhone', udid: 'test-udid', isAvailable: true, state: 'Booted' };
const other = { name: 'Other iPhone', udid: 'other-udid', isAvailable: true, state: 'Shutdown' };
const unavailable = { name: 'Old iPhone', udid: 'old', isAvailable: false, state: 'Booted' };
const listing = { devices: { runtime: [phone, other, unavailable] } };
assert.equal(selectSimulator(listing), phone);
assert.equal(selectSimulator(listing, phone.udid), phone);
assert.equal(selectSimulator(listing, other.name), other);
assert.throws(() => selectSimulator(listing, unavailable.udid), /Configure/);
assert.throws(() => selectSimulator({ devices: {} }), /Configure/);
assert.throws(() => selectSimulator({ devices: { runtime: [phone, { ...other, state: 'Booted' }] } }), /Configure/);
assert.throws(() => selectSimulator({ devices: { runtime: [{ ...phone, state: 'Shutdown' }, other] } }), /Configure/);
assert.throws(() => selectSimulator({ devices: { runtime: [phone, { ...other, name: phone.name }] } }, phone.name), /Configure/);
assert.equal(selectSimulator({ devices: { runtime: [other] } }), other);
const connectedPhone = { simulator: false, platform: 'com.apple.platform.iphoneos', name: 'Developer iPhone 17' };
assertSimulatorDevTarget([connectedPhone], phone);
assert.throws(() => assertSimulatorDevTarget([connectedPhone], { name: 'iPhone 17' }), /could match/);
assert.throws(() => assertSimulatorDevTarget([{ ...connectedPhone, name: 'Test iPhone' }], phone), /could match/);
assertSimulatorDevTarget([{ ...connectedPhone, simulator: true, name: phone.name }], phone);
await assert.rejects(main(['physical', 'deploy']), /Expected/);
await assert.rejects(main(['vphone', 'dev']), /HMR is not verified/);
await assert.rejects(main(['simulator', 'deploy', '--erase']), /Unknown option/);

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const launch = JSON.parse(readFileSync(new URL('../.vscode/launch.json', import.meta.url)));
for (const name of ['ios:simulator:deploy', 'ios:simulator:dev', 'ios:vphone:deploy', 'ios:vphone:dev']) {
  assert.ok(pkg.scripts[name]);
  assert.equal(launch.configurations.filter((entry) => entry.command === 'npm run ' + name).length, 1);
}
assert.match(pkg.scripts['ios:vphone:dev'], /deploy --debug$/);
console.log('iOS virtual deployment: config, unambiguous target selection, CLI safety and launch wiring passed');
