# Transfer Genie

<p align="center">
  <img src="icons/icon.png" alt="Transfer Genie" width="160">
</p>

<p align="center"><strong>WebDAV-based cross-device file transfer and text sync.</strong></p>
<p align="center">A Tauri + Rust desktop app for Windows and macOS. Send text, Markdown, and files like a chat inbox, and automate transfers with a local HTTP API or Telegram Bridge.</p>

<p align="center">
  <a href="https://yedsn.github.io/transfer-genie/">Website</a>
  ·
  <a href="https://github.com/yedsn/transfer-genie/releases/latest">Download</a>
  ·
  <a href="https://yedsn.github.io/transfer-genie/download">Download page</a>
  ·
  <a href="https://yedsn.github.io/transfer-genie/compare/transfer-genie-vs-airdrop">Compare AirDrop</a>
  ·
  <a href="https://yedsn.github.io/transfer-genie/compare/transfer-genie-vs-wechat-file-transfer">Compare WeChat File Transfer</a>
  ·
  <a href="https://yedsn.github.io/transfer-genie/compare/transfer-genie-vs-syncthing">Compare Syncthing</a>
  ·
  <a href="https://yedsn.github.io/transfer-genie/faq">FAQ</a>
  ·
  <a href="https://github.com/yedsn/transfer-genie">GitHub</a>
  ·
  <a href="https://yedsn.github.io/transfer-genie/guide/quick-start">Docs</a>
</p>

Transfer Genie turns a WebDAV folder into a self-hosted transfer inbox.

## What it does

- Use one WebDAV endpoint as shared storage across devices.
- Send text, Markdown, and files in a chat-like desktop interface.
- Keep sender, timestamp, history, tags, and downloaded files in one stream.
- Automate transfers through a local HTTP API.
- Sync Telegram messages and files with a WebDAV endpoint through Telegram Bridge.

## Why it is useful

| Scenario | Benefit |
| --- | --- |
| Windows and macOS file sharing | Move files without relying on a centralized chat app. |
| Cross-device text sync | Send commands, links, notes, and Markdown snippets to another device. |
| NAS WebDAV transfer | Use an existing NAS or self-hosted WebDAV endpoint as the transfer inbox. |
| WeChat File Transfer alternative | Keep files in your own WebDAV storage and retain a searchable desktop history. |
| Local automation | Let scripts push logs, build artifacts, and status updates into the same inbox. |
| Telegram bridge | Keep Telegram as an input/output surface while WebDAV stays the storage source. |

## Core stack

| Part | Tech |
| --- | --- |
| Desktop shell | Tauri 2 |
| Backend | Rust |
| Local history | SQLite |
| Transfer layer | WebDAV |
| Automation | Local HTTP API |
| Bridge | Telegram Bot API polling |

## Quick start

1. Download the latest release from GitHub Releases.
2. Open the app and configure a WebDAV URL, username, and password.
3. Set the endpoint as active.
4. Send a small text message or file.
5. Sync another device and check the same message stream.

## HTTP API

Default address: `127.0.0.1:6011`

- `POST /api/send-text`
- `POST /api/send-file`

Example:

```bash
curl -X POST "http://127.0.0.1:6011/api/send-text" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "hello from curl",
    "format": "text"
  }'
```

## Telegram Bridge

Telegram Bridge keeps a Telegram chat and a WebDAV endpoint in sync.

- Telegram text messages sync to WebDAV.
- Telegram files sync to WebDAV.
- New WebDAV messages can be forwarded to Telegram.
- The desktop app manages bridge config and lifecycle.

## Links

- Website: https://yedsn.github.io/transfer-genie/
- Download page: https://yedsn.github.io/transfer-genie/download
- Docs: https://yedsn.github.io/transfer-genie/guide/quick-start
- Installation: https://yedsn.github.io/transfer-genie/guide/installation
- WebDAV file transfer use case: https://yedsn.github.io/transfer-genie/use-cases/webdav-file-transfer
- NAS WebDAV transfer use case: https://yedsn.github.io/transfer-genie/use-cases/nas-webdav-transfer
- WeChat File Transfer alternative: https://yedsn.github.io/transfer-genie/compare/transfer-genie-vs-wechat-file-transfer
- HTTP API docs: https://yedsn.github.io/transfer-genie/integrations/http-api
- Telegram Bridge docs: https://yedsn.github.io/transfer-genie/integrations/telegram-bridge
- GitHub Releases: https://github.com/yedsn/transfer-genie/releases/latest
