import { describe, expect, it } from "vitest";
import { toGoogleTask } from "../lib/google-tasks";
import type { EventDraft } from "../lib/types";

describe("Google Tasks mapping", () => {
  it("stores the due date and preserves an unsupported due time in notes", () => {
    const draft: EventDraft = {
      itemType: "task",
      kind: "single",
      title: "Diet Analysis Project Part 1",
      startDate: "2026-09-18",
      startTime: "23:59",
      allDay: false,
      timeZone: "America/Los_Angeles",
      notes: "Submit on bCourses",
      confidence: 0.98,
      warnings: [],
      evidence: "Fri Sep 18, 2026 · due by 11:59pm",
      sourceUrl: "https://bcourses.berkeley.edu/courses/123/assignments/syllabus"
    };
    const task = toGoogleTask(draft);
    expect(task.due).toBe("2026-09-18T00:00:00.000Z");
    expect(task.notes).toContain("Due time: 23:59 (America/Los_Angeles)");
    expect(task.notes).toContain("Submit on bCourses");
    expect(task.notes).toContain("Source: https://bcourses.berkeley.edu");
  });
});
