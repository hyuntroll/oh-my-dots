// Transport adapter only. Original computer panel, video element, keyboard,
// pointer scaling, control buttons and session state machine remain original.
// Frames are captured from the actual isolated local desktop; no fallback image.
const PUNCTUATION = { 32:'space',33:'exclam',34:'quotedbl',35:'numbersign',36:'dollar',37:'percent',38:'ampersand',39:'apostrophe',40:'parenleft',41:'parenright',42:'asterisk',43:'plus',44:'comma',45:'minus',46:'period',47:'slash',58:'colon',59:'semicolon',60:'less',61:'equal',62:'greater',63:'question',64:'at',91:'bracketleft',92:'backslash',93:'bracketright',94:'asciicircum',95:'underscore',96:'grave',123:'braceleft',124:'bar',125:'braceright',126:'asciitilde' };
const KEYS = { 0xff08:'BackSpace',0xff09:'Tab',0xff0d:'Return',0xff13:'Pause',0xff14:'Scroll_Lock',0xff1b:'Escape',0xff50:'Home',0xff51:'Left',0xff52:'Up',0xff53:'Right',0xff54:'Down',0xff55:'Prior',0xff56:'Next',0xff57:'End',0xff63:'Insert',0xff67:'Menu',0xff7f:'Num_Lock',0xff8d:'KP_Enter',0xffaa:'KP_Multiply',0xffab:'KP_Add',0xffad:'KP_Subtract',0xffae:'KP_Decimal',0xffaf:'KP_Divide',0xffe1:'Shift_L',0xffe2:'Shift_R',0xffe3:'Control_L',0xffe4:'Control_R',0xffe5:'Caps_Lock',0xffe7:'Meta_L',0xffe8:'Meta_R',0xffe9:'Alt_L',0xffea:'Alt_R',0xffeb:'Super_L',0xffec:'Super_R',0xff7e:'Mode_switch',0xfe03:'ISO_Level3_Shift',0xffff:'Delete',269025062:'XF86Back',269025063:'XF86Forward' };
export function localKeyName(value) {
  const key = Number(value);
  if (!Number.isSafeInteger(key) || key < 4 || key > 0xffffffff) throw Error('Unsupported local computer key symbol');
  if (KEYS[key]) return KEYS[key];
  if (key >= 0xffbe && key <= 0xffe0) return 'F' + (key - 0xffbe + 1);
  if (key >= 0xffb0 && key <= 0xffb9) return 'KP_' + (key - 0xffb0);
  if (PUNCTUATION[key]) return PUNCTUATION[key];
  if (key >= 48 && key <= 57 || key >= 65 && key <= 90 || key >= 97 && key <= 122) return String.fromCharCode(key);
  // X11 Unicode keysym syntax, accepted by xdotool's XStringToKeysym path.
  if (key >= 0x01000000 && key <= 0x0110ffff) return 'U' + (key - 0x01000000).toString(16).toUpperCase();
  return '0x' + key.toString(16);
}

