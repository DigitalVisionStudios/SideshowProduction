# Original Shopify content recovery

Read-only audit, November 12, 2026 UTC. Original source: commit `e9b908d` (March 25, 2026), with the earlier Shopify revisions checked where relevant. Compared with the studio redesign through `6c5fad7`. This pass inspected 31 original JSON templates and the related sections, configuration, and booking code. No production files or Shopify settings changed.

The original homepage was replaced by the redesign, so several useful references were only visible after fetching the complete git history. The recovered source snippets, all 19 testimonials, and four current artists' historical detail records are in `archive/shopify-template-recovery-2026-11-11/content.json`.

## Best material to recover next

| Material | Exact original source at `e9b908d` | What the current redesign is missing | Recommended use |
| --- | --- | --- | --- |
| Studio history and community story | `templates/page.ab-us.json` → `sections.768c1e62-8002-4176-89c6-e539137ed427.settings.text` | Original founding-year statement, plus Brighton Recovery and Fit To Recover named among supported organizations | Enrich the About page with a short studio-history paragraph and the complete historical community-support list. |
| Service-specific customer reviews | `templates/index.json` → `sections.quotes_m69Pwq.blocks` | 19 named testimonials, with 18 authors absent from the current six-review slider | Select a few that support specific services, especially whitening, Sonny's piercings, and flash tattoos. |
| Fuller artist descriptions and Instagram links | `templates/page.artist-portfolio.json` → the four portfolio records listed below | Current artist cards have short descriptions and booking links, with no individual Instagram action | Add direct artist Instagram links and reuse the stronger stylistic descriptions on detail pages. |
| In-studio jewelry showcase | `templates/index.json` → `sections.featured_content_WH9wwF.settings`, with gallery `quotes_mjHWfn` | Jewelry is mentioned under piercing, but the original dedicated jewelry section is absent | Use a compact jewelry display block with a directions action once current in-store availability is confirmed. |
| Aftercare and policy navigation | `templates/index.json` → `sections.ca6f690d-6509-4290-bf0b-32c142ac0b4c.blocks` | Original three-card route to tattoo aftercare, piercing aftercare, and studio policies | Restore clear entry links when the actual guide/policy pages are recovered and approved. |
| Add to Calendar | `sections/popup.liquid` → `downloadICS`, `makeICS`; `config/settings_data.json` → footer blocks `html_cRPdw8`, `html_kgtTPx` | Current event popup offers booking/event details, but no calendar action | Reuse the calendar feature with the current configured event dates, location, and Murray's `America/Denver` time zone. |
| Original moving photo wall | `templates/index.json` → `sections.custom_html_g8TAL4.blocks.html_hdmBLm.settings.code` | The old three-row alternating photo marquee is absent | Use the original composition and recovered photos if another gallery is needed. Implement with the current lightweight motion system and the user's autoplay preference. |

### Review selections worth considering

These are retained website testimonials, not newly verified Google reviews. The exported blocks do not contain individual review URLs, star ratings, or most review dates. Preserve the source label and attribution accurately.

| Author | Original block under `quotes_m69Pwq` | Why useful |
| --- | --- | --- |
| Leisl Fuentes | `quote_6K7jFT` | Describes whitening and a tattoo during a fundraiser, strengthening the smile-service and community sections. |
| grey | `quote_f3eCwR` | Names Sonny and discusses a piercing visit. |
| Helen Barbosa | `quote_b4UxCN` | Describes repeat flash-tattoo visits with her daughter. |
| Kyler McKay | `quote_rHHTLM` | Names Jake and describes the care he takes during an appointment. |
| Janeil Leitch | `quote_LTeWzU` | Supports the welcoming-studio message without historical prices or named former artists. |

Ashleigh Jensen is already present in the current slider, so avoid a duplicate. Tog Games' review contains a historical cash-only claim and old approximate pricing. Four other reviews name Katie or Maddie, neither of whom is in the currently verified four-person roster. Those should not be selected casually for current artist promotion.

### Artist records

All paths are within `templates/page.artist-portfolio.json` at `e9b908d`.

| Artist | Exact settings path | Useful retained detail | Instagram |
| --- | --- | --- | --- |
| Jake | `sections.portfolio_yFkdkL.blocks.author_nDfefr.settings` | Graphic elements, black-and-grey shading, lettering, illustrative customs, and a straightforward sketch-to-finish process | `https://www.instagram.com/jakenotlopez` |
| Rigo | `sections.portfolio_8VdjfF.blocks.author_y8MKRD.settings` | Black-and-grey and illustrative styles, clean lines, smooth blends, and English/Spanish explanations | `https://www.instagram.com/Solo_inkslinger` |
| Megan | `sections.portfolio_NhdxPw.blocks.author_mLcbKx.settings` | Cosmetic tooth gems and whitening; more service detail than the current brief card | `https://www.instagram.com/meganwell14` |
| Sonny | `sections.portfolio_XgQG6y.blocks.author_pUxpLa.settings` | Anatomy-based placement and aftercare explanation | `https://www.instagram.com/sonny.27_` |

