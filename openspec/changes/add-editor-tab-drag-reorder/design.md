# Design

## Context

See `proposal.md` for motivation. The current workspace stores panes and tabs in a serializable reactive state and uses native HTML5 drag events for both tab ordering and pane-edge docking. Native tab-list hit testing has already produced a disabled cursor failure, while pane-edge docking still benefits from the existing geometric drop-zone logic.

## Goals / Non-Goals

**Goals:**

- Use a maintained third-party sorting implementation for tab order and cross-pane movement.
- Keep the existing workspace state and persistence path as the source of truth.
- Preserve pane-edge docking and message-to-pane drag behavior.

**Non-Goals:**

- Replace the workspace layout model or editor implementation.
- Add touch-specific layout gestures or change message-card dragging.

## Decisions

### Use SortableJS directly

Each `.cw-tabs-list` element is registered as a SortableJS list in one shared group. SortableJS supplies stable pointer hit testing, placeholder rendering, same-list ordering, and cross-list transfer. Its `onEnd` callback maps the dragged tab ID, destination pane ID, and final DOM index back to the existing `composerStore.moveDraft` operation. Vue then rerenders from authoritative state.

Using SortableJS directly avoids introducing a Vue wrapper whose model-update semantics would compete with the existing custom store. The alternative was to keep native HTML5 events, but that is precisely the unreliable path this revision replaces.

### Use SortableJS fallback dragging

SortableJS runs with `forceFallback`, attaches the floating drag clone to `body`, and keeps that clone out of pointer hit testing. This avoids the operating-system HTML5 drag cursor that WebView2 can render as a disabled icon even when a later drop succeeds. The same grouped Sortable lists continue to provide same-pane and cross-pane moves.

### Keep native pane docking outside the sortable list

The label row owns SortableJS sorting. During fallback dragging, a window-level mouse tracker reuses the existing geometric drop-zone function to identify pane-body center and edge targets; `onEnd` then performs the matching move or dock operation. Message-card drops keep their native path. This preserves pane docking without reintroducing the native tab drag cursor.

### Rebind instances after pane topology changes

Sortable instances are rebuilt after Vue renders a pane-list topology change. Rebinding is limited to pane IDs, not every text edit, and all instances are destroyed on unmount.

### Match VS Code's direct-manipulation model

SortableJS owns the live placeholder and sibling displacement while the pointer remains in a tab strip. The application does not independently recalculate cross-pane tab indices. When the pointer leaves the strip for an editor body, a rectangular drop preview shows the exact center, left, right, top, or bottom result. The outer quarter of each editor group is reserved for splitting and the central rectangle moves the tab into that group.

### Store editor groups as a nested split tree

The workspace persists a split tree whose leaves reference pane IDs and whose branch direction is horizontal or vertical. Splitting a pane replaces only that leaf, or inserts a sibling into an existing branch with the same direction. Legacy `layout` and `paneOrder` values remain derived compatibility metadata, and saved states without a tree are migrated on restore. This allows a vertical group on the left and an unsplit editor group on the right, matching VS Code's editor group model.

### Enforce move-only tab drag semantics

Tab drag payloads are valid only while their source tab still exists in workspace state. A missing source cancels the drop instead of falling back to tab creation. During SortableJS fallback dragging, native pane `drop` handlers do not commit tab changes; `onEnd` closes the drag session before applying the single state transition and removes any detached fallback clone after Vue reconciliation.

## Risks / Trade-offs

- [Sortable mutates DOM before Vue state commits] → Commit synchronously in `onEnd`; Vue immediately reconciles the list from workspace state.
- [A pane disappears after moving its last tab] → Resolve destination pane from the sortable container before committing; existing normalization handles empty source panes.
- [Third-party dependency increases bundle size] → Use dependency-free SortableJS directly and import only its production package.

## Migration Plan

Install `sortablejs`, replace native label-to-label handlers with Sortable instances, retain pane docking handlers, and verify same-pane ordering plus cross-pane movement in a real Edge browser. Rollback consists of removing the dependency and restoring the prior native label handlers.
