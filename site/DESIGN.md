# NeuroMotion site: design notes

## Concept card

- **Idea:** Scrolling raises the arm. Scroll position is the shoulder-flexion angle the app would measure, so the story and the product are the same thing.
- **Metaphor:** A protractor. Every chapter is a pose the coach would be looking at, and the page applies the app's own rules to it.
- **Signature:** One driver (`src/driver.ts`) maps scroll progress to angle, trunk lean, elbow bend and joint visibility. The 3D scene, the HUD number, the cue line and the page colour all read that one object.
- **Emotion:** Quiet, precise, slightly clinical, with warmth in the amber. First three seconds: a still arm that lifts once and settles while a counter runs.
- **Motion verb:** Click like a protractor. Hover and press answer with short, exact translations, not fades.
- **Screenshot frame:** The arm at 90 degrees, green, protractor arc closed, `090°` in the corner.

## State to colour

| State | Trigger (same rules as `core.py`) | Colour |
|---|---|---|
| Moving | default | amber `#F2A33A` |
| At target | angle 90 or more, no flag | green `#5BD6A0` |
| Flagged | trunk lean over 15, or elbow bend over 30 with angle over 45 | red `#FF4D4D` |
| Ghosted | joint visibility under 0.6 | body fades and flickers, cue says reposition |

## System

- **Palette:** ground `#0A0B0F`, ink `#ECE8DF`, muted `#8A8F9C`, line `#23262F`, plus the three state colours above. `--signal` is a registered CSS property so every accent follows the current state and transitions.
- **Type:** Bricolage Grotesque Variable (display and body), IBM Plex Mono (numbers, HUD, labels), Noto Sans Devanagari (Hindi and Marathi). All self-hosted through Fontsource, no third-party requests.
- **Layout:** copy on the left, body on the right on desktop, so the arm never crosses text. On phones the angle and cue sit at the top, the body in the middle and the copy in a card below.
- **One clock:** GSAP's ticker drives Lenis, the driver and the R3F render (`frameloop="never"` plus `advance()`). No other rAF loops.
- **Idle:** the arm breathes (about 1.4 degrees), floor rings pulse outward and the dust field drifts, on the same clock.
- **No-WebGL and reduced motion:** a designed still frame (`Fallback.tsx`), no smooth scroll, all copy visible.

## Assumptions to replace

- Social image `public/og.png` is a capture of the hero. Canonical URL and sitemap need the production domain.
- The Hindi and Marathi strings are the same unreviewed draft as in the app.
- Statistics are cited, not verified by the author: under 0.6 physiotherapists per 10,000 (2026 narrative review), ATTEND results (The Lancet, 2017).

## Not doing

- No fake testimonials, client logos or invented outcomes. The site says the prototype is unproven.
- No accounts, backend or uploads. The live demo runs entirely in the browser.
- No loader. The first paint is real text and the scene fades in when ready.
- No long single page. The story is seven short beats; detail lives on the Project page and the working tool on the Live demo page.

## Pages

- `/` story (this concept), `/coach/` the product, `/progress/` on-device history, `/project/` architecture and status.
- The coach is a workout app, not a demo: choose exercises, sets, reps and rest; counts per set; rest timer; summary; history. A physiotherapist's prescription is a small validated JSON file.
- Shoulder flexion shares one rule set with the Python app (`src/tracker/core.ts` mirrors `core.py`) and is tested against the same cases. The other three exercises are new, and their thresholds are first guesses.
- Practice mode plays a scripted pose, labelled as a script on screen, never as a measurement of a person.
- Progress lives in this browser's localStorage only. No accounts, no backend.
