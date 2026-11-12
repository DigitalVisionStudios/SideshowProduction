/** Export the current Shopify design as a self-contained, subfolder-safe client preview.
 * Usage: node scripts/export-studio-preview.mjs --out <folder> --site-url <https URL/>
 * Sharing assets must already exist in <folder>/assets/icons/.
 * This renders the new studio templates only and never copies source archives.
 */
import path from 'node:path';
import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT, PAGE_ALIASES, availableTemplates, templateForRoute, renderTemplate, escapeHTML } from './preview-studio.mjs';

const flags = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--out', '--site-url'].includes(process.argv[i]) || !process.argv[i + 1]) throw new Error('Expected --out and --site-url');
  flags.set(process.argv[i], process.argv[i + 1]);
}
if (!flags.has('--out') || !flags.has('--site-url')) throw new Error('Both --out and --site-url are required');
const output = path.resolve(flags.get('--out'));
const shareURL = new URL(flags.get('--site-url'));
if (shareURL.protocol !== 'https:' || shareURL.search || shareURL.hash || !shareURL.pathname.endsWith('/')) throw new Error('Use an absolute HTTPS URL ending in /');
if (output === ROOT || output === path.dirname(ROOT)) throw new Error('Choose a dedicated export folder');
const prefix = shareURL.pathname;
const hostname = shareURL.origin;
const boundaryURL = prefix + 'connection/';
const description = 'A refreshed Sideshow Productions website based on the original studio layout. Tattoos, piercings, tooth gems and teeth whitening in Murray, Utah.';
const titleFor = route => route === '/' ? 'Sideshow Productions | Original Layout Preview' : route.split('/').pop().split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ') + ' | Sideshow Productions';
const routes = new Map((await availableTemplates()).map(file => [file === 'index.json' ? '/' : '/pages/' + file.replace(/^page\.studio-/, '').replace(/\.json$/, ''), file]));
const aliasRoutes = new Map();
for (const handle of Object.keys(PAGE_ALIASES)) {
  const route = '/pages/' + handle;
  if (routes.has(route)) continue;
  const file = await templateForRoute(route);
  if (file) aliasRoutes.set(route, [...routes].find(([, candidate]) => candidate === file)[0]);
}

function mapRootURL(raw) {
  if (!raw.startsWith('/') || raw.startsWith('//') || (prefix !== '/' && raw.startsWith(prefix))) return raw;
  const parsed = new URL(raw.replaceAll('&amp;', '&'), 'https://preview.invalid');
  const route = parsed.pathname.replace(/\/$/, '') || '/';
  if (route === '/') return prefix + parsed.search + parsed.hash;
  if (route.startsWith('/assets/')) return prefix.replace(/\/$/, '') + raw;
  if (route === '/__preview/boundary') return boundaryURL + parsed.search + parsed.hash;
  if (routes.has(route) || aliasRoutes.has(route)) return prefix.replace(/\/$/, '') + (aliasRoutes.get(route) || route) + parsed.search + parsed.hash;
  return boundaryURL + '?target=' + encodeURIComponent(parsed.pathname + parsed.search + parsed.hash);
}