export function createLocalComputerDriver(Original, { fetchImpl = globalThis.fetch.bind(globalThis), diagnostics = {}, frameInterval = 300, onError } = {}) {
  const report = error => {
    const entry = { message: String(error?.message ?? error), at: Date.now() };
    (diagnostics.errors ??= []).push(entry);
    if (diagnostics.errors.length > 50) diagnostics.errors.shift();
    onError?.(error);
  };
  const request = async (path, body, signal, extra = {}) => {
    const response = await fetchImpl('/api/computer/' + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'omit', cache: 'no-store', signal,
      headers: body === undefined ? {} : { 'Content-Type':'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), ...extra });
    if (!response.ok) { let detail; try { detail = await response.json(); } catch {} throw Object.assign(Error(detail?.error || detail?.detail || `Local computer request failed (${response.status})`), { status: response.status }); }
    return response;
  };
  return class LocalComputerDriver extends Original {
    constructor(...args) {
      super(...args);
      this._localClosed = false; this._localFailed = false;
      this._localAbort = new AbortController(); this._localTimer = null;
      this._localQueue = Promise.resolve(); this._localPending = 0; this._localGeneration = 0;
      this._localStatus = null; this._localOwns = false; this._localEpoch = null;
      this._localPointer = { x:0, y:0 }; this._localLastStatus = 0;
      this._localCanvas = null; this._localStream = null; this._localChannel = null;
      diagnostics.created = (diagnostics.created || 0) + 1;
    }
    async _status(signal = this._localAbort.signal) {
      const status = await (await request('status', undefined, signal)).json();
      if (status.connected !== true || !Number.isSafeInteger(status.epoch) || !['AGENT','USER'].includes(status.owner) || !Number.isInteger(status.width) || !Number.isInteger(status.height) || status.width <= 0 || status.height <= 0 || status.width > 8192 || status.height > 8192) throw Error(status.error || 'The local computer is offline');
      this._localStatus = status; this._localLastStatus = performance.now();
      diagnostics.status = { connected:true, owner:status.owner, width:status.width, height:status.height };
      if (this._localOwns && (status.owner !== 'USER' || status.epoch !== this._localEpoch)) {
        this._localOwns = false; this._localEpoch = null; this._localGeneration++;
        this._handleModeDidChange('observe');
      }
      return status;
    }
    _createPeer() {
      // The inherited connect() contract starts this method. There is no SDP or
      // cloud fetch here and no ownership transfer during connection.
      this._localFrame().catch(error => this._localFail(error));
    }
    async _localFrame() {
      if (this._localClosed || this._localFailed) return;
      const status = !this._localStatus || performance.now() - this._localLastStatus > 2000 ? await this._status() : this._localStatus;
      const response = await request('screenshot', undefined, this._localAbort.signal);
      if (!response.headers.get('content-type')?.startsWith('image/png')) throw Error('The local computer did not return a screen frame');
      const frame = await createImageBitmap(await response.blob());
      try {
        if (this._localClosed) return;
        if (frame.width !== status.width || frame.height !== status.height) throw Error('The local computer screen size changed; reconnect to refresh its dimensions');
        if (!this._localCanvas) this._localCanvas = document.createElement('canvas');
        const canvas = this._localCanvas;
        if (canvas.width !== frame.width || canvas.height !== frame.height) { canvas.width = frame.width; canvas.height = frame.height; }
        const context = canvas.getContext('2d', { alpha:false });
        if (!context || typeof canvas.captureStream !== 'function') throw Error('This browser cannot stream the local computer screen');
        context.drawImage(frame, 0, 0);
        if (!this._localStream) {
          this._localStream = canvas.captureStream(10);
          const channel = this._localChannel = { readyState:'open', send: value => this._localMessage(value), close: () => { if (channel.readyState === 'closed') return; channel.readyState = 'closed'; this._handleDataChannelDidClose(); } };
          this.dataChannel = channel;
          this._handleStream(this._localStream);
          this._handleDataChannelDidOpen();
          this._handlePeerDidResolve();
          diagnostics.connected = (diagnostics.connected || 0) + 1;
        }
        this._localStream.getVideoTracks()[0]?.requestFrame?.();
        diagnostics.frames = (diagnostics.frames || 0) + 1;
        diagnostics.lastFrameAt = Date.now();
      } finally { frame.close(); }
      if (!this._localClosed && !this._localFailed) this._localTimer = setTimeout(() => { this._localFrame().catch(error => this._localFail(error)); }, Math.max(100, frameInterval));
    }
    _localMessage(value) {
      if (this._localClosed) return;
      if (typeof value !== 'string') { this._localFail(Error('Unsupported binary local computer transport message')); return; }
      let message; try { message = JSON.parse(value); } catch { this._localFail(Error('Invalid local computer transport message')); return; }
      if (message.event === 'control/request') {
        this._enqueue(async () => {
          const status = await this._status(AbortSignal.timeout(5000));
          const next = await (await request('control', { owner:'USER', epoch:status.epoch }, AbortSignal.timeout(5000))).json();
          if (next.owner !== 'USER' || !Number.isSafeInteger(next.epoch)) throw Error('The local computer did not grant control');
          this._localStatus = next; this._localEpoch = next.epoch; this._localOwns = true;
          if (this._localClosed) { await this._release(); return; }
          this._handleMessage({ data:JSON.stringify({ event:'control/locked' }) });
        });
      } else if (message.event === 'control/release') {
        this._localGeneration++;
        this._enqueue(() => this._release());
      } else if (message.event === 'browser/client_outcome') {
        queueMicrotask(() => { if (!this._localClosed) this._handleMessage({ data:JSON.stringify({ event:'browser/client_outcome/ack' }) }); });
      } else if (message.event === 'browser/handoff') {
        report(Error('Local computer browser-tab handoff is unavailable'));
        this._handleMessage({ data:JSON.stringify({ event:'browser/handoff/error' }) });
      } else {
        this._localFail(Error(message.event?.startsWith('browser/webauthn/') ? 'Local computer passkey forwarding is unavailable' : message.event === 'control/clipboard' ? 'Local computer clipboard synchronization is unavailable' : 'Unsupported local computer operation: ' + String(message.event)));
      }
    }
    async _release() {
      if (!this._localOwns || this._localEpoch == null) return;
      const epoch = this._localEpoch;
      this._localOwns = false; this._localEpoch = null;
      try {
        const next = await (await request('control', { owner:'AGENT', epoch }, AbortSignal.timeout(5000), { keepalive:true })).json();
        this._localStatus = next;
      } catch (error) {
        // A newer epoch belongs to another controller. Never release that owner.
        if (error.status !== 409) throw error;
      }
      if (!this._localClosed) this._handleMessage({ data:JSON.stringify({ event:'control/release' }) });
    }
    sendMouseEvent(event) {
      // Original button packets carry only a key. A browser can deliver the
      // first click without an earlier mousemove (for example after takeover).
      // Reuse the original video/letterbox scaling before sending that button.
      if ((event.type === 'mousedown' || event.type === 'mouseup') && Number.isFinite(event.offsetX) && Number.isFinite(event.offsetY)) {
        const video = typeof globalThis.HTMLVideoElement === 'function' && event.currentTarget instanceof globalThis.HTMLVideoElement ? event.currentTarget : undefined;
        this.mouseMoved({ x:event.offsetX, y:event.offsetY }, video);
      }
      return super.sendMouseEvent(event);
    }
    sendData(kind, value) {
      if (this._localClosed || this._localFailed || this.mode !== 'control' || !this._localOwns) return;
      let input;
      if (kind === 'mousemove') {
        const status = this._localStatus;
        this._localPointer = { x:Math.max(0, Math.min(status.width - 1, Math.round(value.x))), y:Math.max(0, Math.min(status.height - 1, Math.round(value.y))) };
        input = { action:'move', ...this._localPointer };
      } else if (kind === 'mousedown' || kind === 'mouseup') {
        if (![1,2,3].includes(Number(value.key))) { this._localFail(Error('Unsupported local computer mouse button')); return; }
        if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
          const status = this._localStatus;
          this._localPointer = { x:Math.max(0, Math.min(status.width - 1, Math.round(value.x))), y:Math.max(0, Math.min(status.height - 1, Math.round(value.y))) };
        }
        input = { action:kind === 'mousedown' ? 'down' : 'up', button:Number(value.key), ...this._localPointer };
      } else if (kind === 'keydown' || kind === 'keyup') {
        try { input = { action:kind, key:localKeyName(value.key) }; } catch (error) { this._localFail(error); return; }
      } else if (kind === 'wheel') {
        if (value.x && !value.y) { this._localFail(Error('Local computer horizontal scrolling is unavailable')); return; }
        const delta = Math.sign(value.y) * Math.min(20, Math.max(1, Math.round(Math.abs(value.y))));
        if (!value.y) return;
        input = { action:'scroll', delta, ...this._localPointer };
      } else { this._localFail(Error('Unsupported local computer input: ' + kind)); return; }
      const generation = this._localGeneration, epoch = this._localEpoch;
      this._enqueue(async () => {
        if (this._localClosed || !this._localOwns || generation !== this._localGeneration || epoch !== this._localEpoch) return;
        await request('input', { ...input, actor:'USER', epoch }, AbortSignal.timeout(5000));
      });
    }
    _enqueue(operation) {
      if (this._localPending >= 256) { this._localFail(Error('Local computer input queue is full')); return; }
      this._localPending++;
      this._localQueue = this._localQueue.then(operation).catch(error => this._localFail(error)).finally(() => { this._localPending--; });
    }
    _localFail(error) {
      if (this._localClosed || this._localFailed || error?.name === 'AbortError') return;
      this._localFailed = true;
      report(error);
      this._handlePeerDidRejection(error);
      this.disconnect();
    }
    disconnect() {
      if (this._localClosed) return;
      this._localClosed = true; this._localGeneration++;
      clearTimeout(this._localTimer); this._localAbort.abort();
      // Pending grants are allowed to settle and immediately release their own
      // acknowledged epoch. Never take/release another owner's later epoch.
      this._localQueue = this._localQueue.then(() => this._release()).catch(report);
      this._localStream?.getTracks().forEach(track => track.stop());
      this._localStream = null; this.stream = null; this._localCanvas = null;
      this._localChannel?.close(); this._localChannel = null;
      clearTimeout(this._peerTimeout); this._peerTimeout = 0;
      super.disconnect();
    }
  };
}

export function installLocalComputerTransport({ driverModule, ...options }) {
  if (typeof driverModule?.ExactAdaptComputerTransport !== 'function') throw Error('The asset server must expose ExactAdaptComputerTransport on the original computer driver module.');
  return driverModule.ExactAdaptComputerTransport(Original => createLocalComputerDriver(Original, options));
}
