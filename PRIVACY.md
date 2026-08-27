# Smart Calendar Privacy Notice

Last updated: August 25, 2026

Smart Calendar processes webpage text only after the user clicks **Scan this page** or chooses **Add to Calendar** for highlighted text.

## Data processed

- For highlighted text: the selection, nearby readable webpage section, relevant headings, page title, source URL, capture time, and browser timezone.
- For page scans: visible event-like text sections, page title, source URL, capture time, and browser timezone.
- For Calendar or Tasks creation: only the reviewed item fields shown in the form.

Smart Calendar does not intentionally collect hidden page text, scripts, form-field values, browsing history, or page content in the background.

The extension declares access to HTTPS webpages so its user-triggered scanner can run reliably across supported sites. It does not use that permission for automatic monitoring or background collection.

## Storage

The Gemini API key, selected model, and a small list of event fingerprints are stored in `chrome.storage.local`. They are not synchronized through the extension and are not sent to the extension developer. Temporary right-click capture data is held in session storage and removed after processing.

## Third parties

Extraction text is sent directly from the extension to the Google Gemini API using the user’s key. Google’s free-tier data-use terms apply. Reviewed events and tasks are sent directly to the Google Calendar or Google Tasks API after the user authorizes access. Smart Calendar has no developer-operated backend.

## Permissions

- `activeTab` and `scripting`: read the active page only after a user gesture.
- `https://*/*`: allow the user-triggered scanner to run on normal secure websites.
- `contextMenus`: add the highlighted-text action.
- `sidePanel`: display extraction and review controls.
- `storage`: keep local settings and duplicate fingerprints.
- `identity`: request Google Calendar and Tasks authorization.
- Gemini, Calendar, and Tasks host permissions: call only their respective APIs.

The user can delete the Gemini key or disconnect Google Calendar and Tasks at any time from Settings. Uninstalling the extension removes extension-owned local data from Chrome.