function rewriteURLs(html) {
  html = html.replace(/\b(href|src|action|poster|data-[\w-]+)=(['"])(\/(?!\/)[^'"]*)\2/g, (_match, attr, quote, url) => attr + '=' + quote + escapeHTML(mapRootURL(url)) + quote);
  // The wheel pool and the preview form/booking guard contain URL string literals.
  html = html.replace(/(['"])(\/(?:assets\/|__preview\/)[^'"]*)\1/g, (_match, quote, url) => quote + mapRootURL(url) + quote);
  return html;
}

function metadata(html, route, suppliedTitle) {
  const title = suppliedTitle || titleFor(route);
  const canonical = route === '/' ? shareURL.href : hostname + prefix.replace(/\/$/, '') + route;
  const card = new URL('assets/icons/sharing-card.png', shareURL).href;
  const iconBase = prefix + 'assets/icons/';
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + escapeHTML(title) + '</title>');
  html = html.replace(/<meta\b[^>]*(?:property=['"]og:[^'"]+['"]|name=['"](?:twitter:[^'"]+|theme-color|description)['"])[^>]*>\s*/gi, '');
  html = html.replace(/<link\b[^>]*rel=['"](?:canonical|icon|shortcut icon|apple-touch-icon|manifest)['"][^>]*>\s*/gi, '');
  const tags = [
    '<meta name="description" content="' + escapeHTML(description) + '">',
    '<meta name="theme-color" content="#080808">',
    '<link rel="canonical" href="' + canonical + '">',
    '<link rel="icon" type="image/png" sizes="32x32" href="' + iconBase + 'favicon-32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="' + iconBase + 'favicon-16.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="' + iconBase + 'apple-touch-icon.png">',
    '<link rel="manifest" href="' + iconBase + 'site.webmanifest">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Sideshow Productions">',
    '<meta property="og:title" content="' + escapeHTML(title) + '">',
    '<meta property="og:description" content="' + escapeHTML(description) + '">',
    '<meta property="og:url" content="' + canonical + '">',
    '<meta property="og:image" content="' + card + '">',
    '<meta property="og:image:secure_url" content="' + card + '">',
    '<meta property="og:image:type" content="image/png">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="Sideshow Productions logo with the original studio storefront">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + escapeHTML(title) + '">',
    '<meta name="twitter:description" content="' + escapeHTML(description) + '">',
    '<meta name="twitter:image" content="' + card + '">',
    '<meta name="twitter:image:alt" content="Sideshow Productions logo with the original studio storefront">'
  ];
  return html.replace('</head>', tags.join('\n') + '\n</head>');
}

const assetNames = new Set();
const rendered = [];
for (const [route, file] of routes) {
  const original = await renderTemplate(file, route);
  for (const match of original.matchAll(/\/assets\/([a-zA-Z0-9_.%/-]+)/g)) assetNames.add(decodeURIComponent(match[1]));
  const html = metadata(rewriteURLs(original), route);
  const relative = route === '/' ? 'index.html' : route.slice(1) + '/index.html';
  const target = path.join(output, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html);
  rendered.push({ route: route === '/' ? prefix : prefix.replace(/\/$/, '') + route, file: relative, bytes: Buffer.byteLength(html) });
}

// CSS can depend on fonts or images not listed directly in a template.
for (const asset of assetNames) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(asset)) throw new Error('Unexpected asset path: ' + asset);
  if (!asset.endsWith('.css')) continue;
  const css = await readFile(path.join(ROOT, 'assets', asset), 'utf8');
  for (const match of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)) {
    const url = match[1];
    if (/^(?:data:|https?:|#)/.test(url)) continue;
    const clean = url.replace(/^\/assets\//, '').split(/[?#]/)[0];
    assetNames.add(decodeURIComponent(clean));
  }
}
await mkdir(path.join(output, 'assets'), { recursive: true });
const assets = [];
for (const name of [...assetNames].sort()) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) throw new Error('Unexpected dependency path: ' + name);
  const source = path.join(ROOT, 'assets', name);
  await copyFile(source, path.join(output, 'assets', name));
  const bytes = await readFile(source);
  assets.push({ file: 'assets/' + name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}

// These files came from the user's sharing-icon generator, not the Shopify theme.
const icons = ['favicon-16.png', 'favicon-32.png', 'favicon.png', 'favicon-180.png', 'favicon-192.png', 'favicon-512.png', 'apple-touch-icon.png', 'sharing-card.png', 'home-page-card.png', 'favicon.ico', 'site.webmanifest'];
for (const name of icons) await stat(path.join(output, 'assets/icons', name));
await copyFile(path.join(output, 'assets/icons/favicon.ico'), path.join(output, 'favicon.ico'));
await writeFile(path.join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

const boundary = metadata(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Website preview</title><style>body{margin:0;min-height:100svh;display:grid;place-items:center;background:radial-gradient(ellipse at 15% 15%,#351016,transparent 65%),#080808;color:#f5f2ef;font:17px/1.6 system-ui,sans-serif}main{width:min(620px,calc(100% - 48px));padding:48px 0}img{width:88px;height:88px;object-fit:contain}h1{font-size:clamp(32px,6vw,48px);line-height:1.1;margin:28px 0 20px}p{color:#c7c0c0}a{display:inline-flex;margin-top:24px;padding:14px 22px;background:#dc1733;color:#fff;text-decoration:none;border-radius:3px;font-weight:600}a:focus-visible{outline:3px solid #fff;outline-offset:5px}</style></head><body><main><img src="${prefix}assets/sp-logo.webp" alt="Sideshow Productions"><h1>You're viewing the new design.</h1><p>Booking, purchases, forms, and store policies will be connected before the new website launches.</p><p>For now, take a look around the studio's new website.</p><a href="${prefix}">Back to Sideshow <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" style="margin:2px 0 0 10px"><path d="M6 18 18 6M7 6h11v11"/></svg></a></main></body></html>`, '/connection/', 'Sideshow Productions | Website Preview');
await mkdir(path.join(output, 'connection'), { recursive: true });
await writeFile(path.join(output, 'connection/index.html'), boundary);

for (const [alias, target] of aliasRoutes) {
  const destination = prefix.replace(/\/$/, '') + target;
  const redirect = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow,noarchive"><meta http-equiv="refresh" content="0;url=' + destination + '"><title>Sideshow Productions</title></head><body><a href="' + destination + '">Continue to Sideshow</a><script>location.replace(' + JSON.stringify(destination) + '+location.search+location.hash)</script></body></html>';
  const targetFile = path.join(output, alias.slice(1), 'index.html');
  await mkdir(path.dirname(targetFile), { recursive: true });
  await writeFile(targetFile, redirect);
}

const report = { source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), generated_at: new Date().toISOString(), share_url: shareURL.href, routes: rendered, aliases: Object.fromEntries(aliasRoutes), assets, icon_files: icons.map(name => 'assets/icons/' + name), bytes: assets.reduce((sum, item) => sum + item.bytes, 0), notes: ['Rendered from the current Shopify studio templates.', 'Only used storefront assets are copied; source archives and working files are excluded.', 'Form submissions and disconnected Shopify destinations remain preview-only.', 'Original logo sharing assets were prepared with the existing HTML Preview generator.'] };
await writeFile(path.join(ROOT, 'docs/studio-share-export.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, share_url: shareURL.href, pages: rendered.length, aliases: aliasRoutes.size, assets: assets.length, asset_bytes: report.bytes, report: 'docs/studio-share-export.json' }, null, 2));
