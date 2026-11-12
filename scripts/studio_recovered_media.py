"""Prepare the seven visually matched Shopify originals used by the studio theme.

Run: python scripts/studio_recovered_media.py
Also imported by older media helpers so regeneration keeps the better sources.
Only pinned, reviewed images are accepted. No cropping, enlargement or retouching.
"""
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen
import hashlib
import json

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "docs/studio-template-upgrades.json"
CDN = "https://cdn.shopify.com/s/files/1/0684/2997/1713/files/"
SELECTIONS = {
    record["suggested_theme_asset"]: record
    for record in json.loads(MANIFEST.read_text(encoding="utf-8"))["assets"]
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verified_source(record):
    raw = (ROOT / record["source_archive_template"]).read_text(encoding="utf-8-sig").lstrip()
    # Shopify exports can prepend their generated-file comment to JSON templates.
    if raw.startswith("/*"):
        raw = raw.split("*/", 1)[1].lstrip()
    template = json.loads(raw)
    value = template
    for part in record["source_key"].strip("/").split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        value = value[int(part)] if isinstance(value, list) else value[part]
    if value != record["source_reference"]:
        raise RuntimeError("Archived Shopify image reference changed")
    expected = CDN + value.removeprefix("shopify://shop_images/")
    if expected != record["source_url"]:
        raise RuntimeError("Image URL differs from the archived Shopify reference")
    target = ROOT / record["archive_relative_path"]
    if target.exists():
        data = target.read_bytes()
    else:
        request = Request(expected, headers={"User-Agent": "SideshowTemplateRecovery/1.0"})
        with urlopen(request, timeout=30) as response:
            if not response.geturl().startswith(CDN):
                raise RuntimeError("Unexpected source redirect")
            data = response.read(record["source_bytes"] + 1)
    if len(data) != record["source_bytes"] or sha(data) != record["source_sha256"]:
        raise RuntimeError("Source bytes changed; inspect before replacing an image")
    with Image.open(BytesIO(data)) as opened:
        opened.verify()
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return data


def prepare_override(asset):
    """Return None for unrelated assets, or regenerate the reviewed replacement."""
    record = SELECTIONS.get(asset)
    if record is None:
        return None
    source = verified_source(record)
    with Image.open(BytesIO(source)) as opened:
        photo = ImageOps.exif_transpose(opened)
        if list(photo.size) != record["source_dimensions"]:
            raise RuntimeError("Source orientation or dimensions changed")
        photo = photo.convert("RGBA" if "A" in photo.getbands() else "RGB")
        options = {"quality": 90, "method": 6}
        if opened.info.get("icc_profile"):
            options["icc_profile"] = opened.info["icc_profile"]
        buffer = BytesIO()
        photo.save(buffer, "WEBP", **options)
    data = buffer.getvalue()
    destination = ROOT / asset
    destination.write_bytes(data)
    return {
        "asset": asset,
        "file": destination.name,
        "source": record["archive_relative_path"],
        "source_url": record["source_url"],
        "source_filename": record["source_filename"],
        "source_reference": record["source_reference"],
        "source_template": record["source_template"],
        "source_archive_template": record["source_archive_template"],
        "source_key": record["source_key"],
        "source_commit": record["source_commit"],
        "source_sha256": record["source_sha256"],
        "source_bytes": record["source_bytes"],
        "source_dimensions": record["source_dimensions"],
        "original_source_sha256": record["source_sha256"],
        "original_source_bytes": record["source_bytes"],
        "original_source_dimensions": record["source_dimensions"],
        "width": photo.width,
        "height": photo.height,
        "bytes": len(data),
        "sha256": sha(data),
        "source_provenance": "docs/studio-template-upgrade-results.json",
        "processing": "WebP quality90, method6, full original frame and native dimensions. Source color profile preserved when present. No enlargement, cropping, color correction, sharpening, retouching or generated imagery.",
    }


def refresh_reports(records):
    by_asset = {record["asset"]: record for record in records}
    path = ROOT / "docs/studio-asset-sources.json"
    legacy = json.loads(path.read_text(encoding="utf-8"))
    for item in legacy:
        update = by_asset.get("assets/" + item.get("file", ""))
        if update:
            item.update(update)
            item["archive_source"] = update["source"]
            item["source"] = update["source_url"]
    path.write_text(json.dumps(legacy, indent=2) + "\n", encoding="utf-8")
    for filename in ["studio-authentic-media-sources.json", "studio-welcome-media-sources.json"]:
        path = ROOT / "docs" / filename
        report = json.loads(path.read_text(encoding="utf-8"))
        for item in report["assets"]:
            if item["asset"] in by_asset:
                item.update(by_asset[item["asset"]])
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {
        "review_date": "2026-11-11",
        "purpose": "Use the larger matching originals recovered from the old Shopify homepage.",
        "reproduction_helper": "scripts/studio_recovered_media.py",
        "assets": records,
    }
    (ROOT / "docs/studio-template-upgrade-results.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    results = [prepare_override(asset) for asset in SELECTIONS]
    refresh_reports(results)
    print(json.dumps({"updated": [{"asset": r["asset"], "dimensions": [r["width"], r["height"]], "bytes": r["bytes"]} for r in results]}, indent=2))
