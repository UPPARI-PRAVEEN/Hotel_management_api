require('dotenv').config();

const baseUrl = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const hotelId = process.env.BENCHMARK_HOTEL_ID || 'DXB00001';
const searchId = process.env.BENCHMARK_SEARCH_ID || 'SRCH0000001';
const mealPlan = process.env.BENCHMARK_MEAL_PLAN || 'RO';
const cancellationPolicy = process.env.BENCHMARK_CANCELLATION_POLICY || 'Non-Refundable';
const iterations = Number(process.env.BENCHMARK_ITERATIONS || 30);
const targetP95Ms = Number(process.env.BENCHMARK_TARGET_P95_MS || 0);

function percentile(values, percentileValue) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(percentileValue * sorted.length) - 1)];
}

async function main() {
  if (!Number.isInteger(iterations) || iterations < 2) {
    throw new Error('BENCHMARK_ITERATIONS must be an integer of at least 2.');
  }

  const url = new URL(`${baseUrl}/api/v1/hotels/${encodeURIComponent(hotelId)}/supplier-recommendation`);
  url.searchParams.set('searchId', searchId);
  url.searchParams.set('mealPlan', mealPlan);
  url.searchParams.set('cancellationPolicy', cancellationPolicy);

  const clientLatencies = [];
  const apiLatencies = [];
  const cacheStatuses = {};
  for (let i = 0; i < iterations; i++) {
    const started = performance.now();
    const response = await fetch(url);
    const elapsed = performance.now() - started;
    const body = await response.json();
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${JSON.stringify(body)}`);
    }

    clientLatencies.push(elapsed);
    apiLatencies.push(Number(body.latencyMs));
    const status = body.cache?.status || 'not-reported';
    cacheStatuses[status] = (cacheStatuses[status] || 0) + 1;
  }

  const report = {
    endpoint: url.toString(),
    iterations,
    cacheStatuses,
    firstRequestClientLatencyMs: Number(clientLatencies[0].toFixed(2)),
    warmClientP50Ms: Number(percentile(clientLatencies.slice(1), 0.50).toFixed(2)),
    warmClientP95Ms: Number(percentile(clientLatencies.slice(1), 0.95).toFixed(2)),
    apiReportedP95Ms: Number(percentile(apiLatencies, 0.95).toFixed(2)),
    targetP95Ms: targetP95Ms || null
  };
  console.log(JSON.stringify(report, null, 2));

  if (targetP95Ms > 0 && report.warmClientP95Ms > targetP95Ms) {
    throw new Error(`Warm-path p95 ${report.warmClientP95Ms} ms exceeds target ${targetP95Ms} ms.`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
