const { app, BrowserWindow, WebContentsView, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const URL_HOME = 'http://localhost:3080/';
let win, view;
app.setName('OhMyDots');
function external(url) { if (/^https?:\/\//i.test(url)) shell.openExternal(url); }
function bounds() { if (win && view) { const [width, height] = win.getContentSize(); view.setBounds({ x: 0, y: 48, width, height: Math.max(0, height - 48) }); } }
async function reload() {
  if (!win || !view) return;
  const target = view;
  win.contentView.removeChildView(target);
  win.webContents.send('status', 'loading');
  try {
    await target.webContents.loadURL(URL_HOME);
    if (!win || target !== view) return;
    win.contentView.addChildView(target); bounds();
    win.webContents.send('status', 'ready');
  } catch { if (win) win.webContents.send('status', 'offline'); }
}
function create() {
  win = new BrowserWindow({ width: 1320, height: 860, minWidth: 860, minHeight: 560, backgroundColor: '#171717', title: 'OhMyDots', titleBarStyle: 'hidden', trafficLightPosition: { x: 16, y: 17 }, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  view = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, partition: 'persist:ohmydots-preview' } });
  view.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  view.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== new URL(URL_HOME).origin) { event.preventDefault(); external(url); } });
  view.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  view.webContents.on('render-process-gone', () => { if (win) { win.contentView.removeChildView(view); win.webContents.send('status', 'offline'); } });
  win.on('resize', bounds);
  win.on('closed', () => { view?.webContents.close(); view = null; win = null; });
  win.webContents.once('did-finish-load', reload);
  win.loadFile(path.join(__dirname, 'shell.html'));
}
function menu() { return Menu.buildFromTemplate([{ label: '새로고침', accelerator: 'CmdOrCtrl+R', click: reload }, { label: '브라우저에서 열기', click: () => external(URL_HOME) }, { type: 'separator' }, { role: 'togglefullscreen', label: '전체 화면' }, { role: 'zoom', label: '확대/축소' }]); }
ipcMain.on('action', (event, action) => {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return;
  if (action === 'reload') reload();
  if (action === 'browser') external(URL_HOME);
  if (action === 'menu') menu().popup({ window: win });
});
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'OhMyDots', submenu: [{ role: 'about', label: 'OhMyDots 정보' }, { type: 'separator' }, { role: 'hide', label: 'OhMyDots 가리기' }, { role: 'hideOthers', label: '다른 앱 가리기' }, { role: 'unhide', label: '모두 보기' }, { type: 'separator' }, { role: 'quit', label: 'OhMyDots 종료' }] }, { label: '편집', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }, { label: '보기', submenu: menu().items.map(item => ({ label: item.label, role: item.role, accelerator: item.accelerator, type: item.type, click: item.click })) }, { role: 'windowMenu', label: '창' }]));
    create(); app.on('activate', () => { if (!win) create(); });
  });
}
