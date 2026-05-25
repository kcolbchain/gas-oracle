import { FeeFetcher } from './fetcher';
import { Predictor } from './predictor';
import { arbitrum } from './chains/arbitrum';
import { optimism, base } from './chains/optimism';
import { scroll } from './chains/scroll';
import { zksync } from './chains/zksync';
import type { ChainAdapter, ChainName, OracleConfig, Prediction, FeeSnapshot, AccuracyReport } from './types';

const adapters: Record<ChainName, ChainAdapter> = { arbitrum, optimism, base, scroll, zksync };

export class AccuracyTracker {
  private fetcher: FeeFetcher;
  private predictor: Predictor;
  private adapter: ChainAdapter;
  private chain: ChainName;
  private windowSize: number;

  constructor(config: OracleConfig) {
    this.fetcher = new FeeFetcher(config);
    this.predictor = new Predictor();
    this.chain = config.chain;
    this.adapter = adapters[config.chain];
    if (!this.adapter) throw new Error(`Unsupported chain: ${config.chain}`);
    this.windowSize = config.windowSize ?? 50;
  }

  async computeAccuracy(lastNBlocks: number, blocksAhead: number): Promise<AccuracyReport> {
    const latestBlock = await this.fetcher.getLatestL1BlockNumber();
    const evaluatedPredictions: { prediction: Prediction, actualL2Cost: bigint, actualBlobFee: bigint }[] = [];

    for (let i = 0; i < lastNBlocks; i++) {
      const actualBlockNumber = latestBlock - BigInt(i);
      const predictionBaseBlockNumber = actualBlockNumber - BigInt(blocksAhead);

      if (predictionBaseBlockNumber < BigInt(this.windowSize -1)) {
        continue;
      }

      const snapshots = await this.fetcher.fetchHistory(predictionBaseBlockNumber, this.windowSize);

      if (snapshots.length < Math.min(this.windowSize, 3)) {
         continue;
      }

      const prediction = this.predictor.predict(snapshots, blocksAhead, this.chain, this.adapter);

      const actualBlockData = await this.fetcher.fetchSpecificBlock(actualBlockNumber);
      if (!actualBlockData) {
        continue;
      }

      const actualBlobFee = actualBlockData.blobBaseFee;
      const actualL2Cost = this.adapter.computeL2Cost(actualBlockData.blobBaseFee, actualBlockData.l2GasPrice);

      evaluatedPredictions.push({
        prediction,
        actualL2Cost,
        actualBlobFee,
      });
    }

    if (evaluatedPredictions.length === 0) {
      return {
        maeGasPrice: 0, mapeGasPrice: 0, withinConfidenceGasPrice: 0,
        maeBlobFee: 0, mapeBlobFee: 0, withinConfidenceBlobFee: 0,
        totalEvaluated: 0, chain: this.chain, blocksAhead,
      };
    }

    let totalAbsErrorGasPrice = 0;
    let totalAbsPercentageErrorGasPrice = 0;
    let withinConfCountGasPrice = 0;

    let totalAbsErrorBlobFee = 0;
    let totalAbsPercentageErrorBlobFee = 0;
    let withinConfCountBlobFee = 0;

    for (const { prediction, actualL2Cost, actualBlobFee } of evaluatedPredictions) {
      const predictedL2CostGwei = prediction.gasPrice;
      const actualL2CostGwei = Number(actualL2Cost) / 1e9;

      const predictedBlobFeeGwei = prediction.blobFee;
      const actualBlobFeeGwei = Number(actualBlobFee) / 1e9;

      const diffL2Cost = Math.abs(predictedL2CostGwei - actualL2CostGwei);
      totalAbsErrorGasPrice += diffL2Cost;
      if (actualL2CostGwei > 0) {
        totalAbsPercentageErrorGasPrice += diffL2Cost / actualL2CostGwei;
      }

      const marginFactorGasPrice = (1 - prediction.confidence);
      const lowerBoundGasPrice = predictedL2CostGwei * (1 - marginFactorGasPrice);
      const upperBoundGasPrice = predictedL2CostGwei * (1 + marginFactorGasPrice);
      if (actualL2CostGwei >= lowerBoundGasPrice && actualL2CostGwei <= upperBoundGasPrice) {
        withinConfCountGasPrice++;
      }

      const diffBlobFee = Math.abs(predictedBlobFeeGwei - actualBlobFeeGwei);
      totalAbsErrorBlobFee += diffBlobFee;
      if (actualBlobFeeGwei > 0) {
        totalAbsPercentageErrorBlobFee += diffBlobFee / actualBlobFeeGwei;
      }

      const marginFactorBlobFee = (1 - prediction.confidence);
      const lowerBoundBlobFee = predictedBlobFeeGwei * (1 - marginFactorBlobFee);
      const upperBoundBlobFee = predictedBlobFeeGwei * (1 + marginFactorBlobFee);
      if (actualBlobFeeGwei >= lowerBoundBlobFee && actualBlobFeeGwei <= upperBoundBlobFee) {
        withinConfCountBlobFee++;
      }
    }

    const total = evaluatedPredictions.length;
    return {
      maeGasPrice: totalAbsErrorGasPrice / total,
      mapeGasPrice: (totalAbsPercentageErrorGasPrice / total) * 100,
      withinConfidenceGasPrice: (withinConfCountGasPrice / total) * 100,
      maeBlobFee: totalAbsErrorBlobFee / total,
      mapeBlobFee: (totalAbsPercentageErrorBlobFee / total) * 100,
      withinConfidenceBlobFee: (withinConfCountBlobFee / total) * 100,
      totalEvaluated: total,
      chain: this.chain,
      blocksAhead,
    };
  }
}