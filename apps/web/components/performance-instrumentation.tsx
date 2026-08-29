"use client";

import dynamic from "next/dynamic";

const WebVitalsReporter = dynamic(
  () => import("@/components/web-vitals-reporter").then((module) => module.WebVitalsReporter),
  { ssr: false },
);

export function PerformanceInstrumentation() {
  return <WebVitalsReporter />;
}
