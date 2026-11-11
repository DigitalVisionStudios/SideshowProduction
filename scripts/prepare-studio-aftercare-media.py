#!/usr/bin/env python3
"""Prepare the three audited aftercare product photographs without changing UI.

Requires Python 3.10+ and Pillow. Works from any working directory on Windows,
macOS, or Linux. Sources are public manufacturer product images with fixed
SHA-256 hashes. Unexpected source bytes are rejected, including HTML responses.

    python scripts/prepare-studio-aftercare-media.py
    python scripts/prepare-studio-aftercare-media.py --source-dir PATH --offline

Only three named WebP assets and docs/studio-aftercare-media-sources.json are
written. Product 17 and 19 receive image-free recommendations because their
stocked package sizes could not be resolved from the captured client catalog.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image, ImageOps, __version__ as pillow_version


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "archive/current-site-2026-11-10"
MAX_EDGE = 1200
QUALITY = 88
EXPECTED_HANDLES = {
    17: "aftercare-soothing-gel-for-tattoos-mad-rabbit",
    18: "base-laboratories-aftercare-spray",
    19: "ehance-balm-mad-rabbit",
    20: "steri-wash-piercing-wash",
    21: "tattoo-sunscreen-defend-mad-rabbit",
}

SOURCES = {
    18: {
        "cache_name": "base-labs-spray.png",
        "asset": "sp-product-base-spray.webp",
        "url": "https://cdn.shopify.com/s/files/1/0411/8711/5166/files/piercing-aftercare-spray-topical-base-laboratories-103489.png?v=1778124198",
        "sha256": "e6a111c9068b41219f025eac66d38f7ac4fcac3c4ab4e4828b4009e3e89c9c32",
        "dimensions": [2000, 2000],
        "manufacturer_page": "https://baselaboratories.com/products/base-labs-piercing-aftercare-spray?variant=44495725363459",
        "manufacturer_product_data": "https://baselaboratories.com/products/base-labs-piercing-aftercare-spray.js",
        "manufacturer_product": "Base Laboratories Piercing Aftercare Spray",
        "manufacturer_size": "4 oz / 120 mL",
        "manufacturer_sku": "BSL-PIERCE-SPRY",
        "alt": "Base Laboratories Piercing Aftercare Spray, 4 oz / 120 mL bottle",
        "preserve_alpha": True,
        "archive_evidence_ids": [1465],
        "match_note": "Same product family, turquoise lotus bottle, and 4 oz / 120 mL size as the older client packshot used on the captured aftercare page. Current official packaging photograph; ingredient and formula equivalence were not independently assessed.",
    },
    20: {
        "cache_name": "steri-wash-3oz-single.jpg",
        "asset": "sp-product-steri-wash.webp",
        "url": "https://cdn.shopify.com/s/files/1/1025/0639/files/resizedsingle_3oz.jpg?v=1774412859",
        "sha256": "4b570835d6c59cffbf4e43053b389516f145f7145e4abcf7e9cf1e8afe8949fe",
        "dimensions": [2047, 2047],
        "manufacturer_page": "https://www.steri-wash.com/products/copy-of-steri-wash-sterile-saline-piercing-spray-wholesale",
        "manufacturer_product_data": "https://www.steri-wash.com/products/copy-of-steri-wash-sterile-saline-piercing-spray-wholesale.js",
        "manufacturer_product": "Steri-Wash Sterile Saline Piercing Spray, 3 oz",
        "manufacturer_size": "3.0 fl oz / 90 mL",
        "manufacturer_sku": "4310 (wholesale case SKU; not a Sideshow SKU)",
        "alt": "One Steri-Wash Sterile Saline Piercing Wash bottle, 3.0 fl oz / 90 mL",
        "preserve_alpha": False,
        "archive_evidence_ids": [1609],
        "match_note": "The older product-specific client image shows the same 3.0 fl oz / 90 mL bottle. The selected manufacturer image is a single bottle, not the wholesale case photograph. No wholesale price, case quantity, or SKU is assigned to Sideshow.",
    },
    21: {
        "cache_name": "mad-rabbit-defend.jpg",
        "asset": "sp-product-defend.webp",
        "url": "https://cdn.shopify.com/s/files/1/0076/4156/3234/files/SPF_PDP.jpg?v=1773073104",
        "sha256": "efc81bd77ee03fd0ab593d55c23d5c748cec3cd158137d0e813c27dd4678ed2f",
        "dimensions": [2000, 2000],
        "manufacturer_page": "https://www.madrabbit.com/products/spf-30",
        "manufacturer_product_data": "https://www.madrabbit.com/products/spf-30.js",
        "manufacturer_product": "Mad Rabbit Defend SPF 30 Tattoo Sunscreen",
        "manufacturer_size": "3.4 oz / 100 mL",
        "manufacturer_sku": "SPF30",
        "alt": "One Mad Rabbit Defend SPF 30 Tattoo Sunscreen tube, 100 mL",
        "preserve_alpha": False,
        "archive_evidence_ids": [1583],
        "match_note": "Same Defend SPF 30 product family and 100 mL size as the product-specific client cutout. Its old label states 3.3 fl oz and the current manufacturer label states 3.4 oz; both state 100 mL. Current official packaging photograph; formula equivalence was not independently assessed.",
    },
}

UNRESOLVED = {
    17: {
        "reason": "Repair Soothing Gel package-size conflict: older client-library packshot shows 3.4 oz / 100 mL, while a later product-specific cutout shows 1.7 oz / 50 mL. The captured catalog has no size or SKU. Generated label text is not accepted as SKU evidence.",
        "required_evidence": "Exact stocked package size and a corresponding genuine product photograph.",
        "archive_evidence_ids": [1466, 1580],
        "manufacturer_page": "https://www.madrabbit.com/products/soothing-gel",
        "candidate_source_url": "https://cdn.shopify.com/s/files/1/0076/4156/3234/files/Gel_PDP.jpg?v=1773072796",
        "candidate_sha256": "dddd4b76a530ae978b8189625d4493b7b99f632d96e33cb3e912b87c5b4aed8f",
        "candidate_size": "3.4 oz / 100 mL",
    },
    19: {
        "reason": "Archived Enhance Vanilla & Coconut box shows 0.7 oz / 20 g. The current official single-balm candidate shows 1.7 oz, so it is not an exact package-size replacement. Current 0.7 oz salve variety sets were not verified as the same single offering.",
        "required_evidence": "Exact stocked size and formulation, plus a matching genuine single-product photograph.",
        "archive_evidence_ids": [1585],
        "manufacturer_page": "https://www.madrabbit.com/products/mad-rabbit-tattoo-balm?variant=39369174974562",
        "candidate_source_url": "https://cdn.shopify.com/s/files/1/0076/4156/3234/files/Balm-Coco-1_PDP.jpg?v=1776364005",
        "candidate_sha256": "6a5d16a4762d21fe166684f0a02d7edab373bdf67a83db805473bd675343d712",
        "candidate_size": "1.7 oz / 50 mL on the photographed package",
    },
}

LABEL_READINGS = {
    1465: "Base Laboratories Piercing After Care Spray, 4 oz (120 mL)",
    1466: "Mad Rabbit Repair Soothing Gel, 3.4 oz / 100 mL",
    1580: "Mad Rabbit Repair Soothing Gel, 1.7 oz / 50 mL",
    1583: "Mad Rabbit Defend SPF 30, 100 mL / 3.3 fl oz",
    1585: "Mad Rabbit Enhance Tattoo Balm, Vanilla & Coconut, 0.7 oz / 20 g",
    1609: "Steri-Wash Sterile Saline Piercing Wash, 3.0 fl oz (90 mL)",
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def source_bytes(source: dict, cache: Path, offline: bool) -> bytes:
    path = cache / source["cache_name"]
    if path.is_file():
        data = path.read_bytes()
    else:
        if offline:
            raise FileNotFoundError(f"Missing cached source: {path}")
        request = Request(source["url"], headers={"User-Agent": "Sideshow-media-preparation/1.0"})
        with urlopen(request, timeout=30) as response:
            data = response.read(12 * 1024 * 1024 + 1)
            if response.status != 200 or len(data) > 12 * 1024 * 1024:
                raise ValueError(f"Unexpected source response: {source['url']}")
        if digest(data) != source["sha256"]:
            raise ValueError(f"Source bytes changed; inspect before accepting: {source['url']}")
        path.write_bytes(data)
    if digest(data) != source["sha256"]:
        raise ValueError(f"Cached source hash mismatch: {path}")
    return data


def prepare_image(source: dict, raw: bytes) -> dict:
    with Image.open(io.BytesIO(raw)) as check:
        check.verify()
    with Image.open(io.BytesIO(raw)) as original:
        frame = ImageOps.exif_transpose(original)
        if list(frame.size) != source["dimensions"]:
            raise ValueError(f"Unexpected dimensions: {source['cache_name']}")
        # Palette transparency must be resolved through RGBA before resizing.
        # Direct RGB conversion would expose hidden green palette values.
        frame = frame.convert("RGBA" if source["preserve_alpha"] else "RGB")
        native_alpha_extrema = list(frame.getchannel("A").getextrema()) if frame.mode == "RGBA" else None
        frame.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        prepared_alpha = frame.getchannel("A").tobytes() if frame.mode == "RGBA" else None
        output = ROOT / "assets" / source["asset"]
        output.parent.mkdir(parents=True, exist_ok=True)
        frame.save(output, format="WEBP", quality=QUALITY, method=6, exact=True, alpha_quality=100)
        dimensions = list(frame.size)
    saved = output.read_bytes()
    with Image.open(io.BytesIO(saved)) as verify:
        if verify.format != "WEBP" or list(verify.size) != dimensions:
            raise ValueError("Unexpected WebP result")
        if prepared_alpha is not None and verify.convert("RGBA").getchannel("A").tobytes() != prepared_alpha:
            raise ValueError("Transparency changed during WebP export")
        verify.load()
    return {
        "source_url": source["url"],
        "source_sha256": source["sha256"],
        "source_bytes": len(raw),
        "source_dimensions": source["dimensions"],
        "source_alpha_extrema": native_alpha_extrema,
        "asset": source["asset"],
        "asset_path": output.relative_to(ROOT).as_posix(),
        "output_dimensions": dimensions,
        "output_bytes": len(saved),
        "output_sha256": digest(saved),
        "alpha_preserved": source["preserve_alpha"],
        "upscaled": False,
        "cropped": False,
    }


def archive_evidence(media_ids: list[int], media: dict, resources: list, aftercare: str) -> list:
    result = []
    for media_id in media_ids:
        item = media[media_id]
        resource = next((x for x in resources if x.get("final_url", x.get("url")) == item["url"]), None)
        filename = item["url"].rsplit("/", 1)[-1].rsplit(".", 1)[0]
        result.append({
            "media_id": media_id,
            "url": item["url"],
            "dimensions": [item["width"], item["height"]],
            "sha256": resource.get("sha256") if resource else None,
            "archive_path": "archive/current-site-2026-11-10/" + resource["local_path"] if resource else None,
            "observed_label": LABEL_READINGS[media_id],
            "used_on_captured_aftercare_page": filename in aftercare,
            "page_evidence": "archive/current-site-2026-11-10/api-content/after-care.html",
            "camera_origin_independently_verified": False,
        })
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=ROOT / ".ai-bridge/aftercare-source")
    parser.add_argument("--offline", action="store_true", help="Use cached verified images without network requests.")
    args = parser.parse_args()
    args.source_dir.mkdir(parents=True, exist_ok=True)

    catalog = read_json(ARCHIVE / "catalog.json")
    merchandise = [x for x in catalog["products"] if x["title"].startswith("Sideshow Productions ")]
    care = [x for x in catalog["products"] if not x["title"].startswith("Sideshow Productions ")]
    ordered = merchandise + care
    if len(merchandise) != 16 or len(care) != 5:
        raise ValueError("Catalog ordering changed; review the five explicit image overrides.")
    for index, handle in EXPECTED_HANDLES.items():
        if ordered[index - 1].get("handle") != handle:
            raise ValueError(f"Product {index} identity or order changed; review overrides before preparing images.")
    media = {x["id"]: x for x in read_json(ARCHIVE / "media-inventory.json")}
    resources = read_json(ARCHIVE / "manifest.json")["resources"]
    aftercare = (ARCHIVE / "api-content/after-care.html").read_text(encoding="utf-8")

    prepared = {index: prepare_image(source, source_bytes(source, args.source_dir, args.offline)) for index, source in SOURCES.items()}
    overrides = {}
    products = []
    for index in range(17, 22):
        item = ordered[index - 1]
        block_id = f"product_{index:02d}"
        source = SOURCES.get(index)
        unresolved = UNRESOLVED.get(index)
        settings = {"asset": source["asset"] if source else "#", "show_image": source is not None}
        if source:
            settings["image_background"] = "light"
        else:
            settings.update({"brand": "Mad Rabbit", "media_label": "Aftercare"})
        overrides[block_id] = settings
        evidence_ids = (source or unresolved)["archive_evidence_ids"]
        record = {
            "display_order": index,
            "template_block_id": block_id,
            "title": item["title"],
            "client_product_url": item["product_url"],
            "captured_price": item["price_display"],
            "prior_staged_image_url": item["image_url"],
            "recommended_settings": settings,
            "archive_evidence": archive_evidence(evidence_ids, media, resources, aftercare),
            "shopify_verified": False,
            "client_sku": None,
            "client_variant_options": item.get("options", []),
            "status": "recommended_family_and_size_match" if source else "unresolved_exact_stock_size_photo",
        }
        if source:
            record.update({key: source[key] for key in ("manufacturer_page", "manufacturer_product_data", "manufacturer_product", "manufacturer_size", "manufacturer_sku", "alt", "match_note")})
            record.update(prepared[index])
        else:
            record.update({key: value for key, value in unresolved.items() if key != "archive_evidence_ids"})
            record["fallback_asset"] = "#"
            record["show_image"] = False
        products.append(record)

    manifest = {
        "schema_version": 1,
        "prepared_at_utc": datetime.now(timezone.utc).isoformat(),
        "helper": "scripts/prepare-studio-aftercare-media.py",
        "pillow_version": pillow_version,
        "catalog_source": "archive/current-site-2026-11-10/catalog.json",
        "processing": {"max_edge": MAX_EDGE, "webp_quality": QUALITY, "webp_method": 6, "full_frame": True, "crop": False, "upscale": False, "retouch": False, "ai_generation": False, "palette_alpha_handling": "Convert Base Labs to RGBA before resizing; verify resized alpha unchanged after export."},
        "recommended_product_settings": overrides,
        "overrides": overrides,
        "recommended_orders": [18, 20, 21],
        "unresolved_orders": [17, 19],
        "notes": [
            "This helper writes media and provenance only. It does not change templates, prices, product assignments, or stock declarations.",
            "Current staged source images have ChatGPT filenames. They are replaced only where product family and size match stronger archived client-image evidence plus official manufacturer sources.",
            "A manufacturer photograph does not verify Sideshow current inventory, formula equivalence, or SKU. Captured client catalog contains no explicit size or SKU.",
            "Products 17 and 19 keep their information with asset '#' and show_image false until an exact stocked-size photograph is verified.",
            "The Steri-Wash source page sells wholesale cases, but the chosen photograph shows one bottle. No wholesale case data is imported.",
        ],
        "products": products,
    }
    output = ROOT / "docs/studio-aftercare-media-sources.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for image in prepared.values():
        print(f"{image['asset_path']}: {image['output_dimensions']}, {image['output_bytes']:,} bytes")
    print("Verified 3 pinned sources, 3 decoded WebP outputs, and preserved Base Labs transparency.")
    print("Image-free overrides: product_17 and product_19.")
    print("Manifest: docs/studio-aftercare-media-sources.json")


if __name__ == "__main__":
    main()
