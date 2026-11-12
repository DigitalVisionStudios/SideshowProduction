# Client sharing preview

The Sideshow client preview is packaged in:

`C:\Users\jesus\Documents\Work\HTML Preview\sideshow-productions`

It uses the existing HTML Preview sharing-icon generator and Netlify deploy script. The original Shopify project remains the source of the design.

## Public address

`https://sideshow-review--dvs-html-previews-netlify6.netlify.app/sideshow-productions/`

The `sideshow-review` draft alias belongs to the existing `dvs-html-previews-netlify6` preview-library site. This is a client design preview, independent of Tailscale and the local development server.

## Package

- 11 rendered studio pages, 10 compatible route aliases, and a disconnected-feature landing page.
- 96 used storefront assets, including the corrected whitening comparison, upgraded flash images, original red Lottie, poster artwork, brush/body fonts, and wheel photographs.
- Original-logo browser favicons, a real ICO, Apple touch icon, web manifest, and a 1200 × 630 sharing card.
- Absolute Open Graph and Twitter card metadata, with the public preview URL and image.
- All internal paths, lazy media URLs, wheel pools, and preview boundaries adjusted for the `/sideshow-productions/` folder.
- Existing preview guards retained for forms and disconnected Shopify destinations. No preview banner was added.

The sharing card uses the original Shopify header badge and the real storefront photograph. Its source badge is `config/settings_data.json` at `e9b908d33dad1d4030ff980d7ebbfaf6ca759b3f`, under `/current/sections/header/settings/default_logo`. The original PNG is 455 × 455, with SHA-256 `0b2f34380ee8c6bab42d9c40b2a832b5e2b33e8ca210857360aac0fe82ada25a`. The generated set is in `assets/icons/` within the preview folder. The original source image is retained there as `logo-source.png`.

## Updating this preview

Run from the Shopify project root after editing the theme:

```console
node scripts/export-studio-preview.mjs --out "C:\Users\jesus\Documents\Work\HTML Preview\sideshow-productions" --site-url "https://sideshow-review--dvs-html-previews-netlify6.netlify.app/sideshow-productions/"
```

The exporter renders the actual studio Liquid templates, copies only their used assets and CSS dependencies, and retains the existing generated icon set. It does not copy source archives or internal reports into the public folder. `docs/studio-share-export.json` records the rendered source commit, routes, asset hashes, and sizes.

From the HTML Preview root, publish through the established script:

```console
.\deploy_to_netlify.ps1 -Project sideshow-productions -DraftAlias sideshow-review -Quick
```

The draft alias gives the client a consistent sharing URL. The existing script still performs its normal site-target, exclusion, and deployment checks. It uploads an atomic preview-library snapshot; this command does not switch the preview library's production URL or the client's live Shopify site.

## Validation

The generated package passed an internal-link and file-reference check across all 22 HTML files. Browser checks verified mobile layout, menu open/close, the original Lottie and background image, enlarged gallery images, wheel results, preserved artist/event contact context, blocked preview form submission, and no runtime exceptions. Phone and desktop screenshots were visually reviewed.

The branded sharing image, icon dimensions, genuine ICO format, and manifest scope were checked before upload. Deployment 6af50ffad8d8339349c24f02 reached ready. Public checks passed for all 11 pages, 96 storefront assets, and 11 icon/manifest files, with zero failures. The same eight interaction checks passed on the hosted site with no runtime exceptions. The result is recorded in docs/studio-share-deployment.json.
