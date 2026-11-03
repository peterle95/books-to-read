# Reading Plan web app

This early web app stores a text draft separately from an imported desktop bundle. It does not edit the structured bundle or synchronize with other apps. Clearing site data or losing the device can erase both; keep backups.

## Transfer a bundle

Select `plan.json`, `books.json`, `sessions.json`, and `manifest.json` together, then import. Validation runs before confirmation; confirming replaces the previously stored bundle, not the text draft. To transfer back, download the bundle ZIP, extract its four files into an empty folder, and open that folder in the desktop app. The original file bytes are preserved.

There is no merge or automatic sync. Use one active editor at a time: finish and export from one app before importing into the other, and keep a backup before replacement. Changes made independently in two places cannot be combined here.

## Deploy and install

In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. A push to `main` or a manually started **Deploy web app** workflow publishes this directory. Confirm the workflow succeeds and open its Pages URL over HTTPS. On Android, use the browser's **Install app** or **Add to Home screen** menu. Wording and availability depend on the browser.

## Verify on a real device

1. Open the Pages URL online on Android and install the app from the browser menu.
2. Open the installed app, save a plan, and reload to check it remains.
3. Wait for the initial load to finish, close the app, enable airplane mode, and reopen it. Check the plan is still there and can be edited and saved.
4. Disable airplane mode and confirm the original native and desktop apps have not been changed.

Real-device verification has not been performed by the automated tests. PWA installation and offline storage behavior vary by browser and operating system.

## Automated checks

From the repository root, run `npm ci`, `npx playwright install chromium`, and `npm run test:web`. The test serves the app at a repository-like subpath and verifies persistence and an offline reload in Chromium.
