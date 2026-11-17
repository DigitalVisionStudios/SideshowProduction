# Sideshow Productions: Local-site accuracy audit
**Reviewed:** November 17, 2026
**Source of truth for this audit:** `C:\Users\jesus\Documents\Work\Website Backups\SideshowProduction-2026-11-10\`
**Compared against:** `C:\Users\jesus\Documents\Work\Shopify Stores\SideshowProduction-v2\` and the deployed homepage at https://previews.digitalvisionstudios.net/sideshow-productions-v2/
**Scope:** Public content and media. This is a November 10 snapshot comparison, not confirmation of current business operations.

## Verified against the actual saved WordPress files

| Area | Outcome | Evidence |
| --- | --- | --- |
| Homepage layout | Match in section sequence | Hero, six service tiles, four artist profiles, Ink Roulette, four reviews, contact and footer |
| Services | 6 of 6 headings and descriptions supported | Home HTML and `docs/studio-original-home-sources.json`. The tattoo tile changes an original dash to separate sentences |
| Services imagery | 6 of 6 match exact corresponding originals | Archived source SHA-256 matches every media source; optimized icon dHash distance 0 to 7 of 64 |
| Artist cards | 4 of 4 names, roles, and short bios supported | Rigo, Jake, Megan, Sonny; all four original portrait files match source SHA-256 and image similarity |
| Artist Instagram accounts | 4 of 4 match | Solo_inkslinger, jakenotlopez, meganwell14, sonny.27_ |
| Reviews | 4 of 4 original customers, attribution labels, and substantive quote text match | Dakota Fuller, Ashleigh Jensen, Kayla Burnett, Jessica Repman |
| Studio details | Match | Phone (385) 547-9547; club@sideshowproductionstattoo.com; 4973 S State St, Murray, UT 84107 |
| Studio social | Match | Instagram sideshowproductionstattoo, TikTok sshowproductionstattoo |
| Maps | Match location | Google Maps query resolves the saved source address. Live map rendering depends on Google |
| Catalog | 21 of 21 item names and prices match semantically | 16 merchandise plus 5 aftercare; only punctuation/typo cleanup in two titles |
| Catalog media | 21 of 21 source and optimized-file SHA-256 references pass | Original WordPress image files and corresponding project assets |
| Ink Roulette media | 27 of 27 source and optimized-file SHA-256 references pass | 25 selectable design photos; board and rules sign correctly excluded from outcomes |
| Ink Roulette pricing | Match | $150 for two spins; $20 to select another number |
| Artist rates | Match archived artist pages | Jake and Rigo start at $100/hour with a $50 credited deposit; Sonny has a 20% deposit and service-specific pricing |
| Megan pricing | Match archived artist pages | First tooth gem $60, subsequent gem $20, heart/star $65, fang $100; whitening $89/$120/$200; 20% deposit |
| Artist hours | Match archived listing | Jake, Rigo, Sonny and Megan hours match the saved Portfolios page, but should be confirmed before live bookings |
| Public preview assets | 45 of 45 direct homepage asset references exist | Audited the generated `HTML Preview\sideshow-productions-v2\index.html` and local asset folder |
| Demo navigation | As requested | 75 visible links lead to Coming Soon, 5 lead home, and 1 skip-navigation link stays in-page |
| Old promotions | Correctly not current | November 13 and 14 campaign expired November 15; promotional JS hides it, and August 2 National Tattoo Day promotion was not reactivated |
| Strong animation option | Intentional user-requested enhancement | Exaggerated animations are an independent option, off by default |

**Additional source verification:** The local backup stores 60 rendered pages, 2,616 public assets and 314 of 314 original public media URLs. Two legacy asset references could not be downloaded by the original archiver. The archive is not a WordPress database or an authenticated booking/checkout backup.

## Accuracy items to resolve before rebuilding the full live Shopify store

1. **Rigo's artist-page specialty copy is broader than the source.** The archived artist profile describes *black-and-grey and illustrative styles*. The draft Artists page says *custom tattoos and color work*. Color work is not established by the source text. Replace it with the original description or confirm it with Rigo.
2. **Jake's artist-page specialty copy has an interpretation.** The source emphasizes graphic elements, black-and-grey shading, lettering and illustrative custom work. The draft specifically lists *fine-line designs*. A customer review mentions fine lines, but this was not directly stated as his artist offering. Confirm or use the original specialty language.
3. **Microblading may need operational confirmation.** It genuinely appears as a sixth service tile in the WordPress homepage, but the archived four-artist roster does not identify a microblading provider or a specific appointment calendar. Keep it as a historical source feature, not a verified currently bookable service.
4. **Steri-Wash price conflicts inside the original site.** The WooCommerce product catalog and new project list it at **$16**, while one original product-description paragraph says **$15**. The current project is faithful to the catalog price; confirm the live price with the client before payments.
5. **Source aftercare page is more detailed.** The new draft aftercare page is deliberately condensed and omits much of the original piercing/tattoo care instructions, retail comparisons, product descriptions and FAQ wording. This is a content coverage difference, not a homepage error. Any health-related aftercare copy should be confirmed with the studio before republishing.
6. **Full portfolio and artist navigation differ.** WordPress combined portfolios, rate cards and booking details in one page; the draft separates Artists and Portfolio pages. The facts and images need rechecking when actual multi-page navigation is turned on.
7. **Two aftercare products intentionally lack photo replacements.** The shop uses text cards rather than conflicting-size or unverified product mockups. Other product images were matched to original content or verified sources in prior audits.
8. **Hero background photos and the supporting hero descriptions are not exact WordPress copies.** These reflect the user's explicitly approved redesign. The original tagline and rotating artists/piercings/tattoos sentence are retained.
9. **Shopify reality is not verified.** The archive cannot establish current Shopify subscription status, existing calendars, processor fees, artist notifications, tax handling, actual inventory or live customer form delivery. Treat the published preview as design-only until the original Shopify store is connected and tested.
10. **Promotional calendar details are historical.** The original download shows November 13 and 14, 2026 promotions and an even older August 2 campaign. None should be presented as an upcoming special after November 15 without fresh confirmation.

## Intentional differences, not mistakes

The user selected a centered Shopify-style logo/header, a revised brush-font hero, dark red transitions, a more polished service layout, continuously moving Splide artist cards without slider controls, optional stronger animations, a more coherent contact/map layout, and a homepage-only shareable preview. These are deliberately not identical to the WordPress site's Elementor styling.

## Recommended next pass

- Correct or confirm the two artist-specialty phrases before using the expanded Artists pages.
- Ask the studio to verify microblading, current hours, deposits and the Steri-Wash price.
- Retain the improved service images, four source reviews, four original artist images and current map location.
- Keep the November 13 and 14 event hidden. Publish only freshly approved promotions.
- When Shopify is reconnected, do a separate live checkout, booking, notification and inventory acceptance test.

**No live Shopify settings or published preview content were changed by this audit.**

### Primary evidence locations

- Local WordPress homepage: `site\index.html`
- Local WordPress artist prices/hours: `site\portfolios\index.html`
- Local WooCommerce public catalog: `metadata\api\products.json`
- Original homepage source map: `docs\studio-original-home-sources.json`
- Exact original media references: `docs\studio-original-home-media.json`
- Products and Ink Roulette source media: `docs\studio-catalog-mapping.json`
- Published preview export: `C:\Users\jesus\Documents\Work\HTML Preview\sideshow-productions-v2\`
