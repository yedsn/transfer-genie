#!/usr/bin/env python3

import argparse
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from shutil import copyfile


DEFAULT_GITHUB_OWNER = "yedsn"
DEFAULT_GITHUB_REPO = "transfer-genie"
DEFAULT_GITEE_OWNER = "hongxiaojian"
DEFAULT_GITEE_REPO = "transfer-genie"
LATEST_RELEASE_TAG = "latest"
HTTP_TIMEOUT_SECS = 60
DOWNLOAD_TIMEOUT_SECS = 600
UPLOAD_CONNECT_TIMEOUT_SECS = 30
UPLOAD_MAX_TIME_SECS = 1800


def log(message: str) -> None:
    print(message, flush=True)


def fail(message: str) -> None:
    print(f"[sync-gitee] Error: {message}", file=sys.stderr, flush=True)
    raise SystemExit(1)


def request_json(method: str, url: str, *, data=None, headers=None):
    headers = headers or {}
    request_data = None
    if data is not None:
        encoded = urllib.parse.urlencode(data).encode("utf-8")
        request_data = encoded
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            **headers,
        }

    req = urllib.request.Request(url, data=request_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SECS) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        fail(f"{method} {url} failed with HTTP {exc.code}: {body}")
    except urllib.error.URLError as exc:
        fail(f"{method} {url} failed: {exc}")


def try_request_json(method: str, url: str, *, data=None, headers=None):
    headers = headers or {}
    request_data = None
    if data is not None:
        encoded = urllib.parse.urlencode(data).encode("utf-8")
        request_data = encoded
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            **headers,
        }

    req = urllib.request.Request(url, data=request_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SECS) as response:
            return json.load(response)
    except Exception as exc:
        print(
            f"[sync-gitee] Warning: {method} {url} failed, continuing: {exc}",
            file=sys.stderr,
            flush=True,
        )
        return None


def request_no_content(method: str, url: str) -> None:
    req = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SECS):
            return
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        fail(f"{method} {url} failed with HTTP {exc.code}: {body}")
    except urllib.error.URLError as exc:
        fail(f"{method} {url} failed: {exc}")


def download_file(url: str, target_path: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "transfer-genie-release-sync"})
    try:
        with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT_SECS) as response, target_path.open("wb") as fh:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                fh.write(chunk)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        fail(f"Download failed for {url} with HTTP {exc.code}: {body}")
    except urllib.error.URLError as exc:
        fail(f"Download failed for {url}: {exc}")


def upload_attachment(file_path: Path, upload_url: str) -> None:
    subprocess.run(
        [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--connect-timeout",
            str(UPLOAD_CONNECT_TIMEOUT_SECS),
            "--max-time",
            str(UPLOAD_MAX_TIME_SECS),
            "--retry",
            "2",
            "--request",
            "POST",
            "--form",
            f"file=@{file_path}",
            upload_url,
        ],
        check=True,
    )


def rewrite_latest_json_urls(
    source_path: Path,
    target_path: Path,
    *,
    gitee_owner: str,
    gitee_repo: str,
    download_tag: str,
) -> None:
    payload = json.loads(source_path.read_text(encoding="utf-8"))
    platforms = payload.get("platforms", {})
    for item in platforms.values():
        url = item.get("url")
        if not url:
            continue
        filename = Path(urllib.parse.urlparse(url).path).name
        item["url"] = (
            f"https://gitee.com/{gitee_owner}/{gitee_repo}/releases/download/{download_tag}/{filename}"
        )
    target_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=None, separators=(",", ":")),
        encoding="utf-8",
    )


