'use client';

import React, { useEffect, useMemo, useState } from 'react';

import MessagesSection from '@/components/messages/MessagesSection';
import { useAuth } from '@/context/AuthContext';
import {
  AdminRequest,
  onAdminRequestsByUser,
} from '@/lib/adminRequests';
import { USER_ROLES } from '@/lib/domain/roles';
import { isStaffRole } from '@/lib/messages';
import {
  Notification,
  onAllNotifications,
  markNotificationRead,
} from '@/lib/notifications';
import {
  approveReservation,
  onPendingReservationsByApprover,
  rejectReservation,
  Reservation,
} from '@/lib/reservations';
import { useAdminTab } from '@/context/AdminTabContext';

function StatusBadge({ status }: { status: string }) {
  const style = (() => {
    switch (status) {
      case 'open':
        return 'ui-badge-blue';
      case 'responded':
        return 'ui-badge-green';
      case 'closed':
        return 'ui-badge-gray';
      case 'pending':
        return 'ui-badge-yellow';
      case 'approved':
        return 'ui-badge-green';
      case 'rejected':
        return 'ui-badge-red';
      default:
        return 'ui-badge-gray';
    }
  })();

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${style} capitalize`}>
      {status}
    </span>
  );
}

function formatDate(ts: { toDate?: () => Date } | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  const d = ts.toDate();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) + ' at ' + d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatEquipment(equipment?: Record<string, number>) {
  if (!equipment) return 'No equipment requested';

  const items = Object.entries(equipment).filter(([, quantity]) => quantity > 0);
  if (items.length === 0) return 'No equipment requested';

  return items.map(([key, quantity]) => `${key} (x${quantity})`).join(', ');
}

function ReservationApprovals({
  email,
}: {
  email: string;
}) {
  const { firebaseUser, profile } = useAuth();
  const [requests, setRequests] = useState<Reservation[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState('');

  const removeRequestFromInbox = (reservationId: string) => {
    setRequests((currentRequests) =>
      currentRequests.filter((request) => request.id !== reservationId)
    );
    setExpandedId((currentExpandedId) =>
      currentExpandedId === reservationId ? null : currentExpandedId
    );
    setRejectingId((currentRejectingId) =>
      currentRejectingId === reservationId ? null : currentRejectingId
    );
    setRejectReason('');
  };

  const handleReviewError = (reservationId: string, error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to review reservation.';

    if (
      message.includes('Only pending reservations can be reviewed.') ||
      message.includes('You are not the current approver for this reservation.')
    ) {
      removeRequestFromInbox(reservationId);
      setActionError(
        'This reservation has already been reviewed or reassigned, so it was removed from your approval list.'
      );
      return;
    }

    setActionError(message);
  };

  useEffect(() => {
    if (!email) return;
    let cancelled = false;

    const unsubscribe = onPendingReservationsByApprover(email, (nextRequests) => {
      if (cancelled) return;
      setRequests(nextRequests);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [email]);

  const handleApprove = async (reservationId: string) => {
    const approverEmail = profile?.email || firebaseUser?.email;
    if (!approverEmail) return;

    setActionError('');
    setActionLoading(reservationId);
    try {
      await approveReservation(reservationId, approverEmail);
      removeRequestFromInbox(reservationId);
    } catch (error) {
      handleReviewError(reservationId, error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (reservationId: string) => {
    const approverEmail = profile?.email || firebaseUser?.email;
    if (!approverEmail) return;
    if (!rejectReason.trim()) {
      setActionError('Please enter a reason before rejecting this reservation.');
      return;
    }

    setActionError('');
    setActionLoading(reservationId);
    try {
      await rejectReservation(reservationId, approverEmail, rejectReason.trim());
      removeRequestFromInbox(reservationId);
    } catch (error) {
      handleReviewError(reservationId, error);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-black">Reservation Approvals</h3>
          <p className="text-sm text-black mt-1">
            Review Main Campus reservation requests sent to you for faculty approval.
          </p>
        </div>
        {requests.length > 0 && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ui-badge-yellow">
            {requests.length} pending
          </span>
        )}
      </div>

      {actionError && (
        <p className="text-xs ui-text-red font-bold mb-3">{actionError}</p>
      )}

      {requests.length === 0 ? (
        <div className="glass-card p-8 !rounded-xl text-center">
          <p className="text-sm font-bold text-black">No reservation approvals waiting for you.</p>
          <p className="text-xs text-black mt-1">New student requests will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const isExpanded = expandedId === request.id;
            const isRejecting = rejectingId === request.id;

            return (
              <div key={request.id} className="glass-card !rounded-xl overflow-hidden border-l-4 border-yellow-500/40">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : request.id)}
                  className="w-full p-5 text-left hover:bg-primary/10 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-bold text-black">{request.userName}</h4>
                        <StatusBadge status="pending" />
                      </div>
                      <p className="text-xs text-black">
                        {request.roomName} in {request.buildingName}
                      </p>
                      <p className="text-xs text-black mt-1">
                        {request.date} • {request.startTime} - {request.endTime}
                      </p>
                    </div>
                    <svg className={`w-5 h-5 text-black transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-dark/5 px-5 pb-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                      <div className="bg-dark/3 rounded-xl p-3 border border-dark/5">
                        <p className="text-[10px] text-black font-bold uppercase tracking-wider mb-1">Program / Department / Organization</p>
                        <p className="text-sm text-black">{request.programDepartmentOrganization || 'Not provided'}</p>
                      </div>
                      <div className="bg-dark/3 rounded-xl p-3 border border-dark/5">
                        <p className="text-[10px] text-black font-bold uppercase tracking-wider mb-1">Purpose</p>
                        <p className="text-sm text-black">{request.purpose}</p>
                      </div>
                      <div className="bg-dark/3 rounded-xl p-3 border border-dark/5 sm:col-span-2">
                        <p className="text-[10px] text-black font-bold uppercase tracking-wider mb-1">Equipment</p>
                        <p className="text-sm text-black">{formatEquipment(request.equipment)}</p>
                      </div>
                      {request.approvalDocumentUrl && (
                        <div className="bg-dark/3 rounded-xl p-3 border border-dark/5 sm:col-span-2">
                          <p className="text-[10px] text-black font-bold uppercase tracking-wider mb-1">Concept Paper / Letter of Approval</p>
                          <a
                            href={request.approvalDocumentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-bold text-primary hover:text-primary-hover transition-colors"
                          >
                            {request.approvalDocumentName || 'Open attachment'}
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-4 mt-4 border-t border-dark/5">
                      <button
                        onClick={() => handleApprove(request.id)}
                        disabled={actionLoading === request.id}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold ui-button-green disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          setActionError('');
                          setRejectingId(isRejecting ? null : request.id);
                          setRejectReason('');
                        }}
                        disabled={actionLoading === request.id}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold ui-button-red disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>

                    {isRejecting && (
                      <div className="mt-4 space-y-3">
                        <label className="block text-xs font-bold text-black">
                          Reason for rejection
                        </label>
                        <textarea
                          value={rejectReason}
                          onChange={(event) => setRejectReason(event.target.value)}
                          className="glass-input w-full px-4 py-3 min-h-[110px] resize-none"
                          placeholder="Explain why this reservation request is being rejected."
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleReject(request.id)}
                            disabled={actionLoading === request.id || !rejectReason.trim()}
                            className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-sm font-bold ui-button-red disabled:opacity-50"
                          >
                            Confirm Rejection
                          </button>
                          <button
                            onClick={() => {
                              setRejectingId(null);
                              setRejectReason('');
                            }}
                            className="px-4 py-2 text-sm font-bold text-black hover:text-primary transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ReservationUpdates({
  notifications,
}: {
  notifications: Notification[];
}) {
  const reservationNotifications = useMemo(
    () =>
      notifications.filter((notification) =>
        notification.reservationId &&
        [
          'new_reservation',
          'reservation_approved',
          'reservation_rejected',
          'reservation_cancelled',
          'system',
        ].includes(notification.type)
      ),
    [notifications]
  );

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-black">Reservation Updates</h3>
          <p className="text-sm text-black mt-1">
            Approval results and reservation-related notices appear here.
          </p>
        </div>
      </div>

      {reservationNotifications.length === 0 ? (
        <div className="glass-card p-8 !rounded-xl text-center">
          <p className="text-sm font-bold text-black">No reservation updates yet.</p>
          <p className="text-xs text-black mt-1">Future approvals, rejections, and related notices will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reservationNotifications.map((notification) => (
            <div key={notification.id} className="glass-card p-5 !rounded-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-bold text-black">{notification.title}</h4>
                    <StatusBadge
                      status={
                        notification.type === 'reservation_rejected'
                          ? 'rejected'
                          : notification.type === 'reservation_approved'
                            ? 'approved'
                            : 'pending'
                      }
                    />
                  </div>
                  <p className="text-sm text-black leading-relaxed">{notification.message}</p>
                  {notification.createdAt && (
                    <p className="text-xs text-black mt-2">{formatDate(notification.createdAt)}</p>
                  )}
                </div>
                {!notification.read && (
                  <button
                    onClick={() => markNotificationRead(notification.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all"
                  >
                    Mark as read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = { equipment: '🔧', general: '💬', other: '📋' };
  return <span className="mr-1">{icons[type] || '📋'}</span>;
}

function AdminMessages({ uid }: { uid: string }) {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [filter, setFilter] = useState<'all' | 'open' | 'responded' | 'closed'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    const unsub = onAdminRequestsByUser(uid, (nextRequests) => {
      if (cancelled) return;
      setRequests(nextRequests);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [uid]);

  const filteredRequests = filter === 'all' ? requests : requests.filter((request) => request.status === filter);

  return (
    <section>
      <div className="mb-4">
        <h3 className="text-lg font-bold text-black">Messages with Administration</h3>
        <p className="text-sm text-black mt-1">Your support and follow-up conversations stay here.</p>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {(['all', 'open', 'responded', 'closed'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-2 rounded-xl text-sm font-bold capitalize transition-all whitespace-nowrap ${
              filter === value
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-dark/5 text-black border border-dark/10 hover:text-primary'
            }`}
          >
            {value === 'all'
              ? `All (${requests.length})`
              : `${value} (${requests.filter((request) => request.status === value).length})`}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filteredRequests.length === 0 ? (
          <div className="glass-card p-10 !rounded-xl text-center">
            <p className="text-sm font-bold text-black">No admin messages.</p>
            <p className="text-xs text-black mt-1">
              {filter === 'all' ? 'Your inbox is empty.' : `No ${filter} messages right now.`}
            </p>
          </div>
        ) : (
          filteredRequests.map((request) => {
            const isExpanded = expandedId === request.id;
            return (
              <div key={request.id} className="glass-card !rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : request.id)}
                  className="w-full p-5 text-left hover:bg-primary/10 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        request.status === 'responded' ? 'bg-green-500/20' : request.status === 'open' ? 'bg-blue-500/20' : 'bg-dark/5'
                      }`}>
                        <svg className="w-5 h-5 ui-text-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="text-sm font-bold text-black">{request.subject}</h4>
                          <StatusBadge status={request.status} />
                        </div>
                        <p className="text-xs text-black">
                          <TypeIcon type={request.type} />
                          {request.type} • {request.buildingName}
                          {request.createdAt && <span className="ml-2">• {formatDate(request.createdAt)}</span>}
                        </p>
                      </div>
                    </div>
                    <svg className={`w-5 h-5 text-black transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-dark/5 px-5 pb-5">
                    <div className="mt-4 flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xs font-bold shrink-0 mt-0.5">
                        You
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-primary mb-1">Your Message</p>
                        <div className="bg-primary/5 border border-primary/15 rounded-xl p-3">
                          <p className="text-sm text-black leading-relaxed">{request.message}</p>
                        </div>
                      </div>
                    </div>

                    {request.adminResponse ? (
                      <div className="mt-4 flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0 mt-0.5">
                          <svg className="w-4 h-4 ui-text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-bold ui-text-green mb-1">Admin Response</p>
                          <div className="bg-green-500/5 border border-green-500/15 rounded-xl p-3">
                            <p className="text-sm text-black leading-relaxed">{request.adminResponse}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 p-3 rounded-xl bg-dark/3 border border-dark/5 text-center">
                        <p className="text-xs text-black">Awaiting admin response...</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function UserInbox({
  uid,
  email,
  isFaculty,
  showStaffMessages,
}: {
  uid: string;
  email: string;
  isFaculty: boolean;
  showStaffMessages: boolean;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    const unsubscribe = onAllNotifications(uid, (nextNotifications) => {
      if (cancelled) return;
      setNotifications(nextNotifications);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uid]);

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 pb-24 md:pb-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-black">Inbox</h2>
        <p className="text-black mt-1">
          Reservation approvals, updates, and admin messages are all available here.
        </p>
      </div>

      {isFaculty && <ReservationApprovals email={email} />}
      {showStaffMessages && (
        <MessagesSection
          title="Staff Messages"
          subtitle="Direct conversations with administrators, faculty, and utility staff."
        />
      )}
      <ReservationUpdates notifications={notifications} />
      <AdminMessages uid={uid} />
    </main>
  );
}

function AdminInboxRedirect() {
  const { setActiveTab } = useAdminTab();

  useEffect(() => {
    setActiveTab('inbox');
  }, [setActiveTab]);

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
      <div className="glass-card p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-black mb-2">Inbox</h3>
        <p className="text-sm text-black">
          Your inbox is available in the <span className="text-primary font-bold">Inbox</span> tab on your dashboard.
        </p>
      </div>
    </main>
  );
}

export default function InboxPage() {
  const { firebaseUser, profile } = useAuth();
  const isAdmin = profile?.role === USER_ROLES.ADMIN;

  if (!firebaseUser || !profile?.email) return null;

  if (isAdmin) {
    return <AdminInboxRedirect />;
  }

  return (
    <UserInbox
      uid={firebaseUser.uid}
      email={profile.email}
      isFaculty={profile.role === USER_ROLES.FACULTY}
      showStaffMessages={isStaffRole(profile.role)}
    />
  );
}
