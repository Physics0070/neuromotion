// Accessibility and layout gate: axe-core (any violation fails) and no horizontal overflow, for every page,
// in both themes, on desktop and phone, signed in, including each Coach step and the live session screen.
//   node scripts/a11y.mjs        (starts the real server in test mode on its own port)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const base = (process.argv[2] ?? 'http://127.0.0.1:4420').replace(/\/$/, '')
const origin = new URL(base).origin
const alive = () => fetch(base).then((r) => r.ok, () => false)
const dbFile = path.join(os.tmpdir(), `cc-a11y-${process.pid}.db`)
let server
if (!(await alive())) {
  server = spawn(process.execPath, ['server/index.mjs'], {
    stdio: 'ignore',
    env: { ...process.env, PORT: new URL(base).port || '4420', BASE_URL: base, AUTH_TEST_MODE: '1', DATABASE_PATH: dbFile, SESSION_SECRET: 'a11y-secret-a11y-secret-a11y-secret-0', NODE_ENV: 'test' },
  })
  for (let i = 0; i < 50 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 200))
}
const axe = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const browser = await chromium.launch()
let bad = 0, n = 0

async function signIn(page) {
  const email = `a11y${++n}@example.org`
  await page.request.post(`${base}/api/auth/otp/request`, { data: { email }, headers: { origin } })
  const { code } = await (await page.request.get(`${base}/api/test/otp?email=${email}`)).json()
  await page.request.post(`${base}/api/auth/otp/verify`, { data: { email, code }, headers: { origin } })
}

async function scan(page, label) {
  await page.evaluate(axe) // eval, not a script tag: the CSP forbids inline scripts
  // the scroll frames are aria-hidden pictures of the app, mid-fade at the top of the page, so they are not scanned
  const res = await page.evaluate(() => window.axe.run({ exclude: [['.frame']] }, { resultTypes: ['violations'] }))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  const problems = res.violations.map((v) => `${v.id} (${v.nodes.length})`)
  if (process.env.DETAIL) for (const v of res.violations) for (const nd of v.nodes.slice(0, 4)) console.log('      ', v.id, nd.target.join(' '), (nd.any[0]?.message ?? nd.failureSummary ?? '').slice(0, 150).replace(/\s+/g, ' '))
  if (overflow) problems.push('horizontal overflow')
  if (problems.length) bad++
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${label.padEnd(46)} ${problems.join(', ')}`)
}

const btn = (page, name) => page.getByRole('button', { name, exact: true })

for (const theme of ['dark', 'light']) {
  for (const [vp, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]].filter(([v]) => !process.env.A11Y_VP || v === process.env.A11Y_VP)) {
    const tag = `${theme} ${vp}`
    const ctx = await browser.newContext({ viewport })
    await ctx.addInitScript((t) => localStorage.setItem('cc.theme', t), theme)
    const page = await ctx.newPage()

    // signed out
    for (const route of ['/', '/login/', '/legal/', '/review/']) {
      await page.goto(base + route, { waitUntil: 'load' })
      await page.locator('h1').first().waitFor()
      await scan(page, `${tag} ${route}`)
    }
    await page.goto(`${base}/login/`)
    await page.fill('#email', 'a@example.org')
    await btn(page, 'Email me a code').click()
    await page.locator('#otp').waitFor()
    await scan(page, `${tag} /login/ (code step)`)

    // signed in
    await signIn(page)
    for (const route of ['/progress/', '/validate/']) {
      await page.goto(base + route, { waitUntil: 'load' })
      await page.locator('h1').first().waitFor()
      await scan(page, `${tag} ${route}`)
    }
    await page.goto(`${base}/coach/`)
    await page.locator('h1').first().waitFor()
    await scan(page, `${tag} /coach/ step 1`)
    await page.locator('.tile', { hasText: 'General mobility' }).click()
    await page.fill('#age', '30')
    await btn(page, 'Continue').click()
    await page.getByRole('heading', { level: 1, name: 'Build the workout.' }).waitFor()
    await scan(page, `${tag} /coach/ step 2`)
    await btn(page, 'Continue').click()
    await page.getByRole('heading', { level: 1, name: 'Before you start.' }).waitFor()
    await scan(page, `${tag} /coach/ step 3`)
    await btn(page, 'Practice mode').click()
    await page.getByRole('checkbox', { name: /I have checked/ }).check()
    await btn(page, 'Start the workout').click()
    await page.getByRole('dialog', { name: 'Consent' }).waitFor()
    await scan(page, `${tag} /coach/ consent pop-up`)
    await btn(page, 'I agree').click()
    await page.locator('.run-stage').waitFor()
    await page.waitForTimeout(1500)
    await scan(page, `${tag} /coach/ session`)
    await ctx.close()
  }
}
await browser.close()
if (server) await new Promise((r) => { server.once('exit', r); server.kill() })
await rm(dbFile, { force: true }).catch(() => {})
console.log(bad ? `\n${bad} page states failed` : '\nall page states pass')
process.exit(bad ? 1 : 0)
