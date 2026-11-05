import type { ExerciseId } from './tracker/exercises.ts'

/** A small pictogram of each movement: the torso, the arm at rest (faint) and where it ends up. */
export default function Pic({ id }: { id: ExerciseId }) {
  const arm: Record<ExerciseId, string> = {
    'shoulder-flexion': 'M20 18 L46 18',
    'shoulder-abduction': 'M28 18 L50 18',
    'elbow-flexion': 'M20 18 L20 34 L38 24',
    'overhead-reach': 'M20 20 L38 3',
    'low-forward-raise': 'M20 18 L38 36',
    'low-side-raise': 'M28 18 L46 36',
  }
  const x = id === 'shoulder-abduction' || id === 'low-side-raise' ? 28 : 20
  return (
    <svg className="pic" viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx={x} cy="8" r="4" strokeWidth="2.4" />
      <path d={`M${x} 14 V42`} opacity="0.55" />
      <path d={`M${x} 18 V36`} opacity="0.28" />
      <path d={arm[id]} />
    </svg>
  )
}
