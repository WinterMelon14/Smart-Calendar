import { describe, expect, it } from "vitest";
import { EventValidationError, isIsoDate, validateEventDraft, validateExtractionResponse } from "../lib/event-validation";

describe("event validation", () => {
  it("rejects impossible dates", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("defaults a missing end time to one hour and warns", () => {
    const event = validateEventDraft(
      {
        kind: "single",
        title: "Office hours",
        startDate: "2026-08-27",
        startTime: "14:30",
        allDay: false,
        timeZone: "America/Los_Angeles",
        confidence: 0.8,
        warnings: [],
        evidence: "Thursday at 2:30"
      },
      "UTC"
    );
    expect(event.endTime).toBe("15:30");
    expect(event.warnings.join(" ")).toMatch(/one hour/i);
  });

  it("downgrades incomplete recurrence to a single event", () => {
    const event = validateEventDraft(
      {
        kind: "recurring",
        title: "Lecture",
        startDate: "2026-08-26",
        startTime: "12:00",
        endTime: "12:59",
        allDay: false,
        timeZone: "America/Los_Angeles",
        recurrence: { weekdays: [], untilDate: "2026-12-11", excludedDates: [] },
        confidence: 0.9,
        warnings: [],
        evidence: "MWF"
      },
      "UTC"
    );
    expect(event.kind).toBe("single");
    expect(event.warnings.join(" ")).toMatch(/recurrence/i);
  });

  it("rejects malformed extractor payloads", () => {
    expect(() => validateExtractionResponse({ result: [] }, "UTC")).toThrow(EventValidationError);
  });
});
