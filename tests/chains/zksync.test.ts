import { describe, it, expect } from 'vitest'
import { zksync } from '../../src/chains/zksync'

describe('zksync chain adapter', () => {
  it('should have correct name', () => {
    expect(zksync.name).toBe('zksync')
  })

  it('should compute L2 cost correctly', () => {
    const blobBaseFee = 10000000000n
    const l2ExecutionFee = 100000000n
    const cost = zksync.computeL2Cost(blobBaseFee, l2ExecutionFee)
    expect(cost).toBe(195100000000n)
  })

  it('should handle zero blob base fee', () => {
    const cost = zksync.computeL2Cost(0n, 100000000n)
    expect(cost).toBe(100000000n)
  })

  it('should handle zero execution fee', () => {
    const blobBaseFee = 10000000000n
    const cost = zksync.computeL2Cost(blobBaseFee, 0n)
    const expectedL1Component = (10000000000n * 312n) / 16n
    expect(cost).toBe(expectedL1Component)
  })

  it('should return bigint type', () => {
    const result = zksync.computeL2Cost(1n, 1n)
    expect(typeof result).toBe('bigint')
  })
})