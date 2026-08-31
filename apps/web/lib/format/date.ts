const DAY_IN_MS = 86_400_000;
const seoulDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
const seoulDateTime = new Intl.DateTimeFormat("en-CA", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Seoul",
});

export function daysUntilDate(value: string | undefined, referenceTime: string) {
  if (!value) return "-";
  const referenceDay = seoulDay.format(new Date(referenceTime));
  return Math.max(0, Math.round((Date.parse(`${value}T00:00:00Z`) - Date.parse(`${referenceDay}T00:00:00Z`)) / DAY_IN_MS));
}

export function relativeDayLabel(value: string, referenceTime: string) {
  const dayNumber = (time: string) => Date.parse(`${seoulDay.format(new Date(time))}T00:00:00Z`) / DAY_IN_MS;
  const days = dayNumber(referenceTime) - dayNumber(value);
  return days <= 0 ? "오늘" : `${days}일 전`;
}

function koreanClock(parts: Intl.DateTimeFormatPart[]) {
  const hour = Number(parts.find((item) => item.type === "hour")?.value);
  const minute = parts.find((item) => item.type === "minute")?.value;
  const displayHour = hour % 12 || 12;
  // Node and browser ICU releases can disagree on ko-KR day periods (AM/오전).
  // Keep display text deterministic without disabling SSR or hydration checks.
  return `${hour < 12 ? "오전" : "오후"} ${displayHour}:${minute}`;
}

export function formatKoreanTime(value: string) {
  return koreanClock(seoulDateTime.formatToParts(new Date(value)));
}

export function formatKoreanScheduleDateTime(value: string) {
  const parts = seoulDateTime.formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${Number(part("month"))}월 ${Number(part("day"))}일 ${koreanClock(parts)}`;
}
