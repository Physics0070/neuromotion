import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { createApp, OTP_MAX_ATTEMPTS, OTP_TTL_MS, safeNext } from './app.mjs'

const headers = JSON.parse(fs.readFileSync(new URL('../security-headers.json', import.meta.url), 'utf8'))
const BASE = 'http://localhost:5555'
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-dist-'))
for (const [f, body] of Object.entries({ 'index.html': 'home', 'coach/index.html': 'coach', '404.html': 'missing page', 'assets/a.js': 'x', 'mediapipe/wasm/m.wasm': 'w', 'sw.js': 's' })) {
  fs.mkdirSync(path.dirname(path.join(dist, f)), { recursive: true })
  fs.writeFileSync(path.join(dist, f), body)
}

const open = []
async function boot(extra = {}) {
  const sent = new Map()
  const clock = { t: 1_800_000_000_000 }
  const app = createApp({ baseUrl: BASE, secret: 'a-test-secret-that-is-long-enough!!', headers, distDir: dist, mailer: { last: sent, send: async ({ to, code }) => { sent.set(to, code) } }, now: () => clock.t, testMode: true, ...extra })
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r))
  open.push(app)
  const url = `http://127.0.0.1:${app.server.address().port}`
  const call = async (p, { method = 'GET', body, cookie, origin = BASE, type = 'application/json', raw } = {}) => {
    const h = {}
    if (cookie) h.cookie = cookie
    if (method === 'POST') { if (origin) h.origin = origin; h['content-type'] = type }
    const res = await fetch(url + p, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), redirect: 'manual' })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data, headers: res.headers, cookies: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') }
  }
  const signIn = async (email = 'asha@example.org') => {
    await call('/api/auth/otp/request', { method: 'POST', body: { email } })
    return call('/api/auth/otp/verify', { method: 'POST', body: { email, code: sent.get(email) } })
  }
  return { app, call, sent, clock, signIn }
}
after(() => Promise.all(open.map((a) => a.close())))

test('the site is served with the security headers, clean redirects, a real 404 and no path traversal', async () => {
  const { call } = await boot()
  const home = await call('/')
  assert.equal(home.status, 200)
  assert.match(home.headers.get('content-security-policy'), /default-src 'self'/)
  assert.equal(home.headers.get('x-frame-options'), 'DENY')
  const redir = await call('/coach')
  assert.equal([redir.status, redir.headers.get('location')].join(' '), '302 /coach/')
  assert.equal((await call('/coach/')).data, 'coach')
  const miss = await call('/nope/')
  assert.equal(miss.status, 404)
  assert.equal(miss.data, 'missing page')
  assert.equal((await call('/assets/a.js')).headers.get('cache-control'), headers.assets)
  assert.equal((await call('/mediapipe/wasm/m.wasm')).headers.get('content-type'), 'application/wasm')
  for (const evil of ['/..%2f..%2fetc%2fpasswd', '/%2e%2e/%2e%2e/secret', '/a%00b']) assert.ok([400, 403, 404].includes((await call(evil)).status), evil)
  assert.equal((await call('/', { method: 'POST' })).status, 405)
})

test('email code sign-in: request, verify, session, sign out', async () => {
  const { call, sent } = await boot()
  assert.equal((await call('/api/auth/me')).status, 401)
  const req = await call('/api/auth/otp/request', { method: 'POST', body: { email: ' Asha@Example.org ' } })
  assert.deepEqual([req.status, req.data], [200, { ok: true }])
  const code = sent.get('asha@example.org')
  assert.match(code, /^\d{6}$/)
  const ok = await call('/api/auth/otp/verify', { method: 'POST', body: { email: 'asha@example.org', code } })
  assert.equal(ok.status, 200)
  assert.match(ok.headers.getSetCookie()[0], /^cc_session=.+; Path=\/; HttpOnly; SameSite=Lax/)
  const me = await call('/api/auth/me', { cookie: ok.cookies })
  assert.deepEqual(me.data, { user: { email: 'asha@example.org', name: null } })
  const again = await call('/api/auth/otp/verify', { method: 'POST', body: { email: 'asha@example.org', code } })
  assert.equal(again.status, 400, 'a code works once')
  await call('/api/auth/logout', { method: 'POST', cookie: ok.cookies })
  assert.equal((await call('/api/auth/me', { cookie: ok.cookies })).status, 401, 'the session is gone on the server')
})

