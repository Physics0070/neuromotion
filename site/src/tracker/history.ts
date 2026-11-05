// Sessions are kept on this device only (localStorage). Numbers, no video, no images.
import type { SetLog } from './core.ts'
import type { AgeBand, Method, Mode } from './profile.ts'
import type { Block } from './session.ts'

export interface SessionRecord {
  id: string
  at: string // ISO time the session ended
  durationS: number
  source: 'camera' | 'practice'
  plan: Block[]
  log: SetLog[]
  stoppedForPain: boolean
  shared: boolean // the patient agreed to name the FHIR record
  abha?: string // stored only when shared
  /** Mode and age band only, never the exact age. Absent on sessions saved before profiles existed. */
  profile?: { mode: Mode; ageBand: AgeBand; method: Method }
}

const KEY = 'cc.history.v1'
const MAX = 200

const ok = (r: unknown): r is SessionRecord => {
  const o = r as SessionRecord
  return !!o && typeof o.id === 'string' && typeof o.at === 'string' && Array.isArray(o.log) && Array.isArray(o.plan)
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // blocked, e.g. private mode
  }
}

export function loadHistory(): SessionRecord[] {
  try {
    const raw = storage()?.getItem(KEY)
    const data = raw ? JSON.parse(raw) : []
    return Array.isArray(data) ? data.filter(ok) : []
  } catch {
    return []
  }
}

function write(list: SessionRecord[]): SessionRecord[] {
  try {
    storage()?.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage full or blocked: the session is still shown, just not kept */
  }
  return list
}

export const addSession = (rec: SessionRecord) => write([rec, ...loadHistory()].slice(0, MAX))
export const removeSession = (id: string) => write(loadHistory().filter((r) => r.id !== id))
export const clearHistory = () => write([])

export interface Totals { sets: number; reps: number; reached: number; flagged: number }

export function totals(log: SetLog[]): Totals {
  const reps = log.flatMap((s) => s.reps)
  return { sets: log.length, reps: reps.length, reached: reps.filter((r) => r.reachedTarget).length, flagged: reps.filter((r) => r.flagged).length }
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
