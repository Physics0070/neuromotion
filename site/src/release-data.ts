import data from './release.json'
import { pending, type Release } from './release.ts'

export const release: Release = data
export const stillPending = pending(release)
