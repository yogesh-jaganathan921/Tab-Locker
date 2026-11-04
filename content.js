(() => {
  // The shadow root keeps webpage styles from changing the timer.
  const host = document.createElement("div");

  host.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    pointer-events: none;
  `;

  host.hidden = true;

  const shadow = host.attachShadow({ mode: "closed" });
  const timer = document.createElement("div");

  timer.style.cssText = `
    padding: 12px 16px;
    border-radius: 10px;
    background: #233c32;
    color: white;
    font: 600 14px system-ui, sans-serif;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  `;

  shadow.append(timer);
  document.documentElement.append(host);

  let deadline = null;
  let interval = null;

  function render() {
    host.hidden = deadline === null;
    if (deadline === null) return;

    const seconds = Math.max(
      0,
      Math.ceil((deadline - Date.now()) / 1000)
    );

    const minutes = Math.floor(seconds / 60);
    const remaining = String(seconds % 60).padStart(2, "0");

    timer.textContent = seconds > 0
      ? `Back to your default tab in ${minutes}:${remaining}`
      : "Returning to your default tab…";
  }

  function updateDeadline(value) {
    deadline = Number.isFinite(value) ? value : null;

    clearInterval(interval);
    render();

    // This updates the display only—not the actual return timer.
    if (deadline !== null) {
      interval = setInterval(render, 250);
    }
  }

  // React when the background worker starts or clears a countdown.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.overlayDeadline) {
      updateDeadline(changes.overlayDeadline.newValue);
    }
  });

  // Restore the display if this webpage loads during a countdown.
  chrome.storage.local.get("overlayDeadline")
    .then(({ overlayDeadline }) => {
      updateDeadline(overlayDeadline);
    })
    .catch(() => updateDeadline(null));
})();