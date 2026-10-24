#!/usr/bin/env node
/**
 * Local preview gateway.
 *
 * The Compose deployment puts nginx in front of the API and the web server
 * (infra/nginx.conf): `/api/` goes to uvicorn with the session bootstrap header
 * injected, everything else goes to the web server, and WebSocket upgrades are
 * passed through. This script mirrors exactly that on the host so `uvicorn` plus
 * `next dev` can be previewed without Docker. The isolated computer still needs
 * Docker; without it the computer surfaces report themselves offline.
 *
 * Usage:
 *   PYTHONPATH=apps/api .venv/bin/uvicorn ohmydot.main:create_app --factory --port 18000
 *   npm run dev --prefix apps/web
 *   node scripts/preview-gateway.mjs
 *   open http://localhost:3080
 */
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { readFileSync } from 'node:fs';

function readEnv() {
  try {
    return Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
      .split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const at = line.indexOf('=');
        return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, '')];
      }));
  } catch { return {}; }
}

const env = readEnv();
const api = new URL(process.env.DOT_API_URL || 'http://127.0.0.1:18000');
const web = new URL(process.env.DOT_WEB_URL || 'http://127.0.0.1:3081');
const port = Number(process.env.DOT_GATEWAY_PORT || 3080);
const token = env.DOT_SESSION_TOKEN || process.env.DOT_SESSION_TOKEN || '';
if (!token) console.warn('경고: .env.local에 DOT_SESSION_TOKEN이 없어 /api/session 인증이 실패합니다.');

const isApi = url => url === '/api' || url.startsWith('/api/');
const target = url => (isApi(url) ? api : web);

function headersFor(url, incoming) {
  const headers = { ...incoming };
  if (isApi(url)) {
    headers.host = api.host;
    headers['x-dot-bootstrap'] = token;
  }
  return headers;
}

function fail(res, error) {
  res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('게이트웨이가 대상을 찾지 못했습니다: ' + error.message + '\nAPI와 웹 서버가 실행 중인지 확인하세요.');
}

const server = createServer((req, res) => {
  const upstream = target(req.url);
  const proxy = httpRequest({ hostname: upstream.hostname, port: upstream.port, path: req.url,
    method: req.method, headers: headersFor(req.url, req.headers) },
    response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
  proxy.on('error', error => fail(res, error));
  req.pipe(proxy);
});

server.on('upgrade', (req, socket, head) => {
  const upstream = target(req.url);
  const headers = headersFor(req.url, req.headers);
  headers.connection = 'Upgrade';
  const lines = Object.entries(headers).map(([key, value]) => key + ': ' + (Array.isArray(value) ? value.join(', ') : value));
  const remote = connect(Number(upstream.port || 80), upstream.hostname, () => {
    remote.write(req.method + ' ' + req.url + ' HTTP/1.1\r\n' + lines.join('\r\n') + '\r\n\r\n');
    if (head?.length) remote.write(head);
    socket.pipe(remote); remote.pipe(socket);
  });
  remote.on('error', () => socket.destroy());
  socket.on('error', () => remote.destroy());
});

server.listen(port, '127.0.0.1', () => {
  console.log('OhMyDots 미리보기: http://localhost:' + port);
  console.log('  /api/  → ' + api.origin);
  console.log('  나머지 → ' + web.origin);
});
