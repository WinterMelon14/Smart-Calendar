import { browser } from "wxt/browser";
import { toCalendarEvent } from "./calendar";
import type { EventDraft } from "./types";

export class CalendarApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "CalendarApiError";
  }
}

type AuthTokenResult = { token?: string } | string | undefined;

export async function acquireGoogleToken(interactive: boolean): Promise<string> {
  const result = (await browser.identity.getAuthToken({ interactive })) as AuthTokenResult;
  const token = typeof result === "string" ? result : result?.token;
  if (!token) throw new CalendarApiError("Google Calendar authorization was not completed.");
  return token;
}

async function insertWithToken(draft: EventDraft, token: string): Promise<{ id: string; htmlLink?: string }> {
  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(toCalendarEvent(draft))
  });
  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    htmlLink?: string;
    error?: { message?: string };
  };
  if (!response.ok || !body.id) {
    throw new CalendarApiError(body.error?.message || "Google Calendar could not create this event.", response.status);
  }
  return { id: body.id, htmlLink: body.htmlLink };
}

export async function createGoogleCalendarEvent(draft: EventDraft): Promise<{ id: string; htmlLink?: string }> {
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

export async function disconnectGoogleCalendar(): Promise<void> {
  await browser.identity.clearAllCachedAuthTokens();
}
