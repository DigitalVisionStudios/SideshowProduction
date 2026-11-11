import path from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { ROOT, availableTemplates, createRenderer, extractSchema, readJSON, renderTemplate, templateForRoute } from './preview-studio.mjs';

const errors = [];
const warnings = [];
const schemas = new Map();
function fail(message) { errors.push(message); }
function warn(message) { warnings.push(message); }
async function exists(filename) { try { return (await stat(filename)).isFile(); } catch { return false; } }

function validateSettings(settings, location) {
  if (!Array.isArray(settings)) { fail(location + ': settings must be an array'); return; }
  const ids = new Set();
  for (const setting of settings) {
    if (['header', 'paragraph'].includes(setting.type)) continue;
    if (!setting.id) { fail(location + ': setting missing id'); continue; }
    if (ids.has(setting.id)) fail(location + ': duplicate setting id ' + setting.id);
    ids.add(setting.id);
    if (!/^[a-zA-Z0-9_]+$/.test(setting.id)) fail(location + ': invalid setting id ' + setting.id);
    if (Object.hasOwn(setting, 'default') && setting.default === '') fail(location + '.' + setting.id + ': empty schema default is prohibited');
    if (setting.type === 'checkbox' && Object.hasOwn(setting, 'default') && typeof setting.default !== 'boolean') fail(location + '.' + setting.id + ': checkbox default must be boolean');
    if (setting.type === 'range') {
      const values = [setting.min, setting.max, setting.step ?? 1, setting.default];
      if (!values.every(Number.isFinite)) fail(location + '.' + setting.id + ': range needs numeric bounds, step and default');
      else {
        const [min, max, step, initial] = values;
        if (min >= max || step <= 0) fail(location + '.' + setting.id + ': invalid range bounds or step');
        if (initial < min || initial > max) fail(location + '.' + setting.id + ': range default is outside bounds');
        if (Math.abs((initial - min) / step - Math.round((initial - min) / step)) > 0.000001) fail(location + '.' + setting.id + ': default must align with step');
        if ((max - min) / step > 100) fail(location + '.' + setting.id + ': range has more than 101 values');
      }
    }
    if (setting.type === 'select' || setting.type === 'radio') {
      const options = setting.options || [];
      if (new Set(options.map(function (option) { return option.value; })).size !== options.length) fail(location + '.' + setting.id + ': duplicate option value');
      if (Object.hasOwn(setting, 'default') && !options.some(function (option) { return option.value === setting.default; })) fail(location + '.' + setting.id + ': default is not an option');
    }
  }
}

function validateBlockValues(schema, block, location) {
  const blockSchema = (schema.blocks || []).find(function (definition) { return definition.type === block.type; });
  if (!blockSchema) { fail(location + ': unknown block type ' + block.type); return; }
  const allowed = new Set((blockSchema.settings || []).map(function (setting) { return setting.id; }).filter(Boolean));
  for (const key of Object.keys(block.settings || {})) if (!allowed.has(key)) fail(location + ': undefined block setting ' + key);
}

const sectionNames = (await readdir(path.join(ROOT, 'sections'))).filter(function (name) { return /^studio-.*\.liquid$/.test(name); });
if (!sectionNames.length) fail('No studio section files found');
for (const filename of sectionNames) {
  try {
    const source = await readFile(path.join(ROOT, 'sections', filename), 'utf8');
    const schema = extractSchema(source, filename);
    const type = filename.replace(/\.liquid$/, '');
    schemas.set(type, schema);
    if (!schema.name || schema.name.length > 25) fail(filename + ': section name must be 1 to 25 characters');
    validateSettings(schema.settings || [], filename);
    const blockTypes = new Set();
    for (const block of schema.blocks || []) {
      if (!block.type) fail(filename + ': block type missing');
      if (blockTypes.has(block.type)) fail(filename + ': duplicate block type ' + block.type);
      blockTypes.add(block.type);
      if (block.name && block.name.length > 25) fail(filename + '.' + block.type + ': block name exceeds 25 characters');
      validateSettings(block.settings || [], filename + '.' + block.type);
    }
    for (const preset of schema.presets || []) {
      for (const block of preset.blocks || []) validateBlockValues(schema, block, filename + '.preset');
    }
  } catch (error) { fail(filename + ': ' + error.message); }
}

