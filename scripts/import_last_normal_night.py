from __future__ import annotations

import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RACK_JSON = ROOT / "rack.json"
DEST = ROOT / "content" / "EchoStory" / "the-last-normal-night" / "issue-1" / "pages"
SOURCE_RAW = "https://raw.githubusercontent.com/aerovista-us/The-Last-Normal-Night/main/comic/issues/01-the-last-normal-night"
BOOK_ID = "last-normal-night-issue-1"
PLAYER_URL = "https://lastnormalnight.aerovista.us/"
COVER_VERSION = "20260911b"

ASSETS = [
    "00-cover-front.png",
    "01-inside-front.png",
    *[f"p{n:02d}.png" for n in range(1, 25)],
    "26-cover-back.png",
]


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "the-rack-importer/1.1"})
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


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)

    for name in ASSETS:
        url = f"{SOURCE_RAW}/pages/{name}"
        print(f"fetch {url}")
        write_atomic(DEST / name, fetch_bytes(url))

    focus = fetch_json(f"{SOURCE_RAW}/focus-regions.json")
    expected_format = focus.get("format") or {"width": 2063, "height": 3150}

    prefix = "content/EchoStory/the-last-normal-night/issue-1/pages"
    cover_src = f"{prefix}/00-cover-front.png?v={COVER_VERSION}"
    sequence = [
        image_item(
            cover_src,
            "The Last Normal Night — Issue 1 front cover",
            "Front cover",
        ),
        image_item(
            f"{prefix}/01-inside-front.png",
            "The Last Normal Night — inside front",
            "Inside front",
        ),
    ]

    pages = focus.get("pages", {})
    for n in range(1, 25):
        key = f"p{n:02d}"
        sequence.append(
            image_item(
                f"{prefix}/{key}.png",
                f"The Last Normal Night, page {n}",
                f"Page {n}",
                pages.get(key),
            )
        )

    sequence.append(
        image_item(
            f"{prefix}/26-cover-back.png",
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
        "shareImage": f"https://therack.aerovista.us/{prefix}/00-cover-front.png?v={COVER_VERSION}",
        "shareUrl": "read/last-normal-night-issue-1/",
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
    }

    rack = json.loads(RACK_JSON.read_text(encoding="utf-8"))
    books = rack.setdefault("books", [])
    books[:] = [existing for existing in books if existing.get("id") != BOOK_ID]
    books.insert(0, book)
    RACK_JSON.write_text(json.dumps(rack, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Imported {len(ASSETS)} publishing images and upserted {BOOK_ID}")
    print(f"Sequence items: {len(sequence)}")
    print(f"Companion player: {PLAYER_URL}")


if __name__ == "__main__":
    main()
