import { getPublicKey, getPrivateKey } from './keyManager.js';
import { encrypt, decrypt } from './rsa.js';
import { cbcMac } from './cbc_mac.js';
import { generateSalt, sha512Hex } from './sha512.js';

function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64').toString();
}

export function generateSessionToken(payloadObj, purpose = 'session', expiresInSeconds = 15 * 60) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Object.assign({}, payloadObj);
  payload.exp = now + expiresInSeconds;
  const payloadStr = JSON.stringify(payload);

  // symmetric key per session (hex)
  const sessionKey = generateSalt(32); // 32 bytes -> 64 hex chars

  const mac = cbcMac(payloadStr, sessionKey);

  const pub = getPublicKey(purpose);
  const encryptedKey = encrypt(sessionKey, pub);

  const token = [base64UrlEncode(payloadStr), mac, encryptedKey].join('|||');
  return token;
}

export function verifySessionToken(token, purpose = 'session') {
  try {
    const parts = token.split('|||');
    if (parts.length !== 3) throw new Error('Invalid token format');
    const [b64payload, mac, encryptedKey] = parts;
    const payloadStr = base64UrlDecode(b64payload);
    const priv = getPrivateKey(purpose);
    if (!priv) throw new Error('Private key not available');
    const sessionKey = decrypt(encryptedKey, priv);
    const mac2 = cbcMac(payloadStr, sessionKey);
    if (mac2 !== mac) throw new Error('Invalid MAC');
    const payload = JSON.parse(payloadStr);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
    return payload;
  } catch (err) {
    throw err;
  }
}

export default { generateSessionToken, verifySessionToken };

export function decodeSessionTokenUnsafe(token) {
  try {
    const parts = token.split('|||');
    if (parts.length < 1) return null;
    const payloadStr = base64UrlDecode(parts[0]);
    return JSON.parse(payloadStr);
  } catch {
    return null;
  }
}
