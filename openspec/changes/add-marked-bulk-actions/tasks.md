# Tasks: Add Bulk Actions to the Marked Tab

## 1. Commands and Data Flow
- [x] 1.1 Add a backend command that updates the tag set for multiple marked messages in the active endpoint while validating tag IDs and synchronizing history plus local DB metadata.
- [x] 1.2 Reuse the existing multi-delete flow for marked-tab selections, ensuring the marked count and list state stay synchronized after deletion.
- [x] 1.3 Add automated coverage for bulk tag updates, invalid tag filtering, unselected no-op behavior, and marked-list refresh after bulk delete.

## 2. Marked Tab Interaction
- [x] 2.1 Add a marked-tab selection mode with per-item checkboxes, a selection toolbar, and a select-all action scoped to the current marked list results.
- [x] 2.2 Add a batch tag-edit action in the marked tab that opens a tag-selection dialog and applies the confirmed tag set to all selected marked messages.
- [x] 2.3 Add a batch delete action in the marked tab that routes through the existing delete confirmation flow and exits selection mode when complete.

## 3. Verification
- [ ] 3.1 Manually verify marked-tab multi-select with plain lists, tag-filtered lists, search results, pagination, batch tag updates, and batch deletion.
