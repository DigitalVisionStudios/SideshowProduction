"""Recover the reviewed current-roster Shopify originals without upscaling.

Windows or macOS/Linux: python scripts/prepare-studio-originals.py
Requires Pillow, which the project media helpers already use.

Only the exact CDN references and source hashes reviewed for this change are
accepted. This helper writes optimized assets and the provenance report, never
Shopify data or theme templates. Existing legacy assets remain untouched.
"""
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen
import hashlib
import json

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".ai-bridge/shopify-originals"
SOURCE_TEMPLATE = "templates/page.artist-portfolio.json"
CDN_PREFIX = "https://cdn.shopify.com/s/files/1/0684/2997/1713/files/"
MAX_SOURCE_BYTES = 5_000_000
QUALITY = 88

SELECTIONS = [{'artist': 'Jake',
  'section': 'portfolio_yFkdkL',
  'block': 'author_nDfefr',
  'field': 'profile_image',
  'reference': 'shopify://shop_images/534394909_1422782015498885_1036830063844308316_n_b3258798-eb61-4f4c-8f78-c0cd56a04cfc.jpg',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/534394909_1422782015498885_1036830063844308316_n_b3258798-eb61-4f4c-8f78-c0cd56a04cfc.jpg',
  'source_dimensions': [750, 1000],
  'source_bytes': 94576,
  'source_sha256': '62308da617f3f97b97299a4e6f5fe14ac707298b19289be943cf6c2bdc5006f9',
  'asset': 'sp-welcome-jake-session.webp',
  'replaces': ['sp-jake.webp'],
  'alt': "Jake wearing blue gloves while tattooing a client's arm at Sideshow",
  'reuse_existing': True},
 {'artist': 'Rigo',
  'section': 'portfolio_8VdjfF',
  'block': 'author_y8MKRD',
  'field': 'profile_image',
  'reference': 'shopify://shop_images/526622776_1310402764119617_5225542224893530845_n_bdddfcc8-430e-4b28-aaf5-5e1afc2da6d9.jpg',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/526622776_1310402764119617_5225542224893530845_n_bdddfcc8-430e-4b28-aaf5-5e1afc2da6d9.jpg',
  'source_dimensions': [815, 1228],
  'source_bytes': 111570,
  'source_sha256': '09f8ff01866194e6df58617c881511b644b13b20e4a18b87f90e37ff8984888d',
  'asset': 'sp-original-rigo-floral.webp',
  'replaces': ['sp-rigo.webp', 'sp-work-02.webp'],
  'alt': 'Blue and purple floral tattoo by Rigo',
  'reuse_existing': False},
 {'artist': 'Sonny',
  'section': 'portfolio_XgQG6y',
  'block': 'author_pUxpLa',
  'field': 'profile_image',
  'reference': 'shopify://shop_images/sideshowproductionstattoo_349221110_1393516688080112_6225021189359635028_n_baf28904-c07b-4aa2-9490-405c8cbff98a.jpg',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/sideshowproductionstattoo_349221110_1393516688080112_6225021189359635028_n_baf28904-c07b-4aa2-9490-405c8cbff98a.jpg',
  'source_dimensions': [461, 461],
  'source_bytes': 41773,
  'source_sha256': 'e01b9d7c11c9d4e0fa5dafc4216bad5769316cc98cba424258abf84c9f5fabb9',
  'asset': 'sp-original-sonny-ear.webp',
  'replaces': ['sp-sonny.webp'],
  'alt': 'Gold ear jewelry in piercing work by Sonny',
  'reuse_existing': False},
 {'artist': 'Megan',
  'section': 'portfolio_NhdxPw',
  'block': 'author_mLcbKx',
  'field': 'profile_image',
  'reference': 'shopify://shop_images/533154052_30825867153726763_898925798855418618_n.jpg',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/533154052_30825867153726763_898925798855418618_n.jpg',
  'source_dimensions': [480, 481],
  'source_bytes': 29026,
  'source_sha256': 'ac14f1d91723a8f4fa3caf7eadacadf5e0d8a15fd34ab704af338cd871602d4e',
  'asset': 'sp-original-megan.webp',
  'replaces': ['sp-megan.webp'],
  'alt': 'Megan, Sideshow Productions tooth-gem and whitening artist',
  'reuse_existing': False},
 {'artist': 'Jake',
  'section': 'portfolio_yFkdkL',
  'block': 'author_nDfefr',
  'field': 'portfolio_image_5',
  'reference': 'shopify://shop_images/525253195_1270153974000620_4829795239189763710_n.jpg',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/525253195_1270153974000620_4829795239189763710_n.jpg',
  'source_dimensions': [750, 1000],
  'source_bytes': 97505,
  'source_sha256': 'c30dd9564be61d42990a1f2c5529cc46f0b87a83e53862ac1e0fa0690d9f8b19',
  'asset': 'sp-original-jake-boot.webp',
  'replaces': ['sp-work-01.webp'],
  'alt': 'Fine-line cowboy boot filled with flowers by Jake',
  'reuse_existing': False},
 {'artist': 'Jake',
  'section': 'portfolio_yFkdkL',
  'block': 'author_nDfefr',
  'field': 'portfolio_image_2',
  'reference': 'shopify://shop_images/515173148_1257222752509581_3976315660138338170_n.jpg',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/515173148_1257222752509581_3976315660138338170_n.jpg',
  'source_dimensions': [750, 1000],
  'source_bytes': 66938,
  'source_sha256': '661c66fc24b590fdd672cbc9a144a703dcdd8b8195f3708bbbca07916d4e9e3e',
  'asset': 'sp-original-jake-swallow.webp',
  'replaces': ['sp-work-03.webp'],
  'alt': 'Black swallow, sun, and wave tattoo by Jake',
  'reuse_existing': False},
 {'artist': 'Sonny',
  'section': 'portfolio_XgQG6y',
  'block': 'author_pUxpLa',
  'field': 'portfolio_image_5',
  'reference': 'shopify://shop_images/sonny.27__1676172151_3036274529756647097_48765499699.jpg',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/sonny.27__1676172151_3036274529756647097_48765499699.jpg',
  'source_dimensions': [1440, 1800],
  'source_bytes': 295296,
  'source_sha256': 'a09969b1194ee3d4f5bdb2f070b76e3c97dafa926454923a4af373611bcf47bc',
  'asset': 'sp-original-sonny-heart.webp',
  'replaces': ['sp-work-04.webp'],
  'alt': 'Gold heart-shaped ear jewelry in a piercing by Sonny',
  'reuse_existing': False},
 {'artist': 'Jake',
  'section': 'portfolio_yFkdkL',
  'block': 'author_nDfefr',
  'field': 'portfolio_image_9',
  'reference': 'shopify://shop_images/483440449_1868139724016053_5344666152142629261_n.jpg',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/483440449_1868139724016053_5344666152142629261_n.jpg',
  'source_dimensions': [750, 1000],
  'source_bytes': 88187,
  'source_sha256': '32e6a3a8c101a1d1bb0933d083aacadbe4a8d392f22be43a1219a4e7b20439f8',
  'asset': 'sp-original-jake-dragon.webp',
  'replaces': ['sp-work-05.webp'],
  'alt': 'Dragon linework tattoo beneath a crescent moon by Jake',
  'reuse_existing': False},
 {'artist': 'Megan',
  'section': 'portfolio_NhdxPw',
  'block': 'author_mLcbKx',
  'field': 'portfolio_image_6',
  'reference': 'shopify://shop_images/sideshowproductionstattoo_343440823_184852917761477_5979119919449896651_n_f9800b85-0105-41e8-9edf-4c857156adef.jpg',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/sideshowproductionstattoo_343440823_184852917761477_5979119919449896651_n_f9800b85-0105-41e8-9edf-4c857156adef.jpg',
  'source_dimensions': [1080, 1350],
  'source_bytes': 156705,
  'source_sha256': '91e2af3d7c21506b505596cac7a6b1ecd88acf4381a3fe3e78b73da66d0e6e14',
  'asset': 'sp-original-megan-gem.webp',
  'replaces': ['sp-work-06.webp'],
  'alt': "Small tooth gem shown in Megan's portfolio",
  'reuse_existing': False},
 {'artist': 'Jake',
  'section': 'portfolio_yFkdkL',
  'block': 'author_nDfefr',
  'field': 'portfolio_image_7',
  'reference': 'shopify://shop_images/527683797_3241014639397685_417521430636439300_n.jpg',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/527683797_3241014639397685_417521430636439300_n.jpg',
  'source_dimensions': [750, 1000],
  'source_bytes': 81158,
  'source_sha256': '6398765bb0e27dafa58eded7e9f45e6f2b247d71ac1ae102207ef637117734e8',
  'asset': 'sp-original-jake-figure.webp',
  'replaces': ['sp-work-08.webp'],
  'alt': 'Illustrative black tattoo of a seated figure beneath a crescent moon by Jake',
  'reuse_existing': False},
 {'artist': 'Jake',
  'section': 'portfolio_yFkdkL',
  'block': 'author_nDfefr',
  'field': 'portfolio_image_4',
  'reference': 'shopify://shop_images/524304487_2748688328673773_643843769518182968_n.jpg',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/524304487_2748688328673773_643843769518182968_n.jpg',
  'source_dimensions': [750, 1000],
  'source_bytes': 89313,
  'source_sha256': '1f9ebc5eb73f141e8c6aa213805b10baf54c6a133e5992f298860ba6f5029ebb',
  'asset': 'sp-original-jake-sunflower.webp',
  'replaces': ['sp-work-09.webp'],
  'alt': 'Sunflower growing from a shoe tattoo by Jake',
  'reuse_existing': False},
 {'artist': 'Jake',
  'section': 'portfolio_yFkdkL',
  'block': 'author_nDfefr',
  'field': 'portfolio_image_6',
  'reference': 'shopify://shop_images/526477715_1147361930556400_595687546615032226_n.jpg',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/526477715_1147361930556400_595687546615032226_n.jpg',
  'source_dimensions': [750, 1000],
  'source_bytes': 90496,
  'source_sha256': '0d1a41507856c046c06ca2b80962d68d4417f893be49af4f8818802c8371c127',
  'asset': 'sp-original-jake-reaper.webp',
  'replaces': ['sp-work-dark-01.webp'],
  'alt': 'Black grim reaper tattoo holding a scythe by Jake',
  'reuse_existing': False},
 {'artist': 'Jake',
  'section': 'portfolio_yFkdkL',
  'block': 'author_nDfefr',
  'field': 'portfolio_image_8',
  'reference': 'shopify://shop_images/524723252_1058970603012472_3874108079096670009_n.jpg',
  'source_url': 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/524723252_1058970603012472_3874108079096670009_n.jpg',
  'source_dimensions': [1000, 750],
  'source_bytes': 73222,
  'source_sha256': '922265d402270da84a3220f9515e7b1ed2c1dfde31c45d829cb61926dd7e809b',
  'asset': 'sp-original-jake-spiders.webp',
  'replaces': ['sp-work-dark-02.webp'],
  'alt': 'Two black spider tattoos forming a heart shape by Jake',
  'reuse_existing': False}]

