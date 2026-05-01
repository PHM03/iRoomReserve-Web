'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
  Message,
  isStaffRole,
  markMessageAsRead,
  onInboxMessages,
  onSentMessages,
} from '@/lib/messages';

import ComposeModal from './ComposeModal';

type MessageFolder = 'inbox' | 'sent';

interface MessagesSectionProps {
  /** Optional override for the section title. */
  title?: string;
  /** Optional override for the section subtitle copy. */
  subtitle?: string;
}

function formatTimestamp(timestamp?: { toDate?: () => Date }): string {
  if (!timestamp || typeof timestamp.toDate !== 'function') return '';
  const date = timestamp.toDate();
  return (
    date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) +
    ' · ' +
    date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
  );
}

function getInitials(name: string): string {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return initials || '?';
}

export default function MessagesSection({
  title = 'Messages',
  subtitle = 'Direct messages with other building staff and administrators.',
}: MessagesSectionProps) {
  const { firebaseUser, profile } = useAuth();
  const [folder, setFolder] = useState<MessageFolder>('inbox');
  const [inbox, setInbox] = useState<Message[]>([]);
  const [sent, setSent] = useState<Message[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);

  const allowed = profile ? isStaffRole(profile.role) : false;

  useEffect(() => {
    if (!firebaseUser || !allowed) {
      return;
    }

    // `cancelled` shields against a final snapshot landing between
    // `unsubscribe()` returning and React fully unmounting the component.
    // Without this guard, a late callback can call setState on an unmounted
    // tree which — combined with StrictMode's effect double-invocation in
    // dev — has been observed to wedge the Firestore SDK into the
    // "Unexpected state (ID: ca9)" assertion failure.
    let cancelled = false;

    const unsubscribeInbox = onInboxMessages(firebaseUser.uid, (messages) => {
      if (cancelled) return;
      setInbox(messages);
    });
    const unsubscribeSent = onSentMessages(firebaseUser.uid, (messages) => {
      if (cancelled) return;
      setSent(messages);
    });

    return () => {
      cancelled = true;
      unsubscribeInbox();
      unsubscribeSent();
    };
  }, [firebaseUser, allowed]);

  const unreadCount = useMemo(
    () => inbox.filter((message) => !message.isRead).length,
    [inbox]
  );

  if (!allowed) {
    return null;
  }

  const messages = folder === 'inbox' ? inbox : sent;

  const handleOpenMessage = async (message: Message) => {
    const willOpen = openMessageId !== message.id;
    setOpenMessageId(willOpen ? message.id : null);

    if (willOpen && folder === 'inbox' && !message.isRead) {
      try {
        await markMessageAsRead(message.id);
      } catch (error) {
        console.warn('Failed to mark message as read:', error);
      }
    }
  };

  return (
    <section className="mb-8">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="backdrop-blur-md bg-white/40 rounded-xl px-6 py-4 border border-white/30">
          <h3 className="flex items-center gap-3 text-lg font-bold text-gray-800">
            {title}
            {unreadCount > 0 && (
              <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ui-badge-blue">
                {unreadCount} unread
              </span>
            )}
          </h3>
          <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Compose
        </button>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {(['inbox', 'sent'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setFolder(value);
              setOpenMessageId(null);
            }}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold capitalize transition-all ${
              folder === value
                ? 'border border-primary/30 bg-primary/20 text-primary'
                : 'border border-dark/10 bg-dark/5 text-black hover:text-primary'
            }`}
          >
            {value === 'inbox'
              ? `Inbox (${inbox.length})`
              : `Sent (${sent.length})`}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {messages.length === 0 ? (
          <div className="glass-card !rounded-xl p-10 text-center">
            <p className="text-sm font-bold text-black">
              {folder === 'inbox'
                ? 'No messages in your inbox yet.'
                : 'You have not sent any messages yet.'}
            </p>
            <p className="mt-1 text-xs text-black">
              {folder === 'inbox'
                ? 'New messages from staff and administrators will show up here.'
                : 'Use Compose to start a conversation with another staff member.'}
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const counterpartyName =
              folder === 'inbox' ? message.senderName : message.receiverName;
            const counterpartyRole =
              folder === 'inbox' ? message.senderRole : message.receiverRole;
            const isOpen = openMessageId === message.id;
            const isUnread = folder === 'inbox' && !message.isRead;

            return (
              <div
                key={message.id}
                className={`glass-card overflow-hidden !rounded-xl ${
                  isUnread ? 'border-l-4 border-blue-500/60' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleOpenMessage(message)}
                  className="w-full p-5 text-left transition-colors hover:bg-primary/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dark/10 bg-dark/5 text-sm font-bold text-black">
                        {getInitials(counterpartyName)}
                      </div>
                      <div className="min-w-0">
                        <div className="mb-0.5 flex items-center gap-2">
                          <h4 className="truncate text-sm font-bold text-black">
                            {folder === 'inbox'
                              ? counterpartyName
                              : `To: ${counterpartyName}`}
                          </h4>
                          {isUnread && (
                            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ui-badge-blue">
                              New
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-black">
                          <span className="font-bold">
                            {message.subject || '(no subject)'}
                          </span>
                        </p>
                        <p className="mt-1 text-[11px] text-black/70">
                          {counterpartyRole}
                          {message.createdAt
                            ? ` · ${formatTimestamp(message.createdAt)}`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <svg
                      className={`h-5 w-5 shrink-0 text-black transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-dark/5 px-5 pb-5 pt-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-black">
                      {message.body}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
      />
    </section>
  );
}
