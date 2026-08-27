import { useCallback, useEffect, useMemo, useState } from "react";
import { browser } from "wxt/browser";
import { eventFingerprint, findDuplicate } from "../../lib/calendar";
import { formatDraftSchedule } from "../../lib/event-display";
import { validateEventDraft } from "../../lib/event-validation";
import { GeminiApiError, GeminiCloudExtractor } from "../../lib/gemini";
import { createGoogleCalendarEvent, disconnectGoogleCalendar } from "../../lib/google-calendar";
import { createGoogleTask } from "../../lib/google-tasks";
import {
  addRecentEvent,
  clearPendingCapture,
  getPendingCapture,
  getRecentEvents,
  getSettings,
  saveSettings
} from "../../lib/storage";
import {
  DEFAULT_MODEL,
  STORAGE_KEYS,
  WEEKDAYS,
  type BackgroundMessage,
  type EventDraft,
  type PageContext,
  type PendingCapture,
  type SmartCalendarSettings,
  type Weekday
} from "../../lib/types";

type View = "events" | "settings";
type Notice = { tone: "success" | "error" | "info"; message: string; link?: string; linkLabel?: string; diagnostics?: string };

const DAY_LABELS: Record<Weekday, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun"
};

const LOCAL_PREVIEW_EVENT: EventDraft = {
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
  recurrence: { weekdays: ["MO", "WE", "FR"], untilDate: "2026-12-11", excludedDates: [] },
  confidence: 0.96,
  warnings: ["Review the recurrence end date before adding the series."],
  evidence: "Days: Monday Wednesday Friday · Times: 12:00PM to 12:59PM",
  sourceUrl: "https://example.edu/schedule"
};

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function diagnosticsFromError(error: unknown): string | undefined {
  return error instanceof GeminiApiError ? error.diagnostics : undefined;
}

function DiagnosticDetails({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <details className="diagnostics">
      <summary>Technical diagnostics</summary>
      <pre>{value}</pre>
      <button
        type="button"
        className="diagnostic-copy"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy diagnostics"}
      </button>
    </details>
  );
}

function NoticeBox({ notice }: { notice: Notice }) {
  return (
    <div className={`notice ${notice.tone}`}>
      <span>{notice.message}</span>
      {notice.link && <a href={notice.link} target="_blank" rel="noreferrer">{notice.linkLabel ?? "Open in Google Calendar"} ↗</a>}
      {notice.diagnostics && <DiagnosticDetails value={notice.diagnostics} />}
    </div>
  );
}

function Confidence({ value }: { value: number }) {
  const label = value >= 0.8 ? "High confidence" : value >= 0.55 ? "Review details" : "Low confidence";
  return <span className={`confidence confidence-${value >= 0.8 ? "high" : value >= 0.55 ? "medium" : "low"}`}>{label}</span>;
}

function EventCard({ draft, active, onClick }: { draft: EventDraft; active: boolean; onClick: () => void }) {
  return (
    <button className={`event-card ${active ? "active" : ""}`} onClick={onClick} type="button">
      <div className="event-card-top">
        <span className="kind-pill">{draft.itemType === "task" ? "Task" : draft.kind === "recurring" ? "Recurring" : "One time"}</span>
        <Confidence value={draft.confidence} />
      </div>
      <strong>{draft.title}</strong>
      <span>{formatDraftSchedule(draft)}</span>
      {draft.location && <span className="muted">{draft.location}</span>}
    </button>
  );
}

