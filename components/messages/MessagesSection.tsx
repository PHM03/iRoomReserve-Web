'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { formatDate, formatDateTime, formatTimeRange } from '@/lib/utils/dateTime';
import {
  type Message,
  closeSentMessage,
  isStaffRole,
  markMessageAsRead,
  onInboxMessages,
  onSentMessages,
} from '@/lib/messages/messages';
import {
  type Notification as AppNotification,
  markNotificationRead,
} from '@/lib/notifications/notifications';
import {
  onReservationsByUser,
  type Reservation,
} from '@/lib/reservations/reservations';
import ComposeModal from './ComposeModal';

type InboxTab = 'unread' | 'read' | 'sent' | 'closed' | 'reservationUpdates';
type ReservationUpdateStatus = 'approved' | 'rejected' | 'cancelled' | 'expired' | 'pending';
type DatePreset = 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'all';
type CustomDateRange = {
  fromDate: string;
  toDate: string;
};

const DATE_PRESETS: Array<{ key: DatePreset; label: string }> = [
  {
    key: 'thisWeek',
    label: 'This Week'
  },
  {
    key: 'thisMonth',
    label: 'This Month'
  },
  {
    key: 'lastMonth',
    label: 'Last Month'
  },
  {
    key: 'thisYear',
    label: 'This Year'
  },
  {
    key: 'all',
    label: 'All'
  },
];

function getDateRange(preset: DatePreset): { from: number; to: number } {
  const now = new Date();
  switch (preset) {
    case 'thisWeek': {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      from.setHours(0, 0, 0, 0);
      return {
        from: from.getTime(),
        to: now.getTime()
      };
    }
    case 'thisMonth': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        from: from.getTime(),
        to: now.getTime()
      };
    }
    case 'lastMonth': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return {
        from: from.getTime(),
        to: to.getTime()
      };
    }
    case 'thisYear': {
      const from = new Date(now.getFullYear(), 0, 1);
      return {
        from: from.getTime(),
        to: now.getTime()
      };
    }
    case 'all':
    default:
      return {
        from: 0,
        to: Infinity
      };
  }
}

function getCustomDateRange(range: CustomDateRange): { from: number; to: number } {
  const fromDate = new Date(`${range.fromDate}T00:00:00`);
  const toDate = new Date(`${range.toDate}T23:59:59.999`);
  const fromTime = fromDate.getTime();
  const toTime = toDate.getTime();

  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
    return {
      from: 0,
      to: Infinity
    };
  }

  return {
    from: Math.min(fromTime, toTime),
    to: Math.max(fromTime, toTime),
  };
}

function getActiveDateRange(
  preset: DatePreset,
  customRange: CustomDateRange | null
): { from: number; to: number } {
  return customRange ? getCustomDateRange(customRange) : getDateRange(preset);
}

interface MessagesSectionProps {
  notifications?: AppNotification[];
  registerComposeOpener?: (openCompose: () => void) => void;
  showComposeButton?: boolean;
  showReservationUpdates?: boolean;
  initialTab?: InboxTab;
  subtitle?: string;
  title?: string;
}

function formatTimestamp(timestamp?: { toDate?: () => Date }): string {
  return formatDateTime(timestamp);
}

function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  );
}

function shortenText(value: string, maxLength: number): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength - 3).trimEnd()}...`;
}

function getMessagePreview(message: Message): string {
  if (!message.body.trim()) {
    return 'No message body provided.';
  }

  return shortenText(message.body, 180);
}

function getReservationUpdateStatus(
  notification: AppNotification,
  reservation?: Reservation,
): ReservationUpdateStatus {
  const today = new Date();
  const todayDateKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  if (reservation?.date && reservation.date < todayDateKey) {
    return 'expired';
  }

  switch (notification.type) {
    case 'reservation_approved':
      return 'approved';
    case 'reservation_rejected':
      return 'rejected';
    case 'reservation_cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

function getReservationUpdateNote(
  notification: AppNotification,
  reservation?: Reservation
): string {
  if (reservation?.reason?.trim()) {
    return reservation.reason.trim();
  }

  const reasonMatch = notification.message.match(/Reason:\s*(.+)$/i);
  if (reasonMatch?.[1]?.trim()) {
    return reasonMatch[1].trim();
  }

  if (notification.message.trim()) {
    return notification.message.trim();
  }

  return 'No additional note provided.';
}

interface StatusBadgeProps {
  status: ReservationUpdateStatus;
}

interface EmptyStateProps {
  description: string;
  title: string;
}

interface DetailFieldProps {
  children: React.ReactNode;
  className?: string;
  label: string;
}

interface DateFilterControlsProps {
  customFrom: string;
  customRange: CustomDateRange | null;
  customTo: string;
  onApplyCustomRange: () => void;
  onClearCustomRange: () => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  onPresetChange: (preset: DatePreset) => void;
  preset: DatePreset;
}

function StatusBadge({ status }: Readonly<StatusBadgeProps>) {
  const style = (() => {
    switch (status) {
      case 'approved':
        return 'ui-badge-green';
      case 'rejected':
        return 'ui-badge-red';
      case 'cancelled':
        return 'ui-badge-gray';
      case 'expired':
        return 'ui-badge-gray';
      case 'pending':
        return 'ui-badge-yellow';
      default:
        return 'ui-badge-blue';
    }
  })();

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${style}`}
    >
      {status}
    </span>
  );
}

