// Run: npm test   (Node's built-in runner; the shoulder-flexion cases mirror test_core.py)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CONSENT, CUES } from '../content.ts'
import { MIN_VIS, RepCounter, fhirBundle, measure, measureWorld, ruleFor, valueOf, type Lm, type Lm3, type Side } from './core.ts'
import { AGE_LABEL, ageBand, clampBlock, defaultsFor, limitsFor, parseAge, warnings } from './profile.ts'
import { EXERCISES, EXERCISE_LIST, type ExerciseId } from './exercises.ts'
import { SIM_REP_SECONDS, simulatedPose } from './simulate.ts'
import { SessionRunner, parsePlan, planToJson, validateBlock, type Block } from './session.ts'
import { totals } from './history.ts'
import { cueText } from './cues.ts'

/** Synthetic right-arm pose. shoulder: degrees from hanging. bend: elbow bend. */
function pose(shoulder: number, o: { leanDx?: number; bend?: number; hide?: string } = {}): Lm {
  const { leanDx = 0, bend = 0, hide } = o
  const off = Math.atan2(leanDx, 0.3)
  const t = (shoulder * Math.PI) / 180 - off
  const sh: [number, number] = [0.5 + leanDx, 0.3]
  const el: [number, number] = [sh[0] + 0.2 * Math.sin(t), sh[1] + 0.2 * Math.cos(t)]
  const t2 = t + (bend * Math.PI) / 180
  const wr: [number, number] = [el[0] + 0.2 * Math.sin(t2), el[1] + 0.2 * Math.cos(t2)]
  const lm: Lm = {
    right_shoulder: [...sh, 1], right_elbow: [...el, 1], right_wrist: [...wr, 1], right_hip: [0.5, 0.6, 1],
    left_shoulder: [...sh, 1], left_hip: [0.5, 0.6, 1],
  }
  if (hide) lm[hide] = [lm[hide][0], lm[hide][1], MIN_VIS - 0.1]
  return lm
}

const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) < tol
const steps = (peak: number) => {
  const up = Array.from({ length: Math.ceil(peak / 10) + 1 }, (_, i) => Math.min(i * 10, peak))
  return [...up, ...[...up].reverse().slice(1)]
}
/** One full movement for an exercise. The shoulder exercises sweep the shoulder; the elbow exercise sweeps the bend. */
const sweep = (id: ExerciseId, peak: number, o: { leanDx?: number; elbowBend?: number; drift?: number } = {}) =>
  steps(peak).map((v) =>
    id === 'elbow-flexion' ? pose(o.drift ? o.drift * (v / peak) : 0, { bend: v, leanDx: o.leanDx }) : pose(v, { leanDx: o.leanDx, bend: o.elbowBend }),
  )
const counter = (id: ExerciseId, target?: number) => new RepCounter({ ...ruleFor(EXERCISES[id], target ?? EXERCISES[id].defaultTarget), alpha: 1 })
const run = (c: RepCounter, frames: Lm[], side: Side = 'right') => frames.map((p) => c.update(measure(p, side)))

test('geometry matches the Python app', () => {
  for (const f of [0, 45, 90, 135, 180]) assert.ok(near(measure(pose(f), 'right')!.shoulder, f), String(f))
  assert.ok(near(measure(pose(90), 'right')!.elbow, 180))
  assert.ok(near(measure(pose(90, { bend: 60 }), 'right')!.elbow, 120))
  assert.ok(measure(pose(0), 'right')!.lean < 0.5)
  assert.ok(measure(pose(0, { leanDx: 0.15 }), 'right')!.lean > 25)
})

test('elbow bend is 180 minus the interior angle', () => {
  const m = measure(pose(0, { bend: 60 }), 'right')!
  assert.ok(near(valueOf(m, 'elbowBend'), 60))
  assert.ok(near(valueOf(m, 'shoulder'), 0))
})

