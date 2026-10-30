// The runtime opens at most one connection per invocation. Keep one of the
// restricted login's five connections free for diagnostics/maintenance.
export const productionCapacity = {
  databaseConnections: 5,
  reservedConcurrency: 4,
  routeSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 12 },
} as const

export function assertProductionCapacity(accountConcurrency: number) {
  if (accountConcurrency < 100 + productionCapacity.reservedConcurrency) {
    throw new Error('Production capacity requires sufficient reservable Lambda concurrency')
  }
  if (productionCapacity.reservedConcurrency >= productionCapacity.databaseConnections) {
    throw new Error('Production runtime must leave database connection headroom')
  }
}
