# Telegram Bridge

`telegram_bridge` bridges one Telegram bot chat and one WebDAV message stream.

The recommended way is now to let the desktop app manage it from the settings page:

- Save Telegram settings in `Settings -> Telegram Bridge`
- Optionally enable `Telegram Proxy` when Telegram Bot API access must go through HTTP/SOCKS5 proxy
- The app prefills the proxy address with `http://127.0.0.1:7890`, and you can replace it with another proxy URL
- The app-managed bridge always follows the current active WebDAV endpoint
- Start or stop the bridge directly from the app
- Optionally enable bridge auto start after the desktop app launches
- Switching the active WebDAV endpoint automatically restarts a running app-managed bridge

The standalone binary is still available for manual debugging and advanced use cases.

## What It Does

- Imports text messages from one configured Telegram `chat_id` into WebDAV `files/` and `history.json`
- Imports uploaded Telegram files into the same WebDAV message format used by the desktop app
- Scans WebDAV for live messages created after the bridge is already running
- Sends text with `sendMessage`
- Sends files with `sendDocument`
- Persists bridge state locally to avoid duplicate imports, duplicate exports, and Telegram echo loops

## Scope

- One bridge instance maps to one WebDAV endpoint and one Telegram chat
- Transport is Telegram Bot API long polling
- WebDAV remains the single source of truth
- MVP supports plain text plus common file-style Telegram attachments
- MVP does not handle Telegram message edits, deletes, reactions, or rich text rendering

## Config

Create `telegram-bridge.json` in the project root or pass an explicit path as the first CLI argument.

Example:

```json
{
  "telegram_bot_token": "123456:replace-me",
  "allowed_chat_id": 123456789,
  "proxy_url": "socks5://127.0.0.1:1080",
  "poll_interval_secs": 5,
  "state_path": "./data/telegram-bridge-state.json",
  "temp_dir": "./data/telegram-bridge-tmp",
  "webdav": {
    "id": "main",
    "name": "Main WebDAV",
    "url": "https://example.com/dav/TransferGenie/",
    "username": "user",
    "password": "pass",
    "enabled": true
  }
}
```

`proxy_url` is optional. Leave it empty or omit it to connect directly. The bridge applies this proxy only to Telegram Bot API requests; WebDAV traffic stays direct.

## Run

```powershell
cargo run --bin telegram_bridge -- .\telegram-bridge.json
```

Or set:

```powershell
$env:TRANSFER_GENIE_TELEGRAM_BRIDGE_CONFIG="E:\path\to\telegram-bridge.json"
cargo run --bin telegram_bridge
```

## Deployment Notes

- Keep the process running continuously, otherwise Telegram messages will not be imported until it starts again
- WebDAV messages that already existed before the bridge started are not replayed into Telegram on startup
- Messages created while the bridge is stopped remain in WebDAV only; only messages created after the bridge is running are forwarded to Telegram
- The bridge stores its own state file; back it up together with the config file if you want stable dedupe after restarts
- If you want multiple chats, run multiple bridge instances with separate config/state files and separate WebDAV endpoints

## Limits

- The bridge rejects Telegram inbound files larger than the current `getFile` limit expected by the implementation
- The bridge marks oversized WebDAV files as permanent outbound failures instead of retrying forever
- Retryable Telegram or WebDAV failures are kept in state and retried on later scans

## Finding `chat_id`

- Start the bridge with a temporary config
- Send a message to the bot from the target chat
- If the `chat_id` is not allowed yet, the bridge logs an `event=telegram_unauthorized_update` line that includes the actual `chat_id`
- Copy that `chat_id` into the final config and restart the service

## Troubleshooting

- `telegram_poll_failed`: Telegram Bot API request failed; check token, network, or rate limiting
- `telegram_inbound_failed`: Telegram update could not be mirrored into WebDAV; check WebDAV credentials and remote write access
- `webdav_outbound_retryable_failure`: temporary Telegram or WebDAV issue; the bridge will retry later
- `webdav_outbound_permanent_failure`: terminal error such as unsupported or oversized outbound file; inspect the state file for the recorded reason
