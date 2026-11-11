# Sideshow Productions studio redesign

A native Shopify theme draft built from the previous SideshowProduction project. The current public website has been preserved separately so its content and original media remain available during the migration.

## Review locally

Open http://127.0.0.1:8794 on this PC.

```powershell
cd 'C:\Users\jesus\Documents\Work\Shopify Stores\SideshowProduction'
npm ci
npm run preview
```

The preview renders the actual Liquid templates and sections, adds a preview notice, and never submits a booking, inquiry, order, or payment. It can also be viewed from authorized devices through the configured private Tailscale Serve endpoint. If port 8794 is occupied, the server reports its next available port.

## Included pages

| Preview route | Shopify JSON template |
| --- | --- |
| / | templates/index.json |
| /pages/portfolio | templates/page.studio-portfolio.json |
| /pages/artists | templates/page.studio-artists.json |
| /pages/services | templates/page.studio-services.json |
| /pages/about | templates/page.studio-about.json |
| /pages/book | templates/page.studio-book.json |
| /pages/contact | templates/page.studio-contact.json |
| /pages/aftercare | templates/page.studio-aftercare.json |
| /pages/flash | templates/page.studio-flash.json |
| /pages/ink-roulette | templates/page.studio-ink-roulette.json |
| /pages/shop | templates/page.studio-shop.json |

Shopify page resources and template assignments must be created/confirmed in the correct store. Template files alone do not create Shopify Pages.

## Design and behavior

- Black and deep red backgrounds, the source site's original Sedgwick Ave Display brush lettering, and the studio's actual artwork.
- A full-width hero using a 6.4-second muted excerpt of real tattooing footage from the archived site. No generated photos or videos.
- Lighter DM Sans text paired with the source site's SP Brush lettering across the artwork heading, artist names, studio story, flash and location accents, and mobile menu. Larger real artwork and the original studio crest.
- Inline SVG arrows, gallery controls, and FAQ chevrons for consistent rendering on phones, with accessible button labels.
- Editable section settings and blocks for the hero, services, artists, portfolio, products, events, and common questions.
- Fixed navigation that starts transparent on the homepage, becomes dark and compact after 48 pixels of scroll, and stays solid on inner pages. The fixed bottom booking bar has been removed. A full-height mobile menu uses a staged panel and link reveal, with native dialog focus management and scroll restoration.
- A swipeable homepage artwork slider with SVG controls, progress feedback, and the existing image viewer. The full portfolio keeps its filterable grid.
- A logo-only main header and mobile menu header. The Welcome section now has a separate three-photo studio gallery with swipe/drag navigation, thumbnail selection, SVG controls, keyboard support, and image enlargement.
- The Welcome gallery uses the real storefront, an uncropped photo of Jake tattooing recovered from the old Shopify theme, and the physical studio flash board. Full-photo framing keeps the shop sign and working hands visible. Up to six photos, captions, descriptions, and framing choices are editable in Shopify.
- Stronger staggered scroll reveals, staged hero typography, and image transitions. A moving service strip uses the original brush font, with a pause control and reduced-motion fallback.
- Video pauses when offscreen or the tab is hidden. Reduced-motion preferences start on the poster without downloading the video, with an explicit play control available.
- Automatic promotion expiry in both Liquid and JavaScript.
- The 21 recovered products and all 27 actual Ink Roulette images.
- Native Shopify contact form, with artist/item context preserved when entering from a relevant CTA.
- A lightweight alternate layout for the new pages, while retaining the original product and Meety code for recovery.

The homepage is changed only in this draft branch. The former homepage is preserved in Git history at e9b908d.

## Current booking and commerce state

Online booking is intentionally disabled by default in the new booking section until the correct store and service products are verified. Its current buttons contact the studio.

Shop items contain captured names, prices, and image assets. Shopify product selectors remain unassigned. Assigning a verified Shopify product makes that card use its real title, price, availability, image, and URL. Until then, cards use a contact inquiry. Source inventory declarations are not live Shopify inventory.

The new contact form uses Shopify's contact form on Shopify. In the local preview it has a protected local action and does not send anything.

The legacy Meety components remain available, but app installation, calendar state, artist routing, email notifications, deposits, and checkout totals have not been restored or verified. See docs/sideshow-migration.md.

