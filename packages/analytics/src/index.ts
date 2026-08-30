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

export const BrowserEventNameSchema = z.enum([
  "page_viewed", "experiment_exposed", "briefing_opened", "risk_evidence_opened", "seo_cta_clicked",
]);
export type BrowserEventName = z.infer<typeof BrowserEventNameSchema>;

const identifier = z.string().min(1).max(160);
const source = z.string().min(1).max(80);
const channel = z.enum(["sandbox_alimtalk", "push"]);
const outcome = z.enum(["scheduled", "accepted", "delivered", "blocked", "failed"]);
const riskType = z.enum(["lease_expiring", "payment_overdue", "maintenance_urgent", "none"]);
const entity = { lease_id: identifier.optional(), charge_id: identifier.optional() };
const hasEntity = (value: { lease_id?: string | undefined; charge_id?: string | undefined }) => Boolean(value.lease_id || value.charge_id);

const eventProperties = {
  page_viewed: z.object({}),
  experiment_exposed: z.object({ experiment_key: identifier, variant: z.enum(["risk-first", "agenda-first"]), risk_type: riskType, risk_signal_id: identifier }),
  briefing_opened: z.object({ building_id: identifier, source }),
  risk_evidence_opened: z.object({ ...entity, request_id: identifier.optional(), risk_type: riskType, source }).refine((value) => hasEntity(value) || Boolean(value.request_id), "위험 대상이 필요합니다."),
  renewal_started: z.object({ lease_id: identifier, channel }),
  overdue_notice_requested: z.object({ charge_id: identifier, channel }),
  payment_marked: z.object({ charge_id: identifier, outcome: z.literal("paid") }),
  maintenance_updated: z.object({ request_id: identifier, outcome: z.enum(["received", "scheduled", "completed"]) }),
  notification_preferences_updated: z.object({ outcome: z.literal("saved"), source }),
  crm_message_requested: z.object({ ...entity, message_id: identifier, channel, outcome }).refine(hasEntity, "발송 대상이 필요합니다."),
  crm_guardrail_blocked: z.object({ ...entity, channel, reason: z.enum(["missing_consent", "frequency_cap"]) }).refine(hasEntity, "발송 대상이 필요합니다."),
  crm_message_delivery_updated: z.object({ message_id: identifier, provider_status: z.enum(["delivered", "failed"]), retry_count: z.number().int().nonnegative() }),
  crm_message_retry_requested: z.object({ message_id: identifier, retry_count: z.number().int().nonnegative(), outcome }),
  crm_opted_out: z.object({ lease_id: identifier, channel }),
  renewal_response_recorded: z.object({ lease_id: identifier, response: z.enum(["agreed", "declined"]) }),
  seo_cta_clicked: z.object({ source }),
} satisfies Record<z.infer<typeof EventNameSchema>, z.ZodType>;

export const ProductEventSchema = z.object({
  eventId: z.string().uuid(),
  name: EventNameSchema,
  anonymousId: z.string().min(8).max(128),
  sessionId: z.string().min(8).max(128),
  path: z.string().max(512),
  occurredAt: z.string().datetime(),
  context: EventContextSchema,
  properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
}).superRefine((event, context) => {
  const result = eventProperties[event.name].safeParse(event.properties);
  if (!result.success) {
    for (const issue of result.error.issues) context.addIssue({ ...issue, path: ["properties", ...issue.path] });
  }
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
