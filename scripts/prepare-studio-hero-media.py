"""Verify hero media, prepare the captured promotion poster, and emit integration data.

Run: python scripts/prepare-studio-hero-media.py
No network requests. On the project PC this uses the preserved original poster.
In the cloud worktree it verifies the WebP transferred from that same source.
"""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import re
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = ROOT / "archive/current-site-2026-11-10"
POSTER_URL = "https://sideshowproductionstattoo.com/wp-content/uploads/2026/11/1793627365890_image.png"
POSTER_HASH = "bb2e1f6cc36cd70e586d7c89c18bdfd8517b23020662e4108ae4693c0a90af37"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def image_record(asset):
    path = ROOT / "assets" / asset
    with Image.open(path) as image:
        image.verify()
    with Image.open(path) as image:
        dimensions = [image.width, image.height]
    return {"asset": "assets/" + asset, "dimensions": dimensions, "bytes": path.stat().st_size, "sha256": sha(path)}


def main():
    manifest = json.loads((ARCHIVE / "manifest.json").read_text(encoding="utf-8"))
    source_record = next(record for record in manifest["resources"] if record.get("url") == POSTER_URL and record.get("status") == 200)
    if source_record["sha256"] != POSTER_HASH:
        raise RuntimeError("Poster provenance differs from the captured archive")
    source = ARCHIVE / source_record["local_path"]
    target = ROOT / "assets/sp-event-nov13.webp"
    if source.exists():
        if sha(source) != POSTER_HASH:
            raise RuntimeError("Original poster hash mismatch")
        with Image.open(source) as image:
            output = image.convert("RGB")
            output.thumbnail((624, 780), Image.Resampling.LANCZOS)
            output.save(target, "WEBP", quality=88, method=6)
    if not target.exists():
        raise RuntimeError("Original poster or transferred WebP is required")
    poster = image_record("sp-event-nov13.webp")
    if poster["dimensions"] != [624, 780]:
        raise RuntimeError("Unexpected poster dimensions")
    poster.update({
        "source_url": POSTER_URL,
        "source_archive_path": source.relative_to(ROOT).as_posix(),
        "source_sha256": POSTER_HASH,
        "source_bytes": 175633,
        "source_dimensions": [624, 780],
        "processing": "WebP quality 88 at the original dimensions. No enlargement, crop, color change, retouching, or generated content. Initial cloud asset transferred using GPT Bridge's image preview from the verified archived PNG.",
    })

    section = (ROOT / "sections/studio-hero.liquid").read_text(encoding="utf-8")
    schema = json.loads(re.search(r"{% schema %}([\s\S]*?){% endschema %}", section).group(1))
    blocks = schema["presets"][0]["blocks"]
    ids = ["artists", "piercings", "tattoos"]
    config = {
        "type": "studio-hero",
        "settings": {
            "prefix": "Unleashing your creativity starts with",
            "suffix": "that inspire.",
            "description": "Our artists bring bold ideas to life, ensuring every detail is perfect.",
            "primary_label": "Book Now",
            "primary_link": "/pages/book",
            "secondary_label": "Our Artists",
            "secondary_link": "/pages/artists",
            "autoplay": True,
            "interval": 5.5,
            "enable_video": True,
        },
        "blocks": {identifier: block for identifier, block in zip(ids, blocks)},
        "block_order": ids,
    }
    (ROOT / "docs/studio-hero-scenes.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")

    sources = {
        "artists": {
            "source_url": "https://sideshowproductionstattoo.com/wp-content/uploads/2026/01/Screenshot-2026-01-09-101734.png",
            "source_role": "Exact original homepage hero background",
            "visual_description": "Sideshow storefront sign and entrance",
            "provenance": "docs/studio-authentic-media-sources.json",
        },
        "piercings": {
            "source_url": "https://cdn.shopify.com/s/files/1/0684/2997/1713/files/sonny.27__1676172151_3036274529756647097_48765499699.jpg",
            "source_role": "Full-resolution original recovered from Sonny's retained Shopify portfolio, replacing the captured screenshot of the same work",
            "visual_description": "Gold heart-shaped ear jewelry in a piercing by Sonny",
            "provenance": "docs/studio-original-media-sources.json",
        },
        "tattoos": {
            "source_url": "https://cdn.shopify.com/s/files/1/0684/2997/1713/files/534394909_1422782015498885_1036830063844308316_n_b3258798-eb61-4f4c-8f78-c0cd56a04cfc.jpg",
            "source_role": "Authentic retained Shopify artist photograph, added to synchronize the redesigned hero with the rotating word",
            "visual_description": "Jake tattooing a client's arm inside the studio",
            "provenance": "docs/studio-welcome-media-sources.json",
        },
    }
    scene_media = []
    for identifier in ids:
        settings = config["blocks"][identifier]["settings"]
        scene_media.append({"word": identifier, **image_record(settings["asset"]), **sources[identifier]})
    css_path = "assets/sideshowproductionstattoo.com/wp-content/uploads/elementor/css/post-20-3894d4c2.css"
    css_record = next((record for record in manifest["resources"] if record.get("local_path") == css_path and record.get("status") == 200), {})
    report = {
        "prepared_at": datetime.now(timezone.utc).isoformat(),
        "original_hero": {
            "source_html": "archive/current-site-2026-11-10/pages/home.html",
            "elementor_outer_container": "20dfcbf",
            "elementor_inner_container": "f8f8798",
            "elementor_headline_widget": "68354fb",
            "prefix": "Unleashing your creativity starts with",
            "rotating_words": ["artists", "piercings", "tattoos"],
            "suffix": "that inspire.",
            "original_delay_ms": 2500,
            "original_animation": "wave, loop yes, slideInDown entrance",
            "original_background": sources["artists"]["source_url"],
            "original_background_css": 'background-image:url("https://sideshowproductionstattoo.com/wp-content/uploads/2026/01/Screenshot-2026-01-09-101734.png");background-position:center center;background-size:cover;',
            "original_overlay_css": "linear-gradient(360deg, #940A0A 46%, #000000 89%)",
            "source_css_archive_path": "archive/current-site-2026-11-10/" + css_path,
            "source_css_url": css_record.get("url"),
            "source_css_sha256": css_record.get("sha256"),
            "important_distinction": "The original homepage uses one storefront background with independently rotating words. No homepage hero image slideshow list was found. The inner container names video as a background type but supplies no video URL.",
            "homepage_video_embed": {
                "url": "https://sideshowproductionstattoo.com/wp-content/uploads/2026/01/6-Instagram-Google-Chrome-9-January-2026-1.mp4",
                "placement": "The Ink Roulette feature lower on the homepage, not the hero background",
                "attributes": ["autoplay", "loop", "muted", "controls"],
            },
        },
        "redesign": {
            "interval_ms": 5500,
            "difference": "Preserves the original storefront opening, exact rotating words, order, prefix and suffix. Adds two genuine photographs as synchronized scenes, smoother crossfades, automatic playback without visitor controls, environmental suspension, and a black bottom fade.",
            "media": scene_media,
            "optional_video_scene": {
                "type": "scene",
                "settings": {"word": "tattoos", "asset": "sp-authentic-hero-poster.webp", "width": 498, "height": 246, "media_style": "cover", "focus_x": 50, "focus_y": 50, "video_asset": "sp-authentic-hero.mp4"},
                "note": "Optional only. The 498x246 hands-and-arm clip is genuine but soft at large hero sizes; the default uses the clearer Jake photograph.",
                "provenance": "docs/studio-authentic-media-sources.json",
            },
        },
        "promotion_poster": poster,
        "popup_source": {
            "source_html": "archive/current-site-2026-11-10/pages/home.html",
            "popup_id": "pum-1905",
            "slug": "friday-the-13th-weekend-nov-13-14",
            "auto_open_delay_ms": 500,
            "fade_ms": 350,
            "frequency_cookies": [],
            "original_escape_close": False,
            "original_backdrop_close": False,
            "friday": "November 13, 2026, 10am-8pm, walk-ins welcome",
            "saturday": "November 14, 2026, noon-8pm, appointment only",
            "offer_from_poster_alt": "Flash tattoos, tooth gems and ear lobe piercings starting at $13 plus $7 gratuity",
            "saturday_booking_deadline": "Thursday, November 12, at 11:59 PM",
            "source_booking_urls": [
                "https://api.apexmediasol.com/widget/booking/IVNMdjDFzeriqu0yNk25",
                "https://api.apexmediasol.com/widget/booking/XhB33wLjo8Rfly7hNlTb",
            ],
            "stale_popup_note": "Separate Elementor popup 1810 ended August 2. Elementor popup 1899 retained an October 25 schedule end and a separate image-swap script ending November 15 at 07:00 UTC. That swap script does not govern Popup Maker 1905.",
        },
        "wheel_source": {
            "source_html": "archive/current-site-2026-11-10/pages/ink-roulette.html",
            "type": "Physical in-studio Ink Roulette experience",
            "price": "$150 for two spins",
            "selection": "Choose a favorite number from the spins, then a design from the physical board",
            "extra_option": "Choose another number for an extra $20",
            "customization": "Color or shading mentioned in source copy",
            "no_invented_rewards": "No discount prize list, reward probabilities, or browser redemption rules were present in the captured implementation.",
        },
        "reproduction_helper": "scripts/prepare-studio-hero-media.py",
    }
    (ROOT / "docs/studio-hero-media-sources.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"scene_order": ids, "configuration": "docs/studio-hero-scenes.json", "provenance": "docs/studio-hero-media-sources.json", "poster": poster["asset"], "poster_dimensions": poster["dimensions"], "poster_bytes": poster["bytes"]}, indent=2))


if __name__ == "__main__":
    main()
