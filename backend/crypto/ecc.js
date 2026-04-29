/*
 * Hardened ECC implementation (educational) over secp256k1 curve parameters.
 * Provides keypair generation and shared secret derivation (ECDH-style).
 * NOTE: This is still a hand-rolled implementation and is for demonstration
 * purposes only. For production use a vetted crypto library.
 */

const P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
const A = 0n;
const B = 7n;

function mod(n, m = P) { n = BigInt(n) % BigInt(m); return n < 0n ? n + BigInt(m) : n; }

function isOnCurve(pt) {
  if (!pt) return false;
  const x = BigInt(pt[0]);
  const y = BigInt(pt[1]);
  return mod(y * y - (x * x * x + A * x + B)) === 0n;
}

function pointAdd(Pt, Qt) {
  if (!Pt) return Qt;
  if (!Qt) return Pt;
  const x1 = BigInt(Pt[0]), y1 = BigInt(Pt[1]);
  const x2 = BigInt(Qt[0]), y2 = BigInt(Qt[1]);
  if (x1 === x2 && y1 === mod(-y2)) return null; // point at infinity
  let m;
  if (x1 === x2 && y1 === y2) {
    const num = (3n * x1 * x1 + A) % P;
    const den = modInverse(2n * y1, P);
    m = mod(num * den, P);
  } else {
    const num = mod(y2 - y1, P);
    const den = modInverse(mod(x2 - x1, P), P);
    m = mod(num * den, P);
  }
  const x3 = mod(m * m - x1 - x2, P);
  const y3 = mod(m * (x1 - x3) - y1, P);
  return [x3, y3];
}

function scalarMult(k, Pt) {
  let n = BigInt(k);
  if (!Pt) return null;
  let R = null;
  let Q = Pt;
  while (n > 0n) {
    if (n & 1n) R = pointAdd(R, Q);
    Q = pointAdd(Q, Q);
    n >>= 1n;
  }
  return R;
}

function randomBigIntBelow(nBits) {
  const bytes = Math.ceil(nBits / 8);
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  let r = 0n;
  for (const b of arr) r = (r << 8n) | BigInt(b);
  // reduce mod (P-1) and ensure >=1
  const scalar = (r % (P - 1n)) + 1n;
  return scalar;
}

export function generateECCKeyPair() {
  const Gx = 55066263022277343669578718895168534326250603453777594175500187360389116729240n;
  const Gy = 32670510020758816978083085130507043184471273380659243275938904335757337482424n;
  const G = [Gx % P, Gy % P];

  let priv, pub;
  for (let attempts = 0; attempts < 8; attempts++) {
    priv = randomBigIntBelow(256);
    pub = scalarMult(priv, G);
    if (pub && isOnCurve(pub)) break;
  }
  if (!pub) throw new Error('Failed to generate ECC public point');
  return {
    privateKey: priv.toString(),
    publicKey: { x: pub[0].toString(), y: pub[1].toString() }
  };
}

export function deriveSharedSecret(privHex, pub) {
  try {
    if (!pub) throw new Error('Invalid public point');
    const pubPt = Array.isArray(pub) ? pub : [pub.x, pub.y];
    if (!pubPt[0] || !pubPt[1]) throw new Error('Invalid public point components');
    const priv = BigInt(privHex);
    const S = scalarMult(priv, [BigInt(pubPt[0]), BigInt(pubPt[1])]);
    if (!S) return '0';
    return S[0].toString(16);
  } catch (e) {
    throw new Error('deriveSharedSecret error: ' + (e.message || String(e)));
  }
}

// Minimal modular inverse using extended gcd
function egcd(a, b) {
  a = BigInt(a); b = BigInt(b);
  if (a === 0n) return { g: b, x: 0n, y: 1n };
  const r = egcd(b % a, a);
  return { g: r.g, x: r.y - (b / a) * r.x, y: r.x };
}

function modInverse(a, m = P) {
  const g = egcd(mod(a, m), m);
  if (g.g !== 1n) throw new Error('No modular inverse');
  return mod(g.x, m);
}

export default { generateECCKeyPair, deriveSharedSecret, scalarMult };
