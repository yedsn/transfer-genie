# Change: Add marked due date badge

## Why
Users need a quick way to see how many marked items currently need attention without opening the marked list.

## What Changes
- Add an optional day-precision due date to marked messages.
- Count marked messages as unfinished when they have no due date or their due date is today or earlier.
- Show the unfinished count as a red badge on the marked tab, capped at `99+`.
- Add a pending filter in the marked list.

## Impact
- Affected specs: message-feed, app-shell
- Affected code: Rust message/history/database models and marked-message commands; marked UI, badge, modal, filters, and tests.