function EmptyState({
  description,
  title,
}: Readonly<EmptyStateProps>) {
  return (
    <div className="dashboard-empty-state rounded-2xl p-10 text-center">
      <p className="text-sm font-bold text-black">{title}</p>
      <p className="mt-1 text-xs text-black/70">{description}</p>
    </div>
  );
}

function DetailField({
  children,
  className = '',
  label,
}: Readonly<DetailFieldProps>) {
  return (
    <div className={`rounded-2xl border border-dark/5 bg-dark/3 p-3 ${className}`}>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-black/55">
        {label}
      </p>
      <div className="text-sm text-black">{children}</div>
    </div>
  );
}

function DateFilterControls({
  customFrom,
  customRange,
  customTo,
  onApplyCustomRange,
  onClearCustomRange,
  onCustomFromChange,
  onCustomToChange,
  onPresetChange,
  preset,
}: Readonly<DateFilterControlsProps>) {
  const canApplyCustomRange = Boolean(customFrom && customTo);
  const canClearCustomRange = Boolean(customFrom || customTo || customRange);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <span className="mb-2 mr-1 text-[10px] font-bold uppercase tracking-wider text-black/40">
          Custom Range
        </span>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-black/45">
          From
          <input
            type="date"
            value={customFrom}
            onChange={(event) => onCustomFromChange(event.target.value)}
            className="rounded-xl border border-dark/10 bg-white px-3 py-2 text-xs font-semibold normal-case tracking-normal text-black focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-black/45">
          To
          <input
            type="date"
            value={customTo}
            onChange={(event) => onCustomToChange(event.target.value)}
            className="rounded-xl border border-dark/10 bg-white px-3 py-2 text-xs font-semibold normal-case tracking-normal text-black focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10"
          />
        </label>
        <button
          type="button"
          onClick={onApplyCustomRange}
          disabled={!canApplyCustomRange}
          className="rounded-xl border border-primary bg-primary px-3 py-2 text-xs font-bold text-white transition-all hover:bg-primary-hover disabled:cursor-not-allowed disabled:border-dark/10 disabled:bg-dark/5 disabled:text-black/35"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onClearCustomRange}
          disabled={!canClearCustomRange}
          className="rounded-xl border border-dark/10 bg-white px-3 py-2 text-xs font-bold text-black/55 transition-all hover:text-primary disabled:cursor-not-allowed disabled:text-black/25"
        >
          Clear
        </button>
        {customRange ? (
          <span className="mb-2 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
            Custom active
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-black/40">
          Period
        </span>
        {DATE_PRESETS.map((datePreset) => (
          <button
            key={datePreset.key}
            type="button"
            onClick={() => onPresetChange(datePreset.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
              !customRange && preset === datePreset.key
                ? 'border border-primary bg-primary text-white shadow-sm'
                : 'border border-dark/10 bg-white text-black/55 hover:text-primary'
            }`}
          >
            {datePreset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MessagesSection(props: Readonly<MessagesSectionProps>) {
  const { firebaseUser, profile } = useAuth();
  const registerComposeOpener = props.registerComposeOpener;
  const notifications = useMemo(
    () => props.notifications ?? [],
    [props.notifications]
  );
  const showComposeButton = props.showComposeButton ?? true;
  const showReservationUpdates =
    props.showReservationUpdates ?? props.notifications !== undefined;
  const isStaff = profile ? isStaffRole(profile.role) : false;

  const [activeTab, setActiveTab] = useState<InboxTab>(props.initialTab ?? 'unread');

  useEffect(() => {
    if (!props.initialTab) {
      return;
    }

    setActiveTab(props.initialTab);
  }, [props.initialTab]);

  // localStorage keys for "last seen" counts on Sent / Closed tabs.
  const lsKeySent = firebaseUser ? `msg_lastSeenSent_${firebaseUser.uid}` : '';
  const lsKeyClosed = firebaseUser ? `msg_lastSeenClosed_${firebaseUser.uid}` : '';

  const readLsNumber = (key: string): number => {
    if (!key) return 0;
    try {
      const raw = localStorage.getItem(key);
      return raw ? Number(raw) || 0 : 0;
    } catch {
      return 0;
    }
  };

  const [lastSeenSentCount, setLastSeenSentCount] = useState(() => readLsNumber(lsKeySent));
  const [lastSeenClosedCount, setLastSeenClosedCount] = useState(() => readLsNumber(lsKeyClosed));

  // Re-read localStorage when the user changes (e.g. login/logout).
  useEffect(() => {
    setLastSeenSentCount(readLsNumber(lsKeySent));
    setLastSeenClosedCount(readLsNumber(lsKeyClosed));
  }, [lsKeySent, lsKeyClosed]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [inbox, setInbox] = useState<Message[]>([]);
  const [sentMessages, setSentMessages] = useState<Message[]>([]);
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);
  const [openReservationUpdateId, setOpenReservationUpdateId] = useState<
    string | null
  >(null);
  const [optimisticReadNotificationIds, setOptimisticReadNotificationIds] =
    useState<string[]>([]);
  const [replyDefaults, setReplyDefaults] = useState<{
    recipientId?: string;
    subject?: string;
  }>({});
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('thisMonth');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [customDateRange, setCustomDateRange] =
    useState<CustomDateRange | null>(null);
  const [reservationSearch, setReservationSearch] = useState('');
  const [reservationDatePreset, setReservationDatePreset] = useState<DatePreset>('thisMonth');
  const [reservationCustomDateFrom, setReservationCustomDateFrom] = useState('');
  const [reservationCustomDateTo, setReservationCustomDateTo] = useState('');
  const [reservationCustomDateRange, setReservationCustomDateRange] =
    useState<CustomDateRange | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;

    let cancelled = false;

    const unsubscribeInbox = onInboxMessages(firebaseUser.uid, (messages) => {
      if (!cancelled) {
        setInbox(messages);
      }
    });

    return () => {
      cancelled = true;
      unsubscribeInbox();
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;

    let cancelled = false;

    const unsubscribeSent = onSentMessages(firebaseUser.uid, (messages) => {
      if (!cancelled) {
        setSentMessages(messages);
      }
    });

    return () => {
      cancelled = true;
      unsubscribeSent();
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !showReservationUpdates) return;

    let cancelled = false;

    const unsubscribeReservations = onReservationsByUser(
      firebaseUser.uid,
      (nextReservations) => {
        if (!cancelled) {
          setReservations(nextReservations);
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribeReservations();
    };
  }, [firebaseUser, showReservationUpdates]);

  const reservationMap = useMemo(
    () => new Map(reservations.map((reservation) => [reservation.id, reservation])),
    [reservations]
  );
  const effectiveReadNotificationIds = useMemo(
    () =>
      new Set([
        ...optimisticReadNotificationIds,
        ...notifications
          .filter((notification) => notification.read)
          .map((notification) => notification.id),
      ]),
    [notifications, optimisticReadNotificationIds]
  );
  const resolvedActiveTab =
    !showReservationUpdates && activeTab === 'reservationUpdates'
      ? 'unread'
      : activeTab;

  const unreadMessages = useMemo(
    () => inbox.filter((message) => !message.isRead),
    [inbox]
  );
  const readMessages = useMemo(
    () => inbox.filter((message) => message.isRead),
    [inbox]
  );

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const { from: dateFromMs, to: dateToMs } = useMemo(
    () => getActiveDateRange(datePreset, customDateRange),
    [customDateRange, datePreset]
  );

  const handleApplyCustomDateRange = () => {
    if (!customDateFrom || !customDateTo) return;
    setCustomDateRange({
      fromDate: customDateFrom,
      toDate: customDateTo,
    });
  };

  const handleClearCustomDateRange = () => {
    setCustomDateFrom('');
    setCustomDateTo('');
    setCustomDateRange(null);
  };

  const handleDatePresetChange = (nextPreset: DatePreset) => {
    setDatePreset(nextPreset);
    setCustomDateRange(null);
  };

  const handleApplyReservationCustomDateRange = () => {
    if (!reservationCustomDateFrom || !reservationCustomDateTo) return;
    setReservationCustomDateRange({
      fromDate: reservationCustomDateFrom,
      toDate: reservationCustomDateTo,
    });
  };

  const handleClearReservationCustomDateRange = () => {
    setReservationCustomDateFrom('');
    setReservationCustomDateTo('');
    setReservationCustomDateRange(null);
  };

  const handleReservationDatePresetChange = (nextPreset: DatePreset) => {
    setReservationDatePreset(nextPreset);
    setReservationCustomDateRange(null);
  };

  const filterMessages = (messages: Message[]) => {
    return messages.filter((message) => {
      // Date filter
      if (message.createdAt) {
        const msgTime = message.createdAt.toDate().getTime();
        if (msgTime < dateFromMs || msgTime > dateToMs) return false;
      }

      // Text search filter
      if (normalizedSearch) {
        const searchable = [
          message.senderName,
          message.receiverName,
          message.subject,
          message.body,
          message.senderRole,
          message.receiverRole,
        ].join(' ').toLowerCase();
        if (!searchable.includes(normalizedSearch)) return false;
      }

      return true;
    });
  };

  const filteredUnread = filterMessages(unreadMessages);
  const filteredRead = filterMessages(readMessages);
  const filteredSent = filterMessages(
    sentMessages.filter((m) => !m.closedBySender)
  );

  const closedMessages = filterMessages(
    sentMessages.filter((m) => m.closedBySender)
  );

  const currentUserId = firebaseUser?.uid ?? '';

  const reservationNotifications = useMemo(
    () =>
      showReservationUpdates
        ? notifications.filter(
            (notification) =>
              Boolean(notification.reservationId) &&
              [
                'reservation_approved',
                'reservation_rejected',
                'reservation_cancelled',
                'system',
              ].includes(notification.type)
          )
        : [],
    [notifications, showReservationUpdates]
  );

  const { from: reservationDateFromMs, to: reservationDateToMs } = useMemo(
    () =>
      getActiveDateRange(
        reservationDatePreset,
        reservationCustomDateRange
      ),
    [reservationCustomDateRange, reservationDatePreset]
  );

  const filteredReservationNotifications = useMemo(() => {
    const search = reservationSearch.trim().toLowerCase();

    return reservationNotifications.filter((notification) => {
      // Date filter on notification.createdAt
      if (notification.createdAt) {
        const ts = notification.createdAt.toDate().getTime();
        if (ts < reservationDateFromMs || ts > reservationDateToMs) return false;
      }

      // Text search filter
      if (search) {
        const reservation = reservationMap.get(notification.reservationId);
        const searchable = [
          reservation?.roomName ?? '',
          reservation?.buildingName ?? '',
          reservation?.userName ?? '',
          reservation?.status ?? '',
          notification.title,
          notification.message,
        ].join(' ').toLowerCase();
        if (!searchable.includes(search)) return false;
      }

      return true;
    });
  }, [
    reservationDateFromMs,
    reservationDateToMs,
    reservationMap,
    reservationNotifications,
    reservationSearch,
  ]);

  const unreadReservationCount = useMemo(
    () =>
      reservationNotifications.filter(
        (notification) =>
          !effectiveReadNotificationIds.has(notification.id)
      ).length,
    [effectiveReadNotificationIds, reservationNotifications]
  );

  // Badge counts:
  // - Unread: messages where isRead === false
  // - Read: no badge (already seen)
  // - Sent: new items since user last clicked the Sent tab
  // - Closed: new items since user last clicked the Closed tab
  const allSentCount = sentMessages.filter((m) => !m.closedBySender).length;
  const allClosedCount = sentMessages.filter((m) => m.closedBySender).length;
  const newSentBadge = Math.max(0, allSentCount - lastSeenSentCount);
  const newClosedBadge = Math.max(0, allClosedCount - lastSeenClosedCount);

  const tabs = useMemo(() => {
    const baseTabs: Array<{ badge?: number; key: InboxTab; label: string }> = [
      {
        key: 'unread',
        label: 'Unread',
        badge: unreadMessages.length || undefined,
      },
      {
        key: 'read',
        label: 'Read',
        // No badge — these are already-seen messages.
      },
      {
        key: 'sent',
        label: 'Sent',
        badge: newSentBadge || undefined,
      },
      {
        key: 'closed',
        label: 'Closed',
        badge: newClosedBadge || undefined,
      },
    ];

    if (showReservationUpdates) {
      baseTabs.push({
        key: 'reservationUpdates',
        label: 'Reservation Updates',
        badge: unreadReservationCount || undefined,
      });
    }

    return baseTabs;
  }, [
    newClosedBadge,
    newSentBadge,
    showReservationUpdates,
    unreadMessages.length,
    unreadReservationCount,
  ]);

  // When the user clicks a tab, persist the "last seen" count for Sent/Closed.
  const handleTabClick = useCallback(
    (tab: InboxTab) => {
      setActiveTab(tab);

      if (tab === 'sent' && lsKeySent) {
        const count = allSentCount;
        setLastSeenSentCount(count);
        try {
          localStorage.setItem(lsKeySent, String(count));
        } catch { /* quota exceeded — non-critical */ }
      }

      if (tab === 'closed' && lsKeyClosed) {
        const count = allClosedCount;
        setLastSeenClosedCount(count);
        try {
          localStorage.setItem(lsKeyClosed, String(count));
        } catch { /* quota exceeded — non-critical */ }
      }
    },
    [allClosedCount, allSentCount, lsKeyClosed, lsKeySent]
  );

  const activeTabDescription = useMemo(() => {
    switch (resolvedActiveTab) {
      case 'unread':
        return 'Open new messages to move them into your read conversations.';
      case 'read':
        return 'Reviewed conversations stay here so you can revisit them anytime.';
      case 'sent':
        return 'Review what you have already sent and keep track of outgoing messages.';
      case 'closed':
        return 'Messages you closed from your Sent tab. These are read-only and only visible to you.';
      case 'reservationUpdates':
        return 'Reservation updates stay compact by default. Expand a card when you need the full details.';
      default:
        return '';
    }
  }, [resolvedActiveTab]);

  useEffect(() => {
    registerComposeOpener?.(() => {
      if (!isStaff) return;
      setReplyDefaults({});
      setComposeOpen(true);
    });
  }, [isStaff, registerComposeOpener]);

  const handleOpenMessage = async (
    message: Message,
    options: { markAsRead: boolean }
  ) => {
    const willOpen = openMessageId !== message.id;
    setOpenReservationUpdateId(null);

    if (!willOpen) {
      setOpenMessageId(null);
      return;
    }

    setOpenMessageId(message.id);

    if (!options.markAsRead || message.isRead) {
      return;
    }

    setInbox((currentInbox) =>
      currentInbox.map((currentMessage) =>
        currentMessage.id === message.id
          ? {
            ...currentMessage,
            isRead: true
          }
          : currentMessage
      )
    );
    setActiveTab('read');

    try {
      await markMessageAsRead(message.id);
    } catch (error) {
      console.warn('Failed to mark message as read:', error);
    }
  };

  const handleReply = (message: Message) => {
    setReplyDefaults({
      recipientId: message.senderId,
      subject: message.subject.startsWith('Re:')
        ? message.subject
        : `Re: ${message.subject}`,
    });
    setComposeOpen(true);
  };

  const handleToggleReservationUpdate = async (notification: AppNotification) => {
    const willOpen = openReservationUpdateId !== notification.id;
    const isRead =
      effectiveReadNotificationIds.has(notification.id);

    setOpenMessageId(null);
    setOpenReservationUpdateId(willOpen ? notification.id : null);

    if (!willOpen || isRead) {
      return;
    }

    setOptimisticReadNotificationIds((currentIds) =>
      currentIds.includes(notification.id)
        ? currentIds
        : [...currentIds, notification.id]
    );

    try {
      await markNotificationRead(notification.id);
    } catch (error) {
      console.warn('Failed to mark notification as read:', error);
      setOptimisticReadNotificationIds((currentIds) =>
        currentIds.filter((notificationId) => notificationId !== notification.id)
      );
    }
  };

  const renderMessageList = (
    messages: Message[],
    tab: 'unread' | 'read' | 'sent' | 'closed'
  ) => {
    if (messages.length === 0) {
      return (
        <EmptyState
          title={
            tab === 'unread'
              ? 'No unread messages.'
              : tab === 'read'
                ? 'No read messages yet.'
                : tab === 'closed'
                  ? 'No closed messages.'
                  : 'No sent messages yet.'
          }
          description={
            tab === 'unread'
              ? isStaff
                ? "You're all caught up."
                : 'No new direct messages have arrived.'
              : tab === 'read'
                ? 'Messages you open will stay here for quick reference.'
                : tab === 'closed'
                  ? 'Messages you close from your Sent tab will appear here.'
                  : 'Messages you send will appear here so you can track outgoing conversations.'
          }
        />
      );
    }

    return (
      <div className="space-y-4">
        {messages.map((message) => {
          const isOpen = openMessageId === message.id;
          const isUnread = !message.isRead;
          const isMe = message.senderId === currentUserId;
          const counterpartName = isMe ? message.receiverName : message.senderName;
          const counterpartRole = isMe ? message.receiverRole : message.senderRole;
          const previewLabel = isMe ? `To ${counterpartName}` : counterpartName;
          const bubbleTone = isMe
            ? 'border-primary/20 bg-primary text-white'
            : isUnread
              ? 'border-primary/15 bg-white'
              : 'border-dark/10 bg-dark/5';

          return (
            <div
              key={message.id}
              className={`overflow-hidden rounded-3xl border transition-shadow ${
                isUnread
                  ? 'border-primary/15 bg-primary/5 shadow-sm'
                  : 'border-dark/5 bg-white/75'
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  handleOpenMessage(message, { markAsRead: tab !== 'sent' })
                }
                className="w-full px-5 py-4 text-left transition-colors hover:bg-white/35"
              >
                <div
                  className={`flex items-start gap-3 ${
                    isMe ? 'flex-row-reverse' : ''
                  }`}
                >
                  <div
                    className={`mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                      isMe
                        ? 'border-primary/20 bg-primary text-white'
                        : isUnread
                        ? 'border-primary/15 bg-white text-primary'
                        : 'border-dark/10 bg-dark/5 text-black'
                    }`}
                  >
                    {getInitials(counterpartName)}
                  </div>

                  <div className={`min-w-0 flex-1 ${isMe ? 'text-right' : ''}`}>
                    <div
                      className={`flex flex-wrap items-start gap-3 ${
                        isMe ? 'justify-end' : 'justify-between'
                      }`}
                    >
                      <div className="min-w-0">
                        <div
                          className={`flex flex-wrap items-center gap-2 ${
                            isMe ? 'justify-end' : ''
                          }`}
                        >
                          <h3 className="text-sm font-bold text-black">
                            {previewLabel}
                          </h3>
                          <span className="rounded-full bg-dark/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-black/55">
                            {counterpartRole || 'Staff'}
                          </span>
                          {isUnread && tab === 'unread' && !isMe && (
                            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-black/50">
                          {message.createdAt
                            ? formatTimestamp(message.createdAt)
                            : 'Timestamp unavailable'}
                        </p>
                      </div>

                      <svg
                        className={`mt-1 h-5 w-5 shrink-0 text-black/60 transition-transform ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>

                    <div
                      className={`mt-3 max-w-[min(34rem,100%)] rounded-[24px] border px-4 py-3 ${
                        isMe ? 'ml-auto' : ''
                      } ${bubbleTone}`}
                    >
                      {message.subject && (
                        <p
                          className={`mb-1 text-[11px] font-bold uppercase tracking-wide ${
                            isMe ? 'text-white/75' : 'text-black/45'
                          }`}
                        >
                          {message.subject}
                        </p>
                      )}
                      <p
                        className={`text-sm leading-relaxed ${
                          isOpen
                            ? `whitespace-pre-wrap ${isMe ? 'text-white' : 'text-black'}`
                            : isMe
                              ? 'text-white/90'
                              : 'text-black/75'
                        }`}
                      >
                        {isOpen ? message.body : getMessagePreview(message)}
                      </p>
                    </div>
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-dark/5 px-5 pb-4 pt-4">
                  <div
                    className={`flex flex-wrap items-center gap-3 ${
                      isMe ? 'justify-end' : 'justify-between'
                    }`}
                  >
                    <p className="text-[11px] text-black/45">
                      {isMe
                        ? `Sent to ${message.receiverName}`
                        : `From ${message.senderName} to you`}
                    </p>

                    <div className="flex items-center gap-2">
                      {/* Reply — available to ALL users, not just staff */}
                      {!isMe && (
                        <button
                          type="button"
                          onClick={() => handleReply(message)}
                          className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-bold text-primary transition-all hover:bg-primary/20"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                            />
                          </svg>
                          Reply
                        </button>
                      )}

                      {tab === 'sent' && isMe ? (
                        <button
                          type="button"
                          onClick={async () => {
                            setOpenMessageId(null);
                            try {
                              await closeSentMessage(message.id);
                            } catch (error) {
                              console.warn('Failed to close message:', error);
                            }
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-dark/10 bg-dark/5 px-4 py-2 text-sm font-bold text-black/60 transition-all hover:bg-red-50 hover:border-red-200 hover:text-red-500"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Close
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpenMessageId(null)}
                          className="inline-flex items-center gap-2 rounded-xl border border-dark/10 bg-dark/5 px-4 py-2 text-sm font-bold text-black/60 transition-all hover:bg-dark/10 hover:text-black"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Collapse
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderReservationUpdates = () => {
    if (filteredReservationNotifications.length === 0) {
      return (
        <EmptyState
          title={reservationSearch || reservationDatePreset !== 'thisMonth'
            ? 'No matching reservation updates.'
            : 'No reservation updates yet.'}
          description={reservationSearch || reservationDatePreset !== 'thisMonth'
            ? 'Try adjusting your search or date filter.'
            : 'Approvals, rejections, and other reservation changes will appear here.'}
        />
      );
    }

    return (
      <div className="space-y-4">
        {filteredReservationNotifications.map((notification) => {
          const reservation = reservationMap.get(notification.reservationId);
          const isOpen = openReservationUpdateId === notification.id;
          const isRead =
            effectiveReadNotificationIds.has(notification.id);
          const status = getReservationUpdateStatus(notification, reservation);
          const note = getReservationUpdateNote(notification, reservation);
          const roomName = reservation?.roomName || 'Reservation update';
          const dateLabel = reservation ? formatDate(reservation.date) : 'Unavailable';
          const timeLabel = reservation
            ? formatTimeRange(reservation.startTime, reservation.endTime)
            : 'Unavailable';
          const purpose = reservation?.purpose?.trim() || 'Unavailable';

          return (
            <div
              key={notification.id}
              className={`overflow-hidden rounded-3xl border transition-shadow ${
                isRead
                  ? 'border-dark/5 bg-white/75'
                  : 'border-primary/15 bg-primary/5 shadow-sm'
              }`}
            >
              <button
                type="button"
                onClick={() => handleToggleReservationUpdate(notification)}
                className="w-full px-5 py-4 text-left transition-colors hover:bg-white/35"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-black">{roomName}</h3>
                      <StatusBadge status={status} />
                      {!isRead && (
                        <span className="inline-flex items-center rounded-full border border-primary/20 bg-white px-2 py-0.5 text-[10px] font-bold text-primary">
                          New
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-black/60">
                      <span>{dateLabel}</span>
                      <span>{timeLabel}</span>
                      <span>
                        {notification.createdAt
                          ? formatTimestamp(notification.createdAt)
                          : 'Updated recently'}
                      </span>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-black/80">
                      {shortenText(note, 150)}
                    </p>
                  </div>

                  <svg
                    className={`mt-1 h-5 w-5 shrink-0 text-black/60 transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-dark/5 px-5 pb-5 pt-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DetailField label="Room">{roomName}</DetailField>
                    <DetailField label="Date">{dateLabel}</DetailField>
                    <DetailField label="Time">{timeLabel}</DetailField>
                    <DetailField label="Purpose">{purpose}</DetailField>
                    <DetailField label="Status">
                      <StatusBadge status={status} />
                    </DetailField>
                    <DetailField
                      className="sm:col-span-2"
                      label="Admin note"
                    >
                      {note}
                    </DetailField>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section className="mb-8">
      {(props.title || props.subtitle) && (
        <div className="mb-5 rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl">
          {props.title && (
            <h2 className="text-xl font-bold text-black">{props.title}</h2>
          )}
          {props.subtitle && (
            <p className="mt-1 text-sm text-black/65">{props.subtitle}</p>
          )}
        </div>
      )}

      <div className="rounded-[32px] border border-white/50 bg-white/85 p-4 shadow-sm backdrop-blur sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  handleTabClick(tab.key);
                  setOpenMessageId(null);
                  setOpenReservationUpdateId(null);
                  setSearchQuery('');
                  setDatePreset('thisMonth');
                  setCustomDateFrom('');
                  setCustomDateTo('');
                  setCustomDateRange(null);
                  setReservationSearch('');
                  setReservationDatePreset('thisMonth');
                  setReservationCustomDateFrom('');
                  setReservationCustomDateTo('');
                  setReservationCustomDateRange(null);
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                  activeTab === tab.key
                    ? 'border border-primary bg-primary text-white'
                    : 'border border-dark/10 bg-white text-gray-700 hover:text-primary'
                }`}
              >
                {tab.label}
                {tab.badge !== undefined && (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      activeTab === tab.key
                        ? 'bg-white/20 text-white'
                        : 'border border-primary/20 bg-primary/10 text-primary'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {isStaff && showComposeButton && (
            <button
              type="button"
              onClick={() => {
                setReplyDefaults({});
                setComposeOpen(true);
              }}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Compose
            </button>
          )}
        </div>

        <p className="mt-4 text-sm text-black/65">{activeTabDescription}</p>

        {/* Search & date filters — show for message tabs */}
        {resolvedActiveTab !== 'reservationUpdates' && (
          <>
            {/* Search bar */}
            <div className="relative mt-4">
              <svg
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by name, subject, or message..."
                className="w-full rounded-2xl border border-white/45 bg-white/85 py-3 pl-11 pr-10 text-sm text-black shadow-sm backdrop-blur-xl placeholder:text-black/35 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-black/40 transition-colors hover:text-primary"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <DateFilterControls
              customFrom={customDateFrom}
              customRange={customDateRange}
              customTo={customDateTo}
              onApplyCustomRange={handleApplyCustomDateRange}
              onClearCustomRange={handleClearCustomDateRange}
              onCustomFromChange={setCustomDateFrom}
              onCustomToChange={setCustomDateTo}
              onPresetChange={handleDatePresetChange}
              preset={datePreset}
            />
          </>
        )}

        {/* Search & date filters — show for reservation updates tab */}
        {resolvedActiveTab === 'reservationUpdates' && showReservationUpdates && (
          <>
            {/* Search bar */}
            <div className="relative mt-4">
              <svg
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                />
              </svg>
              <input
                type="text"
                value={reservationSearch}
                onChange={(event) => setReservationSearch(event.target.value)}
                placeholder="Search by room, building, requester, or status..."
                className="w-full rounded-2xl border border-white/45 bg-white/85 py-3 pl-11 pr-10 text-sm text-black shadow-sm backdrop-blur-xl placeholder:text-black/35 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10"
              />
              {reservationSearch && (
                <button
                  type="button"
                  onClick={() => setReservationSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-black/40 transition-colors hover:text-primary"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <DateFilterControls
              customFrom={reservationCustomDateFrom}
              customRange={reservationCustomDateRange}
              customTo={reservationCustomDateTo}
              onApplyCustomRange={handleApplyReservationCustomDateRange}
              onClearCustomRange={handleClearReservationCustomDateRange}
              onCustomFromChange={setReservationCustomDateFrom}
              onCustomToChange={setReservationCustomDateTo}
              onPresetChange={handleReservationDatePresetChange}
              preset={reservationDatePreset}
            />
          </>
        )}

        <div className="mt-5">
          {resolvedActiveTab === 'unread' && renderMessageList(filteredUnread, 'unread')}
          {resolvedActiveTab === 'read' && renderMessageList(filteredRead, 'read')}
          {resolvedActiveTab === 'sent' && renderMessageList(filteredSent, 'sent')}
          {resolvedActiveTab === 'closed' && renderMessageList(closedMessages, 'closed')}
          {resolvedActiveTab === 'reservationUpdates' &&
            showReservationUpdates &&
            renderReservationUpdates()}
        </div>
      </div>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        initialRecipientId={replyDefaults.recipientId}
        initialSubject={replyDefaults.subject}
      />
    </section>
  );
}
