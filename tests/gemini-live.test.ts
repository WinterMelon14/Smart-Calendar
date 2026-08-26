import { expect, it } from "vitest";
import { GeminiCloudExtractor } from "../lib/gemini";
import { DEFAULT_MODEL, type PageContext } from "../lib/types";

const apiKey = process.env.GEMINI_API_KEY;

it.runIf(Boolean(apiKey))("optionally validates the live Gemini contract", async () => {
  const context: PageContext = {
    mode: "selection",
    selection: "Thursday, August 27th, from 12 pm to 6 pm at Memorial Glade",
    text: "Calapalooza is Thursday, August 27th, from 12 pm to 6 pm at Memorial Glade.",
    pageTitle: "Calapalooza announcement",
    sourceUrl: "https://example.edu/calapalooza",
    headingPath: ["Calapalooza"],
    capturedAt: "2026-08-25T12:00:00-07:00",
    timeZone: "America/Los_Angeles"
  };
  const result = await new GeminiCloudExtractor(apiKey!, process.env.GEMINI_MODEL || DEFAULT_MODEL).extract(context);
  expect(result.events[0]?.startDate).toBe("2026-08-27");
});
