import { formatDuration, HISTORY_REASONS, validateLimit } from "./utils.js";

const $ = (id) => document.getElementById(id);
let state = null;
let busy = false;
let limitEdited = false;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" });

async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "Could not reach the background worker.");
  state = response.state;
  render();
}

async function act(callback, notice = "") {
  if (busy) return;
  busy = true;
  $("error").hidden = true;
  $("notice").textContent = "";
  renderControls();
  try {
    await callback();
    $("notice").textContent = notice;
  } catch (error) {
    $("error").textContent = error.message;
    $("error").hidden = false;
  } finally {
    busy = false;
    renderControls();
  }
}

function renderControls() {
  for (const button of document.querySelectorAll("button")) button.disabled = busy || !state;
  $("toggle-tracking").disabled = busy || !state?.primary;
  $("return-now").disabled = busy || !state?.primary || !state?.away;
}

function renderCountdown() {
  if (!state?.away) {
    $("countdown").textContent = "";
    return;
  }
  const remaining = state.away.deadline - Date.now();
  $("countdown").textContent = remaining > 0
    ? `${formatDuration(remaining)} until return`
    : "Return due — waiting for Chrome…";
}

function render() {
  $("primary-tab").textContent = state.primary?.title || "No default tab selected";
  if (!limitEdited) $("limit-seconds").value = state.limitSeconds;
  $("toggle-tracking").textContent = state.enabled ? "Pause tracking" : "Start tracking";
  $("status").textContent = state.error || (!state.enabled
    ? "Paused. Choose your default tab, then start tracking."
    : state.away ? "Away from your default tab." : "On your default tab. Ready when you leave.");
  renderCountdown();
  renderControls();

  const items = state.history.map((entry) => {
    const item = document.createElement("li");
    const left = document.createElement("strong");
    left.textContent = `Left ${dateFormat.format(entry.leftAt)}`;
    const details = document.createElement("span");
    details.textContent = entry.reason
      ? `${HISTORY_REASONS[entry.reason] || entry.reason}${entry.endedAt ? ` · ${dateFormat.format(entry.endedAt)} · ${formatDuration(entry.durationMs)}` : ""}`
      : "Away now · countdown running";
    const title = document.createElement("span");
    title.textContent = entry.primaryTitle;
    item.append(left, details, title);
    return item;
  });
  $("history").replaceChildren(...items);
  $("empty-history").hidden = items.length > 0;
}

$("select-primary").addEventListener("click", () => act(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("Open the popup from the tab you want to use.");
  await request({ type: "SET_PRIMARY", tabId: tab.id });
}, "Default tab selected."));

$("limit-seconds").addEventListener("input", () => { limitEdited = true; });
$("limit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void act(async () => {
    const seconds = validateLimit(Number($("limit-seconds").value));
    await request({ type: "SET_LIMIT", seconds });
    limitEdited = false;
  }, "Time limit saved. A running countdown uses the original departure time.");
});

$("toggle-tracking").addEventListener("click", () => act(() =>
  request({ type: "SET_ENABLED", enabled: !state.enabled })
));
$("return-now").addEventListener("click", () => act(() => request({ type: "RETURN_NOW" })));
$("clear-history").addEventListener("click", () => act(() => request({ type: "CLEAR_HISTORY" })));

// This interval only paints the popup. The actual return timer is a Chrome alarm.
setInterval(renderCountdown, 250);
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "session" && !busy) void act(() => request({ type: "GET_STATE" }));
});
void act(() => request({ type: "GET_STATE" }));
