export const ownerKeys = {
  all: (ownerId: string) => ["owner", ownerId] as const,
  resource: (ownerId: string, resource: string) => ["owner", ownerId, resource] as const,
  briefing: (ownerId: string, buildingId: string) => ["owner", ownerId, "briefing", buildingId] as const,
};
