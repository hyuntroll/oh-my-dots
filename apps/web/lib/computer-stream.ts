type RFB = import('@novnc/novnc').default;
type RFBConstructor = new (target: HTMLElement, url: string) => RFB;
type Connection = 'connecting' | 'connected' | 'disconnected';

// The VNC transport owns its lifetime. Health polling and tab visibility must
// never replace a working socket or erase its canvas.
export function connectComputerStream(
  node: HTMLElement, url: string, load: () => Promise<RFBConstructor>,
  onStatus: (state: Connection) => void, onRecover: () => void, onRetry: () => void,
) {
  let rfb: RFB | undefined;
  let disposed = false, closed = false, recovering = false, retryRequested = false;
  let status: Connection = 'connecting';
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const update = (next: Connection) => { status = next; onStatus(next); };
  const retry = () => {
    if (disposed || retryRequested) return;
    retryRequested = true;
    clearTimeout(retryTimer);
    onRetry();
  };
  const recover = () => {
    if (disposed || recovering) return;
    recovering = true;
    clearTimeout(handshakeTimer);
    update('disconnected');
    if (rfb && !closed) { closed = true; rfb.disconnect(); }
    onRecover();
    retryTimer = setTimeout(retry, 2500);
  };
  update('connecting');
  const handshakeTimer = setTimeout(recover, 10_000);
  load().then(RFB => {
    if (disposed || recovering) return;
    rfb = new RFB(node, url);
    rfb.viewOnly = true;
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.background = '#f49a80';
    rfb.addEventListener('connect', () => {
      if (disposed || recovering) return;
      clearTimeout(handshakeTimer);
      update('connected');
    });
    rfb.addEventListener('disconnect', () => { closed = true; recover(); });
  }).catch(recover);
  return {
    resume() { if (status === 'disconnected') retry(); },
    close() {
      if (disposed) return;
      disposed = true;
      clearTimeout(handshakeTimer); clearTimeout(retryTimer);
      if (rfb && !closed) { closed = true; rfb.disconnect(); }
      node.replaceChildren();
    },
  };
}
