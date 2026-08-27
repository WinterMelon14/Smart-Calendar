import type { EventDraft, Weekday } from "./types";

const DAY_LABELS: Record<Weekday, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun"
};

function parseDate(value: string): Date | undefined {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDate(value: string, locale: string | undefined, includeWeekday: boolean): string {
  const date = parseDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(locale, {
    weekday: includeWeekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatRange(startValue: string, endValue: string, locale: string | undefined): string {
  if (startValue === endValue) return formatDate(startValue, locale, false);
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end) return `${startValue}–${endValue}`;
  const sameYear = start.getFullYear() === end.getFullYear();
  const startText = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric"
  }).format(start);
  const endText = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(end);
  return `${startText}–${endText}`;
}

function joinWeekdays(weekdays: Weekday[]): string {
  const labels = weekdays.map((day) => DAY_LABELS[day]);
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} & ${labels.at(-1)}`;
}

function timeSummary(draft: EventDraft): string {
  if (draft.allDay) return "All day";
  return `${draft.startTime || "Time needed"}${draft.endTime ? `–${draft.endTime}` : ""}`;
}

export function formatDraftSchedule(draft: EventDraft, locale?: string): string {
  const start = formatDate(draft.startDate, locale, true);
  if (draft.itemType === "task") {
    return `${start}${draft.startTime ? ` · Due ${draft.startTime}` : ""}`;
  }
  if (draft.kind === "recurring" && draft.recurrence) {
    const weekdays = joinWeekdays(draft.recurrence.weekdays);
    const range = formatRange(draft.startDate, draft.recurrence.untilDate, locale);
    return [weekdays, range, timeSummary(draft)].filter(Boolean).join(" · ");
  }
  return `${start} · ${timeSummary(draft)}`;
}
