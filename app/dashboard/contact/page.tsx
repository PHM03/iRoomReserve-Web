'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  getReservationsByUser,
  Reservation,
} from '@/lib/reservations';
import {
  createAdminRequest,
  getAdminRequestsByUser,
  AdminRequest,
} from '@/lib/adminRequests';
import { getBuildings, Building } from '@/lib/buildings';

export default function ContactAdminPage() {
  const { firebaseUser, profile } = useAuth();

  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<'equipment' | 'general' | 'other'>('general');
  const [linkedReservationId, setLinkedReservationId] = useState<string | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedBuildingName, setSelectedBuildingName] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;

    let cancelled = false;

    const loadContactData = async () => {
      try {
        const [nextRequests, nextReservations, nextBuildings] = await Promise.all([
          getAdminRequestsByUser(firebaseUser.uid),
          getReservationsByUser(firebaseUser.uid),
          getBuildings(),
        ]);

        if (!cancelled) {
          setRequests(nextRequests);
          setReservations(nextReservations);
          setBuildings(nextBuildings);
        }
      } catch (error) {
        console.error('Failed to load contact page data:', error);
      }
    };

    loadContactData();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  const activeReservations = reservations.filter(
    (r) => r.status === 'pending' || r.status === 'approved'
  );

  const handleBuildingChange = (buildingId: string) => {
    setSelectedBuildingId(buildingId);
    const building = buildings.find((b) => b.id === buildingId);
    setSelectedBuildingName(building?.name || '');
  };

  const handleLinkReservation = (reservationId: string) => {
    setLinkedReservationId(reservationId || null);
    if (reservationId) {
      const res = reservations.find((r) => r.id === reservationId);
      if (res) {
        setSelectedBuildingId(res.buildingId);
        setSelectedBuildingName(res.buildingName);
      }
    }
  };

  const handleSubmit = async () => {
    if (!firebaseUser || !subject.trim() || !message.trim() || !selectedBuildingId) return;
    setSubmitting(true);
    try {
      const displayName = firebaseUser.displayName || profile?.firstName || 'User';
      await createAdminRequest({
        userId: firebaseUser.uid,
        userName: displayName,
        reservationId: linkedReservationId,
        type,
        subject: subject.trim(),
        message: message.trim(),
        buildingId: selectedBuildingId,
        buildingName: selectedBuildingName,
      });
      const updatedRequests = await getAdminRequestsByUser(firebaseUser.uid);
      setRequests(updatedRequests);
      setSubmitSuccess(true);
      setTimeout(() => {
        setShowForm(false);
        setSubmitSuccess(false);
        setType('general');
        setLinkedReservationId(null);
        setSelectedBuildingId('');
        setSelectedBuildingName('');
        setSubject('');
        setMessage('');
      }, 2000);
    } catch (error) {
      console.error('Failed to send request:', error);
    }
    setSubmitting(false);
  };

  const statusStyle = (status: string) => {
    switch (status) {
      case 'open': return 'ui-badge-blue';
      case 'responded': return 'ui-badge-green';
      case 'closed': return 'ui-badge-gray';
      default: return 'ui-badge-gray';
    }
  };

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10 pb-24 md:pb-8">
      <div className="flex items-center justify-between gap-4 mb-8 backdrop-blur-md bg-white/40 rounded-xl px-6 py-4 border border-white/30">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Contact Admin</h2>
          <p className="text-gray-600 mt-1">Request equipment, supplies, or send a message</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Request
          </button>
        )}
      </div>

      {/* New Request Form */}
      {showForm && (
        <div className="glass-card p-6 !rounded-2xl mb-8">
          {submitSuccess ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 ui-text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-black mb-1">Request Sent!</h3>
              <p className="text-sm text-black">The admin will respond to your request.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-black">New Request</h3>
                <button
                  onClick={() => setShowForm(false)}
                  className="p-2 rounded-lg text-black hover:text-primary hover:bg-primary/10 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* Type */}
                <div>
                  <label className="block text-sm font-bold text-black mb-1.5">Request Type</label>
                  <div className="flex gap-2">
                    {(['equipment', 'general', 'other'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setType(t)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold capitalize transition-all ${
                          type === t
                            ? 'bg-primary/20 text-primary border border-primary/30'
                            : 'bg-dark/5 text-black border border-dark/10 hover:text-primary'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Link to Reservation */}
                <div>
                  <label className="block text-sm font-bold text-black mb-1.5">Link to Reservation (optional)</label>
                  <select
                    value={linkedReservationId || ''}
                    onChange={(event) => handleLinkReservation(event.target.value)}
                    className="glass-input w-full px-4 py-3"
                  >
                    <option value="">None — General Request</option>
                    {activeReservations.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.roomName} · {r.date} ({r.status})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Building */}
                {!linkedReservationId && (
                  <div>
                    <label className="block text-sm font-bold text-black mb-1.5">Building</label>
                    <select
                      value={selectedBuildingId}
                      onChange={(event) => handleBuildingChange(event.target.value)}
                      className="glass-input w-full px-4 py-3"
                    >
                      <option value="">Select a building</option>
                      {buildings.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Subject */}
                <div>
                  <label className="block text-sm font-bold text-black mb-1.5">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    className="glass-input w-full px-4 py-3"
                    placeholder="e.g., Need additional speakers"
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="block text-sm font-bold text-black mb-1.5">Message</label>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    className="glass-input w-full px-4 py-3 min-h-[120px] resize-none"
                    placeholder="Describe your request in detail..."
                  />
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !subject.trim() || !message.trim() || !selectedBuildingId}
                  className="btn-primary w-full py-3 px-4 flex items-center justify-center"
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-black" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sending...
                    </>
                  ) : (
                    'Send Request'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Request History */}
      <div className="backdrop-blur-md bg-white/40 rounded-xl px-6 py-4 border border-white/30 inline-block mb-4">
        <h3 className="text-xl font-bold text-gray-800">Request History</h3>
      </div>
      <div className="space-y-4">
        {requests.length === 0 ? (
          <div className="glass-card p-12 !rounded-xl text-center">
            <svg className="w-14 h-14 text-black mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <p className="text-sm text-black font-bold">No requests yet</p>
            <p className="text-xs text-black mt-1">Your admin requests will appear here</p>
          </div>
        ) : (
          requests.map((req) => (
            <div key={req.id} className="glass-card p-5 !rounded-xl">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-bold text-black">{req.subject}</h4>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusStyle(req.status)} capitalize`}>
                      {req.status}
                    </span>
                  </div>
                  <p className="text-xs text-black capitalize">{req.type} · {req.buildingName}</p>
                </div>
              </div>
              <p className="text-sm text-black mb-3">{req.message}</p>
              {req.adminResponse && (
                <div className="bg-dark/5 rounded-xl p-3 border border-dark/10">
                  <p className="text-xs font-bold text-primary mb-1">Admin Response</p>
                  <p className="text-sm text-black">{req.adminResponse}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
