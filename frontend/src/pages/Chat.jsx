import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getMyConversations,
  getConversationMessages,
  sendChatMessage,
  markConversationRead
} from '../utils/api';
import { ArrowLeft, Send, MessageCircle, BookOpen, RefreshCw, Lock, X } from 'lucide-react';

const Chat = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadConversations();
  }, []);

  const queryConversationId = searchParams.get('conversationId');

  useEffect(() => {
    if (queryConversationId && queryConversationId !== selectedConversationId) {
      setSelectedConversationId(queryConversationId);
    } else if (!queryConversationId && !selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0]._id);
    }
  }, [queryConversationId, conversations, selectedConversationId]);

  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(selectedConversationId);
    } else {
      setSelectedConversation(null);
      setMessages([]);
    }
  }, [selectedConversationId]);

  // Poll every 5 seconds, but skip when tab is hidden to save server resources
  useEffect(() => {
    if (!selectedConversationId) return;
    const interval = setInterval(() => {
      if (!document.hidden) loadMessages(selectedConversationId);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedConversationId]);

  const handleSelectConversation = (conversationId) => {
    setSelectedConversationId(conversationId);
    setSearchParams({ conversationId }, { replace: true });
  };

  const loadConversations = async () => {
    try {
      setLoadingConversations(true);
      const res = await getMyConversations();
      setConversations(res.data.conversations || []);
    } catch (err) {
      console.error(err);
      setError('Unable to load conversations.');
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadMessages = async (conversationId) => {
    try {
      setLoadingMessages(true);
      const res = await getConversationMessages(conversationId);
      // Messages arrive already decrypted from the backend
      setSelectedConversation(res.data.conversation);
      setMessages(res.data.messages || []);
      await markConversationRead(conversationId);
      setConversations((prev) => prev.map((c) =>
        c._id === conversationId ? { ...c, unreadCount: 0 } : c
      ));
    } catch (err) {
      console.error(err);
      setError('Unable to load messages.');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const trimmed = messageText.trim();
    if (!trimmed || !selectedConversationId) return;
    if (trimmed.length > 2000) {
      setError('Message cannot exceed 2000 characters.');
      return;
    }
    try {
      setSendLoading(true);
      // Send plaintext to backend — backend encrypts with ECC before storing
      const res = await sendChatMessage(selectedConversationId, trimmed);
      setMessages((prev) => [...prev, res.data.message]);
      setMessageText('');
      setConversations((prev) => prev.map((c) => {
        if (c._id === selectedConversationId) {
          return {
            ...c,
            lastMessage: trimmed,
            updatedAt: res.data.message.createdAt,
            unreadCount: 0
          };
        }
        return c;
      }));
    } catch (err) {
      console.error(err);
      setError('Unable to send message.');
    } finally {
      setSendLoading(false);
    }
  };

  const renderConversationLabel = (conversation) => {
    const other = conversation.otherParticipant || {};
    return conversation.property?.title || other.name || 'Conversation';
  };

  const formatPreview = (lastMessage) => {
    if (!lastMessage) return 'No messages yet';
    return lastMessage;
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex items-center gap-3 text-neutral-900 dark:text-white">
            <MessageCircle className="h-5 w-5" />
            <h1 className="text-2xl font-semibold">Messages</h1>
            {/* ECC Encryption badge */}
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <Lock className="h-3 w-3" />
              Encrypted
            </span>
          </div>
        </div>

        {/* Error banner — was missing before, now shown */}
        {error && (
          <div className="mb-4 rounded-2xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-400 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-4 text-rose-400 hover:text-rose-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Conversation list */}
          <div className="bg-white dark:bg-neutral-800 rounded-3xl shadow-md p-4 border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Your conversations</p>
                <p className="text-lg font-semibold text-neutral-900 dark:text-white">{conversations.length}</p>
              </div>
              <button
                type="button"
                onClick={loadConversations}
                className="inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>

            {loadingConversations ? (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-16 rounded-2xl bg-neutral-100 dark:bg-neutral-700 animate-pulse" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-neutral-500 dark:text-neutral-400 text-sm">
                You don't have any conversations yet. Start by messaging a property owner or tenant.
              </div>
            ) : (
              <div className="space-y-3">
                {conversations.map((conversation) => {
                  const active = conversation._id === selectedConversationId;
                  const other = conversation.otherParticipant || {};
                  return (
                    <button
                      key={conversation._id}
                      type="button"
                      onClick={() => handleSelectConversation(conversation._id)}
                      className={`w-full text-left rounded-3xl p-4 transition ${
                        active
                          ? 'bg-cyan-600 text-white'
                          : 'bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{other.name || 'Unknown user'}</p>
                          <p className={`text-sm mt-1 ${active ? 'text-cyan-100' : 'text-neutral-500 dark:text-neutral-400'}`}>
                            {renderConversationLabel(conversation)}
                          </p>
                        </div>
                        {conversation.unreadCount > 0 && (
                          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                            {conversation.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className={`mt-3 text-sm leading-5 line-clamp-2 ${active ? 'text-cyan-100' : 'text-neutral-600 dark:text-neutral-300'}`}>
                        {formatPreview(conversation.lastMessage)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Message pane */}
          <div className="lg:col-span-2 bg-white dark:bg-neutral-800 rounded-3xl shadow-md p-6 border border-neutral-200 dark:border-neutral-700 flex flex-col h-[calc(100vh-7rem)]">
            {selectedConversation ? (
              <>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Chatting with</p>
                    <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                      {selectedConversation.otherParticipant?.name || 'Conversation'}
                    </h2>
                    {selectedConversation.property?.title && (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        {selectedConversation.property.title}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => loadMessages(selectedConversationId)}
                    className="inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
                  {loadingMessages ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((item) => (
                        <div key={item} className="h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-700 animate-pulse" />
                      ))}
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-neutral-200 dark:border-neutral-700 p-8 text-center text-neutral-500 dark:text-neutral-400">
                      No messages here yet. Send the first message to start the conversation.
                    </div>
                  ) : (
                    messages.map((message) => {
                      const mine = String(message.sender?._id || message.sender?.id) === String(user._id || user.id);
                      const isDecryptFailed = message.text === '[decryption failed]' || message.text === '[decryption key unavailable]';
                      return (
                        <div key={message._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-3xl p-4 ${
                            mine
                              ? 'bg-cyan-600 text-white'
                              : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-white'
                          }`}>
                            <div className={`text-sm leading-relaxed ${isDecryptFailed ? 'italic opacity-60' : ''}`}>
                              {message.text}
                            </div>
                            <div className={`mt-2 flex items-center justify-end gap-1 text-[11px] ${
                              mine ? 'text-cyan-100' : 'text-neutral-500 dark:text-neutral-400'
                            }`}>
                              {/* Lock icon on encrypted messages */}
                              {message.isEncrypted && <Lock className="h-2.5 w-2.5" />}
                              {new Date(message.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleSendMessage} className="mt-auto flex items-center gap-3">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type your message..."
                    maxLength={2000}
                    className="flex-1 rounded-3xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-white focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  />
                  <button
                    type="submit"
                    disabled={sendLoading || !messageText.trim()}
                    className="inline-flex items-center gap-2 rounded-3xl bg-cyan-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-60"
                  >
                    <Send className="h-4 w-4" />
                    Send
                  </button>
                </form>
              </>
            ) : (
              <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-neutral-200 dark:border-neutral-700 p-8 text-center text-neutral-500 dark:text-neutral-400">
                Select a conversation from the left to begin.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
