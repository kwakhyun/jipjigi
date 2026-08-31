import "server-only";

import { randomUUID } from "node:crypto";
import { assignVariant, briefingPriorityExperiment, type BriefingVariant } from "@jipjigi/experiments";
import { getDatabase, type AppDatabase } from "@/lib/db/client";
import { seedDemoScenario } from "./scenario";

export const DEMO_LIFETIME_MS = 12 * 60 * 60_000;
export const MAX_DEMO_WORKSPACES = 50;

export type DemoWorkspace = {
  id: string;
  ownerId: string;
  operatorId: string;
  variant: BriefingVariant;
  createdAt: string;
  expiresAt: string;
};

export class DemoWorkspaceError extends Error {
  constructor(readonly code: "DISABLED" | "CAPACITY" | "NOT_OWNED") {
    super(code === "CAPACITY" ? "현재 체험 공간이 가득 찼어요. 잠시 후 다시 시도해 주세요." : "데모 세션이 만료됐어요. 다시 로그인해 주세요.");
  }
}

export function demoEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_AUTH === "true";
}

export function isDemoCredential(id: string) {
  return id === "owner-1" || id === "operator-1";
}

async function findWorkspace(db: AppDatabase, id: string, now: Date) {
  return db.prepare(`SELECT id, owner_id AS ownerId, operator_id AS operatorId, variant,
    created_at AS createdAt, expires_at AS expiresAt FROM demo_workspaces WHERE id = ? AND expires_at::timestamptz > ?::timestamptz`)
    .get<DemoWorkspace>(id, now.toISOString());
}

async function lockCreation(db: AppDatabase) {
  if (db.store === "neon") await db.query("SELECT pg_advisory_xact_lock(742719342)");
}

/** Only IDs read from demo_workspaces may reach this bounded cleanup. */
async function removeWorkspace(db: AppDatabase, workspace: DemoWorkspace) {
  const users = [workspace.ownerId, workspace.operatorId];
  await db.prepare("DELETE FROM renewal_response_events WHERE dispatch_id IN (SELECT id FROM message_dispatches WHERE user_id IN (?, ?))").run(...users);
  await db.prepare("DELETE FROM message_delivery_events WHERE dispatch_id IN (SELECT id FROM message_dispatches WHERE user_id IN (?, ?))").run(...users);
  for (const table of ["crm_opt_outs", "message_dispatches", "product_events", "web_vitals", "audit_logs", "notification_preferences", "experiment_assignments"] as const) {
    await db.prepare(`DELETE FROM ${table} WHERE user_id IN (?, ?)`).run(...users);
  }
  const unitScope = "SELECT u.id FROM units u JOIN buildings b ON b.id = u.building_id WHERE b.owner_id = ?";
  await db.prepare(`DELETE FROM maintenance_requests WHERE unit_id IN (${unitScope})`).run(workspace.ownerId);
  await db.prepare(`DELETE FROM charges WHERE lease_id IN (SELECT id FROM leases WHERE unit_id IN (${unitScope}))`).run(workspace.ownerId);
  await db.prepare(`DELETE FROM leases WHERE unit_id IN (${unitScope})`).run(workspace.ownerId);
  await db.prepare("DELETE FROM units WHERE building_id IN (SELECT id FROM buildings WHERE owner_id = ?)").run(workspace.ownerId);
  await db.prepare("DELETE FROM buildings WHERE owner_id = ?").run(workspace.ownerId);
  await db.prepare("DELETE FROM demo_workspaces WHERE id = ?").run(workspace.id);
  await db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(...users);
}

async function createWorkspace(db: AppDatabase, now: Date, selectedVariant?: BriefingVariant) {
  // At most one expired workspace is removed per creation. No background worker
  // or paid cron is needed, and inactive data cannot grow beyond the hard cap.
  const expired = await db.prepare(`SELECT id, owner_id AS ownerId, operator_id AS operatorId, variant,
    created_at AS createdAt, expires_at AS expiresAt FROM demo_workspaces
    WHERE expires_at::timestamptz <= ?::timestamptz ORDER BY expires_at LIMIT 1`).get<DemoWorkspace>(now.toISOString());
  if (expired) await removeWorkspace(db, expired);
  const count = await db.prepare("SELECT COUNT(*)::int AS count FROM demo_workspaces").get<{ count: number }>();
  if ((count?.count ?? 0) >= MAX_DEMO_WORKSPACES) throw new DemoWorkspaceError("CAPACITY");

  const id = randomUUID();
  const ownerId = `demo-owner-${id}`;
  const operatorId = `demo-operator-${id}`;
  const variant = selectedVariant ?? assignVariant(briefingPriorityExperiment, ownerId);
  const workspace: DemoWorkspace = {
    id, ownerId, operatorId, variant,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DEMO_LIFETIME_MS).toISOString(),
  };
  // Workspace users cannot sign in by email/password. Only validated public
  // demo credentials plus the signed workspace cookie can issue their session.
  await db.prepare(`INSERT INTO users (id, email, name, password_hash, role, created_at)
    VALUES (?, ?, ?, '!', 'owner', ?), (?, ?, ?, '!', 'operator', ?)`)
    .run(ownerId, `${ownerId}@jipjigi.invalid`, "김서준", workspace.createdAt,
      operatorId, `${operatorId}@jipjigi.invalid`, "집지기 운영자", workspace.createdAt);
  await db.prepare(`INSERT INTO demo_workspaces (id, owner_id, operator_id, variant, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, ownerId, operatorId, variant, workspace.createdAt, workspace.expiresAt);
  await seedDemoScenario(db, id, ownerId, operatorId, variant, now);
  return workspace;
}

export async function enterDemoWorkspace(savedId?: string | null, now = new Date()) {
  if (!demoEnabled()) throw new DemoWorkspaceError("DISABLED");
  const db = await getDatabase();
  return db.transaction(async (transaction) => {
    await lockCreation(transaction);
    const existing = savedId ? await findWorkspace(transaction, savedId, now) : undefined;
    return existing ?? createWorkspace(transaction, now);
  });
}

export async function restartDemoWorkspace(workspaceId: string, actorId: string, variant: BriefingVariant, now = new Date()) {
  if (!demoEnabled()) throw new DemoWorkspaceError("DISABLED");
  const db = await getDatabase();
  return db.transaction(async (transaction) => {
    await lockCreation(transaction);
    const existing = await findWorkspace(transaction, workspaceId, now);
    if (!existing || ![existing.ownerId, existing.operatorId].includes(actorId)) throw new DemoWorkspaceError("NOT_OWNED");
    // Removal and replacement are atomic; failure restores the previous demo.
    await removeWorkspace(transaction, existing);
    return createWorkspace(transaction, now, variant);
  });
}
