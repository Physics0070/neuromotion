// Same rules as core.py, generalised from one exercise to a library of them.
// Landmarks: name -> [x, y, visibility], image coordinates (y grows downward).
// Angles are 2D image-plane estimates, not goniometer readings.
import type { CueKey } from '../content.ts'
import type { Exercise, Metric } from './exercises.ts'

export const MIN_VIS = 0.6 // SafeCue: below this we make no movement judgment at all

export type Side = 'left' | 'right'
export type Lm = Record<string, readonly [number, number, number]>
export type Cue = CueKey
/** shoulder: trunk to upper arm (0 hanging, 90 horizontal, 180 overhead). elbow: interior angle (180 straight). lean: trunk from vertical. */
export interface Measure { shoulder: number; elbow: number; lean: number }

type V = readonly [number, number]
const vec = (p: V, q: V): V => [q[0] - p[0], q[1] - p[1]]
function angle(a: V, b: V): number | null {
  const na = Math.hypot(a[0], a[1]), nb = Math.hypot(b[0], b[1])
  if (na === 0 || nb === 0) return null
  const c = (a[0] * b[0] + a[1] * b[1]) / (na * nb)
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI
}

export const MIN_TRUNK = 0.12 // the person is too small or too far away below this (fraction of frame height)

/** Null if any needed landmark is unreliable. `aspect` is video width / height: image landmarks are
 *  normalised per axis, so without it every angle is skewed on a 4:3 or 16:9 frame. */
export function measure(lm: Lm, side: Side, aspect = 1): Measure | null {
  const other: Side = side === 'right' ? 'left' : 'right'
  const need = [`${side}_shoulder`, `${side}_elbow`, `${side}_wrist`, `${side}_hip`, `${other}_shoulder`, `${other}_hip`]
  if (need.some((n) => !lm[n] || lm[n][2] < MIN_VIS)) return null
  const p = (n: string): V => [lm[n][0] * aspect, lm[n][1]]
  const trunk = vec(p(`${side}_shoulder`), p(`${side}_hip`))
  if (Math.hypot(trunk[0], trunk[1]) < MIN_TRUNK) return null
  const sh = p(`${side}_shoulder`), el = p(`${side}_elbow`), wr = p(`${side}_wrist`), hip = p(`${side}_hip`)
  const shoulder = angle(vec(sh, hip), vec(sh, el))
  const elbow = angle(vec(el, sh), vec(el, wr))
  const o = p(`${other}_shoulder`), oh = p(`${other}_hip`)
  const sm: V = [(sh[0] + o[0]) / 2, (sh[1] + o[1]) / 2]
  const hm: V = [(hip[0] + oh[0]) / 2, (hip[1] + oh[1]) / 2]
  const lean = Math.abs((Math.atan2(sm[0] - hm[0], hm[1] - sm[1]) * 180) / Math.PI)
  if (shoulder === null || elbow === null) return null
  return { shoulder, elbow, lean }
}

