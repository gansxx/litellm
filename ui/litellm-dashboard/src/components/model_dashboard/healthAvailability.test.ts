import { describe, expect, it } from "vitest";

import { calculateAvailabilityMetrics, metricsForModel } from "./healthAvailability";

describe("calculateAvailabilityMetrics", () => {
  it("groups probe history by endpoint and calculates availability, average latency, and peak latency", () => {
    const metrics = calculateAvailabilityMetrics([
      { model_id: "endpoint-a", status: "healthy", response_time_ms: 10 },
      { model_id: "endpoint-a", status: "unhealthy", response_time_ms: 50 },
      { model_id: "endpoint-a", status: "healthy", response_time_ms: 30 },
      { model_id: "endpoint-b", status: "healthy", response_time_ms: null },
    ]);

    expect(metrics["endpoint-a"]).toEqual({
      availabilityPercent: 66.66666666666666,
      averageLatencyMs: 30,
      peakLatencyMs: 50,
    });
    expect(metrics["endpoint-b"]).toEqual({
      availabilityPercent: 100,
      averageLatencyMs: null,
      peakLatencyMs: null,
    });
  });

  it("returns empty metrics for an endpoint without recorded probes", () => {
    expect(metricsForModel({}, "unknown")).toEqual({
      availabilityPercent: null,
      averageLatencyMs: null,
      peakLatencyMs: null,
    });
  });
});
