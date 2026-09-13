# Change: Retain Speech Button Output in Editor

## Why

Starting speech input from the composer voice button currently clears the editor after recognition and only sends the transcript as a message. Users also expect the final transcript to remain available in the editor for further editing.

## What Changes

- Insert the final recognized or polished transcript into the active composer editor before the existing background message send.
- Preserve existing chunking, polish-before-insert behavior, clipboard copying, speech history, and message sending.
- Keep system dictation behavior unchanged: shortcut-triggered dictation continues to paste only into the output-time focused target and does not additionally write the Transfer Genie editor.

## Impact

- Affected specs: `speech-input`
- Affected code: `src-ui/src/legacy-main.js`
- Tests: `tests/test_speech_to_text_ui_smoke.js`
