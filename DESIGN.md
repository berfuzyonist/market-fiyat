# Design: Canlı rakamlar

An interactive type specimen applied to prices. Prices are set in a variable face whose weight and width follow the discount: the deeper the cut, the heavier and wider the numeral. Mode: Operate. Layer: `css/canli.css` on `body.canli`, above `css/apple.css`. Replaced "Raf etiketi" on 2026-11-26 at the user's request ("bambaşka, bol animasyonlu, bol etkileşimli").

## Palette
- Paper `--bg` #fafaf8, card #fff, fill #f0efeb, divider #d8d8d6. Dark: ink ground #0b0b0d, card #141417, divider #2b2b30.
- Ink `--ink` #0b0b0d (dark #f2f1ec).
- Accent `--accent` cobalt #1e4baf (dark #7d97ff): actions, discount figures, slider, selected states.
- Market colours stay only as store badges.

## Type
- Prices and headings: Anybody variable (wght 100–900, wdth 50–150), self-hosted, OFL.
- Labels and readouts: JetBrains Mono, 10–12px uppercase, tracked.
- Body: Inter.
- `axis(d)` maps discount 0–60%+ to wght 300→900 and wdth 72→132. `vp()` renders a price with `--w` and `--x`.

## Signature interaction
The home "İndirim ekseni": dragging the minimum-discount slider (or tapping a %10+/%25+/%40+/%55+ preset, which tweens) live-morphs a giant count of matching products, the per-market counts, and re-ranks the deals shelf. A mono readout shows the current wght/wdth.

## Motion
- Every price morphs in from wght 100/wdth 50 on entry, staggered.
- The giant numeral breathes slowly when idle and pauses while dragging.
- Pressing or hovering a card thickens its price.
- Shelf cards rise in sequence. The add button rotates on press. Tab underlines slide.
- Reduced motion turns all of it off.

## Shape
Hairline 1px borders, 2–4px corners, no shadows. Stale data uses a dashed card edge and faded price. Ended offers get a "BİTTİ" mono stamp and a grayscale image.
