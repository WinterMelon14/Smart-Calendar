import { describe, expect, it } from "vitest";
import { eventFingerprint, recurrenceCount, toCalendarEvent } from "../lib/calendar";
import type { EventDraft } from "../lib/types";

const calapalooza: EventDraft = {
  itemType: "event",
  kind: "single",
  title: "Calapalooza",
  startDate: "2026-08-27",
  startTime: "12:00",
  endTime: "18:00",
  allDay: false,
  timeZone: "America/Los_Angeles",
  location: "Upper Sproul, Dwinelle, Wheeler Plaza (near Sather Gate), and Memorial Glade",
  confidence: 0.98,
  warnings: [],
  evidence: "Thursday, August 27th, from 12 pm to 6 pm",
  sourceUrl: "https://example.edu/email"
};

const lecture: EventDraft = {
  itemType: "event",
  kind: "recurring",
  title: "Lecture – 001 – 29147",
  startDate: "2026-08-26",
  startTime: "12:00",
  endTime: "12:59",
  allDay: false,
  timeZone: "America/Los_Angeles",
  location: "Wheeler 150",
  notes: "Instructors: Kay Ousterhout, John DeNero",
  recurrence: {
    weekdays: ["MO", "WE", "FR"],
    untilDate: "2026-12-11",
    excludedDates: ["2026-11-27"]
  },
  confidence: 0.99,
  warnings: [],
  evidence: "Days: Monday Wednesday Friday"
};

describe("Google Calendar mapping", () => {
  it("maps the Calapalooza acceptance example", () => {
    const resource = toCalendarEvent(calapalooza);
    expect(resource.summary).toBe("Calapalooza");
    expect(resource.start.dateTime).toBe("2026-08-27T12:00:00");
    expect(resource.end.dateTime).toBe("2026-08-27T18:00:00");
    expect(resource.location).toContain("Memorial Glade");
    expect(resource.description).toContain("Source: https://example.edu/email");
  });

  it("maps the class schedule to one bounded recurring series", () => {
    const resource = toCalendarEvent(lecture);
    expect(recurrenceCount("2026-08-26", "2026-12-11", ["MO", "WE", "FR"])).toBe(47);
    expect(resource.recurrence?.[0]).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=47");
    expect(resource.recurrence?.[1]).toBe("EXDATE;TZID=America/Los_Angeles:20261127T120000");
  });

  it("creates stable fingerprints for duplicate detection", () => {
    expect(eventFingerprint(calapalooza)).toBe(eventFingerprint({ ...calapalooza }));
    expect(eventFingerprint(calapalooza)).not.toBe(eventFingerprint({ ...calapalooza, startDate: "2026-08-28" }));
  });
});
