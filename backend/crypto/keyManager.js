/**
 * Key Management Module
 * Handles RSA key generation, storage, rotation, and distribution.
 * Keys are stored in a MongoDB collection for persistence.
 */

import mongoose from 'mongoose';
import { generateKeyPair, serializeKey, deserializeKey } from './rsa.js';
import { generateECCKeyPair, deriveSharedSecret } from './ecc.js';
import { sha512Hex } from './sha512.js';

// ─── Key Storage Schema ──────────────────────────────────────────────────────
const keySchema = new mongoose.Schema({
  purpose: {
    type: String,
    required: true,
    enum: ['user-data', 'otp', 'session', 'server-ecc'],
    unique: true,
  },
  publicKey: { type: String, required: true },
  // privateKey is stored encrypted using ECC-derived symmetric key
  privateKey: { type: String, required: true },
  ecc: { type: Object, required: true }, // stores public ECC point and metadata
  version: { type: Number, default: 1 },
  rotatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

const KeyStore = mongoose.model('KeyStore', keySchema);
const keyHistorySchema = new mongoose.Schema({
  purpose: String,
  publicKey: String,
  privateKey: String,
  ecc: Object,
  version: Number,
  rotatedAt: Date,
  archivedAt: { type: Date, default: Date.now },
}, { timestamps: true });
const KeyHistory = mongoose.model('KeyHistory', keyHistorySchema);

// ─── In-memory cache ─────────────────────────────────────────────────────────
const keyCache = new Map();
let serverECC = null;

function bytesToHex(b) {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  if (!hex) return new Uint8Array();
  const clean = hex.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function strToHex(str) {
  const enc = new TextEncoder().encode(str);
  return bytesToHex(enc);
}

function hexToStr(hex) {
  const bytes = hexToBytes(hex);
  return new TextDecoder().decode(bytes);
}

function xorHex(dataHex, keyHex) {
  const data = hexToBytes(dataHex);
  const key = hexToBytes(keyHex);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
  return bytesToHex(out);
}

async function ensureServerECC() {
  if (serverECC) return serverECC;
  // Try to load from DB
  let rec = await KeyStore.findOne({ purpose: 'server-ecc' });
  if (!rec) {
    const pair = generateECCKeyPair();
    rec = await KeyStore.create({
      purpose: 'server-ecc',
      publicKey: JSON.stringify(pair.publicKey),
      privateKey: pair.privateKey.toString(),
      ecc: { server: true },
      version: 1,
    });
  }
  serverECC = {
    public: typeof rec.publicKey === 'string' ? JSON.parse(rec.publicKey) : rec.publicKey,
    private: rec.privateKey,
  };
  return serverECC;
}

/**
 * Initialize keys for a given purpose. Generates new keys if none exist.
 * @param {string} purpose – 'user-data' | 'otp' | 'session'
 * @param {number} keyBits – RSA key size (default 512 for performance)
 */
export async function initializeKeys(purpose = 'user-data', keyBits = 512) {
  let record = await KeyStore.findOne({ purpose });
  if (!record) {
    console.log(`[KeyManager] Generating ${keyBits}-bit RSA keys for "${purpose}"...`);
    const startTime = Date.now();
    const keyPair = generateKeyPair(keyBits);
    const elapsed = Date.now() - startTime;
    console.log(`[KeyManager] Key generation for "${purpose}" completed in ${elapsed}ms`);

    // Ensure server ECC exists (persistent)
    const srv = await ensureServerECC();
    // Wrap private key using freshly generated ECC ephemeral pair
    const eccPair = generateECCKeyPair();
    const shared = deriveSharedSecret(srv.private, eccPair.publicKey);
    // Use a simple SHA-512-based KDF to produce a pseudo-key for XOR wrapping
    const wrapKey = sha512Hex(shared).slice(0, 64);
    const serializedPriv = serializeKey(keyPair.privateKey);
    // Convert serialized string to hex and XOR-wrap
    const serializedHex = strToHex(serializedPriv);
    const enc = xorHex(serializedHex, wrapKey);

    record = await KeyStore.create({
      purpose,
      publicKey: serializeKey(keyPair.publicKey),
      privateKey: enc,
      ecc: { public: eccPair.publicKey, privateWrapped: true },
      version: 1,
      rotatedAt: new Date(),
    });
  }
  // Cache in memory
  // Attempt to unwrap using server ECC private (if exists); otherwise keep wrapped
  let privObj;
  try {
    if (record.ecc && record.ecc.privateWrapped) {
      const srv = await ensureServerECC();
      const shared = deriveSharedSecret(srv.private, record.ecc.public);
      const wrapKey = sha512Hex(shared).slice(0, 64);
      const decryptedHex = xorHex(record.privateKey, wrapKey);
      const serialized = hexToStr(decryptedHex);
      privObj = deserializeKey(serialized);
    } else {
      privObj = deserializeKey(record.privateKey);
    }
  } catch (e) {
    privObj = null;
  }

  keyCache.set(purpose, {
    publicKey: deserializeKey(record.publicKey),
    privateKey: privObj,
    version: record.version,
    rawRecord: record,
  });
  console.log(`[KeyManager] Keys loaded for "${purpose}" (v${record.version})`);
}

/**
 * Get the public key for a given purpose.
 */
export function getPublicKey(purpose = 'user-data') {
  const cached = keyCache.get(purpose);
  if (!cached) throw new Error(`Keys not initialized for purpose: ${purpose}`);
  return cached.publicKey;
}

/**
 * Get the private key for a given purpose.
 */
export function getPrivateKey(purpose = 'user-data') {
  const cached = keyCache.get(purpose);
  if (!cached) throw new Error(`Keys not initialized for purpose: ${purpose}`);
  return cached.privateKey;
}

/**
 * Get the current key version.
 */
export function getKeyVersion(purpose = 'user-data') {
  const cached = keyCache.get(purpose);
  return cached ? cached.version : 0;
}

/**
 * Rotate keys: generates a new key pair and increments version.
 * Old data will need to be re-encrypted with the new key.
 * @param {string} purpose
 * @param {number} keyBits
 * @returns {{ oldKeys, newKeys }}
 */
export async function rotateKeys(purpose = 'user-data', keyBits = 512) {
  const oldCached = keyCache.get(purpose);

  console.log(`[KeyManager] Rotating keys for "${purpose}"...`);
  const keyPair = generateKeyPair(keyBits);
  const newVersion = oldCached ? oldCached.version + 1 : 1;

  // Wrap new private key with server ECC using ephemeral ECC pair
  const srv = await ensureServerECC();
  const eccPair = generateECCKeyPair();
  const shared = deriveSharedSecret(srv.private, eccPair.publicKey);
  const wrapKey = sha512Hex(shared).slice(0, 64);
  const serializedPriv = serializeKey(keyPair.privateKey);
  const serializedHex = strToHex(serializedPriv);
  const enc = xorHex(serializedHex, wrapKey);

  // Archive existing key record so old encrypted data remains decryptable
  const current = await KeyStore.findOne({ purpose });
  if (current) {
    try {
      await KeyHistory.create({
        purpose: current.purpose,
        publicKey: current.publicKey,
        privateKey: current.privateKey,
        ecc: current.ecc,
        version: current.version,
        rotatedAt: current.rotatedAt,
        archivedAt: new Date(),
      });
    } catch (e) { console.warn('[KeyManager] Failed to archive old key:', e.message); }
  }

  await KeyStore.findOneAndUpdate(
    { purpose },
    {
      publicKey: serializeKey(keyPair.publicKey),
      privateKey: enc,
      ecc: { public: eccPair.publicKey, privateWrapped: true },
      version: newVersion,
      rotatedAt: new Date(),
    },
    { upsert: true }
  );

  const newKeys = {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    version: newVersion,
  };
  keyCache.set(purpose, newKeys);
  console.log(`[KeyManager] Keys rotated for "${purpose}" to v${newVersion}`);

  return {
    oldKeys: oldCached || null,
    newKeys,
  };
}

/**
 * Initialize all required key purposes on server startup.
 */
export async function initializeAllKeys() {
  await ensureServerECC();
  await initializeKeys('user-data', 512);
  await initializeKeys('otp', 512);
  await initializeKeys('session', 512);
}

export default {
  initializeKeys,
  initializeAllKeys,
  getPublicKey,
  getPrivateKey,
  getKeyVersion,
  rotateKeys,
};
