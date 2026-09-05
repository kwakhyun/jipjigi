export type LedgerRow = {
  id: string;
  period: string;
  dueDate: string;
  amount: number;
  status: "paid" | "overdue" | "upcoming";
  paidAt: string | null;
  unitName: string;
  tenantName: string;
  buildingName: string;
};

export type ContractRow = {
  id: string;
  unitName: string;
  tenantName: string;
  tenantPhoneMasked: string;
  startDate: string;
  endDate: string;
  depositAmount: number;
  monthlyRent: number;
  renewalStatus: "none" | "attention" | "requested" | "agreed" | "ended";
  buildingName: string;
  timeline: ContractTimelineEvent[];
};

export type ContractTimelineEvent = {
  id: string;
  kind: "message" | "response";
  status: "scheduled" | "accepted" | "delivered" | "blocked" | "failed" | "agreed" | "declined";
  occurredAt: string;
  retryCount: number;
};

export type MaintenanceRow = {
  id: string;
  unitName: string;
  buildingName: string;
  title: string;
  description: string;
  priority: "low" | "normal" | "urgent";
  status: "received" | "scheduled" | "completed";
  requestedAt: string;
  scheduledAt: string | null;
  completedAt: string | null;
};

export type MessageRow = {
  id: string;
  entityType: string;
  entityId: string;
  channel: string;
  templateKey: string;
  status: "scheduled" | "accepted" | "delivered" | "blocked" | "failed";
  guardrailReason: string | null;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  retryCount: number;
};
