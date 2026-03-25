'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { getBuildings, Building } from '@/lib/buildings';
import { type ReservationCampus } from '@/lib/campuses';
import { normalizeRole, USER_ROLES } from '@/lib/domain/roles';
import { createReservation, createRecurringReservation } from '@/lib/reservations';
import { onAvailableRoomsByBuilding } from '@/lib/rooms';

interface Room {
  id: string;
  name: string;
  floor: string;
  status: string;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAIN_APPROVAL_EMAIL_FIELDS = [
  { key: 'advisorEmail', label: 'Advisor Email' },
  { key: 'dsasEmail', label: 'DSAS Email' },
  { key: 'registrarEmail', label: 'Registrar Email' },
  { key: 'buildingAdminEmail', label: 'Building Admin Email' },
] as const;
const DIGI_APPROVAL_EMAIL_FIELDS = [
  { key: 'buildingAdminEmail', label: 'Building Admin Email' },
] as const;

export default function ReserveRoomPage() {
  const { firebaseUser, profile } = useAuth();
  const router = useRouter();

  // Form state
  const [formStep, setFormStep] = useState(1);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedBuildingName, setSelectedBuildingName] = useState('');
  const [selectedCampus, setSelectedCampus] = useState<ReservationCampus | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedRoomName, setSelectedRoomName] = useState('');
  const [reservationDate, setReservationDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);

  // Recurring state
  const [isRecurring, setIsRecurring] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');

  // Equipment & approval state
  const [equipment, setEquipment] = useState<Record<string, number>>({
    fans: 0,
    speakers: 0,
    televisions: 0,
    hdmiCables: 0,
    monoblockChairs: 0,
    tables: 0,
  });
  const [approvalEmailError, setApprovalEmailError] = useState('');
  const [approvalEmails, setApprovalEmails] = useState({
    advisorEmail: '',
    dsasEmail: '',
    registrarEmail: '',
    buildingAdminEmail: '',
  });

  // Load buildings on mount
  useEffect(() => {
    getBuildings().then(setBuildings).catch(console.error);
  }, []);

  // Load rooms when building selected
  useEffect(() => {
    if (!selectedBuildingId) {
      return;
    }

    const unsubscribe = onAvailableRoomsByBuilding(selectedBuildingId, (nextRooms) => {
      setRooms(
        nextRooms.map((room) => ({
          id: room.id,
          name: room.name,
          floor: room.floor,
          status: room.status,
        }))
      );
      setRoomsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [selectedBuildingId]);

  const availableRooms = selectedBuildingId ? rooms : [];

  // Handlers
  const handleBuildingSelect = (buildingId: string) => {
    const building = buildings.find((b) => b.id === buildingId);
    setRooms([]);
    setRoomsLoading(Boolean(buildingId));
    setSelectedBuildingId(buildingId);
    setSelectedBuildingName(building?.name || '');
    setSelectedCampus(building?.campus ?? null);
    setApprovalEmailError('');
    setApprovalEmails({
      advisorEmail: '',
      dsasEmail: '',
      registrarEmail: '',
      buildingAdminEmail: '',
    });
    setSelectedRoomId('');
    setSelectedRoomName('');
    setFormStep(2);
  };

  const handleRoomSelect = (roomId: string) => {
    const room = availableRooms.find((r) => r.id === roomId);
    setSelectedRoomId(roomId);
    setSelectedRoomName(room?.name || '');
    setFormStep(3);
  };

  const updateEquipment = (key: string, delta: number) => {
    setEquipment((prev) => ({
      ...prev,
      [key]: Math.max(0, (prev[key] || 0) + delta),
    }));
  };

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const validateEmail = (email: string): boolean => {
    if (!email.trim()) return true;
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  // Calculate preview dates for recurring
  const getPreviewDates = (): string[] => {
    if (!reservationDate || !recurringEndDate || selectedDays.length === 0) return [];
    const dates: string[] = [];
    const current = new Date(reservationDate + 'T00:00:00');
    const end = new Date(recurringEndDate + 'T00:00:00');
    while (current <= end && dates.length < 20) {
      if (selectedDays.includes(current.getDay())) {
        dates.push(current.toISOString().split('T')[0]);
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const canProceedStep3 = (): boolean => {
    if (!startTime || !endTime || !purpose) return false;
    if (isRecurring) {
      return !!reservationDate && !!recurringEndDate && selectedDays.length > 0;
    }
    return !!reservationDate;
  };

  const handleSubmitReservation = async () => {
    if (!firebaseUser || !selectedBuildingId || !selectedRoomId || !selectedCampus || !startTime || !endTime || !purpose) return;

    const requiredApprovalFields =
      selectedCampus === 'digi'
        ? DIGI_APPROVAL_EMAIL_FIELDS
        : MAIN_APPROVAL_EMAIL_FIELDS;
    const hasInvalidApprovalEmail = requiredApprovalFields.some(({ key }) => {
      const value = approvalEmails[key];
      return !value.trim() || !validateEmail(value);
    });
    if (hasInvalidApprovalEmail) {
      setApprovalEmailError(
        selectedCampus === 'digi'
          ? 'Enter a valid building admin email for Digi Campus.'
          : 'Enter a valid email for each Main Campus approval step.'
      );
      return;
    }
    setSubmitting(true);
    try {
      const displayName = firebaseUser.displayName || 'Student';
      const normalizedUserRole = normalizeRole(profile?.role) ?? USER_ROLES.STUDENT;
      const sharedData = {
        userId: firebaseUser.uid,
        userName: displayName,
        userRole: normalizedUserRole,
        roomId: selectedRoomId,
        roomName: selectedRoomName,
        buildingId: selectedBuildingId,
        buildingName: selectedBuildingName,
        startTime,
        endTime,
        purpose,
        equipment,
      };

      if (selectedCampus === 'main') {
        const reservationData = {
          ...sharedData,
          campus: 'main' as const,
          advisorEmail: approvalEmails.advisorEmail.trim().toLowerCase(),
          dsasEmail: approvalEmails.dsasEmail.trim().toLowerCase(),
          registrarEmail: approvalEmails.registrarEmail.trim().toLowerCase(),
          buildingAdminEmail: approvalEmails.buildingAdminEmail.trim().toLowerCase(),
        };

        if (isRecurring && selectedDays.length > 0 && recurringEndDate) {
          const ids = await createRecurringReservation(
            reservationData,
            selectedDays,
            reservationDate,
            recurringEndDate
          );
          setCreatedCount(ids.length);
        } else {
          await createReservation({ ...reservationData, date: reservationDate });
          setCreatedCount(1);
        }
      } else {
        const reservationData = {
          ...sharedData,
          campus: 'digi' as const,
          buildingAdminEmail: approvalEmails.buildingAdminEmail.trim().toLowerCase(),
        };

        if (isRecurring && selectedDays.length > 0 && recurringEndDate) {
          const ids = await createRecurringReservation(
            reservationData,
            selectedDays,
            reservationDate,
            recurringEndDate
          );
          setCreatedCount(ids.length);
        } else {
          await createReservation({ ...reservationData, date: reservationDate });
          setCreatedCount(1);
        }
      }
      setSubmitSuccess(true);
    } catch (err) {
      console.error('Failed to create reservation:', err);
    }
    setSubmitting(false);
  };

  const previewDates = isRecurring ? getPreviewDates() : [];

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 pb-24 md:pb-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Reserve a Room</h2>
        <p className="text-white/40 mt-1">Find and book the perfect space for your needs</p>
      </div>

      <div className="glass-card p-6 !rounded-2xl">
        {/* Success State */}
        {submitSuccess ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-5">
              <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              {createdCount > 1 ? `${createdCount} Reservations Submitted!` : 'Reservation Submitted!'}
            </h3>
            <p className="text-sm text-white/40 mb-6">
              {createdCount > 1
                ? `${createdCount} recurring reservations have been created. Each one will follow the ${selectedCampus === 'digi' ? 'single-step building admin approval' : 'Main Campus approval chain'}.`
                : selectedCampus === 'digi'
                  ? 'Your request will go directly to the building admin for approval.'
                  : 'Your request will move through the Main Campus approval chain.'
              }
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => router.push('/dashboard')}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
              >
                Back to Dashboard
              </button>
              <button
                onClick={() => router.push('/dashboard/reservations')}
                className="btn-primary px-6 py-2.5 text-sm"
              >
                View My Reservations
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Progress Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-white">New Reservation</h3>
                <p className="text-xs text-white/40 mt-0.5">
                  Step {formStep} of 4 — {
                    formStep === 1 ? 'Select Building' :
                    formStep === 2 ? 'Select Room' :
                    formStep === 3 ? 'Schedule & Purpose' :
                    'Equipment & Approval'
                  }
                </p>
              </div>
              <button
                onClick={() => router.push('/dashboard')}
                className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Progress Bar */}
            <div className="flex gap-2 mb-6">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`h-1 flex-1 rounded-full transition-all ${
                    step <= formStep ? 'bg-primary' : 'bg-white/10'
                  }`}
                />
              ))}
            </div>

            {/* Step 1: Select Building */}
            {formStep === 1 && (
              <div>
                <h4 className="text-sm font-bold text-white/70 mb-3">Where would you like to book?</h4>
                {buildings.length === 0 ? (
                  <div className="text-center py-8">
                    <svg className="animate-spin h-6 w-6 text-white/30 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-sm text-white/30">Loading buildings...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {buildings.map((building) => (
                      <button
                        key={building.id}
                        onClick={() => handleBuildingSelect(building.id)}
                        className="glass-card !bg-white/5 p-4 !rounded-xl text-left group hover:!border-primary/40 transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                          </div>
                          <div>
                            <h5 className="font-bold text-white text-sm group-hover:text-primary transition-colors">{building.name}</h5>
                            {building.code && (
                              <p className="text-[10px] text-white/30">{building.code} · {building.floors} floors</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Select Room */}
            {formStep === 2 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => setFormStep(1)}
                    className="p-1 rounded-lg text-white/30 hover:text-white/60 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h4 className="text-sm font-bold text-white/70">
                    Available rooms in <span className="text-primary">{selectedBuildingName}</span>
                  </h4>
                </div>

                {roomsLoading ? (
                  <div className="text-center py-8">
                    <svg className="animate-spin h-6 w-6 text-white/30 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-sm text-white/30">Loading rooms...</p>
                  </div>
                ) : availableRooms.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-white/30">No available rooms in this building.</p>
                    <button
                      onClick={() => setFormStep(1)}
                      className="mt-3 text-sm text-primary font-bold hover:text-primary-hover transition-colors"
                    >
                      Choose another building
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {availableRooms.map((room) => (
                      <button
                        key={room.id}
                        onClick={() => handleRoomSelect(room.id)}
                        className="glass-card !bg-white/5 p-4 !rounded-xl text-left group hover:!border-green-500/40 transition-all cursor-pointer border-l-4 border-green-500/40"
                      >
                        <h5 className="font-bold text-white text-sm">{room.name}</h5>
                        <p className="text-[10px] text-white/30 mt-0.5">{room.floor}</p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-green-500/20 text-green-300 border-green-500/30 mt-2">
                          Available
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Schedule & Purpose */}
            {formStep === 3 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setFormStep(2)}
                    className="p-1 rounded-lg text-white/30 hover:text-white/60 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h4 className="text-sm font-bold text-white/70">
                    Booking <span className="text-primary">{selectedRoomName}</span> in {selectedBuildingName}
                  </h4>
                </div>

                <div className="space-y-4">
                  {/* Recurring Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                    <div>
                      <span className="text-sm font-bold text-white/70">Recurring Reservation</span>
                      <p className="text-[10px] text-white/30 mt-0.5">Book the same time slot on multiple days</p>
                    </div>
                    <button
                      onClick={() => {
                        setIsRecurring(!isRecurring);
                        if (!isRecurring) {
                          setSelectedDays([]);
                          setRecurringEndDate('');
                        }
                      }}
                      className={`relative w-11 h-6 rounded-full transition-all ${
                        isRecurring ? 'bg-primary' : 'bg-white/15'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${
                        isRecurring ? 'left-[22px]' : 'left-0.5'
                      }`} />
                    </button>
                  </div>

                  {/* Single Date or Date Range */}
                  {isRecurring ? (
                    <>
                      {/* Day Picker */}
                      <div>
                        <label className="block text-sm font-bold text-white/70 mb-2">Select Days of the Week</label>
                        <div className="flex gap-2">
                          {DAY_LABELS.map((label, i) => (
                            <button
                              key={label}
                              onClick={() => toggleDay(i)}
                              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                selectedDays.includes(i)
                                  ? 'bg-primary/20 text-primary border border-primary/30'
                                  : 'bg-white/5 text-white/40 border border-white/10 hover:text-white/60 hover:bg-white/10'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Date Range */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-white/70 mb-1.5">Start Date</label>
                          <input
                            type="date"
                            value={reservationDate}
                            onChange={(e) => setReservationDate(e.target.value)}
                            className="glass-input w-full px-4 py-3"
                            min={new Date().toISOString().split('T')[0]}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-white/70 mb-1.5">End Date</label>
                          <input
                            type="date"
                            value={recurringEndDate}
                            onChange={(e) => setRecurringEndDate(e.target.value)}
                            className="glass-input w-full px-4 py-3"
                            min={reservationDate || new Date().toISOString().split('T')[0]}
                          />
                        </div>
                      </div>

                      {/* Preview */}
                      {previewDates.length > 0 && (
                        <div className="p-3 rounded-xl bg-primary/5 border border-primary/15">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-xs font-bold text-primary">
                              {previewDates.length} reservation{previewDates.length > 1 ? 's' : ''} will be created
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {previewDates.map((d) => (
                              <span key={d} className="px-2 py-0.5 rounded-lg bg-white/5 text-[10px] text-white/50 font-bold border border-white/10">
                                {d}
                              </span>
                            ))}
                            {previewDates.length >= 20 && (
                              <span className="px-2 py-0.5 text-[10px] text-white/30 font-bold">…and more</span>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div>
                      <label className="block text-sm font-bold text-white/70 mb-1.5">Date</label>
                      <input
                        type="date"
                        value={reservationDate}
                        onChange={(e) => setReservationDate(e.target.value)}
                        className="glass-input w-full px-4 py-3"
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  )}

                  {/* Time */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-white/70 mb-1.5">Start Time</label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="glass-input w-full px-4 py-3"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-white/70 mb-1.5">End Time</label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="glass-input w-full px-4 py-3"
                      />
                    </div>
                  </div>

                  {/* Purpose */}
                  <div>
                    <label className="block text-sm font-bold text-white/70 mb-1.5">Purpose</label>
                    <input
                      type="text"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      className="glass-input w-full px-4 py-3"
                      placeholder="e.g., Group Study, Meeting, Workshop"
                    />
                  </div>

                  <button
                    onClick={() => {
                      if (!canProceedStep3()) return;
                      setFormStep(4);
                    }}
                    disabled={!canProceedStep3()}
                    className="btn-primary w-full py-3 px-4 flex items-center justify-center"
                  >
                    Next: Equipment & Approval
                    <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Equipment & Approval */}
            {formStep === 4 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setFormStep(3)}
                    className="p-1 rounded-lg text-white/30 hover:text-white/60 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h4 className="text-sm font-bold text-white/70">Materials / Equipment</h4>
                </div>

                {/* Recurring summary banner */}
                {isRecurring && previewDates.length > 0 && (
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/15 mb-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span className="text-xs font-bold text-primary">
                        Recurring: {previewDates.length} reservations ({selectedDays.map((d) => DAY_LABELS[d]).join(', ')})
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  {/* Equipment Steppers */}
                  <div className="space-y-3">
                    {[
                      { key: 'fans', label: 'Fans' },
                      { key: 'speakers', label: 'Speakers with Microphones' },
                      { key: 'televisions', label: 'Televisions' },
                      { key: 'hdmiCables', label: 'HDMI Cables' },
                      { key: 'monoblockChairs', label: 'Monoblock Chairs' },
                      { key: 'tables', label: 'Tables' },
                    ].map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10"
                      >
                        <span className="text-sm font-bold text-white/70">{item.label}</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => updateEquipment(item.key, -1)}
                            disabled={equipment[item.key] === 0}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all bg-white/5 border border-white/10 hover:bg-white/10 hover:text-primary disabled:opacity-30 disabled:hover:bg-white/5 disabled:hover:text-white/40"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-sm font-bold text-white">
                            {equipment[item.key]}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateEquipment(item.key, 1)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all bg-white/5 border border-white/10 hover:bg-white/10 hover:text-primary"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <h5 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-3">Approval Routing</h5>
                    <div className="space-y-3">
                      {(selectedCampus === 'digi'
                        ? DIGI_APPROVAL_EMAIL_FIELDS
                        : MAIN_APPROVAL_EMAIL_FIELDS
                      ).map((field) => (
                        <div key={field.key}>
                          <label className="block text-xs font-bold text-white/40 mb-1.5">
                            {field.label}
                          </label>
                          <input
                            type="email"
                            value={approvalEmails[field.key]}
                            onChange={(e) => {
                              setApprovalEmails((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }));
                              if (approvalEmailError) setApprovalEmailError('');
                            }}
                            className={`glass-input w-full px-4 py-3 ${
                              approvalEmailError ? '!border-red-500/60' : ''
                            }`}
                            placeholder={`Input ${field.label.toLowerCase()}`}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-white/35 mt-2">
                      {selectedCampus === 'digi'
                        ? 'Digi Campus uses a single-step building admin approval.'
                        : 'Main Campus uses advisor, DSAS, registrar, then building admin approval.'}
                    </p>
                    {approvalEmailError && (
                      <p className="text-xs text-red-400 mt-1.5 font-bold">{approvalEmailError}</p>
                    )}
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleSubmitReservation}
                    disabled={submitting}
                    className="btn-primary w-full py-3 px-4 flex items-center justify-center"
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        {isRecurring ? 'Creating Reservations...' : 'Submitting...'}
                      </>
                    ) : (
                      isRecurring && previewDates.length > 1
                        ? `Submit ${previewDates.length} Reservations`
                        : 'Submit Reservation'
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
