import { describe, it, expect } from 'vitest'
import { scroll } from '../../src/chains/scroll'

describe('scroll chain adapter', () => {
  it('should have correct name', () => {
    expect(scroll.name).toBe('scroll')
  })

  it('should compute L2 cost correctly', () => {
    const blobBaseFee = 10000000000n
    const l2ExecutionFee = 50000000n
    const cost = scroll.computeL2Cost(blobBaseFee, l2ExecutionFee)
    expect(cost).toBe(112550000000n)
  })

  it('should handle zero blob base fee', () => {
    const cost = scroll.computeL2Cost(0n, 50000000n)
    expect(cost).toBe(50000000n)
  })

  it('should return bigint type', () => {
    const result = scroll.computeL2Cost(1n, 1n)
    expect(typeof result).toBe('bigint')
  })
})