import { browser } from "wxt/browser";
import { setPendingCapture } from "../lib/storage";
import type { BackgroundMessage, CaptureMode, PageContext } from "../lib/types";

function capturePage(mode: CaptureMode): Omit<PageContext, "capturedAt" | "timeZone"> {
  const selection = window.getSelection()?.toString().trim() || undefined;
  const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : undefined;
  const startNode = range?.commonAncestorContainer;
  const startElement = startNode instanceof Element ? startNode : startNode?.parentElement;

  const headingPath: string[] = [];
  if (startElement) {
    const allHeadings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")];
    for (const heading of allHeadings) {
      if (heading.compareDocumentPosition(startElement) & Node.DOCUMENT_POSITION_FOLLOWING) {
        const text = (heading as HTMLElement).innerText.trim();
        if (text) headingPath.push(text.slice(0, 180));
      }
    }
  }

  let text = "";
  if (mode === "selection") {
    let candidate = startElement?.closest("article,main,section,li,tr,td,blockquote,div") as HTMLElement | null;
    while (candidate?.parentElement && candidate.innerText.length < 500) {
      const parent = candidate.parentElement;
      if (parent.innerText.length > 16_000) break;
      candidate = parent;
    }
    text = candidate?.innerText || selection || "";
  } else {
    const visibleRows = [...document.querySelectorAll("tr,[role='row']")]
      .map((row) => {
        const element = row as HTMLElement;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return "";
        const cells = [...row.querySelectorAll(":scope > th,:scope > td,:scope > [role='cell'],:scope > [role='rowheader'],:scope > [role='columnheader']")]
          .map((cell) => (cell as HTMLElement).innerText.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        return cells.length >= 2 ? cells.join(" | ") : "";
      })
      .filter(Boolean);
    const structuredRows = [...new Set(visibleRows)].join("\n").slice(0, 30_000);
    const visibleText = document.body?.innerText || "";
    text = structuredRows
      ? `SEMANTIC TABLE ROWS\n${structuredRows}\n\nVISIBLE PAGE TEXT\n${visibleText}`
      : visibleText;
  }

  return {
    mode,
    selection,
    pageTitle: document.title || "Untitled page",
    sourceUrl: location.href,
    headingPath: headingPath.slice(-4),
    text: text.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 100_000)
  };
}

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active webpage was found.");
  return tab;
}

async function captureFromTab(
  mode: CaptureMode,
  tabId: number,
  fallback?: { selection?: string; pageTitle?: string; sourceUrl?: string },
  frameId?: number
): Promise<PageContext> {
  const now = new Date().toISOString();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  try {
    const results = await browser.scripting.executeScript({
      target: frameId === undefined ? { tabId } : { tabId, frameIds: [frameId] },
      func: capturePage,
      args: [mode]
    });
    const captured = results[0]?.result as Omit<PageContext, "capturedAt" | "timeZone"> | undefined;
    if (!captured) throw new Error("The page returned no readable content.");
    return { ...captured, capturedAt: now, timeZone };
  } catch {
    if (mode === "selection" && fallback?.selection) {
      return {
        mode,
        selection: fallback.selection,
        text: fallback.selection,
        pageTitle: fallback.pageTitle || "Protected page",
        sourceUrl: fallback.sourceUrl,
        headingPath: [],
        capturedAt: now,
        timeZone,
        reducedContext: true
      };
    }
    throw new Error(
      "Chrome does not allow Smart Calendar to read this page. Open a normal website and click the extension icon before scanning."
    );
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: "smart-calendar-add-selection",
      title: "Add to Calendar",
      contexts: ["selection"]
    });
  });

  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "smart-calendar-add-selection" || !tab?.id) return;
    const openingPanel = browser.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
    try {
      const context = await captureFromTab(
        "selection",
        tab.id,
        { selection: info.selectionText, pageTitle: tab.title, sourceUrl: tab.url },
        info.frameId
      );
      await setPendingCapture({ id: crypto.randomUUID(), context });
      await openingPanel;
    } catch (error) {
      await setPendingCapture({
        id: crypto.randomUUID(),
        context: {
          mode: "selection",
          selection: info.selectionText,
          text: info.selectionText || "",
          pageTitle: tab.title || "Protected page",
          sourceUrl: tab.url,
          headingPath: [],
          capturedAt: new Date().toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          reducedContext: true
        }
      });
      await openingPanel;
    }
  });

  browser.runtime.onMessage.addListener((message: BackgroundMessage) => {
    if (message.type === "CAPTURE_ACTIVE_PAGE" && message.mode === "scan") {
      return getActiveTab().then((tab) => captureFromTab("scan", tab.id!));
    }
    if (message.type === "GET_ACTIVE_TAB") {
      return getActiveTab().then((tab) => ({ id: tab.id, title: tab.title, url: tab.url }));
    }
    return undefined;
  });
});
