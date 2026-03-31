# Tasks: Upgrade Marked Messages into a Dedicated Tab

## 1. Data and Commands
- [x] 1.1 Extend persisted history and the local database to store endpoint-scoped tag catalogs, per-message marked tags, and pin state while keeping legacy `marked` data readable.
- [x] 1.2 Update backend commands to support confirming a mark with tags, unmarking, creating/deleting/renaming tags, toggling pin state in the marked tab, and listing marked messages by tag.
- [x] 1.3 Add automated coverage for history/database migration, tag lifecycle constraints, metadata cleanup on unmark, and pinned ordering.

## 2. Navigation and Home Feed
- [x] 2.1 Replace the home-page marked-only entry point with a dedicated `标记` primary tab that shows the current endpoint's marked count.
- [x] 2.2 Add a mark modal on home-feed messages that supports selecting zero or more tags, creating tags, deleting tags, and confirming the mark.
- [x] 2.3 Keep one-click unmarking for already-marked home-feed messages and keep the count badge and list state synchronized.

## 3. Marked Tab Experience
- [x] 3.1 Implement a favorites-style marked list for the current endpoint, keep the existing message actions, and add a pin action.
- [x] 3.2 Implement an expandable tag filter area with tag filtering, tag creation, tag deletion, and double-click rename.
- [ ] 3.3 Add dedicated frontend validation coverage for tab switching, empty-tag mark confirmation, tag filtering, tag deletion linkage, and pin ordering.

## 4. Verification
- [x] 4.1 Run automated tests related to the marked-message capability.
- [ ] 4.2 Perform manual verification for the home feed, marked tab, endpoint switching, and history sync under the new interaction flow.