test('codes: bad input, wrong guesses lock the code, expiry, and request limits', async () => {
  const { call, sent, clock } = await boot()
  assert.equal((await call('/api/auth/otp/request', { method: 'POST', body: { email: 'nope' } })).data.error, 'bad-email')
  assert.equal((await call('/api/auth/otp/request', { method: 'POST', body: { email: `${'a'.repeat(260)}@x.org` } })).status, 400)
  await call('/api/auth/otp/request', { method: 'POST', body: { email: 'b@example.org' } })
  const real = sent.get('b@example.org')
  const wrong = real === '000000' ? '111111' : '000000'
  for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) assert.equal((await call('/api/auth/otp/verify', { method: 'POST', body: { email: 'b@example.org', code: wrong } })).status, 400)
  assert.equal((await call('/api/auth/otp/verify', { method: 'POST', body: { email: 'b@example.org', code: real } })).status, 429, 'locked after too many guesses, even with the right code')
  await call('/api/auth/otp/request', { method: 'POST', body: { email: 'c@example.org' } })
  clock.t += OTP_TTL_MS + 1
  assert.equal((await call('/api/auth/otp/verify', { method: 'POST', body: { email: 'c@example.org', code: sent.get('c@example.org') } })).status, 400, 'expired')
  const statuses = []
  for (let i = 0; i < 7; i++) statuses.push((await call('/api/auth/otp/request', { method: 'POST', body: { email: 'd@example.org' } })).status)
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429], 'five codes an hour per address')
  assert.equal((await call('/api/auth/otp/verify', { method: 'POST', body: { email: 'b@example.org', code: '12ab56' } })).status, 400)
})

test('writes must come from our own pages, as JSON, and small', async () => {
  const { call } = await boot()
  const body = { email: 'x@example.org' }
  assert.equal((await call('/api/auth/otp/request', { method: 'POST', body, origin: 'https://evil.example' })).status, 403)
  assert.equal((await call('/api/auth/otp/request', { method: 'POST', body, origin: null })).status, 403)
  assert.equal((await call('/api/auth/otp/request', { method: 'POST', raw: 'email=x', type: 'text/plain' })).status, 415)
  assert.equal((await call('/api/auth/otp/request', { method: 'POST', raw: 'not json' })).status, 400)
  assert.equal((await call('/api/auth/otp/request', { method: 'POST', raw: JSON.stringify({ email: 'x'.repeat(6000) }) })).status, 413)
  assert.equal((await call('/api/auth/otp/request', { method: 'POST', body })).status, 200)
})

test('deleting the account removes the user and every session', async () => {
  const { call, signIn, app } = await boot()
  const a = await signIn('gone@example.org')
  const b = await signIn('gone@example.org') // a second device
  assert.equal((await call('/api/auth/delete', { method: 'POST', cookie: a.cookies })).status, 200)
  assert.equal((await call('/api/auth/me', { cookie: b.cookies })).status, 401)
  assert.equal(app.db.prepare('select count(*) c from users').get().c, 0)
  assert.equal((await call('/api/auth/delete', { method: 'POST' })).status, 401)
})

test('a forged or tampered session cookie is not a session', async () => {
  const { call, signIn } = await boot()
  const { cookies } = await signIn()
  assert.equal((await call('/api/auth/me', { cookie: `${cookies}x` })).status, 401)
  assert.equal((await call('/api/auth/me', { cookie: 'cc_session=' })).status, 401)
})

test('sessions expire after thirty days', async () => {
  const { call, signIn, clock } = await boot()
  const { cookies } = await signIn()
  clock.t += 29 * 864e5
  assert.equal((await call('/api/auth/me', { cookie: cookies })).status, 200)
  clock.t += 2 * 864e5
  assert.equal((await call('/api/auth/me', { cookie: cookies })).status, 401)
})

// ---------- Google ----------

