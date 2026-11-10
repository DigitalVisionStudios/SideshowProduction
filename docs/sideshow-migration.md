# Sideshow Productions: source capture and Shopify migration

Reviewed: November 10, 2026. Prepared for Jesus Lozano / Digital Vision Studios.

## Project goal

Preserve the current Sideshow Productions website before its existing provider removes it, then rebuild the previous Shopify storefront with clearer navigation, a stronger visual hierarchy, restrained motion and a simpler booking journey. Use the studio's real photography, services and current artist roster. The client prefers the former Shopify booking and notification experience.

The client's supplied conversation establishes a proposed $125/month package for general maintenance, image/information changes and regular promotions. Larger campaigns and more involved changes were to be priced separately. This is project context, not an automatically activated subscription or invoice.

## Source material and recovery location

- Public site: https://sideshowproductionstattoo.com/
- Prior project: C:\Users\jesus\Documents\Work\Shopify Stores\SideshowProduction
- Redesign branch: feat/sideshow-redesign-2026-11-10
- Public capture: archive/current-site-2026-11-10/
- Original source snapshots: pages/, api/, metadata/ and assets/ beneath that capture directory
- Capture summaries: inventory.json, manifest.json and media-inventory.json

The archive remains on the PC. Git ignores binary captured assets; page/API/metadata captures and inventories remain eligible for source control. Ignoring a binary does not remove it from disk. The capture directories, development tools and documentation are excluded from Shopify uploads by .shopifyignore. Before relying on the PC as the only archive, create a durable separate backup through the owner's normal backup process.

The capture is evidence of the public site at the review time. It is not an export of the provider's appointment database, customer records, transactions, private media library, email automations or account settings.

## Current public site inventory

| Content | Public source |
| --- | --- |
| Home and current services | https://sideshowproductionstattoo.com/ |
| About | https://sideshowproductionstattoo.com/about/ |
| Artist work | https://sideshowproductionstattoo.com/portfolios/ |
| Aftercare | https://sideshowproductionstattoo.com/after-care/ |
| Flash designs | https://sideshowproductionstattoo.com/flash-tattoos/ |
| Ink Roulette | https://sideshowproductionstattoo.com/ink-roulette/ |
| Tattoo Games | https://sideshowproductionstattoo.com/tattoo-games/ |
| Merchandise, first page | https://sideshowproductionstattoo.com/merch-shop/ |
| Merchandise, second page | https://sideshowproductionstattoo.com/merch-shop/page/2/ |
| Contact | https://sideshowproductionstattoo.com/contact-us/ |
| General booking | https://sideshowproductionstattoo.com/booking-2/ |
| Legacy booking route | https://sideshowproductionstattoo.com/booking/ |
| Jake booking | https://sideshowproductionstattoo.com/book-with-jake/ |
| Rigo booking | https://sideshowproductionstattoo.com/book-with-rigo/ |
| Sonny booking | https://sideshowproductionstattoo.com/book-with-sonny/ |
| Operations policy | https://sideshowproductionstattoo.com/operations-policy/ |
| Refund policy | https://sideshowproductionstattoo.com/refund-policy/ |
| Privacy policy | https://sideshowproductionstattoo.com/privacy-policy-2/ |
| Terms | https://sideshowproductionstattoo.com/terms-of-service/ |

The public catalog review found 21 products, with a Monster long-sleeve product marked out of stock. Treat the archived inventory as source evidence. Reconfirm current merchandise, sizes, prices, stock and fulfillment before creating or publishing Shopify product records.

### Current artist roster

| Artist | Role on current site | Migration treatment |
| --- | --- | --- |
| Jake | Tattoo artist | Include, subject to current availability and portfolio review |
| Rigo | Tattoo artist | Include, subject to current availability and portfolio review |
| Sonny | Piercing artist | Include, subject to current availability and service review |
| Megan | Tooth gems and teeth whitening | Include; verify the old Meety product labels before connecting |

