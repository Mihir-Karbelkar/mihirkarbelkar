/**
 * Monthly cost of serving model requests two ways:
 * - "before": every request goes to a pay-per-token model API (like AWS Lambda: no fixed cost).
 * - "after": a share of requests moves to a small model on rented GPUs, billed per hour
 *   whether busy or idle (like EC2), and the rest stays on the API.
 * GPUs are sized for peak traffic, not the average. People time and quality are not modelled.
 */
export interface CostInputs {
  requestsPerDay: number;
  inputTokens: number;
  outputTokens: number;
  /** API price in dollars per million input / output tokens. */
  apiInputPrice: number;
  apiOutputPrice: number;
  /** Share of requests (0–1) a small model can take over. */
  movableShare: number;
  /** Dollars per hour for one rented GPU. */
  gpuHourly: number;
  /** Requests per second one GPU can serve with the small model. */
  gpuRequestsPerSecond: number;
  /** Peak traffic as a multiple of the average. */
  peakFactor: number;
}

export interface CostResult {
  apiCostPerRequest: number;
  before: number;
  after: number;
  gpus: number;
  gpuCost: number;
  apiCostAfter: number;
  savings: number;
}

export const DAYS_PER_MONTH = 30.4;
export const HOURS_PER_MONTH = 730;

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

export function monthlyCost(i: CostInputs): CostResult {
  const rpd = Math.max(0, i.requestsPerDay || 0);
  const share = clamp(i.movableShare, 0, 1);
  const apiCostPerRequest =
    (Math.max(0, i.inputTokens) * Math.max(0, i.apiInputPrice) +
      Math.max(0, i.outputTokens) * Math.max(0, i.apiOutputPrice)) /
    1e6;
  const monthly = rpd * DAYS_PER_MONTH;
  const before = monthly * apiCostPerRequest;
  const movedPerSecond = (rpd * share) / 86400;
  const peak = movedPerSecond * Math.max(1, i.peakFactor || 1);
  const capacity = Math.max(1e-9, i.gpuRequestsPerSecond || 0);
  const gpus = share > 0 ? Math.max(1, Math.ceil(peak / capacity)) : 0;
  const gpuCost = gpus * Math.max(0, i.gpuHourly) * HOURS_PER_MONTH;
  const apiCostAfter = monthly * (1 - share) * apiCostPerRequest;
  const after = apiCostAfter + gpuCost;
  return {
    apiCostPerRequest,
    before,
    after,
    gpus,
    gpuCost,
    apiCostAfter,
    savings: before - after,
  };
}

/** Lowest requests/day at which own GPUs become cheaper, or null if not below `max`. */
export function breakEvenRequestsPerDay(
  i: CostInputs,
  max = 1e8,
): number | null {
  let lo = 1;
  // Walk up in small multiplicative steps, then refine; the GPU cost is a step function.
  let prev = lo;
  for (let rpd = lo; rpd <= max; rpd *= 1.05) {
    const r = monthlyCost({ ...i, requestsPerDay: rpd });
    if (r.savings > 0) {
      let a = prev;
      let b = rpd;
      for (let k = 0; k < 40; k++) {
        const m = (a + b) / 2;
        if (monthlyCost({ ...i, requestsPerDay: m }).savings > 0) b = m;
        else a = m;
      }
      return b;
    }
    prev = rpd;
  }
  return null;
}

/** The post's example: an AI support product, 5 model calls per question, 4 of them narrow. */
export const CALLS_PER_QUESTION = 5;
export const exampleInputs: CostInputs = {
  requestsPerDay: 10000 * CALLS_PER_QUESTION,
  inputTokens: 2000,
  outputTokens: 300,
  apiInputPrice: 3,
  apiOutputPrice: 15,
  movableShare: 0.8,
  gpuHourly: 1.2,
  gpuRequestsPerSecond: 2,
  peakFactor: 3,
};
