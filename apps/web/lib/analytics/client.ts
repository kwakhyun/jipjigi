"use client";

import type { EventName } from "@jipjigi/analytics";

const ANONYMOUS_KEY = "jipjigi:v1:anonymous-id";
const SESSION_KEY = "jipjigi:v1:session-id";

function storageId(storage: Storage, key: string) {
  const current = storage.getItem(key);
  if (current) return current;
  const next = crypto.randomUUID();
  storage.setItem(key, next);
  return next;
}

export function getAnalyticsIdentity() {
  return {
    anonymousId: storageId(window.localStorage, ANONYMOUS_KEY),
    sessionId: storageId(window.sessionStorage, SESSION_KEY),
  };
}

export function track(
  name: EventName,
  properties: Record<string, string | number | boolean | null> = {},
  path = window.location.pathname,
) {
  try {
    const identity = getAnalyticsIdentity();
    const body = JSON.stringify({
      eventId: crypto.randomUUID(),
      name,
      anonymousId: identity.anonymousId,
      sessionId: identity.sessionId,
      path,
      occurredAt: new Date().toISOString(),
      properties,
    });
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Network failures must not surface as unhandled rejections.
    });
  } catch {
    // Analytics is best-effort and never blocks the user's primary task.
  }
}
