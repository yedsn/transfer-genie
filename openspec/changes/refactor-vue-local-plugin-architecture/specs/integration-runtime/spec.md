## ADDED Requirements
### Requirement: Sync module runtime contract
The application SHALL execute built-in sync capabilities through a module runtime contract instead of hard-coding each integration directly into the app shell.

#### Scenario: Start sync module
- **WHEN** the application initializes a configured sync module
- **THEN** it resolves the module runtime context, local workspace paths, and enablement state before running sync work

#### Scenario: Stop disabled sync module
- **WHEN** a sync module is disabled
- **THEN** the application skips scheduled execution for that module

### Requirement: Bridge module runtime contract
The application SHALL execute long-running bridge capabilities through a module runtime contract with isolated runtime state.

#### Scenario: Start bridge module
- **WHEN** the user or auto-start logic starts a bridge module
- **THEN** the application creates or reuses that module's runtime directory and launches it through the bridge runtime contract

#### Scenario: Restart bridge module after config change
- **WHEN** a bridge module configuration changes in a way that affects runtime behavior
- **THEN** the application restarts only that module
- **AND** leaves unrelated modules unaffected
