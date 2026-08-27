import { browser } from "wxt/browser";
import { acquireGoogleToken, CalendarApiError } from "./google-calendar";
import type { EventDraft, GoogleTaskResource } from "./types";

export function toGoogleTask(draft: EventDraft): GoogleTaskResource {
  const details = [
    draft.startTime ? `Due time: ${draft.startTime} (${draft.timeZone})` : undefined,
    draft.location ? `Location: ${draft.location}` : undefined,
    draft.notes?.trim(),
    draft.sourceUrl ? `Source: ${draft.sourceUrl}` : undefined
  ].filter(Boolean);
  return {
    title: draft.title.trim(),
    notes: details.join("\n\n") || undefined,
    due: `${draft.startDate}T00:00:00.000Z`,
    status: "needsAction"
  };
}

async function insertWithToken(draft: EventDraft, token: string): Promise<{ id: string; htmlLink: string }> {
  const response = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(toGoogleTask(draft))
  });
  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    webViewLink?: string;
    error?: { message?: string };
  };
  if (!response.ok || !body.id) {
    const fallback = response.status === 403
      ? "Google Tasks access was denied. Enable the Google Tasks API in the OAuth project, then disconnect and authorize Google again."
      : "Google Tasks could not create this task.";
    throw new CalendarApiError(body.error?.message || fallback, response.status);
  }
  return { id: body.id, htmlLink: body.webViewLink || "https://tasks.google.com/" };
}

export async function createGoogleTask(draft: EventDraft): Promise<{ id: string; htmlLink: string }> {
  let token = await acquireGoogleToken(true);
  try {
    return await insertWithToken(draft, token);
  } catch (error) {
    if (!(error instanceof CalendarApiError) || error.status !== 401) throw error;
    await browser.identity.removeCachedAuthToken({ token });
    token = await acquireGoogleToken(true);
    return insertWithToken(draft, token);
  }
}
