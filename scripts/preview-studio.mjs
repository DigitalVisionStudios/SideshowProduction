import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, readdir, stat, realpath } from 'node:fs/promises';
import { Liquid } from 'liquidjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(ROOT, 'assets');
const templateRoot = path.join(ROOT, 'templates');
const sectionRoot = path.join(ROOT, 'sections');
const snippetRoot = path.join(ROOT, 'snippets');
const layoutRoot = path.join(ROOT, 'layout');

export const PAGE_ALIASES = {
  about: 'about',
  'about-us': 'about',
  services: 'services',
  artists: 'artists',
  'our-artists': 'artists',
  'artist-portfolio': 'artists',
  portfolio: 'portfolio',
  gallery: 'portfolio',
  work: 'portfolio',
  flash: 'flash',
  'flash-tattoos': 'flash',
  'ink-roulette': 'roulette',
  roulette: 'roulette',
  booking: 'booking',
  book: 'booking',
  'book-now': 'booking',
  aftercare: 'aftercare',
  'after-care': 'aftercare',
  contact: 'contact',
  visit: 'contact',
  shop: 'shop',
  merch: 'shop',
  'merch-shop': 'shop'
};

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, function (character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

export async function readJSON(filename) {
  const source = await readFile(filename, 'utf8');
  return JSON.parse(source.replace(/^\uFEFF/, '').replace(/^\s*\/\*[\s\S]*?\*\//, ''));
}

export function extractSchema(source, filename = 'section') {
  const matches = [...source.matchAll(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/g)];
  if (matches.length !== 1) throw new Error(filename + ': expected exactly one schema block');
  return JSON.parse(matches[0][1]);
}

function sourceForPreview(source) {
  return source
    .replace(/{%-?\s*schema\s*-?%}[\s\S]*?{%-?\s*endschema\s*-?%}/g, '')
    .replace(/{%-?\s*stylesheet\s*-?%}([\s\S]*?){%-?\s*endstylesheet\s*-?%}/g, '<style>$1</style>')
    .replace(/{%-?\s*javascript\s*-?%}([\s\S]*?){%-?\s*endjavascript\s*-?%}/g, '<script>$1</script>')
    .replace(/{%-?\s*form\b([\s\S]*?)-?%}/g, function (_tag, argumentsSource) {
      const attributes = [];
      for (const match of argumentsSource.matchAll(/(?:^|,)\s*(id|class|data-[\w-]+|aria-[\w-]+)\s*:\s*('[^']*'|"[^"]*"|[^,]+)/g)) {
        const name = match[1];
        const value = match[2].trim();
        const literal = /^(['"])([\s\S]*)\1$/.exec(value);
        const rendered = literal ? escapeHTML(literal[2]) : '{{ ' + value + ' | escape }}';
        attributes.push(name + '="' + rendered + '"');
      }
      return '<form method="post" action="/__preview/form" data-preview-form' + (attributes.length ? ' ' + attributes.join(' ') : '') + '>';
    })
    .replace(/{%-?\s*endform\s*-?%}/g, '</form>')
    .replace(/{%-?\s*paginate\b[\s\S]*?-?%}/g, '')
    .replace(/{%-?\s*endpaginate\s*-?%}/g, '');
}

export function settingDefaults(settings = []) {
  return Object.fromEntries(settings.filter(function (setting) {
    return setting.id && Object.hasOwn(setting, 'default');
  }).map(function (setting) { return [setting.id, setting.default]; }));
}

function identifier(value) {
  const name = String(value ?? '');
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid theme identifier: ' + name);
  return name;
}

function argumentsObject(args) {
  const values = {};
  for (const argument of args) {
    if (Array.isArray(argument) && argument.length === 2) values[argument[0]] = argument[1];
    else if (argument && typeof argument === 'object') Object.assign(values, argument);
  }
  return values;
}

function imageSource(value) {
  let source = typeof value === 'string' ? value : value?.src || value?.url || value?.preview_image?.src || '';
  if (source.startsWith('shopify://shop_images/')) {
    source = 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/' + source.slice(22);
  }
  return source;
}

function imageURL(value, ...args) {
  let source = imageSource(value);
  const options = argumentsObject(args);
  if (source && options.width && /^https?:\/\//.test(source)) {
    const url = new URL(source);
    url.searchParams.set('width', String(options.width));
    source = url.href;
  }
  return source;
}

function imageTag(value, ...args) {
  const options = argumentsObject(args);
  const source = imageSource(value);
  if (!source) return '';
  const allowed = ['alt', 'class', 'width', 'height', 'loading', 'decoding', 'fetchpriority', 'sizes', 'id'];
  const attributes = allowed.filter(function (key) { return options[key] !== undefined; })
    .map(function (key) { return key + '="' + escapeHTML(options[key]) + '"'; }).join(' ');
  return '<img src="' + escapeHTML(source) + '" ' + (options.alt === undefined ? 'alt="" ' : '') + attributes + '>';
}

function mockContext(pathname, templateName) {
  const suffix = templateName.replace(/^page\./, '').replace(/\.json$/, '');
  return {
    shop: {
      name: 'Sideshow Productions',
      description: 'Tattoos, piercings, tooth gems and teeth whitening in Murray, Utah.',
      url: 'https://sideshowproductionstattoo.com',
      email: 'club@sideshowproductionstattoo.com',
      phone: '(385) 547-9547',
      currency: 'USD',
      money_format: '$' + '{{amount}}',
      locale: 'en',
      policies: []
    },
    routes: {
      root_url: '/',
      cart_url: '/cart',
      cart_add_url: '/cart/add',
      cart_change_url: '/cart/change',
      cart_update_url: '/cart/update',
      account_url: '/account',
      account_login_url: '/account/login',
      all_products_collection_url: '/collections/all',
      collections_url: '/collections',
      search_url: '/search'
    },
    request: { path: pathname, page_type: templateName === 'index.json' ? 'index' : 'page', design_mode: false, locale: { iso_code: 'en' }, origin: 'http://127.0.0.1' },
    template: { name: templateName === 'index.json' ? 'index' : 'page', suffix: suffix },
    page: { title: suffix.replace(/^studio-/, '').replace(/-/g, ' '), content: '', handle: pathname.split('/').pop() },
    page_title: templateName === 'index.json' ? 'Sideshow Productions | Tattoo Studio in Murray, Utah' : suffix.replace(/^studio-/, '').replace(/-/g, ' ') + ' | Sideshow Productions',
    page_description: 'Sideshow Productions tattoo studio in Murray, Utah.',
    canonical_url: 'https://sideshowproductionstattoo.com' + pathname,
    content_for_header: '',
    settings: {},
    cart: { item_count: 0, items: [], total_price: 0, currency: { iso_code: 'USD', symbol: '$' } },
    customer: null,
    product: null,
    collection: { products: [], products_count: 0, all_products_count: 0, title: 'Shop' },
    collections: { all: { products: [], products_count: 0, all_products_count: 0 } },
    all_products: {},
    linklists: {},
    localization: { country: { iso_code: 'US', currency: { iso_code: 'USD', symbol: '$' } }, language: { iso_code: 'en' } },
    form: { posted_successfully: false, errors: null },
    paginate: { pages: 1, current_page: 1, parts: [], items: 0 },
    powered_by_link: ''
  };
}

export function createRenderer(baseContext = {}) {
  const engine = new Liquid({
    root: [snippetRoot, layoutRoot, sectionRoot],
    partials: [snippetRoot],
    layouts: [layoutRoot],
    extname: '.liquid',
    strictFilters: true,
    strictVariables: false,
    ownPropertyOnly: true,
    cache: false,
    globals: baseContext
  });
  engine.registerFilter('asset_url', function (name) { return '/assets/' + encodeURIComponent(String(name)); });
  engine.registerFilter('stylesheet_tag', function (url) { return '<link rel="stylesheet" href="' + escapeHTML(url) + '">'; });
  engine.registerFilter('script_tag', function (url) { return '<script src="' + escapeHTML(url) + '" defer></script>'; });
  engine.registerFilter('image_url', imageURL);
  engine.registerFilter('img_url', imageURL);
  engine.registerFilter('asset_img_url', function (name) { return '/assets/' + encodeURIComponent(String(name)); });
  engine.registerFilter('image_tag', imageTag);
  engine.registerFilter('file_url', function (name) { return 'https://cdn.shopify.com/s/files/1/0684/2997/1713/files/' + encodeURIComponent(String(name)); });
  engine.registerFilter('money', function (cents) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100); });
  engine.registerFilter('money_without_trailing_zeros', function (cents) { return '$' + (Number(cents || 0) / 100).toFixed(2).replace(/\.00$/, ''); });
  engine.registerFilter('json', function (value) { return JSON.stringify(value ?? null); });
  engine.registerFilter('escape', escapeHTML);
  engine.registerFilter('handleize', function (value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); });
  engine.registerFilter('handle', function (value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); });
  engine.registerFilter('default_errors', function () { return ''; });
  engine.registerFilter('payment_type_svg_tag', function () { return ''; });

  async function renderSection(type, id, configuration = {}, context = baseContext) {
    const sectionType = identifier(type);
    const source = await readFile(path.join(sectionRoot, sectionType + '.liquid'), 'utf8');
    const schema = extractSchema(source, sectionType);
    const preset = schema.presets?.[0] || {};
    const suppliedBlocks = Object.hasOwn(configuration, 'blocks') ? configuration.blocks : preset.blocks || [];
    const entries = Array.isArray(suppliedBlocks)
      ? suppliedBlocks.map(function (block, index) { return ['preview-' + index, block]; })
      : Object.entries(suppliedBlocks);
    const blockLookup = new Map(entries);
    const orderedIds = configuration.block_order || entries.map(function (entry) { return entry[0]; });
    const blocks = orderedIds.map(function (blockId) {
      const definition = blockLookup.get(blockId);
      if (!definition) throw new Error(sectionType + ': missing block ' + blockId);
      if (definition.disabled) return null;
      const blockSchema = schema.blocks?.find(function (block) { return block.type === definition.type; });
      if (!blockSchema && definition.type !== '@app') throw new Error(sectionType + ': unknown block type ' + definition.type);
      return {
        id: blockId,
        type: definition.type,
        settings: { ...settingDefaults(blockSchema?.settings), ...(definition.settings || {}) },
        shopify_attributes: 'data-preview-block="' + escapeHTML(blockId) + '"'
      };
    }).filter(Boolean);
    const section = {
      id: id,
      type: sectionType,
      settings: { ...settingDefaults(schema.settings), ...(preset.settings || {}), ...(configuration.settings || {}) },
      blocks: blocks,
      shopify_attributes: 'data-preview-section="' + escapeHTML(id) + '"'
    };
    const markup = await engine.parseAndRender(sourceForPreview(source), { ...context, section: section });
    const tag = /^[a-z][a-z0-9-]*$/.test(schema.tag || '') ? schema.tag : 'div';
    return '<' + tag + ' id="shopify-section-' + escapeHTML(id) + '" class="shopify-section ' + escapeHTML(schema.class || '') + '">' + markup + '</' + tag + '>';
  }

  engine.registerTag('section', {
    parse: function (token) { this.sectionName = token.args; },
    render: function* (context) {
      const type = yield engine.evalValue(this.sectionName, context);
      const values = typeof context.getAll === 'function' ? context.getAll() : baseContext;
      return yield renderSection(type, type, {}, { ...baseContext, ...values });
    }
  });
  return { engine: engine, renderSection: renderSection };
}

export async function availableTemplates() {
  return (await readdir(templateRoot)).filter(function (name) {
    return name === 'index.json' || /^page\.studio-[a-z0-9-]+\.json$/.test(name);
  }).sort();
}

export async function templateForRoute(pathname) {
  if (pathname === '/') return 'index.json';
  const match = pathname.match(/^\/pages\/([a-z0-9-]+)\/?$/i);
  if (!match) return null;
  const handle = match[1].toLowerCase();
  const names = await availableTemplates();
  const direct = 'page.studio-' + handle + '.json';
  const aliased = 'page.studio-' + (PAGE_ALIASES[handle] || handle) + '.json';
  if (names.includes(direct)) return direct;
  return names.includes(aliased) ? aliased : null;
}

function previewChrome(html) {
  const styles = '<style>.preview-form-status{padding:14px;background:#1b1717;color:#ddd;border:1px solid #473333;font:14px/1.5 system-ui,sans-serif}</style>';
  const guard = '<script>document.addEventListener("submit",function(event){event.preventDefault();var status=event.target.querySelector(".preview-form-status");if(!status){status=document.createElement("p");status.className="preview-form-status";status.setAttribute("role","status");event.target.appendChild(status);}status.textContent="Design preview only. Nothing was submitted. The form will connect through Shopify before launch.";});document.addEventListener("click",function(event){var a=event.target.closest("a[href]");if(!a)return;try{var u=new URL(a.href,location.href);if(u.origin!==location.origin&&(/api\\.apexmediasol\\.com|leadconnectorhq\\.com|\\.myshopify\\.com$/.test(u.hostname)||/\\/widget\\/booking\\//.test(u.pathname))){event.preventDefault();location.href="/__preview/boundary?target="+encodeURIComponent(u.href);}}catch(error){}});</script>';
  html = html.replace(/<head([^>]*)>/i, '<head$1><meta name="robots" content="noindex,nofollow,noarchive">' + styles);
  return html.replace(/<\/body>/i, guard + '</body>');
}

export function boundaryPage(target, status = 200) {
  const title = status === 404 ? 'This page is outside the design preview' : 'Shopify connection required';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>' + title + '</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#171813;color:#f2ede3;font:16px/1.6 system-ui,sans-serif}main{max-width:620px;padding:48px 24px}p{color:#c8c8bb}h1{font-size:clamp(32px,7vw,52px);line-height:1.1}code{display:block;overflow-wrap:anywhere;background:#25271f;padding:16px;border-radius:6px}a{display:inline-block;margin-top:24px;color:#e0ddbb}small{letter-spacing:.12em;text-transform:uppercase}</style></head><body><main><small>Design preview</small><h1>' + title + '</h1><p>This destination is planned for the restored Shopify store. Appointments, purchases, account actions and form submissions are unavailable in this local preview.</p><p>Planned destination:</p><code>' + escapeHTML(target) + '</code><p>Nothing has been booked, purchased or submitted.</p><a href="/">Return to the design</a></main></body></html>';
}

export async function renderTemplate(templateName, pathname = '/', options = {}) {
  if (!/^(index|page\.studio-[a-z0-9-]+)\.json$/.test(templateName)) throw new Error('Unsupported preview template');
  const configuration = await readJSON(path.join(templateRoot, templateName));
  const context = mockContext(pathname, templateName);
  const renderer = createRenderer(context);
  let content = '';
  for (const id of configuration.order || Object.keys(configuration.sections || {})) {
    const section = configuration.sections[id];
    if (!section) throw new Error(templateName + ': ordered section missing: ' + id);
    if (section.disabled) continue;
    content += await renderer.renderSection(section.type, id, section, context);
  }
  const layoutName = configuration.layout || 'studio';
  if (layoutName !== 'studio') throw new Error('Preview only renders the new studio layout; found ' + layoutName);
  const layout = await readFile(path.join(layoutRoot, 'studio.liquid'), 'utf8');
  const html = await renderer.engine.parseAndRender(sourceForPreview(layout), { ...context, content_for_layout: content });
  return options.chrome === false ? html : previewChrome(html);
}

const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.webm': 'video/webm'
};

export async function handleRequest(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; media-src 'self' https:; font-src 'self' https: data:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-src https://maps.google.com https://www.google.com; object-src 'none'; base-uri 'self'");
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { 'Content-Type': 'text/html; charset=utf-8', Allow: 'GET, HEAD' });
    response.end(boundaryPage('Form submission is disabled in the design preview.', 405));
    return;
  }
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    let body;
    let statusCode = 200;
    let type = 'text/html; charset=utf-8';
    if (pathname.startsWith('/assets/')) {
      const relativeName = pathname.slice(8);
      const extension = path.extname(relativeName).toLowerCase();
      if (!relativeName || relativeName.includes('\\') || relativeName.split('/').some(function (part) { return part.startsWith('.'); }) || !MIME[extension]) throw Object.assign(new Error('Asset not found'), { statusCode: 404 });
      const filename = await realpath(path.resolve(assetRoot, relativeName));
      const relative = path.relative(await realpath(assetRoot), filename);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !(await stat(filename)).isFile()) throw Object.assign(new Error('Asset not found'), { statusCode: 404 });
      body = await readFile(filename);
      type = MIME[extension];
    } else if (pathname === '/robots.txt') {
      body = 'User-agent: *\nDisallow: /\n';
      type = 'text/plain; charset=utf-8';
    } else if (pathname === '/__preview/boundary') {
      body = boundaryPage(url.searchParams.get('target') || '/');
    } else if (/^\/(products|cart|checkout|account|collections|search)(\/|$)/.test(pathname)) {
      body = boundaryPage(pathname + url.search);
    } else {
      const template = await templateForRoute(pathname);
      if (template) body = await renderTemplate(template, pathname);
      else { statusCode = 404; body = boundaryPage(pathname, 404); }
    }
    response.writeHead(statusCode, { 'Content-Type': type });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const statusCode = error.statusCode || (error.code === 'ENOENT' ? 404 : 500);
    console.error('[preview]', request.url, error.message);
    response.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : boundaryPage(statusCode === 404 ? 'Page or asset not found.' : 'The current theme files could not render. Check the local server output.', statusCode));
  }
}

export async function startServer(preferredPort = Number(process.env.SIDESHOW_PREVIEW_PORT || 8794)) {
  if (!Number.isInteger(preferredPort) || preferredPort < 1024 || preferredPort > 65525) throw new Error('Invalid preview port');
  for (let port = preferredPort; port < preferredPort + 10; port++) {
    const server = http.createServer(handleRequest);
    try {
      await new Promise(function (resolve, reject) {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
      console.log('Sideshow design preview: http://127.0.0.1:' + port);
      console.log('Real Shopify Liquid sections are rendered on every request. Booking, checkout and submissions remain disconnected.');
      return server;
    } catch (error) {
      server.close();
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error('No available preview port in the requested range');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  startServer().catch(function (error) { console.error(error.message); process.exitCode = 1; });
}