The old Shopify theme additionally lists Angelo, Ashley and Max. Those are historical records. The live /portfolios/ page reviewed for this project omits Angelo, and /book-with-angelo/ returned 404. Do not restore former artists as currently bookable solely because they exist in the old theme.

### Contact information and conflicting content

The home/footer use:

- (385) 547-9547
- club@sideshowproductionstattoo.com
- 4973 S State St, Murray, UT 84107

The contact page's main content showed (917) 443-1234. Some policy pages use sideshowproductionstattoo@gmail.com. Confirm the canonical phone number, customer-facing email, notification inbox and artist contacts before launch. The redesign uses the repeated home/footer contact information as the working source.

Other conflicts requiring a content decision:

- The homepage advertises microblading, but the current listed roster does not identify a corresponding provider or rate.
- The operations policy's all-sales-final wording conflicts with merchandise refund wording allowing a 30-day return/refund period.
- The aftercare material contains an unsupported “99.99% infection-free” claim and broad/inconsistent healing guidance. Preserve the original in the archive; obtain the studio's approved current instructions before publishing aftercare content.
- A Flash Tattoos booking link points to https://danielw497.sg-host.com/tattoo-games/ and returned a gateway error. Replace the staging-host destination in the rebuild.
- The live site and the former Shopify project contain different promotions, artist schedules and contact details. Source freshness must be assessed per field.

### Event active at capture time

The public site promoted Friday, November 13, 2026, 10 AM to 8 PM as a walk-in event and Saturday, November 14, noon to 8 PM as appointment-only. The promotion advertised flash tattoos, tooth gems and ear-lobe piercings starting at $13 plus $7 gratuity. Saturday booking was described as closing Thursday, November 12 at 11:59 PM.

These are captured event details, not evergreen service pricing. Any reusable promotion section needs explicit start/end dates or manual disabling so expired events do not remain active.

## Current booking destinations

All destinations below are archive evidence of the current provider's system. The intended restored experience is Shopify with the verified appointment integration.

Base:
https://api.apexmediasol.com/booking/sideshow-productions-qca5lvb6t1q

| Flow | Current destination |
| --- | --- |
| General | https://api.apexmediasol.com/booking/sideshow-productions-qca5lvb6t1q?heightMode=full&showHeader=true |
| Jake | https://api.apexmediasol.com/booking/sideshow-productions-qca5lvb6t1q/sv/6972b1990d960c13871cce3b?heightMode=full&showHeader=true |
| Rigo | https://api.apexmediasol.com/booking/sideshow-productions-qca5lvb6t1q/sv/6972b37d9b3f2203d0a1cd59?heightMode=full&showHeader=true |
| Sonny | https://api.apexmediasol.com/booking/sideshow-productions-qca5lvb6t1q/sc/6973827b21b46fe7a9648e5d?heightMode=full&showHeader=true |
| Megan | https://api.apexmediasol.com/booking/sideshow-productions-qca5lvb6t1q/sv/6a73532b8cc4552be336c7fd |
| Tattoo Games | https://api.apexmediasol.com/booking/sideshow-productions-qca5lvb6t1q/sc/6977b7a96e53f80bb21c4df5?heightMode=full&showHeader=true |
| November event, one service | https://api.apexmediasol.com/widget/booking/IVNMdjDFzeriqu0yNk25 |
| November event, two services | https://api.apexmediasol.com/widget/booking/XhB33wLjo8Rfly7hNlTb |

The external booking service returned 403 to the research crawler. No booking was submitted, no appointment was reserved and notification behavior was not verified. Existing future appointments may require a provider export or a separate reconciliation with the studio before the domain moves.

## Previous Shopify implementation

The prior theme is a heavily customized Debutify-derived Shopify theme. config/settings_schema.json labels it “DVS Custom”, version 5.02.2. It uses JSON templates, standard Shopify cart/product structures, configurable theme sections, custom portfolio displays and a substantial Meety implementation.

### Files to preserve