const google = { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'secret' }
const idToken = (claims) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`
const good = (nonce) => ({ iss: 'https://accounts.google.com', aud: google.clientId, exp: 1_800_000_000 + 3600, nonce, email: 'Sam@Example.org', email_verified: true, sub: '1234', name: 'Sam Rao' })

async function googleFlow(overrides = {}, next = '/progress/') {
  let exchanged
  const fetchImpl = async (u, init) => {
    exchanged = { u, body: init.body.toString() }
    return { ok: overrides.tokenFails ? false : true, json: async () => ({ id_token: idToken({ ...good(startNonce), ...overrides.claims }) }) }
  }
  const t = await boot({ google, fetchImpl })
  const start = await t.call(`/api/auth/google/start?next=${encodeURIComponent(next)}`)
  const to = new URL(start.headers.get('location'))
  var startNonce = to.searchParams.get('nonce')
  const state = overrides.state ?? to.searchParams.get('state')
  const cb = await t.call(`/api/auth/google/callback?code=abc&state=${state}`, { cookie: start.cookies })
  return { ...t, start, to, cb, exchanged }
}

test('google: the start redirect carries state, nonce and a PKCE challenge, and its cookie is httpOnly', async () => {
  const { start, to } = await googleFlow()
  assert.equal(start.status, 302)
  assert.equal(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
  assert.equal(to.searchParams.get('client_id'), google.clientId)
  assert.equal(to.searchParams.get('redirect_uri'), `${BASE}/api/auth/google/callback`)
  assert.equal(to.searchParams.get('code_challenge_method'), 'S256')
  for (const k of ['state', 'nonce', 'code_challenge']) assert.ok(to.searchParams.get(k).length >= 20, k)
  assert.match(start.headers.getSetCookie()[0], /^cc_oauth=.+HttpOnly/)
})

test('google: a valid callback signs the person in and lands on the requested page', async () => {
  const { cb, call, exchanged } = await googleFlow()
  assert.equal([cb.status, cb.headers.get('location')].join(' '), '302 /progress/')
  assert.match(exchanged.body, /code_verifier=/)
  const sessionCookie = cb.headers.getSetCookie().find((c) => c.startsWith('cc_session=')).split(';')[0]
  assert.deepEqual((await call('/api/auth/me', { cookie: sessionCookie })).data, { user: { email: 'sam@example.org', name: 'Sam Rao' } })
})

test('google: every way the token can be wrong ends at the login page with no session', async () => {
  const cases = {
    'wrong audience': { claims: { aud: 'someone-else' } },
    'wrong issuer': { claims: { iss: 'https://evil.example' } },
    'replayed nonce': { claims: { nonce: 'other' } },
    'unverified email': { claims: { email_verified: false } },
    'expired token': { claims: { exp: 1 } },
    'bad email': { claims: { email: 'not-an-email' } },
    'token endpoint refuses': { tokenFails: true },
    'wrong state (forged callback)': { state: 'forged-state-value' },
  }
  for (const [name, o] of Object.entries(cases)) {
    const { cb } = await googleFlow(o)
    assert.equal(cb.headers.get('location'), '/login/?error=google-failed', name)
    assert.ok(!cb.headers.getSetCookie().some((c) => c.startsWith('cc_session=') && !c.includes('Max-Age=0')), name)
  }
})

test('google: a callback without our cookie, a user denial and an unconfigured server are all refused', async () => {
  const t = await boot({ google })
  assert.equal((await t.call('/api/auth/google/callback?code=a&state=b')).headers.get('location'), '/login/?error=google-failed')
  assert.equal((await t.call('/api/auth/google/callback?error=access_denied')).headers.get('location'), '/login/?error=google-denied')
  const off = await boot()
  assert.equal((await off.call('/api/auth/google/start')).status, 404)
  assert.deepEqual((await off.call('/api/auth/config')).data, { google: false })
  assert.deepEqual((await t.call('/api/auth/config')).data, { google: true })
})

test('the post-login destination can never leave the site', async () => {
  for (const bad of ['//evil.example', 'https://evil.example', '/\\evil', '/a?b=c', '', undefined, '/../x', `/${'a'.repeat(100)}`]) assert.equal(safeNext(bad), '/coach/', String(bad))
  assert.equal(safeNext('/progress/'), '/progress/')
  const { cb } = await googleFlow({}, '//evil.example')
  assert.equal(cb.headers.get('location'), '/coach/')
})

test('the test-only code endpoint exists only in test mode, and a weak secret is refused', async () => {
  const on = await boot()
  await on.call('/api/auth/otp/request', { method: 'POST', body: { email: 'z@example.org' } })
  assert.match((await on.call('/api/test/otp?email=z@example.org')).data.code, /^\d{6}$/)
  assert.equal((await (await boot({ testMode: false })).call('/api/test/otp?email=z@example.org')).status, 404)
  assert.throws(() => createApp({ baseUrl: BASE, secret: 'short', headers, distDir: dist, mailer: {} }), /SESSION_SECRET/)
})

test('the CSP allows nothing from other origins, and framing, plugins and base tags are shut off', () => {
  const csp = headers.global['Content-Security-Policy']
  assert.ok(!/https?:|\*/.test(csp.replace(/'self'/g, '')), 'no remote origins or wildcards')
  for (const d of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'none'"]) assert.ok(csp.includes(d), d)
})
