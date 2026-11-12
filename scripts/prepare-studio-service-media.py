"""Prepare genuine smile-service images recovered from the original Shopify theme.

Windows or macOS/Linux:
    python scripts/prepare-studio-service-media.py

Requires Pillow, already used by the project's other media helpers.
Downloads only the two pinned public Shopify originals if absent from the cache.
Verifies source hashes and retained service/author references before producing WebP
assets and the provenance report. Does not change templates or Shopify data.
"""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen
import hashlib
import json

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".ai-bridge/service-photo-sources"
CDN_PREFIX = "https://cdn.shopify.com/s/files/1/0684/2997/1713/files/"
MAX_SOURCE_BYTES = 5_000_000
SELECTIONS = [{'asset': 'sp-service-whitening.webp',
  'alt': 'Teeth-whitening comparison from the original Shopify homepage: after on the left, before on the right',
  'suggested_fit': 'contain',
  'subject': 'Original homepage whitening comparison labeled After on the left and Before on the right',
  'artist': 'Megan',
  'source_template': 'archive/shopify-theme-before-redesign/whitening-homepage-section.json',
  'source_original_template': 'templates/index.json',
  'source_commit': '15cd68121a1a85e7d632523521d5c7752611e807',
  'source_section': 'featured_row_3pJW78',
  'source_title': 'Teeth Whitening',
  'source_artist_link': '/pages/artist-page#Megan',
  'source_field': 'image',
  'source_reference': 'shopify://shop_images/beforeandafter.png',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/beforeandafter.png',
  'source_sha256': '1f3e197721af9f5d2b9ad173cde88e26261ee4f6ca98b26c40f4d71d370c9136',
  'source_bytes': 1846914,
  'source_dimensions': [1713, 994]},
 {'asset': 'sp-service-tooth-gems.webp',
  'alt': "Clear tooth gems and gold accents on a smile shown in Megan's portfolio",
  'suggested_fit': 'contain',
  'subject': 'Smile with clear tooth gems and gold tooth accents',
  'artist': 'Megan',
  'source_template': 'templates/page.artist-portfolio.json',
  'source_section': 'portfolio_NhdxPw',
  'source_block': 'author_mLcbKx',
  'source_field': 'portfolio_image_7',
  'source_reference': 'shopify://shop_images/428263552_423107206729451_22071626944793514dasdczxczas91_n.png',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/428263552_423107206729451_22071626944793514dasdczxczas91_n.png',
  'source_sha256': '52d9801652e3aa59765ab4abac6986f3d14dfe29e1c1e185c7d565486180b610',
  'source_bytes': 1507938,
  'source_dimensions': [1736, 928]}]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inspect_image(data):
    with Image.open(BytesIO(data)) as image:
        image.verify()
    with Image.open(BytesIO(data)) as image:
        image.load()
        return image.size, image.format


def verify_references():
    for record in SELECTIONS:
        template = json.loads((ROOT / record["source_template"]).read_text(encoding="utf-8"))
        section = template["sections"][record["source_section"]]
        if section.get("disabled"):
            raise RuntimeError("The retained source section is disabled")
        if record.get("source_block"):
            settings = section["blocks"][record["source_block"]]["settings"]
            if settings.get("author_name") != record["artist"]:
                raise RuntimeError("The retained source no longer confirms the artist")
        else:
            settings = section["settings"]
            if (settings.get("title") != record["source_title"] or
                    settings.get("button_link") != record["source_artist_link"] or
                    template.get("source_commit") != record["source_commit"]):
                raise RuntimeError("The archived homepage no longer confirms the service and artist link")
        if settings.get(record["source_field"]) != record["source_reference"]:
            raise RuntimeError("The retained source image reference changed")
        if record["source_url"] != CDN_PREFIX + record["source_reference"].removeprefix("shopify://shop_images/"):
            raise RuntimeError("Image URL does not match the retained Shopify reference")


def fetch_source(record):
    filename = record["source_url"].rsplit("/", 1)[-1]
    cache = CACHE / filename
    prior_cache = ROOT / ".ai-bridge/shopify-originals" / filename
    if cache.exists():
        data = cache.read_bytes()
    elif prior_cache.exists():
        data = prior_cache.read_bytes()
    else:
        request = Request(record["source_url"], headers={"User-Agent": "SideshowMediaRecovery/1.0", "Accept": "image/*"})
        with urlopen(request, timeout=30) as response:
            if not response.geturl().startswith(CDN_PREFIX):
                raise RuntimeError("Unexpected source image redirect")
            data = response.read(MAX_SOURCE_BYTES + 1)
    if len(data) > MAX_SOURCE_BYTES or len(data) != record["source_bytes"]:
        raise RuntimeError("Source byte count changed: " + record["asset"])
    if digest(data) != record["source_sha256"]:
        raise RuntimeError("Source hash changed; review the image before replacing it")
    dimensions, _ = inspect_image(data)
    if list(dimensions) != record["source_dimensions"]:
        raise RuntimeError("Source dimensions changed")
    if not cache.exists():
        cache.write_bytes(data)
    return data


