"""Prepare two visually selected portfolio photos from verified captured source bytes.

Run: python scripts/prepare-studio-portfolio.py
No network requests. Existing sp-work-01 through sp-work-12 assets are untouched.
"""
from pathlib import Path
from urllib.parse import urlparse
import hashlib
import json

from bs4 import BeautifulSoup
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = ROOT / "archive/current-site-2026-11-10"
SOURCE_PAGE = ARCHIVE / "pages/portfolios.html"
SOURCES = [
    {
        "asset": "sp-work-dark-01.webp",
        "source_filename": "Screenshot-2026-01-12-171015.png",
        "artist": "Jake",
        "artist_container": "bee0cb4",
        "descriptive_alt": "Bold black grim reaper tattoo with a scythe by Jake.",
        "selection_reason": "Strong black shapes and a diagonal composition remain readable in the dark homepage layout.",
    },
    {
        "asset": "sp-work-dark-02.webp",
        "source_filename": "Screenshot-2026-01-12-171030.png",
        "artist": "Jake",
        "artist_container": "bee0cb4",
        "descriptive_alt": "Two black spider tattoos forming a heart shape by Jake.",
        "selection_reason": "A distinctive central shape and strong black linework add contrast to the portfolio sequence.",
    },
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    soup = BeautifulSoup(SOURCE_PAGE.read_text(encoding="utf-8"), "html.parser")
    results = []
    for item in SOURCES:
        group = soup.select_one('div[data-id="' + item["artist_container"] + '"]')
        if group is None or not any(h.get_text(" ", strip=True) == item["artist"] for h in group.select("h1,h2,h3,h4")):
            raise RuntimeError("Artist attribution no longer matches the captured source")
        source_tag = next((im for im in group.select("img") if im.get("src", "").endswith("/" + item["source_filename"])), None)
        if source_tag is None:
            raise RuntimeError("Selected source image not found in confirmed artist group")
        source_url = source_tag["src"]
        parts = urlparse(source_url)
        source = ARCHIVE / "assets" / parts.netloc / parts.path.lstrip("/")
        original_hash = sha(source)
        with Image.open(source) as check:
            check.verify()
        with Image.open(source) as opened:
            converted = ImageOps.exif_transpose(opened).convert("RGB")
            original_dimensions = list(converted.size)
            converted.thumbnail((900, 900), Image.Resampling.LANCZOS)
            target = ROOT / "assets" / item["asset"]
            converted.save(target, "WEBP", quality=85, method=6)
            dimensions = list(converted.size)
        with Image.open(target) as check:
            check.verify()
        if sha(source) != original_hash:
            raise RuntimeError("Source changed during preparation")
        results.append({
            **item,
            "asset": "assets/" + item["asset"],
            "source_url": source_url,
            "source_path": source.relative_to(ROOT).as_posix(),
            "source_page": "https://sideshowproductionstattoo.com/portfolios/",
            "source_html": SOURCE_PAGE.relative_to(ROOT).as_posix(),
            "source_alt": source_tag.get("alt", ""),
            "alt_note": "Original source alt is blank. Descriptive alt was written after visual inspection.",
            "source_sha256": original_hash,
            "original_dimensions": original_dimensions,
            "dimensions": dimensions,
            "bytes": target.stat().st_size,
            "sha256": sha(target),
            "processing": "Proportional thumbnail only if over 900px, then WebP quality 85. No upscale, crop, retouch, generated content, or color alteration.",
        })
    doc = {
        "review_scope": "The 12 existing work images and all 18 Jake/Rigo images explicitly grouped on the captured public portfolios page.",
        "recommendation": "Lead with the two new Jake images, existing sp-work-08.webp, and existing sp-work-02.webp. Keep service closeups in the service context.",
        "new_assets": results,
        "existing_assets_to_reuse": [
            {
                "asset": "assets/sp-work-08.webp",
                "artist": "Jake",
                "description": "Black illustrated seated figure tattoo",
                "suggested_alt": "Black illustrated figure tattoo by Jake.",
                "source_filename": "Screenshot-2026-01-12-171023.png",
                "use": "Tattoo portfolio lead",
            },
            {
                "asset": "assets/sp-work-02.webp",
                "artist": "Rigo",
                "description": "Blue and purple floral tattoo",
                "suggested_alt": "Blue and purple floral tattoo by Rigo.",
                "source_filename": "Screenshot-2026-01-13-151743.png",
                "use": "Tattoo portfolio lead, introduces color",
            },
            {
                "asset": "assets/sp-work-04.webp",
                "artist": "Sonny",
                "description": "Ear jewelry and piercing closeup",
                "suggested_alt": "Ear piercing jewelry from Sonny's portfolio.",
                "source_filename": "Screenshot-2026-01-13-152219.png",
                "use": "Piercing service",
            },
            {
                "asset": "assets/sp-work-12.webp",
                "artist": "Megan",
                "description": "Smile showing multiple tooth gems",
                "suggested_alt": "Tooth gems shown in Megan's portfolio.",
                "source_filename": "Screenshot-2026-01-13-153010.png",
                "use": "Tooth gem service",
            },
        ],
        "third_export": "Not needed. Rigo's existing color floral is stronger than the remaining softer captures for this layout.",
        "source_alt_note": "Source alt attributes for selected portfolio images are empty; suggested descriptions are based on reviewed visible content.",
        "contact_sheets": [
            "docs/studio-media-review/portfolio-review-existing.jpg",
            "docs/studio-media-review/portfolio-review-jake.jpg",
            "docs/studio-media-review/portfolio-review-rigo.jpg",
        ],
        "reproduction_helper": "scripts/prepare-studio-portfolio.py",
    }
    path = ROOT / "docs/studio-portfolio-curation.json"
    path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"assets": [{"asset": r["asset"], "dimensions": r["dimensions"], "bytes": r["bytes"]} for r in results], "source_unchanged": True, "provenance": str(path.relative_to(ROOT))}))


if __name__ == "__main__":
    main()
