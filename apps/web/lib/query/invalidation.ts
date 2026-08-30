import type { QueryClient } from "@tanstack/react-query";
import type { Operation } from "@jipjigi/domain";
import { ownerKeys } from "./keys";

export function affectedResources(operation: Operation["type"]) {
  switch (operation) {
    case "mark_payment": return ["ledger", "briefing"];
    case "update_maintenance": return ["maintenance", "briefing"];
    case "start_renewal":
    case "send_overdue_notice":
    case "retry_message": return ["messages", "contracts", "ledger", "briefing"];
  }
}

export async function invalidateOwnerResources(client: QueryClient, ownerId: string, resources: readonly string[]) {
  await Promise.all(resources.map((resource) => client.invalidateQueries({ queryKey: ownerKeys.resource(ownerId, resource) })));
}
