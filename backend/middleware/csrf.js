import { randomBytes } from '../crypto/random.js';

/**
 * CSRF protection (double-submit cookie).
 *
 * Authentication uses cookies, so a malicious site could otherwise make a
 * signed-in browser send state-changing requests. The server sets a random
 * XSRF-TOKEN cookie that page scripts on our own origin can read; every
 * POST/PUT/PATCH/DELETE must echo it in the X-XSRF-TOKEN header. Other sites
 * cannot read our cookies, so they cannot produce a matching header.
 */
export const CSRF_COOKIE = 'XSRF-TOKEN';
export const CSRF_HEADER = 'x-xsrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const newToken = () => Array.from(randomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');

const cookieOptions = () => ({
  httpOnly: false, // the frontend must read it to send the header
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
});

// Constant-time string comparison
function tokensMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function csrfProtection(req, res, next) {
  let csrfToken = req.cookies[CSRF_COOKIE];
  if (typeof csrfToken !== 'string' || !/^[0-9a-f]{64}$/.test(csrfToken)) {
    csrfToken = newToken();
    res.cookie(CSRF_COOKIE, csrfToken, cookieOptions());
  }
  req.csrfToken = csrfToken;

  if (SAFE_METHODS.has(req.method)) return next();

  const headerToken = req.get(CSRF_HEADER);
  if (!tokensMatch(headerToken, req.cookies[CSRF_COOKIE])) {
    return res.status(403).json({ message: 'Invalid or missing CSRF token. Please refresh the page and try again.' });
  }
  next();
}

// GET /api/csrf-token — lets the client obtain a token before its first write
export function csrfTokenHandler(req, res) {
  res.json({ csrfToken: req.csrfToken });
}
