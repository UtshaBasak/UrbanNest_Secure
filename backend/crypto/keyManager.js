/**
 * Key Management Module
 * Handles RSA key generation, storage, rotation, and distribution.
 * Keys are stored in a MongoDB collection for persistence.
 */

import mongoose from 'mongoose';
import { generateKeyPair, serializeKey, deserializeKey } from './rsa.js';

// ─── Key Storage Schema ──────────────────────────────────────────────────────
const keySchema = new mongoose.Schema({
  purpose: {
    type: String,
    required: true,
    enum: ['user-data', 'otp', 'session'],
    unique: true,
  },
  publicKey: { type: String, required: true },
  privateKey: { type: String, required: true },
  version: { type: Number, default: 1 },
  rotatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

const KeyStore = mongoose.model('KeyStore', keySchema);

// ─── In-memory cache ─────────────────────────────────────────────────────────
const keyCache = new Map();

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

    record = await KeyStore.create({
      purpose,
      publicKey: serializeKey(keyPair.publicKey),
      privateKey: serializeKey(keyPair.privateKey),
      version: 1,
      rotatedAt: new Date(),
    });
  }
  // Cache in memory
  keyCache.set(purpose, {
    publicKey: deserializeKey(record.publicKey),
    privateKey: deserializeKey(record.privateKey),
    version: record.version,
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

  await KeyStore.findOneAndUpdate(
    { purpose },
    {
      publicKey: serializeKey(keyPair.publicKey),
      privateKey: serializeKey(keyPair.privateKey),
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
  await initializeKeys('user-data', 512);
}

export default {
  initializeKeys,
  initializeAllKeys,
  getPublicKey,
  getPrivateKey,
  getKeyVersion,
  rotateKeys,
};
