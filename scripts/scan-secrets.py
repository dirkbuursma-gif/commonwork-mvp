#!/usr/bin/env python3
import argparse
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
JWT_PATTERN = re.compile(
    rb"(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{10,})\.([A-Za-z0-9_-]{10,})\.([A-Za-z0-9_-]{10,})(?![A-Za-z0-9_-])"
)
PUBLIC_NAME_PATTERN = re.compile(
    rb"\bPUBLIC_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET|PRIVATE_KEY|API_KEY|ACCESS_TOKEN)[A-Z0-9_]*\b"
)
KNOWN_TOKEN_PATTERNS = {
    "Supabase secret key": re.compile(rb"\bsb_secret_[A-Za-z0-9_-]{20,}\b"),
    "Resend API key": re.compile(rb"\bre_[A-Za-z0-9_-]{20,}\b"),
    "Resend webhook secret": re.compile(rb"\bwhsec_[A-Za-z0-9_+/=-]{16,}\b"),
    "Google OAuth client secret": re.compile(rb"\bGOCSPX-[A-Za-z0-9_-]{20,}\b"),
    "GitHub access token": re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b"),
    "Slack token": re.compile(rb"\bxox[baprs]-[A-Za-z0-9-]{20,}\b"),
    "Private key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
}
SECRET_ASSIGNMENT = re.compile(
    rb"""(?m)^[ \t]*(?:export[ \t]+)?["']?([A-Z][A-Z0-9_]*(?:_SECRET(?:_KEY)?|_TOKEN|_API_KEY|_SERVICE_ROLE_KEY|_SUPA_KEY))["']?[ \t]*[:=][ \t]*["']?([^\s"'#,;}]+)"""
)
PLACEHOLDER_MARKERS = (
    "example",
    "fixture",
    "fake",
    "local-",
    "local_",
    "local-test",
    "mock",
    "not-a-real",
    "placeholder",
    "test-",
    "test_",
    "test-secret",
    "your-",
)


def service_role_jwt(data: bytes) -> bool:
    for match in JWT_PATTERN.finditer(data):
        payload = match.group(2)
        payload += b"=" * (-len(payload) % 4)
        try:
            decoded = base64.urlsafe_b64decode(payload)
            claims = json.loads(decoded)
        except (ValueError, json.JSONDecodeError):
            continue
        if isinstance(claims, dict) and claims.get("role") == "service_role":
            return True
    return False


def findings(data: bytes) -> list[str]:
    found = []
    for name, pattern in KNOWN_TOKEN_PATTERNS.items():
        for match in pattern.finditer(data):
            token = match.group(0)
            if name == "Resend webhook secret":
                payload = token.removeprefix(b"whsec_")
                payload += b"=" * (-len(payload) % 4)
                try:
                    decoded = base64.b64decode(payload)
                except ValueError:
                    decoded = b""
                if any(marker.encode() in decoded.lower() for marker in PLACEHOLDER_MARKERS):
                    continue
            found.append(name)
            break
    if PUBLIC_NAME_PATTERN.search(data):
        found.append("public secret-like variable name")
    if service_role_jwt(data):
        found.append("Supabase service-role JWT")
    for match in SECRET_ASSIGNMENT.finditer(data):
        value = match.group(2).decode("utf-8", errors="ignore").lower()
        if value.startswith(("process.env.", "env.", "config.", "os.environ", "secrets.", "env(", "${")):
            continue
        if not any(marker in value for marker in PLACEHOLDER_MARKERS):
            found.append("non-placeholder secret assignment")
            break
    return found


STATS = {"scanned": 0, "skipped": 0, "unreadable": 0, "findings": 0}
HISTORY_TIMEOUT_SECONDS = 300
HISTORY_BATCH_SIZE = 128
HISTORY_BATCH_BYTES = 8 * 1024 * 1024
MAX_HISTORY_BLOB_BYTES = 64 * 1024 * 1024


class ScanFailure(RuntimeError):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def tracked_paths() -> list[Path]:
    result = subprocess.run(
        ["git", "-C", str(ROOT), "ls-files", "-z"],
        check=True,
        capture_output=True,
        timeout=30,
    )
    return [ROOT / os.fsdecode(path) for path in result.stdout.split(b"\0") if path]


def print_unreadable(path: Path) -> None:
    try:
        display_path = path.relative_to(ROOT)
    except ValueError:
        display_path = path.name
    print(f"Unreadable in-scope path: {display_path} (read-error)", file=sys.stderr)


def scan_paths(paths: list[Path], label: str, unreadable: list[Path] | None = None) -> None:
    for path in unreadable or []:
        STATS["skipped"] += 1
        STATS["unreadable"] += 1
        print_unreadable(path)
    for path in paths:
        try:
            data = path.read_bytes()
        except OSError:
            STATS["skipped"] += 1
            STATS["unreadable"] += 1
            print_unreadable(path)
            continue
        STATS["scanned"] += 1
        STATS["findings"] += len(findings(data))
    print(
        f"{label}: scanned={STATS['scanned']} skipped={STATS['skipped']} "
        f"unreadable={STATS['unreadable']} findings={STATS['findings']}"
    )


def bundle_paths(directory: Path) -> tuple[list[Path], list[Path]]:
    paths = []
    unreadable = []

    def record_error(error: OSError) -> None:
        unreadable.append(Path(error.filename or directory))

    for current, _, filenames in os.walk(directory, onerror=record_error):
        paths.extend(Path(current) / filename for filename in filenames)
    return paths, unreadable


