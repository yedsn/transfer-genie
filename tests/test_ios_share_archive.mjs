import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('../scripts/verify-ios-share-archive.sh', import.meta.url).pathname;
const fixture = mkdtempSync(join(tmpdir(), 'tg-ios-share-archive-'));

const entitlement = (groups, identifiers = []) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
${identifiers.map(([key, value]) => `<key>${key}</key><string>${value}</string>`).join('')}
<key>com.apple.security.application-groups</key><array>${groups.map((group) => `<string>${group}</string>`).join('')}</array>
</dict></plist>
`;

function makeBundle(
  root,
  extensionPoint = 'com.apple.share-services',
  extensionGroups = ['group.com.transfergenie'],
  appGroups = ['group.com.transfergenie'],
) {
  const app = join(root, 'Transfer Genie.app');
  const appex = join(app, 'PlugIns/ShareExtension.appex');
  mkdirSync(appex, { recursive: true });
  compileExecutable(join(app, 'Transfer Genie'));
  compileExecutable(join(appex, 'ShareExtension'));
  writeFileSync(join(app, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.transfergenie</string>
<key>CFBundleExecutable</key><string>Transfer Genie</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
`);
  writeFileSync(join(appex, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.transfergenie.ShareExtension</string>
<key>CFBundleExecutable</key><string>ShareExtension</string>
<key>CFBundlePackageType</key><string>XPC!</string>
<key>NSExtension</key><dict><key>NSExtensionPointIdentifier</key><string>${extensionPoint}</string></dict>
</dict></plist>
`);
  const appEntitlements = join(root, 'app.entitlements');
  const appexEntitlements = join(root, 'appex.entitlements');
  writeFileSync(appEntitlements, entitlement(appGroups, [
    ['application-identifier', 'FIXTURE.com.transfergenie'],
  ]));
  writeFileSync(appexEntitlements, entitlement(extensionGroups));
  for (const [bundle, entitlements] of [[appex, appexEntitlements], [app, appEntitlements]]) {
    const signed = spawnSync('codesign', ['--force', '--sign', '-', '--entitlements', entitlements, bundle], { encoding: 'utf8' });
    assert.equal(signed.status, 0, signed.stderr);
  }
  return app;
}

function compileExecutable(path) {
  const source = `${path}.c`;
  writeFileSync(source, 'int main(void) { return 0; }\n');
  const compiled = spawnSync('clang', [source, '-o', path], { encoding: 'utf8' });
  assert.equal(compiled.status, 0, compiled.stderr);
}

const run = (app) => spawnSync('/bin/bash', [script, app], { encoding: 'utf8' });

try {
  const valid = makeBundle(join(fixture, 'valid'));
  const validResult = run(valid);
  assert.equal(validResult.status, 0, validResult.stderr);
  assert.match(validResult.stdout, /Verified embedded share extension/);

  const wrongPoint = makeBundle(join(fixture, 'wrong-point'), 'com.apple.other');
  const wrongPointResult = run(wrongPoint);
  assert.equal(wrongPointResult.status, 1);
  assert.match(wrongPointResult.stderr, /com\.apple\.share-services/);

  const missingGroup = makeBundle(join(fixture, 'missing-group'), 'com.apple.share-services', []);
  const missingGroupResult = run(missingGroup);
  assert.equal(missingGroupResult.status, 1);
  assert.match(missingGroupResult.stderr, /Share extension is missing the group\.com\.transfergenie App Group/);

  const missingHostGroup = makeBundle(join(fixture, 'missing-host-group'), 'com.apple.share-services', undefined, []);
  const missingHostGroupResult = run(missingHostGroup);
  assert.equal(missingHostGroupResult.status, 1);
  assert.match(missingHostGroupResult.stderr, /Host app is missing the group\.com\.transfergenie App Group/);

  const duplicate = join(fixture, 'duplicate');
  const duplicateApp = makeBundle(duplicate);
  cpSync(join(duplicateApp, 'PlugIns/ShareExtension.appex'), join(duplicateApp, 'PlugIns/Second.appex'), { recursive: true });
  const duplicateResult = run(duplicateApp);
  assert.equal(duplicateResult.status, 1);
  assert.match(duplicateResult.stderr, /Expected exactly one embedded \.appex, found 2/);

  console.log('iOS share archive verification passed: valid signed fixture, extension point, App Group and duplicate extension rejection');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
