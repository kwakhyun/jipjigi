"use client";

import { createContext, useContext } from "react";

export const OwnerContext = createContext<string | null>(null);

export function useOwnerId() {
  const ownerId = useContext(OwnerContext);
  if (!ownerId) throw new Error("Owner query provider is required");
  return ownerId;
}
