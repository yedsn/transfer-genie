#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from shutil import copyfile
from typing import Optional


DEFAULT_GITHUB_OWNER = "yedsn"
DEFAULT_GITHUB_REPO = "transfer-genie"
DEFAULT_GITEE_OWNER = "hongxiaojian"
DEFAULT_GITEE_REPO = "transfer-genie"
LATEST_RELEASE_TAG = "latest"
HTTP_TIMEOUT_SECS = 60
DOWNLOAD_TIMEOUT_SECS = 600
DOWNLOAD_ATTEMPTS_PER_METHOD = 3
ARIA2_SPLIT = 4
ARIA2_MAX_CONNECTIONS_PER_SERVER = 4
ARIA2_MIN_SPLIT_SIZE = "1M"
UPLOAD_CONNECT_TIMEOUT_SECS = 30
UPLOAD_MAX_TIME_SECS = 1800


def log(message: str) -> None:
    print(message, flush=True)


def fail(message: str) -> None:
    print(f"[sync-gitee] Error: {message}", file=sys.stderr, flush=True)
    raise SystemExit(1)


def request_json(method: str, url: str, *, data=None, headers=None, direct: bool = False):
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
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({})) if direct else None
        open_method = opener.open if opener else urllib.request.urlopen
        with open_method(req, timeout=HTTP_TIMEOUT_SECS) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        fail(f"{method} {url} failed with HTTP {exc.code}: {body}")
    except urllib.error.URLError as exc:
        fail(f"{method} {url} failed: {exc}")


def try_request_json(method: str, url: str, *, data=None, headers=None, direct: bool = False):
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
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({})) if direct else None
        open_method = opener.open if opener else urllib.request.urlopen
        with open_method(req, timeout=HTTP_TIMEOUT_SECS) as response:
            return json.load(response)
    except Exception as exc:
        print(
            f"[sync-gitee] Warning: {method} {url} failed, continuing: {exc}",
            file=sys.stderr,
            flush=True,
        )
        return None


def request_no_content(method: str, url: str, *, direct: bool = False) -> None:
    req = urllib.request.Request(url, method=method)
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({})) if direct else None
        open_method = opener.open if opener else urllib.request.urlopen
        with open_method(req, timeout=HTTP_TIMEOUT_SECS):
            return
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        fail(f"{method} {url} failed with HTTP {exc.code}: {body}")
    except urllib.error.URLError as exc:
        fail(f"{method} {url} failed: {exc}")