Use the `opened_text` and `instagram_url` values for these additions. Rates, hours, deposit rules, jewelry inclusion, implant-grade material claims, and private-session availability remain operational details to confirm rather than silently reassert from an old template.

## Material useful when the Shopify connection returns

**Merchandise collection.** The original homepage used `templates/index.json` → `sections.featured_products_6wyheH.settings.home_featured_products = "merch"`. The current shop heading mentions merchandise but shows aftercare cards. This gives the collection handle to recover, but no product inventory, apparel sizes, stock, or current prices are embedded in this theme section.

**Booking steps.** The artist template's `meety_button_K4NdNP` section retains per-artist calendars and service mappings. `templates/product.promotions-new.json` → `sections.meety_overide_Vh3n4L.settings` retains the “Who's coming?” step, attendee counts, and quantity per attendee. Its `button_VxDVPE` block separates flash, piercing, whitening, and tooth-gem choices. These are concrete references for rebuilding the client's familiar flow. The known mapping issues in `docs/sideshow-migration.md` still apply, including Megan's inconsistent labels and Rigo's secondary `test` value.

**Outside-hours contact option.** `templates/product.json` → `sections.34ed0e66-84a3-4ba9-9bec-cc9af5bfc192.blocks.html_TNpYTL.settings.code` inserted a studio Instagram link for requests outside posted hours. If the studio still offers this flexibility, a simple “Ask about another time” action near availability would recover a useful detail. The old wording guaranteed scheduling outside hours, so it should not be copied unchanged.

**Gift cards, loyalty, and promotional selectors.** Historical Meety gift-card and redemption mappings are present. The saved configuration enables Meety and BON Loyalty embeds. Treat these as integration references. They do not prove either app remains installed, nor do they recover appointment history, email delivery settings, or artist/studio notification recipients.

## Recovered already, or not actually available in theme files

- The old red Lottie is already restored. Its exact source is `config/settings_data.json` → `current.sections.lottie-fullscreen-section.settings.animation_json_url`, pointing to `Animation_-_1706478173660.json?v=1706478316`. The old shop-sign image `Frame_1_1.png?v=1706560299` is also already recovered. No reason to reintroduce the old duplicate background scripts.
- The current brush face is already recovered from the archived newer site: Sedgwick Ave Display. The old Shopify typography was Inknut Antiqua 700/500 with Abel body text, per `config/settings_data.json` → `current.header_family`, `accent_family`, `base_family`. Restoring those heavier old headings would conflict with the user's current direction.
- The aftercare buttons point to `shopify://pages/copy-of-operations-policy`, `shopify://pages/after-care-piercing`, and `shopify://pages/policy`. The export holds labels and routes, not these Shopify Page resource bodies.
- `templates/page.faq.json` only instantiates an empty `dbtfy-faq-section`. It contains no saved question blocks. `sections/dbtfy-faq-section.liquid` can render `page.content`, which is external Shopify content, not a recovered FAQ answer set.

## Historical material to keep out of a blind restore

- The old About text's 213 reviews and 4.6-star average are stale. Do not replace current review presentation with that claim.
- February, March, and April fundraiser popups are expired. Their calendar scripts automatically advance dates into future years. Recover the calendar utility without reviving those offers or that automatic rollover behavior.
- Original popup settings include a 5% newsletter discount and old loyalty/account CTAs. Those offers require current approval and configuration.
- Old templates include Angelo, Ashley, Max, and a `TEST` artist record. The current verified roster remains Jake, Rigo, Sonny, and Megan.
- Historical phone `3474797706` and email `boderjoe@hotmail.com` appear in old contact/hero blocks. Use the current verified studio contact details instead.
- `templates/page.lease-to-own.json` contains tire-shop financing destinations, including `edwintireshop`. Disabled About “Our Promises” blocks also discuss rims and tires. These are unrelated inherited theme content, not Sideshow material.
- The old raw markup includes redundant scripts and global behavior such as collection redirects. Recover specific content and features into the current components instead of copying whole legacy template sections blindly.

## Suggested order

Start with individual artist Instagram links, fuller artist descriptions, a few service-specific reviews, and a clearer history/community paragraph. Next consider a small jewelry showcase and calendar action for the current event. Restore full aftercare pages, merchandise inventory, appointment integrations, gift cards, and notifications when their real Shopify data and settings are available.
