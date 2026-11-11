#!/usr/bin/env python3
"""Prepare the studio shop and Ink Roulette from verified archived source files only."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "archive" / "current-site-2026-11-10"
ASSETS = ROOT / "assets"
DOCS = ROOT / "docs"

def digest(data):
    return hashlib.sha256(data).hexdigest()

def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def load_schema(name):
    text = (ROOT / "sections" / (name + ".liquid")).read_text(encoding="utf-8")
    match = re.search(r"{%\s*schema\s*%}(.*?){%\s*endschema\s*%}", text, re.S)
    if not match:
        raise ValueError("Section schema missing: " + name)
    return json.loads(match.group(1))

def validate_blocks(section, schema):
    types = {b["type"]: b for b in schema.get("blocks", [])}
    section_ids = {x.get("id") for x in schema.get("settings", [])}
    assert set(section.get("settings", {})) <= section_ids, ("Unknown section settings", section["type"])
    assert section["block_order"] == list(section["blocks"]), "Block ordering mismatch"
    for block in section["blocks"].values():
        assert block["type"] in types, "Unknown block type"
        ids = {x.get("id") for x in types[block["type"]].get("settings", [])}
        assert set(block["settings"]) <= ids, "Unknown block setting"
        assert all(not isinstance(v, str) or v.strip() for v in block["settings"].values()), "Empty string setting"

def prepare_image(source_relative, filename, bounds):
    if not source_relative:
        raise ValueError("Original archive image path is missing")
    path = (ARCHIVE / source_relative).resolve()
    assert path.is_relative_to(ARCHIVE.resolve()), "Image must come from the scoped archive"
    raw = path.read_bytes()
    with Image.open(io.BytesIO(raw)) as check:
        check.verify()
    with Image.open(io.BytesIO(raw)) as opened:
        frame = ImageOps.exif_transpose(opened)
        if frame.mode not in ("RGB", "RGBA"):
            frame = frame.convert("RGBA" if "transparency" in frame.info else "RGB")
        source_dimensions = [frame.width, frame.height]
        frame.thumbnail(bounds, Image.Resampling.LANCZOS)
        destination = ASSETS / filename
        frame.save(destination, "WEBP", quality=85, method=6)
        width, height = frame.size
    output = destination.read_bytes()
    with Image.open(io.BytesIO(output)) as image:
        assert image.format == "WEBP"
        image.verify()
    return {
        "asset": filename,
        "asset_path": destination.relative_to(ROOT).as_posix(),
        "source_archive_path": path.relative_to(ROOT).as_posix(),
        "source_sha256": digest(raw),
        "source_dimensions": source_dimensions,
        "output_dimensions": [width, height],
        "output_bytes": len(output),
        "output_sha256": digest(output),
        "processing": "EXIF display orientation, proportional downsize if needed, WebP quality 85. No crop, upscale, or creative retouch.",
    }

def corrected_title(value):
    return value.replace("Ehance Balm", "Enhance Balm").replace("Tattoo's", "Tattoos").replace("Ware Wolf", "Werewolf")

def section_by_type(template, section_type):
    matching = [s for s in template["sections"].values() if s["type"] == section_type]
    assert len(matching) == 1, "Expected one " + section_type
    return matching[0]

def main():
    catalog = json.loads((ARCHIVE / "catalog.json").read_text(encoding="utf-8"))
    galleries = json.loads((ARCHIVE / "galleries.json").read_text(encoding="utf-8"))
    catalog_items = catalog["products"]
    assert len(catalog_items) == 21
    roulette_items = galleries["ink-roulette"]["images"]
    assert len(roulette_items) == 27
    roulette_curation = json.loads((DOCS / "studio-roulette-curation.json").read_text(encoding="utf-8"))
    reviewed_roulette = {item["asset"]: item for item in roulette_curation["items"]}
    aftercare_overrides = json.loads((DOCS / "studio-aftercare-media-sources.json").read_text(encoding="utf-8"))["recommended_product_settings"]

    # Source brand-prefixed merchandise is presented before the five aftercare products.
    merch = [p for p in catalog_items if p["title"].startswith("Sideshow Productions ")]
    care = [p for p in catalog_items if not p["title"].startswith("Sideshow Productions ")]
    ordered_products = merch + care
    assert len(merch) == 16 and len(care) == 5

    shop_path = ROOT / "templates" / "page.studio-shop.json"
    roulette_path = ROOT / "templates" / "page.studio-ink-roulette.json"
    shop_template = json.loads(shop_path.read_text(encoding="utf-8"))
    roulette_template = json.loads(roulette_path.read_text(encoding="utf-8"))
    shop_section = section_by_type(shop_template, "studio-shop")
    roulette_section = section_by_type(roulette_template, "studio-roulette")
    roulette_gallery = section_by_type(roulette_template, "studio-flash-gallery")

    ASSETS.mkdir(exist_ok=True)
    DOCS.mkdir(exist_ok=True)
    product_blocks = {}
    product_mapping = []
    for index, product in enumerate(ordered_products, 1):
        filename = f"sp-product-{index:02d}.webp"
        image = prepare_image(product["image_local_path"], filename, (900, 1100))
        title = corrected_title(product["title"])
        block_id = f"product_{index:02d}"
        assert product["price_display"] and not product["price_display"].startswith("\\")
        product_blocks[block_id] = {
            "type": "item",
            "settings": {
                "title": title,
                "asset": filename,
                "price": product["price_display"],
                "sold_out": product["inventory_state"] == "out_of_stock",
            },
        }
        product_blocks[block_id]["settings"].update(aftercare_overrides.get(block_id, {}))
        product_mapping.append({
            "display_order": index,
            "display_group": "Merchandise" if product in merch else "Aftercare",
            "template_block_id": block_id,
            "source_url": product["product_url"],
            "original_title": product["title"],
            "current_display_title": title,
            "captured_price": product["price_display"],
            "currency": product["currency"],
            "captured_price_amount": product["price"],
            "original_image_url": product["image_url"],
            "original_image_filepath": image["source_archive_path"],
            "stock_declaration": product["source_availability"],
            "captured_inventory_state": product["inventory_state"],
            "inventory_quantity": product["inventory_quantity"],
            "source_variant_options": product.get("options", []),
            "source_variants": product.get("variants", []),
            "shopify_verified": False,
            "shopify_product_handle": None,
            "source_html": "archive/current-site-2026-11-10/" + product["source_html"],
            **image,
        })
    shop_section["blocks"] = product_blocks
    shop_section["block_order"] = list(product_blocks)
    validate_blocks(shop_section, load_schema("studio-shop"))

    roulette_blocks = {}
    roulette_mapping = []
    for index, source in enumerate(roulette_items, 1):
        filename = f"sp-roulette-{index:02d}.webp"
        image = prepare_image(source["local_path"], filename, (1000, 1000))
        reviewed = reviewed_roulette[filename]
        title = reviewed["recommended_title"]
        block_id = f"design_{index:02d}"
        if reviewed["selectable_design"]:
            roulette_blocks[block_id] = {"type": "sheet", "settings": {"asset": filename, "title": title}}
        roulette_mapping.append({
            "display_order": index,
            "template_block_id": block_id,
            "title": title,
            "selectable_design": reviewed["selectable_design"],
            "source_page": galleries["ink-roulette"]["source_page"],
            "source_image_url": source["source_url"],
            "original_image_url": source["original_url"],
            **image,
        })
    roulette_section["blocks"] = roulette_blocks
    roulette_section["block_order"] = list(roulette_blocks)
    roulette_gallery["blocks"] = roulette_blocks
    roulette_gallery["block_order"] = list(roulette_blocks)
    roulette_gallery.setdefault("settings", {}).update({
        "heading": "THE INK ROULETTE COLLECTION.",
        "kicker": "LEAVE A LITTLE ROOM FOR SURPRISE",
    })
    validate_blocks(roulette_section, load_schema("studio-roulette"))
    validate_blocks(roulette_gallery, load_schema("studio-flash-gallery"))
    save_json(shop_path, shop_template)
    save_json(roulette_path, roulette_template)

    mapping = {
        "source_captured_at": catalog["captured_at"],
        "source_catalog": "archive/current-site-2026-11-10/catalog.json",
        "source_galleries": "archive/current-site-2026-11-10/galleries.json",
        "product_count": len(product_mapping),
        "merchandise_count": len(merch),
        "aftercare_count": len(care),
        "roulette_image_count": len(roulette_mapping),
        "roulette_design_photo_count": len(roulette_blocks),
        "shopify_verified": False,
        "notes": [
            "Prepared entirely from verified archived local image bytes. No source downloads performed.",
            "Product prices and stock declarations are from captured public HTML/JSON-LD, not Shopify inventory.",
            "Shopify product selectors remain unassigned; existing section contact links handle catalog inquiries.",
            "Unknown variants, quantities, and Shopify product handles remain unknown.",
            "Only obvious spelling/grammar corrections were made to display titles; original titles are retained.",
            "Roulette captions describe the reviewed subjects. Imported display order is not a physical game number. Board and rules photographs remain archived but are excluded from design selection.",
        ],
        "products": product_mapping,
        "roulette_assets": roulette_mapping,
    }
    save_json(DOCS / "studio-catalog-mapping.json", mapping)
    fields = [
        "display_order", "display_group", "template_block_id", "source_url",
        "original_title", "current_display_title", "captured_price", "currency",
        "captured_price_amount", "original_image_url", "original_image_filepath",
        "stock_declaration", "captured_inventory_state", "inventory_quantity",
        "shopify_verified", "shopify_product_handle", "asset", "asset_path",
        "source_sha256", "output_dimensions", "output_bytes", "output_sha256",
    ]
    with (DOCS / "studio-catalog-mapping.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in product_mapping:
            writer.writerow({k: json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v for k, v in row.items()})

    total_bytes = sum(x["output_bytes"] for x in product_mapping + roulette_mapping)
    print(json.dumps({
        "products": len(product_mapping),
        "merchandise": len(merch),
        "aftercare": len(care),
        "roulette_images": len(roulette_mapping),
        "roulette_blocks_per_section": len(roulette_blocks),
        "optimized_assets": len(product_mapping) + len(roulette_mapping),
        "optimized_total_bytes": total_bytes,
        "sold_out": [p["current_display_title"] for p in product_mapping if p["captured_inventory_state"] == "out_of_stock"],
        "shopify_products_assigned": 0,
        "network_requests": 0,
        "mapping_json": "docs/studio-catalog-mapping.json",
        "mapping_csv": "docs/studio-catalog-mapping.csv",
    }), flush=True)

if __name__ == "__main__":
    main()