const templates = await availableTemplates();
for (const filename of templates) {
  try {
    const configuration = await readJSON(path.join(ROOT, 'templates', filename));
    if (configuration.layout !== 'studio') fail(filename + ': expected alternate studio layout');
    const order = configuration.order || [];
    if (order.length > 25) fail(filename + ': exceeds 25 section limit');
    if (new Set(order).size !== order.length) fail(filename + ': duplicate ordered section ids');
    for (const id of order) if (!configuration.sections?.[id]) fail(filename + ': ordered section does not exist: ' + id);
    for (const [id, section] of Object.entries(configuration.sections || {})) {
      const schema = schemas.get(section.type);
      if (!schema) { fail(filename + '.' + id + ': missing studio section ' + section.type); continue; }
      const allowed = new Set((schema.settings || []).map(function (setting) { return setting.id; }).filter(Boolean));
      for (const key of Object.keys(section.settings || {})) if (!allowed.has(key)) fail(filename + '.' + id + ': undefined setting ' + key);
      const blocks = section.blocks || {};
      const ordered = section.block_order || Object.keys(blocks);
      if (ordered.length > (schema.max_blocks || 50)) fail(filename + '.' + id + ': exceeds section block limit');
      if (new Set(ordered).size !== ordered.length) fail(filename + '.' + id + ': duplicate block order ids');
      for (const blockId of ordered) if (!blocks[blockId]) fail(filename + '.' + id + ': ordered block does not exist: ' + blockId);
      for (const [blockId, block] of Object.entries(blocks)) validateBlockValues(schema, block, filename + '.' + id + '.' + blockId);
    }
  } catch (error) { fail(filename + ': ' + error.message); }
}

const liquidFiles = [
  ...sectionNames.map(function (name) { return path.join('sections', name); }),
  'layout/studio.liquid',
  ...(await readdir(path.join(ROOT, 'snippets'))).filter(function (name) { return /^studio-.*\.liquid$/.test(name); }).map(function (name) { return path.join('snippets', name); })
];
for (const relative of liquidFiles) {
  if (!await exists(path.join(ROOT, relative))) { fail(relative + ': missing file'); continue; }
  const source = await readFile(path.join(ROOT, relative), 'utf8');
  for (const match of source.matchAll(/{%-?\s*(render|include|section)\s+['"]([^'"]+)['"]/g)) {
    const folder = match[1] === 'section' ? 'sections' : 'snippets';
    if (!await exists(path.join(ROOT, folder, match[2] + '.liquid'))) fail(relative + ': missing ' + folder + '/' + match[2] + '.liquid');
  }
  for (const match of source.matchAll(/['"]([^'"]+)['"]\s*\|\s*asset_(?:img_)?url/g)) {
    if (!await exists(path.join(ROOT, 'assets', match[1]))) fail(relative + ': missing asset ' + match[1]);
  }
}

const assetScripts = (await readdir(path.join(ROOT, 'assets'))).filter(function (name) { return /^sideshow-.*\.js$/i.test(name); });
for (const relative of ['scripts/preview-studio.mjs', 'scripts/check-studio.mjs', ...assetScripts.map(function (name) { return 'assets/' + name; })]) {
  const result = spawnSync(process.execPath, ['--check', path.join(ROOT, relative)], { encoding: 'utf8' });
  if (result.status !== 0) fail(relative + ': JavaScript syntax check failed\n' + result.stderr);
}

let renderedCount = 0;
for (const filename of templates) {
  const route = filename === 'index.json' ? '/' : '/pages/' + filename.replace(/^page\.studio-/, '').replace(/\.json$/, '');
  try {
    const actualTemplate = await templateForRoute(route);
    if (actualTemplate !== filename) fail(route + ': route resolves to ' + actualTemplate + ', expected ' + filename);
    const html = await renderTemplate(filename, route);
    renderedCount++;
    if (!/<html[\s>]/i.test(html) || !/<main[\s>]/i.test(html)) fail(filename + ': incomplete rendered document');
    if (!/name="robots" content="noindex,nofollow,noarchive"/.test(html)) fail(filename + ': preview noindex missing');
    const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
    if (h1Count !== 1) warn(filename + ': rendered H1 count is ' + h1Count);
    const assetURLs = new Set([...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(function (match) { return match[1]; }));
    for (const assetURL of assetURLs) {
      const name = decodeURIComponent(assetURL.split('?')[0].slice(8));
      if (!await exists(path.join(ROOT, 'assets', name))) fail(filename + ': rendered asset missing ' + name);
    }
    const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(function (match) { return match[1]; }));
    for (const match of html.matchAll(/\bhref=["']#([^"']+)["']/g)) if (!ids.has(match[1])) warn(filename + ': in-page target not present #' + match[1]);
    for (const match of html.matchAll(/\bhref=["'](\/pages\/[^"'?#]+)[^"']*["']/g)) {
      if (!await templateForRoute(match[1]) && !/policy|terms|refund|privacy/.test(match[1])) warn(filename + ': page link reaches preview boundary ' + match[1]);
    }
    console.log('Rendered ' + route + ' (' + html.length + ' characters)');
  } catch (error) { fail(filename + ': render failed: ' + error.message); }
}

for (const warning of [...new Set(warnings)]) console.warn('WARN ' + warning);
for (const error of errors) console.error('FAIL ' + error);
console.log('Checked ' + schemas.size + ' studio section schemas, ' + templates.length + ' templates, ' + liquidFiles.length + ' Liquid files and ' + (assetScripts.length + 2) + ' JavaScript files.');
console.log('Rendered ' + renderedCount + ' routes. Errors: ' + errors.length + '. Warnings: ' + new Set(warnings).size + '.');
console.log('Scope: new studio theme files only. This does not verify live Shopify apps, notifications, payment behavior or Theme Store conformance.');
if (errors.length) process.exitCode = 1;
