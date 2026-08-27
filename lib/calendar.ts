import type { CalendarEventResource, EventDraft, RecentEvent, Weekday } from "./types";

const DAY_TO_INDEX: Record<Weekday, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseDate(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export function addDays(date: string, days: number): string {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function recurrenceCount(startDate: string, untilDate: string, weekdays: Weekday[]): number {
  const allowed = new Set(weekdays.map((day) => DAY_TO_INDEX[day]));
  let cursor = parseDate(startDate);
  const end = parseDate(untilDate);
  const rangeDays = Math.floor((end.getTime() - cursor.getTime()) / 86_400_000);
  if (rangeDays < 0 || rangeDays > 3_660) {
    throw new Error("Recurring events must end within 10 years of their start date.");
  }
  let count = 0;
  while (cursor <= end) {
    if (allowed.has(cursor.getUTCDay())) count += 1;
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return count;
}

function formatCompactDate(date: string): string {
  return date.replaceAll("-", "");
}

function eventDescription(draft: EventDraft): string | undefined {
  const parts = [draft.notes?.trim()];
  if (draft.sourceUrl) parts.push(`Source: ${draft.sourceUrl}`);
  return parts.filter(Boolean).join("\n\n") || undefined;
}

export function toCalendarEvent(draft: EventDraft): CalendarEventResource {
  const endDate = draft.endDate && draft.endDate >= draft.startDate ? draft.endDate : draft.startDate;
  const resource: CalendarEventResource = {
    summary: draft.title.trim(),
    location: draft.location?.trim() || undefined,
    description: eventDescription(draft),
    start: draft.allDay
      ? { date: draft.startDate }
      : { dateTime: `${draft.startDate}T${draft.startTime ?? "09:00"}:00`, timeZone: draft.timeZone },
    end: draft.allDay
      ? { date: addDays(endDate, 1) }
      : {
          dateTime: `${draft.endDate ?? draft.startDate}T${draft.endTime ?? "10:00"}:00`,
          timeZone: draft.timeZone
        }
  };

  if (draft.kind === "recurring" && draft.recurrence) {
    const { weekdays, untilDate, excludedDates } = draft.recurrence;
    const count = recurrenceCount(draft.startDate, untilDate, weekdays);
    resource.recurrence = [`RRULE:FREQ=WEEKLY;BYDAY=${weekdays.join(",")};COUNT=${Math.max(1, count)}`];
    for (const date of excludedDates) {
      resource.recurrence.push(
        draft.allDay
          ? `EXDATE;VALUE=DATE:${formatCompactDate(date)}`
          : `EXDATE;TZID=${draft.timeZone}:${formatCompactDate(date)}T${(draft.startTime ?? "09:00").replace(":", "")}00`
      );
    }
  }
  return resource;
}

export function eventFingerprint(draft: EventDraft): string {
  const canonical = JSON.stringify({
    itemType: draft.itemType,
    title: draft.title.trim().toLowerCase(),
    startDate: draft.startDate,
    startTime: draft.startTime ?? "",
    endTime: draft.endTime ?? "",
    location: draft.location?.trim().toLowerCase() ?? "",
    recurrence: draft.recurrence ?? null
  });
  let hash = 5381;
  for (let index = 0; index < canonical.length; index += 1) {
    hash = ((hash << 5) + hash) ^ canonical.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function findDuplicate(draft: EventDraft, recent: RecentEvent[]): RecentEvent | undefined {
  const fingerprint = eventFingerprint(draft);
  return recent.find((entry) => entry.fingerprint === fingerprint);
}