NOT_SELECTED = [
    {
        "asset": "sp-work-07.webp",
        "artist": "Rigo",
        "legacy_field": "portfolio_image_4",
        "candidate_dimensions": [730, 722],
        "reason": "Same lettering subject, but the 730x722 original provides no meaningful resolution gain over the 735x729 retained asset.",
    },
    {
        "asset": "sp-work-10.webp",
        "artist": "Rigo",
        "legacy_field": "portfolio_image_3",
        "candidate_dimensions": [540, 1230],
        "reason": "The source is a narrow screenshot with black letterboxing and visible interface marks; it is not a cleaner high-resolution photograph.",
    },
    {
        "asset": "sp-work-11.webp",
        "artist": "Sonny",
        "reason": "None of the six larger originals matched the currently used blue-hair ear-piercing subject. The retained subject remains unchanged.",
    },
    {
        "asset": "sp-work-12.webp",
        "artist": "Megan",
        "legacy_field": "portfolio_image_10",
        "candidate_dimensions": [480, 480],
        "reason": "The matching original is only 480x480, below the 724x714 retained asset; it is not a resolution upgrade.",
    },
]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def image_info(data):
    with Image.open(BytesIO(data)) as image:
        image.verify()
    with Image.open(BytesIO(data)) as image:
        image.load()
        return image.size, image.format


