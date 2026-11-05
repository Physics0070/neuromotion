// The whole backend: serves the built site and a small auth API (email one-time codes, Google sign-in, sessions).
// It stores only an email, an optional name and the sign-in times. Exercise sessions never reach it.
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const OTP_TTL_MS = 10 * 60_000
export const OTP_MAX_ATTEMPTS = 5
export const SESSION_TTL_MS = 30 * 864e5
const HOUR = 3_600_000

const EMAIL = /^[^\s@]{1,64}@[^\s@.][^\s@]{0,250}\.[^\s@]{2,}$/
const NEXT_OK = /^\/[a-z0-9/_-]*$/i
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.task': 'application/octet-stream', '.woff2': 'font/woff2', '.woff': 'font/woff',
}

/** Only same-site paths are allowed as a post-login destination: no open redirect. */
export const safeNext = (n) => (typeof n === 'string' && n.length < 80 && NEXT_OK.test(n) && !n.startsWith('//') ? n : '/coach/')
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

export function createApp(o) {
  const { baseUrl, secret, headers, distDir, mailer, google = null, dbPath = ':memory:', fetchImpl = fetch, now = Date.now, testMode = false, trustProxy = false } = o
  if (!secret || secret.length < 16) throw new Error('SESSION_SECRET is too short')
  const origin = new URL(baseUrl).origin
  const secure = origin.startsWith('https:')
  const ipScale = testMode ? 1000 : 1 // the browser tests sign in dozens of times from one address

  const db = new DatabaseSync(dbPath)
  db.exec(`
    pragma foreign_keys = on;
    create table if not exists users (id integer primary key, email text unique not null, name text, provider text not null, google_sub text unique, created_at integer not null, last_login integer not null);
    create table if not exists sessions (token_hash text primary key, user_id integer not null references users(id) on delete cascade, expires_at integer not null);
    create table if not exists otps (email text primary key, hash text not null, expires_at integer not null, attempts integer not null default 0);
  `)
  if (dbPath !== ':memory:') db.exec('pragma journal_mode = wal')
  const q = {
    userByEmail: db.prepare('select * from users where email = ?'),
    userBySub: db.prepare('select * from users where google_sub = ?'),
    addUser: db.prepare('insert into users (email, name, provider, google_sub, created_at, last_login) values (?, ?, ?, ?, ?, ?) returning *'),
    touchUser: db.prepare('update users set last_login = ?, name = coalesce(name, ?), google_sub = coalesce(google_sub, ?) where id = ?'),
    addSession: db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)'),
    session: db.prepare('select u.id, u.email, u.name, s.expires_at from sessions s join users u on u.id = s.user_id where s.token_hash = ?'),
    dropSession: db.prepare('delete from sessions where token_hash = ?'),
    setOtp: db.prepare('insert or replace into otps (email, hash, expires_at, attempts) values (?, ?, ?, 0)'),
    otp: db.prepare('select * from otps where email = ?'),
    bumpOtp: db.prepare('update otps set attempts = attempts + 1 where email = ?'),
    dropOtp: db.prepare('delete from otps where email = ?'),
    dropUser: db.prepare('delete from users where id = ?'),
    sweep: db.prepare('delete from sessions where expires_at < ?'),
    sweepOtp: db.prepare('delete from otps where expires_at < ?'),
  }

  // ---- rate limits (one instance: in memory; use a shared store if you run several) ----
  const hits = new Map()
  const allow = (key, limit, windowMs) => {
    const t = now()
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs)
    if (recent.length >= limit) return false
    hits.set(key, [...recent, t])
    return true
  }

  // ---- helpers ----
  const sign = (obj) => {
    const body = Buffer.from(JSON.stringify(obj)).toString('base64url')
    return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`
  }
  const unsign = (s) => {
    const [body, mac] = String(s ?? '').split('.')
    if (!body || !mac) return null
    const want = crypto.createHmac('sha256', secret).update(body).digest('base64url')
    if (!same(mac, want)) return null
    try { return JSON.parse(Buffer.from(body, 'base64url').toString()) } catch { return null }
  }
  const cookies = (req) => Object.fromEntries(String(req.headers.cookie ?? '').split(';').map((c) => c.trim().split(/=(.*)/s).slice(0, 2)).filter((p) => p[0]))
  const cookie = (name, value, maxAgeS, p = '/') => `${name}=${value}; Path=${p}; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${secure ? '; Secure' : ''}`
  const ip = (req) => (trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown'

  const send = (res, status, body, extra = {}) => {
    res.writeHead(status, { ...headers.global, ...extra })
    res.end(body)
  }
  const json = (res, status, obj, extra = {}) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra })
  const redirect = (res, to, extra = {}) => send(res, 302, '', { Location: to, 'Cache-Control': 'no-store', ...extra })

  const readJson = (req) => new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] ?? '').includes('application/json')) return reject(Object.assign(new Error('type'), { status: 415 }))
    let n = 0
    const chunks = []
    req.on('data', (c) => {
      n += c.length
      if (n > 4096) reject(Object.assign(new Error('size'), { status: 413 })) // keep draining: destroying the socket would swallow the reply
      else chunks.push(c)
    })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')) } catch { reject(Object.assign(new Error('json'), { status: 400 })) } })
    req.on('error', reject)
  })

  const currentUser = (req) => {
    const tok = cookies(req).cc_session
    if (!tok) return null
    const row = q.session.get(sha(tok))
    if (!row) return null
    if (row.expires_at < now()) { q.dropSession.run(sha(tok)); return null }
    return row
  }
  const startSession = (res, user, extra = {}) => {
    const tok = crypto.randomBytes(32).toString('base64url')
    q.addSession.run(sha(tok), user.id, now() + SESSION_TTL_MS)
    q.sweep.run(now())
    return [cookie('cc_session', tok, SESSION_TTL_MS / 1000), ...(extra.set ?? [])]
  }
  const upsert = ({ email, name = null, sub = null, provider }) => {
    const t = now()
    let u = (sub && q.userBySub.get(sub)) || q.userByEmail.get(email)
    if (u) q.touchUser.run(t, name, sub, u.id)
    else u = q.addUser.get(email, name, provider, sub, t, t)
    return u
  }

  // ---- routes ----
  const routes = {
    'GET /api/auth/config': (req, res) => json(res, 200, { google: !!google }),

    'GET /api/auth/me': (req, res) => {
      const u = currentUser(req)
      return u ? json(res, 200, { user: { email: u.email, name: u.name } }) : json(res, 401, { error: 'signed-out' })
    },

    'POST /api/auth/otp/request': async (req, res) => {
      const { email: raw } = await readJson(req)
      const email = String(raw ?? '').trim().toLowerCase()
      if (email.length > 254 || !EMAIL.test(email)) return json(res, 400, { error: 'bad-email' })
      if (!allow(`otp-email:${email}`, 5, HOUR) || !allow(`otp-ip:${ip(req)}`, 20 * ipScale, HOUR)) return json(res, 429, { error: 'slow-down' })
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
      q.sweepOtp.run(now())
      q.setOtp.run(email, crypto.createHmac('sha256', secret).update(`${email}:${code}`).digest('hex'), now() + OTP_TTL_MS)
      await mailer.send({ to: email, code, subject: 'Your NeuroMotion sign-in code', text: `Your sign-in code is ${code}.\nIt expires in 10 minutes. If you did not ask for it, ignore this email.\n` })
      return json(res, 200, { ok: true }) // the same answer whether or not the address has an account
    },

    'POST /api/auth/otp/verify': async (req, res) => {
      const { email: raw, code: rawCode } = await readJson(req)
      const email = String(raw ?? '').trim().toLowerCase(), code = String(rawCode ?? '').trim()
      if (!allow(`verify-ip:${ip(req)}`, 30 * ipScale, HOUR)) return json(res, 429, { error: 'slow-down' })
      const bad = () => json(res, 400, { error: 'bad-code' })
      const row = EMAIL.test(email) ? q.otp.get(email) : undefined
      if (!row || row.expires_at < now() || !/^\d{6}$/.test(code)) return bad()
      if (row.attempts >= OTP_MAX_ATTEMPTS) { q.dropOtp.run(email); return json(res, 429, { error: 'too-many' }) }
      q.bumpOtp.run(email)
      const want = crypto.createHmac('sha256', secret).update(`${email}:${code}`).digest('hex')
      if (!same(row.hash, want)) return bad()
      q.dropOtp.run(email)
      const user = upsert({ email, provider: 'email' })
      return json(res, 200, { user: { email: user.email, name: user.name } }, { 'Set-Cookie': startSession(res, user) })
    },

    'POST /api/auth/logout': (req, res) => {
      const tok = cookies(req).cc_session
      if (tok) q.dropSession.run(sha(tok))
      return json(res, 200, { ok: true }, { 'Set-Cookie': cookie('cc_session', '', 0) })
    },

    'POST /api/auth/delete': (req, res) => {
      const u = currentUser(req)
      if (!u) return json(res, 401, { error: 'signed-out' })
      q.dropOtp.run(u.email)
      q.dropUser.run(u.id) // sessions go with it
      return json(res, 200, { ok: true }, { 'Set-Cookie': cookie('cc_session', '', 0) })
    },

    'GET /api/auth/google/start': (req, res, url) => {
      if (!google) return json(res, 404, { error: 'not-configured' })
      const state = crypto.randomBytes(16).toString('base64url'), nonce = crypto.randomBytes(16).toString('base64url'), verifier = crypto.randomBytes(32).toString('base64url')
      const to = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      to.search = new URLSearchParams({
        client_id: google.clientId, redirect_uri: `${origin}/api/auth/google/callback`, response_type: 'code', scope: 'openid email profile',
        state, nonce, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account',
      }).toString()
      const next = safeNext(url.searchParams.get('next'))
      return redirect(res, to.toString(), { 'Set-Cookie': cookie('cc_oauth', sign({ state, nonce, verifier, next, exp: now() + 600_000 }), 600, '/api/auth/google') })
    },

    'GET /api/auth/google/callback': async (req, res, url) => {
      const clear = cookie('cc_oauth', '', 0, '/api/auth/google')
      const fail = (why) => redirect(res, `/login/?error=${why}`, { 'Set-Cookie': clear })
      if (!google) return json(res, 404, { error: 'not-configured' })
      if (url.searchParams.get('error')) return fail('google-denied')
      const saved = unsign(cookies(req).cc_oauth)
      const state = url.searchParams.get('state'), code = url.searchParams.get('code')
      if (!saved || saved.exp < now() || !state || !code || !same(String(saved.state), state)) return fail('google-failed')
      let claims
      try {
        const r = await fetchImpl('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: google.clientId, client_secret: google.clientSecret, redirect_uri: `${origin}/api/auth/google/callback`, grant_type: 'authorization_code', code_verifier: saved.verifier }),
        })
        if (!r.ok) return fail('google-failed')
        // The ID token came straight from Google over TLS in exchange for our secret, so its claims are checked, not re-signed.
        claims = JSON.parse(Buffer.from(String((await r.json()).id_token).split('.')[1], 'base64url').toString())
      } catch {
        return fail('google-failed')
      }
      const okIss = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com'
      if (!okIss || claims.aud !== google.clientId || !(claims.exp * 1000 > now()) || claims.nonce !== saved.nonce || claims.email_verified !== true || !EMAIL.test(String(claims.email))) return fail('google-failed')
      const user = upsert({ email: String(claims.email).toLowerCase(), name: typeof claims.name === 'string' ? claims.name.slice(0, 100) : null, sub: String(claims.sub), provider: 'google' })
      return redirect(res, safeNext(saved.next), { 'Set-Cookie': [...startSession(res, user), clear] })
    },
  }
  if (testMode) routes['GET /api/test/otp'] = (req, res, url) => json(res, 200, { code: mailer.last?.get(String(url.searchParams.get('email'))) ?? null })

  // ---- static site ----
  const root = path.resolve(distDir)
  const cacheFor = (p) => (p.startsWith('/assets/') ? headers.assets : /^\/(models|mediapipe)\//.test(p) ? headers.models : p === '/sw.js' ? headers.worker : 'no-cache')
  const serveFile = (req, res, file, status, cache) => {
    const type = TYPES[path.extname(file)] ?? 'application/octet-stream'
    const size = fs.statSync(file).size
    res.writeHead(status, { ...headers.global, 'Content-Type': type, 'Content-Length': size, 'Cache-Control': cache })
    if (req.method === 'HEAD') return res.end()
    fs.createReadStream(file).pipe(res)
  }
  const serveStatic = (req, res, pathname) => {
    let p
    try { p = decodeURIComponent(pathname) } catch { return send(res, 400, 'Bad request') }
    if (p.includes('\0') || p.includes('..')) return send(res, 400, 'Bad request')
    const file = path.join(root, path.normalize(p.endsWith('/') ? `${p}index.html` : p))
    if (file !== root && !file.startsWith(root + path.sep)) return send(res, 403, 'Forbidden')
    try {
      const st = fs.statSync(file)
      if (st.isFile()) return serveFile(req, res, file, 200, cacheFor(p))
      if (st.isDirectory()) return redirect(res, `${p}/`)
    } catch { /* falls through to the 404 page */ }
    const missing = path.join(root, '404.html')
    return fs.existsSync(missing) ? serveFile(req, res, missing, 404, 'no-cache') : send(res, 404, 'Not found')
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', origin)
      if (url.pathname.startsWith('/api/')) {
        const handler = routes[`${req.method} ${url.pathname}`]
        if (!handler) return json(res, 404, { error: 'not-found' })
        // Cookies ride along on cross-site requests, so every write must come from our own pages.
        if (req.method === 'POST' && req.headers.origin !== origin) return json(res, 403, { error: 'bad-origin' })
        return await handler(req, res, url)
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' })
      return serveStatic(req, res, url.pathname)
    } catch (e) {
      if (res.headersSent) return res.end()
      const status = e && typeof e.status === 'number' ? e.status : 500
      return json(res, status, { error: status === 500 ? 'server' : 'bad-request' })
    }
  })
  return { server, db, close: () => new Promise((r) => server.close(() => { db.close(); r() })) }
}
