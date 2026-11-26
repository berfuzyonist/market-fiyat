# Design: Raf etiketi

Every price is a shelf label, the thing a Turkish shopper already trusts in the aisle. Mode: Operate. Layer: `css/raf.css` on `body.raf`, above `css/apple.css`.

## Palette
- Ground `--bg` cool shelf metal (#e6e9ec / dark #131518).
- Rail `--rail` graphite (#22272c / dark #0a0b0d): top bar, reversed "cheapest" labels. `--shelfrail` draws the shelf under horizontal rows.
- Label `--surface` paper white / dark #1d2024.
- Sale `--sale` chrome yellow #ffd31a with `--saleink` red numerals: discount sticker, depth bars, logo and cart button.
- Action `--accent` green: only on things you press (add, primary buttons, links).
- Market colours (Şok yellow, Migros orange, BİM red, A101 blue, Koop green) stay as store badges and label bands.

## Type
- UI: Inter (workhorse).
- Numerals: Barlow Condensed 500/700/800 (OFL, self-hosted in `fonts/`), via `--num`.
- Prices render with `lp()`: lira large, kuruş raised small, ₺ small.

## Components
- Product card (`pcard`): image, name, unit price, `.lprice` label (yellow tilted sticker when discounted, red `%` corner tab, struck old price; graphite reversed when it is the cheapest of its group), footer with decorative barcode from the id and the read date.
- States: stale = dashed label edge and faded price (form, not hue); ended = grayscale image and red "BİTTİ" stamp.
- Home "Bugünün rafı": one label per market (band, discounted count, average cut, data time), yellow depth bars on a rail, campaign link.
- Corners: labels 10px, inner stickers 4px, tags 4px.

## Motion
One moment: depth bars rise from the rail (ease-out, staggered). Reduced motion disables it.
