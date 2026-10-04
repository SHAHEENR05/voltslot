// Thin fetch wrapper for the VoltSlot REST API (relative URLs, JSON, Bearer token).
// Errors are normalised to ApiError: { status, message, fieldErrors, alternatives, raw }
//   fieldErrors  -> object map { fieldName: message } (server sends [{field,message}])
//   alternatives -> body.alternatives (409 slot conflicts) or null
export const TOKEN_KEY = 'chargeiq.token';

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

export class ApiError extends Error {
  constructor({ status, message, fieldErrors = {}, alternatives = null, raw = null }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.alternatives = alternatives;
    this.raw = raw;
  }
}

function normaliseError(status, body) {
  const fe = {};
  if (Array.isArray(body?.fieldErrors)) body.fieldErrors.forEach((f) => { if (f?.field) fe[f.field] = f.message; });
  else if (body?.fieldErrors && typeof body.fieldErrors === 'object') Object.assign(fe, body.fieldErrors);
  let message = body?.message || body?.error || '';
  if (!message) {
    message = status === 0 ? 'Cannot reach the server. Check your connection.'
      : status === 401 ? 'Please sign in to continue.'
      : status === 403 ? 'You do not have permission to do that.'
      : status === 404 ? 'Not found.'
      : status >= 500 ? 'Something went wrong on our side. Please try again.' : `Request failed (${status}).`;
  }
  return new ApiError({ status, message, fieldErrors: fe, alternatives: body?.alternatives || null, raw: body });
}

function qs(params) {
  if (!params) return '';
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x)); else p.append(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request(method, path, { body, params, auth = true, raw = false, headers = {} } = {}) {
  const h = { Accept: 'application/json', ...headers };
  const token = getToken();
  if (token && auth) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api${path}${qs(params)}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw normaliseError(0, null);
  }
  if (raw) {
    if (!res.ok) { let b = null; try { b = await res.json(); } catch { /* */ } throw normaliseError(res.status, b); }
    return res;
  }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new CustomEvent('chargeiq:unauthorized'));
    throw normaliseError(res.status, typeof data === 'object' ? data : null);
  }
  return data;
}

export const api = {
  get: (path, params, opts) => request('GET', path, { params, ...opts }),
  post: (path, body = {}, opts) => request('POST', path, { body, ...opts }),
  put: (path, body = {}, opts) => request('PUT', path, { body, ...opts }),
  del: (path, opts) => request('DELETE', path, opts),
};
export const get = api.get;
export const post = api.post;
export const put = api.put;
export const del = api.del;

/** Authenticated download -> saves a file (CSV exports, invoices). */
export async function download(path, params, filename = 'download') {
  const res = await request('GET', path, { params, raw: true, headers: { Accept: '*/*' } });
  const blob = await res.blob();
  saveBlob(blob, filename);
}
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const downloadText = (text, filename, type = 'text/plain') => saveBlob(new Blob([text], { type }), filename);
export default api;
