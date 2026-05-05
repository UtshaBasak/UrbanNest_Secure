/**
 * ECC Message Encryption for Chat (ECIES scheme)
 * Uses the project's hand-rolled secp256k1 implementation (ecc.js)
 * and SHA-512 KDF (sha512.js) — both implemented from scratch.
 *
 * Scheme: ECIES
 *   - Key agreement:  ECDH via secp256k1 scalarMult (ecc.js)
 *   - KDF:            SHA-512 (sha512.js) — first 32 bytes = AES key
 *   - Symmetric enc:  AES-256-GCM (Node built-in, used as transport cipher)
 *   - Ephemeral keys: fresh pair per message for forward secrecy
 */

import crypto from 'crypto';
import { generateECCKeyPair, deriveSharedSecret } from './ecc.js';
import { sha512Hex } from './sha512.js';

// ─── Helper: hex string → Buffer ─────────────────────────────────────────────
function hexToBuffer(hex) {
  return Buffer.from(hex.replace(/^0x/, '').padStart(64, '0'), 'hex');
}

// ─── KDF: derive 32-byte AES key from ECDH shared secret ─────────────────────
// shared is the x-coordinate of the shared point as a hex string (from deriveSharedSecret)
function deriveAesKey(sharedHex) {
  // sha512Hex returns a 128-character hex string (64 bytes)
  // We take the first 64 hex chars = 32 bytes = 256-bit AES key
  const digest = sha512Hex(sharedHex);
  return Buffer.from(digest.slice(0, 64), 'hex');
}

/**
 * Encrypt a plaintext string using ECIES with the conversation's ECC public key.
 *
 * @param {string} plaintext  - The message text to encrypt
 * @param {{ x: string, y: string }} recipientPublicKey - The conversation ECC public key
 * @returns {{ ephemeralPublicKey: { x: string, y: string }, iv: string, ciphertext: string, authTag: string }}
 */
export function encryptMessage(plaintext, recipientPublicKey) {
  // 1. Generate fresh ephemeral ECC key pair for this message
  const ephemeral = generateECCKeyPair();
  // ephemeral.privateKey: BigInt string
  // ephemeral.publicKey:  { x: string, y: string }

  // 2. ECDH: ephemeral_private × recipient_public → shared secret (x-coordinate, hex)
  const sharedHex = deriveSharedSecret(ephemeral.privateKey, recipientPublicKey);

  // 3. KDF: SHA-512(shared_x) → first 32 bytes = AES-256 key
  const aesKey = deriveAesKey(sharedHex);

  // 4. AES-256-GCM encrypt
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag(); // 16-byte GCM authentication tag

  // 5. Return envelope — all values are hex strings for safe MongoDB storage
  return {
    ephemeralPublicKey: ephemeral.publicKey,         // { x: string, y: string }
    iv:         iv.toString('hex'),                  // 24 hex chars
    ciphertext: encrypted.toString('hex'),           // variable length hex
    authTag:    authTag.toString('hex')              // 32 hex chars
  };
}

/**
 * Decrypt a message envelope using the conversation's ECC private key.
 *
 * @param {{ ephemeralPublicKey: { x: string, y: string }, iv: string, ciphertext: string, authTag: string }} envelope
 * @param {string} conversationPrivateKey - The conversation ECC private key (BigInt string)
 * @returns {string} - Decrypted plaintext
 */
export function decryptMessage(envelope, conversationPrivateKey) {
  const { ephemeralPublicKey, iv, ciphertext, authTag } = envelope;

  // 1. ECDH: conversation_private × ephemeral_public → same shared secret
  const sharedHex = deriveSharedSecret(conversationPrivateKey, ephemeralPublicKey);

  // 2. KDF: same SHA-512 → same AES key
  const aesKey = deriveAesKey(sharedHex);

  // 3. AES-256-GCM decrypt
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    aesKey,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final()   // throws if authTag does not match — tamper detection
  ]);

  return decrypted.toString('utf8');
}