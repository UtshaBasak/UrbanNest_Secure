/**
 * Secure randomness helpers.
 *
 * The cryptographic algorithms in this folder are implemented from scratch,
 * but their keys, salts, nonces and OTPs must come from a cryptographically
 * secure source. `Math.random()` is predictable, so everything here uses the
 * platform CSPRNG exposed by the Web Crypto API (`crypto.getRandomValues`).
 */

/** Returns `n` cryptographically secure random bytes. */
export function randomBytes(n) {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** Uniform random integer in [0, max) without modulo bias. */
export function randomInt(max) {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) {
    throw new RangeError('max must be an integer in (0, 2^32]');
  }
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  let x;
  do {
    globalThis.crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

/** Random string of `length` characters drawn uniformly from `alphabet`. */
export function randomString(length, alphabet) {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** Numeric one-time code, e.g. randomDigits(6) -> "042917". */
export function randomDigits(length) {
  return randomString(length, '0123456789');
}
