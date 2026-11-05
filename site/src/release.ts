// What a public release needs from people, not code. Fill src/release.json; `npm run release` refuses to build until it is complete.
export interface Signoff { reviewer: string; date: string }
export interface Release {
  version: string
  operator: string // legal name of whoever runs the site (the data fiduciary under the DPDP Act)
  contactEmail: string
  clinical: Signoff & { registration: string } // physiotherapist: council registration number
  translations: { hi: Signoff; mr: Signoff }
  legal: Signoff
  validation: { n: number; maeDeg: number | null; date: string; method: string }
}

export const VALIDATION_MIN_PAIRS = 20
export const VALIDATION_MAX_MAE = 10 // degrees; above this the on-screen angle must not be relied on

const day = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
const signed = (s: Signoff) => s.reviewer.trim().length > 1 && day(s.date)

/** Human-readable list of what is still missing. Empty means ready to publish. */
export function pending(r: Release): string[] {
  const out: string[] = []
  if (r.operator.trim().length < 2) out.push('operator name')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.contactEmail)) out.push('contact email')
  if (!signed(r.clinical) || r.clinical.registration.trim().length < 3) out.push('physiotherapist review (name, registration number, date)')
  if (!signed(r.translations.hi)) out.push('Hindi wording review')
  if (!signed(r.translations.mr)) out.push('Marathi wording review')
  if (!signed(r.legal)) out.push('legal review of privacy, terms and consent')
  const v = r.validation
  if (!day(v.date) || v.n < VALIDATION_MIN_PAIRS || v.maeDeg === null) out.push(`goniometer validation (at least ${VALIDATION_MIN_PAIRS} readings)`)
  else if (v.maeDeg > VALIDATION_MAX_MAE) out.push(`goniometer validation passed (mean error ${v.maeDeg}° is above ${VALIDATION_MAX_MAE}°)`)
  return out
}
