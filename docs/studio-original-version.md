# Sideshow: original-layout version

This is a separate design branch based on V1 commit `5a3557a`. Its reference is the downloaded WordPress/Elementor site captured on November 10, 2026, rather than the older Shopify homepage.

## Homepage

The hero uses the headline “Your vision. Our artistry.” with medium-weight white text and the original rotating brush words. A dedicated decorative transition section follows the hero: 128px on desktop and 80px on mobile, fading from the hero's black floor to transparent before the services section. After the hero, the homepage follows the source sequence: six illustrated services, artist introduction and circular portrait carousel, split Ink Roulette video feature, four client reviews, contact information with Google Maps, and footer. The current event is kept as a timed popup without an extra homepage strip. Expired promotions are not restored.

Original service illustrations and actual artist portraits are recovered from hash-verified archived media. The original Roulette footage uses its existing video stream with audio removed. No generated imagery was added. The mobile layout uses compact illustrated service rows and stacked feature sections. The artist carousel uses locally hosted Splide 4.1.4 with Auto Scroll 0.5.3. Its movement and entrance follow the existing HTML Preview `Components/splide.html` reference: continuous scrolling on every viewport, centered cards with balanced edge previews, and an 800 ms fade/rise/scale entrance staggered from the center outward. There are three cards on desktop, two on tablet, and one below 768px. Scrolling targets 30 pixels per second, normalized for display refresh rate, and supports dragging/swiping without timed mobile stops. The cards retain authentic portraits, compact brush lettering, equal heights and aligned social links. The artists section has an opaque black background behind the entire carousel, fading from transparent above the heading and back to transparent in the bottom padding. There are no arrows, dots or pause controls, and hovering keeps motion running. Reduced motion, keyboard focus, open dialogs, hidden tabs and offscreen sections are respected. The Homepage and About page share this component.

Red gradients fade across sections. Optional legacy Shopify motion and artwork remain available in the palette, with both off by default for this original-layout version.

## Supporting pages saved for later

About restores the four original Journey images and stories, original crew order, values, two reviews, and a newsletter form. Flash restores all eight gallery entries, benefits, original video, three reviews, and FAQ topics. Ink Roulette preserves the curated 25 selectable designs and restores explanatory content, four reviews, source footage, and informational board/rules images. The shop retains the existing 21 products and corrected images while restoring their original mixed order and compact grid.

Corrected Shopify whitening and other higher-quality matching service images remain in the project. Unsupported health claims and medication-stopping advice from the source were not republished.

## Preview boundary

The shared review is a homepage-only preview. Destination links, including navigation, booking, artist profiles, social accounts, phone/email, policies and map actions, lead to a branded Coming soon page. Home/logo links, the return button and the accessibility skip link remain functional. Previously shared supporting-page routes also lead to Coming soon. The recovered page templates and original Shopify link destinations remain in source for later development. The project is not deployed to the live Shopify store.

## Review locations

- Local source: `C:\Users\jesus\Documents\Work\Shopify Stores\SideshowProduction-v2`
- Local preview: `http://127.0.0.1:8797/`
- Static export: `C:\Users\jesus\Documents\Work\HTML Preview\sideshow-productions-v2`
- Main previews directory: `https://previews.digitalvisionstudios.net/`
- Share URL: `https://previews.digitalvisionstudios.net/sideshow-productions-v2/`
- Earlier draft alias: `https://sideshow-original--dvs-html-previews-netlify6.netlify.app/sideshow-productions-v2/`

## Validation

The studio validator renders all 11 routes and checks section schemas, Liquid, JavaScript, local media references and duplicate IDs. Browser review covers the desktop/mobile homepage, dedicated hero transition, automatic sliders, source video, map appearance, menu and popup handling, destination-link routing and the Coming soon return flow. Supporting-page source remains checked by the template validator. Source inventories and deterministic media preparation scripts accompany this branch.
