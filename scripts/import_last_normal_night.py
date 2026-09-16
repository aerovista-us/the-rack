from __future__ import annotations

import hashlib
import html
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RACK_JSON = ROOT / "rack.json"
DEST = ROOT / "content" / "EchoStory" / "the-last-normal-night" / "issue-1" / "pages"
READ_ROUTE = ROOT / "read" / "last-normal-night-issue-1" / "index.html"
SOURCE_RAW = "https://raw.githubusercontent.com/aerovista-us/The-Last-Normal-Night/main/comic/issues/01-the-last-normal-night"
BOOK_ID = "last-normal-night-issue-1"
PLAYER_URL = "https://lastnormalnight.aerovista.us/"

ASSETS = [
    "00-cover-front.png",
    "01-inside-front.png",
    *[f"p{n:02d}.png" for n in range(1, 25)],
    "26-cover-back.png",
]


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "the-rack-importer/1.2"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read()


def fetch_json(url: str):
    return json.loads(fetch_bytes(url).decode("utf-8"))


def write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def image_item(src: str, alt: str, title: str, focus_regions=None):
    item = {"type": "image", "src": src, "alt": alt, "title": title}
    if focus_regions:
        item["focusRegions"] = focus_regions
    return item


def write_read_route(book: dict) -> None:
    title = f"{book['series']} — {book['title']}"
    description = book["description"]
    canonical = f"https://therack.aerovista.us/read/{BOOK_ID}/"
    cover = book["shareImage"]
    target = f"../../#/read/{BOOK_ID}/1"
    document = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>{html.escape(title)} | The Rack</title>
  <meta name="description" content="{html.escape(description, quote=True)}" />
  <link rel="canonical" href="{canonical}" />
  <meta property="og:title" content="{html.escape(title, quote=True)}" />
  <meta property="og:description" content="{html.escape(description, quote=True)}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="The Rack — Vespera Publishing" />
  <meta property="og:url" content="{canonical}" />
  <meta property="og:image" content="{cover}" />
  <meta property="og:image:alt" content="The Last Normal Night issue 1 cover" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="The Last Normal Night — Issue No. 1" />
  <meta name="twitter:description" content="The Crossing — read it on The Rack." />
  <meta name="twitter:image" content="{cover}" />
  <script>location.replace('{target}');</script>
  <meta http-equiv="refresh" content="0;url={target}" />
</head>
<body style="margin:0;background:#0b0b0b;color:#f6f1e8;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh">
  <p>Opening <a style="color:#f0bd55" href="{target}">The Last Normal Night</a> on The Rack…</p>
</body>
</html>
"""
    write_atomic(READ_ROUTE, document.encode("utf-8"))


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()

    for name in ASSETS:
        url = f"{SOURCE_RAW}/pages/{name}"
        print(f"fetch {url}")
        data = fetch_bytes(url)
        write_atomic(DEST / name, data)
        digest.update(name.encode("utf-8"))
        digest.update(data)

    focus_bytes = fetch_bytes(f"{SOURCE_RAW}/focus-regions.json")
    focus = json.loads(focus_bytes.decode("utf-8"))
    digest.update(b"focus-regions.json")
    digest.update(focus_bytes)
    publish_version = digest.hexdigest()[:12]
    expected_format = focus.get("format") or {"width": 2063, "height": 3150}

    prefix = "content/EchoStory/the-last-normal-night/issue-1/pages"
    versioned = lambda name: f"{prefix}/{name}?v={publish_version}"
    cover_src = versioned("00-cover-front.png")
    sequence = [
        image_item(cover_src, "The Last Normal Night — Issue 1 front cover", "Front cover"),
        image_item(
            versioned("01-inside-front.png"),
            "The Last Normal Night — inside front",
            "Inside front",
        ),
    ]

    pages = focus.get("pages", {})
    for n in range(1, 25):
        key = f"p{n:02d}"
        sequence.append(
            image_item(
                versioned(f"{key}.png"),
                f"The Last Normal Night, page {n}",
                f"Page {n}",
                pages.get(key),
            )
        )

    sequence.append(
        image_item(
            versioned("26-cover-back.png"),
            "The Last Normal Night — Issue 1 back cover",
            "Back cover",
        )
    )

    book = {
        "id": BOOK_ID,
        "series": "EchoStory — The Last Normal Night",
        "title": "Issue No. 1 — The Crossing",
        "issue": 1,
        "status": "complete",
        "featured": True,
        "creator": "EchoStory / Vespera Publishing",
        "description": (
            "One ordinary late night in Coeur d'Alene starts slipping out of alignment. "
            "Familiar streets, a recurring white sedan, frozen clocks, and a voice on Frequency Three "
            "push one man toward a choice the night seems to have already made for him."
        ),
        "cover": cover_src,
        "shareImage": f"https://therack.aerovista.us/{cover_src}",
        "shareUrl": f"read/{BOOK_ID}/",
        "companionUrl": PLAYER_URL,
        "companionLabel": "Listen to The Last Normal Night",
        "companionShortLabel": "Listen",
        "readerMode": "book",
        "spreadMode": "auto",
        "format": expected_format,
        "genres": ["mystery", "science fiction", "psychological thriller"],
        "tags": [
            "echostory",
            "coeur d'alene",
            "north idaho",
            "reality fracture",
            "11:59",
            "frequency three",
            "lake",
            "music companion",
        ],
        "sequence": sequence,
        "publicationVersion": publish_version,
    }

    rack = json.loads(RACK_JSON.read_text(encoding="utf-8"))
    books = rack.setdefault("books", [])
    books[:] = [existing for existing in books if existing.get("id") != BOOK_ID]
    books.insert(0, book)
    RACK_JSON.write_text(json.dumps(rack, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_read_route(book)

    print(f"Imported {len(ASSETS)} publishing images and upserted {BOOK_ID}")
    print(f"Sequence items: {len(sequence)}")
    print(f"Publication cache key: {publish_version}")
    print(f"Direct reader route: read/{BOOK_ID}/")
    print(f"Companion player: {PLAYER_URL}")


if __name__ == "__main__":
    main()