| Area | Files |
| --- | --- |
| Existing theme framework | layout/theme.liquid; config/settings_data.json; config/settings_schema.json |
| Existing homepage source | templates/index.json from the original branch/history |
| Artist portfolios and calendar mapping | templates/page.artist-portfolio.json |
| Meety section | sections/Meety-button.liquid |
| Current booking runtime | assets/meetybutton.js |
| Booking styles | snippets/meety-button-styles.liquid |
| Deposit/fee and BOGO metadata | assets/meety-injector.js; snippets/meety-injector.liquid |
| Tooth-gem variant matching | assets/meety-gems.js; snippets/meety-gems.liquid |
| Price/deposit display | sections/full-price.liquid |
| Product inputs and Meety bridge | sections/extra-input.liquid |
| Service and campaign templates | templates/product.services.json; product.promotions*.json; product.custom-full-price.json and related templates |

The current Meety section directly loads assets/meetybutton.js. The separate snippets/meety-button-script-loader.liquid references meety-button(OLD).js. Treat the latter as legacy unless verified otherwise.

The initial source audit inspected the section and auxiliary scripts, not the entire 627,662-byte main runtime. Live integration verification remains necessary.

### Saved Shopify artist mappings

These are identifiers recovered from templates/page.artist-portfolio.json, not proof of active current products.

| Artist/service | Product ID | Variant ID | Product handle / trigger |
| --- | --- | --- | --- |
| Jake | 8879224160513 | 46613448982785 | jake-tattoo-services / #jake |
| Rigo | 8879224914177 | 46613449081089 | rigo-tattoo-services / #Rigo |
| Sonny | 8898785968385 | 46676224311553 | sonny-piercing-services / #sonny |
| Megan, whitening mapping elsewhere | 8880817570049 | 46615941644545 | teeth-whitening-deposit-card |
| Megan, tooth-gem mapping elsewhere | 8880817602817 | 46615942725889 | tooth-gem-deposit-card |
| Angelo, historical | 8879223636225 | 46613448884481 | angelo-tattoo-services / #angelo |
| Ashley, historical | 8918898213121 | 46763432640769 | ashley-tattoo-services / #Ashley |
| Max, historical | 8879222948097 | 46613448524033 | max-tattoo-services / #max |

Megan's standard booking labels appear reversed relative to the BOGO service mappings: her “Tooth Gems” calendar points to 8880817570049, while “Teeth Whitening” points to 8880817602817. Verify the actual Shopify product names and Meety assignments.

Rigo's secondary calendar field contains the literal value test. It must not be reused as valid calendar JSON.

The old artist template contains actual Meety inline app blocks assigned to service, gift-card and redemption products. Visible buttons alone do not recreate the full integration.

### Existing booking features

- Standard one- or two-calendar booking.
- Per-artist hash triggers.
- Service-specific selectors and piercing categories.
- Multistep promotional chooser.
- BOGO tattoos, piercings, tooth gems and whitening.
- Gift-card purchase and redemption flows.
- Hidden inventory tracker products for promotional limits.
- Deposit and card-fee display labels.

Saved app embeds enable Meety bookings and BON loyalty. Smile, Globo product options and Meety's floating button are disabled in the saved configuration. These flags do not establish whether the apps remain installed after the store was deactivated.

### Processing-fee behavior recovered from code

The inspected code does not demonstrate an additional checkout surcharge.

The Meety injector reads a total already displayed in the popup, computes a base approximately as (total minus fixed fee) divided by (1 plus percentage), optionally floors the base to whole dollars, and labels the remainder “Card Fee”. It then writes that breakdown as line-item properties during cart additions. Defaults are 2.9% plus $0.30.

The full-price section separately subtracts gross downpayment multiplied by percentage plus fixed fee, then derives display pricing. These formulas differ.

Before launch, verify product variant prices, the deposit amount charged by Meety, cart/checkout totals, refund handling and the intended fee presentation as one flow. Do not promise that changing storefront copy restores fee behavior.

### Historical prices retained for reference

