#!/usr/bin/env python3
"""Read-only public Sideshow archive. Does not submit forms or visit booking providers."""
from __future__ import annotations
import concurrent.futures as futures
import hashlib
import html
import json
import re
import shutil
import sys
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit, unquote
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET

import requests
from bs4 import BeautifulSoup

BASE = "https://sideshowproductionstattoo.com"
HOST = urlsplit(BASE).netloc
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "archive" / "current-site-2026-11-10"
MAX_PAGES = 500
MAX_ASSETS = 5000
MAX_BYTES = 1500 * 1024 * 1024
MAX_FILE = 120 * 1024 * 1024
UA = "DVS-PublicSiteArchive/1.0"
STARTED = datetime.now(timezone.utc).isoformat()
LOCK = threading.Lock()
total_bytes = 0
records = []
pages = []
media_inventory = []
external_links = {}
asset_queue = set()
asset_seen = set()
warnings = []
original_map = {}
robots = RobotFileParser()
robot_rules = []
DISALLOWED = re.compile(r"^/(?:wp-admin|wp-login|cart(?:-[0-9]+)?|checkout(?:-[0-9]+)?|my-account|account|wc-api)(?:/|\.|$)", re.I)
FILE_EXT = re.compile(r"\.(?:avif|webp|jpe?g|png|gif|svg|ico|css|js|woff2?|ttf|eot|otf|mp4|webm|mov|mp3|wav|pdf)(?:$|\?)", re.I)

def dump(name, value):
    dest = OUT / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")

def normalized(value, base=BASE):
    value = html.unescape(str(value or "")).strip().strip("'\"").replace("\\/", "/")
    if not value or value.startswith(("data:", "blob:", "javascript:", "tel:", "mailto:", "#")):
        return None
    value = urljoin(base, value)
    p = urlsplit(value)
    if p.scheme not in ("http", "https"):
        return None
    scheme = "https" if p.netloc.lower().removeprefix("www.") == HOST else p.scheme
    return urlunsplit((scheme, p.netloc, p.path, p.query, ""))

def same_origin(url):
    return urlsplit(url).netloc.lower().removeprefix("www.") == HOST

def allowed(url):
    if not same_origin(url):
        return True
    p = urlsplit(url)
    if DISALLOWED.search(p.path) or re.search(r"(?:^|&)(?:add-to-cart|remove_item|wc-ajax|action|logout|delete|download_file|key|order)=", p.query, re.I):
        return False
    if any(p.path.startswith(x) for x in ("/wp-content/uploads/wc-logs/", "/wp-content/uploads/woocommerce_transient_files/", "/wp-content/uploads/woocommerce_uploads/")):
        return False
    return robots.can_fetch(UA, url)

def local_name(url, kind):
    p = urlsplit(url)
    parts = [re.sub(r'[<>:"|?*\\]', "_", unquote(x))[:150] for x in p.path.split("/") if x]
    if kind == "page":
        stem = "__".join(parts) or "home"
        return Path("pages") / (stem[:180] + ".html")
    if kind == "api":
        tag = hashlib.sha256(url.encode()).hexdigest()[:10]
        return Path("api") / (("__".join(parts) or "root")[:150] + "-" + tag + ".json")
    if kind == "sitemap":
        return Path("metadata") / (("__".join(parts) or "sitemap")[:180] + (".xml" if not p.path.endswith(".xml") else ""))
    path = Path("assets") / p.netloc / Path(*(parts or ["index"]))
    if p.query:
        path = path.with_name(path.stem + "-" + hashlib.sha256(p.query.encode()).hexdigest()[:8] + path.suffix)
    return path

