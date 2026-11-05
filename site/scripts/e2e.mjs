// End-to-end check of the built site (run `npm run build` first). It starts the real server in test mode on its own port,
// signs in through the real API, and drives a real browser with a fake camera device:
//   node scripts/e2e.mjs            (or pass the address of a server already running with AUTH_TEST_MODE=1)
// Practice mode plays a scripted pose, so no camera or person is needed.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const base = (process.argv[2] ?? 'http://127.0.0.1:4410').replace(/\/$/, '')
const origin = new URL(base).origin
const alive = () => fetch(base).then((r) => r.ok, () => false)
const dbFile = path.join(os.tmpdir(), `cc-e2e-${process.pid}.db`)
let server
if (!(await alive())) {
  server = spawn(process.execPath, ['server/index.mjs'], {
    stdio: 'ignore',
    env: { ...process.env, PORT: new URL(base).port || '4410', BASE_URL: base, AUTH_TEST_MODE: '1', DATABASE_PATH: dbFile, SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-00', NODE_ENV: 'test' },
  })
  for (let i = 0; i < 50 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 200))
}
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
let failed = 0
let n = 0

/** Signs the browser context in through the API, exactly as the login page does. */
async function signIn(page, email = `user${++n}@example.org`) {
  const h = { origin }
  await page.request.post(`${base}/api/auth/otp/request`, { data: { email }, headers: h })
  const { code } = await (await page.request.get(`${base}/api/test/otp?email=${encodeURIComponent(email)}`)).json()
  const r = await page.request.post(`${base}/api/auth/otp/verify`, { data: { email, code }, headers: h })
  assert.equal(r.status(), 200, 'sign-in')
  return email
}

async function run(name, fn, { auth = true } = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript(() => {
    window.__gum = 0
    const md = navigator.mediaDevices
    if (md?.getUserMedia) {
      const orig = md.getUserMedia.bind(md)
      md.getUserMedia = (...a) => { window.__gum++; return orig(...a) }
    }
  })
  const page = await ctx.newPage()
  const errors = [], outside = []
  // MediaPipe tries to send usage logging to Google; the CSP must block it, so only an answered outside request counts.
  page.on('response', (r) => { const u = new URL(r.url()); if (!/^(data|blob):/.test(u.protocol) && u.origin !== origin) outside.push(r.url()) })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/odml.pa.googleapis.com|status of 40[01]/.test(m.text()) && errors.push(m.text()))
  const t0 = Date.now()
  try {
    if (auth) await signIn(page)
    await fn(page, ctx)
    assert.deepEqual(errors, [], `console errors (a CSP violation shows up here): ${errors.join(' | ')}`)
    assert.deepEqual(outside, [], `requests to other origins: ${outside.join(' ')}`)
    console.log(`PASS  ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}\n      ${String(e.message).split('\n')[0]}`)
  }
  await ctx.close()
}

const agree = (page) => page.getByRole('checkbox', { name: /I have checked/ }).check() // the safety check; consent is asked when Start is pressed
const pick = (page, exercise) => page.selectOption('#exercise', { label: exercise })
const btn = (page, name) => page.getByRole('button', { name, exact: true })
const readJson = async (dl) => JSON.parse(await readFile(await dl.path(), 'utf8'))

/** Step 1: pick a mode and give an age, then continue to the workout step. */
async function open(page, { mode = 'General mobility', age = '30' } = {}) {
  await page.goto(`${base}/coach/`)
  await page.locator('.tile', { hasText: mode }).click()
  await page.fill('#age', age)
  await btn(page, 'Continue').click()
  await page.getByRole('heading', { level: 1, name: /workout|prescription/i }).waitFor()
}
/** Step 2 to step 3. */
const toCheck = async (page) => {
  await btn(page, 'Continue').click()
  await page.getByRole('heading', { level: 1, name: 'Before you start.' }).waitFor()
}

