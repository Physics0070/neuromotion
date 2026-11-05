# NeuroMotion: web app

A small Node server (no framework, built-in SQLite) that serves the pages and a sign-in API. **To launch, read [DEPLOY.md](DEPLOY.md).**

| Page | Route | What it is |
|---|---|---|
| Story | `/` | A short scroll story: a pinned 3D arm that follows your scroll, then tall screens that pan inside frames as you scroll past them. |
| Sign in | `/login/` | Email one-time code, or Google. |
| Coach | `/coach/` | Three steps (who, workout, safety and start), then the camera counts every repetition set by set. Needs sign-in. |
| Progress | `/progress/` | Sessions kept on this device, trends per exercise, export, delete, and account deletion. Needs sign-in. |
| Validation | `/validate/` | The physiotherapist's goniometer comparison. Needs sign-in. |
| Privacy and terms | `/legal/` | What is stored where, the terms, the emergency advice. |
| Clinical review | `/review/` | Every rule, limit, safety text, cue and consent wording, generated from the app's own data, for sign-off. |

Light and dark themes: the toggle is in the header, the choice is remembered, and the system setting is the default. The pose model and its runtime are served from this site, so no video leaves the browser and the pages call no other company's server.

Exercises: shoulder flexion, shoulder abduction, elbow flexion, overhead reach, in `src/tracker/exercises.ts`. Targets are placeholders for the physiotherapist to set.

## Develop

```bash
npm install
npm run build      # type-check, bundle the pages, prerender their HTML
npm start          # http://127.0.0.1:4400 (development: sign-in codes are printed in this terminal)
npm test           # tracker and server unit tests (Node's built-in runner)
npm run release    # public build: refuses until every sign-off in src/release.json is present
node scripts/e2e.mjs    # starts its own test-mode server, drives a real browser with a fake camera
node scripts/a11y.mjs   # axe on every page, both themes, desktop and phone
```

## Prescription file

A physiotherapist builds a workout in the Coach, presses Save prescription, and sends the JSON to the caregiver, who loads it. Files are validated on load (size cap, limits on sets, reps, rest and per-exercise target ranges), so a bad or hand-edited file is rejected with a readable message.

```json
{
  "format": "caregiver-coach-plan",
  "version": 1,
  "name": "Morning",
  "blocks": [
    { "exercise": "shoulder-flexion", "side": "right", "sets": 2, "reps": 5, "rest": 30, "target": 90 }
  ]
}
```

## Layout

```
server/           app.mjs (static files, auth API, sessions, rate limits), index.mjs (environment, fail-closed checks)
src/pages/        Home, Login, Coach, Progress, Validate, Review, Legal
src/tracker/      core.ts (rep state machine, FHIR), exercises.ts, session.ts, profile.ts (modes, age limits),
                  validation.ts, camera.ts, history.ts, simulate.ts, speak.ts, cues.ts, tests
src/driver.ts     the single clock that maps scroll to joint state on the story page
src/Scene.tsx     React Three Fiber scene
src/release.json  the human sign-offs a public build needs
scripts/          prerender.mjs, release-check.mjs, e2e.mjs, a11y.mjs
security-headers.json   the one source of response headers, used by the server
public/           models, mediapipe wasm, theme.js, service worker, manifest, 404.html
```

Design notes and assumptions: [DESIGN.md](DESIGN.md). Validation session plan: [VALIDATION_PLAN.md](VALIDATION_PLAN.md).
