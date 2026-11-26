# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
A household in Trabzon (owner and spouse) shopping at Şok, Migros, BİM, A101 and Tarım Kredi Koop; the owner may share it with friends and relatives later. Used entirely on Android phones. Three moments: at home building the shopping list, standing in front of the shelf scanning a barcode to compare, and tapping a push notification about a new poster or campaign.

## Product Purpose
Show where each product is cheapest today, which campaigns (multi-buy, Money card, posters) are live, and how a price moved over time, so the weekly shop costs less without checking each market's site.

## Positioning
A personal, legal comparison built only from each market's own public pages, posters and subscribed emails, with honest freshness: every price shows when it was read and stale data is never hidden.

## Operating Context
GitHub Pages PWA; data refreshed by GitHub Actions collectors several times a day. ntfy push notifications deep-link into posters and campaigns. Barcode scanning via camera plus Open Food Facts dictionary.

## Capabilities and Constraints
- Search with typo tolerance, similar-product matching, unit price, price history, shopping list grouped by store, budget, posters, multi-buy campaigns, watched items.
- Legal only: no bot-protection bypass, respect robots.txt, marketfiyati.org.tr linked not copied.
- Never present an unverified price as correct; never delete healthy data on a failed crawl.
- No dependency outside GitHub (no external servers or paid infra). No secrets in frontend or commits.

## Brand Commitments
Name "marketfiyat". Turkish interface. Market colours identify each store (Şok yellow, Migros orange, BİM red, A101 blue, Koop green). Owner's stated taste (2026-11-26): premium and luxurious, dark, Instagram/Spotify feel, showy motion; rejected the shelf-label and variable-type directions as not it / too crude.

## Evidence on Hand
Real product data in data/, poster images, price history. No testimonials or user counts exist; do not invent them.

## Product Principles
- Cheapest answer first, explanation second.
- Freshness is visible, never implied.
- One-handed, in-aisle speed beats browsing richness.
- Notifications must land exactly on the thing they announce.
