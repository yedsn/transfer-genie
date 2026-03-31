## Context
The local HTTP API change already reuses the existing send pipeline for file uploads and text messages, and the runtime configuration work is already in place. The remaining issue is that HTTP callers cannot yet pass the same marked state and tag operations that the frontend send flow already supports.

## Goals / Non-Goals
- Goals:
  - Support optional `markedOptions` on both local HTTP send endpoints
  - Reuse the existing marked/tag send model and persistence workflow
  - Keep the request model simple for external callers
- Non-Goals:
  - Add authentication, access control, or TLS
  - Introduce a new marked/tag DTO just for HTTP
  - Change the existing settings layout or send pipeline semantics

## Decisions
- Decision: Reuse `SendMarkedOptionsInput` as the HTTP-facing payload shape for marked state and tag operations.
  - Why: This keeps HTTP callers aligned with the existing send pipeline and avoids duplicate conversion logic.
- Decision: Accept `markedOptions` as a multipart text field on `POST /api/send-file` and as a JSON property on `POST /api/send-text`.
  - Why: Each endpoint keeps its current request model while gaining the same marked/tag capability with minimal code changes.
- Decision: Reject invalid `markedOptions` input as a 4xx request error before starting the send flow.
  - Why: Bad marked/tag input is a client request problem and should not create partially sent or partially indexed messages.

## Risks / Trade-offs
- Risk: Multipart parsing becomes slightly more complex because the file route now needs to read both file parts and text fields.
  - Mitigation: Keep the implementation scoped to one optional text field, `markedOptions`, and leave all existing upload behavior unchanged.
- Risk: HTTP callers may send malformed tag payloads.
  - Mitigation: Parse and validate `markedOptions` before calling the existing send pipeline and return a clear 4xx error.

## Migration Plan
1. Extend the HTTP text request model to include optional `markedOptions`.
2. Parse optional `markedOptions` from multipart requests in the file send route.
3. Pass parsed marked options into the existing `send_text_impl` and `send_file_data_impl` functions.
4. Extend the Node test script and OpenSpec delta to cover the new behavior.

## Open Questions
- None for this change. The HTTP API reuses the existing `markedOptions` shape and semantics.
