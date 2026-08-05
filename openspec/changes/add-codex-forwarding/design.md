## Context

Transfer Genie already sends text and Markdown through the WebDAV/local history pipeline. Users may want the same successfully sent content available in the system clipboard for pasting into another app.

## Goals / Non-Goals

**Goals:**

- Let users opt in to copying sent text or Markdown content after a successful send.
- Preserve the original send success/failure semantics.
- Keep the setting available both in Settings and near the composer send action.

**Non-Goals:**

- Do not copy file bytes or file metadata after file-only sends.
- Do not automate any external app window.
- Do not change local HTTP API request shapes for `/api/send-text` or `/api/send-file`.

## Decisions

- Decision: Add a small `send` settings group with `copy_after_send`.
  - Rationale: This is send behavior, not WebDAV, AI, Telegram, or API configuration.

- Decision: Copy only after the original text send succeeds.
  - Rationale: Copying a prompt that failed to send would make the optional behavior feel like the primary result.

- Decision: Use the existing browser clipboard helper on the frontend.
  - Rationale: The app already has a working copy path with fallback behavior and user feedback.

## Risks / Trade-offs

- Clipboard writes can fail due to platform/browser permissions -> Show the existing copy failure toast while keeping the send result successful.
- Users may expect file content to be copied -> The first version is limited to text and Markdown sends.
