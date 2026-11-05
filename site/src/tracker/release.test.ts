import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VALIDATION_MAX_MAE, pending, type Release } from '../release.ts'

const done: Release = {
  version: '1.0.0', operator: 'Example Rehab Trust', contactEmail: 'help@example.org',
  clinical: { reviewer: 'A. Physio', registration: 'MH-12345', date: '2026-11-05' },
  translations: { hi: { reviewer: 'B. Native', date: '2026-11-05' }, mr: { reviewer: 'C. Native', date: '2026-11-05' } },
  legal: { reviewer: 'D. Counsel', date: '2026-11-05' },
  validation: { n: 24, maeDeg: 6.2, date: '2026-11-05', method: 'world3d' },
}

test('a complete release has nothing pending', () => assert.deepEqual(pending(done), []))

test('every missing sign-off is named, and an empty release needs all of them', () => {
  const empty: Release = JSON.parse('{"version":"1","operator":"","contactEmail":"","clinical":{"reviewer":"","registration":"","date":""},"translations":{"hi":{"reviewer":"","date":""},"mr":{"reviewer":"","date":""}},"legal":{"reviewer":"","date":""},"validation":{"n":0,"maeDeg":null,"date":"","method":""}}')
  assert.equal(pending(empty).length, 7)
  assert.deepEqual(pending({ ...done, legal: { reviewer: 'D. Counsel', date: 'yesterday' } }), ['legal review of privacy, terms and consent'])
  assert.equal(pending({ ...done, contactEmail: 'not-an-email' }).length, 1)
  assert.equal(pending({ ...done, clinical: { ...done.clinical, registration: '' } }).length, 1)
})

test('validation must have enough readings and a small enough error', () => {
  assert.equal(pending({ ...done, validation: { ...done.validation, n: 19 } }).length, 1)
  assert.equal(pending({ ...done, validation: { ...done.validation, maeDeg: VALIDATION_MAX_MAE + 0.1 } }).length, 1)
  assert.deepEqual(pending({ ...done, validation: { ...done.validation, maeDeg: VALIDATION_MAX_MAE } }), [])
})
