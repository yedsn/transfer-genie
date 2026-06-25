## MODIFIED Requirements
### Requirement: Application frontend shell
The application SHALL serve the desktop UI from an OpenDock-style Vue 3 + Vite application while preserving the existing Transfer Genie tabs, static assets, Tauri command usage, and current user-visible behavior.

#### Scenario: Production frontend bundle loads
- **WHEN** the Tauri production build serves the configured frontend distribution
- **THEN** the Vue 3 app shell mounts successfully from the Vite build output
- **AND** the home, marked, downloads, and settings tabs are available
- **AND** existing Tauri commands remain callable from the frontend runtime.

#### Scenario: Developer frontend server loads
- **WHEN** the developer runs the Vite development server and launches Tauri dev mode
- **THEN** Tauri loads http://127.0.0.1:5180
- **AND** frontend source changes can be rebuilt by Vite without editing Tauri backend code.

#### Scenario: Legacy runtime bridge remains available during migration
- **WHEN** the legacy runtime synchronizes tab message transfer or settings state
- **THEN** window.transferGenieVue exposes compatible sync and action registration methods
- **AND** the Vue 3 store reflects the synchronized state.
