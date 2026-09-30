#!/usr/bin/env python3
"""Fail fast on broken static references before identity-canary testing."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []


def local_path(value: str) -> Path | None:
    value = str(value or "").strip()
    if not value or value.startswith(("#", "data:", "mailto:", "tel:")):
        return None
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return None
    path = parsed.path.lstrip("/")
    if not path:
        return None
    candidate = (ROOT / path).resolve()
    try:
        candidate.relative_to(ROOT.resolve())
    except ValueError:
        ERRORS.append(f"path escapes repository: {value}")
        return None
    return candidate


def require_file(value: str, source: str) -> None:
    path = local_path(value)
    if path is not None and not path.is_file():
        kind = "directory" if path.is_dir() else "missing path"
        ERRORS.append(f"{kind} {value!r} used where a file is required by {source}")


def walk_manifest(value, source="rack.json") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"src", "poster", "cover"} and isinstance(child, str):
                require_file(child, source)
            elif key == "shareUrl" and isinstance(child, str):
                target = (ROOT / urlsplit(child).path.lstrip("/")).resolve()
                if target.is_dir():
                    require_file(str(Path(urlsplit(child).path.lstrip("/")) / "index.html"), source)
                elif not target.exists():
                    ERRORS.append(f"missing share target {child!r} referenced by {source}")
            else:
                walk_manifest(child, source)
    elif isinstance(value, list):
        for child in value:
            walk_manifest(child, source)


def validate_index() -> None:
    text = (ROOT / "index.html").read_text(encoding="utf-8")
    for attr, value in re.findall(r"\b(src|href)=[\"']([^\"']+)[\"']", text, flags=re.I):
        if attr.lower() == "href" and value.startswith("#"):
            continue
        require_file(value, "index.html")


def validate_manifest() -> None:
    manifest = json.loads((ROOT / "rack.json").read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 3:
        ERRORS.append(f"unexpected rack.json schemaVersion: {manifest.get('schemaVersion')!r}")
    walk_manifest(manifest)


def validate_domain() -> None:
    cname = (ROOT / "CNAME").read_text(encoding="utf-8").strip()
    if cname != "therack.aerovista.us":
        ERRORS.append(f"unexpected CNAME: {cname!r}")


def main() -> int:
    validate_domain()
    validate_index()
    validate_manifest()
    if ERRORS:
        print("The Rack static integrity FAILED:", file=sys.stderr)
        for error in ERRORS:
            print(f" - {error}", file=sys.stderr)
        return 1
    print("The Rack static integrity OK: domain, index assets, and rack.json references are present.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
