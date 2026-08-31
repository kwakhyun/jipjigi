import { z } from "zod";

export { formatCompactWon, formatWon } from "./format";

export const OperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mark_payment"),
    chargeId: z.string().min(1),
  }),
  z.object({
    type: z.literal("send_overdue_notice"),
    chargeId: z.string().min(1),
  }),
  z.object({
    type: z.literal("start_renewal"),
    leaseId: z.string().min(1),
  }),
  z.object({
    type: z.literal("retry_message"),
    messageId: z.string().min(1),
  }),
  z.object({
    type: z.literal("update_maintenance"),
    requestId: z.string().min(1),
    status: z.enum(["received", "scheduled", "completed"]),
    scheduledAt: z.string().datetime().optional(),
  }),
]);

export type Operation = z.infer<typeof OperationSchema>;

export type MessageDispatchOperationResult = {
  id: string;
  status: "scheduled" | "accepted" | "delivered" | "blocked" | "failed";
  guardrailReason: string | null;
  scheduledFor: string | null;
  duplicate: boolean;
  retryCount: number;
};

export type OperationResult =
  | { status: "paid"; unchanged: boolean }
  | { status: "received" | "scheduled" | "completed"; unchanged: boolean }
  | MessageDispatchOperationResult;

export const NotificationPreferencesSchema = z.object({
  rentReminder: z.boolean(),
  renewalReminder: z.boolean(),
  maintenanceUpdates: z.boolean(),
  marketing: z.boolean(),
  quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

export type BuildingSummary = {
  id: string;
  name: string;
  address: string;
  totalUnits: number;
  occupiedUnits: number;
};

export type RiskBriefing = {
  renewal: {
    leaseId: string;
    unitName: string;
    tenantName: string;
    daysLeft: number;
    currentDeposit: number;
    currentRent: number;
    suggestedRent: number;
    status: string;
  } | null;
  overdue: {
    chargeId: string;
    unitName: string;
    tenantName: string;
    amount: number;
    daysOverdue: number;
    noticeStatus: string;
  } | null;
  maintenance: {
    requestId: string;
    unitName: string;
    title: string;
    status: string;
    requestedAt: string;
  } | null;
};

export type DashboardSnapshot = {
  generatedAt: string;
  hasMutedBriefings: boolean;
  building: BuildingSummary;
  metrics: {
    billingPeriod: string | null;
    collectionRate: number;
    collectedAmount: number;
    expectedAmount: number;
    occupiedRate: number;
    openMaintenance: number;
  };
  briefing: RiskBriefing;
  recentActivities: Array<{
    id: string;
    label: string;
    detail: string;
    occurredAt: string;
    tone: "positive" | "neutral" | "warning";
  }>;
};
