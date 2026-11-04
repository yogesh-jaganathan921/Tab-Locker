import { TabController } from "./controller.js";
import { ALARM_NAME } from "./utils.js";

const controller = new TabController(chrome);

// Share only the display deadline with the content script.
async function publishOverlay() {
  const { enabled, away } = controller.snapshot();

  await chrome.storage.local.set({
    overlayDeadline: enabled && away ? away.deadline : null
  });
}

let queue = controller.initialize().then(publishOverlay);

function run(task) {
  const result = queue.then(async () => {
    try {
      return await task();
    } finally {
      // Refresh the display after tab switches, pauses, returns, etc.
      await publishOverlay();
    }
  });

  queue = result.catch((error) => {
    console.error("Tab Locker:", error);
  });

  return result;
}

// Register every listener synchronously at the top level of the worker.
chrome.tabs.onActivated.addListener((info) => {
  const at = Date.now();
  void run(() => controller.activated(info, at));
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  const at = Date.now();
  void run(() => controller.focusChanged(windowId, at));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void run(() => controller.removed(tabId));
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  void run(() => controller.replaced(addedTabId, removedTabId));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void run(() => controller.reconcile());
});

chrome.runtime.onStartup.addListener(() => {
  void run(() => controller.reconcile());
});

chrome.runtime.onInstalled.addListener(() => {
  void run(() => controller.reconcile());
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only extension pages can issue commands; there are no content scripts.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) return false;
  run(() => controller.handle(message)).then(
    (state) => respond({ ok: true, state }),
    (error) => respond({ ok: false, error: error.message })
  );
  return true; // Keep the asynchronous response channel open.
});
