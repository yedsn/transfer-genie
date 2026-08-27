## ADDED Requirements
### Requirement: Marked unfinished badge
The app shell SHALL show a red numeric badge on the marked tab when the active endpoint has unfinished marked messages. A marked message SHALL count as unfinished when it is marked and either has no due date or its due date is today or earlier. The badge SHALL be hidden when the unfinished count is zero and SHALL display `99+` when the count exceeds 99.

#### Scenario: Badge count visible
- **GIVEN** the active endpoint has one marked message with no due date and one marked message due today
- **WHEN** the app loads message counts
- **THEN** the marked tab badge displays `2`

#### Scenario: Future due dates excluded
- **GIVEN** the active endpoint has only marked messages with future due dates
- **WHEN** the app loads message counts
- **THEN** the marked tab badge is hidden

#### Scenario: Badge count cap
- **GIVEN** the active endpoint has more than 99 unfinished marked messages
- **WHEN** the app loads message counts
- **THEN** the marked tab badge displays `99+`