| Artist/service | Value in old theme |
| --- | --- |
| Jake | Starts at $100/hour; $50 deposit |
| Rigo | Starts at $100/hour; $50 deposit; Spanish consultations |
| Sonny | Service-dependent pricing; 20% deposit; jewelry included |
| Megan tooth gems | First $60; additional $20 each; heart/star $65; fang $100 |
| Megan whitening | Single $89; double $120; triple $200 |
| Angelo | Starts at $185/hour; $50 deposit |
| Ashley | $90/hour; $50 deposit |
| Max | Starts at $110/hour; $50 deposit |

Do not use these as current customer-facing prices until confirmed.

### Legacy behavior excluded from the new visual layout

- An active footer script redirects every /collections route to the homepage, with an empty allowlist.
- Another active footer script redirects gift-card product pages and full-cart pages containing gift-card products to the homepage.
- The old layout globally loads jQuery 2.2.3, Debutify assets, AOS, Fancybox, Lottie and an external csb.app script.
- Footer settings contain repeated style overrides, historical event scripts and global interaction patches.
- The old viewport prevents zoom with maximum-scale=1.
- Some old inline CSS contains invalid fragments, and at least one global event listener assumes an element exists.

The redesign uses an alternate layout so the design can be reviewed without importing this global behavior. Existing booking/product code remains available for the recovery work.

### Store identity is unresolved

Two legacy store identifiers exist in source, with the following verification results:

- The Debutify CDN path in layout/theme.liquid encodes 4c7d3a.myshopify.com. Its Shopify Admin title was checked and belongs to another client. Reject this identifier for Sideshow; do not upload the Sideshow theme to it.
- Hardcoded policy links in templates/page.contact.json use e481b6-2.myshopify.com. The attempted Admin access currently reports that the account does not have permission. This identifier remains an unverified candidate, not a confirmed Sideshow store.

The signed-in account's Shopify Stores List was also checked. Sideshow is absent from that list. The active Sideshow store must be made accessible and verified before uploading or assigning a theme. The shared media prefix https://cdn.shopify.com/s/files/1/0684/2997/1713/ remains useful for asset recovery but does not establish Admin authorization.

These checks were read-only. No live app, fee, notification or billing action was taken.

## New preview and development workflow

The preview uses the actual Shopify Liquid layout, snippets, section schemas and JSON template settings. It does not maintain a second static mockup.

Run from the project folder:

~~~powershell
npm install
npm run check
npm run preview
~~~

The local server binds to 127.0.0.1:8794 by default. If that port is occupied it tries the next nine ports and prints the selected URL. Change the preferred port with SIDESHOW_PREVIEW_PORT.

Supported route convention:

- / renders templates/index.json.
- /pages/<handle> renders templates/page.studio-<handle>.json.
- Common aliases cover about-us, our-artists, artist-portfolio, gallery, flash-tattoos, book-now, after-care, contact and merch-shop.
- Assets are served only from assets/.
- Products, cart, checkout, accounts and unresolved destinations show an explicit connection boundary.
- All form submissions are rejected. No submission success is simulated.
- Pages include noindex and an injected Design preview label.

The local preview supplies empty product/catalog data unless content is explicitly present in the new theme's settings. It does not invent Shopify inventory, bookings, payment success or notification delivery. The server makes no external API requests.

LiquidJS is pinned to 10.30.1, as returned by npm view liquidjs version at implementation time. Official extension documentation: https://liquidjs.com/tutorials/register-filters-tags.html and https://liquidjs.com/tutorials/options.html.

The check script validates the new studio schemas, unique setting/block IDs, nonempty supplied schema defaults, select/range values, template references, asset references, JavaScript syntax and actual route rendering. It intentionally excludes unrelated legacy theme schema problems. It is not a substitute for a Shopify upload validation or live app verification.

### Validation record

