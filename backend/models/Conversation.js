import mongoose from 'mongoose';

const ConversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    ],
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      default: null
    },
    lastMessage: {
      type: String,
      trim: true,
      default: ''
    },
    // ECC key pair for encrypting/decrypting messages in this conversation.
    // Generated once on first message send; persisted for the conversation lifetime.
    eccPublicKey: {
      type: Object,    // { x: string, y: string }
      default: null
    },
    eccPrivateKey: {
      type: String,    // BigInt string — the scalar private key
      default: null
    }
  },
  {
    timestamps: true
  }
);

ConversationSchema.index({ participants: 1, property: 1 });

export default mongoose.model('Conversation', ConversationSchema);