def verify_references():
    template = json.loads((ROOT / SOURCE_TEMPLATE).read_text(encoding="utf-8"))
    for record in SELECTIONS:
        section = template["sections"][record["section"]]
        settings = section["blocks"][record["block"]]["settings"]
        if section.get("disabled") or settings.get("author_name") != record["artist"]:
            raise RuntimeError("The retained template no longer confirms the artist attribution")
        if settings.get(record["field"]) != record["reference"]:
            raise RuntimeError("The retained template image reference changed: " + record["asset"])
        if not record["source_url"].startswith(CDN_PREFIX):
            raise RuntimeError("Unexpected image host")
        expected_url = CDN_PREFIX + record["reference"].removeprefix("shopify://shop_images/")
        if record["source_url"] != expected_url:
            raise RuntimeError("CDN URL does not match the retained Shopify image reference")


def fetch_source(record):
    cache = CACHE / record["source_url"].rsplit("/", 1)[-1]
    if cache.exists():
        data = cache.read_bytes()
    else:
        request = Request(record["source_url"], headers={"User-Agent": "SideshowMediaRecovery/1.0", "Accept": "image/*"})
        with urlopen(request, timeout=30) as response:
            if not response.geturl().startswith(CDN_PREFIX):
                raise RuntimeError("Unexpected image redirect")
            data = response.read(MAX_SOURCE_BYTES + 1)
    if len(data) > MAX_SOURCE_BYTES or len(data) != record["source_bytes"]:
        raise RuntimeError("Source byte count changed: " + record["asset"])
    if sha256(data) != record["source_sha256"]:
        raise RuntimeError("Source hash changed; review the new file before replacing it: " + record["asset"])
    size, _ = image_info(data)
    if list(size) != record["source_dimensions"]:
        raise RuntimeError("Source dimensions changed: " + record["asset"])
    if not cache.exists():
        cache.write_bytes(data)
    return data


