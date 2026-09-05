import "server-only";
import { getDatabase } from "@/lib/db/client";
import { randomUUID } from "node:crypto";
import { assignVariant, briefingPriorityExperiment, type BriefingVariant } from "@jipjigi/experiments";

export async function getOrCreateExperimentAssignment(userId: string): Promise<BriefingVariant> {
  const db = await getDatabase();
  const existing = await db
    .prepare("SELECT variant FROM experiment_assignments WHERE user_id = ? AND experiment_key = ?")
    .get<{ variant: BriefingVariant }>(userId, briefingPriorityExperiment.key);
  if (existing) return existing.variant;
  const variant = assignVariant(briefingPriorityExperiment, userId);
  await db.prepare(
    `INSERT INTO experiment_assignments (id, user_id, experiment_key, variant, assigned_at)
     VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, experiment_key) DO NOTHING`,
  ).run(randomUUID(), userId, briefingPriorityExperiment.key, variant, new Date().toISOString());
  const assigned = await db.prepare("SELECT variant FROM experiment_assignments WHERE user_id = ? AND experiment_key = ?").get<{ variant: BriefingVariant }>(userId, briefingPriorityExperiment.key);
  return assigned?.variant ?? variant;
}
