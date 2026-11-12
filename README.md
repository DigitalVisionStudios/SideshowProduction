# Sideshow Productions studio redesign

A native Shopify theme draft built from the previous SideshowProduction project. The current public website has been preserved separately so its content and original media remain available during the migration.

## Review locally

Open http://127.0.0.1:8794 on this PC.

```powershell
cd 'C:\Users\jesus\Documents\Work\Shopify Stores\SideshowProduction'
npm ci
npm run preview
```

The preview renders the actual Liquid templates and sections without an extra notice bar above the navigation. Its local form guards prevent booking, inquiry, order, or payment submission. It can also be viewed from authorized devices through the configured private Tailscale Serve endpoint. If port 8794 is occupied, the server reports its next available port.

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
- A three-scene hero restores the source wording, “Unleashing your creativity starts with” artists, piercings, and tattoos “that inspire.” It uses the original storefront hero photo, Sonny’s piercing photograph, and the uncropped photo of Jake at work. Scenes crossfade with coordinated word transitions and optional authentic video assets. No generated photos or videos.
- Lighter DM Sans text paired with the source site's SP Brush lettering across the artwork heading, artist names, studio story, flash and location accents, and mobile menu. Larger real artwork and the original studio crest.
- Inline SVG arrows, gallery controls, and FAQ chevrons for consistent rendering on phones, with accessible button labels.
- Editable section settings and blocks for the hero, services, artists, portfolio, products, events, and common questions.
- Fixed navigation that starts transparent on the homepage, becomes dark and compact after 48 pixels of scroll, and stays solid on inner pages. The fixed bottom booking bar has been removed. A full-height mobile menu uses a staged panel and link reveal, with native dialog focus management and scroll restoration.
- A swipeable homepage artwork slider with SVG controls, progress feedback, and the existing image viewer. The full portfolio keeps its filterable grid.
- A logo-only main header and mobile menu header. The Welcome section now has a separate three-photo studio gallery with swipe/drag navigation, thumbnail selection, SVG controls, keyboard support, and image enlargement.
- The Welcome gallery uses the real storefront, an uncropped photo of Jake tattooing recovered from the old Shopify theme, and the physical studio flash board. Full-photo framing keeps the shop sign and working hands visible. Up to six photos, captions, descriptions, and framing choices are editable in Shopify.
- Stronger staggered scroll reveals, staged hero typography, and image transitions. The first hero word now enters with the rest of the heading. Compact word spacing and initial capitals preserve the brush style without the lowercase-p stroke colliding with the suffix. The moving service strip uses the original brush font, fills the available width, and plays automatically without visitor controls; reduced-motion preferences retain readable static text.
- The hero cycles automatically without arrows, slide numbers, or play/pause controls. Its rotation and optional video stop offscreen, while a modal is open, or when the tab is hidden. Reduced-motion preferences show a still scene.
- The original November 13–14 event poster and promotion return in a native dialog. It opens after 12 seconds at most once per session, can be reopened from the event banner, closes with Escape or its close control, and retires automatically. Saturday booking choices close at the original studio-local cutoff.
- Photo service cards bring starting prices, deposit details, artist links, and booking inquiries into a clear grid. The original red Lottie and faint shop-sign artwork form a fixed background, with transparent-to-black-to-transparent fades through each content section.
- A small palette button appears after 200 pixels of scrolling. Clean and Original presets plus separate Red motion, Studio artwork, and Section fades switches save a preference on that browser. The Studio appearance section controls the initial layers, animation opacity/scale, optional replacement artwork, and whether visitors see the button. When the button is disabled, the merchant's defaults apply instead of saved visitor choices.
- The original animation player loads only when the background can be seen. It pauses behind overlays, on hidden tabs, above the content, or when motion is disabled. Reduced-motion preferences retain a static red atmosphere. The panel supports Escape, focus return, and phone safe areas.
- Six original client reviews form a swipeable slider. A six-image social gallery uses real client work and links directly to the studio and artists’ Instagram profiles, with original Instagram and TikTok icons. It is a curated gallery, not a live social feed.
- An interactive Ink Roulette wheel draws from 25 reviewed design photographs, with descriptive captions, a synchronized result, and image enlargement. Whole-board and rules photographs remain preserved as context and are excluded from random selection. Online spins provide inspiration; the published $150/two-spin and $20 extra-number terms describe the in-studio experience.
- The 21 recovered product listings remain available. The original 27-image Ink Roulette archive is preserved, with 25 design photographs displayed in the active collection.
- Native Shopify contact form, with artist/item and validated event booking context preserved when entering from a relevant CTA.
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

