# Deploying NeuroMotion

The app is finished as software. Before a public launch three kinds of things are left: people's signatures, one measurement, and your accounts with Google and an email provider. The build refuses to produce a public release until the signatures and the measurement are recorded in `src/release.json`, and the server refuses to start in production until the sign-in settings are present.

It is now a small Node server (no framework) with a SQLite file, not a static site: it serves the pages and the sign-in API, and it needs a disk that survives restarts.

## 1. What only people can do

| # | Item | Who | Where it goes | How |
|---|---|---|---|---|
| 1 | Review every exercise rule, limit, target range, safety text and cue | Physiotherapist (with registration number) | `clinical` | Open `/review/`, print it, check every table, sign |
| 2 | Review Hindi wording | Native speaker, ideally a clinician | `translations.hi` | `/review/` sections 5 to 7 |
| 3 | Review Marathi wording | Native speaker, ideally a clinician | `translations.mr` | same |
| 4 | Review privacy, terms and consent, and decide whether the app is a medical device under India's Medical Device Rules (CDSCO) | Lawyer | `legal` | `/legal/` and `/review/` section 7 |
| 5 | Goniometer validation: at least 20 readings across low, middle and high angles, both arms, mean error up to 10° | Physiotherapist | `validation` | `/validate/`, then paste the block it prints. `VALIDATION_PLAN.md` has the session plan |
| 6 | Name of the organisation running the site and a contact email | You | `operator`, `contactEmail` | edit the file |
| 7 | A Google OAuth client, and an SMTP account to send sign-in codes | You | environment variables below | section 3 |

If the validation fails (mean error above 10°), do not release. Try the 2D method, move the camera, or decide to ship rep counting without angles.

## 2. Settings (environment variables)

| Variable | Needed | Meaning |
|---|---|---|
| `NODE_ENV=production` | yes | turns on the fail-closed checks below |
| `BASE_URL` | yes | the public address, `https://your-domain` (no trailing slash) |
| `SESSION_SECRET` | yes | 32 or more random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `SMTP_URL`, `MAIL_FROM` | yes | how sign-in codes are emailed, for example `smtps://user:password@smtp.example.com:465` and `NeuroMotion <no-reply@your-domain>` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional, both or neither | turns on "Continue with Google" |
| `DATABASE_PATH` | recommended | where the SQLite file lives, on a persistent disk (default `./data/app.db`) |
| `TRUST_PROXY=1` | behind a proxy | use the first `X-Forwarded-For` address for rate limits |
| `PORT`, `HOST` | optional | default `4400` and `0.0.0.0` |

In production the server prints what is missing and exits instead of starting half-configured. Never set `AUTH_TEST_MODE` in production: it exposes sign-in codes, and the server refuses to start with it.

## 3. Sign-in accounts

**Google.** In Google Cloud Console: create a project, set up the OAuth consent screen (app name, support email, your privacy page `https://your-domain/legal/`), then Credentials, Create credentials, OAuth client ID, type Web application. Add the authorised redirect URI `https://your-domain/api/auth/google/callback`. Copy the client ID and secret into the settings above. Google may ask you to verify the app before it leaves testing mode.

**Email codes.** Any SMTP provider works (Amazon SES, Brevo, Resend, Postmark, or a Gmail app password for a small pilot). Use a sending address on your own domain and set up SPF and DKIM with the provider so the codes do not land in spam. Test with an address you do not own.

## 3b. Run it

With Docker (the image runs `npm run release`, so it fails if a sign-off is missing):

```bash
docker build --build-arg SITE_URL=https://your-domain -t neuromotion .
docker run -d --name coach -p 8080:8080 -v coach-data:/data --env-file .env neuromotion
```

`--build-arg ALLOW_UNREVIEWED=1` builds a pilot image anyway. The pages no longer carry a banner, so only the Clinical review page lists what is still pending. Without Docker:

```bash
npm ci
SITE_URL=https://your-domain npm run release
NODE_ENV=production npm start
```

Put it behind HTTPS (the camera will not open without it): a platform such as Render, Fly.io or Railway terminates TLS for you, or use Caddy or nginx in front and set `TRUST_PROXY=1`. Mount a persistent disk at the `DATABASE_PATH` directory and back that file up.

## 4. After deploying

```bash
curl -sI https://your-domain/coach/ | grep -iE "content-security|strict-transport|x-frame|permissions"
curl -s https://your-domain/api/auth/config          # {"google":true} when Google is on
```

Open `https://your-domain/.well-known/security.txt`, sign in with an email code and with Google, delete the test account from the Progress page, and run the coach once on a real phone on mobile data.

## 5. Security design

| Risk | Control |
|---|---|
| Script injection | Content-Security-Policy: scripts only from this origin (plus WebAssembly); no inline scripts; React escapes all text |
| Data leaving the device | `connect-src 'self'`. MediaPipe tries to send usage logging to Google; the CSP blocks it and the browser tests assert nothing is answered from another origin |
| Guessing a sign-in code | 6 digits from a secure random source, stored only as a keyed hash, valid 10 minutes, locked after 5 wrong guesses, 5 codes per address per hour, per-address request limits, and the same answer whether or not an account exists |
| Stolen or forged session | 256-bit random token in an `httpOnly`, `SameSite=Lax`, `Secure` cookie; the server stores only its hash; sessions last 30 days and end on sign-out or account deletion |
| Cross-site requests | Every write must carry our own `Origin`, be JSON, and be under 4 KB |
| Google sign-in abuse | Authorization-code flow with PKCE, `state` and `nonce` in a signed short-lived cookie; the ID token's issuer, audience, expiry, nonce and verified email are all checked |
| Open redirects | The destination after sign-in is limited to same-site paths |
| Clickjacking, sniffing, downgrade | `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, HSTS, `Referrer-Policy: no-referrer`, COOP and CORP `same-origin` |
| Camera misuse | `Permissions-Policy: camera=(self)`; the camera opens only after consent and is stopped on finish, error or navigation |
| Hostile prescription files | 100 KB cap, strict validation of every field, ranges enforced |
| Vulnerable packages | `npm run audit:prod` in `release` and CI; lockfile committed; two runtime dependencies (React stack aside): `nodemailer` and the browser libraries |
| Misconfiguration | The server exits in production if the secret, address, mail settings or test mode are wrong |
| Personal data | Only email, optional name and sign-in times are on the server; exercise sessions stay on the device; the account can be deleted by the user on the Progress page |

Not covered: denial-of-service protection (use your host's), rate limits shared across several server instances (they are in memory; use one instance or put a shared limiter in front), and a visitor's own malware or shared device.

## 6. Running the validation session

See `VALIDATION_PLAN.md`.

## 7. Operating it

- **Updates:** change, `npm run release`, deploy. The service worker picks up the new build; old caches are deleted.
- **Rollback:** redeploy the previous image or build.
- **Data requests:** a user can delete their own account. To do it for them, delete their row from `users` in the SQLite file; sessions go with it.
- **Vulnerability report:** goes to the contact email in `security.txt`.
- **Dependencies:** run `npm run audit:prod` monthly.
- **Browsers:** current Chrome, Edge, Safari 16.4+ and Firefox with WebGL and WebAssembly. Marathi spoken cues need an installed voice; the text always shows.
- **Offline:** after one visit the pages and the pose model work without a connection; signing in needs one.

## 8. Still true after all of this

The angle is a camera estimate. The validation in section 1 is what lets you say how good it is, on your equipment and your patients; until it is recorded the Clinical review page says it is pending, and `npm run release` refuses to build. Holding people's email addresses makes the operator responsible under India's DPDP Act: the privacy notice is a draft for the lawyer in section 1. This is a supervised exercise aid, not a diagnostic or treatment device.
