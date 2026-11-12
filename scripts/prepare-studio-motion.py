#!/usr/bin/env python3
"""Inspect and prepare authentic archived Sideshow media without changing originals."""
from pathlib import Path
import argparse
import hashlib
import io
import json
import shutil
import subprocess
from PIL import Image, ImageDraw, ImageFont
from studio_recovered_media import prepare_override

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "archive" / "current-site-2026-11-10"
DOCS = ROOT / "docs" / "studio-media-review"
ASSETS = ROOT / "assets"

def probe(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)], capture_output=True, text=True, check=True)
    data = json.loads(result.stdout)
    video = next(x for x in data["streams"] if x["codec_type"] == "video")
    return {"duration":float(data["format"]["duration"]),"width":video["width"],"height":video["height"],"codec":video["codec_name"],"fps":video["r_frame_rate"],"audio":any(x["codec_type"]=="audio" for x in data["streams"])}

def frame(path, seconds):
    result = subprocess.run(["ffmpeg","-v","error","-ss",str(seconds),"-i",str(path),"-frames:v","1","-f","image2pipe","-vcodec","mjpeg","pipe:1"], capture_output=True, check=True)
    return Image.open(io.BytesIO(result.stdout)).convert("RGB")

def review():
    DOCS.mkdir(parents=True,exist_ok=True)
    report = json.loads((ARCHIVE / "media-content-validation.json").read_text(encoding="utf-8"))
    records=[]
    for item in report["nonimages"]:
        path=ARCHIVE/item["local_path"]
        meta=probe(path)
        records.append({"filename":path.name,"path":path.relative_to(ROOT).as_posix(),"source_url":item["url"],"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),**meta})
    try:font=ImageFont.truetype("arial.ttf",18)
    except OSError:font=ImageFont.load_default()
    for page,start in enumerate(range(0,len(records),4),1):
        selection=records[start:start+4]
        sheet=Image.new("RGB",(1440,len(selection)*300),(18,18,18))
        draw=ImageDraw.Draw(sheet)
        for row,record in enumerate(selection):
            path=ROOT/record["path"]
            draw.text((14,row*300+8),f'{record["filename"]} | {record["width"]}x{record["height"]} | {record["duration"]:.1f}s',fill="white",font=font)
            for column,ratio in enumerate((0.08,0.32,0.57,0.82)):
                second=record["duration"]*ratio
                still=frame(path,second)
                still.thumbnail((345,230),Image.Resampling.LANCZOS)
                x=column*360+(360-still.width)//2
                y=row*300+40+(230-still.height)//2
                sheet.paste(still,(x,y))
                draw.text((column*360+12,row*300+272),f'{second:.1f}s',fill=(190,190,190),font=font)
        sheet.save(DOCS/f"video-contact-sheet-{page}.jpg",quality=90)
    (DOCS/"video-inventory.json").write_text(json.dumps(records,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"videos":len(records),"contact_sheets":[f"docs/studio-media-review/video-contact-sheet-{p}.jpg" for p in range(1,3)]}))


def write_manifest(name,value):
    target=ROOT/"docs"/name
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(value,indent=2)+"\n",encoding="utf-8")

