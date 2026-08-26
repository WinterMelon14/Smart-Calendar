import { WEEKDAYS, type EventDraft, type EventRecurrence, type Weekday } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

export class EventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventValidationError";
  }
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

export function isTime(value: unknown): value is string {
  return typeof value === "string" && TIME_24H.test(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function addOneHour(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${String(((hours ?? 0) + 1) % 24).padStart(2, "0")}:${String(minutes ?? 0).padStart(2, "0")}`;
}

function validateRecurrence(value: unknown, startDate: string): EventRecurrence | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const weekdays = Array.isArray(raw.weekdays)
    ? raw.weekdays.filter((day): day is Weekday => WEEKDAYS.includes(day as Weekday))
    : [];
  const untilDate = raw.untilDate;
  if (!isIsoDate(untilDate) || untilDate < startDate || weekdays.length === 0) return undefined;
  return {
    weekdays: [...new Set(weekdays)],
    untilDate,
    excludedDates: asStringArray(raw.excludedDates).filter(isIsoDate)
  };
}

export function validateEventDraft(rawValue: unknown, fallbackTimeZone: string): EventDraft {
  if (!rawValue || typeof rawValue !== "object") {
    throw new EventValidationError("The extractor returned an invalid event.");
  }
  const raw = rawValue as Record<string, unknown>;
  const title = asOptionalString(raw.title);
  if (!title) throw new EventValidationError("An extracted event is missing its title.");
  if (!isIsoDate(raw.startDate)) throw new EventValidationError(`“${title}” has an invalid date.`);

  const warnings = asStringArray(raw.warnings);
  const evidence = asOptionalString(raw.evidence) ?? "";
  const taskLike = /\b(?:assignment|homework|problem set|project part|deadline|due)\b/i.test(`${title} ${evidence}`)
    && !/\b(?:exam|midterm|final)\b/i.test(title);
  const itemType = raw.itemType === "task" || taskLike ? "task" : "event";
  const allDay = raw.allDay === true;
  let startTime = isTime(raw.startTime) ? raw.startTime : undefined;
  let endTime = isTime(raw.endTime) ? raw.endTime : undefined;

  if (itemType === "task") {
    endTime = undefined;
  } else if (allDay) {
    startTime = undefined;
    endTime = undefined;
  } else if (!startTime) {
    warnings.push("No start time was found. Review the time before adding this event.");
  } else if (!endTime) {
    endTime = addOneHour(startTime);
    warnings.push("No end time was found, so Smart Calendar defaulted to one hour.");
  }

  const requestedKind = itemType === "event" && raw.kind === "recurring" ? "recurring" : "single";
  const recurrence = validateRecurrence(raw.recurrence, raw.startDate);
  const kind = requestedKind === "recurring" && recurrence ? "recurring" : "single";
  if (requestedKind === "recurring" && !recurrence) {
    warnings.push("The recurrence details were incomplete, so this is shown as a one-time event.");
  }

  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0.5;
  return {
    itemType,
    kind,
    title,
    startDate: raw.startDate,
    endDate: itemType === "event" && isIsoDate(raw.endDate) ? raw.endDate : undefined,
    startTime,
    endTime,
    allDay,
    timeZone: asOptionalString(raw.timeZone) ?? fallbackTimeZone,
    location: asOptionalString(raw.location),
    notes: asOptionalString(raw.notes),
    recurrence: itemType === "event" ? recurrence : undefined,
    confidence: Math.max(0, Math.min(1, confidence)),
    warnings: [...new Set(warnings)],
    evidence,
    sourceUrl: asOptionalString(raw.sourceUrl)
  };
}

export function validateExtractionResponse(value: unknown, fallbackTimeZone: string): EventDraft[] {
  const rawEvents = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).events)
      ? ((value as Record<string, unknown>).events as unknown[])
      : null;
  if (!rawEvents) throw new EventValidationError("Gemini returned an unexpected response shape.");
  return rawEvents.slice(0, 20).map((raw) => validateEventDraft(raw, fallbackTimeZone));
}

const WEEKDAY_NAMES: Record<string, Weekday> = {
  sunday: "SU",
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA"
};

function usDateToIso(month: string, day: string, year: string): string | undefined {
  const iso = `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : undefined;
}

/** Corrects an extractor miss only when the page explicitly states a date range and weekdays. */
export function applyExplicitScheduleRecurrence(draft: EventDraft, sourceText: string): EventDraft {
  if (draft.itemType === "task") return draft;
  if (draft.kind === "recurring" && draft.recurrence) return draft;
  const rangePattern = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:-|–|—|to|through)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/gi;

  for (const match of sourceText.matchAll(rangePattern)) {
    const startDate = usDateToIso(match[1]!, match[2]!, match[3]!);
    const untilDate = usDateToIso(match[4]!, match[5]!, match[6]!);
    if (!startDate || !untilDate || draft.startDate !== startDate || match.index === undefined) continue;

    const nearby = sourceText.slice(Math.max(0, match.index - 800), match.index + match[0].length + 1_200);
    const daysText = nearby.match(/\bDays?\s*:\s*((?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*)+)/i)?.[1];
    if (!daysText) continue;
    const weekdays = [...daysText.matchAll(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/gi)]
      .map((day) => WEEKDAY_NAMES[day[0].toLowerCase()]!)
      .filter(Boolean);
    if (!weekdays.length) continue;

    return {
      ...draft,
      kind: "recurring",
      endDate: undefined,
      recurrence: {
        weekdays: [...new Set(weekdays)],
        untilDate,
        excludedDates: []
      },
      warnings: [...new Set([
        ...draft.warnings.filter((warning) => !warning.includes("one-time event")),
        "Recurring schedule confirmed from the explicit meeting date range and weekdays on the page."
      ])]
    };
  }

  return draft;
}
