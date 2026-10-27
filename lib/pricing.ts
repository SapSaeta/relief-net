// Public list prices in USD (Oct 2026). Used for the usage ledger, not for billing.
// Muse Spark 1.3 Standard and Muse Spark Open on Baseten share the same token rates.

const PER_MILLION = 1_000_000;

const TOKEN_PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  "muse-spark-1.3": { input: 1.25, cachedInput: 0.15, output: 4.25 },
  "meta-models/muse-spark-open-1026": { input: 1.25, cachedInput: 0.15, output: 4.25 },
};

export const UNIT_PRICES = {
  samImage: 2.5 / 1000,
  samVideoFrame: 0.2 / 1000,
  voicePerHour: 0.18,
  museImage: 0.01,
} as const;

export function tokenCostUsd(model: string, tokens: { input: number; cachedInput: number; output: number }): number {
  const price = TOKEN_PRICES[model];
  if (!price) return 0;
  const uncached = Math.max(0, tokens.input - tokens.cachedInput);
  return (uncached * price.input + tokens.cachedInput * price.cachedInput + tokens.output * price.output) / PER_MILLION;
}
