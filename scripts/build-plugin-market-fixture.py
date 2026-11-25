"""Build a local test registry; does not start a server or publish anything."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--base-url', required=True, help='HTTP(S) location at which the output will be served')
args = parser.parse_args()
if not args.base_url.startswith(('https://', 'http://')):
    parser.error('--base-url must be HTTP(S)')
source = Path(__file__).resolve().parents[1] / 'tests/fixtures/plugins/echo-bot'
args.output.mkdir(parents=True, exist_ok=True)
package = args.output / 'echo-bot-example-1.0.0.zip'
with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(source.iterdir()):
        archive.write(file, file.name)
content = package.read_bytes()
artifact = dict(url=args.base_url.rstrip('/') + '/' + package.name, size=len(content), sha256=hashlib.sha256(content).hexdigest())
entry = dict(id='echo-bot-example', name='协议测试机器人', version='1.0.0', description='用于验证完整包导入及 JSON Lines 调用，需要 Node.js。', host_api_version=1, artifacts=[dict(artifact, platform=os, arch=arch) for os in ['windows', 'macos', 'linux'] for arch in ['x86_64', 'aarch64']])
versions = dict(schema_version=1, plugin_id=entry['id'], versions=[dict(version=entry['version'], artifacts=entry.pop('artifacts'))])
(args.output / 'versions.json').write_text(json.dumps(versions, ensure_ascii=False, indent=2), encoding='utf-8')
entry['versions_url'] = args.base_url.rstrip('/') + '/versions.json'
entry['min_app_version'] = '0.5.19'
(args.output / 'index.json').write_text(json.dumps(dict(schema_version=1, plugins=[entry]), ensure_ascii=False, indent=2), encoding='utf-8')
print(args.output / 'index.json')