def scan_history() -> None:
    deadline = time.monotonic() + HISTORY_TIMEOUT_SECONDS

    def remaining_time() -> float:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise subprocess.TimeoutExpired("history scan", HISTORY_TIMEOUT_SECONDS)
        return remaining

    with tempfile.TemporaryFile() as object_list:
        subprocess.run(
            ["git", "-C", str(ROOT), "rev-list", "--objects", "--all"],
            check=True,
            stdout=object_list,
            stderr=subprocess.DEVNULL,
            timeout=remaining_time(),
        )
        object_list.seek(0)
        batch = []

        def scan_batch(object_ids: list[bytes]) -> None:
            if not object_ids:
                return
            payload = b"".join(object_id + b"\n" for object_id in object_ids)
            metadata = subprocess.run(
                ["git", "-C", str(ROOT), "cat-file", "--batch-check"],
                input=payload,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=remaining_time(),
            ).stdout.splitlines()
            if len(metadata) != len(object_ids):
                raise ScanFailure("invalid-git-output")

            blobs = []
            for expected_id, line in zip(object_ids, metadata):
                fields = line.split()
                if len(fields) != 3 or fields[0] != expected_id:
                    raise ScanFailure("invalid-git-output")
                try:
                    size = int(fields[2])
                except ValueError as error:
                    raise ScanFailure("invalid-git-output") from error
                if fields[1] != b"blob":
                    STATS["skipped"] += 1
                    continue
                if size > MAX_HISTORY_BLOB_BYTES:
                    STATS["skipped"] += 1
                    raise ScanFailure("blob-size-limit")
                blobs.append((expected_id, size))

            content_batches = []
            content_batch = []
            content_size = 0
            for blob in blobs:
                if content_batch and (
                    len(content_batch) >= HISTORY_BATCH_SIZE
                    or content_size + blob[1] > HISTORY_BATCH_BYTES
                ):
                    content_batches.append(content_batch)
                    content_batch = []
                    content_size = 0
                content_batch.append(blob)
                content_size += blob[1]
            if content_batch:
                content_batches.append(content_batch)

            for blobs_to_scan in content_batches:
                with tempfile.TemporaryFile() as contents:
                    subprocess.run(
                        ["git", "-C", str(ROOT), "cat-file", "--batch"],
                        input=b"".join(object_id + b"\n" for object_id, _ in blobs_to_scan),
                        check=True,
                        stdout=contents,
                        stderr=subprocess.DEVNULL,
                        timeout=remaining_time(),
                    )
                    contents.seek(0)
                    for expected_id, expected_size in blobs_to_scan:
                        fields = contents.readline().split()
                        if (
                            len(fields) != 3
                            or fields[0] != expected_id
                            or fields[1] != b"blob"
                            or fields[2] != str(expected_size).encode()
                        ):
                            raise ScanFailure("invalid-git-output")
                        data = contents.read(expected_size)
                        if len(data) != expected_size or contents.read(1) != b"\n":
                            raise ScanFailure("invalid-git-output")
                        STATS["scanned"] += 1
                        STATS["findings"] += len(findings(data))

        for line in object_list:
            fields = line.split(maxsplit=1)
            object_id = fields[0] if fields else b""
            if not object_id or any(byte not in b"0123456789abcdef" for byte in object_id):
                raise ScanFailure("invalid-git-output")
            batch.append(object_id)
            if len(batch) >= HISTORY_BATCH_SIZE:
                scan_batch(batch)
                batch = []
        scan_batch(batch)


def print_summary(label: str, status: str = "complete", reason: str = "") -> None:
    details = (
        f"{label}: scanned={STATS['scanned']} skipped={STATS['skipped']} "
        f"unreadable={STATS['unreadable']} findings={STATS['findings']} status={status}"
    )
    if reason:
        details += f" reason={reason}"
    print(details)


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan source, bundles, or reachable Git history without printing values.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--tracked", action="store_true")
    group.add_argument("--bundles", metavar="DIRECTORY")
    group.add_argument("--history", action="store_true")
    args = parser.parse_args()

    STATS.update(scanned=0, skipped=0, unreadable=0, findings=0)
    label = "Tracked files"
    try:
        if args.tracked:
            scan_paths(tracked_paths(), label)
        elif args.bundles:
            label = "Generated bundles"
            bundle_dir = (ROOT / args.bundles).resolve()
            if not bundle_dir.is_dir() or not bundle_dir.is_relative_to(ROOT):
                print("Bundle scan directory is missing or outside the repository.", file=sys.stderr)
                return 2
            paths, unreadable = bundle_paths(bundle_dir)
            scan_paths(paths, label, unreadable)
        else:
            label = "Git history blobs"
            scan_history()
            print_summary(label)
    except subprocess.TimeoutExpired:
        print_summary(label, "incomplete", "timeout")
        return 2
    except subprocess.CalledProcessError:
        print_summary(label, "incomplete", "git-failure")
        return 2
    except ScanFailure as error:
        print_summary(label, "incomplete", error.reason)
        return 2
    except OSError:
        print_summary(label, "incomplete", "io-failure")
        return 2

    if STATS["unreadable"]:
        return 2
    return 1 if STATS["findings"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
