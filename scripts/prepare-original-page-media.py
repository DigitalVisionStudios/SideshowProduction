"""Prepare authentic supporting-page media from the downloaded live-site archive.

Usage: python scripts/prepare-original-page-media.py --source-root ../SideshowProduction
Only writes the named sp-original-detail assets and their source report. No upscaling,
generative edits, color replacement, or cropping is performed.
"""
from pathlib import Path
from PIL import Image, ImageOps
import argparse,hashlib,json,subprocess

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--source-root',type=Path,default=ROOT)
args=parser.parse_args()
ARCHIVE=args.source_root.resolve()/'archive/current-site-2026-11-10'
SOURCE=ARCHIVE/'assets/sideshowproductionstattoo.com/wp-content/uploads/2026/01'
ASSETS=ROOT/'assets'
REPORT=ROOT/'docs/studio-original-page-sources.json'
IMAGES=[
 ('sp-original-detail-journey-storefront.webp','Screenshot-2026-01-14-154136.png','Sideshow Productions storefront on State Street'),
 ('sp-original-detail-journey-piercing.webp','Screenshot-2026-01-14-161319.png','Ear piercings and jewelry from the original studio story'),
 ('sp-original-detail-journey-community.webp','Screenshot-2026-01-14-161433.png','A donation collection box at Sideshow Productions'),
 ('sp-original-detail-journey-years.webp','Screenshot-2026-01-14-161515.png','A studio story image shared on the original About page'),
 ('sp-original-detail-flash-07.webp','Screenshot-2026-01-13-164300.png','Character-inspired designs from the original flash collection'),
 ('sp-original-detail-flash-08.webp','Screenshot-2026-01-13-164242.png','Symbols and small icons from the original flash collection')
]
VIDEOS=[('sp-original-detail-flash.mp4','ink-roulette.mp4'),('sp-original-detail-roulette.mp4','ir1.mp4')]

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def probe(p):
 d=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=codec_type,codec_name,pix_fmt,width,height','-show_entries','format=duration','-of','json',str(p)]))
 v=next(x for x in d['streams'] if x['codec_type']=='video')
 return {'width':v['width'],'height':v['height'],'duration':float(d['format']['duration']),'codec':v.get('codec_name'),'pixel_format':v.get('pix_fmt'),'has_audio':any(x['codec_type']=='audio' for x in d['streams'])}
def record(out,src,extra=None):
 d={'asset':out.relative_to(ROOT).as_posix(),'source_url':'https://sideshowproductionstattoo.com/wp-content/uploads/2026/01/'+src.name,'source_path':src.relative_to(args.source_root.resolve()).as_posix(),'source_sha256':digest(src),'source_bytes':src.stat().st_size,'bytes':out.stat().st_size,'sha256':digest(out)}
 if extra:d.update(extra)
 return d

ASSETS.mkdir(exist_ok=True);records=[]
for filename,source,alt in IMAGES:
 src=SOURCE/source;out=ASSETS/filename
 with Image.open(src) as original:
  im=ImageOps.exif_transpose(original).convert('RGB')
  im.thumbnail((1600,1600),Image.Resampling.LANCZOS)
  im.save(out,'WEBP',quality=91,method=6)
  records.append(record(out,src,{'width':im.width,'height':im.height,'alt':alt,'processing':'Original source converted to WebP without cropping, upscaling, or color adjustments.'}))
for filename,source in VIDEOS:
 src=SOURCE/source;out=ASSETS/filename;meta=probe(src)
 scale=min(1,1200/meta['width'],900/meta['height'])
 width=int(meta['width']*scale)//2*2;height=int(meta['height']*scale)//2*2
 if scale==1 and meta['codec']=='h264' and meta['pixel_format']=='yuv420p':
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(src),'-an','-c:v','copy','-movflags','+faststart',str(out)],check=True)
  processing='Full original H.264 video stream preserved without recompression; audio removed and faststart enabled.'
 else:
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(src),'-an','-vf',f'scale={width}:{height},fps=24','-c:v','libx264','-profile:v','main','-preset','fast','-crf','25','-movflags','+faststart',str(out)],check=True)
  processing='Full original video, muted H.264 delivery encode, 24fps, no artificial content or upscale.'
 records.append(record(out,src,{'source_video':meta,'output_video':probe(out),'processing':processing}))
 poster=ASSETS/(Path(filename).stem+'-poster.webp')
 subprocess.run(['ffmpeg','-v','error','-y','-ss','1.5','-i',str(src),'-frames:v','1','-vf',f'scale={width}:{height}','-c:v','libwebp','-quality','88',str(poster)],check=True)
 records.append(record(poster,src,{'width':width,'height':height,'frame_seconds':1.5,'processing':'Single unaltered frame from the corresponding original video.'}))
report=json.loads(REPORT.read_text(encoding='utf-8')) if REPORT.exists() else {}
report['media']=records
REPORT.parent.mkdir(exist_ok=True)
REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'assets':len(records),'bytes':sum(x['bytes'] for x in records),'files':[x['asset'] for x in records]}))
