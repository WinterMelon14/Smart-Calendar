import { browser } from "wxt/browser";
import {
  DEFAULT_MODEL,
  STORAGE_KEYS,
  type PendingCapture,
  type RecentEvent,
  type SmartCalendarSettings
} from "./types";

export async function getSettings(): Promise<SmartCalendarSettings> {
  const stored = await browser.storage.local.get(STORAGE_KEYS.settings);
  const value = stored[STORAGE_KEYS.settings] as SmartCalendarSettings | undefined;
  return { apiKey: value?.apiKey, model: value?.model || DEFAULT_MODEL };
}

export async function saveSettings(settings: SmartCalendarSettings): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.settings]: {
      apiKey: settings.apiKey?.trim() || undefined,
      model: settings.model.trim() || DEFAULT_MODEL
    }
  });
}

export async function getRecentEvents(): Promise<RecentEvent[]> {
  const stored = await browser.storage.local.get(STORAGE_KEYS.recentEvents);
  const events = stored[STORAGE_KEYS.recentEvents];
  return Array.isArray(events) ? (events as RecentEvent[]) : [];
}

export async function addRecentEvent(event: RecentEvent): Promise<void> {
  const recent = await getRecentEvents();
  await browser.storage.local.set({
    [STORAGE_KEYS.recentEvents]: [event, ...recent.filter((item) => item.fingerprint !== event.fingerprint)].slice(0, 100)
  });
}

export async function getPendingCapture(): Promise<PendingCapture | undefined> {
  const stored = await browser.storage.session.get(STORAGE_KEYS.pendingCapture);
  return stored[STORAGE_KEYS.pendingCapture] as PendingCapture | undefined;
}

export async function setPendingCapture(capture: PendingCapture): Promise<void> {
  await browser.storage.session.set({ [STORAGE_KEYS.pendingCapture]: capture });
}

export async function clearPendingCapture(id: string): Promise<void> {
  const current = await getPendingCapture();
  if (current?.id === id) await browser.storage.session.remove(STORAGE_KEYS.pendingCapture);
}
