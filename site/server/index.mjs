// Production entry: reads the environment, fails closed when anything needed for real sign-in is missing, then listens.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createApp } from './app.mjs'

const env = process.env
const root = path.resolve(import.meta.dirname, '..')
const production = env.NODE_ENV === 'production'
const port = Number(env.PORT ?? 4400)
const baseUrl = env.BASE_URL ?? `http://127.0.0.1:${port}`
const problems = []

if (production) {
  if (!baseUrl.startsWith('https://')) problems.push('BASE_URL must be the public https address')
  if ((env.SESSION_SECRET ?? '').length < 32) problems.push('SESSION_SECRET must be at least 32 random characters')
  if (!env.SMTP_URL || !env.MAIL_FROM) problems.push('SMTP_URL and MAIL_FROM are needed to send sign-in codes')
  if (env.AUTH_TEST_MODE === '1') problems.push('AUTH_TEST_MODE must not be set in production')
}
if (!!env.GOOGLE_CLIENT_ID !== !!env.GOOGLE_CLIENT_SECRET) problems.push('set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither')
if (problems.length) {
  console.error(`Refusing to start:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
  process.exit(1)
}

let mailer
if (env.SMTP_URL) {
  const { default: nodemailer } = await import('nodemailer')
  const transport = nodemailer.createTransport(env.SMTP_URL)
  mailer = { send: ({ to, subject, text }) => transport.sendMail({ from: env.MAIL_FROM, to, subject, text }) }
} else {
  // Development only: the code is printed here instead of emailed.
  const last = new Map()
  mailer = { last, send: async ({ to, code }) => { last.set(to, code); console.log(`[dev mail] sign-in code for ${to}: ${code}`) } }
}

const app = createApp({
  baseUrl,
  secret: env.SESSION_SECRET ?? 'development-only-secret-change-me',
  headers: JSON.parse(readFileSync(path.join(root, 'security-headers.json'), 'utf8')),
  distDir: path.join(root, 'dist'),
  dbPath: env.DATABASE_PATH ?? path.join(root, 'data', 'app.db'),
  mailer,
  google: env.GOOGLE_CLIENT_ID ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : null,
  testMode: env.AUTH_TEST_MODE === '1',
  trustProxy: env.TRUST_PROXY === '1',
})
app.server.listen(port, env.HOST ?? '0.0.0.0', () => console.log(`NeuroMotion on ${baseUrl} (${production ? 'production' : 'development'})`))
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => app.close().then(() => process.exit(0)))
