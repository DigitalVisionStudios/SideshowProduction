# Original Shopify template recovery

Recovered November 11, 2026 local time, November 12 UTC. This extends the earlier live-site archive and artist-image recovery. The old homepage, artist portfolio, About, and Fit To Recover templates contained useful sources that were absent from the redesign's current templates.

## What is already improved

The whitening service uses the original homepage's `beforeandafter.png`, recovered at **1713 × 994**. The full comparison and its original labels remain visible: After on the left, Before on the right. The exact section is saved in `archive/shopify-theme-before-redesign/whitening-homepage-section.json`.

Seven additional images already used in the preview now use larger matching originals. Their subjects were compared visually before replacement. The preparation retains the full photograph at native size, with no upscaling, recoloring, or generated detail.

| Image | Previous size | Recovered size |
| --- | --- | --- |
| Flash sheet 1 | 536 × 532 | 600 × 600 |
| Flash sheet 2 | 571 × 571 | 639 × 639 |
| Flash sheet 3 | 699 × 848 | 960 × 1159 |
| Flash sheet 4 | 827 × 828 | 1080 × 1080 |
| Flash sheet 5 | 623 × 845 | 843 × 1144 |
| Flash sheet 6 | 626 × 846 | 843 × 1139 |
| Studio flash wall | 1588 × 1200 | 1906 × 1440 |

The existing media preparation scripts now retain these better sources when regenerated. Their exact template references, source hashes, and output details are in [studio-template-upgrades.json](studio-template-upgrades.json) and [studio-template-upgrade-results.json](studio-template-upgrade-results.json).

## Additional material recovered

| Material | Saved | What it adds |
| --- | ---: | --- |
| Original still images | 41 | Seven matching upgrades, four additional homepage sources, and 30 artist-attributed portfolio sources. |
| Tattoo and studio videos | 8 | Finished tattoos, tattooing sessions, and the physical Ink Roulette wheel in the red studio. |
| Original homepage testimonials | 19 | Whitening, piercing, flash, artist-specific, and general studio feedback. Eighteen authors are absent from the current six-review slider. |
| Current artists' historical records | 4 | Fuller descriptions and individual Instagram links for Jake, Rigo, Megan, and Sonny. |
| Studio and community copy | 1 content pack | Original About text, founding-year statement, community support, and reusable section references. |

### Photos

The four additional homepage sources are two extra flash sheets, the physical Ink Roulette wheel, and a clear body-jewelry display. The portfolio sources are grouped by the artist attribution saved in the original template: Jake 3, Rigo 7, Megan 3, and Sonny 17. Twenty-nine provide additional work images; one provides a fuller composition of an existing Rigo shoulder-floral tattoo.

All 41 originals are saved under `archive/shopify-template-recovery-2026-11-11/assets/`. They total **12,520,626 bytes**. The recovery verified every original's source key, byte count, SHA-256 hash, native dimensions, and image decoding, with zero failed downloads. Contact sheets are saved in the adjacent `contact-sheets/` folder.

The complete selection, artist attribution, subject description, and exact source links are in [shopify-template-recovery-media.json](shopify-template-recovery-media.json). The broader audit inspected 260 unique historical text blobs and extracted 213 distinct raster-source URLs; this is a selected and reviewed recovery, not a claim that every historical image was downloaded.

### Videos

Eight original videos are saved under `archive/shopify-template-recovery-2026-11-11/assets/videos/`, totaling **87,034,059 bytes**. The best finished-work clips are:

| Subject | Native size | Length |
| --- | --- | --- |
| Geometric black arm tattoo | 720 × 1280 | 18.83 seconds |
| Red and black skull tattoo | 720 × 1280 | 15 seconds |
| Blackwork snake and floral tattoo | 720 × 900 | 18 seconds |
| Artist tattooing a colored arm piece | 432 × 768 | 7.94 seconds |

