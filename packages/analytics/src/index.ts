import { z } from "zod";

export const EventNameSchema = z.enum([
  "page_viewed",
  "experiment_exposed",
  "briefing_opened",
  "risk_evidence_opened",
  "renewal_started",
  "overdue_notice_requested",
  "payment_marked",
  "maintenance_updated",
  "notification_preferences_updated",
  "crm_guardrail_blocked",
  "crm_message_requested",
  "crm_message_delivery_updated",
  "crm_message_retry_requested",
  "crm_opted_out",
  "renewal_response_recorded",
  "seo_cta_clicked",
]);

export const EventContextSchema = z.object({
  releaseVersion: z.string().min(1).max(80),
  experimentKey: z.string().min(1).max(120).nullable().default(null),
  variant: z.string().min(1).max(80).nullable().default(null),
  userSegment: z.string().min(1).max(80),
});

export const ProductEventSchema = z.object({
  eventId: z.string().uuid(),
  name: EventNameSchema,
  anonymousId: z.string().min(8).max(128),
  sessionId: z.string().min(8).max(128),
  path: z.string().max(512),
  occurredAt: z.string().datetime(),
  context: EventContextSchema,
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
  "message_id",
  "risk_signal_id",
  "risk_type",
  "reason_code",
  "experiment_key",
  "variant",
  "source",
  "channel",
  "outcome",
  "reason",
  "template_version",
  "consent_checked",
  "quiet_hours_applied",
  "provider_status",
  "retry_count",
  "billing_period",
  "response",
]);

export function sanitizeProperties(properties: ProductEvent["properties"]) {
  return Object.fromEntries(Object.entries(properties).filter(([key]) => SAFE_PROPERTY_KEYS.has(key)));
}
