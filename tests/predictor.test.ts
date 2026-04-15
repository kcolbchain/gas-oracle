import { describe, it, expect, beforeEach } from 'vitest'
import { Predictor } from '../src/predictor'
import type { FeeSnapshot, ChainAdapter, ChainName, Prediction } from '../src/types'

// Mock ChainAdapter for testing purposes
const mockAdapter: ChainAdapter = {
  name: 'arbitrum', // Use a consistent mock chain name
  computeL2Cost: (blobBaseFee: bigint, l2ExecutionFee: bigint): bigint => {
    // A simplified mock: L2 cost is execution fee plus a small fraction of blob fee
    return l2ExecutionFee + blobBaseFee / 100n
  },
}

const mockChainName: ChainName = 'arbitrum'

describe('Predictor', () => {
  let predictor: Predictor
  const testAlpha = 0.5 // Use a fixed alpha for predictable EMA in tests

  beforeEach(() => {
    predictor = new Predictor(testAlpha)
  })

  // Helper to create synthetic FeeSnapshots from Gwei values
  const createSnapshots = (
    blobFeesGwei: number[],
    l2FeesGwei: number[],
    startBlock = 1000,
    timestampStep = 12
  ): FeeSnapshot[] => {
    return blobFeesGwei.map((blobFee, i) => ({
      blockNumber: BigInt(startBlock + i),
      blobBaseFee: BigInt(Math.round(blobFee * 1e9)), // Convert Gwei to Wei
      l2GasPrice: BigInt(Math.round(l2FeesGwei[i] * 1e9)), // Convert Gwei to Wei
      timestamp: Date.now() - (blobFeesGwei.length - 1 - i) * timestampStep * 1000,
    }))
  }

  it('should throw error if less than 3 snapshots are provided', () => {
    const snapshots: FeeSnapshot[] = [
      { blockNumber: 1n, blobBaseFee: 1n, l2GasPrice: 1n, timestamp: 1 },
      { blockNumber: 2n, blobBaseFee: 2n, l2GasPrice: 2n, timestamp: 2 },
    ]
    expect(() => predictor.predict(snapshots, 5, mockChainName, mockAdapter)).toThrow(
      'Need at least 3 snapshots',
    )
  })

  it('should predict with a simple increasing trend', () => {
    const blobFeesGwei = [10, 12, 14, 16, 18]
    const l2FeesGwei = [20, 22, 24, 26, 28]
    const snapshots = createSnapshots(blobFeesGwei, l2FeesGwei)
    const blocksAhead = 1

    // Convert Gwei inputs to Wei for internal EMA/LR calculation
    const blobFeesWei = blobFeesGwei.map((f) => f * 1e9)
    const l2FeesWei = l2FeesGwei.map((f) => f * 1e9)

    // Calculate expected EMA values
    const expectedSmoothedBlob = predictor['ema'](blobFeesWei)
    const expectedSmoothedL2 = predictor['ema'](l2FeesWei)

    // Calculate expected Linear Regression results on smoothed values
    const blobTrend = predictor['linearRegression'](expectedSmoothedBlob)
    const l2Trend = predictor['linearRegression'](expectedSmoothedL2)

    // Calculate expected prediction based on these trends
    const n = expectedSmoothedBlob.length
    const predictedBlobWei = blobTrend.slope * (n + blocksAhead) + blobTrend.intercept
    const predictedL2Wei = l2Trend.slope * (n + blocksAhead) + l2Trend.intercept

    const confidence = Math.max(0, Math.min(1, (blobTrend.r2 + l2Trend.r2) / 2))

    const expectedBlobGwei = Math.max(0, predictedBlobWei) / 1e9
    const expectedL2Gwei = Math.max(0, predictedL2Wei) / 1e9

    const expectedPrediction: Prediction = {
      gasPrice: Number(expectedL2Gwei.toFixed(6)),
      blobFee: Number(expectedBlobGwei.toFixed(6)),
      confidence: Number(confidence.toFixed(3)),
      blocksAhead,
      chain: mockChainName,
    }

    const prediction = predictor.predict(snapshots, blocksAhead, mockChainName, mockAdapter)

    // Use toBeCloseTo for floating point comparisons
    expect(prediction.gasPrice).toBeCloseTo(expectedPrediction.gasPrice, 2)
    expect(prediction.blobFee).toBeCloseTo(expectedPrediction.blobFee, 2)
    expect(prediction.confidence).toBeCloseTo(expectedPrediction.confidence, 3)
    expect(prediction.blocksAhead).toBe(expectedPrediction.blocksAhead)
    expect(prediction.chain).toBe(expectedPrediction.chain)
  })

  it('should predict with a flat trend', () => {
    const blobFeesGwei = [100, 100, 100, 100, 100]
    const l2FeesGwei = [20, 20, 20, 20, 20]
    const snapshots = createSnapshots(blobFeesGwei, l2FeesGwei)
    const blocksAhead = 5

    const prediction = predictor.predict(snapshots, blocksAhead, mockChainName, mockAdapter)

    // With flat data, EMA will be flat, linear regression slope will be 0, intercept will be the value.
    // R2 should be 1 for a perfect fit.
    expect(prediction.blobFee).toBeCloseTo(100, 2)
    expect(prediction.gasPrice).toBeCloseTo(20, 2)
    expect(prediction.confidence).toBeCloseTo(1, 3) // R2 is 1 for a perfect fit
    expect(prediction.blocksAhead).toBe(blocksAhead)
    expect(prediction.chain).toBe(mockChainName)
  })

  it('should predict with a decreasing trend', () => {
    const blobFeesGwei = [50, 45, 40, 35, 30]
    const l2FeesGwei = [10, 9, 8, 7, 6]
    const snapshots = createSnapshots(blobFeesGwei, l2FeesGwei)
    const blocksAhead = 2

    // Convert Gwei inputs to Wei for internal EMA/LR calculation
    const blobFeesWei = blobFeesGwei.map((f) => f * 1e9)
    const l2FeesWei = l2FeesGwei.map((f) => f * 1e9)

    // Calculate expected EMA values
    const expectedSmoothedBlob = predictor['ema'](blobFeesWei)
    const expectedSmoothedL2 = predictor['ema'](l2FeesWei)

    // Calculate expected Linear Regression results on smoothed values
    const blobTrend = predictor['linearRegression'](expectedSmoothedBlob)
    const l2Trend = predictor['linearRegression'](expectedSmoothedL2)

    // Calculate expected prediction based on these trends
    const n = expectedSmoothedBlob.length
    const predictedBlobWei = blobTrend.slope * (n + blocksAhead) + blobTrend.intercept
    const predictedL2Wei = l2Trend.slope * (n + blocksAhead) + l2Trend.intercept

    const confidence = Math.max(0, Math.min(1, (blobTrend.r2 + l2Trend.r2) / 2))

    const expectedBlobGwei = Math.max(0, predictedBlobWei) / 1e9
    const expectedL2Gwei = Math.max(0, predictedL2Wei) / 1e9

    const expectedPrediction: Prediction = {
      gasPrice: Number(expectedL2Gwei.toFixed(6)),
      blobFee: Number(expectedBlobGwei.toFixed(6)),
      confidence: Number(confidence.toFixed(3)),
      blocksAhead,
      chain: mockChainName,
    }

    const prediction = predictor.predict(snapshots, blocksAhead, mockChainName, mockAdapter)

    expect(prediction.gasPrice).toBeCloseTo(expectedPrediction.gasPrice, 2)
    expect(prediction.blobFee).toBeCloseTo(expectedPrediction.blobFee, 2)
    expect(prediction.confidence).toBeCloseTo(expectedPrediction.confidence, 3)
  })

  it('should clamp negative predicted fees to 0 gwei', () => {
    // Use a strongly decreasing trend to force negative predictions
    const blobFeesGwei = [100, 80, 60, 40, 20]
    const l2FeesGwei = [50, 40, 30, 20, 10]
    const snapshots = createSnapshots(blobFeesGwei, l2FeesGwei)
    const blocksAhead = 5 // Predict far enough ahead for fees to go negative

    const prediction = predictor.predict(snapshots, blocksAhead, mockChainName, mockAdapter)

    expect(prediction.blobFee).toBeCloseTo(0, 2)
    expect(prediction.gasPrice).toBeCloseTo(0, 2)
    // Confidence should still be meaningful for the strong decreasing trend
    expect(prediction.confidence).toBeGreaterThan(0.5)
  })

  describe('private ema method', () => {
    it('should correctly calculate EMA', () => {
      const values = [10, 20, 30, 40, 50]
      const predictorWithAlpha = new Predictor(0.5) // Using the testAlpha

      // Expected EMA calculation with alpha = 0.5:
      // [0] = 10
      // [1] = 0.5 * 20 + 0.5 * 10 = 15
      // [2] = 0.5 * 30 + 0.5 * 15 = 22.5
      // [3] = 0.5 * 40 + 0.5 * 22.5 = 31.25
      // [4] = 0.5 * 50 + 0.5 * 31.25 = 40.625
      const expected = [10, 15, 22.5, 31.25, 40.625]
      const result = predictorWithAlpha['ema'](values) // Access private method

      result.forEach((val, i) => {
        expect(val).toBeCloseTo(expected[i], 3)
      })
    })

    it('should return the first value repeatedly for alpha = 0', () => {
      const values = [10, 20, 30]
      const predictorWithAlpha = new Predictor(0)
      const expected = [10, 10, 10]
      const result = predictorWithAlpha['ema'](values)
      result.forEach((val, i) => {
        expect(val).toBeCloseTo(expected[i], 3)
      })
    })

    it('should return the original values for alpha = 1', () => {
      const values = [10, 20, 30]
      const predictorWithAlpha = new Predictor(1)
      const expected = [10, 20, 30]
      const result = predictorWithAlpha['ema'](values)
      result.forEach((val, i) => {
        expect(val).toBeCloseTo(expected[i], 3)
      })
    })
  })

  describe('private linearRegression method', () => {
    it('should correctly calculate linear regression for an increasing trend', () => {
      const values = [1, 2, 3, 4, 5] // Perfect linear trend: y = x + 1 (for 0-indexed x: 0,1,2,3,4)
      const { slope, intercept, r2 } = predictor['linearRegression'](values)

      expect(slope).toBeCloseTo(1, 6)
      expect(intercept).toBeCloseTo(1, 6) // For x=0, y=1
      expect(r2).toBeCloseTo(1, 6) // Perfect fit
    })

    it('should correctly calculate linear regression for a decreasing trend', () => {
      const values = [5, 4, 3, 2, 1] // Perfect linear trend: y = -x + 5 (for 0-indexed x: 0,1,2,3,4)
      const { slope, intercept, r2 } = predictor['linearRegression'](values)

      expect(slope).toBeCloseTo(-1, 6)
      expect(intercept).toBeCloseTo(5, 6) // For x=0, y=5
      expect(r2).toBeCloseTo(1, 6) // Perfect fit
    })

    it('should correctly calculate linear regression for a flat trend', () => {
      const values = [10, 10, 10, 10, 10]
      const { slope, intercept, r2 } = predictor['linearRegression'](values)

      expect(slope).toBeCloseTo(0, 6)
      expect(intercept).toBeCloseTo(10, 6)
      expect(r2).toBeCloseTo(1, 6) // Perfect fit
    })

    it('should handle non-perfect fit with reasonable R2', () => {
      const values = [1, 3, 2, 4, 3] // Scattered data
      const { slope, intercept, r2 } = predictor['linearRegression'](values)

      // Expected values for this dataset (x=[0,1,2,3,4], y=[1,3,2,4,3]):
      // Slope: 0.6
      // Intercept: 1.6
      // R2: 0.6
      expect(slope).toBeCloseTo(0.6, 6)
      expect(intercept).toBeCloseTo(1.6, 6)
      expect(r2).toBeCloseTo(0.6, 6)
    })

    it('should handle single data point (n=1) case', () => {
      const values = [100] // n = 1
      const { slope, intercept, r2 } = predictor['linearRegression'](values)
      expect(slope).toBe(0) // Slope is 0 for a single point
      expect(intercept).toBe(100) // Intercept is the point's value
      expect(r2).toBe(0) // R2 is undefined/0 for a single point
    })
  })

  it('should clamp confidence between 0 and 1', () => {
    // Temporarily override linearRegression to produce extreme R2 values
    const mockPredictor = new Predictor(testAlpha)
    const snapshots = createSnapshots([10, 11, 12], [10, 11, 12])

    // Simulate negative R2
    mockPredictor['linearRegression'] = () =>
      ({ slope: 0, intercept: 0, r2: -0.5 }) as ReturnType<
        Predictor['linearRegression']
      >
    let prediction = mockPredictor.predict(snapshots, 1, mockChainName, mockAdapter)
    expect(prediction.confidence).toBeCloseTo(0, 3)

    // Simulate R2 > 1 (should not happen with correct R2 formula, but for robustness)
    mockPredictor['linearRegression'] = () =>
      ({ slope: 0, intercept: 0, r2: 1.5 }) as ReturnType<
        Predictor['linearRegression']
      >
    prediction = mockPredictor.predict(snapshots, 1, mockChainName, mockAdapter)
    expect(prediction.confidence).toBeCloseTo(1, 3)
  })
})
