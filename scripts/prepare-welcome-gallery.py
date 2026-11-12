"""Prepare the Welcome gallery's genuine working-artist photograph and provenance.

Run: python scripts/prepare-welcome-gallery.py

The storefront and flash-board assets are reused without duplicate copies.
The newly recovered Jake photograph is downloaded only from its observed
Shopify reference, verified, and encoded as WebP without cropping or upscaling.
"""
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen
import hashlib
import json

from PIL import Image, ImageDraw, ImageOps
from studio_recovered_media import prepare_override

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = ROOT / "archive/current-site-2026-11-10"
REVIEW = ROOT / ".ai-bridge/welcome-review"
CACHE = ROOT / ".ai-bridge/welcome-source"
JAKE_FILENAME = "534394909_1422782015498885_1036830063844308316_n_b3258798-eb61-4f4c-8f78-c0cd56a04cfc.jpg"
JAKE_REFERENCE = "shopify://shop_images/" + JAKE_FILENAME
JAKE_URL = "https://cdn.shopify.com/s/files/1/0684/2997/1713/files/" + JAKE_FILENAME
JAKE_SHA256 = "62308da617f3f97b97299a4e6f5fe14ac707298b19289be943cf6c2bdc5006f9"
REUSE = [
    {
        "asset": "assets/sp-source-storefront.webp",
        "category": "storefront exterior",
        "caption": "Our Murray studio",
        "alt": "Sideshow Productions studio sign above the entrance at 4973 S State Street.",
        "source_filename": "Screenshot-2026-01-09-101734.png",
        "sha256": "9d784297f976367b7f0a9d232f95bdde78ca8ad088399044c5cbb80e8ff324c8",
    },
    {
        "asset": "assets/sp-source-flash-wall.webp",
        "category": "studio wall detail",
        "caption": "Ideas on the wall",
        "alt": "A board of tattoo designs mounted on the red wall inside the Sideshow studio.",
        "source_filename": "522130610_72896906cv6420601_2836253316634858983_n.webp",
        "sha256": "93465512824e10df6a55976e74128728b60e4719403a0a55ca3855aafc78c09e",
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_image(data):
    with Image.open(BytesIO(data)) as image:
        image.verify()
    with Image.open(BytesIO(data)) as image:
        return image.size


def main():
    media = json.loads((ARCHIVE / "media-inventory.json").read_text(encoding="utf-8"))
    by_name = {item["url"].rsplit("/", 1)[-1]: item for item in media}
    source_manifest = json.loads((ARCHIVE / "manifest.json").read_text(encoding="utf-8"))
    original_records = {
        item["url"]: item
        for item in source_manifest["resources"]
        if item.get("status") == 200 and item.get("sha256")
    }
    records = []
    for selected in REUSE:
        recovered = prepare_override(selected["asset"])
        if recovered:
            records.append({**selected, **recovered, "new_asset": False})
            continue
        path = ROOT / selected["asset"]
        if digest(path) != selected["sha256"]:
            raise RuntimeError("Tracked asset differs from its recorded source: " + str(path))
        width, height = validate_image(path.read_bytes())
        original = by_name[selected["source_filename"]]
        records.append({
            **selected,
            "new_asset": False,
            "width": width,
            "height": height,
            "bytes": path.stat().st_size,
            "source_url": original["url"],
            "original_source_dimensions": [original["width"], original["height"]],
            "original_source_sha256": original_records.get(original["url"], {}).get("sha256"),
            "original_source_alt": original.get("alt", ""),
            "source_provenance": "docs/studio-authentic-media-sources.json",
            "processing": "Reuse the existing optimized WebP as-is. No duplicate image asset, enlargement, crop, recompression, or retouching.",
        })

    template_path = ROOT / "templates/page.artist-portfolio.json"
    raw = template_path.read_text(encoding="utf-8")
    template = json.loads(raw[raw.find("{"):])
    author = template["sections"]["portfolio_yFkdkL"]["blocks"]["author_nDfefr"]["settings"]
    if author.get("author_name") != "Jake" or author.get("profile_image") != JAKE_REFERENCE:
        raise RuntimeError("The retained source template no longer confirms the selected Jake photograph")
    CACHE.mkdir(parents=True, exist_ok=True)
    source = CACHE / JAKE_FILENAME
    if source.exists():
        source_bytes = source.read_bytes()
    else:
        with urlopen(Request(JAKE_URL, headers={"User-Agent": "SideshowMigrationArchive/1.0"}), timeout=25) as response:
            source_bytes = response.read(5_000_001)
        if len(source_bytes) > 5_000_000:
            raise RuntimeError("Unexpectedly large source response")
        validate_image(source_bytes)
        if hashlib.sha256(source_bytes).hexdigest() != JAKE_SHA256:
            raise RuntimeError("Public source changed; inspect it before generating a replacement")
        source.write_bytes(source_bytes)
    if hashlib.sha256(source_bytes).hexdigest() != JAKE_SHA256:
        raise RuntimeError("Cached source differs from the reviewed photograph")
    original_dimensions = validate_image(source_bytes)
    target = ROOT / "assets/sp-welcome-jake-session.webp"
    with Image.open(BytesIO(source_bytes)) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
        image.save(target, "WEBP", quality=88, method=6)
    width, height = validate_image(target.read_bytes())
    if width > original_dimensions[0] or height > original_dimensions[1]:
        raise RuntimeError("Unexpected enlargement")
    records.append({
        "asset": target.relative_to(ROOT).as_posix(),
        "new_asset": True,
        "category": "artist working inside the studio",
        "caption": "Jake at work",
        "alt": "Jake wearing blue gloves while tattooing a client's arm inside the Sideshow studio.",
        "artist": "Jake",
        "width": width,
        "height": height,
        "bytes": target.stat().st_size,
        "sha256": digest(target),
        "source_url": JAKE_URL,
        "source_reference": JAKE_REFERENCE,
        "source_template": "templates/page.artist-portfolio.json",
        "source_section": "portfolio_yFkdkL",
        "source_block": "author_nDfefr",
        "source_field": "profile_image",
        "source_author_name": "Jake",
        "original_source_dimensions": list(original_dimensions),
        "original_source_bytes": len(source_bytes),
        "original_source_sha256": JAKE_SHA256,
        "reviewed_source_cache": source.relative_to(ROOT).as_posix(),
        "processing": "WebP quality 88, method 6. Original 750x1000 resolution retained. No crop, enlargement, color alteration, creative retouching, or generated imagery.",
        "display_note": "Portrait photograph. Preserve the full 3:4 frame where possible so both Jake and his working hands remain visible.",
    })

    REVIEW.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGB", (1260, 500), (17, 17, 19))
    draw = ImageDraw.Draw(sheet)
    for index, record in enumerate(records):
        with Image.open(ROOT / record["asset"]) as opened:
            image = opened.convert("RGB")
            image.thumbnail((404, 435), Image.Resampling.LANCZOS)
            x = index * 420
            sheet.paste(image, (x + (420 - image.width) // 2, 0))
            draw.text((x + 8, 441), record["caption"], fill="white")
            draw.text((x + 8, 460), f'{record["width"]} x {record["height"]} | {record["category"]}', fill=(200, 200, 200))
    sheet.save(REVIEW / "welcome-final-contact-sheet.jpg", quality=90)
    report = {
        "prepared_at": datetime.now(timezone.utc).isoformat(),
        "recommendation": "Three different, genuine views: shop exterior, physical studio flash board, and Jake tattooing a client. Use the two existing assets directly and the one new working-artist WebP.",
        "assets": records,
        "findings": [
            "The retained Shopify profile reference supplied the uncropped 750x1000 original of Jake's previously circle-masked photograph.",
            "The current WordPress host returned HTTP 200 with 195-byte text/html Site Unavailable responses to attempted original photo downloads. Those responses failed Pillow validation and were not saved as images.",
            "The existing sp-source-tattoo-session.webp is a 502x288 video frame. It was visually inspected and excluded because it remains too soft for the requested larger Welcome image.",
            "The old Shopify testimonial images inspected are only 50x50 or 100x100 avatar files, unsuitable for this gallery.",
            "The retained Sonny and Rigo profile references show their work, not portraits. Megan's uncropped cover is 480x481 and is not a working-studio image.",
            "No new full-width studio interior photograph was recovered. The flash-board photograph is a studio wall detail, and Jake's photograph shows a working area.",
            "Existing portfolio artwork from the main homepage slider is not repeated in this recommendation.",
        ],
        "review_sheet": ".ai-bridge/welcome-review/welcome-final-contact-sheet.jpg",
        "additional_review": ".ai-bridge/welcome-review/shopify-artist-candidates.jpg",
        "reproduction_helper": "scripts/prepare-welcome-gallery.py",
    }
    (ROOT / "docs/studio-welcome-media-sources.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "gallery_count": len(records),
        "new_assets": [record["asset"] for record in records if record["new_asset"]],
        "assets": [{"asset": record["asset"], "dimensions": [record["width"], record["height"]], "bytes": record["bytes"], "category": record["category"]} for record in records],
        "review_sheet": report["review_sheet"],
    }, indent=2))


if __name__ == "__main__":
    main()
