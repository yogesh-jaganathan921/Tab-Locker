import {
  ALARM_NAME,
  DEFAULT_LIMIT_SECONDS,
  HISTORY_LIMIT,
  validateLimit
} from "./utils.js";

const emptySession = () => ({ primary: null, enabled: false, away: null, error: "" });

// Only this controller writes tracking state. background.js serializes its calls.
export class TabController {
  constructor(api, now = Date.now) {
    this.api = api;
    this.now = now;
    this.state = emptySession();
    this.limitSeconds = DEFAULT_LIMIT_SECONDS;
    this.history = [];
  }

  async initialize() {
    const local = await this.api.storage.local.get({
      limitSeconds: DEFAULT_LIMIT_SECONDS,
      history: []
    });
    const session = await this.api.storage.session.get({ tracking: null });
    this.limitSeconds = validateLimit(local.limitSeconds);
    this.history = local.history.slice(0, HISTORY_LIMIT);
    this.state = session.tracking ?? emptySession();

    // Tab IDs are valid only for the current browser session. Never reuse them
    // after a full restart. Incomplete log entries keep an unknown return time.
    for (const entry of this.history) {
      if (!entry.reason && entry.id !== this.state.away?.id) {
        entry.reason = "interrupted";
      }
    }
    await this.persist();
    await this.reconcile();
  }

  async persist() {
    await this.api.storage.local.set({
      limitSeconds: this.limitSeconds,
      history: this.history
    });
    await this.api.storage.session.set({ tracking: this.state });
  }

  async getPrimary() {
    if (!this.state.primary) return null;
    try {
      return await this.api.tabs.get(this.state.primary.id);
    } catch {
      await this.finishAway("primary-closed");
      this.state.primary = null;
      this.state.enabled = false;
      this.state.error = "The default tab was closed. Choose another tab to continue.";
      await this.persist();
      return null;
    }
  }

  async finishAway(reason, at = this.now()) {
    const away = this.state.away;
    if (away) {
      const entry = this.history.find((item) => item.id === away.id);
      if (entry) {
        entry.endedAt = at;
        entry.durationMs = Math.max(0, at - away.leftAt);
        entry.reason = reason;
      }
    }
    this.state.away = null;
    await this.api.alarms.clear(ALARM_NAME);
  }

  async ensureAlarm() {
    if (!this.state.away || !this.state.enabled) {
      await this.api.alarms.clear(ALARM_NAME);
      return;
    }
    const existing = await this.api.alarms.get(ALARM_NAME);
    // Do not restart the countdown on every tab switch or popup refresh.
    if (!existing || existing.scheduledTime !== this.state.away.deadline) {
      await this.api.alarms.create(ALARM_NAME, { when: this.state.away.deadline });
    }
  }

  async observe(tabId, at = this.now()) {
    if (!this.state.enabled || !this.state.primary) return;
    if (tabId === this.state.primary.id) {
      if (this.state.away) {
        await this.finishAway("returned", at);
        await this.persist();
      }
      return;
    }
    if (!this.state.away) {
      const id = crypto.randomUUID();
      this.state.away = { id, leftAt: at, deadline: at + this.limitSeconds * 1000 };
      this.history.unshift({
        id,
        primaryTitle: this.state.primary.title,
        leftAt: at,
        endedAt: null,
        durationMs: null,
        reason: null
      });
      this.history = this.history.slice(0, HISTORY_LIMIT);
      await this.persist();
    }
    if (this.state.away.deadline <= this.now()) {
      await this.returnToPrimary("timeout");
    } else {
      await this.ensureAlarm();
    }
  }

  async reconcile() {
    const primary = await this.getPrimary();
    if (!primary || !this.state.enabled) {
      await this.api.alarms.clear(ALARM_NAME);
      return;
    }
    this.state.primary = {
      id: primary.id,
      title: primary.title || "Untitled tab",
      windowId: primary.windowId
    };
    // lastFocusedWindow keeps an existing away timer running when another app
    // has focus. Merely leaving Chrome while on the default tab starts no timer.
    const [active] = await this.api.tabs.query({ active: true, lastFocusedWindow: true });
    if (active) await this.observe(active.id);
    else await this.ensureAlarm();
  }

  async activated(info, at) {
    // Background windows can change active tabs without the user leaving.
    const window = await this.api.windows.get(info.windowId);
    if (window.focused) await this.observe(info.tabId, at);
  }

  async focusChanged(windowId, at) {
    if (windowId === this.api.windows.WINDOW_ID_NONE) return;
    const [tab] = await this.api.tabs.query({ active: true, windowId });
    if (tab) await this.observe(tab.id, at);
  }

  async removed(tabId) {
    if (tabId === this.state.primary?.id) await this.getPrimary();
  }

  async replaced(addedTabId, removedTabId) {
    if (removedTabId !== this.state.primary?.id) return;
    this.state.primary.id = addedTabId;
    await this.persist();
    await this.reconcile();
  }

  async returnToPrimary(reason) {
    const primary = await this.getPrimary();
    if (!primary) return;
    try {
      // Look up the live windowId: the tab may have moved to another window.
      await this.api.tabs.update(primary.id, { active: true });
      await this.api.windows.update(primary.windowId, { focused: true });
    } catch {
      await this.finishAway("return-failed");
      this.state.enabled = false;
      this.state.error = "Chrome could not activate the default tab. Choose it again and restart tracking.";
      await this.persist();
      return;
    }
    await this.finishAway(reason);
    this.state.error = "";
    await this.persist();
  }

  async handle(message) {
    switch (message.type) {
      case "GET_STATE":
        await this.reconcile();
        break;
      case "SET_PRIMARY": {
        if (!Number.isInteger(message.tabId)) throw new Error("Choose an open tab.");
        const tab = await this.api.tabs.get(message.tabId);
        await this.finishAway("primary-changed");
        this.state.primary = {
          id: tab.id,
          title: tab.title || "Untitled tab",
          windowId: tab.windowId
        };
        this.state.error = "";
        await this.persist();
        await this.reconcile();
        break;
      }
      case "SET_LIMIT":
        this.limitSeconds = validateLimit(message.seconds);
        if (this.state.away) {
          this.state.away.deadline = this.state.away.leftAt + this.limitSeconds * 1000;
        }
        await this.persist();
        await this.reconcile();
        break;
      case "SET_ENABLED":
        if (typeof message.enabled !== "boolean") throw new Error("Invalid tracking setting.");
        if (message.enabled && !(await this.getPrimary())) {
          throw new Error("Choose your default tab first.");
        }
        if (!message.enabled) await this.finishAway("paused");
        this.state.enabled = message.enabled;
        this.state.error = "";
        await this.persist();
        await this.reconcile();
        break;
      case "RETURN_NOW":
        await this.returnToPrimary("return-now");
        break;
      case "CLEAR_HISTORY":
        // Keep the running departure visible until its timer finishes.
        this.history = this.history.filter((entry) => entry.id === this.state.away?.id);
        await this.persist();
        break;
      default:
        throw new Error("Unknown Tab Locker command.");
    }
    return this.snapshot();
  }

  snapshot() {
    return structuredClone({ ...this.state, limitSeconds: this.limitSeconds, history: this.history });
  }
}
