const DAY_IN_MS = 86_400_000;

export function daysUntilDate(value: string | undefined, referenceTime: string) {
  if (!value) return "-";
  const referenceDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(referenceTime));
  return Math.max(0, Math.round((Date.parse(`${value}T00:00:00Z`) - Date.parse(`${referenceDay}T00:00:00Z`)) / DAY_IN_MS));
}

export function relativeDayLabel(value: string, referenceTime: string) {
  const days = Math.floor((Date.parse(referenceTime) - Date.parse(value)) / DAY_IN_MS);
  return days <= 0 ? "오늘" : `${days}일 전`;
}

export function formatKoreanScheduleDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Seoul",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const hour = Number(part("hour"));
  const displayHour = hour % 12 || 12;

  return `${Number(part("month"))}월 ${Number(part("day"))}일 ${hour < 12 ? "오전" : "오후"} ${displayHour}:${part("minute")}`;
}
