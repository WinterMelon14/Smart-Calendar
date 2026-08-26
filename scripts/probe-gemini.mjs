import { readFile } from "node:fs/promises";

const apiKey = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
const endpoint = "https://generativelanguage.googleapis.com/v1beta/interactions";

if (!apiKey) {
  console.error("Set GEMINI_API_KEY in this terminal, then run the probe again.");
  process.exit(2);
}

const schema = JSON.parse(
  await readFile(new URL("../lib/event-response-schema.json", import.meta.url), "utf8")
);

const input = [
    "Extract calendar events from this text.",
    "Today is 2026-08-25 and the timezone is America/Los_Angeles.",
    "Calapalooza is Thursday, August 27th, from 12 pm to 6 pm at Upper Sproul.",
    "Return only JSON with an events array."
  ].join("\n");

const modes = [
  { name: "plain", responseFormat: undefined },
  {
    name: "simple-schema",
    responseFormat: {
      type: "text",
      mime_type: "application/json",
      schema: {
        type: "object",
        properties: { events: { type: "array", items: { type: "object" } } },
        required: ["events"]
      }
    }
  },
  {
    name: "full-schema",
    responseFormat: { type: "text", mime_type: "application/json", schema }
  }
];

console.log(JSON.stringify({ operation: "interactions-contract-matrix", endpoint, model }, null, 2));

let succeeded = 0;
for (const mode of modes) {
  const request = { model, input, store: false };
  if (mode.responseFormat) request.response_format = mode.responseFormat;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Revision": "2026-05-20",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(request)
    });
    const raw = (await response.text()).replaceAll(apiKey, "[redacted]");
    let body;
    try { body = JSON.parse(raw); } catch { body = raw; }
    console.log(JSON.stringify({ mode: mode.name, httpStatus: response.status, response: body }, null, 2));
    if (response.ok) succeeded += 1;
  } catch (error) {
    console.error(JSON.stringify({
      mode: mode.name,
      networkError: error instanceof Error ? error.message : String(error)
    }, null, 2));
  }
}

if (!succeeded) process.exit(1);
