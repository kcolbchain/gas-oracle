import express from 'express';
import rateLimit from 'express-rate-limit';
import { GasOracle } from './oracle';
import { ChainName, VALID_CHAINS } from './types';

interface ChainRpcConfig {
  l1Rpc: string;
  l2Rpc: string;
}

interface ServerConfig {
  port: number;
  rpcConfigs: Record<ChainName, ChainRpcConfig>;
  rateLimitWindowMs: number;
  rateLimitMax: number;
}

/**
 * Creates an Express application with the Gas Oracle API.
 * @param config Server configuration including port, RPCs, and rate limiting.
 * @returns An Express application instance.
 */
export function createServer(config: ServerConfig) {
  const app = express();

  const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: 'Too many requests, please try again later.',
  });

  app.use(limiter);

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: Date.now() });
  });

  app.get('/predict', async (req, res) => {
    const { chain, blocks } = req.query;

    const chainName = chain as ChainName;
    if (!chainName || !VALID_CHAINS.includes(chainName)) {
      return res.status(400).json({
        error: `Invalid or missing "chain" parameter. Supported chains: ${VALID_CHAINS.join(', ')}`,
      });
    }

    const blocksAhead = blocks ? parseInt(blocks as string, 10) : 10;
    if (isNaN(blocksAhead) || blocksAhead <= 0 || blocksAhead > 100) {
      return res.status(400).json({ error: 'Invalid "blocks" parameter. Must be a positive integer up to 100.' });
    }

    const rpcConfig = config.rpcConfigs[chainName];
    if (!rpcConfig) {
      return res.status(500).json({ error: `Server not configured for chain: ${chainName}. Missing RPC URLs.` });
    }

    try {
      const oracle = new GasOracle({
        chain: chainName,
        l1Rpc: rpcConfig.l1Rpc,
        l2Rpc: rpcConfig.l2Rpc,
        windowSize: 50, // Default window size for historical data
      });
      const prediction = await oracle.predict({ blocksAhead });
      res.json(prediction);
    } catch (error: any) {
      console.error(`Error predicting for chain ${chainName}, blocks ${blocksAhead}:`, error.message);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  });

  return app;
}

/**
 * Starts the Gas Oracle API server.
 * @param config Server configuration.
 */
export function startServer(config: ServerConfig) {
  const app = createServer(config);
  app.listen(config.port, () => {
    console.log(`Gas Oracle API server listening on port ${config.port}`);
    console.log(`Configured chains: ${Object.keys(config.rpcConfigs).join(', ')}`);
  });
}

// Main execution block for direct run
if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000', 10);
  const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 minute
  const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX || '100', 10); // 100 requests per window

  const rpcConfigs: Record<ChainName, ChainRpcConfig> = {} as Record<ChainName, ChainRpcConfig>;
  const l1RpcUrl = process.env.L1_RPC_URL;

  if (!l1RpcUrl) {
    console.error('Error: L1_RPC_URL environment variable is not set.');
    process.exit(1);
  }

  for (const chainName of VALID_CHAINS) {
    const l2RpcEnvVar = `${chainName.toUpperCase()}_L2_RPC_URL`;
    const l2RpcUrl = process.env[l2RpcEnvVar];
    if (l2RpcUrl) {
      rpcConfigs[chainName] = { l1Rpc: l1RpcUrl, l2Rpc: l2RpcUrl };
    } else {
      console.warn(`Warning: ${l2RpcEnvVar} not set. ${chainName} chain will not be available.`);
    }
  }

  if (Object.keys(rpcConfigs).length === 0) {
    console.error('Error: No L2 RPC URLs configured. At least one chain must have a L2 RPC URL set.');
    process.exit(1);
  }

  startServer({
    port,
    rpcConfigs,
    rateLimitWindowMs,
    rateLimitMax,
  });
}