## Preserved public source

Archive: archive/current-site-2026-11-10/

- 58 captured public URLs, with 54 distinct saved HTML paths.
- 314 public media originals: 307 validated images and 7 MP4 files.
- 21 catalog products, captured pricing, and source stock declarations.
- 27 Ink Roulette gallery images.
- Original HTML, extracted text, public API content, static resources, source links, and hashes.
- Approximately 338.5 MB on disk.

This is a source/content archive, not a rewritten offline mirror. Private bookings and provider account data were not accessed. The one unavailable resource is the site's generic WooCommerce placeholder image, which returned 404.

Key source records: summary.json, inventory.json, manifest.json, catalog.json, galleries.json, media-content-validation.json, validation.json.

Large archived media stays on this PC and is excluded from Git and Shopify uploads. The optimized assets used by the redesign are part of the theme.

## Validation

```powershell
npm run check
```

The check validates the new studio section schemas, template references, Liquid rendering, JavaScript syntax, local routes, and asset references. It does not prove live booking, payment, email delivery, or Shopify inventory correctness.

The current draft rendered all 11 routes without errors. A previous official Shopify Theme Check found no errors in the new studio files; its scoped warnings suggest using Shopify's preload_tag for the font preloads. Existing Debutify files have preexisting findings that were not rewritten as part of this draft.

The November 11 Welcome/header revision passed the existing validator with 20 section schemas, 11 templates, 24 Liquid files, five JavaScript files, zero errors, and zero warnings. All three source photographs were visually reviewed. The studio gallery is manual and does not automatically advance while a visitor is reading. Fresh Chrome captures verified the logo-only header and Welcome gallery at 1440 × 1000 and 390 × 844. The updated page was also opened through the existing private Tailscale endpoint, where selecting Jake's thumbnail displayed his photo and the 02 / 03 counter.

Browser review covered the home page at desktop and mobile sizes, the brush headings at 320 pixels, and the artwork and artist layouts. Focused browser checks verified the mobile menu's entrance/exit, focus trap, scroll restoration, rapid reversal, desktop resize cleanup, reduced motion, and Shopify section reload. The artwork slider passed arrow controls, keyboard navigation, drag suppression, and deliberate lightbox opening; the service strip passed pause/resume. The portfolio grid and filtering remain functional. Earlier review also covered contact artist context and the roulette design shuffle.

## Source preparation

```powershell
python scripts/archive-site.py
python scripts/prepare-studio-assets.py
python scripts/prepare-studio-content.py
python scripts/prepare-studio-motion.py --build
python scripts/prepare-welcome-gallery.py
```

The preparation scripts use Python with requests, BeautifulSoup, and Pillow. Asset preparation uses preserved originals and does not invent or retouch client artwork. Check the script documentation before recrawling. Source provenance is recorded in docs/studio-asset-sources.json, docs/studio-catalog-mapping.json, and docs/studio-authentic-media-sources.json. The authentic media script additionally requires FFmpeg and FFprobe. Original video is low resolution (498 × 246) and is used as a dark atmospheric background, preserving its real character rather than synthesizing replacement footage.

The Welcome-photo helper uses Python's standard library and Pillow. The new Jake image retains its original 750 × 1000 resolution; the storefront and flash-wall assets are reused without recompression. `docs/studio-welcome-media-sources.json` records their original sources and dimensions. `docs/studio-visual-references.md` links the current Sideshow site and the additional design references. Other studios' photography is for reference and is not included in this theme.

## Before launch

1. Confirm the exact Sideshow Shopify store and restore collaborator access/subscription as needed. Sideshow is absent from the currently signed-in Stores List.
2. Use an unpublished theme for review. Create the pages and assign the studio templates.
3. Verify current artists, pricing, products, options, stock, deposits, policies, and the microblading service.
4. Reconnect and validate Meety, the correct artist calendars, shop/artist notifications, and the intended checkout fee behavior.
5. Resolve the documented policy/contact inconsistencies and approve the final aftercare instructions.
6. Confirm legacy redirects and the domain cutover only after the staged store is ready.

No live theme, domain, app settings, billing, appointments, notifications, products, or payment configuration was changed during this draft.
