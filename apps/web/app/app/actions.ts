"use server";

import {
  NotificationPreferencesSchema,
  OperationSchema,
  type NotificationPreferences,
  type Operation,
  type OperationResult,
} from "@rentflow/domain";
import { requireOwner } from "@/lib/auth/dal";
import { updatePreferences } from "@/lib/data/repository";
import { logger } from "@/lib/observability/logger";
import { OperationError, runOperation } from "@/lib/operations/service";
import { rateLimit } from "@/lib/security/request";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export async function runOperationAction(input: Operation): Promise<ActionResult<OperationResult>> {
  const user = await requireOwner();
  if (!(await rateLimit(`operation-action:${user.id}`, 40)).allowed) {
    return { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", code: "RATE_LIMITED" };
  }
  const parsed = OperationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "작업 요청이 유효하지 않습니다.", code: "INVALID_INPUT" };

  const startedAt = performance.now();
  try {
    const data = runOperation(user.id, parsed.data);
    logger.info("operation.action.completed", {
      userId: user.id,
      operation: parsed.data.type,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return { ok: true, data };
  } catch (error) {
    if (error instanceof OperationError) {
      logger.warn("operation.action.rejected", { userId: user.id, code: error.code, status: error.status });
      return { ok: false, error: error.message, code: error.code };
    }
    logger.error("operation.action.failed", {
      userId: user.id,
      operation: parsed.data.type,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return { ok: false, error: "작업을 처리하지 못했습니다." };
  }
}

export async function savePreferencesAction(
  input: NotificationPreferences,
): Promise<ActionResult<NotificationPreferences>> {
  const user = await requireOwner();
  if (!(await rateLimit(`preferences-action:${user.id}`, 20)).allowed) {
    return { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", code: "RATE_LIMITED" };
  }
  const parsed = NotificationPreferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "알림 설정을 다시 확인해 주세요.", code: "INVALID_INPUT" };

  try {
    return { ok: true, data: updatePreferences(user.id, parsed.data) };
  } catch (error) {
    logger.error("preferences.action.failed", {
      userId: user.id,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return { ok: false, error: "설정을 저장하지 못했습니다." };
  }
}
