import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Property from '../models/Property.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { generateECCKeyPair } from '../crypto/ecc.js';
import { encryptMessage, decryptMessage } from '../crypto/eccMessageCrypto.js';

const normalizeIds = (ids) => ids.map((id) => String(id));

// ─── Ensure a conversation has an ECC key pair ────────────────────────────────
// Called before encrypting the first message in a conversation.
// If no key pair exists yet, generates one and persists it.
async function ensureConversationECCKeys(conversation) {
  if (conversation.eccPublicKey && conversation.eccPrivateKey) {
    return conversation; // already has keys
  }
  const pair = generateECCKeyPair();
  conversation.eccPublicKey  = pair.publicKey;   // { x: string, y: string }
  conversation.eccPrivateKey = pair.privateKey;  // BigInt string
  await conversation.save();
  return conversation;
}

// ─── createConversation ───────────────────────────────────────────────────────
export const createConversation = async (req, res) => {
  try {
    const { participantIds, propertyId } = req.body;
    if (!Array.isArray(participantIds) || participantIds.length !== 2) {
      return res.status(400).json({ message: 'participantIds must be an array of two user IDs' });
    }

    const normalizedParticipantIds = [...new Set(normalizeIds(participantIds))];
    if (normalizedParticipantIds.length !== 2) {
      return res.status(400).json({ message: 'participantIds must include two distinct users' });
    }

    const currentUserId = String(req.user._id);
    if (!normalizedParticipantIds.includes(currentUserId)) {
      return res.status(403).json({ message: 'You must be a participant in the conversation' });
    }

    let property = null;
    if (propertyId) {
      property = await Property.findById(propertyId).select('_id owner');
      if (!property) {
        return res.status(404).json({ message: 'Property not found' });
      }
      if (!normalizedParticipantIds.includes(String(property.owner))) {
        return res.status(400).json({ message: 'Property owner must be included in participantIds' });
      }
    }

    const foundUsers = await User.find({ _id: { $in: normalizedParticipantIds }, isActive: true }).select('_id');
    if (foundUsers.length !== 2) {
      return res.status(404).json({ message: 'One or more participants could not be found' });
    }

    const existingConversation = await Conversation.findOne({
      participants: { $all: normalizedParticipantIds },
      property: propertyId || null
    });

    if (existingConversation) {
      return res.json({ data: { conversation: existingConversation } });
    }

    const conversation = await Conversation.create({
      participants: normalizedParticipantIds,
      property: propertyId || null
    });

    res.status(201).json({ data: { conversation } });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ message: 'Server error while creating conversation' });
  }
};

// ─── getMyConversations ───────────────────────────────────────────────────────
export const getMyConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id })
      .sort({ updatedAt: -1 })
      .populate('participants', 'name profileImage role')
      .populate('property', 'title');

    const conversationsWithUnread = await Promise.all(conversations.map(async (conversation) => {
      const unreadCount = await Message.countDocuments({
        conversation: conversation._id,
        sender: { $ne: req.user._id },
        read: false
      });
      const participants = conversation.participants || [];
      const otherParticipant = participants.find(
        (participant) => String(participant._id) !== String(req.user._id)
      );
      // Strip ECC keys from the response — never expose private key to frontend
      const convObj = conversation.toObject();
      delete convObj.eccPrivateKey;
      delete convObj.eccPublicKey;
      return { ...convObj, otherParticipant, unreadCount };
    }));

    res.json({ data: { conversations: conversationsWithUnread } });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: 'Server error while fetching conversations' });
  }
};

