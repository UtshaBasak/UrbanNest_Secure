import { sha512Hex } from './sha512.js';

function bytesToHex(b) { return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(hex) {
  if (!hex) return new Uint8Array();
  const clean = hex.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

export function cbcMac(payloadStr, keyHex) {
  const blockSize = 64; // 64 bytes (512 bits)
  const encoder = new TextEncoder();
  const data = encoder.encode(payloadStr);
  // initial chaining value: derive 64-byte IV from keyHex using repeated SHA-512
  let ivBytes = hexToBytes(keyHex);
  // expand to 64 bytes
  if (ivBytes.length < blockSize) {
    const needed = blockSize - ivBytes.length;
    const more = hexToBytes(sha512Hex(bytesToHex(ivBytes))).slice(0, needed);
    const tmp = new Uint8Array(blockSize);
    tmp.set(ivBytes, 0);
    tmp.set(more, ivBytes.length);
    ivBytes = tmp;
  } else if (ivBytes.length > blockSize) {
    ivBytes = ivBytes.slice(0, blockSize);
  }

  let prev = ivBytes;
  for (let off = 0; off < data.length; off += blockSize) {
    const block = new Uint8Array(blockSize);
    block.set(data.slice(off, off + blockSize), 0);
    const x = new Uint8Array(blockSize);
    for (let i = 0; i < blockSize; i++) x[i] = block[i] ^ prev[i];
    const digestHex = sha512Hex(bytesToHex(x));
    prev = hexToBytes(digestHex);
  }

  return bytesToHex(prev);
}

export default { cbcMac };
