import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = process.env.TAURI_ENV_TARGET_TRIPLE || '';
const platform = process.env.TAURI_ENV_PLATFORM || process.platform;
if (!['ios', 'android'].includes(platform) && !target.includes('ios') && !target.includes('android')) {
  const targets = target === 'universal-apple-darwin' ? ['aarch64-apple-darwin', 'x86_64-apple-darwin'] : [target];
  function run(command, args) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
  for (const buildTarget of targets) {
    const args = ['build', '--locked', '--manifest-path', path.join(root, 'plugins/.system/image-downloader/Cargo.toml'), '--release', '--target-dir', path.join(root, 'target/image-bot')];
    if (buildTarget) args.push('--target', buildTarget);
    run('cargo', args);
  }
  const extension = (target ? target.includes('windows') : process.platform === 'win32') ? '.exe' : '';
  const name = 'transfer-genie-image-bot' + extension;
  const directory = path.join(root, 'tools/image-bot');
  mkdirSync(directory, { recursive: true });
  const output = path.join(directory, name);
  if (targets.length === 2) {
    run('lipo', ['-create', ...targets.map(value => path.join(root, 'target/image-bot', value, 'release', name)), '-output', output]);
  } else {
    copyFileSync(path.join(root, 'target/image-bot', target, 'release', name), output);
  }
  if (!extension) chmodSync(output, 0o755);
  copyFileSync(path.join(root, 'plugins/.system/image-downloader/plugin.json'), path.join(directory, 'plugin.json'));
}
