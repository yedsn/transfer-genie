## Context

The current composer exposes AI through a one-click polish button, an action dropdown, and a right-click selection menu. These paths execute saved AI actions by `actionId`; users manage prompts in settings. The new prompt dialog needs two additional behaviors: execute a prompt that has not been saved, and save the current prompt into the existing settings-backed prompt action list.

The interaction should stay close to the composer and keep the existing safety model: no draft content is sent to AI unless the user explicitly runs a prompt, and generated output is only applied after preview confirmation.

## Goals / Non-Goals

**Goals:**
- Add a compact AI icon entry next to the existing one-click polish controls.
- Present the first-level dialog as a single prompt input box with secondary library/save icons at the lower-left and a run button on the right.
- Let users choose a prompt from built-in or saved actions to populate the input.
- Let users run an unsaved prompt once without adding name/category fields.
- Require name and category only after the user chooses to save the current prompt.
- Save prompts to the existing AI action settings list so they are reusable across settings, dropdown menus, and the new prompt library.
- Reuse the existing streaming, reasoning display, result preview, insert, and replace behavior.

**Non-Goals:**
- Multi-turn AI chat or conversation history.
- Automatic prompt saving after execution.
- Replacing the existing one-click polish button or AI action dropdown.
- Changing provider configuration or adding a new AI provider.

## Decisions

- **Use temporary prompt execution for unsaved runs.** The AI request should accept a temporary prompt payload in addition to the existing `actionId` path. This avoids creating transient settings entries for prompts the user does not save.
- **Persist saved prompts as normal custom AI actions.** Saved prompts should use the existing action schema with generated unique IDs, `builtin: false`, enabled state, category, name, prompt template, optional system prompt default, and existing output mode defaults. This keeps settings import/export and existing action menus consistent.
- **Keep the dialog single-purpose.** The first-level prompt dialog contains only the prompt input, prompt library icon, save icon, and run button. Name/category inputs appear only in the save flow after the save icon is clicked.
- **Reuse result preview instead of embedding AI output in the prompt dialog.** This preserves the current explicit apply flow and avoids implying a multi-turn chat UI.
- **Prompt library fills, not runs.** Selecting a prompt from the library fills the input box. The user still explicitly clicks run, which keeps the execution step visible and reversible.

## Risks / Trade-offs

- Temporary prompt execution could bypass saved-action validation if implemented separately. → Normalize temporary prompts through the same template rendering and provider validation path used by saved actions.
- Saving from the composer could create duplicate or poorly named prompts. → Require name and category during save and generate a unique ID without overwriting built-in actions.
- Adding another AI entry could crowd the composer toolbar. → Use an icon-only button with a tooltip and keep the existing text button unchanged.
- Prompt templates without `{{text}}` may produce surprising output. → Apply the same prompt-template rules as saved actions and document/validate how input text is included.
