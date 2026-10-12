# Supabase integration probe

`supabase_probe` validates the deployed `transfer_genie` contract through the same public APIs that the desktop application will use. It creates two temporary ordinary Auth users and opens two independent sessions for the first user to represent two devices. It checks token refresh, Schema/RPC discovery, RPC-only writes, idempotency, revision conflicts, account isolation, Realtime delivery, disconnect/reconnect checkpoint recovery, private Storage access, metadata-failure retry, incremental pull, and tombstones. Temporary users and the uploaded object are removed before exit.

The probe needs three process-only environment variables:

- `TG_SUPABASE_URL`: Supabase API root URL.
- `TG_SUPABASE_ANON_KEY`: public/anon Key.
- `TG_SUPABASE_SERVICE_ROLE_KEY`: service-role Key used only to create and delete temporary test users.

Run it from the repository root:

```powershell
cargo run --bin supabase_probe
```

Never save the service-role Key in application settings, source control, test fixtures, command output, or desktop builds. A successful run prints one summary line without credentials. A failure prints only the failed contract step and returns a non-zero exit code.