/** MediaPipe world landmarks: metres, origin at the hips, [x, y, z, visibility]. */
export type Lm3 = Record<string, readonly [number, number, number, number]>
type V3 = readonly [number, number, number]
const vec3 = (p: V3, q: V3): V3 => [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
function angle3(a: V3, b: V3): number | null {
  const na = Math.hypot(...a), nb = Math.hypot(...b)
  if (na === 0 || nb === 0) return null
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (na * nb)
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI
}

/** Same three numbers in 3D. A raised arm that points toward the camera still reads correctly, so the
 *  result depends far less on how side-on the person sits. Depth is the model's estimate: still not a goniometer. */
export function measureWorld(lm: Lm3, side: Side): Measure | null {
  const other: Side = side === 'right' ? 'left' : 'right'
  const need = [`${side}_shoulder`, `${side}_elbow`, `${side}_wrist`, `${side}_hip`, `${other}_shoulder`, `${other}_hip`]
  if (need.some((n) => !lm[n] || lm[n][3] < MIN_VIS)) return null
  const p = (n: string): V3 => [lm[n][0], lm[n][1], lm[n][2]]
  const sh = p(`${side}_shoulder`), el = p(`${side}_elbow`), wr = p(`${side}_wrist`), hip = p(`${side}_hip`)
  const shoulder = angle3(vec3(sh, hip), vec3(sh, el))
  const elbow = angle3(vec3(el, sh), vec3(el, wr))
  const o = p(`${other}_shoulder`), oh = p(`${other}_hip`)
  const sm: V3 = [(sh[0] + o[0]) / 2, (sh[1] + o[1]) / 2, (sh[2] + o[2]) / 2]
  const hm: V3 = [(hip[0] + oh[0]) / 2, (hip[1] + oh[1]) / 2, (hip[2] + oh[2]) / 2]
  const tilt = angle3(vec3(hm, sm), [0, -1, 0]) // trunk against vertical (y points down)
  if (shoulder === null || elbow === null || tilt === null) return null
  return { shoulder, elbow, lean: Math.min(tilt, 180 - tilt) }
}

/** Resting offsets measured while the arm hangs still, so a tilted camera or a habitual lean is not scored as movement. */
export interface Calibration { shoulder: number; lean: number }
export const CAL_LIMIT = { shoulder: 30, lean: 20 } as const // beyond this the arm is not at rest / the person is not upright enough to calibrate
export const withCal = (m: Measure, c?: Calibration): Measure =>
  c ? { ...m, shoulder: Math.max(0, m.shoulder - c.shoulder), lean: Math.max(0, m.lean - c.lean) } : m

export const valueOf = (m: Measure, metric: Metric) => (metric === 'shoulder' ? m.shoulder : 180 - m.elbow)

export type Reason = 'trunk lean' | 'bent elbow' | 'upper arm moved'

export interface Rep {
  peak: number
  reachedTarget: boolean
  maxLean: number
  minElbow: number
  maxShoulder: number
  flagged: boolean // "possible compensation, for physiotherapist review" - not a diagnosis
  reasons: Reason[]
}

export interface Rule {
  metric: Metric
  start: number
  rest: number
  target: number
  maxLean: number
  minElbow?: number
  maxShoulder?: number
  alpha?: number
  minPeak?: number // a movement that never gets this high is noise, not a rep (default: start + 15)
}

const MAX_JUMP = 50 // degrees in one frame: faster than any arm moves, so it is a tracking glitch
const MAX_GLITCHES = 3 // after this many in a row the new value is believed

export const ruleFor = (ex: Exercise, target: number): Rule => ({
  metric: ex.metric, start: ex.start, rest: ex.rest, target, ...ex.checks,
})

/** REST -> MOVING (value > start) -> a rep ends when value < rest. Hysteresis avoids jitter. */
export class RepCounter {
  state: 'REST' | 'MOVING' = 'REST'
  reps: Rep[] = []
  private f: number | null = null
  private peak = 0
  private lean = 0
  private elbow = 180
  private shoulder = 0
  private glitches = 0
  private last: Cue = 'ready'

  readonly rule: Rule

  constructor(rule: Rule) {
    this.rule = rule
  }

  private reset() {
    this.peak = 0
    this.lean = 0
    this.elbow = 180
    this.shoulder = 0
  }

  update(m: Measure | null): Cue {
    if (m === null) return 'reposition' // state frozen: never judge on unreliable landmarks
    const v = valueOf(m, this.rule.metric)
    if (this.f !== null && Math.abs(v - this.f) > MAX_JUMP && this.glitches < MAX_GLITCHES) {
      this.glitches++ // one wild frame must not start, end or inflate a repetition
      return this.last
    }
    this.glitches = 0
    return (this.last = this.judge(m, v))
  }

  private judge(m: Measure, v: number): Cue {
    const r = this.rule
    const a = r.alpha ?? 0.4
    const f = this.f === null ? v : a * v + (1 - a) * this.f
    this.f = f
    if (this.state === 'REST') {
      if (f > r.start) {
        this.state = 'MOVING'
        this.reset()
        return 'raise'
      }
      return 'ready'
    }
    this.peak = Math.max(this.peak, f)
    this.lean = Math.max(this.lean, m.lean)
    this.shoulder = Math.max(this.shoulder, m.shoulder)
    if (f > 45) this.elbow = Math.min(this.elbow, m.elbow) // ignore elbow noise near the resting pose
    if (f < r.rest) {
      if (this.peak < (r.minPeak ?? r.start + 15)) {
        this.state = 'REST' // never got far enough to be a repetition
        return 'ready'
      }
      const reasons: Reason[] = []
      if (this.lean > r.maxLean) reasons.push('trunk lean')
      if (r.minElbow !== undefined && this.elbow < r.minElbow) reasons.push('bent elbow')
      if (r.maxShoulder !== undefined && this.shoulder > r.maxShoulder) reasons.push('upper arm moved')
      this.reps.push({
        peak: this.peak, reachedTarget: this.peak >= r.target, maxLean: this.lean, minElbow: this.elbow,
        maxShoulder: this.shoulder, flagged: reasons.length > 0, reasons,
      })
      this.state = 'REST'
      return 'rep_done'
    }
    if (m.lean > r.maxLean) return 'lean'
    if (r.minElbow !== undefined && f > 45 && m.elbow < r.minElbow) return 'elbow'
    if (r.maxShoulder !== undefined && m.shoulder > r.maxShoulder) return 'still'
    return this.peak >= r.target ? 'good' : 'higher'
  }
}

/** One set of one exercise: the unit a session is recorded in. */
export interface SetLog {
  block: number
  set: number // 1-based
  exercise: string
  exerciseName: string
  side: Side
  target: number
  reps: Rep[]
}

const r1 = (x: number) => Math.round(x * 10) / 10

/** FHIR R4 collection Bundle of per-rep Observations, grouped by set. Identifiable only with consent AND an ABHA address.
 *  Codes are local (urn:neuromotion); mapping to NRCeS/SNOMED profiles is future work. */
export interface FhirMeta { mode?: string; ageBand?: string; method?: 'world3d' | 'image2d' }

export function fhirBundle(log: SetLog[], abha?: string, consented = false, at = new Date(), meta: FhirMeta = {}) {
  const methodText = meta.method === 'image2d' ? 'Camera 2D pose estimation' : meta.method === 'world3d' ? 'Camera 3D pose estimation (MediaPipe world landmarks)' : 'Camera pose estimation'
  const now = at.toISOString()
  const entry: { resource: Record<string, unknown> }[] = []
  let subject: Record<string, unknown> | undefined
  if (consented && abha) {
    subject = { identifier: { system: 'https://healthid.ndhm.gov.in', value: abha } }
    entry.push({
      resource: {
        resourceType: 'Consent',
        status: 'active',
        scope: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }] },
        category: [{ coding: [{ system: 'http://loinc.org', code: '59284-0' }] }],
        patient: subject,
        dateTime: now,
      },
    })
  }
  for (const s of log) {
    s.reps.forEach((r, i) => {
      const obs: Record<string, unknown> = {
        resourceType: 'Observation',
        status: 'preliminary',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'therapy' }] }],
        code: {
          coding: [{ system: 'urn:neuromotion', code: `${s.exercise}-peak` }],
          text: `${s.exerciseName} peak, ${s.side} arm, set ${s.set} rep ${i + 1} (camera estimate)`,
        },
        effectiveDateTime: now,
        valueQuantity: { value: r1(r.peak), unit: 'deg', system: 'http://unitsofmeasure.org', code: 'deg' },
        method: { text: `${methodText}; not a clinical goniometer` },
        component: [
          ...(meta.ageBand ? [{ code: { text: 'Age band' }, valueString: meta.ageBand }] : []),
          ...(meta.mode ? [{ code: { text: 'Mode' }, valueString: meta.mode }] : []),
          { code: { text: 'Set number' }, valueInteger: s.set },
          { code: { text: 'Repetition number' }, valueInteger: i + 1 },
          { code: { text: `Target ${s.target} deg reached` }, valueBoolean: r.reachedTarget },
          { code: { text: 'Max trunk lean (deg)' }, valueQuantity: { value: r1(r.maxLean), unit: 'deg' } },
          { code: { text: 'Min elbow angle (deg)' }, valueQuantity: { value: r1(r.minElbow), unit: 'deg' } },
          { code: { text: 'Max upper-arm angle (deg)' }, valueQuantity: { value: r1(r.maxShoulder), unit: 'deg' } },
          { code: { text: 'Possible compensation - for physiotherapist review' }, valueBoolean: r.flagged },
          ...(r.flagged ? [{ code: { text: 'Compensation notes' }, valueString: r.reasons.join(', ') }] : []),
        ],
      }
      if (subject) obs.subject = subject
      entry.push({ resource: obs })
    })
  }
  return { resourceType: 'Bundle', type: 'collection', timestamp: now, entry }
}