/** Replace the default workout with exactly one block (practice mode, rest 5 s, consent given). */
async function setup(page, { exercise, side = 'Right', sets = 1, reps = 1, source = 'Practice mode', abha } = {}) {
  await open(page)
  await page.getByRole('button', { name: 'Remove Shoulder flexion' }).click()
  await pick(page, exercise)
  await btn(page, side).click()
  await page.fill('#sets', String(sets))
  await page.fill('#reps', String(reps))
  await page.fill('#rest', '5')
  await page.getByRole('button', { name: 'Add to workout' }).click()
  await toCheck(page)
  await btn(page, source).click()
  if (abha) await page.fill('#abha', abha)
  await agree(page)
}
/** Press Start, then agree in the consent pop-up (optionally ticking the share box there). */
const start = async (page, { share = false } = {}) => {
  await page.getByRole('button', { name: 'Start the workout' }).click()
  const dialog = page.getByRole('dialog')
  if (share) await dialog.getByRole('checkbox', { name: /Share this session/ }).check()
  await dialog.getByRole('button', { name: 'I agree', exact: true }).click()
}
const summaryRows = (page) => page.locator('tbody tr')

// ---------- pages, theme ----------

await run('pages: the story, the nav, and the removed Project page', async (page) => {
  await page.goto(`${base}/`)
  assert.equal(await page.locator('h1').count(), 1)
  assert.equal(await page.getByRole('link', { name: /project/i }).count(), 0, 'no Project link anywhere')
  assert.equal((await page.request.get(`${base}/project/`)).status(), 404)
  await page.locator('header nav').getByRole('link', { name: 'Coach', exact: true }).click()
  await page.waitForURL('**/coach/')
})

await run('theme: the toggle switches between light and dark, and the choice is remembered', async (page) => {
  await page.goto(`${base}/`)
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme)
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const first = await theme()
  assert.ok(first === 'dark' || first === 'light')
  const before = await bg()
  await page.getByRole('button', { name: /Switch between light and dark theme/ }).click()
  const second = await theme()
  assert.notEqual(second, first)
  assert.notEqual(await bg(), before, 'the page colours changed')
  await page.reload()
  assert.equal(await theme(), second, 'remembered after a reload')
  await page.goto(`${base}/legal/`)
  assert.equal(await theme(), second, 'and on other pages')
})

// ---------- sign-in ----------

await run('sign-in: the gated pages send a signed-out visitor to the login page and back', async (page) => {
  for (const route of ['/coach/', '/progress/', '/validate/']) {
    await page.goto(`${base}${route}`)
    await page.waitForURL(`**/login/?next=${encodeURIComponent(route)}`)
  }
  assert.equal((await page.request.get(`${base}/api/auth/me`)).status(), 401)
}, { auth: false })

await run('sign-in: an email code signs you in; a wrong code is refused; sign out ends the session', async (page, ctx) => {
  await page.goto(`${base}/login/?next=/progress/`)
  assert.equal(await page.getByRole('link', { name: /Continue with Google/ }).count(), 0, 'Google is hidden until the server has credentials')
  await page.fill('#email', 'physio@example.org')
  await btn(page, 'Email me a code').click()
  await page.locator('#otp').waitFor()
  const { code } = await (await page.request.get(`${base}/api/test/otp?email=physio@example.org`)).json()
  await page.fill('#otp', code === '123456' ? '654321' : '123456')
  await btn(page, 'Verify and continue').click()
  await page.getByText('That code is wrong or has expired.').waitFor()
  await page.fill('#otp', code)
  await btn(page, 'Verify and continue').click()
  await page.waitForURL('**/progress/')
  await page.getByText('physio@example.org').first().waitFor()
  let session
  for (let i = 0; i < 20 && !session; i++) {
    session = (await ctx.cookies(base)).find((c) => c.name === 'cc_session')
    if (!session) await page.waitForTimeout(250)
  }
  assert.ok(session?.httpOnly && session.sameSite === 'Lax', `the session cookie is httpOnly and SameSite=Lax: ${JSON.stringify(session)}`)
  await btn(page, 'Sign out').click()
  await page.waitForURL('**/login/')
  assert.equal((await page.request.get(`${base}/api/auth/me`)).status(), 401)
  await page.goto(`${base}/coach/`)
  await page.waitForURL('**/login/?next=%2Fcoach%2F')
}, { auth: false })

await run('sign-in: a hostile next address can never leave the site', async (page) => {
  await page.goto(`${base}/login/?next=//evil.example/x`)
  await page.waitForURL(`${origin}/coach/`)
})

