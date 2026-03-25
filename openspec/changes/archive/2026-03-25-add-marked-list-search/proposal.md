# Change: Add search above the marked list

## Why
The dedicated marked tab supports tag filtering, but it does not let users quickly narrow the visible marked messages by keyword. When the marked list grows, finding a specific text message or file name becomes inefficient.

## What Changes
- Add a search input and an explicit search button above the marked list in the marked tab.
- Extend the marked-message backend command to search the current endpoint's marked messages by keyword before returning the result set.
- Show an explicit empty state when no marked message matches the current search keyword.

## Impact
- Affected specs: `message-feed`
- Affected code: `frontend/index.html`, `frontend/main.js`, `frontend/styles.css`, `src/main.rs`, `src/db.rs`
