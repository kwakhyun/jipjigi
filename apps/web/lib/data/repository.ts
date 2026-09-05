import "server-only";

// Compatibility facade. Implementations and DTOs have separate owners.
export type * from "./types";
export { getUserByEmail } from "./accounts";
export { listBuildings, getDashboardSnapshot } from "./dashboard";
export { listContracts } from "./contracts";
export { listLedger } from "./ledger";
export { listMaintenance } from "./maintenance";
export { listMessages } from "./messages";
export { getPreferences, updatePreferences } from "./preferences";
export { getOrCreateExperimentAssignment } from "./experiments";
export { getGrowthOverview } from "./growth";
export { getWebVitalsOverview } from "./vitals";
export { writeAudit, databaseHealth } from "./audit";