test('SafeCue: unreliable landmark means no measurement and a frozen state', () => {
  assert.equal(measure(pose(90, { hide: 'right_wrist' }), 'right'), null)
  const c = counter('shoulder-flexion')
  assert.equal(c.update(null), 'reposition')
  assert.equal(c.state, 'REST')
  assert.equal(c.reps.length, 0)
})

test('every exercise counts a clean rep and reaches its target', () => {
  for (const ex of EXERCISE_LIST) {
    const c = counter(ex.id)
    const cues = run(c, sweep(ex.id, ex.defaultTarget + 10))
    assert.equal(c.reps.length, 1, ex.id)
    assert.ok(c.reps[0].reachedTarget && !c.reps[0].flagged, `${ex.id} should be clean`)
    assert.ok(cues.includes('rep_done') && cues.includes('good'), ex.id)
  }
})

test('a short rep is counted but does not reach the target, and the coach asks for more', () => {
  for (const ex of EXERCISE_LIST) {
    const c = counter(ex.id)
    const cues = run(c, sweep(ex.id, ex.id.startsWith('low-') ? 38 : 60)) // just over the counting threshold, under the target
    assert.equal(c.reps.length, 1, ex.id)
    assert.ok(!c.reps[0].reachedTarget && cues.includes('higher'), ex.id)
  }
})

test('trunk lean is flagged on every exercise', () => {
  for (const ex of EXERCISE_LIST) {
    const c = counter(ex.id)
    const cues = run(c, sweep(ex.id, ex.defaultTarget + 10, { leanDx: 0.15 }))
    assert.ok(c.reps[0].flagged && c.reps[0].reasons.includes('trunk lean') && cues.includes('lean'), ex.id)
  }
})

test('a bent elbow is flagged on the shoulder exercises', () => {
  for (const id of ['shoulder-flexion', 'shoulder-abduction', 'overhead-reach', 'low-forward-raise', 'low-side-raise'] as const) {
    const c = counter(id)
    const cues = run(c, sweep(id, EXERCISES[id].defaultTarget + 10, { elbowBend: -50 }))
    assert.ok(c.reps[0].reasons.includes('bent elbow') && cues.includes('elbow'), id)
  }
})

test('the low raises count a rep at their small target and ignore a tiny movement', () => {
  for (const id of ['low-forward-raise', 'low-side-raise'] as const) {
    const c = counter(id)
    run(c, sweep(id, 55))
    assert.equal(c.reps.length, 1, id)
    assert.ok(c.reps[0].reachedTarget, id)
    const idle = counter(id)
    run(idle, sweep(id, 12))
    assert.equal(idle.reps.length, 0, id)
  }
})

test('elbow flexion flags a moving upper arm, and a still one is clean', () => {
  const moving = counter('elbow-flexion')
  const cues = run(moving, sweep('elbow-flexion', 130, { drift: 45 }))
  assert.ok(moving.reps[0].reasons.includes('upper arm moved') && cues.includes('still'))
  const still = counter('elbow-flexion')
  run(still, sweep('elbow-flexion', 130))
  assert.ok(!still.reps[0].flagged)
})

test('occlusion mid-rep does not end or corrupt the rep; two reps count twice', () => {
  const frames = sweep('shoulder-flexion', 100)
  const c = counter('shoulder-flexion')
  frames.forEach((p, i) => c.update(i === 4 ? null : measure(p, 'right')))
  assert.equal(c.reps.length, 1)
  assert.ok(near(c.reps[0].peak, 100))
  const two = counter('shoulder-flexion')
  run(two, [...sweep('shoulder-flexion', 100), ...sweep('shoulder-flexion', 100)])
  assert.equal(two.reps.length, 2)
})

// ---------- sets, rest, prescriptions ----------

const plan: Block[] = [
  { exercise: 'shoulder-flexion', side: 'right', sets: 2, reps: 2, rest: 5, target: 90 },
  { exercise: 'elbow-flexion', side: 'right', sets: 1, reps: 1, rest: 5, target: 120 },
]

