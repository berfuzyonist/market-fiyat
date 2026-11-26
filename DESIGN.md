# Design: Gece

A premium dark design. The user pinned it after three rejected directions (shelf label, living numerals): "premium ve lüks", reference apps Instagram and Spotify, showy motion. Layer: `css/gece.css` on `body.gece`, above `css/apple.css`. The app always runs dark (`js/theme.js`).

## Palette
- Ground #07070b. Behind it, a fixed aurora of violet, magenta and indigo radial lights drifts over 24 s, with fine grain on top.
- Surfaces are glass: a white 7.5%→3% gradient with a 1px white 9% border. Top and bottom bars use 24px backdrop blur.
- Text #f5f5f7, secondary text #cfcfd8 and #9d9daa.
- Gradient `--grad` (Instagram: #feda75→#fa7e1e→#d62976→#962fbf→#4f5bd5) is used only on story rings, discount badges, the logo, the active spotlight dot and the unit-price winner.
- Primary action: white pill with black text. "Cheapest" and "in list" use mint #7ee2a8.

## Type
- Manrope variable (OFL, self-hosted) for headings and prices.
- Inter for body.
- `pr()` sets a price with a large lira part and smaller kuruş plus ₺.

## Signature moments
- **Stories:** posters and campaigns appear as circles with a rotating conic gradient ring, interleaved by market, and pop in with a spring.
- **Öne çıkanlar:** a 3D cover-flow of the top deals, round-robin by market. Cards rotate (rotateY), recede (translateZ) and fade with scroll position. Each card has a market-coloured glow and a gradient dot indicator.
- **Card tilt:** cards tilt in 3D under the pointer or finger, with a light glare that follows it.
- **Add to list:** a burst of gradient particles.
- **Discount badges:** a light sheen sweeps across them every 3.6 s.
- **Shelves and sections:** cards rise with a blur-in; sections reveal with a blur-in.

## Shape
22px card radius, 28px spotlight cards, pills for chips, tabs and buttons.

Stale data is shown with a dashed edge and faded price. Ended offers get a "BİTTİ" pill stamp.

Reduced motion stops the aurora, story ring, sheen, cover-flow transforms and the particle burst.
