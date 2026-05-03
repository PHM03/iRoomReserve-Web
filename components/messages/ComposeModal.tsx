'use client';

import React, { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
  ComposeMessageInput,
  MessageRecipient,
  getStaffRecipients,
  sendMessage,
} from '@/lib/messages';

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
  /** Pre-selects a recipient by uid (e.g. "Reply" flows). */
  initialRecipientId?: string;
  initialSubject?: string;
  initialBody?: string;
}

export default function ComposeModal({
  open,
  onClose,
  onSent,
  initialRecipientId = '',
  initialSubject = '',
  initialBody = '',
}: Readonly<ComposeModalProps>) {
  const { firebaseUser, profile } = useAuth();
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]);
  const [recipientsError, setRecipientsError] = useState('');
  const [recipientId, setRecipientId] = useState(initialRecipientId);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRecipientId(initialRecipientId);
    setSubject(initialSubject);
    setBody(initialBody);
    setError('');
  }, [open, initialRecipientId, initialSubject, initialBody]);

  useEffect(() => {
    if (!open || !firebaseUser) return;

    let active = true;
    setLoadingRecipients(true);
    setRecipientsError('');

    getStaffRecipients(firebaseUser.uid)
      .then((list) => {
        if (active) {
          setRecipients(list);
        }
      })
      .catch((err) => {
        console.error('Failed to load recipients:', err);
        if (active) {
          setRecipients([]);
          setRecipientsError(
            'Could not load staff recipients. Please try again later.'
          );
        }
      })
      .finally(() => {
        if (active) setLoadingRecipients(false);
      });

    return () => {
      active = false;
    };
  }, [open, firebaseUser]);

  if (!open) return null;

  const senderName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
    firebaseUser?.displayName ||
    'Unknown sender';

  const handleSend = async () => {
    if (!firebaseUser || !profile) {
      setError('You must be signed in to send messages.');
      return;
    }

    setError('');

    const recipient = recipients.find((r) => r.uid === recipientId);
    if (!recipient) {
      setError('Pick a recipient from the dropdown.');
      return;
    }

    if (!subject.trim()) {
      setError('Subject is required.');
      return;
    }
    if (!body.trim()) {
      setError('Type a message before sending.');
      return;
    }

    const payload: ComposeMessageInput = {
      senderId: firebaseUser.uid,
      senderName,
      senderRole: profile.role,
      receiverId: recipient.uid,
      receiverName: recipient.name,
      receiverRole: recipient.role,
      subject: subject.trim(),
      body: body.trim(),
    };

    setSubmitting(true);
    try {
      await sendMessage(payload);
      onSent?.();
      onClose();
    } catch (err) {
      console.error('Failed to send message:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to send message. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-end bg-black/40 p-2 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-modal-title"
    >
      <div className="glass-card w-full max-w-lg overflow-hidden !rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between border-b border-dark/10 px-5 py-4">
          <div>
            <h3 id="compose-modal-title" className="text-lg font-bold text-black">
              New Message
            </h3>
            <p className="mt-0.5 text-xs text-black/70">
              From <span className="font-bold text-black">{senderName}</span>
              {profile?.role ? ` · ${profile.role}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1 text-black transition-colors hover:text-primary disabled:opacity-50"
            aria-label="Close compose"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-black">
              To
            </label>
            <select
              value={recipientId}
              onChange={(event) => setRecipientId(event.target.value)}
              disabled={loadingRecipients || submitting}
              className="glass-input w-full px-4 py-3"
            >
              <option value="">
                {loadingRecipients ? 'Loading staff…' : 'Select a recipient'}
              </option>
              {recipients.map((recipient) => (
                <option key={recipient.uid} value={recipient.uid}>
                  {recipient.name} – {recipient.role}
                </option>
              ))}
            </select>
            {recipientsError && (
              <p className="mt-1.5 text-xs font-bold ui-text-red">{recipientsError}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-black">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              disabled={submitting}
              maxLength={120}
              className="glass-input w-full px-4 py-3"
              placeholder="Add a clear subject"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-black">
              Message
            </label>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={submitting}
              maxLength={4000}
              className="glass-input min-h-[160px] w-full resize-y px-4 py-3"
              placeholder="Write your message..."
            />
            <p className="mt-1 text-right text-[10px] text-black/60">
              {body.length}/4000
            </p>
          </div>

          {error && <p className="text-xs font-bold ui-text-red">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl px-4 py-2 text-sm font-bold text-black transition-all hover:text-primary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={submitting || loadingRecipients}
              className="btn-primary inline-flex items-center gap-2 px-5 py-2 text-sm"
            >
              {submitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