def get(url, kind="asset"):
    global total_bytes
    rec = {"url": url, "kind": kind}
    if not allowed(url):
        rec.update(status="skipped", error="robots_or_sensitive_route")
        return rec, None
    with LOCK:
        if total_bytes >= MAX_BYTES:
            rec.update(status="skipped", error="archive_byte_cap")
            return rec, None
    try:
        # Public GET only; no authenticated session, cookies, or form submission.
        response = requests.get(url, headers={"User-Agent": UA}, timeout=(15, 45), stream=True, allow_redirects=False)
        for _ in range(5):
            if response.status_code not in (301, 302, 303, 307, 308):
                break
            target = normalized(response.headers.get("Location"), response.url)
            if not target or (kind in ("page", "api", "sitemap") and not same_origin(target)) or not allowed(target):
                rec.update(status=response.status_code, redirect=target, error="redirect_not_followed")
                return rec, None
            response.close()
            response = requests.get(target, headers={"User-Agent": UA}, timeout=(15, 45), stream=True, allow_redirects=False)
        rec.update(status=response.status_code, final_url=response.url, content_type=response.headers.get("Content-Type", ""), headers={k:response.headers[k] for k in ("Last-Modified", "ETag", "X-WP-Total", "X-WP-TotalPages") if k in response.headers})
        if response.status_code != 200:
            response.close()
            return rec, None
        limit = int(response.headers.get("Content-Length", "0") or "0")
        if limit > MAX_FILE:
            response.close()
            rec.update(error="file_size_cap", bytes=limit)
            return rec, None
        chunks = []
        size = 0
        for chunk in response.iter_content(65536):
            size += len(chunk)
            if size > MAX_FILE:
                response.close()
                rec.update(error="file_size_cap")
                return rec, None
            chunks.append(chunk)
        data = b"".join(chunks)
        response.close()
        with LOCK:
            if total_bytes + size > MAX_BYTES:
                rec.update(error="archive_byte_cap")
                return rec, None
            total_bytes += size
        relative = local_name(url, kind)
        path = OUT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        rec.update(local_path=relative.as_posix(), bytes=size, sha256=hashlib.sha256(data).hexdigest())
        return rec, data
    except Exception as exc:
        rec.update(status="error", error=f"{type(exc).__name__}: {exc}")
        return rec, None

