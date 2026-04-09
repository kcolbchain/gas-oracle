import type { ChainAdapter } from '../types'

/** zkSync Era: L2 cost = L2 execution fee + L1 data fee (post-EIP-4844 approximation) */
export const zksync: ChainAdapter = {
  name: 'zksync',
  computeL2Cost(blobBaseFee: bigint, l2ExecutionFee: bigint): bigint {
    // zkSync Era's L1 data fee is generally proportional to L1 base fee * data size.
    // Approximating L1 data cost using blobBaseFee as a proxy for overall L1 data expense.
    // A typical zkSync Era transaction might commit around 1000 bytes of data to L1.
    const typicalDataUnits = 1000n
    const l1Component = (blobBaseFee * typicalDataUnits) / 16n
    return l2ExecutionFee + l1Component
  },
}
