"""Prepare self-hosted studio assets from the client's publicly available originals.
Original source files are also preserved by scripts/archive-site.py.
This resizes/compresses photographs only; it does not invent or retouch artwork.
"""
from pathlib import Path
from io import BytesIO
import concurrent.futures, hashlib, json, re, requests
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SOURCES = {
  "sp-logo.webp": "cropped-03a6efc0-6cdd-401a-a8ba-775ffa79f4a0.png",
  "sp-storefront.webp": "Screenshot-2026-01-09-101734.png",
  "sp-hero.webp": "Screenshot-2026-01-12-170956.png",
  "sp-jake.webp": "Screenshot-2026-01-08-162353-e1774365148720.png",
  "sp-rigo.webp": "Screenshot-2026-01-08-165356-e1774365245548.png",
  "sp-sonny.webp": "Screenshot-2026-01-08-163923-e1774365062847.png",
  "sp-megan.webp": "Screenshot-2026-01-08-163956-e1774365113946.png",
  "sp-work-01.webp": "Screenshot-2026-01-12-171009.png",
  "sp-work-02.webp": "Screenshot-2026-01-13-151743.png",
  "sp-work-03.webp": "Screenshot-2026-01-12-170942.png",
  "sp-work-04.webp": "Screenshot-2026-01-13-152219.png",
  "sp-work-05.webp": "Screenshot-2026-01-12-171037.png",
  "sp-work-06.webp": "Screenshot-2026-01-13-152946.png",
  "sp-work-07.webp": "Screenshot-2026-01-13-151736.png",
  "sp-work-08.webp": "Screenshot-2026-01-12-171023.png",
  "sp-work-09.webp": "Screenshot-2026-01-12-171002.png",
  "sp-work-10.webp": "Screenshot-2026-01-13-151730.png",
  "sp-work-11.webp": "Screenshot-2026-01-13-152133.png",
  "sp-work-12.webp": "Screenshot-2026-01-13-153010.png",
  "sp-flash-01.webp": "Screenshot-2026-01-13-164310.png",
  "sp-flash-02.webp": "Screenshot-2026-01-13-164328.png",
  "sp-flash-03.webp": "Screenshot-2026-01-13-164340.png",
  "sp-flash-04.webp": "Screenshot-2026-01-13-164317.png",
  "sp-flash-05.webp": "Screenshot-2026-01-13-164255.png",
  "sp-flash-06.webp": "Screenshot-2026-01-13-164249.png"
}
BASE = "https://sideshowproductionstattoo.com/wp-content/uploads/2026/01/"
HEADERS = {"User-Agent": "DVS-Sideshow-Content-Preservation/1.0 (client redesign)"}
ASSETS.mkdir(exist_ok=True)

def prepare(item):
    name, original = item
    url = BASE + original
    source_path = ROOT / "archive" / "current-site-2026-11-10" / "assets" / "sideshowproductionstattoo.com" / "wp-content" / "uploads" / "2026" / "01" / original
    if not source_path.exists():
        raise FileNotFoundError(f"Preserved original required: {source_path}")
    with Image.open(source_path) as raw:
        photo = ImageOps.exif_transpose(raw).convert("RGBA" if raw.mode == "RGBA" else "RGB")
        photo.thumbnail((1400, 1600))
        photo.save(ASSETS / name, "WEBP", quality=88, method=6)
        size = photo.size
    data = (ASSETS / name).read_bytes()
    return {"file":name,"source":url,"bytes":len(data),"width":size[0],"height":size[1],"sha256":hashlib.sha256(data).hexdigest()}

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    records = list(pool.map(prepare, SOURCES.items()))
for family, filename in [("Barlow+Condensed:wght@700", "sp-display.woff2"), ("DM+Sans:wght@400..700", "sp-body.woff2")]:
    css_url = "https://fonts.googleapis.com/css2?family=" + family + "&display=swap"
    css = requests.get(css_url,headers={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36"},timeout=30)
    css.raise_for_status()
    # Google Fonts lists the Latin subset last. Store a real WOFF2 file.
    urls = re.findall(r"url\((https://[^)]+)\)", css.text)
    if not urls:
        raise RuntimeError("Font response did not contain a downloadable font")
    font = requests.get(urls[-1],timeout=30)
    font.raise_for_status()
    if font.content[:4] != b"wOF2":
        raise RuntimeError("Expected WOFF2")
    (ASSETS / filename).write_bytes(font.content)
    records.append({"file":filename,"source":urls[-1],"css_source":css_url,"bytes":len(font.content),"sha256":hashlib.sha256(font.content).hexdigest()})
(ROOT / "docs").mkdir(exist_ok=True)
(ROOT / "docs" / "studio-asset-sources.json").write_text(json.dumps(records,indent=2),encoding="utf-8")
print(json.dumps({"assets":len(records),"total_bytes":sum(r["bytes"] for r in records),"files":[r["file"] for r in records]},indent=2))