/** Feeds a movement into the runner at 30 fps, returns the cues. */
function drive(r: SessionRunner, frames: Lm[], clock: { now: number }) {
  return frames.map((p) => r.step(measure(p, r.current.side), (clock.now += 33)))
}

test('a workout runs sets in order, rests between them, and logs every set', () => {
  const r = new SessionRunner(plan)
  const clock = { now: 0 }
  assert.equal(r.phase, 'active')
  drive(r, [...sweep('shoulder-flexion', 100), ...sweep('shoulder-flexion', 100)], clock)
  assert.equal(r.log.length, 1)
  assert.equal(r.log[0].reps.length, 2)
  assert.equal(r.phase, 'resting')
  assert.deepEqual([r.upNext!.block.exercise, r.upNext!.set], ['shoulder-flexion', 2])
  assert.equal(r.step(null, clock.now + 100), 'rest')
  assert.equal(r.restLeft(clock.now + 100), 5)
  r.skipRest(clock.now)
  assert.equal(r.step(null, (clock.now += 33)), 'ready')
  assert.equal(r.phase, 'active')
  drive(r, [...sweep('shoulder-flexion', 100), ...sweep('shoulder-flexion', 100)], clock)
  assert.equal(r.log.length, 2)
  assert.equal(r.log[1].set, 2)
  assert.equal(r.block, 1) // moved to the next exercise
  r.skipRest(clock.now)
  r.step(null, (clock.now += 33))
  drive(r, sweep('elbow-flexion', 130), clock)
  assert.equal(r.phase, 'done')
  assert.deepEqual(r.log.map((s) => [s.exercise, s.set, s.reps.length]), [
    ['shoulder-flexion', 1, 2], ['shoulder-flexion', 2, 2], ['elbow-flexion', 1, 1],
  ])
  assert.equal(r.step(null, clock.now + 1), 'set_done')
})

test('rest ends on its own when the timer runs out', () => {
  const r = new SessionRunner([{ ...plan[0], sets: 2, reps: 1, rest: 5 }])
  const clock = { now: 0 }
  drive(r, sweep('shoulder-flexion', 100), clock)
  assert.equal(r.phase, 'resting')
  assert.equal(r.step(null, clock.now + 4000), 'rest')
  assert.equal(r.step(null, clock.now + 5001), 'ready')
  assert.equal(r.phase, 'active')
})

test('ending early keeps the set in progress, and drops an empty one', () => {
  const r = new SessionRunner(plan)
  const clock = { now: 0 }
  assert.equal(r.finish().length, 0)
  drive(r, sweep('shoulder-flexion', 100), clock) // one rep of a two-rep set
  assert.equal(r.finish().length, 1)
  assert.equal(r.log[0].reps.length, 1)
})

test('prescriptions round-trip and reject bad input', () => {
  const parsed = parsePlan(planToJson(plan, 'Morning'))
  assert.equal(parsed.name, 'Morning')
  assert.deepEqual(parsed.blocks, plan)
  assert.throws(() => parsePlan('not json'), /valid JSON/)
  assert.throws(() => parsePlan('{"format":"other","version":1}'), /not a NeuroMotion/)
  assert.throws(() => parsePlan(planToJson([])), /1 to 12/)
  assert.throws(() => validateBlock({ ...plan[0], exercise: 'squat' }), /unknown exercise/)
  assert.throws(() => validateBlock({ ...plan[0], sets: 0 }), /sets/)
  assert.throws(() => validateBlock({ ...plan[0], rest: 1 }), /rest/)
  assert.throws(() => validateBlock({ ...plan[0], target: 20 }), /target/)
  assert.throws(() => validateBlock({ ...plan[0], side: 'both' }), /side/)
  assert.throws(() => validateBlock('x'), /not an object/)
})

