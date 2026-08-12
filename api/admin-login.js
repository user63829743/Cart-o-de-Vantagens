const crypto = require('crypto');

const SESSION_COOKIE = 'club_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function getAdminPassword() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error('ADMIN_PASSWORD não está configurada no ambiente do Vercel.');
  }
  return password;
}

function secureEquals(received, expected) {
  const receivedBuffer = Buffer.from(String(received || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || '')
      .split(';')
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => {
        const separator = item.indexOf('=');
        return separator === -1
          ? [item, '']
          : [item.slice(0, separator), decodeURIComponent(item.slice(separator + 1))];
      })
  );
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function createSessionToken() {
  const secret = getAdminPassword();
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

function isValidSession(request) {
  try {
    const token = parseCookies(request)[SESSION_COOKIE];
    if (!token) return false;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;
    const expected = sign(payload, getAdminPassword());
    if (!secureEquals(signature, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number(data.exp) > Date.now();
  } catch (_) {
    return false;
  }
}

function setSessionCookie(response) {
  const token = createSessionToken();
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

function readBody(request) {
  if (typeof request.body === 'string') {
    try { return JSON.parse(request.body); } catch (_) { return {}; }
  }
  return request.body || {};
}

function sendJson(response, status, body) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.status(status).json(body);
}

module.exports = {
  clearSessionCookie,
  getAdminPassword,
  isValidSession,
  readBody,
  secureEquals,
  sendJson,
  setSessionCookie,
};
