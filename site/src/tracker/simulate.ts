import type { Lm, Side } from './core.ts'
import type { ExerciseId } from './exercises.ts'

export const SIM_REP_SECONDS = 4.5

/** Synthetic landmarks so the app can be tried without a camera (practice mode).
 *  Rep 1 is clean, rep 2 loses sight of the wrist briefly, rep 3 breaks the exercise's own rule
 *  (trunk lean and a bent elbow, or for the elbow exercise a drifting upper arm), then it repeats.
 *  `t` is seconds since the set began. A scripted pose, not a measurement of anyone. */
export function simulatedPose(t: number, exercise: ExerciseId, side: Side): Lm {
  const idx = Math.floor(t / SIM_REP_SECONDS)
  const u = (t % SIM_REP_SECONDS) / SIM_REP_SECONDS
  const lift = Math.sin(Math.PI * u) ** 2 // 0 -> 1 -> 0
  const kind = idx % 3
  const elbowEx = exercise === 'elbow-flexion'
  const peak = exercise === 'overhead-reach' ? 170 : exercise.startsWith('low-') ? 65 : 100

  const shoulderDeg = elbowEx ? (kind === 2 ? 40 * lift : 0) : peak * lift
  const bendDeg = elbowEx ? 130 * lift : kind === 2 ? 40 * lift : 0
  const leanDx = kind === 2 && !elbowEx ? 0.14 * lift : 0
  const wristSeen = !(kind === 1 && u > 0.3 && u < 0.45)

  const dir = side === 'right' ? 1 : -1
  const other: Side = side === 'right' ? 'left' : 'right'
  const off = Math.atan2(leanDx, 0.3) // the shoulder angle is measured against the (leaned) trunk
  const a = (shoulderDeg * Math.PI) / 180 - off
  const sh: [number, number] = [0.5 + dir * leanDx, 0.3]
  const el: [number, number] = [sh[0] + dir * 0.2 * Math.sin(a), sh[1] + 0.2 * Math.cos(a)]
  const b = a + (bendDeg * Math.PI) / 180
  const wr: [number, number] = [el[0] + dir * 0.2 * Math.sin(b), el[1] + 0.2 * Math.cos(b)]
  const gap = 0.14 * dir
  return {
    [`${side}_shoulder`]: [...sh, 1], [`${side}_elbow`]: [...el, 1], [`${side}_wrist`]: [...wr, wristSeen ? 1 : 0.3], [`${side}_hip`]: [0.5, 0.6, 1],
    [`${other}_shoulder`]: [sh[0] - gap, sh[1], 1], [`${other}_hip`]: [0.5 - gap, 0.6, 1],
    [`${other}_elbow`]: [sh[0] - gap, sh[1] + 0.2, 1], [`${other}_wrist`]: [sh[0] - gap, sh[1] + 0.4, 1],
  }
}
