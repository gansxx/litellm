export interface HealthCheckRecord {
  model_id?: string | null;
  status?: string | null;
  response_time_ms?: number | null;
}

export interface AvailabilityMetrics {
  availabilityPercent: number | null;
  averageLatencyMs: number | null;
  peakLatencyMs: number | null;
}

const emptyMetrics: AvailabilityMetrics = {
  availabilityPercent: null,
  averageLatencyMs: null,
  peakLatencyMs: null,
};

export function calculateAvailabilityMetrics(records: readonly HealthCheckRecord[]): Record<string, AvailabilityMetrics> {
  const byModel = new Map<string, HealthCheckRecord[]>();

  for (const record of records) {
    if (!record.model_id) continue;
    byModel.set(record.model_id, [...(byModel.get(record.model_id) ?? []), record]);
  }

  return Object.fromEntries(
    [...byModel.entries()].map(([modelId, modelRecords]) => {
      const successfulCount = modelRecords.filter((record) => record.status === "healthy").length;
      const latencySamples = modelRecords
        .map((record) => record.response_time_ms)
        .filter((latency): latency is number => typeof latency === "number" && Number.isFinite(latency));
      const metrics: AvailabilityMetrics = {
        availabilityPercent: (successfulCount / modelRecords.length) * 100,
        averageLatencyMs:
          latencySamples.length > 0 ? latencySamples.reduce((sum, latency) => sum + latency, 0) / latencySamples.length : null,
        peakLatencyMs: latencySamples.length > 0 ? Math.max(...latencySamples) : null,
      };
      return [modelId, metrics];
    }),
  );
}

export function metricsForModel(
  metrics: Record<string, AvailabilityMetrics>,
  modelId: string | undefined,
): AvailabilityMetrics {
  return modelId ? (metrics[modelId] ?? emptyMetrics) : emptyMetrics;
}
