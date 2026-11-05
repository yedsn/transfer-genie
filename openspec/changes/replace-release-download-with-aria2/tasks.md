# Tasks

## 1. Download engine migration

- [x] 1.1 Replace third-party-prefix and `urllib` asset downloading in `scripts/release/release_sync_gitee.py` with an aria2 subprocess wrapper that uses the official GitHub asset URL and `GITEE_SYNC_PROXY`; verify the script exposes aria2 configuration and reports its exit status.
- [x] 1.2 Preserve per-asset temporary `.part` files, up to 3 retries, cleanup on failure, and post-download size/SHA-256 validation; verify tests cover success, retry, missing aria2, size mismatch, and digest mismatch.
- [x] 1.3 Keep GitHub API authentication separate from file downloading and keep Gitee API/upload traffic direct; verify request construction never sends `GITHUB_TOKEN` to non-GitHub hosts.

## 2. GitHub Actions and Runner integration

- [x] 2.1 Remove `RELEASE_DOWNLOAD_PROXY_PREFIXES`, third-party host parsing, and cache-MISS handling from `.github/workflows/release.yml` and `.github/workflows/sync-gitee-release.yml`; verify both workflows contain only `GITEE_SYNC_PROXY` for GitHub download proxying.
- [x] 2.2 Add an aria2 preflight/version check on the self-hosted sync job and update Runner setup guidance with installation and verification commands; verify a missing `aria2c` fails before asset download with an actionable message.
- [x] 2.3 Preserve conditional `HTTP_PROXY`/`HTTPS_PROXY` setup before Checkout and direct Gitee `NO_PROXY` behavior; verify workflow YAML structure and shell snippets parse cleanly.

## 3. Reusable skill and project documentation

- [x] 3.1 Update `docs/develop/build-and-release.md` to document aria2 via `GITEE_SYNC_PROXY`, remove third-party proxy variable instructions, and explain required Runner prerequisites; verify every documented variable and command matches the workflow.
- [x] 3.2 Update the `my-github-release` skill rules, release workflow template, sync script template, Runner reference, setup guide, and required inputs to make aria2 the standard download path; verify no active skill template references `RELEASE_DOWNLOAD_PROXY_PREFIXES` or `ghfast.top`.

## 4. Integration verification

- [x] 4.1 Run Python syntax/unit tests for the sync script and a dry-run or mocked aria2 download through a proxy; verify logs show aria2, retry behavior, final response host, and SHA-256 success.
- [x] 4.2 Run OpenSpec strict validation for `replace-release-download-with-aria2` and review the final diff for unintended release or Gitee behavior changes.
