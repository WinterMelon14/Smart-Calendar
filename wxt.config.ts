import { defineConfig } from "wxt";
import { existsSync, readFileSync } from "node:fs";

function readLocalOAuthClientId(): string | undefined {
  const fromEnvironment = process.env.WXT_GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (fromEnvironment) return fromEnvironment;

  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const line = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith("WXT_GOOGLE_OAUTH_CLIENT_ID="));
    const value = line?.split("=", 2)[1]?.trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value) return value;
  }

  return undefined;
}

const GOOGLE_OAUTH_CLIENT_ID =
  readLocalOAuthClientId() ?? "REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com";

const DEVELOPMENT_EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqgi0TfAN02Hm3q8barzqIe36VLV7pxqAGyFvT0zlZpGMwP6y2j0qtsfWAEvos1chdStlqieVlv02iulFe9QIPabODGlz65tOTaebIVrm4P+8CBnnzj2k7wxDataqwDJldG++OmnJK9vQd5m/755dNxgO3287HiAOAQ7b+u7kC9AR7QV4nGesNYEF8s59FwZEvutYSbBfUwcAV2Bkillb8cD/P2foOS27cBks40quNpRwmTqVIvqcWf/sPa2GgfcuGWDuuy8P0Tn2x7AvGBGHBXomTNdqwGCN/WL2WqwvKE1Zf4FhV6mcOZUdlyE+rDSQeVeyOn6CGYQD9QLyt1H8zwIDAQAB";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Smart Calendar",
    description: "Turn webpage dates and schedules into reviewed Google Calendar events and Tasks.",
    version: "0.1.0",
    minimum_chrome_version: "116",
    key: DEVELOPMENT_EXTENSION_KEY,
    permissions: [
      "activeTab",
      "scripting",
      "contextMenus",
      "sidePanel",
      "storage",
      "identity"
    ],
    host_permissions: [
      "https://*/*",
      "https://generativelanguage.googleapis.com/*",
      "https://www.googleapis.com/calendar/v3/*",
      "https://tasks.googleapis.com/*"
    ],
    action: {
      default_title: "Open Smart Calendar",
      default_icon: {
        "16": "icon/16.png",
        "32": "icon/32.png",
        "48": "icon/48.png",
        "128": "icon/128.png"
      }
    },
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "128": "icon/128.png"
    },
    oauth2: {
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      scopes: [
        "https://www.googleapis.com/auth/calendar.events.owned",
        "https://www.googleapis.com/auth/tasks"
      ]
    }
  }
});