Browser review covered the home page at desktop and mobile sizes, the brush headings at 320 pixels, and the artwork and artist layouts. Focused browser checks verified the mobile menu's entrance/exit, focus trap, scroll restoration, rapid reversal, desktop resize cleanup, reduced motion, and Shopify section reload. The artwork slider passed arrow controls, keyboard navigation, drag suppression, and deliberate lightbox opening; the service strip passed pause/resume. The portfolio grid and filtering remain functional. Earlier review also covered contact artist context and the previous roulette design shuffle.

The November 11 homepage restoration passed the validator with 22 studio section schemas, 11 templates, 26 Liquid files, eight JavaScript files, zero errors, and zero warnings. Sixteen focused Chrome checks verified hero autoplay/manual pause, overlay/offscreen suspension, event focus and expiry handling, wheel/result alignment, lightbox interaction, review navigation, reduced motion, and 320/390-pixel layouts. Six additional checks through the private Tailscale endpoint verified the event-to-artist-to-contact request context, the new homepage content, once-per-session popup behavior, and no browser runtime errors. Desktop and mobile screenshots were visually reviewed, and the long brush-letter descender received additional space above the hero suffix.

The November 11 appearance and original-photo revision passed the validator with 23 studio section schemas, 11 templates, 27 Liquid files, nine JavaScript files, zero errors, and zero warnings. Desktop and phone captures through the private Tailscale endpoint verified the original background, palette panel, higher-resolution hero, and artist cards. Browser checks covered saved preferences after reload, lazy player loading, reduced-motion suspension, Escape focus return, independent layer switches, clean-mode backgrounds, and 390-pixel layout bounds. The updated pages produced no browser runtime exceptions. Source recovery also verified the original CDN hashes, native image dimensions, and lossless alpha preservation for the background artwork.

## Source preparation

```powershell
python scripts/archive-site.py
python scripts/prepare-studio-assets.py
python scripts/prepare-studio-content.py
python scripts/prepare-studio-motion.py --build
python scripts/prepare-welcome-gallery.py
python scripts/prepare-legacy-appearance.py
python scripts/prepare-studio-originals.py
python scripts/prepare-studio-service-media.py
python scripts/prepare-studio-aftercare-media.py
```

The preparation scripts use Python with requests, BeautifulSoup, and Pillow. Asset preparation uses preserved originals and does not invent or retouch client artwork. Check the script documentation before recrawling. Source provenance is recorded in docs/studio-asset-sources.json, docs/studio-catalog-mapping.json, and docs/studio-authentic-media-sources.json. The authentic media script additionally requires FFmpeg and FFprobe. Original video is low resolution (498 × 246), so the current hero defaults to the sharper real photographs; the clip remains available as an optional scene asset.

The Welcome-photo helper uses Python's standard library and Pillow. The new Jake image retains its original 750 × 1000 resolution; the storefront and flash-wall assets are reused without recompression. `docs/studio-welcome-media-sources.json` records their original sources and dimensions. `docs/studio-visual-references.md` links the current Sideshow site and the additional design references. Other studios' photography is for reference and is not included in this theme.

The appearance helper recovers the exact legacy Lottie JSON and a lossless WebP of the original shop-sign pattern. The artwork already has very faint transparency in its pixels, so 100% artwork opacity preserves the original rather than making it opaque. The local SVG player is lottie-web 5.7.4, matching the former theme, with its MIT license in `docs/licenses/`. `docs/studio-legacy-appearance-sources.json` records the source URLs, hashes, original settings, and conversion checks.

The original-photo helper verifies the retained Shopify artist references and exact CDN file hashes. It creates twelve WebP assets at native resolution and reuses Jake's existing Welcome photograph. The hero, artists, portfolio, services, social tiles, about page, and booking cards use matching originals where they improve on the captured screenshots. Sonny's heart-ear photograph is 1440 × 1800; Megan's single tooth-gem photograph is 1080 × 1350; Rigo's blue floral tattoo is 815 × 1228. Jake's recovered work photographs are 750 × 1000, except the 1000 × 750 spider pair. `docs/studio-original-media-sources.json` contains exact replacements, attribution, dimensions, and rejected candidates. Megan's and Sonny's profile sources remain modest in resolution; their uncropped originals remove the old circular screenshot masks. No image was enlarged or artificially sharpened.

## Image matching and source review

