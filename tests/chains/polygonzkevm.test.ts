import { describe, it, expect } from 'vitest'
import { polygonzkevm } from '../../src/chains/polygonzkevm'

describe('polygonzkevm chain adapter', () => {
  it('should have correct name', () => {
    expect(polygonzkevm.name).toBe('polygonzkevm')
  })

  it('should compute L2 cost correctly', () => {
    const blobBaseFee = 10000000000n
    const l2ExecutionFee = 50000000n
    const cost = polygonzkevm.computeL2Cost(blobBaseFee, l2ExecutionFee)
    expect(cost).toBe(160050000000n)
  })

  it('should handle zero blob base fee', () => {
    const cost = polygonzkevm.computeL2Cost(0n, 50000000n)
    expect(cost).toBe(50000000n)
  })

  it('should handle zero execution fee', () => {
    const cost = polygonzkevm.computeL2Cost(10000000000n, 0n)
    expect(cost).toBe(160000000000n)
  })

  it('should return bigint type', () => {
    const result = polygonzkevm.computeL2Cost(1n, 1n)
    expect(typeof result).toBe('bigint')
  })
})
