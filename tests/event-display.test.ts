import { describe, expect, it } from "vitest";
import { formatDraftSchedule } from "../lib/event-display";
import type { EventDraft } from "../lib/types";

const recurring: EventDraft = {
  itemType: "event",
  kind: "recurring",
  title: "APPEX Zoom Info Session",
  startDate: "2026-03-17",
  startTime: "17:00",
  endTime: "18:00",
  allDay: false,
  timeZone: "America/Los_Angeles",
  recurrence: {
    weekdays: ["TU", "TH"],
    untilDate: "2026-05-14",
    excludedDates: []
  },
  confidence: 0.98,
  warnings: [],
  evidence: "Tuesdays & Thursdays: 5:00 - 6:00 pm"
};

describe("candidate card schedule formatting", () => {
  it("shows all recurring weekdays and the full series range", () => {
    expect(formatDraftSchedule(recurring, "en-US")).toBe(
      "Tue & Thu · Mar 17–May 14, 2026 · 17:00–18:00"
    );
  });

  it("keeps one-time event summaries concise", () => {
    expect(formatDraftSchedule({ ...recurring, kind: "single", recurrence: undefined }, "en-US")).toBe(
      "Tue, Mar 17, 2026 · 17:00–18:00"
    );
  });
});
