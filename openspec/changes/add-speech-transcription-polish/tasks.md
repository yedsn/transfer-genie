## 1. Settings

- [ ] 1.1 Add backward-compatible speech polish settings fields with defaults and verify Rust/default settings tests or `cargo check` pass
- [ ] 1.2 Add speech-to-text settings UI controls for enabling polish and choosing an AI prompt action, and verify the controls render with the default `polish` action
- [ ] 1.3 Persist speech polish enabled/action-id values through settings save/load and verify existing settings smoke tests still pass

## 2. Polish Pipeline

- [ ] 2.1 Reuse the existing AI action execution path to polish transcript text without opening the editor preview, and verify a selected prompt action is applied to sample transcript text
- [ ] 2.2 Wire speech transcription completion to run polish before final insert/copy/paste when enabled, and verify raw output remains unchanged when disabled
- [ ] 2.3 Add failure fallback so polish errors keep the raw transcript and verify failed polish does not drop speech text

## 3. System Dictation Status

- [ ] 3.1 Add a compact polishing state to the system dictation overlay and verify it can display `正在进行润色`
- [ ] 3.2 Show the polishing state after system dictation ASR completes and before final paste/insert when polish is enabled, and verify the overlay closes after final output

## 4. Verification

- [ ] 4.1 Update focused speech-to-text UI smoke coverage for enabled/disabled polish, action selection, system dictation status, and fallback behavior
- [ ] 4.2 Run `npm run build`, `cargo check`, relevant smoke tests, and `openspec validate add-speech-transcription-polish --strict`
