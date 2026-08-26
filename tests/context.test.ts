import { describe, expect, it } from "vitest";
import { containsEventCue, normalizeVisibleText, selectEventBlocks } from "../lib/context";

describe("page context filtering", () => {
  it("normalizes page text without retaining excessive whitespace", () => {
    expect(normalizeVisibleText("  Hello\u00a0  world\n\n\n\nThursday at 2 pm  ")).toBe(
      "Hello world\n\nThursday at 2 pm"
    );
  });

  it("recognizes event-like text and ignores ordinary prose", () => {
    expect(containsEventCue("Thursday, August 27 from 12 pm to 6 pm")).toBe(true);
    expect(containsEventCue("Homework 4 due September 18, 2026")).toBe(true);
    expect(containsEventCue("Welcome to our student community.")).toBe(false);
  });

  it("keeps nearby context around a course schedule", () => {
    const page = [
      "COMPSCI 61A",
      "Instructor: John DeNero",
      "",
      "Lecture 001",
      "08/26/2026 - 12/11/2026 · Days: Monday Wednesday Friday · Times: 12:00PM to 12:59PM · Wheeler 150",
      "",
      "Unrelated footer text"
    ].join("\n");
    const selected = selectEventBlocks(page);
    expect(selected).toContain("Lecture 001");
    expect(selected).toContain("Wheeler 150");
  });

  it("keeps flattened CalCentral columns together", () => {
    const page = [
      "Enrollment Center",
      "2026 Fall",
      "COMPSCI 61A STR INTERP CMP PRGS",
      "Class",
      "Meeting Dates",
      "Days and Times",
      "Room",
      "Instructor",
      "Lecture - 001 - 29147",
      "08/26/2026 - 12/11/2026",
      "Days: Monday Wednesday Friday",
      "Times: 12:00PM to 12:59PM",
      "Wheeler 150",
      "Kay Ousterhout, John DeNero"
    ].join("\n");
    const selected = selectEventBlocks(page);
    expect(selected).toContain("COMPSCI 61A");
    expect(selected).toContain("Days: Monday Wednesday Friday");
    expect(selected).toContain("Wheeler 150");
  });
});