def prepare_font():
    import re
    import requests
    css_url="https://fonts.googleapis.com/css2?family=Sedgwick+Ave+Display&display=swap"
    response=requests.get(css_url,headers={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"},timeout=30)
    response.raise_for_status()
    css=response.text
    match=re.search(r"/\*\s*latin\s*\*/\s*(@font-face\s*\{.*?\})",css,re.S)
    assert match, "Official font response did not identify a Latin subset"
    face=match.group(1)
    source=re.search(r"url\((https://[^)]+)\)\s*format\('woff2'\)",face)
    assert source, "Latin WOFF2 source missing"
    url=source.group(1)
    data=requests.get(url,timeout=30)
    data.raise_for_status()
    assert data.content[:4]==b"wOF2", "Font response was not WOFF2"
    path=ASSETS/"sp-brush.woff2"
    path.write_bytes(data.content)
    license_url="https://raw.githubusercontent.com/google/fonts/main/ofl/sedgwickavedisplay/OFL.txt"
    license_response=requests.get(license_url,timeout=30)
    license_response.raise_for_status()
    assert "SIL OPEN FONT LICENSE" in license_response.text
    license_path=ROOT/"docs"/"fonts"/"sedgwick-ave-display-OFL.txt"
    license_path.parent.mkdir(parents=True,exist_ok=True)
    license_path.write_text("\n".join(line.rstrip() for line in license_response.text.splitlines()) + "\n", encoding="utf-8", newline="\n")
    (license_path.parent/"sedgwick-ave-display-source.css").write_text(css,encoding="utf-8")
    report={"family":"Sedgwick Ave Display","source_site_usage":"Original archived homepage H1/H2 and animated headline; font-weight 500/600 are source CSS settings, real font face weight is 400.","official_face_weight":400,"style":"normal","subset":"latin","asset":"assets/sp-brush.woff2","bytes":len(data.content),"sha256":hashlib.sha256(data.content).hexdigest(),"css_url":css_url,"font_url":url,"source_face_css":face,"license_url":license_url,"license_path":license_path.relative_to(ROOT).as_posix(),"license":"SIL Open Font License 1.1","note":"Font was retrieved from the official Google Fonts endpoint because this stylesheet URL was not captured by the initial extension-based static asset crawl."}
    write_manifest("studio-source-font.json",report)
    print(json.dumps({k:v for k,v in report.items() if k not in ("source_face_css","font_url")}),flush=True)

def prepare_media():
    source=ARCHIVE/"assets/sideshowproductionstattoo.com/wp-content/uploads/2026/01/tats-and-piercings.mp4"
    assert source.exists()
    original_hash=hashlib.sha256(source.read_bytes()).hexdigest()
    output=ASSETS/"sp-authentic-hero.mp4"
    start=1.4
    duration=6.4
    filters=f"fps=24,fade=t=in:st=0:d=0.12,fade=t=out:st={duration-0.12}:d=0.12,format=yuv420p"
    subprocess.run(["ffmpeg","-v","error","-y","-ss",str(start),"-i",str(source),"-t",str(duration),"-an","-vf",filters,"-c:v","libx264","-profile:v","main","-level","3.0","-preset","slow","-crf","24","-movflags","+faststart",str(output)],check=True)
    assert hashlib.sha256(source.read_bytes()).hexdigest()==original_hash
    output_meta=probe(output)
    assert not output_meta["audio"] and output.stat().st_size<5_000_000
    source_url="https://sideshowproductionstattoo.com/wp-content/uploads/2026/01/"+source.name
    records=[{"asset":output.relative_to(ROOT).as_posix(),"source":source.relative_to(ROOT).as_posix(),"source_url":source_url,"source_sha256":original_hash,"start_seconds":start,"duration_seconds":duration,"processing":"Continuous source excerpt showing tattooing hands and client forearm. 24fps H.264, muted, fast-start, short black fades for a quieter loop. No upscale, generated frames, or creative retouch.","bytes":output.stat().st_size,"sha256":hashlib.sha256(output.read_bytes()).hexdigest(),**output_meta}]
    for filename,source_name,seconds,description in [
        ("sp-authentic-hero-poster.webp","tats-and-piercings.mp4",3.6,"Tattoo artist's gloved hands, machine, and client forearm, matching the hero excerpt"),
        ("sp-studio-interior.webp","tattoos.mp4",13.2,"Real customer and staff inside the red-walled Sideshow studio"),
        ("sp-source-tattoo-session.webp","tattoos.mp4",1.8,"Real tattoo session captured in original studio footage"),
    ]:
        still_source=source.parent/source_name
        still=frame(still_source,seconds)
        path=ASSETS/filename
        still.save(path,"WEBP",quality=88,method=6)
        records.append({"asset":path.relative_to(ROOT).as_posix(),"source":still_source.relative_to(ROOT).as_posix(),"source_url":"https://sideshowproductionstattoo.com/wp-content/uploads/2026/01/"+source_name,"source_sha256":hashlib.sha256(still_source.read_bytes()).hexdigest(),"frame_seconds":seconds,"description":description,"width":still.width,"height":still.height,"bytes":path.stat().st_size,"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"processing":"Single original video frame encoded WebP. No crop or upscale."})
    for src,filename,description in [
        ("Screenshot-2026-01-09-101734.png","sp-source-storefront.webp","Actual Sideshow Productions sign and entrance at 4973 S State Street"),
        ("522130610_72896906cv6420601_2836253316634858983_n.webp","sp-source-flash-wall.webp","Actual Ink Roulette flash board mounted on the studio red wall"),
    ]:
        recovered = prepare_override("assets/" + filename)
        if recovered:
            records.append({**recovered, "description": description})
            continue
        path=ARCHIVE/"assets/sideshowproductionstattoo.com/wp-content/uploads/2026/01"/src
        with Image.open(path) as im:
            image=im.convert("RGB")
            image.thumbnail((1600,1200),Image.Resampling.LANCZOS)
            dest=ASSETS/filename
            image.save(dest,"WEBP",quality=88,method=6)
            records.append({"asset":dest.relative_to(ROOT).as_posix(),"source":path.relative_to(ROOT).as_posix(),"source_url":"https://sideshowproductionstattoo.com/wp-content/uploads/2026/01/"+src,"source_sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"description":description,"width":image.width,"height":image.height,"bytes":dest.stat().st_size,"sha256":hashlib.sha256(dest.read_bytes()).hexdigest(),"processing":"Proportional downsize if needed and WebP encoding. No crop or upscale."})
    report={"visual_review":"Sampled all seven source clips and inspected the selected photographs. Reviewed both tattooing clips at one-second intervals to select a continuous hands-and-forearm excerpt without large customer face closeups. All clips show continuous real-looking shop activity with no obvious generated imagery. Selection is based on visible content and original public-site provenance, not a forensic authenticity certification.","limitations":["The selected tattooing source is only 498 by 246 pixels. It is suitable for a dimmed motion backdrop, not a sharp full-screen hero.","The original homepage embed is instead a 496 by 892 portrait clip of Ink Roulette and the shop tour.","The sharper source storefront photograph is available as an alternative static hero image."],"assets":records,"original_homepage_video_url":"https://sideshowproductionstattoo.com/wp-content/uploads/2026/01/6-Instagram-Google-Chrome-9-January-2026-1.mp4","review_contact_sheets":["docs/studio-media-review/video-contact-sheet-1.jpg","docs/studio-media-review/video-contact-sheet-2.jpg","docs/studio-media-review/tattoos-detailed-contact-sheet.jpg","docs/studio-media-review/tats-and-piercings-detailed-contact-sheet.jpg"]}
    write_manifest("studio-authentic-media-sources.json",report)
    style_path=ROOT/"docs/studio-source-style-provenance.json"
    if style_path.exists():
        style=json.loads(style_path.read_text(encoding="utf-8"))
        style["video"]["selected_hero_source"]=source_url
        style["video"]["selected_hero_content"]="Continuous close tattooing footage of blue-gloved hands and client forearm, source interval 1.4 to 7.8 seconds"
        style["video"]["limitations"]="498x246 source resolution, suited to a dimmed backdrop. Visual review found no obvious generated content in the seven source clips. Original provenance and visual consistency are not forensic authentication."
        style_path.write_text(json.dumps(style,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"assets":[{"asset":r["asset"],"bytes":r["bytes"],"width":r.get("width"),"height":r.get("height")} for r in records],"hero_duration":output_meta["duration"],"hero_has_audio":output_meta["audio"],"source_unchanged":hashlib.sha256(source.read_bytes()).hexdigest()==original_hash}),flush=True)


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--review",action="store_true")
    parser.add_argument("--font",action="store_true")
    parser.add_argument("--build",action="store_true")
    args=parser.parse_args()
    if args.review:review()
    if args.font:prepare_font()
    if args.build:prepare_media()