The November 11 image audit reviewed all 11 studio templates, 170 configured image placements, 77 referenced filenames, and76 distinct images before corrections. The whitening card now uses the original Shopify homepage's `beforeandafter.png` at 1713 × 994, with After on the left and Before on the right. The original homepage section and source commit are preserved in `archive/shopify-theme-before-redesign/whitening-homepage-section.json`; this replaces the initially selected tinted portfolio comparison. Tooth gems use Megan's full 1736 × 928 original. Both keep the complete photograph, including the whitening labels and gem placements. The wider spider/lettering work and detailed artist photos now support full-frame fitting.

Three inherited aftercare mockups were replaced with manufacturer photos matched to the client's product-specific source imagery: Base Laboratories spray, Steri-Wash 3 oz, and Mad Rabbit Defend SPF 30. Repair gel and Enhance balm have unresolved package-size conflicts, so their product details remain in clean text cards. The five prior staged photos remain archived but are no longer displayed. Connected Shopify product images take priority when products are assigned. These source comparisons do not verify current stock.

`docs/studio-media-audit.json` records the original inventory, findings, resolutions, and remaining source limits. The two new preparation helpers pin source hashes and verify attribution/product mappings. `docs/studio-roulette-curation.json` distinguishes 25 design photographs from two contextual photographs and preserves the reviewed captions. Content preparation applies those decisions and the aftercare overrides so rerunning it does not reintroduce the mismatches.

This revision passed 23 section schemas, 11 templates, 28 Liquid files, and 9 JavaScript files with zero errors or warnings. Browser verification through Tailscale loaded all 75 currently rendered image URLs across all 11 routes and passed 21 focused checks, including image matching, wheel selection, full-frame fitting, shop fallbacks, desktop/phone bounds, and no runtime exceptions. Desktop 1440 × 1000 and phone 390 × 844 screenshots were visually reviewed.

## Before launch

1. Confirm the exact Sideshow Shopify store and restore collaborator access/subscription as needed. Sideshow is absent from the currently signed-in Stores List.
2. Use an unpublished theme for review. Create the pages and assign the studio templates.
3. Verify current artists, pricing, products, options, stock, deposits, policies, and the microblading service.
4. Reconnect and validate Meety, the correct artist calendars, shop/artist notifications, and the intended checkout fee behavior.
5. Resolve the documented policy/contact inconsistencies and approve the final aftercare instructions.
6. Confirm legacy redirects and the domain cutover only after the staged store is ready.

No live theme, domain, app settings, billing, appointments, notifications, products, or payment configuration was changed during this draft.

## Homepage restoration sources

The November 11 homepage pass is grounded in the archived `home.html`, `home.txt`, `about.txt`, and Ink Roulette page. `docs/studio-hero-media-sources.json` records the original storefront hero, rotating headline, additional scene photographs, and recovered event poster. The review section retains the original names, wording, and source labels. Instagram tiles link to verified profile URLs preserved in the archive, since individual post URLs were not available. The event uses the original November 2026 dates and explicit Utah time offsets; expired older promotions were not reintroduced.

## Additional Shopify template recovery

The November 11 recovery found 41 selected original still images, eight authentic tattoo/studio videos, 19 original homepage testimonials, four artists' fuller descriptions and Instagram links, and additional studio/community content. Six flash sheets and the Welcome flash wall now use their larger matching originals. The original homepage's whitening comparison was also restored in the preceding fix.

See [the recovery overview](docs/studio-template-recovery.md) for findings, exact source inventories, and the most useful next additions. Original media, contact sheets, and a complete original-theme ZIP are saved under `archive/shopify-template-recovery-2026-11-11/` on this PC. The original files are excluded from Git and Shopify uploads; the recovery manifests, helpers, source records, and optimized storefront images are versioned.

```console
python scripts/recover-shopify-template-images.py --manifest docs/shopify-template-recovery-media.json
python scripts/studio_recovered_media.py
```

The first command recovers or verifies the 41 selected still originals against their pinned template references and hashes. The second prepares the seven reviewed image upgrades. Existing media preparation scripts also honor those replacements, so regenerating the preview retains the better sources. The final revision passed the studio validator with zero errors or warnings, plus focused mobile/desktop image and lightbox checks through Tailscale.

## Client sharing preview

The static client preview is saved in the HTML Preview folder as sideshow-productions and uploaded with the existing Netlify script. [Open the Sideshow preview](https://sideshow-review--dvs-html-previews-netlify6.netlify.app/sideshow-productions/). It includes all 11 studio pages, the original-logo sharing card and icon set, the corrected service images, and the current motion and galleries. See [sharing and update instructions](docs/studio-share-preview.md) for the export command and public verification record.
