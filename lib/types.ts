export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type EventRecurrence = {
  weekdays: Weekday[];
  untilDate: string;
  excludedDates: string[];
};

export type EventDraft = {
  itemType: "event" | "task";
  kind: "single" | "recurring";
  title: string;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  timeZone: string;
  location?: string;
  notes?: string;
  recurrence?: EventRecurrence;
  confidence: number;
  warnings: string[];
  evidence: string;
  sourceUrl?: string;
};

export type CaptureMode = "selection" | "scan";

export type PageContext = {
  mode: CaptureMode;
  selection?: string;
  pageTitle: string;
  sourceUrl?: string;
  headingPath: string[];
  text: string;
  capturedAt: string;
  timeZone: string;
  reducedContext?: boolean;
};

export type SmartCalendarSettings = {
  apiKey?: string;
  model: string;
};

export type RecentEvent = {
  fingerprint: string;
  title: string;
  startDate: string;
  htmlLink?: string;
  createdAt: string;
};

export type ExtractionResult = {
  events: EventDraft[];
  provider: string;
};

export type CalendarEventResource = {
  summary: string;
  location?: string;
  description?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
};

export type GoogleTaskResource = {
  title: string;
  notes?: string;
  due: string;
  status: "needsAction";
};

export type BackgroundMessage =
  | { type: "CAPTURE_ACTIVE_PAGE"; mode: "scan" }
  | { type: "GET_ACTIVE_TAB" };

export type PendingCapture = {
  id: string;
  context: PageContext;
};

export const STORAGE_KEYS = {
  settings: "smartCalendarSettings",
  pendingCapture: "smartCalendarPendingCapture",
  recentEvents: "smartCalendarRecentEvents"
} as const;

export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