def build_github_headers() -> dict:
    token = os.environ.get("GH_TOKEN", "").strip() or os.environ.get("GITHUB_TOKEN", "").strip()
    headers = {"User-Agent": "transfer-genie-release-sync"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    return headers


def normalize_proxy_url(proxy: Optional[str]) -> Optional[str]:
    if not proxy or "://" in proxy:
        return proxy
    return f"http://{proxy}"


def parse_bool(value: Optional[str]) -> bool:
    return str(value or "").strip().lower() == "true"


def get_expected_sha256(asset: dict) -> Optional[str]:
    digest = str(asset.get("digest") or "").strip().lower()
    if not digest:
        return None
    if not digest.startswith("sha256:"):
        return None
    sha256 = digest.removeprefix("sha256:")
    if not re.fullmatch(r"[0-9a-f]{64}", sha256):
        raise ValueError(f"Invalid GitHub asset SHA-256 digest: {digest}")
    return sha256


class DownloadRouteUnavailable(Exception):
    """The selected download route is unavailable; retry or fail clearly."""


class GitHubRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Keep GitHub API credentials away from signed asset hosts."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is None:
            return None
        hostname = (urllib.parse.urlparse(newurl).hostname or "").lower()
        if hostname not in {"api.github.com", "github.com", "www.github.com"}:
            redirected.headers.pop("Authorization", None)
            redirected.headers.pop("authorization", None)
        return redirected


def resolve_github_download_url(asset: dict) -> str:
    browser_url = asset.get("browser_download_url")
    api_url = asset.get("url")
    if not browser_url and not api_url:
        raise ValueError("GitHub release asset is missing url and browser_download_url")
    if not api_url:
        return browser_url

    request = urllib.request.Request(
        api_url,
        headers={
            **build_github_headers(),
            "Accept": "application/octet-stream",
            "Range": "bytes=0-0",
        },
    )
    try:
        opener = urllib.request.build_opener(GitHubRedirectHandler())
        with opener.open(request, timeout=HTTP_TIMEOUT_SECS) as response:
            resolved_url = response.geturl()
            response.read(1)
            log(
                f"[sync-gitee] Resolved GitHub asset host: "
                f"{urllib.parse.urlparse(resolved_url).hostname or 'unknown'}"
            )
            return resolved_url
    except Exception as exc:
        log(f"[sync-gitee] Asset API URL resolution failed, using browser URL: {exc}")
        return browser_url


def build_aria2_command(
    url: str,
    target_path: Path,
    *,
    proxy: Optional[str],
) -> list[str]:
    command = [
        "aria2c",
        "--dir",
        str(target_path.parent),
        "--out",
        target_path.name,
        "--allow-overwrite=true",
        "--auto-file-renaming=false",
        "--file-allocation=none",
        f"--split={ARIA2_SPLIT}",
        f"--max-connection-per-server={ARIA2_MAX_CONNECTIONS_PER_SERVER}",
        f"--min-split-size={ARIA2_MIN_SPLIT_SIZE}",
        "--max-tries=1",
        "--retry-wait=2",
        "--http-no-cache=true",
        "--summary-interval=5",
        "--console-log-level=notice",
        url,
    ]
    if proxy:
        command.insert(-1, f"--all-proxy={normalize_proxy_url(proxy)}")
    return command


def build_curl_download_command(
    url: str,
    target_path: Path,
    *,
    proxy: Optional[str],
) -> list[str]:
    command = [
        "curl",
        "--fail",
        "--location",
        "--show-error",
        "--connect-timeout",
        str(UPLOAD_CONNECT_TIMEOUT_SECS),
        "--max-time",
        str(DOWNLOAD_TIMEOUT_SECS),
        "--retry",
        "0",
        "--output",
        str(target_path),
    ]
    if proxy:
        command.extend(["--proxy", normalize_proxy_url(proxy)])
    command.append(url)
    return command


def download_file_once(
    url: str,
    target_path: Path,
    *,
    expected_size: int,
    expected_sha256: Optional[str],
    proxy: Optional[str] = None,
    use_aria2: bool,
) -> None:
    partial_path = target_path.with_name(f"{target_path.name}.part")
    control_path = partial_path.with_name(f"{partial_path.name}.aria2")
    partial_path.unlink(missing_ok=True)
    control_path.unlink(missing_ok=True)
    downloader = "aria2" if use_aria2 else "curl"
    command = (
        build_aria2_command(url, partial_path, proxy=proxy)
        if use_aria2
        else build_curl_download_command(url, partial_path, proxy=proxy)
    )
    log(f"[sync-gitee] Download response host: {urllib.parse.urlparse(url).hostname or 'unknown'}")
    log(f"[sync-gitee] Download method: {downloader} via Runner proxy" if proxy else f"[sync-gitee] Download method: {downloader} direct")
    if use_aria2:
        log(f"[sync-gitee] aria2 command: split={ARIA2_SPLIT}, max-connection-per-server={ARIA2_MAX_CONNECTIONS_PER_SERVER}")
    environment = os.environ.copy()
    if not proxy:
        for key in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
            environment.pop(key, None)
    try:
        result = subprocess.run(
            command,
            env=environment,
            timeout=DOWNLOAD_TIMEOUT_SECS,
            check=False,
        )
        if result.returncode != 0:
            raise DownloadRouteUnavailable(
                f"{downloader} exited with code {result.returncode}"
            )
        if not partial_path.exists():
            raise DownloadRouteUnavailable(f"{downloader} completed without creating the output file")
        downloaded = partial_path.stat().st_size
        if expected_size > 0 and downloaded != expected_size:
            raise OSError(
                f"downloaded size {downloaded} does not match GitHub asset size {expected_size}"
            )
        actual_sha256 = hashlib.sha256(partial_path.read_bytes()).hexdigest()
        if expected_sha256 and actual_sha256 != expected_sha256:
            raise OSError(
                f"SHA-256 mismatch: expected {expected_sha256}, got {actual_sha256}"
            )
        if expected_sha256:
            log(f"[sync-gitee] SHA-256 verified: {actual_sha256}")
        else:
            log(
                f"[sync-gitee] SHA-256 calculated: {actual_sha256} "
                "(GitHub asset metadata has no SHA-256 digest to compare)"
            )
        partial_path.replace(target_path)
    except FileNotFoundError as exc:
        command_name = "aria2c" if use_aria2 else "curl"
        raise DownloadRouteUnavailable(f"{command_name} is not installed or is not available on PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise DownloadRouteUnavailable(f"{downloader} timed out") from exc
    finally:
        partial_path.unlink(missing_ok=True)
        control_path.unlink(missing_ok=True)


def download_asset(
    asset: dict,
    target_path: Path,
    *,
    proxy: Optional[str],
    use_aria2: bool,
) -> None:
    expected_size = int(asset.get("size") or 0)
    expected_sha256 = get_expected_sha256(asset)
    errors = []
    for attempt in range(1, DOWNLOAD_ATTEMPTS_PER_METHOD + 1):
        downloader = "aria2" if use_aria2 else "curl"
        log(f"[sync-gitee] {downloader} attempt {attempt}/{DOWNLOAD_ATTEMPTS_PER_METHOD}")
        try:
            # Refresh the signed GitHub URL for every retry; short-lived URLs can expire.
            url = resolve_github_download_url(asset)
            download_file_once(
                url,
                target_path,
                expected_size=expected_size,
                expected_sha256=expected_sha256,
                proxy=proxy,
                use_aria2=use_aria2,
            )
            return
        except Exception as exc:
            errors.append(f"attempt {attempt}: {exc}")
            print(
                f"[sync-gitee] Warning: {downloader} download failed: {exc}",
                file=sys.stderr,
                flush=True,
            )
            if attempt < DOWNLOAD_ATTEMPTS_PER_METHOD:
                time.sleep(attempt * 2)
    fail(f"All {downloader} download attempts failed:\n- " + "\n- ".join(errors))


def upload_attachment(file_path: Path, upload_url: str) -> None:
    file_size = file_path.stat().st_size
    subprocess.run(
        [
            "curl",
            "--silent",
            "--show-error",
            "--location",
            "--connect-timeout",
            str(UPLOAD_CONNECT_TIMEOUT_SECS),
            "--max-time",
            str(UPLOAD_MAX_TIME_SECS),
            "--retry",
            "2",
            "--noproxy",
            "*",
            "--request",
            "POST",
            "-#",
            "--form",
            f"file=@{file_path}",
            upload_url,
        ],
        check=True,
        stderr=__import__("sys").stderr,
    )
    log(f"[sync-gitee] Upload complete: {file_size / 1024 / 1024:.1f} MB")


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


def strip_version_from_filename(name: str) -> str:
    match = re.match(r"^(.+?)-v?\d+\.\d+\.\d+(.*)$", name)
    if match:
        return match.group(1) + match.group(2)
    return name


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
            direct=True,
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
        direct=True,
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
    existing_attachments = request_json("GET", attachments_url, direct=True)
    attachments_by_name = {
        item.get("name"): item for item in existing_attachments if item.get("name")
    }

    if not keep_existing_assets:
        for name, attachment in attachments_by_name.items():
            attachment_id = attachment.get("id")
            if attachment_id:
                delete_url = (
                    f"https://gitee.com/api/v5/repos/{gitee_owner}/{gitee_repo}/releases/"
                    f"{release_id}/attach_files/{attachment_id}?access_token={urllib.parse.quote(token)}"
                )
                log(f"[sync-gitee] Deleting existing asset {name}")
                request_no_content("DELETE", delete_url, direct=True)

    for file_path in files:
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
    parser.add_argument(
        "--proxy",
        default=os.environ.get("GITEE_SYNC_PROXY", "").strip() or None,
        help="Proxy server for downloading from GitHub (e.g., localhost:7890).",
    )
    parser.add_argument(
        "--use-aria2",
        action=argparse.BooleanOptionalAction,
        default=parse_bool(os.environ.get("GITEE_SYNC_USE_ARIA2")),
        help="Use aria2c instead of curl. Reads GITEE_SYNC_USE_ARIA2; defaults to curl.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    token = os.environ.get("GITEE_ACCESS_TOKEN", "").strip()
    if not token:
        env_file = Path(__file__).parent.parent.parent / ".env"
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                if line.startswith("GITEE_ACCESS_TOKEN="):
                    token = line.split("=", 1)[1].strip()
                    break
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
        headers=build_github_headers(),
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
    gitee_releases = request_json("GET", releases_url, direct=True)

    with tempfile.TemporaryDirectory(prefix="transfer-genie-gitee-sync-") as tmp_dir:
        tmp_root = Path(tmp_dir)
        latest_files = []
        for asset in assets:
            name = asset.get("name")
            if not name:
                fail(f"GitHub release asset is missing name: {asset}")

            target_path = tmp_root / name
            log(f"[sync-gitee] Downloading {name}")
            download_asset(
                asset,
                target_path,
                proxy=args.proxy,
                use_aria2=args.use_aria2,
            )
            gitee_name = strip_version_from_filename(name)
            gitee_path = tmp_root / gitee_name
            if gitee_name != name:
                copyfile(target_path, gitee_path)
            if gitee_name == "latest.json":
                rewrite_latest_json_urls(
                    gitee_path,
                    gitee_path,
                    gitee_owner=args.gitee_owner,
                    gitee_repo=args.gitee_repo,
                    download_tag=LATEST_RELEASE_TAG,
                )
            latest_files.append(gitee_path)

        latest_release = ensure_release(
            token=token,
            gitee_owner=args.gitee_owner,
            gitee_repo=args.gitee_repo,
            releases=gitee_releases,
            tag_name=LATEST_RELEASE_TAG,
            release_name="latest",
            release_body=f"Auto-maintained latest release. Source release: {tag_name}.\n\n{release_body}",
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