test('FHIR record is grouped by set and unnamed unless consent and ABHA are both present', () => {
  const r = new SessionRunner(plan)
  const clock = { now: 0 }
  drive(r, [...sweep('shoulder-flexion', 100, { leanDx: 0.15 }), ...sweep('shoulder-flexion', 100)], clock)
  const log = r.finish()
  const anon = fhirBundle(log, 'demo@abdm', false)
  assert.ok(!JSON.stringify(anon).includes('demo@abdm'))
  assert.equal(anon.entry.length, 2)
  const comps = (i: number) => anon.entry[i].resource.component as { code: { text: string }; valueInteger?: number; valueString?: string }[]
  assert.equal(comps(0).find((c) => c.code.text === 'Set number')!.valueInteger, 1)
  assert.equal(comps(0).find((c) => c.code.text === 'Compensation notes')!.valueString, 'trunk lean')
  assert.ok(!comps(1).some((c) => c.code.text === 'Compensation notes'))
  const named = fhirBundle(log, 'demo@abdm', true)
  assert.deepEqual(named.entry.map((e) => e.resource.resourceType), ['Consent', 'Observation', 'Observation'])
  assert.ok(JSON.stringify(named).includes('shoulder-flexion-peak'))
})

test('history totals count reps, targets reached and flagged reps', () => {
  const r = new SessionRunner(plan)
  const clock = { now: 0 }
  // The runner smooths like the real app, so use a clear margin either side of the 90 degree target.
  drive(r, [...sweep('shoulder-flexion', 130, { leanDx: 0.15 }), ...sweep('shoulder-flexion', 75)], clock)
  assert.deepEqual(totals(r.finish()), { sets: 1, reps: 2, reached: 1, flagged: 1 })
})

// ---------- wording ----------

test('every language has every cue, both consent texts, and every exercise override', () => {
  for (const l of Object.keys(CUES) as (keyof typeof CUES)[]) {
    assert.deepEqual(Object.keys(CUES[l]).sort(), Object.keys(CUES.en).sort())
    assert.ok(CONSENT[l].share.includes('{abha}') && CONSENT[l].use.length > 40)
    for (const ex of EXERCISE_LIST) for (const k of Object.keys(ex.cues) as (keyof typeof CUES.en)[]) assert.ok(ex.cues[k]![l].length > 3, `${ex.id}.${k}.${l}`)
  }
  assert.equal(cueText('en', 'ready', EXERCISES['elbow-flexion']), 'Ready. Bend the elbow and bring the hand up.')
  assert.equal(cueText('hi', 'good', EXERCISES['elbow-flexion']), CUES.hi.good)
})

// ---------- practice mode ----------

test('practice mode exercises a clean, an occluded and a flagged rep for every exercise and both arms', () => {
  for (const ex of EXERCISE_LIST) {
    for (const side of ['right', 'left'] as const) {
      const c = new RepCounter(ruleFor(ex, ex.defaultTarget))
      const cues = new Set<string>()
      for (let t = 0; t < SIM_REP_SECONDS * 3; t += 1 / 30) cues.add(c.update(measure(simulatedPose(t, ex.id, side), side)))
      const tag = `${ex.id} ${side}`
      assert.equal(c.reps.length, 3, tag)
      assert.deepEqual(c.reps.map((r) => r.flagged), [false, false, true], tag)
      assert.ok(c.reps.every((r) => r.reachedTarget), tag)
      assert.ok(cues.has('reposition') && cues.has('good'), tag)
    }
  }
})

// ---------- accuracy ----------

test('angles are corrected for the video aspect ratio', () => {
  // 45 degrees on screen: equal pixel legs, which are unequal in normalised coordinates on a 4:3 frame.
  const L = 0.3, dx = (L * 480) / 640
  const lm: Lm = {
    right_shoulder: [0.5, 0.3, 1], right_hip: [0.5, 0.3 + L, 1], right_elbow: [0.5 + dx, 0.3 + L, 1], right_wrist: [0.5 + dx, 0.3 + 2 * L, 1], left_shoulder: [0.4, 0.3, 1], left_hip: [0.4, 0.6, 1],
  }
  assert.ok(near(measure(lm, 'right', 4 / 3)!.shoulder, 45, 0.6))
  assert.ok(Math.abs(measure(lm, 'right')!.shoulder - 45) > 5, 'without the correction the angle is skewed')
})

