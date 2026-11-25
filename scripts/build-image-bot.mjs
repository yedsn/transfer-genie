import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = process.env.TAURI_ENV_TARGET_TRIPLE || '';
const platform = process.env.TAURI_ENV_PLATFORM || process.platform;
if (!['ios', 'android'].includes(platform) && !target.includes('ios') && !target.includes('android')) {
  const args = ['build', '--locked', '--manifest-path', path.join(root, 'plugins/.system/image-downloader/Cargo.toml'), '--release', '--target-dir', path.join(root, 'target/image-bot')];
  if (target) args.push('--target', target);
  const result = spawnSync('cargo', args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  const extension = (target ? target.includes('windows') : process.platform === 'win32') ? '.exe' : '';
  const name = 'transfer-genie-image-bot' + extension;
  const directory = path.join(root, 'tools/image-bot');
  mkdirSync(directory, { recursive: true });
  copyFileSync(path.join(root, 'target/image-bot', target, 'release', name), path.join(directory, name));
  copyFileSync(path.join(root, 'plugins/.system/image-downloader/plugin.json'), path.join(directory, 'plugin.json'));
}
