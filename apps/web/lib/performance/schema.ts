import { z } from "zod";

export const CoreWebVitalNameSchema = z.enum(["CLS", "INP", "LCP"]);
export const WebVitalNameSchema = z.enum(["CLS", "FCP", "FID", "INP", "LCP", "TTFB"]);

export const WebVitalPayloadSchema = z.object({
  id: z.string().uuid(),
  metricId: z.string().min(1).max(128),
  name: WebVitalNameSchema,
  value: z.number().finite().min(0).max(300_000),
  delta: z.number().finite().min(-300_000).max(300_000),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  navigationType: z.string().min(1).max(64),
  path: z.string().startsWith("/").max(512),
  anonymousId: z.string().min(8).max(128),
  sessionId: z.string().min(8).max(128),
  occurredAt: z.string().datetime(),
});

export type CoreWebVitalName = z.infer<typeof CoreWebVitalNameSchema>;
export type WebVitalPayload = z.infer<typeof WebVitalPayloadSchema>;

export const CORE_WEB_VITAL_TARGETS: Record<CoreWebVitalName, number> = {
  LCP: 2_500,
  INP: 200,
  CLS: 0.1,
};
