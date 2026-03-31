# Change: add local HTTP send API

## Why
The app already supports sending files and text from the frontend, but external programs still need a stable local HTTP API to submit content into the active WebDAV endpoint. The current change already introduced local HTTP file and text send support plus runtime configuration; this follow-up closes the remaining gap by letting HTTP callers also control marked state and marked tags in the same request.

## What Changes
- Add configurable local HTTP API settings with enable switch, bind address, and bind port, defaulting to `127.0.0.1:6011`
- Allow the API to bind to non-local addresses such as `0.0.0.0` or a LAN IP
- Show the HTTP API in its own settings section with enable state, bind address, bind port, and runtime status
- Restart the local HTTP service immediately after saving changed bind address or port
- Keep `POST /api/send-file` behavior for file upload and add `POST /api/send-text` for JSON text send requests
- Add optional `markedOptions` support to both `POST /api/send-file` and `POST /api/send-text` so external callers can set marked state and tag operations together with the send request

## Impact
- Affected specs: `http-ingest`, `client-settings`
- Affected code: `src/types.rs`, `src/main.rs`, `frontend/index.html`, `frontend/main.js`, `frontend/styles.css`, `tests/test_local_http_api.js`
