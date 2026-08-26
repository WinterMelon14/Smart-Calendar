import { describe, expect, it } from "vitest";
import { applyExplicitScheduleRecurrence, validateExtractionResponse } from "../lib/event-validation";
import calapaloozaFixture from "./fixtures/calapalooza-response.json";
import scheduleFixture from "./fixtures/schedule-response.json";

describe("Gemini response fixtures", () => {
  it("validates the Calapalooza event", () => {
    const [event] = validateExtractionResponse(calapaloozaFixture, "America/Los_Angeles");
    expect(event?.title).toBe("Calapalooza");
    expect(event?.startTime).toBe("12:00");
  });

  it("keeps a recurring class and separate final distinct", () => {
    const events = validateExtractionResponse(scheduleFixture, "America/Los_Angeles");
    expect(events).toHaveLength(2);
    expect(events[0]?.kind).toBe("recurring");
    expect(events[1]?.kind).toBe("single");
  });

  it("corrects a one-time classification from an explicit schedule range", () => {
    const [single] = validateExtractionResponse({ events: [{
      ...scheduleFixture.events[0],
      kind: "single",
      endDate: "2026-12-11",
      recurrence: null
    }] }, "America/Los_Angeles");
    const corrected = applyExplicitScheduleRecurrence(
      single!,
      "Lecture - 001 - 29147\n08/26/2026 - 12/11/2026\nDays: Monday Wednesday Friday\nTimes: 12:00PM to 12:59PM\nWheeler 150"
    );
    expect(corrected.kind).toBe("recurring");
    expect(corrected.endDate).toBeUndefined();
    expect(corrected.recurrence).toEqual({
      weekdays: ["MO", "WE", "FR"],
      untilDate: "2026-12-11",
      excludedDates: []
    });
  });

  it("classifies a dated assignment as a task", () => {
    const [task] = validateExtractionResponse({ events: [{
      kind: "single",
      title: "Diet Analysis Project Part 1",
      startDate: "2026-09-18",
      endDate: "",
      startTime: "23:59",
      endTime: "",
      allDay: false,
      timeZone: "America/Los_Angeles",
      location: "",
      notes: "",
      recurrence: null,
      confidence: 0.98,
      warnings: [],
      evidence: "Fri Sep 18, 2026 · due by 11:59pm",
      sourceUrl: "https://bcourses.berkeley.edu"
    }] }, "America/Los_Angeles");
    expect(task?.itemType).toBe("task");
    expect(task?.endTime).toBeUndefined();
    expect(task?.warnings).not.toContain("No end time was found, so Smart Calendar defaulted to one hour.");
  });
});