await run('account: deleting it signs you out and removes it from the server', async (page) => {
  await page.goto(`${base}/progress/`)
  await btn(page, 'Delete my account').click()
  await btn(page, 'Yes, delete my account').click()
  await page.waitForURL(/\/login\/$/)
  assert.equal((await page.request.get(`${base}/api/auth/me`)).status(), 401)
})

// ---------- coach: steps ----------

await run('profile: age gates the start, limits follow age and mode, children are refused', async (page) => {
  await page.goto(`${base}/coach/`)
  assert.ok(await btn(page, 'Continue').isDisabled(), 'no age, no continue')
  await page.fill('#age', '8')
  await page.getByText('not for children under 12').waitFor()
  assert.ok(await btn(page, 'Continue').isDisabled())
  await page.fill('#age', '1000')
  await page.getByText('whole number').waitFor()
  await page.locator('.tile', { hasText: 'Stroke rehab' }).click()
  await page.fill('#age', '80')
  await page.getByText('Up to 3 sets, 8 reps per set, at least 45 s rest').waitFor()
  await btn(page, 'Continue').click()
  assert.equal(await page.getAttribute('#reps', 'max'), '8')
  assert.equal(await page.getAttribute('#sets', 'max'), '3')
  assert.equal(await page.getAttribute('#rest', 'min'), '45')
  await toCheck(page)
  await page.getByText('Stroke rehab, with a caregiver').waitFor()
})

await run('steps: the stepper shows where you are and lets you go back', async (page) => {
  await open(page)
  assert.equal(await page.locator('.steps li[data-s="now"]').innerText(), '2\nWorkout')
  await toCheck(page)
  assert.equal(await page.locator('.steps li[data-s="done"]').count(), 2)
  await page.locator('.steps li[data-s="done"]').first().getByRole('button').click()
  await page.getByRole('heading', { level: 1, name: 'Who is exercising?' }).waitFor()
})

await run('profile: a teenager needs a guardian; the prescription mode hides the builder', async (page) => {
  await open(page, { age: '15' })
  await toCheck(page)
  await agree(page)
  assert.ok(await btn(page, 'Start the workout').isDisabled(), 'guardian not confirmed')
  await page.getByRole('checkbox', { name: /parent or guardian/ }).check()
  assert.ok(await btn(page, 'Start the workout').isEnabled())
  await open(page, { mode: 'prescription', age: '50' })
  assert.equal(await page.locator('#exercise').count(), 0, 'no exercise picker in prescription mode')
  assert.equal(await page.locator('.block').count(), 0)
  assert.ok(await btn(page, 'Continue').isDisabled(), 'nothing loaded yet')
})

await run('consent: it pops up on Start; declining or pressing Escape opens no camera', async (page) => {
  await open(page)
  await toCheck(page)
  assert.equal(await page.getByRole('dialog').count(), 0, 'no consent on the setup screen itself')
  await agree(page)
  await btn(page, 'Start the workout').click()
  const dialog = page.getByRole('dialog', { name: 'Consent' })
  await dialog.waitFor()
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => window.__gum), 0, 'Escape is not consent')
  await btn(page, 'Start the workout').click()
  await dialog.getByRole('button', { name: 'I decline', exact: true }).click()
  await page.getByText('Declined. The camera was not opened').waitFor()
  assert.equal(await page.evaluate(() => window.__gum), 0)
  assert.equal(await page.locator('.run-stage').count(), 0, 'still on the setup screen')
})

await run('consent text follows the language (Hindi)', async (page) => {
  await open(page)
  await toCheck(page)
  await btn(page, 'हि').click()
  await page.locator('.side input[type=checkbox]').first().check() // the safety check, whose label is now Hindi
  await btn(page, 'Start the workout').click()
  const p = page.getByRole('dialog').locator('p.consent')
  assert.equal(await p.getAttribute('lang'), 'hi')
  assert.match(await p.innerText(), /सहमत/)
})

