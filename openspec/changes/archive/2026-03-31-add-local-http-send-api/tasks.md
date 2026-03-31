## 1. Implementation
- [x] 1.1 Add `POST /api/send-text` and keep it aligned with the existing text send pipeline
- [x] 1.2 Validate HTTP text format input and restrict it to `text` or `markdown`
- [x] 1.3 Add local HTTP API runtime settings for enable switch, bind address, bind port, and runtime status
- [x] 1.4 Allow non-local bind addresses and default the API binding to `127.0.0.1:6011`
- [x] 1.5 Update the settings UI to show the HTTP API in its own configuration section
- [x] 1.6 Add optional `markedOptions` support to both HTTP send endpoints and reuse the existing marked/tag workflow
- [x] 1.7 Extend the Node test script so it can exercise both file/text routes and marked/tag payloads
- [x] 1.8 Add or update tests covering HTTP text request parsing, marked options parsing, and route validation behavior
- [x] 1.9 Run `cargo test`, `node --check tests/test_local_http_api.js`, dry-run script checks, and `openspec validate add-local-http-send-api --strict`
