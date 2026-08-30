"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Operation } from "@jipjigi/domain";
import { submitOperation } from "@/lib/operations/client";
import { useOwnerId } from "./owner-context";
import { affectedResources, invalidateOwnerResources } from "./invalidation";

export function useOperationMutation() {
  const client = useQueryClient();
  const ownerId = useOwnerId();
  return useMutation({
    mutationFn: (operation: Operation) => submitOperation(operation),
    retry: 0,
    networkMode: "always",
    // Also refresh after a failed response: the server may already have saved it.
    // A refetch error is displayed separately, never retried as a mutation.
    onSettled: (_data, _error, operation) => invalidateOwnerResources(client, ownerId, affectedResources(operation.type)),
  });
}
