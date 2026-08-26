# Chrome Web Store Release Checklist

- Replace the development OAuth client with a production Chrome Extension OAuth client bound to the Web Store extension ID.
- Complete Google OAuth consent-screen verification for `calendar.events.owned` if required for public users.
- Host and link the final privacy policy from the store listing.
- Confirm that the store data-use disclosure matches `PRIVACY.md` and Gemini’s current free-tier terms.
- Confirm no Gemini keys, OAuth tokens, `.env.local`, or private keys are present in the archive.
- Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm zip` from a clean checkout.
- Test install, context menu, on-demand scan, reduced-context handling, Gemini failures, Google consent, recurrence, exclusions, duplicate override, and Calendar deep link on current stable Chrome.
- Capture store screenshots at the required sizes and prepare a concise single-purpose description.
- Upload the WXT-produced Chrome MV3 zip and resolve every automated review warning before publishing.
