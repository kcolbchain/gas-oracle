import type { ChainAdapter } from '../types'

/** zkSync Era: L2 cost = execution fee + L1 pubdata fee (gas-per-pubdata-byte model) */
export const zksync: ChainAdapter = {
  name: 'zksync',
  computeL2Cost(blobBaseFee: bigint, l2ExecutionFee: bigint): bigint {
    const gasPerPubdataByte = 16n
    const typicalPubdataBytes = 312n
    const l1Component = (blobBaseFee * typicalPubdataBytes) / gasPerPubdataByte
    return l2ExecutionFee + l1Component
  },
}