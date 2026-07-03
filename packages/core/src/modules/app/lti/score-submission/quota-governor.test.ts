import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { QuotaGovernor } from './quota-governor.js'

// max=10, reserve=2, window=10s, ramp=1s — the shape used across these cases
// unless a test overrides it.
const make = (
  over: Partial<{ max: number; reserve: number; window: number; ramp: number; now: number }> = {}
) => {
  const { max = 10, reserve = 2, window = 10_000, ramp = 1_000, now = 0 } = over
  return new QuotaGovernor(max, reserve, window, ramp, now)
}

describe('QuotaGovernor', () => {
  it('cold-starts at 1 with no readings', () => {
    const g = make()
    assert.equal(g.target(0), 1)
  })

  it('holds steady when readings carry no cost', () => {
    const g = make()
    g.record({ remaining: 1_000, at: 0 })
    assert.equal(g.target(0), 1)
  })

  it('ramps up at most +1 per ramp interval', () => {
    const g = make()
    // Ample quota: computed capacity is the max (10), so the only limiter is ramp.
    g.record({ remaining: 1_000, cost: 10, at: 0 })
    assert.equal(g.target(0), 1, 'no raise within the first interval')

    g.record({ remaining: 1_000, cost: 10, at: 1_000 })
    assert.equal(g.target(1_000), 2, '+1 after one interval')

    // Another reading mid-interval must not bump it again.
    g.record({ remaining: 1_000, cost: 10, at: 1_500 })
    assert.equal(g.target(1_500), 2, 'no second raise inside the same interval')

    assert.equal(g.target(2_000), 3, '+1 after the next interval')
  })

  it('drops to the computed target immediately when quota tightens', () => {
    const g = make()
    // Ramp up a couple of steps first.
    g.record({ remaining: 1_000, cost: 10, at: 0 })
    g.record({ remaining: 1_000, cost: 10, at: 1_000 })
    g.record({ remaining: 1_000, cost: 10, at: 2_000 })
    assert.equal(g.target(2_000), 3)

    // A tight reading (capacity = floor(20/10) - 2 = 0 → clamped to 1).
    g.record({ remaining: 20, cost: 10, at: 2_500 })
    assert.equal(g.target(2_500), 1, 'fast down, no ramp delay')
  })

  it('subtracts the reserve and clamps into [1, max]', () => {
    const g = make({ max: 10, reserve: 2 })
    // floor(50/10) - 2 = 3.
    g.record({ remaining: 50, cost: 10, at: 0 })
    g.record({ remaining: 50, cost: 10, at: 1_000 })
    g.record({ remaining: 50, cost: 10, at: 2_000 })
    g.record({ remaining: 50, cost: 10, at: 3_000 })
    // Ramp would allow 3 by t=3000, and the computed ceiling is also 3.
    assert.equal(g.target(3_000), 3)
    // It must not climb past the computed ceiling no matter how long we wait.
    g.record({ remaining: 50, cost: 10, at: 9_000 })
    assert.equal(g.target(9_000), 3, 'capped by computed target, not just ramp')
  })

  it('aggregates conservatively: worst remaining, priciest cost in the window', () => {
    const g = make()
    // Mixed readings in one window: min remaining = 30, max cost = 15.
    // capacity = floor(30/15) - 2 = 0 → clamped to 1.
    g.record({ remaining: 1_000, cost: 5, at: 0 })
    g.record({ remaining: 30, cost: 10, at: 100 })
    g.record({ remaining: 200, cost: 15, at: 200 })
    assert.equal(g.target(200), 1)
  })

  it('prunes readings older than the window but holds the target (no auto-decay)', () => {
    const g = make()
    g.record({ remaining: 1_000, cost: 10, at: 0 })
    g.record({ remaining: 1_000, cost: 10, at: 1_000 })
    g.record({ remaining: 1_000, cost: 10, at: 2_000 })
    assert.equal(g.target(2_000), 3)

    // All readings age out of the 10s window; with nothing to go on it holds.
    assert.equal(g.target(20_000), 3, 'empty window holds steady, does not drop')
  })

  it('reset returns to cold start', () => {
    const g = make()
    g.record({ remaining: 1_000, cost: 10, at: 0 })
    g.record({ remaining: 1_000, cost: 10, at: 1_000 })
    assert.equal(g.target(1_000), 2)

    g.reset(1_000)
    assert.equal(g.target(1_000), 1, 'history cleared, back to 1')
    // And it must re-earn concurrency on the ramp schedule from the reset point.
    g.record({ remaining: 1_000, cost: 10, at: 1_500 })
    assert.equal(g.target(1_500), 1, 'no raise within an interval of the reset')
    g.record({ remaining: 1_000, cost: 10, at: 2_000 })
    assert.equal(g.target(2_000), 2)
  })
})
