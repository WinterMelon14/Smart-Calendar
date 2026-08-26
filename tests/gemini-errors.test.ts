import { describe, expect, it } from "vitest";
import {
  buildGeminiRequest,
  EVENT_RESPONSE_SCHEMA,
  GeminiApiError,
  geminiErrorMessage,
  interactionOutputText,
  supportsStructuredOutput
} from "../lib/gemini";

describe("Gemini API diagnostics", () => {
  it("does not mislabel request schema errors as invalid keys", () => {
    expect(geminiErrorMessage(400, "Invalid JSON payload received")).toContain("request format");
    expect(geminiErrorMessage(400, "Invalid JSON payload received")).not.toContain("key is invalid");
  });

  it("explains common access and model failures", () => {
    expect(geminiErrorMessage(401)).toContain("invalid or was revoked");
    expect(geminiErrorMessage(403)).toContain("Generative Language API");
    expect(geminiErrorMessage(404, undefined, "gemini-test")).toContain("gemini-test");
    expect(geminiErrorMessage(429)).toContain("quota");
  });

  it("uses the Interactions API structured-output fields", () => {
    const request = buildGeminiRequest("gemini-3.5-flash-lite", "extract", {
      type: "object",
      additionalProperties: false,
      properties: { events: { type: "array", maxItems: 20, items: { type: "object", properties: {}, required: [] } } },
      required: ["events"]
    } as never);
    expect(request.model).toBe("gemini-3.5-flash-lite");
    expect(request.input).toBe("extract");
    expect(request.store).toBe(false);
    expect(request.response_format?.mime_type).toBe("application/json");
    expect(request.response_format?.schema).toBeTruthy();
    expect(request).not.toHaveProperty("generationConfig");
  });

  it("sends the shared JSON Schema through response_format", () => {
    const request = buildGeminiRequest("gemini-3.5-flash-lite", "extract", EVENT_RESPONSE_SCHEMA);
    expect(request.response_format?.schema).toBe(EVENT_RESPONSE_SCHEMA);
    expect(JSON.stringify(request.response_format?.schema)).toContain("additionalProperties");
  });

  it("omits structured output for Flash-Lite 3.5, which does not support it", () => {
    expect(supportsStructuredOutput("gemini-3.5-flash-lite")).toBe(false);
    expect(supportsStructuredOutput("gemini-3.1-flash-lite")).toBe(true);
    expect(buildGeminiRequest("gemini-3.5-flash-lite", "extract")).not.toHaveProperty("response_format");
  });

  it("carries sanitized diagnostics separately from the friendly message", () => {
    const error = new GeminiApiError("Failed", 400, "INVALID_ARGUMENT", '{"field":"generationConfig"}');
    expect(error.diagnostics).toContain("generationConfig");
    expect(error.status).toBe(400);
  });

  it("reads text from raw REST steps and the SDK convenience field", () => {
    expect(interactionOutputText({ output_text: '{"events":[]}' })).toBe('{"events":[]}');
    expect(interactionOutputText({
      steps: [{ type: "model_output", content: [{ type: "text", text: '{"events":[]}' }] }]
    })).toBe('{"events":[]}');
  });
});
