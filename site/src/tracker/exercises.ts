import type { Lang } from '../content.ts'
import type { CueKey } from '../content.ts'

export type ExerciseId = 'shoulder-flexion' | 'shoulder-abduction' | 'elbow-flexion' | 'overhead-reach' | 'low-forward-raise' | 'low-side-raise'
export type Metric = 'shoulder' | 'elbowBend'

export interface Exercise {
  id: ExerciseId
  name: string
  metricLabel: string
  view: 'Side view' | 'Front view'
  blurb: string
  placement: string
  metric: Metric
  start: number // a repetition begins when the value passes this
  rest: number //  and ends when it drops below this (hysteresis against jitter)
  defaultTarget: number
  targetRange: readonly [number, number]
  /** Compensation checks. A rep that breaks one is flagged for physiotherapist review, never diagnosed. */
  checks: { maxLean: number; minElbow?: number; maxShoulder?: number }
  /** Exercise-specific wording for some cues; everything else uses the shared cue text. */
  cues: Partial<Record<CueKey, Record<Lang, string>>>
}

// Targets are starting points. The physiotherapist sets the real one.
export const EXERCISES: Record<ExerciseId, Exercise> = {
  'shoulder-flexion': {
    id: 'shoulder-flexion',
    name: 'Shoulder flexion',
    metricLabel: 'shoulder flexion',
    view: 'Side view',
    blurb: 'Raise the arm forward, straight, to shoulder height.',
    placement: 'Sit side-on to the camera. Shoulder, elbow, wrist and hip must all be in view.',
    metric: 'shoulder', start: 35, rest: 25, defaultTarget: 90, targetRange: [60, 150],
    checks: { maxLean: 15, minElbow: 150 },
    cues: {},
  },
  'shoulder-abduction': {
    id: 'shoulder-abduction',
    name: 'Shoulder abduction',
    metricLabel: 'shoulder abduction',
    view: 'Front view',
    blurb: 'Raise the arm out to the side, keeping it straight.',
    placement: 'Face the camera, about two metres away. Both shoulders and the working arm must be in view.',
    metric: 'shoulder', start: 35, rest: 25, defaultTarget: 90, targetRange: [60, 150],
    checks: { maxLean: 15, minElbow: 150 },
    cues: {
      ready: {
        en: 'Ready. Raise the arm out to the side.',
        hi: 'तैयार। हाथ को बगल से ऊपर उठाइए।',
        mr: 'तयार. हात बाजूने वर उचला.',
      },
    },
  },
  'elbow-flexion': {
    id: 'elbow-flexion',
    name: 'Elbow flexion',
    metricLabel: 'elbow bend',
    view: 'Side view',
    blurb: 'Bend the elbow to bring the hand towards the shoulder, upper arm still.',
    placement: 'Sit side-on to the camera with the upper arm resting by the side. The whole arm must be in view.',
    metric: 'elbowBend', start: 35, rest: 25, defaultTarget: 120, targetRange: [60, 140],
    checks: { maxLean: 15, maxShoulder: 30 },
    cues: {
      ready: {
        en: 'Ready. Bend the elbow and bring the hand up.',
        hi: 'तैयार। कोहनी मोड़कर हाथ को ऊपर लाइए।',
        mr: 'तयार. कोपर वाकवून हात वर आणा.',
      },
      raise: { en: 'Bend slowly.', hi: 'धीरे-धीरे मोड़िए।', mr: 'हळूहळू वाकवा.' },
      higher: { en: 'A little more.', hi: 'थोड़ा और।', mr: 'थोडे आणखी.' },
    },
  },
  'overhead-reach': {
    id: 'overhead-reach',
    name: 'Overhead reach',
    metricLabel: 'shoulder flexion',
    view: 'Side view',
    blurb: 'Reach the straight arm up overhead as far as is comfortable.',
    placement: 'Sit side-on to the camera with space above your head. Shoulder, elbow, wrist and hip must be in view.',
    metric: 'shoulder', start: 40, rest: 30, defaultTarget: 150, targetRange: [120, 175],
    checks: { maxLean: 15, minElbow: 150 },
    cues: {
      ready: {
        en: 'Ready. Reach the arm up overhead.',
        hi: 'तैयार। हाथ को सिर के ऊपर तक उठाइए।',
        mr: 'तयार. हात डोक्यावर उचला.',
      },
    },
  },
  // The two low raises use the same measurement as the full raises, with a smaller range for early recovery.
  'low-forward-raise': {
    id: 'low-forward-raise',
    name: 'Low forward raise',
    metricLabel: 'shoulder flexion',
    view: 'Side view',
    blurb: 'Lift the arm forward a short way, about halfway to shoulder height. For early recovery.',
    placement: 'Sit side-on to the camera. Shoulder, elbow, wrist and hip must all be in view.',
    metric: 'shoulder', start: 18, rest: 10, defaultTarget: 45, targetRange: [35, 90],
    checks: { maxLean: 15, minElbow: 150 },
    cues: {},
  },
  'low-side-raise': {
    id: 'low-side-raise',
    name: 'Low side raise',
    metricLabel: 'shoulder abduction',
    view: 'Front view',
    blurb: 'Lift the arm out to the side a short way. For early recovery.',
    placement: 'Face the camera, about two metres away. Both shoulders and the working arm must be in view.',
    metric: 'shoulder', start: 18, rest: 10, defaultTarget: 45, targetRange: [35, 90],
    checks: { maxLean: 15, minElbow: 150 },
    cues: {
      ready: {
        en: 'Ready. Lift the arm out to the side.',
        hi: 'तैयार। हाथ को बगल से थोड़ा ऊपर उठाइए।',
        mr: 'तयार. हात बाजूने थोडा वर उचला.',
      },
    },
  },
}

export const EXERCISE_LIST: Exercise[] = Object.values(EXERCISES)
export const isExerciseId = (x: unknown): x is ExerciseId => typeof x === 'string' && x in EXERCISES
