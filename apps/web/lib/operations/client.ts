"use client";

import type { Operation, OperationResult } from "@rentflow/domain";
import { runOperationAction } from "@/app/app/actions";

export async function submitOperation(operation: Operation): Promise<OperationResult> {
  const result = await runOperationAction(operation);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
