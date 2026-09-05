## Why

系统听写和编辑器录音现在共用提示音，但内置音色只有基础选项，快捷键反馈不够接近 Typeless 那种轻巧、明确的手感。

## What Changes

- 在录音提示音设置中新增两套内置提示音选项。
- 新选项继续复用现有 Web Audio 提示音播放路径，不新增外部音频文件。
- 预览、编辑器录音按钮、系统听写快捷键开始/结束录音都使用同一套选中的提示音。

## Impact

- Affected specs: `client-settings`
- Affected code: speech cue sound settings UI, cue sound normalization, Web Audio cue profile selection, speech UI smoke tests