await run('builder: choose exercises, remove them, and an empty workout cannot continue', async (page) => {
  await open(page)
  assert.equal(await page.locator('.block').count(), 1)
  assert.equal(await page.locator('#exercise option').count(), 6, 'six exercises in the drop-down')
  await pick(page, 'Elbow flexion')
  assert.equal(await page.inputValue('#target'), '120', 'target follows the exercise default')
  await page.getByRole('button', { name: 'Add to workout' }).click()
  assert.equal(await page.locator('.block').count(), 2)
  await page.getByRole('button', { name: 'Remove Elbow flexion' }).click()
  await page.getByRole('button', { name: 'Remove Shoulder flexion' }).click()
  assert.equal(await page.locator('.block').count(), 0)
  assert.ok(await btn(page, 'Continue').isDisabled())
})

await run('prescription: save, reload the page, load it back; a bad file is rejected', async (page) => {
  await open(page)
  await pick(page, 'Overhead reach')
  await page.fill('#sets', '3')
  await page.getByRole('button', { name: 'Add to workout' }).click()
  const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, 'Save prescription').click()])
  const plan = await readJson(dl)
  assert.equal(plan.format, 'caregiver-coach-plan')
  assert.deepEqual(plan.blocks.map((b) => b.exercise), ['shoulder-flexion', 'overhead-reach'])
  const file = await dl.path()
  await open(page)
  assert.equal(await page.locator('.block').count(), 1)
  await page.setInputFiles('input[type=file]', file)
  await page.locator('.block', { hasText: 'Overhead reach' }).waitFor()
  assert.equal(await page.locator('.block').count(), 2)
  await page.setInputFiles('input[type=file]', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"x"}') })
  await page.getByText('not a NeuroMotion prescription').waitFor()
})

await run('session: sets, reps and rest across two exercises, then a set-by-set summary', async (page) => {
  await open(page)
  await page.getByRole('button', { name: 'Remove Shoulder flexion' }).click()
  for (const [name, sets, reps] of [['Shoulder flexion', 2, 2], ['Elbow flexion', 1, 2]]) {
    await pick(page, name)
    await page.fill('#sets', String(sets))
    await page.fill('#reps', String(reps))
    await page.fill('#rest', '5')
    await page.getByRole('button', { name: 'Add to workout' }).click()
  }
  await toCheck(page)
  await btn(page, 'Practice mode').click()
  await agree(page)
  await start(page)
  await page.getByText('Exercise 1 of 2').waitFor()
  assert.match(await page.locator('.progress-line').innerText(), /Set 1 of 2/)
  await page.locator('.rest').waitFor({ timeout: 60_000 }) // the first set fills, then the rest screen appears
  assert.match(await page.locator('.rest').innerText(), /Next: Set 2 of 2 · Shoulder flexion/)
  await page.getByRole('button', { name: 'Start next set now' }).click()
  await page.locator('.rest').waitFor({ state: 'detached' }) // set 2 is running now
  assert.match(await page.locator('.progress-line').innerText(), /Set 2 of 2/)
  await page.locator('.rest').waitFor({ timeout: 60_000 }) // between exercises
  assert.match(await page.locator('.rest').innerText(), /Elbow flexion/)
  await page.getByRole('button', { name: 'Start next set now' }).click()
  await page.locator('.rest').waitFor({ state: 'detached' })
  await page.getByRole('heading', { name: 'Session summary' }).waitFor({ timeout: 90_000 })
  assert.equal(await summaryRows(page).count(), 3)
  const rows = await summaryRows(page).allInnerTexts()
  assert.match(rows[0], /Shoulder flexion \(right\)\s+1\s+2\/2/)
  assert.match(rows[1], /Shoulder flexion \(right\)\s+2\s+2\/2/)
  assert.match(rows[2], /Elbow flexion \(right\)\s+1\s+2\/2/)
  const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, 'Download FHIR record').click()])
  const bundle = await readJson(dl)
  assert.equal(bundle.entry.length, 6, 'one observation per rep')
  assert.ok(bundle.entry.every((e) => e.resource.resourceType === 'Observation'), 'unnamed record has no Consent')
  const sets = bundle.entry.map((e) => e.resource.component.find((c) => c.code.text === 'Set number').valueInteger)
  assert.deepEqual(sets, [1, 1, 2, 2, 1, 1])
  assert.ok(bundle.entry[5].resource.code.coding[0].code === 'elbow-flexion-peak')
})

