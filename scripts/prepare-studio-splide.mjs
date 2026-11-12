/** Vendor pinned, MIT-licensed Splide browser assets for self-contained Shopify/static previews. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packages = [
  {name:'@splidejs/splide', version:'4.1.4', files:[['dist/js/splide.min.js','sp-splide-4.1.4.min.js'],['dist/css/splide-core.min.css','sp-splide-core-4.1.4.min.css']]},
  {name:'@splidejs/splide-extension-auto-scroll', version:'0.5.3', files:[['dist/js/splide-extension-auto-scroll.min.js','sp-splide-auto-scroll-0.5.3.min.js']]}
];
const reportPath = path.join(root, 'docs/studio-splide-vendor.json');
let prior;
try { prior = JSON.parse(await readFile(reportPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const hash = value => createHash('sha256').update(value).digest('hex');
async function download(url) { const response = await fetch(url, {signal:AbortSignal.timeout(20000)}); if (!response.ok) throw new Error(url + ': HTTP ' + response.status); return response.text(); }
const output = [];
for (const item of packages) {
  const base = 'https://cdn.jsdelivr.net/npm/' + item.name + '@' + item.version + '/';
  const [license, ...sources] = await Promise.all([download(base + 'LICENSE'), ...item.files.map(([source]) => download(base + source))]);
  if (!license.includes('MIT') || !license.includes('Permission is hereby granted')) throw new Error('Unexpected license for ' + item.name);
  for (let i = 0; i < item.files.length; i++) {
    const [source, file] = item.files[i];
    const sourceHash = hash(sources[i]);
    const expected = prior?.assets.find(asset => asset.file === file)?.source_sha256;
    if (expected && expected !== sourceHash) throw new Error('Pinned source changed: ' + file);
    const body = sources[i].replace(/\/\/[#@] sourceMappingURL=[^\r\n]*/g,'').replace(/\/\*[#@] sourceMappingURL=[\s\S]*?\*\//g,'').trimEnd() + '\n\n/*\n' + license.replace(/\*\//g,'* /').trim() + '\n*/\n';
    await writeFile(path.join(root, 'assets', file), body);
    output.push({package:item.name,version:item.version,license:'MIT',file,source:base+source,source_sha256:sourceHash,vendored_sha256:hash(body),bytes:Buffer.byteLength(body)});
  }
}
await writeFile(reportPath, JSON.stringify({documentation:['https://splidejs.com/guides/structure/','https://splidejs.com/extensions/auto-scroll/'],notes:['Version-pinned browser distributions, hosted locally.','The full MIT license is appended to every distributed asset.','No external CDN dependency at runtime.'],assets:output},null,2)+'\n');
console.log(JSON.stringify(output.map(({file,version,bytes,source_sha256})=>({file,version,bytes,source_sha256})),null,2));
