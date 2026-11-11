"""Prepare genuine Megan service images recovered from the original Shopify theme.

Windows or macOS/Linux:
    python scripts/prepare-studio-service-media.py

Requires Pillow, already used by the project's other media helpers.
Downloads only the two pinned public Shopify originals if absent from the cache.
Verifies source hashes and retained author/field references before producing WebP
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
  'alt': "Before-and-after teeth-whitening comparison shown in Megan's portfolio",
  'suggested_fit': 'contain',
  'subject': 'Labeled before-and-after teeth-whitening photo comparison',
  'artist': 'Megan',
  'source_template': 'templates/page.artist-portfolio.json',
  'source_section': 'portfolio_NhdxPw',
  'source_block': 'author_mLcbKx',
  'source_field': 'portfolio_image_3',
  'source_reference': 'shopify://shop_images/427641519_413653254444875czxczcs_3625183506czxcz029295051_n.png',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/427641519_413653254444875czxczcs_3625183506czxcz029295051_n.png',
  'source_sha256': 'd7ea68dbc424cdf5a7d4b41d88553da4070aa4bb709631702c723d387520f489',
  'source_bytes': 1551265,
  'source_dimensions': [1270, 1081]},
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
        settings = section["blocks"][record["source_block"]]["settings"]
        if section.get("disabled") or settings.get("author_name") != record["artist"]:
            raise RuntimeError("The retained source no longer confirms Megan's attribution")
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
        # Preserve the complete original photograph and its native dimensions.
        image.save(encoded, "WEBP", quality=88, method=6)
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
        "purpose": "Match each smile service card to its actual service using Megan's retained original portfolio images.",
        "reproduction_helper": "scripts/prepare-studio-service-media.py",
        "recommended_service_settings": settings,
        "assets": assets,
        "attribution_evidence": [
            "Both references are fields in templates/page.artist-portfolio.json > sections.portfolio_NhdxPw > blocks.author_mLcbKx.settings, where author_name is Megan and author_price identifies Tooth Gems and Whitening.",
            "The same Megan images and service context are retained in templates/page.fit-to-recover.json.",
            "The current-site archive also contains the same whitening comparison as media 277, Screenshot-2026-01-13-152928.png, at 730x720; the selected Shopify original is 1270x1081.",
        ],
        "usage_notes": [
            "Use the whitening image only for whitening service/result contexts. Keep Megan's portrait on her artist profile; do not globally replace all references to her portrait.",
            "The whitening source is a comparison visibly labeled Before and After, not a photograph of a treatment in progress. Both labels and both sides should stay visible. Contain fit is recommended.",
            "The whitening source is soft and tinted despite its larger native pixel dimensions. It is an authentic retained portfolio image; no new outcome or effectiveness claim is added.",
            "The tooth-gem photo shows multiple clear gems and gold tooth accents. It represents tooth gems, not whitening. Retain the visible gem placements at both sides of the smile.",
            "The WordPress teeth-whitening service graphic Untitled-design-15.png is a tooth icon, not a treatment photograph. The old Shopify combined smile-service landscape image shows tooth gems and does not establish whitening results.",
            "Source hashes are pinned. WebP bytes may vary with Pillow/libwebp versions; decoded native dimensions and processing rules remain fixed.",
        ],
        "review_sheet": ".ai-bridge/megan-service-review/megan-service-candidates.jpg",
    }
    destination = ROOT / "docs/studio-service-media-sources.json"
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"assets": [{"asset": r["asset"], "dimensions": [r["width"], r["height"]], "bytes": r["bytes"]} for r in assets], "recommended_service_settings": settings, "report": str(destination)}, indent=2))


if __name__ == "__main__":
    main()