test('a person too small in the frame is not measured', () => {
  const lm = pose(90)
  lm.right_hip = [0.5, 0.35, 1] // trunk length 0.05 of the frame
  assert.equal(measure(lm, 'right'), null)
})

test('3D angles do not depend on facing the camera: an arm raised toward the lens still reads 90', () => {
  const w = (x: number, y: number, z: number, v = 1) => [x, y, z, v] as const
  const lm: Lm3 = {
    right_shoulder: w(0, -0.25, 0), right_hip: w(0, 0.25, 0), right_elbow: w(0, -0.25, -0.3), right_wrist: w(0, -0.25, -0.6),
    left_shoulder: w(0.2, -0.25, 0), left_hip: w(0.2, 0.25, 0),
  }
  const m = measureWorld(lm, 'right')!
  assert.ok(near(m.shoulder, 90) && near(m.elbow, 180) && m.lean < 0.5)
  assert.ok(measureWorld({ ...lm, right_wrist: w(0, -0.25, -0.6, MIN_VIS - 0.1) }, 'right') === null, 'SafeCue applies in 3D too')
  const leaned: Lm3 = { ...lm, right_shoulder: w(0.3, -0.25, 0), left_shoulder: w(0.5, -0.25, 0) }
  assert.ok(measureWorld(leaned, 'right')!.lean > 20)
})

test('one wild tracking frame does not start or inflate a repetition; a sustained change is believed', () => {
  const c = counter('shoulder-flexion')
  run(c, [...Array(5).fill(pose(0)), pose(120), ...Array(5).fill(pose(0))])
  assert.equal(c.reps.length, 0)
  assert.equal(c.state, 'REST')
  const d = counter('shoulder-flexion')
  run(d, [...Array(6).fill(pose(0)), ...Array(6).fill(pose(120)), ...sweep('shoulder-flexion', 100).slice(-11)])
  assert.equal(d.reps.length, 1, 'after three frames the new position is accepted')
})

test('a movement that never gets far above the start is noise, not a rep', () => {
  const c = counter('shoulder-flexion')
  run(c, sweep('shoulder-flexion', 40))
  assert.equal(c.reps.length, 0)
  assert.equal(c.state, 'REST')
  run(c, sweep('shoulder-flexion', 100))
  assert.equal(c.reps.length, 1)
})

test('calibration measures the resting arm and trunk, then removes them', () => {
  const r = new SessionRunner(plan, { calibrate: true })
  const clock = { now: 0 }
  assert.equal(r.phase, 'calibrating')
  // the arm moving about is not rest
  assert.equal(r.step(measure(pose(60), 'right'), (clock.now += 33)), 'hang')
  assert.equal(r.step(null, (clock.now += 33)), 'reposition')
  assert.equal(r.step(measure(pose(0, { leanDx: 0.15 }), 'right'), (clock.now += 33)), 'lean')
  assert.equal(r.phase, 'calibrating')
  // a camera that reads 12 degrees at rest, and a person who sits about 11 degrees off upright
  for (let i = 0; i < 40; i++) r.step(measure(pose(12, { leanDx: 0.06 }), 'right'), (clock.now += 33))
  assert.equal(r.phase, 'active')
  r.step(measure(pose(12, { leanDx: 0.06 }), 'right'), (clock.now += 33))
  assert.ok(r.adj!.shoulder < 1 && r.adj!.lean < 1, `${r.adj!.shoulder} ${r.adj!.lean}`)
  assert.ok(r.cal.right!.shoulder > 5)
})

test('a swinging arm cannot calibrate', () => {
  const r = new SessionRunner(plan, { calibrate: true })
  let now = 0
  for (let i = 0; i < 60; i++) r.step(measure(pose(i % 2 ? 2 : 14), 'right'), (now += 33))
  assert.equal(r.phase, 'calibrating')
})

