import { z } from "zod";

export const EventNameSchema = z.enum([
  "page_viewed",
  "experiment_exposed",
  "briefing_opened",
  "renewal_started",
  "overdue_notice_requested",
  "payment_marked",
  "maintenance_updated",
  "crm_guardrail_blocked",
  "crm_message_dispatched",
  "seo_cta_clicked",
]);

export const ProductEventSchema = z.object({
  eventId: z.string().uuid(),
  name: EventNameSchema,
  anonymousId: z.string().min(8).max(128),
  sessionId: z.string().min(8).max(128),
  path: z.string().max(512),
  occurredAt: z.string().datetime(),
  properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

export type EventName = z.infer<typeof EventNameSchema>;
export type ProductEvent = z.infer<typeof ProductEventSchema>;

export const SAFE_PROPERTY_KEYS = new Set([
  "building_id",
  "unit_id",
  "lease_id",
  "charge_id",
  "request_id",
  "experiment_key",
  "variant",
  "source",
  "channel",
  "outcome",
  "reason",
]);

export function sanitizeProperties(properties: ProductEvent["properties"]) {
  return Object.fromEntries(Object.entries(properties).filter(([key]) => SAFE_PROPERTY_KEYS.has(key)));
}