def prepare(record, data):
    with Image.open(BytesIO(data)) as opened:
        image = ImageOps.exif_transpose(opened)
        if list(image.size) != record["source_dimensions"]:
            raise RuntimeError("Unexpected source orientation; review before encoding")
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        encoded = BytesIO()
        # Preserve the complete original photograph, native dimensions and color profile.
        save_options = {"quality": 88, "method": 6}
        if opened.info.get("icc_profile"):
            save_options["icc_profile"] = opened.info["icc_profile"]
        image.save(encoded, "WEBP", **save_options)
    output = encoded.getvalue()
    dimensions, image_format = inspect_image(output)
    if image_format != "WEBP" or list(dimensions) != record["source_dimensions"]:
        raise RuntimeError("Output format or dimensions differ from the reviewed source")
    target = ROOT / "assets" / record["asset"]
    target.write_bytes(output)
    return {
        **record,
        "asset_path": "assets/" + record["asset"],
        "width": dimensions[0],
        "height": dimensions[1],
        "bytes": len(output),
        "sha256": digest(output),
        "processing": "WebP quality 88, method 6. Full native resolution and full frame retained. No crop, enlargement, sharpening, color correction, retouching, or generated imagery.",
    }


def main():
    verify_references()
    CACHE.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        sources = list(pool.map(fetch_source, SELECTIONS))
    assets = [prepare(record, source) for record, source in zip(SELECTIONS, sources)]
    settings = {
        "whitening": {"asset": assets[0]["asset"], "alt": assets[0]["alt"], "fit": "contain"},
        "tooth_gems": {"asset": assets[1]["asset"], "alt": assets[1]["alt"], "fit": "contain"},
    }
    report = {
        "review_date": "2026-11-11",
        "purpose": "Restore the whitening comparison linked by the original Shopify homepage and retain Megan's tooth-gem portfolio photograph.",
        "reproduction_helper": "scripts/prepare-studio-service-media.py",
        "recommended_service_settings": settings,
        "assets": assets,
        "attribution_evidence": [
            "The original templates/index.json at commit 15cd68121a1a85e7d632523521d5c7752611e807 > sections.featured_row_3pJW78.settings pairs beforeandafter.png with title Teeth Whitening and booking link /pages/artist-page#Megan. The exact section is retained in archive/shopify-theme-before-redesign/whitening-homepage-section.json.",
            "The same whitening homepage image reference was also verified in original revisions e9b908d, 851f138 and 1783016. It was missed when the earlier search used a shallow clone without the original homepage history.",
            "The tooth-gem reference remains templates/page.artist-portfolio.json > sections.portfolio_NhdxPw > blocks.author_mLcbKx.settings.portfolio_image_7, where author_name is Megan and author_price identifies Tooth Gems and Whitening.",
        ],
        "usage_notes": [
            "Use the whitening image only for whitening service/result contexts. Keep Megan's portrait on her artist profile; do not globally replace all references to her portrait.",
            "The whitening source is the owner's original homepage comparison, visibly labeled After on the left and Before on the right. Keep both labels and sides visible with contain fit; do not flip, crop, relabel or independently recolor either side.",
            "The full 1713x994 homepage original replaces the previously selected tinted 1270x1081 portfolio comparison. No new outcome or effectiveness claim is added.",
            "The tooth-gem photo shows multiple clear gems and gold tooth accents. It represents tooth gems, not whitening. Retain the visible gem placements at both sides of the smile.",
            "The WordPress teeth-whitening service graphic Untitled-design-15.png is a tooth icon, not a treatment photograph. The old Shopify combined smile-service landscape image shows tooth gems and does not establish whitening results.",
            "Source hashes are pinned. WebP bytes may vary with Pillow/libwebp versions; decoded native dimensions and processing rules remain fixed.",
        ],
        "reviewed_whitening_source": ".ai-bridge/whitening-color-source/beforeandafter.png",
    }
    destination = ROOT / "docs/studio-service-media-sources.json"
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"assets": [{"asset": r["asset"], "dimensions": [r["width"], r["height"]], "bytes": r["bytes"]} for r in assets], "recommended_service_settings": settings, "report": str(destination)}, indent=2))


if __name__ == "__main__":
    main()
