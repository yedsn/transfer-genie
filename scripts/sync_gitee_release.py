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


DEFAULT_GITHUB_OWNER = "yedsn"
DEFAULT_GITHUB_REPO = "transfer-genie"
DEFAULT_GITEE_OWNER = "hongxiaojian"
DEFAULT_GITEE_REPO = "transfer-genie"


def fail(message: str) -> None:
    print(f"[sync-gitee] Error: {message}", file=sys.stderr)
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
        with urllib.request.urlopen(req) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        fail(f"{method} {url} failed with HTTP {exc.code}: {body}")
    except urllib.error.URLError as exc:
        fail(f"{method} {url} failed: {exc}")


def request_no_content(method: str, url: str) -> None:
    req = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(req):
            return
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        fail(f"{method} {url} failed with HTTP {exc.code}: {body}")
    except urllib.error.URLError as exc:
        fail(f"{method} {url} failed: {exc}")


def download_file(url: str, target_path: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "transfer-genie-release-sync"})
    try:
        with urllib.request.urlopen(req) as response, target_path.open("wb") as fh:
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
            "--request",
            "POST",
            "--form",
            f"file=@{file_path}",
            upload_url,
        ],
        check=True,
    )


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

    print(f"[sync-gitee] Syncing release {tag_name}")
    print(f"[sync-gitee] GitHub assets: {len(assets)}")

    releases_url = (
        f"https://gitee.com/api/v5/repos/{args.gitee_owner}/{args.gitee_repo}/releases"
        f"?access_token={urllib.parse.quote(token)}&per_page=100"
    )
    gitee_releases = request_json("GET", releases_url)
    existing_release = next(
        (item for item in gitee_releases if item.get("tag_name") == tag_name),
        None,
    )

    if existing_release:
        gitee_release = existing_release
        print(f"[sync-gitee] Found existing Gitee release #{gitee_release.get('id')}")
    else:
        create_url = f"https://gitee.com/api/v5/repos/{args.gitee_owner}/{args.gitee_repo}/releases"
        gitee_release = request_json(
            "POST",
            create_url,
            data={
                "access_token": token,
                "tag_name": tag_name,
                "name": release_name,
                "body": release_body,
                "target_commitish": args.target_commitish,
                "prerelease": "false",
            },
        )
        print(f"[sync-gitee] Created Gitee release #{gitee_release.get('id')}")

    release_id = gitee_release.get("id")
    if not release_id:
        fail("Gitee release response does not include id")

    attachments_url = (
        f"https://gitee.com/api/v5/repos/{args.gitee_owner}/{args.gitee_repo}/releases/{release_id}/attach_files"
        f"?access_token={urllib.parse.quote(token)}&per_page=100"
    )
    existing_attachments = request_json("GET", attachments_url)
    attachments_by_name = {
        item.get("name"): item for item in existing_attachments if item.get("name")
    }

    with tempfile.TemporaryDirectory(prefix="transfer-genie-gitee-sync-") as tmp_dir:
        tmp_root = Path(tmp_dir)
        for asset in assets:
            name = asset.get("name")
            download_url = asset.get("browser_download_url")
            if not name or not download_url:
                fail(f"GitHub release asset is missing name or browser_download_url: {asset}")

            target_path = tmp_root / name
            print(f"[sync-gitee] Downloading {name}")
            download_file(download_url, target_path)

            existing = attachments_by_name.get(name)
            if existing and not args.keep_existing_assets:
                attachment_id = existing.get("id")
                if attachment_id:
                    delete_url = (
                        f"https://gitee.com/api/v5/repos/{args.gitee_owner}/{args.gitee_repo}/releases/"
                        f"{release_id}/attach_files/{attachment_id}?access_token={urllib.parse.quote(token)}"
                    )
                    print(f"[sync-gitee] Deleting existing asset {name}")
                    request_no_content("DELETE", delete_url)

            upload_url = (
                f"https://gitee.com/api/v5/repos/{args.gitee_owner}/{args.gitee_repo}/releases/"
                f"{release_id}/attach_files?access_token={urllib.parse.quote(token)}"
            )
            print(f"[sync-gitee] Uploading {name}")
            upload_attachment(target_path, upload_url)

    print("[sync-gitee] Done")
    print(
        f"[sync-gitee] Verify latest.json: "
        f"https://gitee.com/{args.gitee_owner}/{args.gitee_repo}/releases/latest/download/latest.json"
    )


if __name__ == "__main__":
    main()
