export const ALARM_NAME = "return-to-default-tab";
export const DEFAULT_LIMIT_SECONDS = 60;
export const MIN_LIMIT_SECONDS = 30;
export const MAX_LIMIT_SECONDS = 86400;
export const HISTORY_LIMIT = 50;

export function validateLimit(value) {
  if (!Number.isInteger(value) || value < MIN_LIMIT_SECONDS || value > MAX_LIMIT_SECONDS) {
    throw new Error("Enter a whole number of seconds from 30 to 86,400.");
  }
  return value;
}

export function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  if (hours) return `${hours}h ${minutes}m ${remaining}s`;
  if (minutes) return `${minutes}m ${remaining}s`;
  return `${remaining}s`;
}

export const HISTORY_REASONS = {
  returned: "Returned manually",
  timeout: "Returned by timer",
  "return-now": "Returned using the popup",
  paused: "Tracking paused",
  "primary-changed": "Default tab changed",
  "primary-closed": "Default tab closed",
  "return-failed": "Could not return; tracking paused",
  interrupted: "Browser session ended; return time unknown"
};
