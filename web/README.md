# Reading Plan web app

This is an early, separate web app. It saves a simple text plan in this browser only; it does **not** yet contain the native apps' features, import their data, or synchronize with them. Clearing site data or losing the device can erase the plan. Keep using the existing apps for your full reading plan.

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
