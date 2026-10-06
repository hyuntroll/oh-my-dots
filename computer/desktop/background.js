// Chromium may create its initial tab before registering a newly loaded override.
chrome.runtime.onInstalled.addListener(({reason}) => {
  if (reason !== 'install') return;
  chrome.tabs.query({}, tabs => {
    if (tabs.length === 1) chrome.tabs.update(tabs[0].id, {url:'chrome://newtab/'});
  });
});
