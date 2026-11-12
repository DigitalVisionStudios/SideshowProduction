"""Restore original homepage artwork and footage from the downloaded WordPress archive."""
import argparse, hashlib, json, subprocess
from pathlib import Path
from PIL import Image, ImageOps
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(); parser.add_argument('--archive',type=Path,required=True); args=parser.parse_args()
inventory=json.loads((ROOT/'docs/studio-original-home-sources.json').read_text(encoding='utf-8'))
report=[]
def source_file(item):
    p=args.archive/item['local_path']
    if hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']: raise ValueError('Source hash mismatch: '+str(p))
    return p
for item,slug in zip(inventory['services'],['tattoos','piercings','tooth-gems','microblading','teeth-whitening','aftercare']):
    p=source_file(item['archive']); out=ROOT/'assets'/('sp-original-service-'+slug+'.webp')
    with Image.open(p) as im:
        im=ImageOps.exif_transpose(im).convert('RGBA'); im.thumbnail((512,512),Image.Resampling.LANCZOS); im.save(out,'WEBP',quality=95,method=6)
    report.append({'file':out.name,'source':item['original_image'],'source_sha256':item['archive']['sha256'],'bytes':out.stat().st_size,'transform':'Full transparent original, proportionally resized; no crop or recolor'})
for item in inventory['artists']:
    p=source_file(item['archive']); out=ROOT/'assets'/('sp-original-portrait-'+item['name'].lower()+'.webp')
    with Image.open(p) as im:
        im=ImageOps.exif_transpose(im).convert('RGB'); im=ImageOps.fit(im,(360,360),method=Image.Resampling.LANCZOS); im.save(out,'WEBP',quality=93,method=6)
    report.append({'file':out.name,'source':item['portrait'],'source_sha256':item['archive']['sha256'],'bytes':out.stat().st_size,'transform':'Correct source portrait; minimal square crop for circular presentation'})
v=inventory['roulette']['video_archive']; p=source_file(v); out=ROOT/'assets/sp-original-roulette-tour.mp4'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(p),'-map','0:v:0','-c:v','copy','-an','-movflags','+faststart',str(out)],check=True)
poster=ROOT/'assets/sp-original-roulette-tour-poster.webp'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss','2.5','-i',str(p),'-frames:v','1','-c:v','libwebp','-quality','90',str(poster)],check=True)
report.append({'file':out.name,'poster':poster.name,'source':inventory['roulette']['video'],'source_sha256':v['sha256'],'bytes':out.stat().st_size,'transform':'Original video copied without re-encoding; audio removed for silent autoplay'})
(ROOT/'docs/studio-original-home-media.json').write_text(json.dumps({'assets':report},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'assets':len(report)+1,'bytes':sum(r['bytes'] for r in report)},indent=2))
