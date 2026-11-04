# Tab Locker

A plain JavaScript Chrome extension that brings you back to a default tab after a configurable time away. No framework, build step, server, or external dependencies are needed to run it.

## Install

1. Extract `tab-locker.zip`.
2. Open `chrome://extensions` in Chrome 120 or later.
3. Turn on **Developer mode**, then choose **Load unpacked**.
4. Select the extracted `tab-locker` folder containing `manifest.json`.
5. Pin Tab Locker using Chrome's Extensions menu if you want easy access.

If you already loaded an older copy, remove that copy first or replace its files with the complete contents of this folder and click **Reload** on its extension card. The new `controller.js` file is required.

## Use

1. Open the tab you want to return to.
2. Open the extension popup and click **Use current tab**.
3. Enter the allowed number of seconds and click **Save**. The default is 60 seconds; the supported range is 30 seconds to 24 hours.
4. Click **Start tracking**.
5. Switch to another tab. You can close the popup; the timer still runs.

The allowance is one continuous period away from the default tab, including switches between different Chrome windows. For example: with 60 seconds allowed, spending 20 seconds on tab B and then 40 seconds on tab C triggers a return to the default tab. Switching from B to C does not restart the timer.

Returning to the default tab manually cancels the pending return. Leaving again starts a fresh allowance. **Pause tracking** stops the current timer. **Return now** activates the default tab immediately. The extension activates your existing tab; it does not reload or navigate that page.

## What is recorded

The most recent 50 departures are stored locally on your device. Each entry includes the default tab's title, the departure time, the end time when known, the elapsed time, and why tracking ended. The popup displays timestamps in your local timezone.

**Clear** deletes completed entries. A currently running departure stays until it ends. No activity is uploaded and there is no analytics or network code. To remove all saved data, uninstall the extension.

## Behavior to know

- Chrome alarms are approximate. Returns may happen later than the deadline, especially after device sleep or browser throttling. A 30-second minimum is used for compatibility with Chrome 120 and later.
- An existing countdown continues when you leave Chrome for another app. Merely switching to another app while your default tab is selected does not start a new countdown. If you already have a countdown, its expiry can bring Chrome back to the front.
- Changing the limit during a countdown recalculates its deadline from the original departure time. If the new deadline has passed, the extension returns immediately.
- Closing the default tab disables tracking and cancels its alarm. Select another default tab and restart tracking.
- A sleeping service worker is supported: current tab IDs and deadlines are saved in `chrome.storage.session`, and missing alarms are restored when the worker starts again.
- Restarting Chrome, reloading the extension, or updating it clears the default tab selection and stops tracking. Settings and history remain. Choose your default tab again and click **Start tracking**. Any unfinished entry without a known return time is labelled as interrupted rather than inventing a return time.
- This is a focus aid; the popup always lets you pause it. It does not block websites.

## How the files fit together

| File | Responsibility |
| --- | --- |
| `manifest.json` | Registers the popup and module service worker; requests `tabs`, `storage`, and `alarms`. |
| `background.js` | Registers Chrome event listeners and serializes incoming events and popup commands. |
| `controller.js` | Owns tab selection, departures, return decisions, storage, alarms, and history. |
| `popup.html` / `popup.css` | Accessible popup markup and styling. |
| `popup.js` | Renders state and sends commands; its display countdown does not control tab switching. |
| `utils.js` | Shared settings validation, duration formatting, and constants. |
| `content.js` | Unused migration note. No content script is registered or needed. |
| `tests/controller.test.js` | Automated controller tests using a fake Chrome API and clock. |

`chrome.tabs.onActivated` detects tab changes. `chrome.windows.onFocusChanged` handles movement between Chrome windows. The worker records the first departure, stores an absolute deadline, and schedules a named Chrome alarm. Later tab switches keep that deadline. On expiry, it activates the original tab ID and focuses that tab's current window. Tab IDs are used because separate tabs can have the same URL.

The popup talks to the worker using `chrome.runtime.sendMessage`. The worker is the only writer of settings, history, and tracking state. Event handlers run through a queue to prevent overlapping commands from overwriting one another.

## Development checks

Install Node.js 20 or later, then run this from the extension folder:

```sh
npm test
```

No `npm install` is required. The tests exercise actual controller transitions, including deadline retention, returns, worker recovery, window focus, pause, changed limits, closed or moved tabs, browser restart, bounded history, and failed returns.

For a manual Chrome check, set the allowance to 30 seconds, start tracking on tab A, switch to tab B, then to tab C after about 10 seconds. A should activate around 30 seconds after leaving A. Repeat while returning manually before the deadline, while the popup is closed, and while switching to another Chrome window. Chrome may deliver an alarm late; keeping worker DevTools open also changes its sleep behavior.

## Chrome API references

- [Extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- [Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Windows API](https://developer.chrome.com/docs/extensions/reference/api/windows)