def ensure_release(
    *,
    token: str,
    gitee_owner: str,
    gitee_repo: str,
    releases: list,
    tag_name: str,
    release_name: str,
    release_body: str,
    target_commitish: str,
):
    existing_release = next(
        (item for item in releases if item.get("tag_name") == tag_name),
        None,
    )
    release_url = f"https://gitee.com/api/v5/repos/{gitee_owner}/{gitee_repo}/releases"

    if existing_release:
        release_id = existing_release.get("id")
        if not release_id:
            fail(f"Gitee release {tag_name} exists but does not include id")
        log(f"[sync-gitee] Updating existing Gitee release #{release_id} ({tag_name})")
        updated_release = try_request_json(
            "PATCH",
            f"{release_url}/{release_id}",
            data={
                "access_token": token,
                "tag_name": tag_name,
                "name": release_name,
                "body": release_body,
                "target_commitish": target_commitish,
                "prerelease": "false",
            },
        )
        return updated_release or existing_release

    log(f"[sync-gitee] Creating Gitee release for tag {tag_name}")
    return request_json(
        "POST",
        release_url,
        data={
            "access_token": token,
            "tag_name": tag_name,
            "name": release_name,
            "body": release_body,
            "target_commitish": target_commitish,
            "prerelease": "false",
        },
    )


def sync_release_assets(
    *,
    token: str,
    gitee_owner: str,
    gitee_repo: str,
    release_id: int,
    files: list,
    keep_existing_assets: bool,
) -> None:
    attachments_url = (
        f"https://gitee.com/api/v5/repos/{gitee_owner}/{gitee_repo}/releases/{release_id}/attach_files"
        f"?access_token={urllib.parse.quote(token)}&per_page=100"
    )
    existing_attachments = request_json("GET", attachments_url)
    attachments_by_name = {
        item.get("name"): item for item in existing_attachments if item.get("name")
    }

    for file_path in files:
        existing = attachments_by_name.get(file_path.name)
        if existing and not keep_existing_assets:
            attachment_id = existing.get("id")
            if attachment_id:
                delete_url = (
                    f"https://gitee.com/api/v5/repos/{gitee_owner}/{gitee_repo}/releases/"
                    f"{release_id}/attach_files/{attachment_id}?access_token={urllib.parse.quote(token)}"
                )
                log(f"[sync-gitee] Deleting existing asset {file_path.name}")
                request_no_content("DELETE", delete_url)

        upload_url = (
            f"https://gitee.com/api/v5/repos/{gitee_owner}/{gitee_repo}/releases/"
            f"{release_id}/attach_files?access_token={urllib.parse.quote(token)}"
        )
        log(f"[sync-gitee] Uploading {file_path.name}")
        upload_attachment(file_path, upload_url)


