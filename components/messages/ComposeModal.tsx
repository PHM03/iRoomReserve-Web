'use client';

import React, { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
  ComposeMessageInput,
  MessageRecipient,
  getStaffRecipients,
  sendMessage,
} from '@/lib/messages/messages';

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
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientSuggestionsOpen, setRecipientSuggestionsOpen] = useState(false);
  const [activeRecipientIndex, setActiveRecipientIndex] = useState(0);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRecipientId(initialRecipientId);
    setRecipientSearch('');
    setRecipientSuggestionsOpen(false);
    setActiveRecipientIndex(0);
    setSubject(initialSubject);
    setBody(initialBody);
    setError('');
  }, [open, initialRecipientId, initialSubject, initialBody]);

  useEffect(() => {
    if (!open || !firebaseUser) return;

    let active = true;
    setLoadingRecipients(true);
    setRecipientsError('');

    getStaffRecipients(firebaseUser.uid, profile?.role)
      .then((list) => {
        if (active) {
          setRecipients(list);
        }
      })
      .catch((error) => {
        console.error('Failed to load recipients:', error);
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
  }, [open, firebaseUser, profile?.role]);

  if (!open) return null;

  const senderName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
    firebaseUser?.displayName ||
    'Unknown sender';
  const selectedRecipient = recipients.find((recipient) => recipient.uid === recipientId);
  const normalizedRecipientSearch = recipientSearch.trim().toLocaleLowerCase();
  const matchingRecipients = normalizedRecipientSearch
    ? recipients
        .filter((recipient) =>
          `${recipient.name} ${recipient.email} ${recipient.role}`
            .toLocaleLowerCase()
            .includes(normalizedRecipientSearch)
        )
        .slice(0, 8)
    : [];

  const selectRecipient = (recipient: MessageRecipient) => {
    setRecipientId(recipient.uid);
    setRecipientSearch('');
    setRecipientSuggestionsOpen(false);
    setActiveRecipientIndex(0);
  };

  const handleSend = async () => {
    if (!firebaseUser || !profile) {
      setError('You must be signed in to send messages.');
      return;
    }

    setError('');

    const recipient = recipients.find((r) => r.uid === recipientId);
    if (!recipient) {
      setError('Choose a recipient from the search suggestions.');
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
    } catch (error) {
      console.error('Failed to send message:', error);
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to send message. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px] sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-modal-title"
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.28)] sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <h3 id="compose-modal-title" className="text-xl font-bold text-[#202124]">
              New Message
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              From <span className="font-semibold text-gray-800">{senderName}</span>
              {profile?.role ? ` · ${profile.role}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
            aria-label="Close compose"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5">
          <div>
            <label htmlFor="compose-recipient" className="mb-2 block text-sm font-semibold text-gray-800">
              To
            </label>
            <div
              className="relative"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setRecipientSuggestionsOpen(false);
                }
              }}
            >
              {selectedRecipient ? (
                <div className="flex min-h-12 items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {selectedRecipient.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0]?.toUpperCase())
                      .join('')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">
                      {selectedRecipient.name}
                    </span>
                    <span className="block truncate text-xs text-gray-500">
                      {selectedRecipient.email || selectedRecipient.role}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRecipientId('');
                      setRecipientSearch('');
                      setRecipientSuggestionsOpen(true);
                    }}
                    disabled={submitting}
                    className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    aria-label="Change recipient"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <input
                  id="compose-recipient"
                  type="text"
                  value={recipientSearch}
                  onChange={(event) => {
                    setRecipientSearch(event.target.value);
                    setActiveRecipientIndex(0);
                    setRecipientSuggestionsOpen(true);
                  }}
                  onFocus={() => setRecipientSuggestionsOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' && matchingRecipients.length > 0) {
                      event.preventDefault();
                      setRecipientSuggestionsOpen(true);
                      setActiveRecipientIndex((index) => (index + 1) % matchingRecipients.length);
                    } else if (event.key === 'ArrowUp' && matchingRecipients.length > 0) {
                      event.preventDefault();
                      setActiveRecipientIndex((index) =>
                        (index - 1 + matchingRecipients.length) % matchingRecipients.length
                      );
                    } else if (event.key === 'Enter' && recipientSuggestionsOpen && matchingRecipients[activeRecipientIndex]) {
                      event.preventDefault();
                      selectRecipient(matchingRecipients[activeRecipientIndex]);
                    } else if (event.key === 'Escape') {
                      setRecipientSuggestionsOpen(false);
                    }
                  }}
                  disabled={loadingRecipients || submitting}
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={recipientSuggestionsOpen && matchingRecipients.length > 0}
                  aria-controls="compose-recipient-suggestions"
                  placeholder={loadingRecipients ? 'Loading accounts…' : 'Search by name or email'}
                  className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-gray-50"
                />
              )}
              {!selectedRecipient && recipientSuggestionsOpen && recipientSearch.trim() && (
                <div
                  id="compose-recipient-suggestions"
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl"
                >
                  {matchingRecipients.length ? (
                    matchingRecipients.map((recipient, index) => (
                      <button
                        key={recipient.uid}
                        type="button"
                        role="option"
                        aria-selected={index === activeRecipientIndex}
                        onMouseEnter={() => setActiveRecipientIndex(index)}
                        onClick={() => selectRecipient(recipient)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                          index === activeRecipientIndex ? 'bg-primary/5' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                          {recipient.name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((part) => part[0]?.toUpperCase())
                            .join('')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-gray-900">
                            {recipient.name}
                          </span>
                          <span className="block truncate text-xs text-gray-500">
                            {recipient.email || 'Email not provided'}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600">
                          {recipient.role}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-4 text-center text-sm text-gray-500">
                      No matching accounts found.
                    </p>
                  )}
                </div>
              )}
            </div>
            {recipientsError && (
              <p className="mt-1.5 text-xs font-bold ui-text-red">{recipientsError}</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-800">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              disabled={submitting}
              maxLength={120}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="Add a clear subject"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-800">
              Message
            </label>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={submitting}
              maxLength={4000}
              className="min-h-[160px] w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="Write your message..."
            />
            <p className="mt-1 text-right text-[10px] text-black/60">
              {body.length}/4000
            </p>
          </div>

          {error && <p className="text-xs font-bold ui-text-red">{error}</p>}

        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 bg-gray-50/80 px-6 py-4">
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
  );
}
