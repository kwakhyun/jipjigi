import type { NotificationPreferences, DashboardSnapshot } from "@jipjigi/domain";
import type { BriefingVariant } from "@jipjigi/experiments";
import type { ContractRow, LedgerRow, MaintenanceRow, MessageRow } from "@/lib/data/repository";

export type OwnerResources = {
  contracts: ContractRow[];
  ledger: LedgerRow[];
  maintenance: MaintenanceRow[];
  messages: MessageRow[];
  preferences: NotificationPreferences;
};

export type BriefingResponse = {
  data: DashboardSnapshot;
  experiment: { key: string; variant: BriefingVariant };
};