def prepare_asset(record, data):
    target = ROOT / "assets" / record["asset"]
    if record["reuse_existing"]:
        if not target.exists():
            raise RuntimeError("Expected existing asset is absent: " + record["asset"])
        if sha256(target.read_bytes()) != "ea07c526554dabe8ca07a335a2b64371de557c1f58d3880993b92106d3f55165":
            raise RuntimeError("The reused Jake photograph differs from its reviewed asset")
    else:
        with Image.open(BytesIO(data)) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
            if list(image.size) != record["source_dimensions"]:
                raise RuntimeError("Unexpected orientation change; inspect before saving: " + record["asset"])
            # No crop, enlargement, creative retouching, or AI generation.
            image.save(target, "WEBP", quality=QUALITY, method=6)
    output = target.read_bytes()
    dimensions, image_format = image_info(output)
    if image_format != "WEBP" or list(dimensions) != record["source_dimensions"]:
        raise RuntimeError("Prepared image dimensions or format differ from the original")
    previous = []
    for filename in record["replaces"]:
        old = ROOT / "assets" / filename
        old_size, _ = image_info(old.read_bytes())
        previous.append({"asset": filename, "dimensions": list(old_size), "bytes": old.stat().st_size})
    return {
        **record,
        "asset_path": "assets/" + record["asset"],
        "width": dimensions[0],
        "height": dimensions[1],
        "bytes": len(output),
        "sha256": sha256(output),
        "source_template": SOURCE_TEMPLATE,
        "source_author_name": record["artist"],
        "prior_assets": previous,
        "processing": "Existing reviewed WebP reused unchanged." if record["reuse_existing"] else "WebP quality 88, method 6. Full native source resolution. No crop, resize, enlargement, retouching, generated content, or artificial sharpening.",
    }


def main():
    verify_references()
    CACHE.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        sources = list(pool.map(fetch_source, SELECTIONS))
    records = [prepare_asset(record, source) for record, source in zip(SELECTIONS, sources)]
    replacements = {
        previous: {"asset": record["asset"], "alt": record["alt"], "artist": record["artist"], "dimensions": [record["width"], record["height"]]}
        for record in records
        for previous in record["replaces"]
    }
    report = {
        "review_date": "2026-11-11",
        "purpose": "Replace current-roster screenshot crops with visually matched original Shopify images while preserving subjects and artist attribution.",
        "reproduction_helper": "scripts/prepare-studio-originals.py",
        "source_template": SOURCE_TEMPLATE,
        "selection_scope": "36 unique current-roster candidates were retrieved and visually compared. Thirteen exact-source records were selected, yielding twelve new assets and one reused asset. No additional portfolio subjects are introduced.",
        "replacement_map": replacements,
        "assets": records,
        "retained_images": NOT_SELECTED,
        "notes": [
            "Jake and Megan are person photographs. Rigo and Sonny profile references show their work and must not be described as headshots.",
            "Megan's profile remains a modest 480x481 source and Sonny's profile remains 461x461. Their native originals remove the baked-in circular screenshot masks; they do not become high-resolution portraits.",
            "Jake's existing 750x1000 Welcome photograph is reused without creating another copy.",
            "Rigo's 815x1228 floral tattoo photograph is shared by his artist card and its matching portfolio entry.",
            "Sonny's portfolio_image_23 is marked adult content in the legacy section. It was excluded from the retrieval and selection set.",
            "Larger before/after or differently posed treatment photos were not substituted for existing subjects merely because their pixel dimensions were greater.",
            "Old optimized assets are retained for unchanged uses and provenance. This script does not rewrite templates or Shopify data.",
            "WebP encoding bytes can differ with Pillow/libwebp versions. Source hash, subject, artist attribution, native dimensions, and processing instructions are fixed and verified.",
        ],
    }
    destination = ROOT / "docs/studio-original-media-sources.json"
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"new_asset_count": sum(not r["reuse_existing"] for r in records), "new_asset_bytes": sum(r["bytes"] for r in records if not r["reuse_existing"]), "replacement_map": replacements, "report": str(destination)}, indent=2))


if __name__ == "__main__":
    main()
