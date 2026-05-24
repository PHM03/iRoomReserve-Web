'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import ComposeModal from '@/components/messages/ComposeModal';
import MessagesSection from '@/components/messages/MessagesSection';
import { useAdminTab } from '@/context/AdminTabContext';
import { useAuth } from '@/context/AuthContext';
import { formatDate, formatTimeRange } from '@/lib/utils/dateTime';
import { USER_ROLES } from '@/lib/auth/roles';
import { isStaffRole } from '@/lib/messages/messages';
import {
  Notification as AppNotification,
  onAllNotifications,
} from '@/lib/notifications/notifications';
import {
  approveReservation,
  fetchPendingReservationsForApprover,
  rejectReservation,
  type Reservation,
} from '@/lib/reservations/reservations';

interface StatusBadgeProps {
  status: string;
}

interface ReservationApprovalsProps {
  email: string;
  targetReservationId: string | null;
}

interface UserInboxProps {
  canCompose: boolean;
  email: string;
  isFaculty: boolean;
  uid: string;
}

function StatusBadge({ status }: Readonly<StatusBadgeProps>) {
  const style = (() => {
    switch (status) {
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
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${style}`}
    >
      {status}
    </span>
  );
}

function formatEquipment(equipment?: Record<string, number>) {
  if (!equipment) return 'No equipment requested';

  const items = Object.entries(equipment).filter(([, quantity]) => quantity > 0);
  if (items.length === 0) return 'No equipment requested';

  return items.map(([key, quantity]) => `${key} (x${quantity})`).join(', ');
}

function ReservationApprovals({
  email,
  targetReservationId,
}: Readonly<ReservationApprovalsProps>) {
  const { firebaseUser, profile } = useAuth();
  const [requests, setRequests] = useState<Reservation[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [loadingRequests, setLoadingRequests] = useState(false);

  useEffect(() => {
    if (!email) return;

    let cancelled = false;

    const loadRequests = async () => {
      setLoadingRequests(true);

      try {
        const nextRequests = await fetchPendingReservationsForApprover();
        if (!cancelled) {
          setRequests(nextRequests);
        }
      } catch (error) {
        if (!cancelled) {
          setRequests([]);
          setActionError(
            error instanceof Error
              ? error.message
              : 'Failed to load reservation approvals.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingRequests(false);
        }
      }
    };

    void loadRequests();
    const intervalId = window.setInterval(() => void loadRequests(), 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [email]);

  useEffect(() => {
    if (!targetReservationId) return;

    if (requests.some((request) => request.id === targetReservationId)) {
      setExpandedId(targetReservationId);
    }
  }, [requests, targetReservationId]);

  const removeRequest = (reservationId: string) => {
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
      error instanceof Error ? error.message : 'Failed to review reservation.';

    if (
      message.includes('Only pending reservations can be reviewed.') ||
      message.includes('You are not the current approver for this reservation.')
    ) {
      removeRequest(reservationId);
      setActionError(
        'This reservation was already reviewed or reassigned, so it was removed from your queue.'
      );
      return;
    }

    setActionError(message);
  };

  const handleApprove = async (reservationId: string) => {
    const approverEmail = profile?.email || firebaseUser?.email;
    if (!approverEmail) return;

    setActionError('');
    setActionLoading(reservationId);

    try {
      await approveReservation(reservationId, approverEmail);
      removeRequest(reservationId);
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
      removeRequest(reservationId);
    } catch (error) {
      handleReviewError(reservationId, error);
    } finally {
      setActionLoading(null);
    }
  };

  if (!loadingRequests && !actionError && requests.length === 0) {
    return null;
  }

  return (
    <section className="mb-8">
      <div className="rounded-[28px] border border-amber-200/70 bg-white/85 p-4 shadow-sm backdrop-blur sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-black/50">
              Faculty Queue
            </p>
            <h2 className="mt-2 text-lg font-bold text-black">
              Pending reservation approvals
            </h2>
            <p className="mt-1 text-sm text-black/65">
              Review requests assigned to you without leaving the inbox.
            </p>
          </div>

          <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
            {loadingRequests
              ? 'Refreshing...'
              : `${requests.length} awaiting review`}
          </div>
        </div>

        {actionError && (
          <p className="mt-4 text-xs font-bold ui-text-red">{actionError}</p>
        )}

        {loadingRequests ? (
          <div className="mt-4 rounded-3xl border border-dark/5 bg-white/70 p-8 text-center">
            <p className="text-sm font-bold text-black">
              Loading reservation approvals...
            </p>
          </div>
        ) : requests.length > 0 ? (
          <div className="mt-4 space-y-3">
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
                          {formatDate(request.date)} | {formatTimeRange(request.startTime, request.endTime)}
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

                      <div className="mt-4 flex flex-col gap-3 border-t border-dark/5 pt-4 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => handleApprove(request.id)}
                          disabled={actionLoading === request.id}
                          className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold ui-button-green disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionError('');
                            setRejectingId(isRejecting ? null : request.id);
                            setRejectReason('');
                          }}
                          disabled={actionLoading === request.id}
                          className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold ui-button-red disabled:opacity-50"
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
                            className="glass-input min-h-[110px] w-full resize-none px-4 py-3"
                            placeholder="Explain why this reservation request is being rejected."
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleReject(request.id)}
                              disabled={
                                actionLoading === request.id || !rejectReason.trim()
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2 text-sm font-bold ui-button-red disabled:opacity-50"
                            >
                              Confirm Rejection
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingId(null);
                                setRejectReason('');
                              }}
                              className="px-4 py-2 text-sm font-bold text-black transition-all hover:text-primary"
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
        ) : null}
      </div>
    </section>
  );
}

function UserInbox({
  canCompose,
  email,
  isFaculty,
  uid,
}: Readonly<UserInboxProps>) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const searchParams = useSearchParams();
  const targetReservationId = searchParams.get('reservationId');
  const requestedTab = searchParams.get('tab');
  const initialTab =
    requestedTab === 'reservationUpdates' ||
    requestedTab === 'unread' ||
    requestedTab === 'read' ||
    requestedTab === 'sent' ||
    requestedTab === 'closed'
      ? requestedTab
      : undefined;

  useEffect(() => {
    if (!uid) return;

    let cancelled = false;

    const unsubscribe = onAllNotifications(uid, (nextNotifications) => {
      if (!cancelled) {
        setNotifications(nextNotifications);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uid]);

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10 pb-24 md:pb-8">
      <div className="mb-8">
        <div className="bg-white rounded-xl px-6 py-4 border border-white/30 inline-block">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                Inbox - Reservation approvals, updates, and messages
              </h2>
              <p className="text-gray-600 mt-1">
                Open unread conversations, review reservation activity, and expand only the details you need.
              </p>
            </div>

            {canCompose && (
              <button
                type="button"
                onClick={() => setComposeOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#a12124] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#8e1d20]"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Compose
              </button>
            )}
          </div>
        </div>
      </div>

      {isFaculty && (
        <ReservationApprovals
          email={email}
          targetReservationId={targetReservationId}
        />
      )}

      <MessagesSection
        initialTab={initialTab}
        notifications={notifications}
        showComposeButton={false}
      />

      {canCompose && (
        <ComposeModal
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
        />
      )}
    </main>
  );
}

function AdminInboxRedirect() {
  const { setActiveTab } = useAdminTab();

  useEffect(() => {
    setActiveTab('inbox');
  }, [setActiveTab]);

  return (
    <main className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="glass-card p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
          <svg
            className="h-8 w-8 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h2 className="mb-2 text-lg font-bold text-black">Inbox</h2>
        <p className="text-sm text-black">
          Your inbox is available in the <span className="font-bold text-primary">Inbox</span>{' '}
          tab on your dashboard.
        </p>
      </div>
    </main>
  );
}

export default function InboxPage() {
  const { firebaseUser, profile } = useAuth();
  const isAdmin = profile?.role === USER_ROLES.ADMIN;
  const canCompose = true;

  if (!firebaseUser || !profile?.email) return null;
  if (isAdmin) return <AdminInboxRedirect />;

  return (
    <UserInbox
      canCompose={canCompose}
      uid={firebaseUser.uid}
      email={profile.email}
      isFaculty={profile.role === USER_ROLES.FACULTY}
    />
  );
}
