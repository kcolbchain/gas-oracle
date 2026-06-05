import { describe, it, expect } from 'vitest'
import { mantle } from '../../src/chains/mantle'

describe('mantle chain adapter', () => {
  it('should have correct name', () => {
    expect(mantle.name).toBe('mantle')
  })

  it('should compute L2 cost correctly', () => {
    const blobBaseFee = 10000000000n
    const l2ExecutionFee = 50000000n
    const cost = mantle.computeL2Cost(blobBaseFee, l2ExecutionFee)
    expect(cost).toBe(101418625000n)
  })

  it('should handle zero blob base fee', () => {
    const cost = mantle.computeL2Cost(0n, 50000000n)
    expect(cost).toBe(50000000n)
  })

  it('should handle zero execution fee', () => {
    const cost = mantle.computeL2Cost(10000000000n, 0n)
    expect(cost).toBe(101368625000n)
  })

  it('should return bigint type', () => {
    const result = mantle.computeL2Cost(1n, 1n)
    expect(typeof result).toBe('bigint')
  })
})
