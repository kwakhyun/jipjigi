"use client";

import { useReportWebVitals } from "next/web-vitals";
import { getAnalyticsIdentity } from "@/lib/analytics/client";

type WebVitalMetric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];
let documentPath: string | null = null;

function reportWebVital(metric: WebVitalMetric) {
  try {
    const identity = getAnalyticsIdentity();
    const payload = JSON.stringify({
      id: crypto.randomUUID(),
      metricId: metric.id,
      name: metric.name,
      value: metric.value,
      delta: metric.delta,
      rating: metric.rating,
      navigationType: metric.navigationType,
      path: documentPath ?? window.location.pathname,
      anonymousId: identity.anonymousId,
      sessionId: identity.sessionId,
      occurredAt: new Date().toISOString(),
    });
    const queued = navigator.sendBeacon?.(
      "/api/vitals",
      new Blob([payload], { type: "application/json" }),
    );
    if (queued) return;
    void fetch("/api/vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Performance telemetry is best-effort and never blocks the product flow.
    });
  } catch {
    // Hardened browsers may disable storage, crypto, or beacon APIs.
  }
}

export function WebVitalsReporter() {
  documentPath ??= window.location.pathname;
  useReportWebVitals(reportWebVital);
  return null;
}
