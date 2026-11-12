#!/usr/bin/env python3
"""Recover pinned original still images from saved Shopify theme sources.

Run from the repository root:
  python scripts/recover-shopify-template-images.py --manifest docs/shopify-template-recovery-media.json

Original bytes are only written under archive/shopify-template-recovery-2026-11-11/assets.
No theme assets, templates, storefront settings, or live services are changed.
Requires Pillow for native-image verification. Source keys, byte lengths, hashes,
and dimensions are all checked before an image is accepted.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from PIL import Image

ARCHIVE = PurePosixPath('archive/shopify-template-recovery-2026-11-11/assets')
STORE_PREFIX = '/s/files/1/0684/2997/1713/files/'
MAX_IMAGE_BYTES = 20_000_000


def resolve_under_root(root: Path, relative: str) -> Path:
    rel = PurePosixPath(relative)
    if rel.is_absolute() or '..' in rel.parts or rel.parent != ARCHIVE:
        raise ValueError(f'Archive image path outside the expected folder: {relative}')
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]+', rel.name):
        raise ValueError(f'Unsafe archive filename: {relative}')
    path = root.joinpath(*rel.parts).resolve()
    path.relative_to(root)
    return path


def verify_template_references(root: Path, records: list[dict]) -> None:
    cache: dict[tuple[str,str], dict] = {}
    for item in records:
        commit = item['source_commit']
        template = item['source_template']
        if not re.fullmatch(r'[0-9a-f]{40}', commit):
            raise ValueError('A full pinned source commit is required')
        if template not in ('templates/index.json', 'templates/page.artist-portfolio.json'):
            raise ValueError(f'Unexpected source template: {template}')
        key = (commit, template)
        if key not in cache:
            raw = subprocess.check_output(['git','show',f'{commit}:{template}'], cwd=root).decode('utf-8-sig')
            cache[key] = json.loads(raw[raw.index('{'):])
        value = cache[key]
        for token in item['source_key'].lstrip('/').split('/'):
            value = value[token.replace('~1','/').replace('~0','~')]
        if value != item['source_reference']:
            raise ValueError(f"Source key no longer agrees with the pinned reference: {item['archive_relative_path']}")
        source_url = urlparse(item['source_url'])
        if source_url.scheme != 'https' or source_url.netloc != 'cdn.shopify.com' or not source_url.path.startswith(STORE_PREFIX):
            raise ValueError(f"Unexpected source CDN: {item['source_url']}")
        expected_reference = 'shopify://shop_images/' + item['source_filename']
        if item['source_reference'] != expected_reference or source_url.path[len(STORE_PREFIX):] != item['source_filename']:
            raise ValueError(f"Source filename/reference mismatch: {item['archive_relative_path']}")
        if not 0 < item['source_bytes'] <= MAX_IMAGE_BYTES:
            raise ValueError('Invalid expected image byte count')
        if not re.fullmatch(r'[0-9a-f]{64}', item['source_sha256']):
            raise ValueError('Invalid pinned source digest')


def validate_bytes(data: bytes, item: dict) -> None:
    if len(data) != item['source_bytes']:
        raise ValueError(f"Byte count changed: expected {item['source_bytes']}, received {len(data)}")
    digest = hashlib.sha256(data).hexdigest()
    if digest != item['source_sha256']:
        raise ValueError(f'SHA256 changed: {digest}')
    with Image.open(io.BytesIO(data)) as im:
        im.verify()
    with Image.open(io.BytesIO(data)) as im:
        if list(im.size) != item['source_dimensions']:
            raise ValueError(f'Native dimensions changed: {im.size}')


def recover_one(root: Path, item: dict, verify_only: bool) -> dict:
    path = resolve_under_root(root, item['archive_relative_path'])
    if path.exists():
        validate_bytes(path.read_bytes(), item)
        status = 'verified_existing'
    else:
        if verify_only:
            raise FileNotFoundError(str(path))
        request = Request(item['source_url'], headers={
            'User-Agent': 'SideshowTemplateRecovery/1.0',
            'Accept-Encoding': 'identity',
        })
        with urlopen(request, timeout=30) as response:
            data = response.read(item['source_bytes'] + 1)
        validate_bytes(data, item)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_name(path.name + '.part')
        try:
            with temp.open('xb') as handle:
                handle.write(data)
            temp.replace(path)
        finally:
            temp.unlink(missing_ok=True)
        status = 'downloaded'
    return {'id':item['id'],'path':item['archive_relative_path'],'status':status,
            'bytes':item['source_bytes'],'sha256':item['source_sha256'],
            'dimensions':item['source_dimensions']}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--root', default='.')
    parser.add_argument('--verify-only', action='store_true')
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    root = Path(args.root).resolve()
    manifest_path = Path(args.manifest)
    if not manifest_path.is_absolute():
        manifest_path = root/manifest_path
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    records = manifest['assets']
    destinations = [item['archive_relative_path'] for item in records]
    if len(destinations) != len(set(destinations)):
        raise ValueError('Manifest contains repeated archive destinations')
    verify_template_references(root, records)
    results, failures = [], []
    with ThreadPoolExecutor(max_workers=max(1,min(6,args.workers))) as pool:
        pending = {pool.submit(recover_one, root, item, args.verify_only):item for item in records}
        for future in as_completed(pending):
            item = pending[future]
            try:
                result = future.result()
                results.append(result)
                print(f"{result['status']}: {result['path']}", flush=True)
            except Exception as exc:
                failures.append({'id':item['id'],'path':item['archive_relative_path'],'error':str(exc)})
                print(f"FAILED: {item['archive_relative_path']}: {exc}", flush=True)
    report = {'requested':len(records),'verified':len(results),
              'source_bytes':sum(x['bytes'] for x in results),
              'template_references_verified':len(records),
              'failures':failures,'images':sorted(results,key=lambda x:x['id'])}
    report_path = root/'archive/shopify-template-recovery-2026-11-11/recovered-images-status.json'
    report_path.parent.mkdir(parents=True,exist_ok=True)
    report_path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='images'},indent=2))
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