The other four originals contain an extended tattooing session and three studio/Ink Roulette clips. The stronger portrait clips would suit a compact work gallery. They should be edited and encoded for that placement before use. Their original template blocks do not identify the tattoo artist, so no new artist attribution has been invented. Audio has not been reviewed.

Exact URLs, hashes, dimensions, durations, source commits, and template keys are in `archive/shopify-template-recovery-2026-11-11/videos.json`. Two automotive videos inherited from another theme were excluded.

### Text and reusable features

The recovered content pack includes all 19 homepage testimonials, four artists' fuller descriptions and Instagram links, the original community story, a jewelry showcase, aftercare navigation, the merchandise collection handle, and references to the original booking flow. It also identifies the old Google Calendar/ICS utility and the alternating three-row photo wall.

Useful review candidates discuss Megan's whitening, Sonny's piercings, Jake's work, and repeat flash visits. These are retained website testimonials. Their exported blocks do not establish current review counts, individual Google review links, dates, or star ratings.

The detailed content audit is [studio-template-content-recovery.md](studio-template-content-recovery.md). Exact retained wording and paths are in `archive/shopify-template-recovery-2026-11-11/content.json`.

## Best next uses in the design

1. Add a small portrait-video gallery using the three strongest finished-tattoo clips, keeping the page grounded in real client work.
2. Expand artist galleries from the attributed portfolio sources and add each artist's own Instagram link.
3. Pair selected service-specific testimonials with whitening, piercing, and flash sections.
4. Give the jewelry display and real Ink Roulette wheel a place in their relevant sections.
5. Enrich the About section with the recovered studio history and community work after checking which historical details remain current.

Only the verified matching image upgrades were applied in this recovery pass. The additional galleries, videos, and text are preserved for deliberate placement. Historical pricing, expired offers, former-staff records, placeholder video quotes, and automotive theme leftovers were not restored into the preview.

## Source preservation and reproduction

The still-image and content recovery is pinned primarily to commit `e9b908d33dad1d4030ff980d7ebbfaf6ca759b3f`. The whitening reference and most video links also occur in `15cd68121a1a85e7d632523521d5c7752611e807`. The content audit inspected 31 original JSON templates plus relevant section, configuration, and booking code.

The exact old homepage is saved as `archive/shopify-template-recovery-2026-11-11/templates/index.json`. A complete original-theme ZIP, including templates, sections, snippets, configuration, layout, assets, and locales, is also saved locally as `original-shopify-theme.zip` in the same archive folder. Its SHA-256 is `191073cf097624097020e5f10a58dc00741d7beec1d0feb1eee4944b7f180954`.

Run from the project root:

```console
python scripts/recover-shopify-template-images.py --manifest docs/shopify-template-recovery-media.json
python scripts/studio_recovered_media.py
```

The first command recovers or verifies the 41 pinned originals. It requires the referenced git history and Pillow. Add `--verify-only` to check the saved sources without downloading. The second command regenerates the seven matching storefront assets and their provenance reports. Original media and the theme ZIP remain in the local archive; manifests, source records, helpers, and optimized storefront assets are versioned with the project.

The theme export does not contain Shopify Page resource bodies, actual merchandise inventory, appointment history, or the notification-delivery configuration. Aftercare page handles and teaser copy were recoverable, but their full guide bodies were not present in the exported templates.

## Verification

The 41 selected original images passed their pinned source-reference, byte-count, hash, dimension, and decode checks. All eight selected videos were saved with their original bytes and recorded hashes. The seven storefront replacements were visually matched to the existing photographs before conversion.

The updated theme passed its existing validator: 23 section schemas, 11 templates, 28 Liquid files, 9 JavaScript files, and 11 rendered routes, with zero errors and zero warnings. Focused Chrome checks through the Tailscale preview confirmed all six flash sheets at their larger native dimensions, full-frame lightbox fitting, the 1906 × 1440 Welcome flash wall, phone layout bounds, and no runtime exceptions. Phone and desktop screenshots were visually reviewed.
