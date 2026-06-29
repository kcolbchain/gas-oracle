import { describe, it, expect } from 'vitest'
import { arbitrum } from '../../src/chains/arbitrum'

describe('arbitrum chain adapter', () => {
  it('should have correct name', () => {
    expect(arbitrum.name).toBe('arbitrum')
  })

  it('should add the blob-derived L1 data fee on top of the L2 execution fee', () => {
    // 10 gwei blob base fee, 0.05 gwei L2 execution fee.
    const blobBaseFee = 10_000_000_000n
    const l2ExecutionFee = 50_000_000n

    // L1 data component = blobBaseFee * 1600 (typical calldata units) / 16.
    const expectedL1Component = (blobBaseFee * 1600n) / 16n
    const cost = arbitrum.computeL2Cost(blobBaseFee, l2ExecutionFee)

    expect(cost).toBe(l2ExecutionFee + expectedL1Component)
    expect(cost).toBe(1_000_050_000_000n)
  })

  it('should scale the L1 data fee linearly with the blob base fee', () => {
    const l2ExecutionFee = 50_000_000n
    const single = arbitrum.computeL2Cost(1_000_000_000n, l2ExecutionFee)
    const double = arbitrum.computeL2Cost(2_000_000_000n, l2ExecutionFee)

    // Doubling the blob fee should double only the blob-derived L1 component,
    // leaving the L2 execution fee unchanged.
    const l1Single = single - l2ExecutionFee
    const l1Double = double - l2ExecutionFee
    expect(l1Double).toBe(l1Single * 2n)
  })

  it('should equal the bare L2 execution fee when blob base fee is zero', () => {
    expect(arbitrum.computeL2Cost(0n, 50_000_000n)).toBe(50_000_000n)
  })

  it('should return a bigint', () => {
    expect(typeof arbitrum.computeL2Cost(1n, 1n)).toBe('bigint')
  })
})
