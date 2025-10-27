chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    chrome.runtime.sendMessage({
      type: "tabSwitched",
      title: tab.title,
      url: tab.url
    });
  });
});
