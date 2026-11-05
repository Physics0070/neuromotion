// Goniometer validation: the physiotherapist reads a goniometer while the arm is held still, the app records
// what it measured at the same moment. The mean absolute error decides whether the angle can be relied on.
import { VALIDATION_MAX_MAE, VALIDATION_MIN_PAIRS } from '../release.ts'
import type { Side } from './core.ts'
import type { Method } from './profile.ts'

export type Joint = 'shoulder' | 'elbowBend'
export interface Pair { at: string; joint: Joint; side: Side; method: Method; app: number; gonio: number }

export const WINDOW = 15 // frames averaged per reading (about half a second)
export const STEADY = 6 // degrees the arm may wander across those frames

const r1 = (x: number) => Math.round(x * 10) / 10
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

/** One reading from the last frames, or why it cannot be taken. */
export function steadyReading(frames: (number | null)[]): { value: number } | { error: string } {
  const last = frames.slice(-WINDOW)
  if (last.length < WINDOW || last.some((v) => v === null)) return { error: 'The arm was not tracked on every recent frame. Keep the whole arm and body in view and try again.' }
  const v = last as number[]
  if (Math.max(...v) - Math.min(...v) > STEADY) return { error: `The arm moved more than ${STEADY}°. Hold it still and try again.` }
  return { value: r1(median(v)) }
}

export interface Stats { n: number; mae: number; bias: number; sd: number; maxAbs: number }

export function stats(pairs: Pair[]): Stats | null {
  if (pairs.length === 0) return null
  const e = pairs.map((p) => p.app - p.gonio)
  const mean = e.reduce((a, x) => a + x, 0) / e.length
  const sd = e.length > 1 ? Math.sqrt(e.reduce((a, x) => a + (x - mean) ** 2, 0) / (e.length - 1)) : 0
  return { n: e.length, mae: r1(e.reduce((a, x) => a + Math.abs(x), 0) / e.length), bias: r1(mean), sd: r1(sd), maxAbs: r1(Math.max(...e.map(Math.abs))) }
}

export type Verdict = 'more-readings' | 'pass' | 'fail'
export const verdict = (s: Stats | null): Verdict => (!s || s.n < VALIDATION_MIN_PAIRS ? 'more-readings' : s.mae <= VALIDATION_MAX_MAE ? 'pass' : 'fail')

export const toCsv = (pairs: Pair[]) =>
  ['time,joint,arm,method,app_deg,goniometer_deg,error_deg', ...pairs.map((p) => [p.at, p.joint, p.side, p.method, p.app, p.gonio, r1(p.app - p.gonio)].join(','))].join('\n') + '\n'

/** The block to paste into src/release.json once the verdict is a pass. */
export const releaseSnippet = (s: Stats, method: Method, date: string) =>
  JSON.stringify({ validation: { n: s.n, maeDeg: s.mae, date, method } }, null, 2)

const KEY = 'cc.validation.v1'
const store = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
const okPair = (p: unknown): p is Pair => {
  const o = p as Pair
  return !!o && typeof o.at === 'string' && (o.joint === 'shoulder' || o.joint === 'elbowBend') && Number.isFinite(o.app) && Number.isFinite(o.gonio)
}
export function loadPairs(): Pair[] {
  try {
    const d = JSON.parse(store()?.getItem(KEY) ?? '[]')
    return Array.isArray(d) ? d.filter(okPair).slice(0, 500) : []
  } catch {
    return []
  }
}
export function savePairs(pairs: Pair[]): Pair[] {
  try {
    store()?.setItem(KEY, JSON.stringify(pairs))
  } catch {
    /* blocked or full: the readings stay on screen */
  }
  return pairs
}