// ─── getConversationMessages ──────────────────────────────────────────────────
// Fetches all messages and DECRYPTS them server-side before returning.
// The frontend always receives plaintext — decryption is done here using ecc.js.
export const getConversationMessages = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    const conversation = await Conversation.findOne({ _id: id, participants: req.user._id })
      .populate('participants', 'name profileImage role')
      .populate('property', 'title');

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const rawMessages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: 1 })
      .populate('sender', 'name profileImage role');

    // Decrypt each encrypted message using the conversation's ECC private key
    const messages = rawMessages.map((msg) => {
      const msgObj = msg.toObject();

      if (msgObj.isEncrypted && msgObj.encryptedEnvelope) {
        if (!conversation.eccPrivateKey) {
          // Should never happen — private key always stored with envelope
          msgObj.text = '[decryption key unavailable]';
          return msgObj;
        }
        try {
          // DECRYPT using from-scratch ECC (ecc.js + sha512.js + AES-GCM)
          msgObj.text = decryptMessage(msgObj.encryptedEnvelope, conversation.eccPrivateKey);
        } catch (err) {
          console.error('[Chat] Decryption failed for message', msgObj._id, err.message);
          msgObj.text = '[decryption failed]';
        }
        // Remove the raw envelope from the response — frontend only needs plaintext
        delete msgObj.encryptedEnvelope;
      }

      return msgObj;
    });

    // Strip ECC keys from conversation before sending to frontend
    const convObj = conversation.toObject();
    delete convObj.eccPrivateKey;
    delete convObj.eccPublicKey;

    res.json({ data: { conversation: convObj, messages } });
  } catch (error) {
    console.error('Get conversation messages error:', error);
    res.status(500).json({ message: 'Server error while fetching messages' });
  }
};

// ─── sendMessage ──────────────────────────────────────────────────────────────
// Receives plaintext from frontend, ENCRYPTS it using ECC before storing in MongoDB.
export const sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }
    if (text.trim().length > 2000) {
      return res.status(400).json({ message: 'Message cannot exceed 2000 characters' });
    }

    let conversation = await Conversation.findOne({ _id: id, participants: req.user._id });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Ensure this conversation has an ECC key pair (lazy generation on first message)
    conversation = await ensureConversationECCKeys(conversation);

    // ENCRYPT the plaintext using ECIES (ecc.js + sha512.js)
    // encryptMessage generates a fresh ephemeral ECC pair for this message
    const envelope = encryptMessage(text.trim(), conversation.eccPublicKey);
    // envelope = { ephemeralPublicKey: {x,y}, iv, ciphertext, authTag }
    // — all hex strings, safe for MongoDB

    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      text: '[encrypted]',          // placeholder — actual content is in encryptedEnvelope
      encryptedEnvelope: envelope,  // ECC-ECIES encrypted envelope stored in DB
      isEncrypted: true,
      read: false
    });

    // lastMessage preview — safe placeholder, never leaks content
    conversation.lastMessage = '🔒 Encrypted message';
    await conversation.save();

    const recipientId = conversation.participants.find(
      (participantId) => String(participantId) !== String(req.user._id)
    );

    if (recipientId) {
      await Notification.create({
        user: recipientId,
        title: 'New message',
        message: `${req.user.name} sent you a message.`,
        link: `/chat?conversationId=${conversation._id}`,
        meta: { conversationId: conversation._id }
      });
    }

    await message.populate('sender', 'name profileImage role');

    // Return the message with the PLAINTEXT (not the envelope) so the sender
    // sees their own message immediately without an extra decrypt round-trip.
    const responseMsg = message.toObject();
    responseMsg.text = text.trim();      // sender sees their own plaintext in UI
    delete responseMsg.encryptedEnvelope; // never expose raw envelope to frontend

    res.status(201).json({ data: { message: responseMsg } });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error while sending message' });
  }
};

// ─── markConversationRead ─────────────────────────────────────────────────────
export const markConversationRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid conversation ID' });
    }

    const conversation = await Conversation.findOne({ _id: id, participants: req.user._id });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    await Message.updateMany(
      {
        conversation: conversation._id,
        sender: { $ne: req.user._id },
        read: false
      },
      { read: true }
    );

    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Mark conversation read error:', error);
    res.status(500).json({ message: 'Server error while updating messages' });
  }
};
