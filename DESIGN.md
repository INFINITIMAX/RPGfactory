# RPG Factory — visual system

Updated: 19-09-2026

## Direction

**The Living Citadel, viewed from above.** The medieval world is the product, not the background of a dashboard. The composition reference supplied by the user is `INspiratie/1.png`; it is not a shipping asset. The city adopts the reference's density and compositional hierarchy while using a strictly top-down 2D plane, without an oblique camera or simulated perspective. The complete contract is in `docs/handoff/RF-K02-direction-contract.md`.

## Composition

- Desktop: a compact command bar and an edge-to-edge map occupying at least 80% of the first viewport.
- The castle and square are the center of a continuous settlement: roads, water/shoreline, walls, towers, districts, and forest. Pawns occupy stations near buildings rather than an abstract orbit.
- The mission ribbon and map controls are compact overlaid HUDs. The Operations Registry becomes an overlaid contextual drawer on the right and is closed by default; it does not permanently compress the map.
- The kingdom is unique. Correlated runs are Pawns, confirmed handoffs follow golden routes, and every public proof is exactly one gold object in the vault.
- The matrix, tree, and legacy profile/run registry remain secondary within the drawer, without a permanent dashboard.

## Color and material

| Token | Role |
|---|---|
| `--ink` `#322417` | primary text on paper |
| `--muted` `#705b41` | secondary text |
| `--paper` `#eadbb8` | rail surface |
| `--paper-deep` `#c6ab7c` | tiers and selections |
| `--wood` `#563719` | chrome, frames, and dividers |
| `--gold` `#d4a84b` | handoff, proof, and accent |
| `--blue` `#4b86b8` | map controls |

Terrain, castle, Pawns, gold, and chrome use the Tiny Swords visual language: compact grass, paper, wood, and heraldry. No glassmorphism, gradient text, SaaS cards, or effects that invent activity.

## Typography

- UI and text: Candara/Trebuchet as the sans workhorse, 11–14 px in the rail.
- Project titles and labels: self-hosted Grenze variable, a robust medieval display serif.
- Monospace: only for numbers, percentages, and short identifiers.
- Canvas labels are permanent for Pawns: allowlisted role, lifecycle, and `needs_attention`; the DOM alternative preserves full identity and keyboard selection.

## Components and states

- **Connection indicator:** semantic dot retained in the DOM plus a live label.
- **Map controls:** zoom out/percentage/zoom in/reset; pointer pan; dragging does not select a Pawn.
- **Castle/coordinator:** central hierarchy anchor, with a side label so it does not cover the vault or Pawns.
- **Pawn:** 80 px Canvas bounding box, consistent hit target, selection ring; animation only when the public snapshot confirms `active === true`.
- **Mission ribbon:** native selector; short opaque identifier and public status, without a private title/objective.
- **Handoff route:** dotted golden edge only for temporally confirmed linked sequences; missing evidence remains “unconfirmed.”
- **Proof vault:** one DOM button and one Canvas coin per allowlisted proof; there is no Open/resolver action or private target.
- **Rows:** native controls, visible focus, and `aria-pressed` for selection.
- **Map states:** loading, ready, empty, stale/unavailable, and disconnected, all with live text; disconnected preserves the last valid snapshot.
- **Canvas alternative:** screen-reader-only DOM list at rest; becomes a visible, scrollable overlay on `:focus-within`.

## Motion

- One motion family: the working Pawn animation and direct camera feedback.
- `prefers-reduced-motion: reduce` stops time-dependent animation.
- No decorative entrance animations or pulses without operational meaning.

## Local desktop and accessibility

- The product is desktop-only and local for Lucian's laptop; mobile is not a gate.
- Canvas has a role, name, and description; the same entities exist in the DOM.
- All primary controls support keyboard operation and have visible focus.
- State is not conveyed by color alone.

## Raster provenance

- Tiny Swords — Free Pack, Pixel Frog: https://pixelfrog-assets.itch.io/tiny-swords
- License: custom; commercial use permitted, redistribution of raw files prohibited.
- Grenze Variable Font, Omnibus-Type / Google Fonts: https://github.com/google/fonts/tree/main/ofl/grenze
- Font license: SIL Open Font License 1.1; the copy is in `public/fonts/OFL-Grenze.txt`.
- Complete registry: `assets/README.md`.
- Sprites are local in `public/sprites/` and intentionally excluded from GitHub.
- `INspiratie/1.png` is a user-supplied reference and is not served by the application.
