export type GuardrailInput = {
  consent: boolean;
  recentDispatchCount: number;
  now: Date;
  quietHoursStart: string;
  quietHoursEnd: string;
};

export type GuardrailDecision =
  | { outcome: "blocked"; reason: "missing_consent" | "frequency_cap" }
  | { outcome: "scheduled"; scheduledFor: string; reason: "quiet_hours" }
  | { outcome: "allowed" };

function parseClock(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function seoulParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hours: value("hour"),
    minutes: value("minute"),
  };
}

function inQuietHours(current: number, start: number, end: number) {
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function nextAllowedTime(now: Date, startMinutes: number, endMinutes: number) {
  const current = seoulParts(now);
  const currentMinutes = current.hours * 60 + current.minutes;
  const targetDayOffset = startMinutes > endMinutes && currentMinutes >= startMinutes ? 1 : 0;
  const targetHours = Math.floor(endMinutes / 60);
  const targetMinutes = (endMinutes % 60) + 5;
  return new Date(
    Date.UTC(
      current.year,
      current.month - 1,
      current.day + targetDayOffset,
      targetHours - 9,
      targetMinutes,
    ),
  ).toISOString();
}

export function evaluateGuardrails(input: GuardrailInput): GuardrailDecision {
  if (!input.consent) return { outcome: "blocked", reason: "missing_consent" };
  if (input.recentDispatchCount >= 2) return { outcome: "blocked", reason: "frequency_cap" };

  const start = parseClock(input.quietHoursStart);
  const end = parseClock(input.quietHoursEnd);
  const parts = seoulParts(input.now);
  if (inQuietHours(parts.hours * 60 + parts.minutes, start, end)) {
    return { outcome: "scheduled", reason: "quiet_hours", scheduledFor: nextAllowedTime(input.now, start, end) };
  }
  return { outcome: "allowed" };
}
