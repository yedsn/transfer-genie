## Context

The current speech flow captures WAV audio in `src-ui/src/legacy-main.js`, sends it to `transcribe_speech`, then inserts or pastes recognized text depending on composer/system dictation context. Speech task history uses IndexedDB and stores successful task audio as an independent blob. The message model already stores text and file messages in SQLite and WebDAV history with backward-compatible optional fields.

## Goals / Non-Goals

**Goals:**
- Reuse the existing message send/storage lifecycle for speech audio so message deletion and cleanup own the source recording.
- Keep speech messages readable as text messages while preserving an audio playback action in the feed.
- Preserve failed speech-task retry behavior without creating standalone successful-task audio retention.

**Non-Goals:**
- Do not add a new remote storage tree outside WebDAV `files/`.
- Do not change ASR provider protocol or authentication.
- Do not replace the existing message feed architecture.

## Decisions

- Add backward-compatible speech attachment metadata to message records rather than inventing a parallel speech table. This keeps list, search, deletion, sync, and history behavior close to the existing message lifecycle. Alternative considered: keep successful audio in speech-task IndexedDB and link by task id; rejected because message cleanup would not naturally own the file.
- Send speech audio through a dedicated backend command that creates one logical message with transcript content plus source-audio file bytes. This avoids racing separate text/file sends and gives the backend one place to set metadata consistently. Alternative considered: call `send_text` then `send_file_data`; rejected because it would create two independent feed items instead of one associated message.
- Store the playable source audio as the message-associated file payload while the transcript remains indexed as text content. The UI can render the transcript as a text message and use the existing local/remote file open path for playback. Alternative considered: store transcript as the file payload and audio as auxiliary data; rejected because the source audio is the larger lifecycle-owned artifact and the transcript needs fast indexed display/search.
- Retain failed transcription audio in IndexedDB for retry, but replace successful task audio blobs with sent-message references. This preserves operational recovery while satisfying cleanup requirements for sent messages.
- Store polished transcript text as message content and raw transcript text in nullable message metadata. This keeps search/default display aligned with the sent polished message while preserving the original ASR result for display-only switching.
- Cap feed text previews at 2000 characters and force long text messages onto the full DOM renderer. Full text remains available in the preview dialog and downloaded file, preventing old clients from decoding or rendering very large text payloads directly in the feed.

## Risks / Trade-offs

- Existing clients without the new metadata will see the speech message as a file or text depending on final encoding strategy → keep metadata optional and preserve enough fields for graceful display.
- Playing audio directly from a remote-only message may require a temporary cache file → place any cache under existing message file handling and clear it when the message reference is cleared.
- SQLite/history metadata migration must remain backward compatible → add nullable fields and default old messages to non-speech behavior.

## Migration Plan

1. Add optional message metadata for speech transcript/source-audio association.
2. Update send and sync paths to persist and load the metadata.
3. Update the speech completion path to call the new speech-message send command and store successful task references instead of audio blobs.
4. Update feed rendering and playback actions for speech-derived messages.
5. Extend deletion and cleanup tests to cover associated audio references.
