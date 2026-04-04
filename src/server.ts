import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { GasOracle } from './oracle'
import type { ChainName, Prediction } from './types'

// --- Configuration ---

interface ServerConfig {
  port: number
  host: string
  l1Rpc: string
  l2Rpcs: Record<ChainName, string>
  windowSize: number
  rateLimit: { windowMs: number; maxRequests: number }
  cacheTtlMs: number
}

const config: ServerConfig = {
  port: parseInt(process.env.PORT ?? '3000'),
  host: process.env.HOST ?? '0.0.0.0',
  l1Rpc: process.env.L1_RPC ?? 'https://eth.llamarpc.com',
  l2Rpcs: {
    arbitrum: process.env.L2_RPC_ARBITRUM ?? 'https://arb1.arbitrum.io/rpc',
    optimism: process.env.L2_RPC_OPTIMISM ?? 'https://mainnet.optimism.io',
    base: process.env.L2_RPC_BASE ?? 'https://mainnet.base.org',
    scroll: process.env.L2_RPC_SCROLL ?? 'https://rpc.scroll.io',
  },
  windowSize: parseInt(process.env.WINDOW_SIZE ?? '50'),
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX ?? '60'),
  },
  cacheTtlMs: parseInt(process.env.CACHE_TTL_MS ?? '12000'), // ~1 L1 block
}

// --- Rate Limiter ---

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + config.rateLimit.windowMs })
    return true
  }

  if (entry.count >= config.rateLimit.maxRequests) return false
  entry.count++
  return true
}

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip)
  }
}, config.rateLimit.windowMs)

// --- Cache ---

const cache = new Map<string, { data: Prediction; expiresAt: number }>()

function getCached(key: string): Prediction | null {
  const entry = cache.get(key)
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) cache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: Prediction): void {
  cache.set(key, { data, expiresAt: Date.now() + config.cacheTtlMs })
}

// --- Request Helpers ---

const VALID_CHAINS: ChainName[] = ['arbitrum', 'optimism', 'base', 'scroll']

function parseUrl(url: string): URL {
  return new URL(url, 'http://localhost')
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(body))
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
  return req.socket.remoteAddress ?? 'unknown'
}

// --- Routes ---

const startTime = Date.now()
let requestCount = 0

async function handlePredict(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = parseUrl(req.url ?? '/')
  const chain = url.searchParams.get('chain') as ChainName | null
  const blocksAhead = parseInt(url.searchParams.get('blocks') ?? '10')

  if (!chain || !VALID_CHAINS.includes(chain)) {
    json(res, 400, {
      error: 'Invalid or missing chain parameter',
      valid_chains: VALID_CHAINS,
      usage: 'GET /predict?chain=arbitrum&blocks=10',
    })
    return
  }

  if (isNaN(blocksAhead) || blocksAhead < 1 || blocksAhead > 100) {
    json(res, 400, { error: 'blocks must be between 1 and 100' })
    return
  }

  const cacheKey = `${chain}:${blocksAhead}`
  const cached = getCached(cacheKey)
  if (cached) {
    json(res, 200, { ...cached, cached: true })
    return
  }

  try {
    const oracle = new GasOracle({
      chain,
      l1Rpc: config.l1Rpc,
      l2Rpc: config.l2Rpcs[chain],
      windowSize: config.windowSize,
    })

    const prediction = await oracle.predict({ blocksAhead })
    setCache(cacheKey, prediction)
    json(res, 200, { ...prediction, cached: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    json(res, 500, { error: 'Prediction failed', message })
  }
}

function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  json(res, 200, {
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    requests: requestCount,
    chains: VALID_CHAINS,
    version: '0.1.0',
  })
}

function handleChains(_req: IncomingMessage, res: ServerResponse): void {
  json(res, 200, {
    chains: VALID_CHAINS.map((c) => ({
      name: c,
      l2Rpc: config.l2Rpcs[c],
      predict: `/predict?chain=${c}&blocks=10`,
    })),
  })
}

// --- Server ---

const server = createServer(async (req, res) => {
  requestCount++
  const ip = getClientIp(req)

  if (!checkRateLimit(ip)) {
    json(res, 429, { error: 'Rate limit exceeded. Try again later.' })
    return
  }

  const url = parseUrl(req.url ?? '/')
  const path = url.pathname

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' })
    return
  }

  try {
    switch (path) {
      case '/predict':
        await handlePredict(req, res)
        break
      case '/health':
        handleHealth(req, res)
        break
      case '/chains':
        handleChains(req, res)
        break
      default:
        json(res, 404, {
          error: 'Not found',
          endpoints: {
            predict: 'GET /predict?chain=arbitrum&blocks=10',
            health: 'GET /health',
            chains: 'GET /chains',
          },
        })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    json(res, 500, { error: 'Internal server error', message })
  }
})

server.listen(config.port, config.host, () => {
  console.log(`gas-oracle API server running on http://${config.host}:${config.port}`)
  console.log(`  GET /predict?chain=<chain>&blocks=<n>  — predict gas costs`)
  console.log(`  GET /health                            — health check`)
  console.log(`  GET /chains                            — list supported chains`)
  console.log(`  Rate limit: ${config.rateLimit.maxRequests} req/${config.rateLimit.windowMs}ms per IP`)
})
