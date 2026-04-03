import type { ChainAdapter } from '../types'

/** Scroll: L2 cost = execution fee + L1 commit fee (blob-based post-Bernoulli) */
export const scroll: ChainAdapter = {
  name: 'scroll',
  computeL2Cost(blobBaseFee: bigint, l2ExecutionFee: bigint): bigint {
    // Scroll's L1 fee is proportional to blob base fee × compressed tx size
    const typicalCompressedSize = 180n
    const l1Component = (blobBaseFee * typicalCompressedSize) / 16n
    return l2ExecutionFee + l1Component
  },
}
