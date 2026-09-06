## Why

当前录音提示音大多是单一下落或单一提示音，用户希望有更明确的“双音”反馈，听感更接近 Typeless 那种“噔噔”式开始/结束确认。

## What Changes

- 在现有录音提示音选项中新增多个双音反馈选项。
- 这些选项通过现有 Web Audio 机制生成两段连续提示音，不新增外部音频文件。
- 录音按钮、系统听写快捷键和提示音试听都支持该双音选项。

## Impact

- Affected specs: `client-settings`
- Affected code: speech cue sound option rendering, cue sound playback profile generation, settings normalization, smoke tests
