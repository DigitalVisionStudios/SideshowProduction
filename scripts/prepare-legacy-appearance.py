#!/usr/bin/env python3
"""Recover the exact old Shopify background assets and pinned SVG player.

Run from any directory with Python 3.10+ and Pillow:
    python scripts/prepare-legacy-appearance.py

The cache lives in ignored .ai-bridge/appearance-source. Cached bytes are checked
against pinned SHA-256 hashes before use. Only the four declared deliverables and
their provenance JSON are written. The original PNG is converted losslessly at
its native dimensions, including its intentionally faint alpha channel.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
from urllib.request import Request, urlopen

from PIL import Image, __version__ as pillow_version


ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILES = {
    "animation": {
        "url": "https://cdn.shopify.com/s/files/1/0684/2997/1713/files/Animation_-_1706478173660.json?v=1706478316",
        "cache_name": "Animation_-_1706478173660.json",
        "sha256": "11210f6e49d9390157a85daa4db497cb6b0ebc03ef2cb6e7eead27be28e1ada0",
        "output": "assets/sp-legacy-background.json",
    },
    "pattern": {
        "url": "https://cdn.shopify.com/s/files/1/0684/2997/1713/files/Frame_1_1.png?v=1706560299",
        "cache_name": "Frame_1_1.png",
        "sha256": "292f84e52b6aedb839789cb987a7954bf3f2ae86e69c6ca22e723314d081e0c5",
        "output": "assets/sp-legacy-sign.webp",
    },
    "player": {
        "url": "https://cdn.jsdelivr.net/npm/lottie-web@5.7.4/build/player/lottie_light.min.js",
        "cache_name": "lottie-web-5.7.4-lottie_light.min.js",
        "sha256": "b6d09da0c3245664a4a6b03f0e4d6b132db88ce994750d8324640403f93814d6",
        "output": "assets/sp-lottie-svg.min.js",
    },
    "license": {
        "url": "https://cdn.jsdelivr.net/npm/lottie-web@5.7.4/LICENSE.md",
        "cache_name": "lottie-web-5.7.4-LICENSE.md",
        "sha256": "4750849de81eeee983513f7e66c419abf4656146a23283e8e93532075e2c242b",
        "output": "docs/licenses/lottie-web-5.7.4-LICENSE.txt",
    },
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def get_source(entry: dict, cache: Path, offline: bool) -> Path:
    path = cache / entry["cache_name"]
    if not path.exists():
        if offline:
            raise FileNotFoundError(f"Missing cached source: {path}")
        request = Request(entry["url"], headers={"User-Agent": "Sideshow-source-archive/1.0"})
        with urlopen(request, timeout=30) as response:
            data = response.read(16 * 1024 * 1024 + 1)
            if response.status != 200 or len(data) > 16 * 1024 * 1024:
                raise ValueError(f"Unexpected source response: {entry['url']}")
        if sha256(data) != entry["sha256"]:
            raise ValueError(f"Source hash changed; inspect before accepting: {entry['url']}")
        path.write_bytes(data)
    if sha256(path.read_bytes()) != entry["sha256"]:
        raise ValueError(f"Cached source hash mismatch: {path}")
    return path


def expression_paths(value: object, path: str = "") -> list[str]:
    paths = []
    if isinstance(value, dict):
        if isinstance(value.get("x"), str):
            paths.append(path + "/x")
        for key, child in value.items():
            paths.extend(expression_paths(child, path + "/" + key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            paths.extend(expression_paths(child, path + "/" + str(index)))
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=ROOT / ".ai-bridge/appearance-source")
    parser.add_argument("--offline", action="store_true", help="Use only already cached verified sources.")
    args = parser.parse_args()
    args.source_dir.mkdir(parents=True, exist_ok=True)
    sources = {key: get_source(entry, args.source_dir, args.offline) for key, entry in SOURCE_FILES.items()}

    animation = json.loads(sources["animation"].read_bytes())
    if animation.get("assets") or expression_paths(animation):
        raise ValueError("Unexpected external assets or expressions; reassess the light player.")
    if [layer.get("ty") for layer in animation["layers"]] != [4, 1]:
        raise ValueError("Unexpected animation layers; reassess SVG light compatibility.")

    for key in ("animation", "player", "license"):
        output = ROOT / SOURCE_FILES[key]["output"]
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(sources[key], output)

    pattern = Image.open(sources["pattern"]).convert("RGBA")
    if pattern.size != (1228, 2376) or pattern.getchannel("A").getextrema() != (0, 20):
        raise ValueError("Unexpected pattern dimensions or alpha channel.")
    pattern_output = ROOT / SOURCE_FILES["pattern"]["output"]
    pattern.save(pattern_output, format="WEBP", lossless=True, quality=100, method=6, exact=True)
    with Image.open(pattern_output) as decoded:
        if decoded.convert("RGBA").tobytes() != pattern.tobytes():
            raise ValueError("Lossless WebP pixel validation failed.")

    records = {}
    for key, entry in SOURCE_FILES.items():
        output = ROOT / entry["output"]
        data = output.read_bytes()
        records[key] = {
            "source_url": entry["url"],
            "source_sha256": entry["sha256"],
            "source_bytes": sources[key].stat().st_size,
            "output": entry["output"],
            "output_sha256": sha256(data),
            "output_bytes": len(data),
            "transform": "Lossless WebP, native resolution, all RGBA pixels preserved" if key == "pattern" else "Byte-for-byte copy",
        }

    manifest = {
        "prepared_at_utc": datetime.now(timezone.utc).isoformat(),
        "helper": "scripts/prepare-legacy-appearance.py",
        "pillow_version": pillow_version,
        "assets": records,
        "legacy_evidence": {
            "animation_section": "sections/lottie-fullscreen-section.liquid",
            "animation_settings_file": "config/settings_data.json",
            "animation_settings_json_path": "$.current.sections.lottie-fullscreen-section.settings",
            "original_player_source": "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.7.4/lottie.min.js",
            "original_player_reference": "layout/theme.liquid",
            "original_animation_settings": {"opacity": 0.3, "scale": 5.5},
            "original_player_options": {"renderer": "svg", "loop": False, "autoplay": True},
            "original_loop_behavior": "On complete, reverse playDirection with setDirection and call play; a continuous forward/reverse cycle.",
            "original_mobile_transform": "translateX(-80%) translateY(-50%) scale(10)",
            "pattern_settings_file": "config/settings_data.json",
            "pattern_settings_json_path": "$.current.sections.footer.blocks.192a6b17-ff2b-48ef-8f41-454eb72b8ba4.settings.html_area",
            "original_body_background": {"color": "black", "repeat": "repeat", "size": "cover", "position": "relative"},
            "original_duplicate_pseudo_layer": {"opacity": 0.1, "z_index": -1, "size": "none (invalid CSS value in the source)", "repeat": "repeat"},
            "original_overlay_gradient": "linear-gradient(0deg, black 16%, transparent 73%, transparent 84%, black 100%)",
        },
        "animation": {
            "name": animation["nm"],
            "exporter_version": animation["v"],
            "width": animation["w"],
            "height": animation["h"],
            "frame_rate": animation["fr"],
            "in_frame": animation["ip"],
            "out_frame": animation["op"],
            "one_way_duration_seconds": (animation["op"] - animation["ip"]) / animation["fr"],
            "layer_types": ["shape", "solid"],
            "stroke_rgb_normalized": [0.3412, 0, 0],
            "solid_color": "#021311",
            "external_assets": [],
            "expressions": [],
            "source_changes": "None. Original color, timing, shape repeater, solid and animation data retained.",
        },
        "pattern": {
            "description": "Original tattoo flash symbols, tattoo-history clippings and novelty shop-sign pattern. This is decorative artwork, not a storefront photograph.",
            "width": pattern.width,
            "height": pattern.height,
            "mode": "RGBA",
            "alpha_min": 0,
            "alpha_max": 20,
            "maximum_native_opacity": 20 / 255,
            "focal_point": "No single focal subject; retain full portrait proportions for the repeating pattern.",
            "recommended_element_opacity": 1,
            "opacity_note": "The original file is already faint. Do not multiply by 0.1 to imitate its native alpha. Apply any section readability fades separately.",
            "lossless_rgba_comparison_passed": True,
            "upscaled": False,
        },
        "player": {
            "package": "lottie-web",
            "version": "5.7.4",
            "repository": "https://github.com/airbnb/lottie-web",
            "build": "build/player/lottie_light.min.js (SVG-only light build)",
            "global_names": ["lottie", "bodymovin"],
            "license": "MIT; Copyright (c) 2015 Bodymovin",
            "license_file": "docs/licenses/lottie-web-5.7.4-LICENSE.txt",
            "api_verified_in_matching_unminified_source": ["loadAnimation", "play", "pause", "goToAndStop", "setDirection", "playDirection", "addEventListener", "complete", "destroy"],
            "api_source_url": "https://cdn.jsdelivr.net/npm/lottie-web@5.7.4/build/player/lottie_light.js",
            "api_source_sha256": "fd7b5b430a7a5dace38c852b3f5edb700933e0fc879f2349770bcb7b9d5bd3d4",
            "compatibility": "The source has only a shape layer (path, stroke, repeater and transforms) and a solid layer. The verified SVG light build includes both renderers and the repeater, without needing expression support.",
        },
    }
    manifest_path = ROOT / "docs/studio-legacy-appearance-sources.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    for entry in records.values():
        print(f"{entry['output']}: {entry['output_bytes']:,} bytes")
    print("Verified: unchanged source hashes, valid animation JSON, lossless RGBA image.")
    print("Provenance: docs/studio-legacy-appearance-sources.json")


if __name__ == "__main__":
    main()
