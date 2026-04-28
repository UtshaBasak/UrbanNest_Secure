/**
 * RSA Encryption - Implemented from scratch using BigInt.
 * No built-in encryption functions or crypto libraries are used.
 */

function getRandomBytes(n) {
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = Date.now();
    const r = Math.random() * 256;
    const hr = typeof process !== 'undefined' && process.hrtime
      ? Number(process.hrtime.bigint() % 256n)
      : Math.floor(Math.random() * 256);
    bytes[i] = (Math.floor(r) ^ (t & 0xff) ^ hr) & 0xff;
  }
  return bytes;
}

export function modPow(base, exp, mod) {
  base = BigInt(base); exp = BigInt(exp); mod = BigInt(mod);
  if (mod === 1n) return 0n;
  let result = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

export function gcd(a, b) {
  a = BigInt(a); b = BigInt(b);
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b !== 0n) { [a, b] = [b, a % b]; }
  return a;
}

export function extGcd(a, b) {
  a = BigInt(a); b = BigInt(b);
  if (a === 0n) return { gcd: b, x: 0n, y: 1n };
  const r = extGcd(b % a, a);
  return { gcd: r.gcd, x: r.y - (b / a) * r.x, y: r.x };
}

export function modInverse(a, m) {
  a = BigInt(a); m = BigInt(m);
  a = ((a % m) + m) % m;
  const { gcd: g, x } = extGcd(a, m);
  if (g !== 1n) throw new Error('Modular inverse does not exist');
  return ((x % m) + m) % m;
}

export function randomBigInt(bits) {
  const byteCount = Math.ceil(bits / 8);
  const raw = getRandomBytes(byteCount);
  raw[0] |= 0x80;
  raw[byteCount - 1] |= 0x01;
  let n = 0n;
  for (let i = 0; i < byteCount; i++) n = (n << 8n) | BigInt(raw[i]);
  const mask = (1n << BigInt(bits)) - 1n;
  n = n & mask;
  n = n | (1n << BigInt(bits - 1));
  n = n | 1n;
  return n;
}

export function randomBigIntRange(lo, hi) {
  lo = BigInt(lo); hi = BigInt(hi);
  const range = hi - lo + 1n;
  const bits = range.toString(2).length;
  let r;
  do { r = randomBigInt(bits); r = r % range; } while (r < 0n);
  return lo + r;
}

export function isProbablePrime(n, k = 20) {
  n = BigInt(n);
  if (n < 2n) return false;
  if (n === 2n || n === 3n) return true;
  if (n % 2n === 0n) return false;
  let r = 0n, d = n - 1n;
  while (d % 2n === 0n) { r++; d >>= 1n; }
  for (let i = 0; i < k; i++) {
    const a = randomBigIntRange(2n, n - 2n);
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let composite = true;
    for (let j = 0n; j < r - 1n; j++) {
      x = modPow(x, 2n, n);
      if (x === n - 1n) { composite = false; break; }
    }
    if (composite) return false;
  }
  return true;
}

export function generatePrime(bits) {
  let candidate;
  do { candidate = randomBigInt(bits); } while (!isProbablePrime(candidate, 20));
  return candidate;
}

export function generateKeyPair(keyBits = 1024) {
  const halfBits = Math.floor(keyBits / 2);
  let p, q, n, phi, e, d;
  do {
    p = generatePrime(halfBits);
    q = generatePrime(halfBits);
    while (q === p) q = generatePrime(halfBits);
    n = p * q;
    phi = (p - 1n) * (q - 1n);
    e = 65537n;
  } while (gcd(e, phi) !== 1n);
  d = modInverse(e, phi);
  return {
    publicKey: { n: n.toString(), e: e.toString() },
    privateKey: { n: n.toString(), d: d.toString(), p: p.toString(), q: q.toString() },
  };
}

export function stringToBigInt(str) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let num = 0n;
  for (const b of bytes) num = (num << 8n) | BigInt(b);
  return num;
}

export function bigIntToString(num) {
  num = BigInt(num);
  const bytes = [];
  while (num > 0n) { bytes.unshift(Number(num & 0xffn)); num >>= 8n; }
  const decoder = new TextDecoder();
  return decoder.decode(new Uint8Array(bytes));
}

export function encrypt(plaintext, publicKey) {
  const n = BigInt(publicKey.n);
  const e = BigInt(publicKey.e);
  const maxBytes = Math.floor(n.toString(16).length / 2) - 1;
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const chunks = [];
  for (let offset = 0; offset < data.length; offset += maxBytes) {
    const slice = data.slice(offset, offset + maxBytes);
    let m = 0n;
    for (const b of slice) m = (m << 8n) | BigInt(b);
    chunks.push(modPow(m, e, n).toString(16));
  }
  return chunks.join(':');
}

export function decrypt(ciphertext, privateKey) {
  const n = BigInt(privateKey.n);
  const d = BigInt(privateKey.d);
  const chunks = ciphertext.split(':');
  let allBytes = [];
  for (const hexChunk of chunks) {
    const c = BigInt('0x' + hexChunk);
    const m = modPow(c, d, n);
    const bytes = [];
    let tmp = m;
    while (tmp > 0n) { bytes.unshift(Number(tmp & 0xffn)); tmp >>= 8n; }
    allBytes = allBytes.concat(bytes);
  }
  const decoder = new TextDecoder();
  return decoder.decode(new Uint8Array(allBytes));
}

export function fingerprint(plaintext, publicKey) {
  const n = BigInt(publicKey.n);
  const e = BigInt(publicKey.e);
  const m = stringToBigInt(plaintext.toLowerCase().trim());
  if (m >= n) {
    let h = 0n;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(plaintext.toLowerCase().trim());
    for (const b of bytes) h = (h * 31n + BigInt(b)) % n;
    return modPow(h, e, n).toString(16);
  }
  return modPow(m, e, n).toString(16);
}

export function serializeKey(key) { return JSON.stringify(key); }
export function deserializeKey(str) { return JSON.parse(str); }