await run('progress: the session is saved on the device, charted, and can be deleted', async (page) => {
  await setup(page, { exercise: 'Shoulder abduction', side: 'Left', reps: 2 })
  await start(page)
  await page.getByRole('heading', { name: 'Session summary' }).waitFor({ timeout: 90_000 })
  assert.match((await summaryRows(page).first().innerText()), /Shoulder abduction \(left\)/)
  await page.getByRole('link', { name: 'See progress' }).click()
  await page.waitForURL('**/progress/')
  await page.locator('.history .card').first().waitFor()
  assert.equal(await page.locator('.history .card').count(), 1)
  assert.equal(await page.locator('.trend').count(), 1)
  assert.match(await page.locator('.stats').innerText(), /sessions/i)
  await page.reload()
  await page.locator('.history .card').first().waitFor()
  assert.equal(await page.locator('.history .card').count(), 1, 'history survives a reload')
  await btn(page, 'Delete').click()
  await page.getByText('No sessions yet').waitFor()
})

await run('progress: clear-all asks first', async (page) => {
  await setup(page, { exercise: 'Elbow flexion' })
  await start(page)
  await page.getByRole('heading', { name: 'Session summary' }).waitFor({ timeout: 90_000 })
  await page.goto(`${base}/progress/`)
  await page.locator('.history .card').first().waitFor()
  await btn(page, 'Clear all history').click()
  await btn(page, 'Keep it').click()
  assert.equal(await page.locator('.history .card').count(), 1)
  await btn(page, 'Clear all history').click()
  await btn(page, 'Yes, delete everything').click()
  await page.getByText('No sessions yet').waitFor()
})

await run('named FHIR record: ABHA plus sharing consent adds a Consent resource', async (page) => {
  await setup(page, { exercise: 'Overhead reach', abha: 'demo@abdm' })
  await start(page, { share: true })
  await page.getByRole('heading', { name: 'Session summary' }).waitFor({ timeout: 90_000 })
  const [dl] = await Promise.all([page.waitForEvent('download'), btn(page, 'Download FHIR record').click()])
  const bundle = await readJson(dl)
  assert.deepEqual(bundle.entry.map((e) => e.resource.resourceType).slice(0, 2), ['Consent', 'Observation'])
  assert.ok(JSON.stringify(bundle).includes('demo@abdm'))
})

await run('pain stop: coaching stops and the session records that', async (page) => {
  await setup(page, { exercise: 'Shoulder flexion', reps: 3 })
  await start(page)
  await page.waitForFunction(() => /Reps\s*[1-9]/.test(document.querySelector('.reps')?.textContent ?? ''), null, { timeout: 60_000 })
  await btn(page, 'I have pain: stop').click()
  await page.waitForFunction(() => document.querySelector('.cue-line')?.textContent?.includes('STOP'))
  await btn(page, 'End session').click()
  await page.getByRole('heading', { name: 'Session summary' }).waitFor()
  assert.match(await page.locator('.panel').innerText(), /Stopped for pain/)
})

await run('safety: the start stays locked until the safety check is ticked, and the emergency number is on screen', async (page) => {
  await open(page)
  await page.getByText('Call 108 or 112').first().waitFor()
  await toCheck(page)
  assert.ok(await btn(page, 'Start the workout').isDisabled(), 'safety check not ticked')
  await page.getByText('Complete the safety check.').waitFor()
  await page.getByRole('checkbox', { name: /I have checked/ }).check()
  assert.ok(await btn(page, 'Start the workout').isEnabled())
  await btn(page, 'हि').click()
  await page.getByText('108 या 112').first().waitFor()
})

await run('input checks: a bad ABHA address and an oversized prescription are refused', async (page) => {
  await open(page)
  await page.setInputFiles('input[type=file]', { name: 'big.json', mimeType: 'application/json', buffer: Buffer.alloc(150_000, 32) })
  await page.getByText('too large to be a prescription').waitFor()
  await toCheck(page)
  await agree(page)
  await page.fill('#abha', 'not valid')
  await page.getByText('looks like name@abdm').waitFor()
  assert.ok(await btn(page, 'Start the workout').isDisabled())
  await page.fill('#abha', 'asha.k@abdm')
  assert.ok(await btn(page, 'Start the workout').isEnabled())
})

