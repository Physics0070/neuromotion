import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STEADY, WINDOW, stats, steadyReading, toCsv, verdict, type Pair } from './validation.ts'

const pair = (app: number, gonio: number): Pair => ({ at: '2026-11-05T10:00:00Z', joint: 'shoulder', side: 'right', method: 'world3d', app, gonio })

test('a steady, fully tracked window gives the median; anything else is refused with a reason', () => {
  const ok = Array(WINDOW).fill(90).map((v, i) => v + (i % 2))
  assert.deepEqual(steadyReading(ok), { value: 90 })
  assert.ok('error' in steadyReading([...ok.slice(1), null]), 'one lost frame')
  assert.ok('error' in steadyReading(ok.slice(0, 5)), 'too few frames')
  assert.ok('error' in steadyReading(Array(WINDOW).fill(0).map((_, i) => (i < 8 ? 80 : 80 + STEADY + 1))), 'arm moved')
})

test('stats: error is app minus goniometer; bias keeps the sign, MAE does not', () => {
  assert.equal(stats([]), null)
  const s = stats([pair(92, 90), pair(85, 90), pair(100, 100), pair(63, 60)])!
  assert.deepEqual([s.n, s.mae, s.bias, s.maxAbs], [4, 2.5, -0.0 + 0, 5])
  assert.equal(stats([pair(95, 90)])!.sd, 0)
})

test('verdict needs enough readings, then a mean error of 10 degrees or less', () => {
  const many = (err: number) => stats(Array.from({ length: 20 }, (_, i) => pair(50 + i * 5 + err, 50 + i * 5)))
  assert.equal(verdict(null), 'more-readings')
  assert.equal(verdict(stats(Array.from({ length: 19 }, () => pair(90, 90)))), 'more-readings')
  assert.equal(verdict(many(10)), 'pass')
  assert.equal(verdict(many(10.5)), 'fail')
  assert.equal(verdict(many(-12)), 'fail', 'under-reading fails too')
})

test('csv has a header and one line per reading', () => {
  const lines = toCsv([pair(92, 90)]).trim().split('\n')
  assert.equal(lines.length, 2)
  assert.equal(lines[1], '2026-11-05T10:00:00Z,shoulder,right,world3d,92,90,2')
})
