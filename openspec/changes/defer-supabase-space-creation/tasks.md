# Tasks

## 1. Binding state and compatibility

- [ ] 1.1 Extend Supabase profile settings with backward-compatible binding states (unbound, bound, needs-attention), stop normalizing an empty `space_id` into an automatic UUID, and verify Rust settings tests cover new profiles plus legacy serialized settings.
- [ ] 1.2 Add one authoritative backend guard for operations that require a bound Supabase profile, apply it to activation and data-transfer eligibility, and verify unbound profiles cannot become active or be selected as transfer endpoints.
- [ ] 1.3 Classify legacy profiles without silently mutating remote data: preserve accessible bindings, mark empty invalid profiles unbound, and preserve profiles with local messages/outbox/conflicts as needs-attention; verify migration tests cover all three outcomes without data loss.

## 2. Draft binding session and explicit Space APIs

- [ ] 2.1 Add a Rust-managed short-lived binding-flow context for unsaved Supabase drafts, including expiration, cancellation and project-fingerprint invalidation; verify tokens never appear in Settings, frontend payloads, logs or configuration exports.
- [ ] 2.2 Add draft connection-test and ordinary-user sign-in commands that operate through the binding-flow context, and verify successful login, invalid credentials, project changes and explicit cancellation clean up state correctly.
- [ ] 2.3 Add read-only account Space listing for binding flows with message/storage statistics where available, and verify listing zero, one and multiple Spaces does not change the remote Space count.
- [ ] 2.4 Split Space accessibility validation from provisioning, add a dedicated idempotent user-confirmed create-Space operation, and verify connection tests, login, listing and failed validation never invoke creation while duplicate create retries return the same result.
- [ ] 2.5 Add an atomic complete-binding command that creates the formal profile and moves the secure Session into its profile credential scope only after final confirmation; verify cancellation before completion leaves no profile or persisted Session.

## 3. Sync and remote-safety boundaries

- [ ] 3.1 Replace sync-time `space_upsert`/`ensure_space` creation semantics with side-effect-free accessibility validation, and verify a missing or unauthorized Space stops sync without increasing the remote Space count.
- [ ] 3.2 Enforce the bound-profile guard for outbox push, message send, attachment upload/download, history paging and Realtime startup; verify each unbound entry point returns a clear recoverable error and performs no remote business write.
- [ ] 3.3 Handle a bound Space becoming missing or inaccessible by stopping writes and Realtime while retaining local caches, outbox and conflicts; verify reauthentication or explicit repair can resume without losing local work.

## 4. Supabase binding wizard UI

- [ ] 4.1 Refactor the Supabase add/edit modal into the four steps “连接服务、登录账号、选择空间、确认绑定”, with a visible step indicator, stable back/next actions and non-wrapping controls; verify the frontend smoke test covers step gating and keyboard/modal close behavior.
- [x] 4.2 Implement the connection step with API URL, anon key, layered test results and downstream-state invalidation when connection fields change; verify a failed test cannot advance and changing a tested project clears login and Space selection.
- [x] 4.3 Implement the account step with login form before authentication and account summary plus sign-out afterward; verify sign-out returns to the form and clears the selected Space without affecting other saved profiles.
- [ ] 4.4 Implement the Space step with zero/one/multiple-Space states, explicit selection and a separate confirmed “新建空间” form; verify one existing Space is recommended but not automatically bound and opening the step never creates a Space.
- [ ] 4.5 Implement the confirmation step and cancellation cleanup, persist only after “完成绑定”, and verify closing at every earlier step leaves the storage-space list unchanged.

## 5. Editing, switching and repair flows

- [x] 5.1 Initialize the wizard from a bound profile without changing it until final confirmation, and verify editing the display name or reconfirming the same Space updates the original profile ID rather than creating another profile.
- [ ] 5.2 Reuse the existing in-place account-Space switch checks, preserve the profile connection and Session, and verify pending outbox, conflicts or transfer tasks block switching while a successful switch creates no extra local profile.
- [ ] 5.3 Add repair UI for unbound and needs-attention legacy profiles with explicit choices to select an existing Space, deliberately restore/create the retained Space ID, or leave unresolved; verify none of these screens silently deletes local or remote data.

## 6. Integration verification and operator guidance

- [x] 6.1 Run the targeted Rust and frontend suites for settings normalization, draft Auth, Space list/create, in-place switching, sync guards and wizard behavior, then run `cargo test` and the existing UI smoke test; verify all checks pass.
- [ ] 6.2 Validate against a real authorized Supabase test account by recording Space counts before and after connect, login, list, cancel, explicit create, bind, restart and switch flows; verify only the explicit create step changes the count and Auth/RLS/Realtime/Storage still work after binding.
- [ ] 6.3 Update the Supabase setup/user documentation to describe the four-step binding flow, existing-Space reuse, explicit creation, unbound/needs-attention recovery and the rule that normal sync never creates a Space; verify screenshots or labels match the implemented UI.