def get_current_branch() -> str:
    try:
        output = subprocess.check_output(
            ["git", "branch", "--show-current"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        return output or "master"
    except Exception:
        return "master"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Sync a GitHub release and its assets to Gitee Release.",
    )
    parser.add_argument(
        "--tag",
        help="Git tag to sync, for example v0.1.1. Defaults to the latest GitHub release.",
    )
    parser.add_argument("--github-owner", default=DEFAULT_GITHUB_OWNER)
    parser.add_argument("--github-repo", default=DEFAULT_GITHUB_REPO)
    parser.add_argument("--gitee-owner", default=DEFAULT_GITEE_OWNER)
    parser.add_argument("--gitee-repo", default=DEFAULT_GITEE_REPO)
    parser.add_argument(
        "--target-commitish",
        default=get_current_branch(),
        help="Branch name used when creating a Gitee release if it does not exist.",
    )
    parser.add_argument(
        "--keep-existing-assets",
        action="store_true",
        help="Do not delete Gitee assets with the same filename before upload.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    token = os.environ.get("GITEE_ACCESS_TOKEN", "").strip()
    if not token:
        fail("Missing GITEE_ACCESS_TOKEN environment variable")

    if args.tag:
        github_release_url = (
            f"https://api.github.com/repos/{args.github_owner}/{args.github_repo}/releases/tags/{args.tag}"
        )
    else:
        github_release_url = (
            f"https://api.github.com/repos/{args.github_owner}/{args.github_repo}/releases/latest"
        )

    github_release = request_json(
        "GET",
        github_release_url,
        headers={"User-Agent": "transfer-genie-release-sync"},
    )

    tag_name = github_release.get("tag_name")
    release_name = github_release.get("name") or tag_name
    release_body = github_release.get("body") or ""
    assets = github_release.get("assets") or []

    if not tag_name:
        fail("GitHub release response does not include tag_name")
    if not assets:
        fail(f"GitHub release {tag_name} has no assets to sync")

    log(f"[sync-gitee] Syncing release {tag_name}")
    log(f"[sync-gitee] GitHub assets: {len(assets)}")

    releases_url = (
        f"https://gitee.com/api/v5/repos/{args.gitee_owner}/{args.gitee_repo}/releases"
        f"?access_token={urllib.parse.quote(token)}&per_page=100"
    )
    gitee_releases = request_json("GET", releases_url)

    with tempfile.TemporaryDirectory(prefix="transfer-genie-gitee-sync-") as tmp_dir:
        tmp_root = Path(tmp_dir)
        versioned_files = []
        latest_files = []
        for asset in assets:
            name = asset.get("name")
            download_url = asset.get("browser_download_url")
            if not name or not download_url:
                fail(f"GitHub release asset is missing name or browser_download_url: {asset}")

            target_path = tmp_root / name
            log(f"[sync-gitee] Downloading {name}")
            download_file(download_url, target_path)
            versioned_target = tmp_root / f"versioned-{name}"
            latest_target = tmp_root / f"latest-{name}"
            if name == "latest.json":
                rewrite_latest_json_urls(
                    target_path,
                    versioned_target,
                    gitee_owner=args.gitee_owner,
                    gitee_repo=args.gitee_repo,
                    download_tag=tag_name,
                )
                rewrite_latest_json_urls(
                    target_path,
                    latest_target,
                    gitee_owner=args.gitee_owner,
                    gitee_repo=args.gitee_repo,
                    download_tag=LATEST_RELEASE_TAG,
                )
            else:
                copyfile(target_path, versioned_target)
                copyfile(target_path, latest_target)
            versioned_files.append(versioned_target)
            latest_files.append(latest_target)

        versioned_release = ensure_release(
            token=token,
            gitee_owner=args.gitee_owner,
            gitee_repo=args.gitee_repo,
            releases=gitee_releases,
            tag_name=tag_name,
            release_name=release_name,
            release_body=release_body,
            target_commitish=args.target_commitish,
        )
        versioned_release_id = versioned_release.get("id")
        if not versioned_release_id:
            fail(f"Gitee release {tag_name} response does not include id")
        sync_release_assets(
            token=token,
            gitee_owner=args.gitee_owner,
            gitee_repo=args.gitee_repo,
            release_id=versioned_release_id,
            files=versioned_files,
            keep_existing_assets=args.keep_existing_assets,
        )

        latest_release = ensure_release(
            token=token,
            gitee_owner=args.gitee_owner,
            gitee_repo=args.gitee_repo,
            releases=gitee_releases,
            tag_name=LATEST_RELEASE_TAG,
            release_name=f"Transfer Genie Latest ({tag_name})",
            release_body=f"Auto-maintained latest release for {tag_name}.\n\n{release_body}",
            target_commitish=args.target_commitish,
        )
        latest_release_id = latest_release.get("id")
        if not latest_release_id:
            fail(f"Gitee release {LATEST_RELEASE_TAG} response does not include id")
        sync_release_assets(
            token=token,
            gitee_owner=args.gitee_owner,
            gitee_repo=args.gitee_repo,
            release_id=latest_release_id,
            files=latest_files,
            keep_existing_assets=args.keep_existing_assets,
        )

    log("[sync-gitee] Done")
    log(
        f"[sync-gitee] Verify fixed latest.json: "
        f"https://gitee.com/{args.gitee_owner}/{args.gitee_repo}/releases/download/latest/latest.json"
    )


if __name__ == "__main__":
    main()
