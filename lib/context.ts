const DATE_CUE =
  /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i;
const TIME_CUE = /\b(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|noon|midnight|all[- ]day)\b/i;
const REPEAT_CUE = /\b(?:every|weekly|daily|weekdays?|recurr|through|until|date range|days?:)\b/i;
const EVENT_CUE = /\b(?:event|meeting|deadline|exam|final|lecture|class|concert|workshop|appointment|conference|session|webinar|party|festival|ceremony)\b/i;
const TASK_CUE = /\b(?:assignment|homework|problem set|project|quiz|application|submit|submission|due|deadline)\b/i;

export function normalizeVisibleText(text: string, limit = 60_000): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

export function containsEventCue(text: string): boolean {
  return DATE_CUE.test(text) && (TIME_CUE.test(text) || REPEAT_CUE.test(text) || EVENT_CUE.test(text) || TASK_CUE.test(text));
}

export function selectEventBlocks(text: string, maxChars = 40_000): string {
  const normalized = normalizeVisibleText(text, 100_000);
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const ranges: Array<[number, number]> = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!containsEventCue(lines[index]!)) continue;
    const start = Math.max(0, index - 24);
    const end = Math.min(lines.length, index + 25);
    const previous = ranges.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else ranges.push([start, end]);
  }

  const selected: string[] = [];
  let used = 0;
  for (const [start, end] of ranges) {
    const context = lines.slice(start, end).join("\n");
    const remaining = maxChars - used;
    if (remaining <= 0) break;
    selected.push(context.slice(0, remaining));
    used += Math.min(context.length, remaining);
  }

  return selected.length > 0 ? selected.join("\n\n--- candidate section ---\n\n") : normalized.slice(0, maxChars);
}
