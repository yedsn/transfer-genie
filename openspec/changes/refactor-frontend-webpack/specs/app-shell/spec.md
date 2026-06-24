## ADDED Requirements
### Requirement: Frontend Application Shell
The application SHALL serve the desktop UI from a webpack-built Vue application while preserving the existing tab shell, static assets, Tauri command usage, and current user-visible behavior.

#### Scenario: Production bundle loads in Tauri
- **WHEN** the Tauri production build serves the configured frontend distribution
- **THEN** the Vue app shell mounts successfully
- **AND** the home, marked, downloads, and settings tabs are available
- **AND** existing Tauri commands remain callable from the frontend runtime.

#### Scenario: Development server loads in Tauri
- **WHEN** the developer runs the webpack development server and launches Tauri dev mode
- **THEN** Tauri loads the configured local dev URL
- **AND** frontend source changes can be rebuilt by webpack without editing Tauri backend code.

