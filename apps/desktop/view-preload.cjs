const { ipcRenderer } = require('electron');
// The embedded app can only notify the shell of its two allowed theme values.
window.addEventListener('DOMContentLoaded', () => {
  if (window.location.origin !== 'http://localhost:3080') return;
  const notify = () => ipcRenderer.send('view-theme', document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  new MutationObserver(notify).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  notify();
});