function EventEditor({
  draft,
  onChange,
  onAdd,
  busy,
  duplicateWarning
}: {
  draft: EventDraft;
  onChange: (next: EventDraft) => void;
  onAdd: (allowDuplicate?: boolean) => void;
  busy: boolean;
  duplicateWarning?: string;
}) {
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => onChange({ ...draft, [key]: value });
  const formReady = Boolean(
    draft.title.trim()
    && draft.startDate
    && (draft.itemType === "task" || draft.allDay || (draft.startTime && draft.endTime))
  );

  const setItemType = (itemType: EventDraft["itemType"]) => {
    onChange(itemType === "task"
      ? { ...draft, itemType, kind: "single", endDate: undefined, endTime: undefined, recurrence: undefined }
      : { ...draft, itemType });
  };

  const setRecurring = (enabled: boolean) => {
    if (!enabled) {
      onChange({ ...draft, kind: "single", recurrence: undefined });
      return;
    }
    const date = new Date(`${draft.startDate}T12:00:00`);
    const jsDays: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    onChange({
      ...draft,
      kind: "recurring",
      recurrence: draft.recurrence ?? {
        weekdays: [jsDays[date.getDay()] ?? "MO"],
        untilDate: draft.startDate,
        excludedDates: []
      }
    });
  };

  const toggleWeekday = (day: Weekday) => {
    if (!draft.recurrence) return;
    const weekdays = draft.recurrence.weekdays.includes(day)
      ? draft.recurrence.weekdays.filter((value) => value !== day)
      : WEEKDAYS.filter((value) => [...draft.recurrence!.weekdays, day].includes(value));
    onChange({ ...draft, recurrence: { ...draft.recurrence, weekdays } });
  };

  return (
    <section className="editor surface">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Review before adding</span>
          <h2>{draft.itemType === "task" ? "Task details" : "Event details"}</h2>
        </div>
        <Confidence value={draft.confidence} />
      </div>

      {draft.warnings.length > 0 && (
        <div className="warning-box">
          {draft.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      <label>
        Add to
        <select value={draft.itemType} onChange={(event) => setItemType(event.target.value as EventDraft["itemType"])}>
          <option value="event">Google Calendar</option>
          <option value="task">Google Tasks</option>
        </select>
      </label>

      <label>
        {draft.itemType === "task" ? "Task title" : "Event title"}
        <input value={draft.title} onChange={(event) => set("title", event.target.value)} />
      </label>

      <div className="field-row">
        <label>
          {draft.itemType === "task" ? "Due date" : "Start date"}
          <input type="date" value={draft.startDate} onChange={(event) => set("startDate", event.target.value)} />
        </label>
        {draft.itemType === "event" && draft.kind === "single" && (
          <label>
            End date <span className="optional">optional</span>
            <input type="date" value={draft.endDate ?? ""} onChange={(event) => set("endDate", event.target.value || undefined)} />
          </label>
        )}
      </div>

      {draft.itemType === "event" && <label className="switch-row">
        <span>
          <strong>All-day event</strong>
          <small>No start or end time</small>
        </span>
        <input type="checkbox" checked={draft.allDay} onChange={(event) => set("allDay", event.target.checked)} />
      </label>}

      {draft.itemType === "event" && !draft.allDay && (
        <div className="field-row">
          <label>
            Starts
            <input type="time" value={draft.startTime ?? ""} onChange={(event) => set("startTime", event.target.value || undefined)} />
          </label>
          <label>
            Ends
            <input type="time" value={draft.endTime ?? ""} onChange={(event) => set("endTime", event.target.value || undefined)} />
          </label>
        </div>
      )}

      {draft.itemType === "task" && (
        <label>
          Due time <span className="optional">saved in notes</span>
          <input type="time" value={draft.startTime ?? ""} onChange={(event) => set("startTime", event.target.value || undefined)} />
        </label>
      )}

      {draft.itemType === "event" && <label>
        Location <span className="optional">optional</span>
        <input value={draft.location ?? ""} onChange={(event) => set("location", event.target.value || undefined)} placeholder="Building, room, or address" />
      </label>}

      {draft.itemType === "event" && <label>
        Time zone
        <input value={draft.timeZone} onChange={(event) => set("timeZone", event.target.value)} />
      </label>}

      {draft.itemType === "event" && <label className="switch-row">
        <span>
          <strong>Repeats</strong>
          <small>Create one Calendar series</small>
        </span>
        <input type="checkbox" checked={draft.kind === "recurring"} onChange={(event) => setRecurring(event.target.checked)} />
      </label>}

      {draft.itemType === "event" && draft.kind === "recurring" && draft.recurrence && (
        <div className="recurrence-box">
          <span className="label-text">Repeats on</span>
          <div className="weekday-grid">
            {WEEKDAYS.map((day) => (
              <button
                type="button"
                className={draft.recurrence!.weekdays.includes(day) ? "selected" : ""}
                onClick={() => toggleWeekday(day)}
                key={day}
              >
                {DAY_LABELS[day]}
              </button>
            ))}
          </div>
          <label>
            Series ends
            <input
              type="date"
              value={draft.recurrence.untilDate}
              min={draft.startDate}
              onChange={(event) =>
                onChange({ ...draft, recurrence: { ...draft.recurrence!, untilDate: event.target.value } })
              }
            />
          </label>
          <label>
            Excluded dates <span className="optional">comma-separated</span>
            <input
              value={draft.recurrence.excludedDates.join(", ")}
              onChange={(event) =>
                onChange({
                  ...draft,
                  recurrence: {
                    ...draft.recurrence!,
                    excludedDates: event.target.value.split(",").map((value) => value.trim()).filter(Boolean)
                  }
                })
              }
              placeholder="2026-11-27"
            />
          </label>
        </div>
      )}

      <label>
        Notes <span className="optional">optional</span>
        <textarea rows={3} value={draft.notes ?? ""} onChange={(event) => set("notes", event.target.value || undefined)} />
      </label>

      {draft.evidence && (
        <details className="evidence">
          <summary>Why Smart Calendar found this</summary>
          <p>“{draft.evidence}”</p>
        </details>
      )}

      {duplicateWarning && (
        <div className="duplicate-box">
          <strong>Possible duplicate</strong>
          <p>{duplicateWarning}</p>
          <button className="button secondary" type="button" onClick={() => onAdd(true)} disabled={busy}>
            Add anyway
          </button>
        </div>
      )}

      <button className="button primary add-button" type="button" disabled={!formReady || busy} onClick={() => onAdd(false)}>
        {busy ? <span className="spinner" /> : <span className="calendar-plus">+</span>}
        {busy ? "Adding…" : draft.itemType === "task" ? "Add to Google Tasks" : "Add to Google Calendar"}
      </button>
      {!formReady && (
        <p className="form-hint">
          {draft.itemType === "task" ? "Add a title and due date to continue." : "Add a title, date, and valid start/end time to continue."}
        </p>
      )}
    </section>
  );
}

function SettingsPanel({
  settings,
  onSaved,
  onBack
}: {
  settings: SmartCalendarSettings;
  onSaved: (settings: SmartCalendarSettings) => void;
  onBack: () => void;
}) {
  const [apiKey, setApiKey] = useState(settings.apiKey ?? "");
  const [model, setModel] = useState(settings.model || DEFAULT_MODEL);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>();

  const persist = async () => {
    const next = { apiKey: apiKey.trim() || undefined, model: model.trim() || DEFAULT_MODEL };
    await saveSettings(next);
    onSaved(next);
    setNotice({ tone: "success", message: "Settings saved locally in this Chrome profile." });
  };

  const test = async () => {
    if (!apiKey.trim()) {
      setNotice({ tone: "error", message: "Enter a Gemini API key first." });
      return;
    }
    setBusy(true);
    setNotice(undefined);
    try {
      await new GeminiCloudExtractor(apiKey.trim(), model.trim() || DEFAULT_MODEL).testConnection();
      await persist();
      setNotice({ tone: "success", message: "Gemini is connected and ready." });
    } catch (error) {
      setNotice({ tone: "error", message: messageFromError(error), diagnostics: diagnosticsFromError(error) });
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    setApiKey("");
    const next = { model: model.trim() || DEFAULT_MODEL };
    await saveSettings(next);
    onSaved(next);
    setNotice({ tone: "info", message: "The Gemini key was removed from Chrome storage." });
  };

  return (
    <section className="settings-view">
      <button className="back-button" onClick={onBack} type="button">← Back to events</button>
      <span className="eyebrow">Setup</span>
      <h1>Settings</h1>
      <p className="lede">Your key stays in this Chrome profile. Smart Calendar sends only selected context or user-requested scan text to Gemini.</p>

      {notice && <NoticeBox notice={notice} />}

      <div className="surface settings-card">
        <h2>Gemini API</h2>
        <label>
          API key
          <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="AIza…" autoComplete="off" />
        </label>
        <label>
          Model
          <input value={model} onChange={(event) => setModel(event.target.value)} />
        </label>
        <div className="button-row">
          <button className="button primary" onClick={test} type="button" disabled={busy}>{busy ? "Testing…" : "Test & save"}</button>
          <button className="button secondary" onClick={persist} type="button">Save</button>
          {settings.apiKey && <button className="text-button danger" onClick={removeKey} type="button">Delete key</button>}
        </div>
        <p className="privacy-copy">Free-tier Gemini submissions may be used by Google to improve its products. Avoid scanning pages containing sensitive information.</p>
      </div>

      <div className="surface settings-card">
        <h2>Google Calendar & Tasks</h2>
        <p>Google will ask permission before the first addition. Smart Calendar can create events on calendars you own and tasks in your default task list.</p>
        <button
          className="button secondary"
          type="button"
          onClick={async () => {
            await disconnectGoogleCalendar();
            setNotice({ tone: "info", message: "Google Calendar and Tasks were disconnected for this extension." });
          }}
        >
          Disconnect Google
        </button>
      </div>
    </section>
  );
}

export function App() {
  const extensionRuntimeAvailable = Boolean(browser.runtime?.id && browser.storage?.local);
  const localPreview = !extensionRuntimeAvailable && new URLSearchParams(location.search).get("preview") === "event";
  const [view, setView] = useState<View>("events");
  const [settings, setSettings] = useState<SmartCalendarSettings>({ model: DEFAULT_MODEL });
  const [events, setEvents] = useState<EventDraft[]>(localPreview ? [LOCAL_PREVIEW_EVENT] : []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [busy, setBusy] = useState<"scan" | "extract" | "add" | null>(null);
  const [notice, setNotice] = useState<Notice>();
  const [queuedContext, setQueuedContext] = useState<PageContext>();
  const [duplicateWarning, setDuplicateWarning] = useState<string>();

  const selected = events[selectedIndex];

  const runExtraction = useCallback(
    async (context: PageContext, currentSettings?: SmartCalendarSettings) => {
      const usableSettings = currentSettings ?? settings;
      setQueuedContext(context);
      setNotice(undefined);
      if (!usableSettings.apiKey) {
        setView("settings");
        setNotice({ tone: "info", message: "Add a Gemini API key, then return to extract this event." });
        return;
      }
      setBusy("extract");
      try {
        const result = await new GeminiCloudExtractor(usableSettings.apiKey, usableSettings.model).extract(context);
        setEvents(result.events);
        setSelectedIndex(0);
        setDuplicateWarning(undefined);
        setQueuedContext(undefined);
        setView("events");
        setNotice(
          result.events.length
            ? { tone: "success", message: `Found ${result.events.length} possible calendar item${result.events.length === 1 ? "" : "s"}. Review before adding.` }
            : { tone: "info", message: "No clear events or tasks were found on this page." }
        );
      } catch (error) {
        setNotice({ tone: "error", message: messageFromError(error), diagnostics: diagnosticsFromError(error) });
      } finally {
        setBusy(null);
      }
    },
    [settings]
  );

  useEffect(() => {
    if (!extensionRuntimeAvailable) return;
    let active = true;
    const load = async () => {
      const savedSettings = await getSettings();
      if (!active) return;
      setSettings(savedSettings);
      const pending = await getPendingCapture();
      if (pending && active) {
        await clearPendingCapture(pending.id);
        await runExtraction(pending.context, savedSettings);
      } else if (!savedSettings.apiKey) {
        setView("settings");
      }
    };
    void load();

    const onStorage = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      areaName: string
    ) => {
      if (areaName !== "session") return;
      const pending = changes[STORAGE_KEYS.pendingCapture]?.newValue as PendingCapture | undefined;
      if (pending) {
        void clearPendingCapture(pending.id).then(() => runExtraction(pending.context));
      }
    };
    browser.storage.onChanged.addListener(onStorage);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onStorage);
    };
  }, [extensionRuntimeAvailable, runExtraction]);

  const scanPage = async () => {
    setBusy("scan");
    setNotice(undefined);
    try {
      const context = (await browser.runtime.sendMessage({
        type: "CAPTURE_ACTIVE_PAGE",
        mode: "scan"
      } satisfies BackgroundMessage)) as PageContext;
      await runExtraction(context);
    } catch (error) {
      setNotice({ tone: "error", message: messageFromError(error), diagnostics: diagnosticsFromError(error) });
      setBusy(null);
    }
  };

  const updateSelected = (next: EventDraft) => {
    setEvents((current) => current.map((event, index) => (index === selectedIndex ? next : event)));
    setDuplicateWarning(undefined);
  };

  const addEvent = async (allowDuplicate = false) => {
    if (!selected) return;
    setNotice(undefined);
    try {
      const validated = validateEventDraft(selected, selected.timeZone);
      const recent = await getRecentEvents();
      const duplicate = findDuplicate(validated, recent);
      if (duplicate && !allowDuplicate) {
        setDuplicateWarning(`“${duplicate.title}” was added from Smart Calendar on ${new Date(duplicate.createdAt).toLocaleDateString()}.`);
        return;
      }
      setBusy("add");
      const created = validated.itemType === "task"
        ? await createGoogleTask(validated)
        : await createGoogleCalendarEvent(validated);
      await addRecentEvent({
        fingerprint: eventFingerprint(validated),
        title: validated.title,
        startDate: validated.startDate,
        htmlLink: created.htmlLink,
        createdAt: new Date().toISOString()
      });
      setDuplicateWarning(undefined);
      setNotice({
        tone: "success",
        message: validated.itemType === "task"
          ? `“${validated.title}” was added to Google Tasks.`
          : `“${validated.title}” was added to your primary calendar.`,
        link: created.htmlLink,
        linkLabel: validated.itemType === "task" ? "Open Google Tasks" : "Open in Google Calendar"
      });
    } catch (error) {
      setNotice({ tone: "error", message: messageFromError(error), diagnostics: diagnosticsFromError(error) });
    } finally {
      setBusy(null);
    }
  };

  const handleSettingsSaved = (next: SmartCalendarSettings) => {
    setSettings(next);
  };

  const returnFromSettings = () => {
    setView("events");
    setNotice(undefined);
    if (queuedContext && settings.apiKey) void runExtraction(queuedContext, settings);
  };

  const busyLabel = busy === "scan" ? "Reading this page…" : busy === "extract" ? "Finding items…" : undefined;

  if (view === "settings") {
    return <SettingsPanel settings={settings} onSaved={handleSettingsSaved} onBack={returnFromSettings} />;
  }

  return (
    <main>
      <header className="top-toolbar">
        <button className="button toolbar-scan" onClick={scanPage} type="button" disabled={Boolean(busy)}>
          {busyLabel && <span className="spinner dark" />}
          {busyLabel ?? "Scan page"}
        </button>
        <button className="icon-button" type="button" onClick={() => setView("settings")} aria-label="Open settings">⚙</button>
      </header>

      {notice && <NoticeBox notice={notice} />}

      {events.length > 0 ? (
        <>
          <section className="results-section">
            <div className="results-heading"><h2>Possible items</h2><span>{events.length}</span></div>
            <div className="event-list">
              {events.map((event, index) => (
                <EventCard
                  key={`${event.title}-${event.startDate}-${index}`}
                  draft={event}
                  active={selectedIndex === index}
                  onClick={() => {
                    setSelectedIndex(index);
                    setDuplicateWarning(undefined);
                  }}
                />
              ))}
            </div>
          </section>
          {selected && (
            <EventEditor
              draft={selected}
              onChange={updateSelected}
              onAdd={addEvent}
              busy={busy === "add"}
              duplicateWarning={duplicateWarning}
            />
          )}
        </>
      ) : (
        <section className="empty-state surface">
          <div className="empty-icon">⌁</div>
          <h2>No items yet</h2>
          <p>Scan this page or highlight an event or deadline, then choose “Add to Calendar.”</p>
          <div className="privacy-badge">On-demand scanning only</div>
        </section>
      )}
    </main>
  );
}
