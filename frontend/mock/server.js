#!/usr/bin/env node
// VoltSlot mock API server - dependency-free (Node >= 18). `node mock/server.js` -> http://localhost:8080
// Serves /api/** from routes/*.js and, as fallback, the built UI from ../backend/src/main/resources/static (SPA fallback to index.html).
const http = require('http');
const fs = require('fs');
const path = require('path');
const state = require('./lib/state');
const util = require('./lib/util');
const routes = require('./routes');

const PORT = Number(process.env.PORT || 8080);
const STATIC = process.env.STATIC_DIR || path.resolve(__dirname, '../../backend/src/main/resources/static');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain' };

const compiled = routes.map((r) => ({ ...r, ...util.compilePattern(r.pattern) }));

function send(res, status, body, headers = {}) {
  const payload = body === null || body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', ...headers });
  res.end(status === 204 ? undefined : payload);
}
const errorBody = (status, message, path, extra = {}) => ({ timestamp: state.now(), status, error: ({ 400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 500: 'Internal Server Error' })[status] || 'Error', message, path, ...extra });

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', () => { const t = Buffer.concat(chunks).toString(); if (!t) return resolve({}); try { resolve(JSON.parse(t)); } catch { resolve({}); } });
  });
}

async function handleApi(req, res, url) {
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(url.searchParams);
  // multi-valued params (e.g. ?connector=A&connector=B) are available as ctx.queryAll
  const queryAll = {}; for (const [k, v] of url.searchParams) (queryAll[k] ||= []).push(v);
  let user = null;
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) { const pl = util.verifyJwt(h.slice(7)); if (pl) user = state.findUser(pl.uid) || null; }
  const auth = (...roles) => {
    if (!user) throw new util.HttpError(401, 'Authentication required');
    if (roles.length && !roles.includes(user.role)) throw new util.HttpError(403, 'You do not have permission to perform this action');
    return user;
  };
  try {
    for (const r of compiled) {
      if (r.method !== req.method) continue;
      const m = pathname.match(r.re); if (!m) continue;
      const params = {}; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
      const out = await r.handler({ req, res, params, query, queryAll, body, user, auth, state, util });
      if (out instanceof util.Reply) return send(res, out.status, out.body, out.headers);
      if (out === undefined) return send(res, 204, null);
      return send(res, 200, out);
    }
    if (compiled.some((r) => pathname.match(r.re))) return send(res, 405, errorBody(405, 'Method not allowed', pathname));
    return send(res, 404, errorBody(404, `No mock route for ${req.method} ${pathname}`, pathname));
  } catch (e) {
    if (e instanceof util.HttpError) return send(res, e.status, errorBody(e.status, e.message, pathname, e.extra));
    console.error(e); return send(res, 500, errorBody(500, 'Mock server error: ' + e.message, pathname));
  }
}

function serveStatic(req, res, url) {
  let file = path.join(STATIC, decodeURIComponent(url.pathname));
  if (!file.startsWith(STATIC)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(url.pathname)) { res.writeHead(404); return res.end('Not found'); } // missing asset
    file = path.join(STATIC, 'index.html'); // SPA fallback
  }
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Static files not built. Run: npm run build'); }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }); return res.end(); }
  if (url.pathname.startsWith('/api')) return handleApi(req, res, url);
  return serveStatic(req, res, url);
}).listen(PORT, () => console.log(`VoltSlot mock API on http://localhost:${PORT}  (${compiled.length} routes, app time ${state.now()})`));
