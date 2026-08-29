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
