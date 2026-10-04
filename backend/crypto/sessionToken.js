/**
 * Session / verification tokens: base64url(payload) + "|||" + CBC-MAC tag.
 *
 * The CBC-MAC key is a server-side secret derived (via SHA-512) from the RSA
 * private key of the token's purpose, so only the server can mint or verify a
 * tag. The key never travels with the token. Each payload carries `iat`, `exp`
 * and a random `jti`, and the MAC input is length-prefixed so zero-padding or
 * appended blocks cannot produce a valid tag for a different message.
 */
import { getPrivateKey } from './keyManager.js';
import { cbcMac } from './cbc_mac.js';
import { sha512Hex } from './sha512.js';
import { randomBytes } from './random.js';

const SEPARATOR = '|||';
const macKeyCache = new Map();

function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64').toString();
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 64-byte MAC key per purpose, derived from that purpose's RSA private exponent
function macKeyFor(purpose) {
  const priv = getPrivateKey(purpose);
  if (!priv) throw new Error('Private key not available');
  const cacheKey = `${purpose}:${priv.n}`;
  if (!macKeyCache.has(cacheKey)) {
    macKeyCache.set(cacheKey, sha512Hex(`urbannest-token-mac|${purpose}|${priv.d}|${priv.n}`));
  }
  return macKeyCache.get(cacheKey);
}

function tagFor(payloadStr, purpose) {
  const byteLength = new TextEncoder().encode(payloadStr).length;
  return cbcMac(`${byteLength}:${payloadStr}`, macKeyFor(purpose));
}

// Comparison time does not depend on where the strings differ
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function generateSessionToken(payloadObj, purpose = 'session', expiresInSeconds = 15 * 60) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { ...payloadObj, iat: now, exp: now + expiresInSeconds, jti: toHex(randomBytes(16)) };
  const payloadStr = JSON.stringify(payload);
  return base64UrlEncode(payloadStr) + SEPARATOR + tagFor(payloadStr, purpose);
}

export function verifySessionToken(token, purpose = 'session') {
  if (typeof token !== 'string') throw new Error('Invalid token format');
  const parts = token.split(SEPARATOR);
  if (parts.length !== 2) throw new Error('Invalid token format');
  const [b64payload, mac] = parts;
  const payloadStr = base64UrlDecode(b64payload);
  // Reject alternative encodings of the same token so blocklist lookups by
  // token string cannot be sidestepped
  if (base64UrlEncode(payloadStr) !== b64payload || !/^[0-9a-f]{128}$/.test(mac)) {
    throw new Error('Invalid token format');
  }
  if (!safeEqual(tagFor(payloadStr, purpose), mac)) throw new Error('Invalid MAC');
  const payload = JSON.parse(payloadStr);
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}

export function decodeSessionTokenUnsafe(token) {
  try {
    const [b64payload] = String(token).split(SEPARATOR);
    return JSON.parse(base64UrlDecode(b64payload));
  } catch {
    return null;
  }
}

export default { generateSessionToken, verifySessionToken };