// ---------- site-wide ----------

await run('headers: every page ships the CSP and the security headers, and no page needs an outside origin', async (page) => {
  for (const route of ['/', '/coach/', '/progress/', '/legal/', '/review/', '/validate/']) {
    const res = await page.goto(`${base}${route}`)
    const h = res.headers()
    assert.match(h['content-security-policy'], /default-src 'self'.*object-src 'none'.*frame-ancestors 'none'/, route)
    assert.equal(h['x-content-type-options'], 'nosniff')
    assert.equal(h['x-frame-options'], 'DENY')
    assert.equal(h['referrer-policy'], 'no-referrer')
    assert.match(h['permissions-policy'], /camera=\(self\)/)
    await page.locator('h1').first().waitFor()
    assert.equal(await page.locator('h1').count(), 1, `${route} has one h1`)
  }
  const api = await page.request.get(`${base}/api/auth/me`)
  assert.equal(api.headers()['cache-control'], 'no-store', 'auth answers are never cached')
})

await run('legal and review pages: privacy, terms, emergency, and every rule listed for sign-off', async (page) => {
  await page.goto(`${base}/legal/`)
  await page.getByRole('heading', { name: 'Privacy notice' }).waitFor()
  await page.getByRole('heading', { name: 'Terms of use' }).waitFor()
  const text = await page.locator('main').innerText()
  assert.match(text, /No analytics, no advertising, no tracking cookies/)
  assert.match(text, /cc_session/, 'the session cookie is disclosed')
  await page.goto(`${base}/review/`)
  assert.equal(await page.locator('h2', { hasText: '2. Exercises and rules' }).count(), 1)
  assert.ok((await page.locator('table').nth(1).locator('tbody tr').count()) === 6, 'six exercises')
  assert.match(await page.locator('main').innerText(), /Pending/, 'sign-offs show as pending until release.json is filled')
  assert.equal(await page.locator('.pilot').count(), 0, 'no pilot banner on any page')
})

await run('validation page: consent first, then the camera; an untracked arm cannot be recorded', async (page) => {
  await page.goto(`${base}/validate/`)
  assert.ok(await btn(page, 'Open the camera').isDisabled())
  assert.equal(await page.evaluate(() => window.__gum), 0)
  await page.getByRole('checkbox').check()
  await btn(page, 'Open the camera').click()
  await page.waitForFunction(() => !document.querySelector('.stage-status') && document.querySelector('video')?.videoWidth > 0, null, { timeout: 90_000 })
  await page.fill('#gonio', '90')
  await btn(page, 'Record reading').click()
  await page.getByText(/not tracked on every recent frame/).waitFor()
  assert.equal(await page.locator('tbody tr').count(), 0, 'nothing recorded')
  await page.fill('#gonio', '')
  await btn(page, 'Record reading').click()
  await page.getByText('Type the goniometer reading').waitFor()
})

await run('camera session: opens the camera, loads the model, asks to reposition with nobody in frame', async (page) => {
  await setup(page, { exercise: 'Shoulder flexion', source: 'My camera' })
  await start(page)
  await page.locator('.run-stage canvas').waitFor()
  await page.waitForFunction(() => !document.querySelector('.stage-status'), null, { timeout: 90_000 })
  await page.waitForFunction(() => document.querySelector('.cue-line')?.textContent?.includes('Move back or turn'), null, { timeout: 60_000 })
  assert.equal(await page.evaluate(() => window.__gum), 1)
  assert.ok((await page.evaluate(() => document.querySelector('video').videoWidth)) > 0, 'video should be streaming')
  await btn(page, 'Finish early').click()
  await page.getByRole('heading', { name: 'Session summary' }).waitFor()
  assert.match(await page.locator('.panel').innerText(), /No repetitions were counted/)
})

await browser.close()
if (server) await new Promise((r) => { server.once('exit', r); server.kill() })
await rm(dbFile, { force: true }).catch(() => {})
console.log(failed ? `\n${failed} failed` : '\nall end-to-end checks passed')
process.exit(failed ? 1 : 0)