- The local check rendered all 11 studio routes and validated 19 studio section schemas. After the font assets were added, the project check reported zero errors.
- The actual contact page rendered its five contact fields without a success state. The local server returned 405 for POST requests, 404 for repository/archive paths, and noindex headers for preview responses.
- The official Shopify Theme Check command was rerun against the current source on November 10, 2026. Scoped to layout/studio.liquid, sections/studio-*, snippets/studio-image.liquid, templates/index.json and templates/page.studio-*.json, it reported zero errors and two AssetPreload warnings. Both warnings recommend the preload_tag filter for the existing font preload links in layout/studio.liquid, lines 11 and 12.
- The earlier missing sp-roulette-01.webp offense was resolved once the actual asset existed. The current official rerun no longer reports it.
- The official whole-repository command still exits 1 because the retained legacy theme contains 152 errors outside the new studio scope. This is not a clean certification of every old theme file. No legacy offenses were suppressed or automatically corrected.
- The full latest official JSON is preserved in .ai-bridge/theme-check-full.json; the scoped result is in .ai-bridge/theme-check-studio-scope.json.

## Suggested redirect mapping

Create redirects only after the new Shopify pages exist. Verify existing inbound links and avoid sending active booking links to unrelated content.

| Current public route | Proposed Shopify route |
| --- | --- |
| /about/ | /pages/about |
| /portfolios/ | /pages/portfolio |
| /after-care/ | /pages/aftercare |
| /flash-tattoos/ | /pages/flash |
| /ink-roulette/ | /pages/ink-roulette |
| /tattoo-games/ | /pages/ink-roulette or a dedicated games page after confirming scope |
| /merch-shop/ | /pages/shop or the approved Shopify merchandise collection |
| /contact-us/ | /pages/contact |
| /booking/ and /booking-2/ | /pages/book |
| /book-with-jake/ | Approved Jake booking destination |
| /book-with-rigo/ | Approved Rigo booking destination |
| /book-with-sonny/ | Approved Sonny booking destination |
| Existing product paths | Matching Shopify product URLs after catalog reconciliation |
| Current policy paths | Approved Shopify policies after resolving conflicts |

## Restoration and launch checklist

### Content and design

- [ ] Confirm four-person current roster and approved portfolio images.
- [ ] Confirm whether microblading, permanent freckles and other historical services remain available.
- [ ] Confirm shop hours and individual artist schedules, using the studio's America/Denver time zone.
- [ ] Confirm canonical phone, public email and booking contact.
- [ ] Review merchandise, variants, prices, inventory and fulfillment.
- [ ] Resolve policy conflicts and obtain approved aftercare text.
- [ ] Ensure event-specific promotions expire or are disabled.
- [ ] Verify mobile navigation, readable contrast, reduced motion, gallery controls and keyboard access.

### Shopify and booking

- [ ] Verify exact active Shopify store and subscription.
- [ ] Confirm the old theme, products and page assignments still exist.
- [ ] Reinstall or reconnect Meety if necessary.
- [ ] Verify all service product IDs, variants, calendars and artist assignment.
- [ ] Fix Megan's service-label mismatch and remove Rigo's invalid secondary calendar value.
- [ ] Decide which historical BOGO/gift-card/loyalty flows still belong in the active offering.
- [ ] Verify deposit/fee calculations against actual checkout totals.
- [ ] Confirm studio and artist notification recipients.
- [ ] Verify appointment confirmation, reminders, rescheduling/cancellation and staff visibility.
- [ ] Reconcile future appointments from the outgoing provider so customers are not lost during migration.
- [ ] Run a clearly identified test booking through the intended verification process before customer traffic moves.

### Launch

- [ ] Upload and review an unpublished Shopify theme in the verified store.
- [ ] Validate Shopify rendering, editor behavior and app blocks.
- [ ] Review the concrete final theme with the owner.
- [ ] Configure URL redirects, approved policies and metadata.
- [ ] Reconnect the domain after the booking system and notifications are confirmed.
- [ ] Verify domain/email DNS separately so the website change does not interrupt email.
- [ ] Verify the published customer journey and remove or retire old provider links.
- [ ] Retain the archive and previous Shopify revision for rollback.

## Current limits

Local design work can be completed without changing the live site. Public scraping cannot restore private calendars, customer history, notification routing or payment configuration. Those items remain explicit live-system verification tasks.

No live theme publication, domain change, appointment submission, checkout payment or client message is implied by this document.