test('calibration is per arm: a block on the other arm calibrates again after the rest', () => {
  const two: Block[] = [
    { exercise: 'shoulder-flexion', side: 'right', sets: 1, reps: 1, rest: 5, target: 90 },
    { exercise: 'shoulder-flexion', side: 'left', sets: 1, reps: 1, rest: 5, target: 90 },
  ]
  const r = new SessionRunner(two, { calibrate: true })
  const clock = { now: 0 }
  for (let i = 0; i < 40; i++) r.step(measure(pose(0), 'right'), (clock.now += 33))
  drive(r, sweep('shoulder-flexion', 100), clock)
  assert.equal(r.phase, 'resting')
  r.skipRest(clock.now)
  assert.equal(r.step(null, (clock.now += 33)), 'hang')
  assert.equal(r.phase, 'calibrating')
})

// ---------- profile ----------

test('age is parsed strictly and mapped to bands', () => {
  assert.equal(parseAge(''), null)
  assert.equal(parseAge('abc'), null)
  assert.equal(parseAge('0'), null)
  assert.equal(parseAge('4.5'), null)
  assert.equal(parseAge('111'), null)
  assert.equal(parseAge('62'), 62)
  assert.deepEqual([5, 11, 12, 17, 18, 59, 60, 74, 75, 100].map((a) => ageBand(a)), ['child', 'child', 'teen', 'teen', 'adult', 'adult', 'older', 'older', 'elder', 'elder'])
  assert.ok(Object.values(AGE_LABEL).every(Boolean))
})

test('limits get gentler with age and in stroke mode, and children are not supported', () => {
  assert.equal(limitsFor('general', 'child'), null)
  assert.equal(limitsFor('stroke', 'child'), null)
  assert.deepEqual(limitsFor('general', 'adult'), { sets: 10, reps: 30, minRest: 5 })
  assert.deepEqual(limitsFor('stroke', 'adult'), { sets: 4, reps: 12, minRest: 30 })
  assert.deepEqual(limitsFor('stroke', 'elder'), { sets: 3, reps: 8, minRest: 45 })
  assert.deepEqual(limitsFor('general', 'teen'), { sets: 3, reps: 10, minRest: 20 })
})

test('defaults sit inside the limits, clamping fixes a block, and a prescription only gets warnings', () => {
  for (const mode of ['stroke', 'prescribed', 'general'] as const) {
    for (const band of ['teen', 'adult', 'older', 'elder'] as const) {
      const l = limitsFor(mode, band)!
      const d = defaultsFor(mode, band)
      assert.ok(d.sets <= l.sets && d.reps <= l.reps && d.rest >= l.minRest, `${mode} ${band}`)
    }
  }
  const big: Block = { exercise: 'shoulder-flexion', side: 'right', sets: 9, reps: 25, rest: 5, target: 90 }
  const l = limitsFor('stroke', 'elder')!
  assert.deepEqual(clampBlock(big, l), { ...big, sets: 3, reps: 8, rest: 45 })
  assert.equal(warnings([plan[0]], limitsFor('general', 'adult')).length, 0)
  assert.equal(warnings([big], l).length, 1)
  assert.deepEqual(big, { exercise: 'shoulder-flexion', side: 'right', sets: 9, reps: 25, rest: 5, target: 90 })
})

test('the FHIR record carries mode, age band and method only when given', () => {
  const r = new SessionRunner(plan)
  const clock = { now: 0 }
  drive(r, sweep('shoulder-flexion', 100), clock)
  const first = (b: ReturnType<typeof fhirBundle>) => JSON.stringify(b.entry[0].resource)
  const plain = first(fhirBundle(r.finish()))
  assert.ok(!plain.includes('Age band'))
  const tagged = first(fhirBundle(r.finish(), undefined, false, new Date(), { mode: 'stroke', ageBand: '60 to 74', method: 'world3d' }))
  assert.ok(tagged.includes('Age band') && tagged.includes('60 to 74') && tagged.includes('3D pose estimation'))
})
