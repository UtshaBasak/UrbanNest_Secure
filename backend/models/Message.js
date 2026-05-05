import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // Plaintext text field — only populated for legacy unencrypted messages.
    // For encrypted messages this is set to '[encrypted]' as a placeholder.
    text: {
      type: String,
      trim: true,
      default: ''
    },
    // ECC-ECIES encrypted envelope.
    // Stored as a sub-document: { ephemeralPublicKey: {x,y}, iv, ciphertext, authTag }
    // All values are hex strings. Null for legacy unencrypted messages.
    encryptedEnvelope: {
      type: Object,
      default: null
    },
    // True when encryptedEnvelope is present and used.
    // False for legacy messages sent before encryption was enabled.
    isEncrypted: {
      type: Boolean,
      default: false
    },
    read: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Message', MessageSchema);