def add_asset(value, base=BASE):
    url = normalized(value, base)
    if not url:
        return
    url = original_map.get(url, url)
    # Fetch only static resources, never foreign HTML/API/booking endpoints.
    if FILE_EXT.search(url) and (same_origin(url) or urlsplit(url).netloc in ("fonts.gstatic.com", "fonts.googleapis.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "ajax.googleapis.com", "cdn.shopify.com", "i0.wp.com", "i1.wp.com", "i2.wp.com")):
        asset_queue.add(url)

def all_string_assets(value, base=BASE):
    if isinstance(value, dict):
        for k, v in value.items():
            all_string_assets(v, base)
    elif isinstance(value, list):
        for v in value:
            all_string_assets(v, base)
    elif isinstance(value, str):
        decoded = html.unescape(value).replace("\\/", "/")
        for match in re.findall(r"https?://[^\s<>\"'\\]+", decoded):
            add_asset(match, base)
        for match in re.findall(r"url\(\s*([^)]+)\)", decoded):
            add_asset(match, base)

def parse_page(url, data, rec):
    soup = BeautifulSoup(data, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    meta = {}
    for node in soup.select("meta[name],meta[property]"):
        key = node.get("name") or node.get("property")
        if key:
            meta[key] = node.get("content", "")
    canonical = soup.select_one('link[rel="canonical"]')
    headings = [{"level": n.name, "text": n.get_text(" ", strip=True)} for n in soup.select("h1,h2,h3,h4,h5,h6")]
    links = []
    page_images = []
    embeds = []
    forms = []
    for node in soup.select("a[href]"):
        href = normalized(node.get("href"), url)
        if not href:
            continue
        links.append({"url":href, "text":node.get_text(" ", strip=True)})
        if not same_origin(href):
            external_links.setdefault(href, set()).add(url)
    for node in soup.select("iframe[src]"):
        embeds.append({"url":normalized(node.get("src"), url),"title":node.get("title","")})
    for node in soup.select("form"):
        forms.append({"method":node.get("method","get"),"action":normalized(node.get("action"),url),"fields":[{"name":n.get("name"),"type":n.get("type"),"label":n.get("aria-label")} for n in node.select("input,textarea,select")]})
    for node in soup.select("img"):
        src = normalized(node.get("data-src") or node.get("src"), url)
        context = node.find_parent(class_=re.compile(r"elementor-widget|gallery|product")) or node.parent
        page_images.append({"url":src,"alt":node.get("alt",""),"width":node.get("width"),"height":node.get("height"),"context":context.get_text(" ",strip=True)[:300] if context else ""})
    for node in soup.find_all(True):
        for attr in ("src", "data-src", "data-lazy-src", "poster", "href"):
            if node.get(attr):
                add_asset(node[attr], url)
        for attr in ("srcset", "data-srcset", "data-lazy-srcset"):
            for part in str(node.get(attr,"")).split(","):
                if part.strip():
                    add_asset(part.strip().split()[0], url)
        if node.get("style"):
            all_string_assets(node["style"], url)
        for key,val in node.attrs.items():
            if key.startswith("data-") and isinstance(val,str):
                all_string_assets(val, url)
    for node in soup.select("style,script"):
        all_string_assets(node.string or node.get_text(), url)
    # Complete all visible upload URL references, including Elementor inline settings.
    decoded = html.unescape(data.decode("utf-8", errors="replace")).replace("\\/", "/")
    for match in re.findall(r"https?://[^\s<>\"'\\]+", decoded):
        if "/wp-content/uploads/" in match:
            add_asset(match, url)
    for node in soup.select("script,style,noscript"):
        node.decompose()
    text = soup.get_text("\n", strip=True)
    text_path = Path(rec["local_path"]).with_suffix(".txt")
    (OUT / text_path).write_text(text, encoding="utf-8")
    pages.append({"url":url,"final_url":rec.get("final_url"),"title":title,"canonical":canonical.get("href") if canonical else None,"metadata":meta,"headings":headings,"links":links,"images":page_images,"embeds":embeds,"forms":forms,"html_path":rec["local_path"],"text_path":text_path.as_posix()})
    return [x["url"] for x in links]

def page_allowed(url):
    p=urlsplit(url)
    return same_origin(url) and not p.query and not FILE_EXT.search(url) and not p.path.startswith(("/wp-json/", "/wp-content/", "/wp-includes/", "/feed/")) and allowed(url)

def checkpoint():
    dump("manifest.json", {"started_at":STARTED,"updated_at":datetime.now(timezone.utc).isoformat(),"origin":BASE,"scope":"Public unauthenticated GET. Booking provider data, customer data, account/checkout/cart actions excluded.","totals":{"pages":len(pages),"media_items":len(media_inventory),"requests":len(records),"saved_bytes":total_bytes},"warnings":warnings,"resources":records})
    dump("inventory.json", {"pages":pages,"media":media_inventory,"external_links":[{"url":u,"source_pages":sorted(s)} for u,s in sorted(external_links.items())]})


def consolidate_assets():
    global asset_queue
    for item in media_inventory:
        source = normalized(item.get("url"))
        if not source:
            continue
        original = normalized(item.get("original_image"), source) if item.get("original_image") else source
        original_map[source] = original
        for size in item.get("sizes",{}).values():
            url=normalized(size.get("source_url"))
            if url: original_map[url] = original
        add_asset(original)
    asset_queue = {original_map.get(url,url) for url in asset_queue}
    dump("original-replacements.json", [{"requested_url":src,"preserved_original_url":dest} for src,dest in sorted(original_map.items()) if src!=dest])

def save_api_content():
    entries=[]
    folder=OUT/"api-content"
    folder.mkdir(parents=True,exist_ok=True)
    for path in sorted((OUT/"api").glob("*.json")):
        if "__media-" in path.name: continue
        try: items=json.loads(path.read_text(encoding="utf-8"))
        except ValueError: continue
        if not isinstance(items,list): continue
        for item in items:
            content=item.get("content",{}).get("rendered","")
            if not content:continue
            slug=re.sub(r"[^a-zA-Z0-9_-]","-",item.get("slug",str(item.get("id","page"))))
            html_path=folder/(slug+".html")
            text_path=folder/(slug+".txt")
            html_path.write_text(content,encoding="utf-8")
            soup=BeautifulSoup(content,"html.parser")
            for n in soup.select("script,style,noscript"):n.decompose()
            text_path.write_text(soup.get_text("\n",strip=True),encoding="utf-8")
            entries.append({"id":item.get("id"),"url":item.get("link"),"title":item.get("title",{}).get("rendered"),"api_source":path.relative_to(OUT).as_posix(),"html_path":html_path.relative_to(OUT).as_posix(),"text_path":text_path.relative_to(OUT).as_posix()})
    dump("api-content-index.json",entries)

def finish():
    bare_names=set()
    for item in media_inventory:
        bare_names.add(Path(urlsplit(item.get("url","")).path).name)
        for size in item.get("sizes",{}).values():
            if size.get("file"):bare_names.add(size["file"])
    raw_failures=[r for r in records if r.get("status")!=200 or r.get("error")]
    discarded=[r for r in raw_failures if r["kind"]=="asset" and same_origin(r["url"]) and urlsplit(r["url"]).path in {"/"+name for name in bare_names}]
    latest={normalized(r["url"]):r for r in records}
    discarded_urls={normalized(r["url"]) for r in discarded}
    failures=[r for u,r in latest.items() if (r.get("status")!=200 or r.get("error")) and u not in discarded_urls]
    dump("discarded-discovery-candidates.json",{"explanation":"Early crawl interpreted bare media metadata filenames as root URLs. These were not actual public resource links; original source URLs are preserved and verified separately.","records":discarded})
    dump("failures.json",failures)
    save_api_content()
    checkpoint()
    stored=sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    summary={"phase":"complete","pages":len(pages),"distinct_page_paths":len({r["html_path"] for r in pages}),"media_items":len(media_inventory),"requests":len(records),"assets_saved":sum(1 for r in records if r["kind"]=="asset" and r.get("local_path")),"failed_requests":len(raw_failures),"discarded_metadata_candidates":len(discarded),"failures":len(failures),"downloaded_bytes":total_bytes,"stored_bytes":stored,"output":str(OUT),"warnings":warnings}
    dump("summary.json",summary)
    (OUT/"README.txt").write_text(
        "Sideshow Productions public archive\n"
        "Captured "+STARTED+"\n\n"
        "manifest.json: attempted URLs, statuses, local paths, byte sizes and SHA-256.\n"
        "inventory.json: page metadata, copy paths, links, images, embeds and public media.\n"
        "media-inventory.json: public WordPress media records and authoritative source URLs.\n"
        "original-replacements.json: thumbnail URLs mapped to preserved original files.\n"
        "pages/: complete HTML and plain text. api/: public WordPress JSON. assets/: static files.\n"
        "api-content/: rendered public page content preserved separately from the site wrapper.\n"
        "failures.json: inaccessible URLs, robots exclusions or errors. summary.json: totals.\n\n"
        "This is a content/source archive, not a rewritten offline website.\n"
        "Original media is prioritized; thumbnail references are mapped to original images.\n"
        "Third-party booking widgets, accounts, payment flows and private appointment/customer data were not copied.\n"
        "Archived source may contain old offers, conflicting information and provider code; review before publishing.\n",
        encoding="utf-8")
    print(json.dumps(summary),flush=True)



def extract_catalog():
    manifest=json.loads((OUT/"manifest.json").read_text(encoding="utf-8"))
    media=json.loads((OUT/"media-inventory.json").read_text(encoding="utf-8"))
    by_url={normalized(r["url"]):r for r in manifest["resources"] if r.get("local_path") and r.get("status")==200}
    replacements={x["requested_url"]:x["preserved_original_url"] for x in json.loads((OUT/"original-replacements.json").read_text(encoding="utf-8"))}
    media_by_url={normalized(x["url"]):x for x in media}
    def walk(value):
        if isinstance(value,dict):
            yield value
            for v in value.values():yield from walk(v)
        elif isinstance(value,list):
            for v in value:yield from walk(v)
    def node_type(node,wanted):
        kind=node.get("@type",[])
        return wanted in kind if isinstance(kind,list) else kind==wanted
    def image_info(url,alt=""):
        url=normalized(url)
        original=replacements.get(url,url)
        rec=by_url.get(original)
        item=media_by_url.get(original,{})
        return {"source_url":url,"original_url":original,"local_path":rec.get("local_path") if rec else None,"alt":alt or item.get("alt",""),"width":item.get("width"),"height":item.get("height")}
    products=[]
    for path in sorted((OUT/"pages").glob("product__*.html")):
        soup=BeautifulSoup(path.read_text(encoding="utf-8"),"html.parser")
        nodes=[]
        for tag in soup.select('script[type="application/ld+json"]'):
            try:nodes.extend(walk(json.loads(tag.get_text())))
            except (ValueError,TypeError):continue
        product=next((x for x in nodes if node_type(x,"Product")),{})
        offers=[x for x in walk(product.get("offers",{})) if node_type(x,"Offer") or node_type(x,"AggregateOffer")]
        price_values=[]
        for offer in offers:
            for key in ("price","lowPrice","highPrice"):
                if offer.get(key) is not None:
                    try:price_values.append(float(offer[key]))
                    except (TypeError,ValueError):pass
        amounts=sorted(set(price_values))
        title_node=soup.select_one(".product_title")
        title_raw=title_node.get_text(" ",strip=True) if title_node else ""
        title=html.unescape(product.get("name") or title_raw).removesuffix(" - Sideshow Productions LLC")
        canonical=soup.select_one('link[rel="canonical"]')
        product_url=canonical.get("href") if canonical else BASE+"/product/"+path.stem.removeprefix("product__")+"/"
        image_nodes=product.get("image",[])
        if isinstance(image_nodes,(str,dict)):image_nodes=[image_nodes]
        images=[x if isinstance(x,str) else x.get("url") for x in image_nodes]
        for node in soup.select(".woocommerce-product-gallery img"):
            url=node.get("data-large_image") or node.get("src")
            if url and url not in images:images.append(url)
        infos=[image_info(url) for url in images if url]
        availability=sorted({x.get("availability","").rsplit("/",1)[-1] for x in offers if x.get("availability")})
        state="out_of_stock" if availability and all(x in ("OutOfStock","SoldOut","Discontinued") for x in availability) else ("in_stock" if "InStock" in availability else ("backorder" if any(x in availability for x in ("BackOrder","PreOrder")) else "unknown"))
        options=[{"name":node.get("name"),"label":node.get("data-attribute_name"),"values":[x.get_text(" ",strip=True) for x in node.select("option[value]") if x.get("value")]} for node in soup.select("form.variations_form select")]
        variants=[]
        for form in soup.select("[data-product_variations]"):
            try:
                data=json.loads(form["data-product_variations"])
                if isinstance(data,list):variants.extend(data)
            except ValueError:pass
        currency=next((x.get("priceCurrency") for x in offers if x.get("priceCurrency")),"USD")
        display=f"${amounts[0]:.2f}" if len(amounts)==1 else (f"${amounts[0]:.2f} - ${amounts[-1]:.2f}" if amounts else None)
        products.append({"title":title,"title_raw":title_raw,"handle":urlsplit(product_url).path.strip("/").split("/")[-1],"price":amounts[0] if len(amounts)==1 else None,"min_price":amounts[0] if amounts else None,"max_price":amounts[-1] if amounts else None,"price_display":display,"currency":currency,"inventory_state":state,"source_availability":availability,"availability_source":"Public product JSON-LD, not a live inventory export","inventory_quantity":None,"image_url":infos[0]["original_url"] if infos else None,"image_local_path":infos[0]["local_path"] if infos else None,"images":infos,"product_url":product_url,"source_html":path.relative_to(OUT).as_posix(),"category":product.get("category"),"description":html.unescape(product.get("description","")),"options":options,"variants":variants})
    dump("catalog.json",{"captured_at":manifest["started_at"],"source":"Saved public product HTML with Product/Offer JSON-LD and visible gallery images","product_count":len(products),"notes":["Prices and availability reflect the captured public site, not Shopify inventory.","Original titles retained, including source spelling errors.","Quantity is unknown unless explicitly provided by source; no quantity was inferred.","No checkout, cart action, or authenticated request was made."],"products":products})
    galleries={}
    for slug in ("ink-roulette","flash-tattoos"):
        path=OUT/"pages"/(slug+".html")
        soup=BeautifulSoup(path.read_text(encoding="utf-8"),"html.parser")
        images=[]
        for node in soup.select("img"):
            url=normalized(node.get("src"))
            if not url:continue
            chosen=(slug=="ink-roulette" and "/uploads/2026/03/" in url) or (slug=="flash-tattoos" and "Screenshot-2026-01-13-164" in url)
            if chosen:images.append(image_info(url,node.get("alt","")))
        galleries[slug]={"source_page":BASE+"/"+slug+"/","source_html":path.relative_to(OUT).as_posix(),"count":len(images),"images":images}
    dump("galleries.json",galleries)
    print(json.dumps({"catalog_product_count":len(products),"products":[{"title":x["title"],"price":x["price_display"],"inventory":x["inventory_state"],"image_saved":bool(x["image_local_path"])} for x in products],"gallery_counts":{k:v["count"] for k,v in galleries.items()}}),flush=True)


def finalize_from_disk():
    global records,pages,media_inventory,total_bytes,external_links,STARTED
    old=json.loads((OUT/"manifest.json").read_text(encoding="utf-8"))
    inv=json.loads((OUT/"inventory.json").read_text(encoding="utf-8"))
    records=old["resources"];pages=inv["pages"];media_inventory=inv["media"]
    STARTED=old["started_at"];total_bytes=old["totals"]["saved_bytes"]
    external_links={x["url"]:set(x["source_pages"]) for x in inv["external_links"]}
    finish()
    paths={r["local_path"] for r in records if r.get("local_path")}
    hashes={}
    missing_files=[]
    for name in sorted(paths):
        path=OUT/name
        if path.exists():hashes[name]=hashlib.sha256(path.read_bytes()).hexdigest()
        else:missing_files.append(name)
    mismatches=[{"url":r["url"],"path":r["local_path"],"expected":r["sha256"],"actual":hashes.get(r["local_path"])} for r in records if r.get("local_path") and r.get("sha256")!=hashes.get(r["local_path"])]
    by_url={normalized(r["url"]):r for r in records if r.get("local_path") and r.get("status")==200}
    replacements={x["requested_url"]:x["preserved_original_url"] for x in json.loads((OUT/"original-replacements.json").read_text(encoding="utf-8"))}
    coverage=[]
    for item in media_inventory:
        url=normalized(item["url"]);url=replacements.get(url,url)
        rec=by_url.get(url)
        coverage.append({"id":item["id"],"source_url":item["url"],"preserved_url":url,"local_path":rec.get("local_path") if rec else None,"sha256":rec.get("sha256") if rec else None,"present":bool(rec and (OUT/rec["local_path"]).exists())})
    dump("media-coverage.json",coverage)
    validation={"unique_files_checked":len(paths),"missing_files":missing_files,"hash_mismatches":mismatches,"media_items":len(coverage),"media_originals_present":sum(1 for x in coverage if x["present"]),"missing_originals":[x for x in coverage if not x["present"]],"all_media_preserved":all(x["present"] for x in coverage)}
    dump("validation.json",validation)
    print(json.dumps({"validation":{k:v for k,v in validation.items() if k not in ("hash_mismatches","missing_originals")},"hash_mismatch_count":len(mismatches)}),flush=True)


def resume_assets():
    global records,pages,media_inventory,total_bytes,external_links,STARTED
    old=json.loads((OUT/"manifest.json").read_text(encoding="utf-8"))
    inv=json.loads((OUT/"inventory.json").read_text(encoding="utf-8"))
    records=old["resources"];pages=inv["pages"];media_inventory=inv["media"]
    STARTED=old["started_at"]
    total_bytes=sum(r.get("bytes",0) for r in records if r.get("local_path"))
    external_links={x["url"]:set(x["source_pages"]) for x in inv["external_links"]}
    robots.parse((OUT/"robots.txt").read_text(encoding="utf-8").splitlines())
    # Retain any full-size-original metadata not needed by the initial media index.
    original_names={}
    for path in (OUT/"api").glob("*__media-*.json"):
        items=json.loads(path.read_text(encoding="utf-8"))
        for item in items:
            original_names[item.get("id")]=item.get("media_details",{}).get("original_image")
            all_string_assets(item)
    for item in media_inventory:item["original_image"]=original_names.get(item.get("id"))
    consolidate_assets()
    for page in pages:
        data=(OUT/page["html_path"]).read_text(encoding="utf-8")
        soup=BeautifulSoup(data,"html.parser")
        for node in soup.find_all(True):
            for attr in ("src","data-src","poster","href"):
                if node.get(attr):add_asset(node[attr],page["url"])
            for attr in ("srcset","data-srcset"):
                for part in str(node.get(attr,"")).split(","):
                    if part.strip():add_asset(part.strip().split()[0],page["url"])
            for key,value in node.attrs.items():
                if key=="style" or key.startswith("data-"):all_string_assets(value,page["url"])
        for node in soup.select("style,script"):all_string_assets(node.string or node.get_text(),page["url"])
    consolidate_assets()
    # Previously completed successful downloads can be reused without another request.
    success={normalized(r["url"]):r for r in records if r["kind"]=="asset" and r.get("local_path") and r.get("status")==200}
    asset_seen.update(success)
    print(json.dumps({"phase":"resume_originals","candidate_originals_and_resources":len(asset_queue),"already_saved":len(asset_seen),"pages":len(pages)}),flush=True)
    while asset_queue-asset_seen and len(asset_seen)<MAX_ASSETS:
        batch=sorted(asset_queue-asset_seen)[:16]
        asset_seen.update(batch)
        fresh=[]
        for url in batch:
            path=OUT/local_name(url,"asset")
            if path.exists():
                data=path.read_bytes()
                rec={"url":url,"kind":"asset","status":200,"local_path":path.relative_to(OUT).as_posix(),"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),"retrieval":"reuse_successful_download","http_revalidated":False}
                records.append(rec)
                if path.suffix==".css":all_string_assets(data.decode("utf-8",errors="replace"),url)
            else:fresh.append(url)
        with futures.ThreadPoolExecutor(max_workers=4) as pool:
            for rec,data in pool.map(lambda u:get(u,"asset"),fresh):
                records.append(rec)
                if data and ("text/css" in rec.get("content_type","") or urlsplit(rec["url"]).path.endswith(".css")):
                    all_string_assets(data.decode("utf-8",errors="replace"),rec.get("final_url",rec["url"]))
        checkpoint()
        print(json.dumps({"phase":"original_assets","attempted":len(asset_seen),"candidates":len(asset_queue),"saved_mb":round(total_bytes/1024**2,2)}),flush=True)
        if total_bytes>=MAX_BYTES:break
    remaining=asset_queue-asset_seen
    if remaining:
        warnings.append(f"{len(remaining)} resources not fetched because archive cap was reached.")
        dump("unfetched-assets.json",sorted(remaining))
    finish()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    free=shutil.disk_usage(ROOT).free
    if free < MAX_BYTES + 2 * 1024**3:
        raise SystemExit("Insufficient free disk space for scoped archive.")
    response=requests.get(BASE+"/robots.txt",headers={"User-Agent":UA},timeout=20)
    if response.status_code in (401,403):
        raise SystemExit("robots.txt access denied; archive stopped.")
    rules=response.text if response.status_code==200 else ""
    (OUT/"robots.txt").write_bytes(response.content)
    robots.parse(rules.splitlines())
    records.append({"url":BASE+"/robots.txt","kind":"robots","status":response.status_code,"local_path":"robots.txt","bytes":len(response.content),"sha256":hashlib.sha256(response.content).hexdigest()})
    print(json.dumps({"phase":"started","free_gb":round(free/1024**3,2),"robots_status":response.status_code}),flush=True)
    pending=deque([BASE+"/"])
    sitemap_queue=deque(re.findall(r"(?im)^sitemap:\s*(\S+)",rules) or [BASE+"/sitemap_index.xml"])
    seen_sitemaps=set()
    while sitemap_queue and len(seen_sitemaps)<30:
        url=sitemap_queue.popleft()
        if url in seen_sitemaps: continue
        seen_sitemaps.add(url)
        rec,data=get(url,"sitemap");records.append(rec)
        if not data: continue
        try:
            tree=ET.fromstring(data)
            for node in tree.findall(".//{*}loc"):
                target=normalized(node.text)
                if not target: continue
                if target.endswith(".xml"):
                    sitemap_queue.append(target)
                elif FILE_EXT.search(target):
                    add_asset(target)
                elif page_allowed(target):
                    pending.append(target)
        except ET.ParseError:
            warnings.append("Invalid sitemap XML: "+url)
    # Public WordPress endpoints list only publicly exposed records. No credentials used.
    for endpoint in ("pages","posts","media"):
        api_page=1
        api_total=1
        while api_page<=api_total and api_page<=20:
            url=f"{BASE}/wp-json/wp/v2/{endpoint}?per_page=100&page={api_page}"
            rec,data=get(url,"api");records.append(rec)
            if not data: break
            try: items=json.loads(data)
            except ValueError: break
            if not isinstance(items,list): break
            api_total=int(rec.get("headers",{}).get("X-WP-TotalPages","1"))
            for item in items:
                all_string_assets(item)
                if endpoint=="media":
                    sizes=item.get("media_details",{}).get("sizes",{})
                    media_inventory.append({"id":item.get("id"),"title":item.get("title",{}).get("rendered"),"alt":item.get("alt_text",""),"url":item.get("source_url"),"mime_type":item.get("mime_type"),"width":item.get("media_details",{}).get("width"),"height":item.get("media_details",{}).get("height"),"original_image":item.get("media_details",{}).get("original_image"),"sizes":sizes,"caption":item.get("caption",{}).get("rendered"),"description":item.get("description",{}).get("rendered"),"public_attachment_page":item.get("link")})
                elif page_allowed(item.get("link","")):
                    pending.append(item["link"])
            api_page+=1
        print(json.dumps({"phase":"public_api","endpoint":endpoint,"pages":api_page-1,"media_items":len(media_inventory)}),flush=True)
    consolidate_assets()
    dump("media-inventory.json",media_inventory)
    seen_pages=set()
    while pending and len(seen_pages)<MAX_PAGES:
        batch=[]
        while pending and len(batch)<4 and len(seen_pages)<MAX_PAGES:
            url=pending.popleft()
            if url in seen_pages or not page_allowed(url):continue
            seen_pages.add(url);batch.append(url)
        if not batch:continue
        with futures.ThreadPoolExecutor(max_workers=4) as pool:
            for rec,data in pool.map(lambda u:get(u,"page"),batch):
                records.append(rec)
                if data and "text/html" in rec.get("content_type",""):
                    pending.extend(x for x in parse_page(rec["url"],data,rec) if page_allowed(x) and x not in seen_pages)
        checkpoint()
        print(json.dumps({"phase":"pages","saved":len(pages),"attempted":len(seen_pages),"queued":len(pending),"assets_discovered":len(asset_queue)}),flush=True)
    if pending:warnings.append(f"Page cap reached; {len(pending)} candidates not inspected.")
    checkpoint()
    # Fetch exact discovered URLs and their CSS dependencies. API includes originals and generated variants.
    while asset_queue and len(asset_seen)<MAX_ASSETS:
        batch=sorted(asset_queue-asset_seen)[:16]
        if not batch:break
        asset_seen.update(batch)
        with futures.ThreadPoolExecutor(max_workers=4) as pool:
            for rec,data in pool.map(lambda u:get(u,"asset"),batch):
                records.append(rec)
                if data and ("text/css" in rec.get("content_type","") or urlsplit(rec["url"]).path.endswith(".css")):
                    all_string_assets(data.decode("utf-8",errors="replace"),rec.get("final_url",rec["url"]))
        if len(asset_seen)%80==0:
            checkpoint()
            print(json.dumps({"phase":"assets","attempted":len(asset_seen),"discovered":len(asset_queue),"saved_mb":round(total_bytes/1024**2,2)}),flush=True)
        if total_bytes>=MAX_BYTES:break
    remaining=asset_queue-asset_seen
    if remaining:
        warnings.append(f"{len(remaining)} assets not fetched because cap reached.")
        dump("unfetched-assets.json",sorted(remaining))
    finish()

if __name__=="__main__":
    if "--catalog" in sys.argv:
        extract_catalog()
    elif "--finalize" in sys.argv:
        finalize_from_disk()
    elif "--resume-assets" in sys.argv:
        resume_assets()
    else:
        main()
