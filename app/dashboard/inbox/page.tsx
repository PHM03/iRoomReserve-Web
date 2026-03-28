'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  AdminRequest,
  onAdminRequestsByUser,
} from '@/lib/adminRequests';
import { useAdminTab } from '@/context/AdminTabContext';

// ─── Status Badge ─────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const style = (() => {
    switch (status) {
      case 'open': return 'ui-badge-blue';
      case 'responded': return 'ui-badge-green';
      case 'closed': return 'ui-badge-gray';
      default: return 'ui-badge-gray';
    }
  })();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${style} capitalize`}>
      {status}
    </span>
  );
}

function TypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = { equipment: '🔧', general: '💬', other: '📋' };
  return <span className="mr-1">{icons[type] || '📋'}</span>;
}

function formatDate(ts: { toDate?: () => Date } | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  const d = ts.toDate();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Student/Faculty Inbox ────────────────────────────────────────
function UserInbox({ uid }: { uid: string }) {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [filter, setFilter] = useState<'all' | 'open' | 'responded' | 'closed'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = onAdminRequestsByUser(uid, setRequests);
    return () => unsub();
  }, [uid]);

  const filteredRequests = filter === 'all' ? requests : requests.filter((r) => r.status === filter);
  const respondedCount = requests.filter((r) => r.status === 'responded').length;

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 pb-24 md:pb-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-black flex items-center gap-3">
          <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Inbox
          {respondedCount > 0 && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ui-badge-green">
              {respondedCount} replied
            </span>
          )}
        </h2>
        <p className="text-black mt-1">Your messages with the administration</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {(['all', 'open', 'responded', 'closed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-bold capitalize transition-all whitespace-nowrap ${
              filter === f
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-dark/5 text-black border border-dark/10 hover:text-primary'
            }`}
          >
            {f === 'all' ? `All (${requests.length})` : `${f} (${requests.filter(r => r.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="space-y-4">
        {filteredRequests.length === 0 ? (
          <div className="glass-card p-12 !rounded-xl text-center">
            <svg className="w-16 h-16 text-black mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-sm text-black font-bold">No messages</p>
            <p className="text-xs text-black mt-1">
              {filter === 'all' ? 'Your inbox is empty. Send a request via the Contact page.' : `No ${filter} messages`}
            </p>
          </div>
        ) : (
          filteredRequests.map((req) => {
            const isExpanded = expandedId === req.id;
            return (
              <div key={req.id} className="glass-card !rounded-xl overflow-hidden">
                {/* Clickable Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : req.id)}
                  className="w-full p-5 text-left hover:bg-primary/10 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        req.status === 'responded' ? 'bg-green-500/20' : req.status === 'open' ? 'bg-blue-500/20' : 'bg-dark/5'
                      }`}>
                        {req.status === 'responded' ? (
                          <svg className="w-5 h-5 ui-text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 ui-text-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="text-sm font-bold text-black">{req.subject}</h4>
                          <StatusBadge status={req.status} />
                        </div>
                        <p className="text-xs text-black">
                          <TypeIcon type={req.type} />{req.type} · {req.buildingName}
                          {req.createdAt && <span className="ml-2 text-black">· {formatDate(req.createdAt)}</span>}
                        </p>
                      </div>
                    </div>
                    <svg className={`w-5 h-5 text-black transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded Detail View */}
                {isExpanded && (
                  <div className="border-t border-dark/5 px-5 pb-5">
                    {/* Your Sent Message */}
                    <div className="mt-4 flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xs font-bold shrink-0 mt-0.5">
                        You
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-primary mb-1">Your Message</p>
                        <div className="bg-primary/5 border border-primary/15 rounded-xl p-3">
                          <p className="text-sm text-black leading-relaxed">{req.message}</p>
                        </div>
                      </div>
                    </div>

                    {/* Admin Response */}
                    {req.adminResponse ? (
                      <div className="mt-4 flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center shrink-0 mt-0.5">
                          <svg className="w-4 h-4 ui-text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-bold ui-text-green mb-1">Admin Response</p>
                          <div className="bg-green-500/5 border border-green-500/15 rounded-xl p-3">
                            <p className="text-sm text-black leading-relaxed">{req.adminResponse}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 p-3 rounded-xl bg-dark/3 border border-dark/5 text-center">
                        <p className="text-xs text-black">
                          <svg className="w-4 h-4 inline mr-1 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Awaiting admin response...
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}

// ─── Admin Inbox (redirects to tab) ───────────────────────────────
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

// ─── Page Component ───────────────────────────────────────────────
export default function InboxPage() {
  const { firebaseUser, profile } = useAuth();
  const isAdmin = profile?.role === 'Administrator';

  if (!firebaseUser) return null;

  if (isAdmin) {
    return <AdminInboxRedirect />;
  }

  return <UserInbox uid={firebaseUser.uid} />;
}
