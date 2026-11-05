import { CUES, type CueKey, type Lang } from '../content.ts'
import type { Exercise } from './exercises.ts'

/** Cue wording for a language, with the exercise's own wording where it has some. */
export const cueText = (lang: Lang, cue: CueKey, ex?: Exercise): string => ex?.cues[cue]?.[lang] ?? CUES[lang][cue]
