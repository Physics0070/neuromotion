// Who is exercising and in which mode. The age bands and limits below are conservative defaults chosen for
// this prototype. They are NOT clinical guidance: a physiotherapist must set the real numbers.
import type { Block } from './session.ts'

export type Mode = 'stroke' | 'prescribed' | 'general'
export type AgeBand = 'child' | 'teen' | 'adult' | 'older' | 'elder'
export type Method = 'world3d' | 'image2d'

export const MODES: { id: Mode; name: string; blurb: string; person: string }[] = [
  { id: 'stroke', name: 'Stroke rehab, with a caregiver', blurb: 'A family member helps. Gentle limits, flags for the physiotherapist to review.', person: 'patient' },
  { id: 'prescribed', name: "Physiotherapist's prescription", blurb: 'Load the plan your physiotherapist saved. The exercises and targets are theirs.', person: 'patient' },
  { id: 'general', name: 'General mobility, on my own', blurb: 'For a healthy adult keeping the shoulder moving. Not for treating an injury.', person: 'you' },
]
export const modeName = (m: Mode) => MODES.find((x) => x.id === m)!.name

export const AGE_RANGE = [1, 110] as const
export const parseAge = (s: string): number | null => {
  const n = Number(s)
  return s.trim() !== '' && Number.isInteger(n) && n >= AGE_RANGE[0] && n <= AGE_RANGE[1] ? n : null
}

export const ageBand = (age: number): AgeBand => (age < 12 ? 'child' : age < 18 ? 'teen' : age < 60 ? 'adult' : age < 75 ? 'older' : 'elder')
export const AGE_LABEL: Record<AgeBand, string> = { child: 'under 12', teen: '12 to 17', adult: '18 to 59', older: '60 to 74', elder: '75 and over' }

export interface Limits { sets: number; reps: number; minRest: number }

const BY_AGE: Record<AgeBand, Limits | null> = {
  child: null, // not supported: a paediatric physiotherapist must supervise
  teen: { sets: 3, reps: 10, minRest: 20 },
  adult: { sets: 10, reps: 30, minRest: 5 },
  older: { sets: 4, reps: 12, minRest: 30 },
  elder: { sets: 3, reps: 8, minRest: 45 },
}
const STROKE: Limits = { sets: 4, reps: 12, minRest: 30 }

/** The tighter of the age limit and the mode limit, or null when the app should not be used. */
export function limitsFor(mode: Mode, band: AgeBand): Limits | null {
  const a = BY_AGE[band]
  if (!a) return null
  if (mode !== 'stroke') return a
  return { sets: Math.min(a.sets, STROKE.sets), reps: Math.min(a.reps, STROKE.reps), minRest: Math.max(a.minRest, STROKE.minRest) }
}

/** Starting values for a new exercise: a gentle session, never above the limits. */
export function defaultsFor(mode: Mode, band: AgeBand): Pick<Block, 'sets' | 'reps' | 'rest'> {
  const l = limitsFor(mode, band) ?? BY_AGE.adult!
  return { sets: Math.min(2, l.sets), reps: Math.min(mode === 'general' ? 8 : 5, l.reps), rest: Math.max(30, l.minRest) }
}

export function clampBlock(b: Block, l: Limits): Block {
  return { ...b, sets: Math.min(b.sets, l.sets), reps: Math.min(b.reps, l.reps), rest: Math.max(b.rest, l.minRest) }
}

/** For a loaded prescription: the physiotherapist has the authority, so this warns and never edits. */
export function warnings(blocks: Block[], l: Limits | null): string[] {
  if (!l) return []
  const out: string[] = []
  blocks.forEach((b, i) => {
    const over: string[] = []
    if (b.sets > l.sets) over.push(`${b.sets} sets (usual limit ${l.sets})`)
    if (b.reps > l.reps) over.push(`${b.reps} reps (usual limit ${l.reps})`)
    if (b.rest < l.minRest) over.push(`${b.rest} s rest (usual minimum ${l.minRest})`)
    if (over.length) out.push(`Exercise ${i + 1} has ${over.join(', ')} for this age and mode. Check with the physiotherapist.`)
  })
  return out
}
