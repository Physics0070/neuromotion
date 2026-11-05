// A workout is a list of blocks (an exercise, how many sets and reps, rest between sets).
// The runner walks it: reps are counted per set, rest happens between sets, every set is logged.
import { CAL_LIMIT, RepCounter, ruleFor, withCal, type Calibration, type Cue, type Measure, type SetLog, type Side } from './core.ts'
import { EXERCISES, isExerciseId, type ExerciseId } from './exercises.ts'

export interface Block { exercise: ExerciseId; side: Side; sets: number; reps: number; rest: number; target: number }

export const LIMITS = { sets: [1, 10], reps: [1, 30], rest: [5, 300] } as const
const inRange = (n: unknown, [lo, hi]: readonly [number, number]): n is number => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi

/** Validates untrusted input (a prescription file, saved history). Throws a readable Error. */
export function validateBlock(b: unknown, i = 0): Block {
  const where = `Exercise ${i + 1}`
  if (typeof b !== 'object' || b === null) throw new Error(`${where} is not an object.`)
  const o = b as Record<string, unknown>
  if (!isExerciseId(o.exercise)) throw new Error(`${where}: unknown exercise.`)
  const ex = EXERCISES[o.exercise]
  if (o.side !== 'left' && o.side !== 'right') throw new Error(`${where}: side must be left or right.`)
  if (!inRange(o.sets, LIMITS.sets)) throw new Error(`${where}: sets must be ${LIMITS.sets[0]} to ${LIMITS.sets[1]}.`)
  if (!inRange(o.reps, LIMITS.reps)) throw new Error(`${where}: reps must be ${LIMITS.reps[0]} to ${LIMITS.reps[1]}.`)
  if (!inRange(o.rest, LIMITS.rest)) throw new Error(`${where}: rest must be ${LIMITS.rest[0]} to ${LIMITS.rest[1]} seconds.`)
  if (!inRange(o.target, ex.targetRange)) throw new Error(`${where}: target must be ${ex.targetRange[0]} to ${ex.targetRange[1]} degrees for ${ex.name}.`)
  return { exercise: o.exercise, side: o.side, sets: o.sets, reps: o.reps, rest: o.rest, target: o.target }
}

export const PLAN_FORMAT = 'caregiver-coach-plan'

export function parsePlan(text: string): { name: string; blocks: Block[] } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const o = data as Record<string, unknown> | null
  if (!o || o.format !== PLAN_FORMAT || o.version !== 1) throw new Error('That is not a NeuroMotion prescription (version 1).')
  if (!Array.isArray(o.blocks) || o.blocks.length < 1 || o.blocks.length > 12) throw new Error('A prescription needs 1 to 12 exercises.')
  const name = typeof o.name === 'string' ? o.name.slice(0, 80) : 'Workout'
  return { name, blocks: o.blocks.map(validateBlock) }
}

export const planToJson = (blocks: Block[], name = 'Workout') =>
  JSON.stringify({ format: PLAN_FORMAT, version: 1, name, blocks }, null, 2)

export type Phase = 'calibrating' | 'active' | 'resting' | 'done'

export const CAL_FRAMES = 30 // about a second of a still, upright, hanging arm
const CAL_STILL = 8 // degrees the shoulder may wander during calibration
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

export class SessionRunner {
  readonly log: SetLog[] = []
  phase: Phase = 'active'
  block = 0
  set = 0 // 0-based index of the current set within the block
  stoppedForPain = false
  /** The measurement the counter actually saw this frame (resting offsets removed). */
  adj: Measure | null = null
  /** Resting offsets per arm, filled in by the calibration step. */
  readonly cal: Partial<Record<Side, Calibration>> = {}
  private counter!: RepCounter
  private restEnd = 0
  private samples: Measure[] = []

  readonly plan: Block[]
  readonly calibrate: boolean

  /** `calibrate`: before each arm's first set, hold the arm still at the side for a second so resting offsets can be measured. */
  constructor(plan: Block[], opts: { calibrate?: boolean } = {}) {
    if (plan.length === 0) throw new Error('A workout needs at least one exercise.')
    this.plan = plan
    this.calibrate = !!opts.calibrate
    this.begin()
  }

  get calProgress(): number {
    return this.phase === 'calibrating' ? Math.min(1, this.samples.length / CAL_FRAMES) : 0
  }

  get current(): Block {
    return this.plan[Math.min(this.block, this.plan.length - 1)]
  }
  get repsDone(): number {
    return this.counter.reps.length
  }
  /** What comes after the rest that is running now. */
  get upNext(): { block: Block; set: number } | null {
    return this.phase === 'resting' ? { block: this.current, set: this.set + 1 } : null
  }
  restLeft(now: number): number {
    return Math.max(0, Math.ceil((this.restEnd - now) / 1000))
  }
  skipRest(now: number) {
    if (this.phase === 'resting') this.restEnd = now
  }
  stop() {
    this.stoppedForPain = true
  }

  private begin() {
    const b = this.current
    this.counter = new RepCounter(ruleFor(EXERCISES[b.exercise], b.target))
    this.samples = []
    this.phase = this.calibrate && !this.cal[b.side] ? 'calibrating' : 'active'
    return this.phase
  }

  private calibrating(m: Measure | null): Cue {
    this.adj = m
    if (m === null) return this.restart('reposition')
    if (m.lean > CAL_LIMIT.lean) return this.restart('lean')
    if (m.shoulder > CAL_LIMIT.shoulder) return this.restart('hang')
    this.samples.push(m)
    if (this.samples.length < CAL_FRAMES) return 'hang'
    const sh = this.samples.map((s) => s.shoulder)
    if (Math.max(...sh) - Math.min(...sh) > CAL_STILL) return this.restart('hang') // the arm was swinging
    this.cal[this.current.side] = { shoulder: median(sh), lean: median(this.samples.map((s) => s.lean)) }
    this.samples = []
    this.phase = 'active'
    return 'ready'
  }

  private restart(cue: Cue): Cue {
    this.samples = []
    return cue
  }

  private record() {
    const b = this.current
    this.log.push({
      block: this.block, set: this.set + 1, exercise: b.exercise, exerciseName: EXERCISES[b.exercise].name,
      side: b.side, target: b.target, reps: this.counter.reps.slice(),
    })
  }

  /** Feed one frame's measurement (or null). Returns the cue to show. */
  step(m: Measure | null, now: number): Cue {
    if (this.phase === 'done') return 'set_done'
    if (this.phase === 'resting') {
      if (now < this.restEnd) return 'rest'
      return this.begin() === 'calibrating' ? 'hang' : 'ready'
    }
    if (this.phase === 'calibrating') return this.calibrating(m)
    this.adj = m && withCal(m, this.cal[this.current.side])
    const cue = this.counter.update(this.adj)
    if (this.counter.reps.length >= this.current.reps) {
      this.record()
      const b = this.current
      if (this.set + 1 < b.sets) {
        this.set++
        this.phase = 'resting'
        this.restEnd = now + b.rest * 1000
      } else if (this.block + 1 < this.plan.length) {
        this.block++
        this.set = 0
        this.phase = 'resting'
        this.restEnd = now + b.rest * 1000
      } else {
        this.phase = 'done'
      }
      return 'set_done'
    }
    return cue
  }

  /** Ends the session early or on completion. A set in progress is kept if it has any reps. */
  finish(): SetLog[] {
    if (this.phase === 'active' && this.counter.reps.length > 0) this.record()
    return this.log
  }
}
