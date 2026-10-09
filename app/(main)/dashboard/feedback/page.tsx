'use client';

import { type SubmitEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { Feedback, createFeedback, getAverageSentiment, getFeedbackByUser } from '@/lib/feedback/feedback';
import { Reservation, getReservationsByUser } from '@/lib/reservations/reservations';
import { getSentimentLabel } from '@/lib/ai/sentiment';
import { inferCampusFromBuilding, type ReservationCampus } from '@/lib/buildings/campuses';
import { getRoomsByIds } from '@/lib/rooms/rooms';
import {
  limitFeedbackCharacters,
  MAX_FEEDBACK_CHARACTERS,
} from '@/lib/feedback/feedback-text-limit';
import {
  FEEDBACK_ASPECT_LABELS,
  FEEDBACK_CATEGORY_KEYS,
  FEEDBACK_CATEGORY_LABELS,
  analyzeFeedbackText,
  type FeedbackAspectKey,
  type FeedbackCategoryRatingKey,
  type FeedbackCategoryRatings,
} from '@/lib/feedback/feedback-analytics';
import { formatDate, formatDateTime, formatTimeRange } from '@/lib/utils/dateTime';

function formatSentimentLabel(label: string) {
  return label
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getSentimentBadgeClasses(label: string) {
  if (label === 'conflicted' || label === 'insufficient_context') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700';
  }

  if (label === 'very_positive') {
    return 'border-emerald-600/30 bg-emerald-600/15 text-emerald-800';
  }

  if (label === 'positive') {
    return 'border-green-500/25 bg-green-500/10 text-green-700';
  }

  if (label === 'very_negative') {
    return 'border-red-700/30 bg-red-700/15 text-red-800';
  }

  if (label === 'negative') {
    return 'border-red-500/25 bg-red-500/10 text-red-700';
  }

  return 'border-slate-500/25 bg-slate-500/10 text-slate-700';
}

const EMPTY_CATEGORY_RATINGS: Record<FeedbackCategoryRatingKey, number> = {
  cleanliness: 0,
  comfort: 0,
  air_conditioning: 0,
  equipment_projector: 0,
  internet_connectivity: 0,
};

interface UsedRoom {
  campus: ReservationCampus | null;
  buildingId: string;
  buildingName: string;
  feedbackCount: number;
  floor: string | null;
  roomId: string;
  roomName: string;
}

function getMainCampusBuildingCode(buildingId: string, buildingName: string) {
  const match = `${buildingId} ${buildingName}`.match(/(?:^|[^a-z0-9])gd[\s-]?([123])(?:$|[^0-9])/i);
  return match ? `gd${match[1]}` : null;
}

type PendingDateRange = 'none' | 'recent' | 'week' | 'month' | 'year' | 'all';

function isWithinPendingDateRange(dateValue: string, range: PendingDateRange) {
  if (range === 'none' || range === 'all') return true;

  const parsedDate = new Date(dateValue.length === 10 ? `${dateValue}T00:00:00` : dateValue);
  if (Number.isNaN(parsedDate.getTime())) return false;

  const daysByRange: Record<Exclude<PendingDateRange, 'none' | 'all'>, number> = {
    recent: 1,
    week: 7,
    month: 30,
    year: 365,
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const oldestIncludedDate = new Date(today);
  oldestIncludedDate.setDate(today.getDate() - daysByRange[range] + 1);
  return parsedDate >= oldestIncludedDate && parsedDate <= today;
}

function getCompleteCategoryRatings(
  ratings: Record<FeedbackCategoryRatingKey, number>
): FeedbackCategoryRatings | null {
  if (!FEEDBACK_CATEGORY_KEYS.every((key) => ratings[key] >= 1 && ratings[key] <= 5)) {
    return null;
  }

  return { ...ratings } as FeedbackCategoryRatings;
}

interface RoundedFilterSelectProps {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}

function RoundedFilterSelect({ label, onChange, options, value }: RoundedFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="glass-input flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm"
      >
        <span className="truncate">{selectedOption?.label}</span>
        <svg className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.09 1.032l-4.25 4.5a.75.75 0 01-1.09 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div role="listbox" aria-label={label} className="absolute z-30 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-dark/10 bg-white p-1.5 shadow-lg">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                option.value === value ? 'bg-primary/10 font-bold text-primary' : 'text-black hover:bg-dark/5'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getAspectEntries(
  aspects: Feedback['detectedAspects'],
  sentiment: 'positive' | 'negative'
) {
  return Object.entries(aspects)
    .filter(([, value]) => value === sentiment)
    .map(([key]) => key as FeedbackAspectKey);
}

export default function FeedbackPage() {
  const { firebaseUser, profile } = useAuth();

  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [roomFloors, setRoomFloors] = useState<Record<string, string>>({});
  const [selectedFeedbackRoomId, setSelectedFeedbackRoomId] = useState<string | null>(null);
  const [campusFilter, setCampusFilter] = useState<'none' | 'all' | ReservationCampus>('none');
  const [buildingFilter, setBuildingFilter] = useState<'all' | 'gd1' | 'gd2' | 'gd3'>('all');
  const [floorFilter, setFloorFilter] = useState('none');
  const [roomSearch, setRoomSearch] = useState('');
  const [pendingCampusFilter, setPendingCampusFilter] = useState<'none' | 'all' | ReservationCampus>('none');
  const [pendingBuildingFilter, setPendingBuildingFilter] = useState<'none' | 'all' | 'gd1' | 'gd2' | 'gd3'>('none');
  const [pendingFloorFilter, setPendingFloorFilter] = useState('none');
  const [pendingRoomSearch, setPendingRoomSearch] = useState('');
  const [pendingDateRange, setPendingDateRange] = useState<PendingDateRange>('none');
  const [showForm, setShowForm] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [categoryRatings, setCategoryRatings] =
    useState<Record<FeedbackCategoryRatingKey, number>>(EMPTY_CATEGORY_RATINGS);
  const [hoverCategoryRatings, setHoverCategoryRatings] =
    useState<Record<FeedbackCategoryRatingKey, number>>(EMPTY_CATEGORY_RATINGS);
  const [comment, setComment] = useState('');
  const [postAnonymously, setPostAnonymously] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [roomAverageSentiment, setRoomAverageSentiment] = useState<number | null>(null);
  const [loadingRoomAverage, setLoadingRoomAverage] = useState(false);
  const feedbackFormRef = useRef<HTMLDivElement>(null);

  const deferredComment = useDeferredValue(comment);
  const trimmedComment = comment.trim();
  const feedbackCharacterCount = comment.length;
  const sentimentPreview = analyzeFeedbackText(deferredComment);
  const sentimentPreviewLabel = sentimentPreview.sentimentClassification;
  const selectedCategoryRatings = getCompleteCategoryRatings(categoryRatings);
  const ratedCategoryCount = FEEDBACK_CATEGORY_KEYS.filter((key) => categoryRatings[key] > 0).length;
  const overallRating = ratedCategoryCount > 0
    ? Number((FEEDBACK_CATEGORY_KEYS.reduce((sum, key) => sum + categoryRatings[key], 0) / ratedCategoryCount).toFixed(1))
    : 0;
  const hasSentimentPreview = overallRating > 0 || Boolean(trimmedComment);
  const previewPositiveAspects = getAspectEntries(sentimentPreview.detectedAspects, 'positive');
  const previewNegativeAspects = getAspectEntries(sentimentPreview.detectedAspects, 'negative');

  useEffect(() => {
    if (!firebaseUser) {
      return;
    }

    let cancelled = false;

    const loadFeedbackData = async () => {
      try {
        const [nextFeedback, nextReservations] = await Promise.all([
          getFeedbackByUser(firebaseUser.uid),
          getReservationsByUser(firebaseUser.uid),
        ]);

        if (cancelled) return;

        setFeedbackList(nextFeedback);
        setReservations(nextReservations);

        try {
          const roomIds = [...new Set([
            ...nextFeedback.map((feedback) => feedback.roomId),
            ...nextReservations.map((reservation) => reservation.roomId),
          ])];
          const rooms = await getRoomsByIds(roomIds);
          if (!cancelled) {
            setRoomFloors(Object.fromEntries(rooms.map((room) => [room.id, room.floor])));
          }
        } catch (error) {
          console.error('Failed to load room floors for feedback filters:', error);
        }
      } catch (error) {
        console.error('Failed to load feedback page data:', error);
      }
    };

    loadFeedbackData();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!selectedReservation) {
      setRoomAverageSentiment(null);
      setLoadingRoomAverage(false);
      return;
    }

    let cancelled = false;

    const loadAverageSentiment = async () => {
      setLoadingRoomAverage(true);

      try {
        const average = await getAverageSentiment(selectedReservation.roomId);

        if (!cancelled) {
          setRoomAverageSentiment(average);
        }
      } catch (error) {
        console.error('Failed to load room sentiment average:', error);

        if (!cancelled) {
          setRoomAverageSentiment(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingRoomAverage(false);
        }
      }
    };

    loadAverageSentiment();

    return () => {
      cancelled = true;
    };
  }, [selectedReservation]);

  const completedReservations = reservations.filter((reservation) => reservation.status === 'completed');
  const feedbackReservationIds = new Set(feedbackList.map((feedback) => feedback.reservationId));
  const pendingFeedback = completedReservations.filter(
    (reservation) => !feedbackReservationIds.has(reservation.id)
  );
  const visiblePendingFeedback = pendingFeedback.filter(
    (reservation) => !showForm || reservation.id !== selectedReservation?.id
  );
  const pendingFloors = [...new Set(visiblePendingFeedback
    .map((reservation) => roomFloors[reservation.roomId])
    .filter((floor): floor is string => Boolean(floor)))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const normalizedPendingRoomSearch = pendingRoomSearch.trim().toLocaleLowerCase();
  const hasPendingFilter = pendingCampusFilter !== 'none'
    && pendingFloorFilter !== 'none'
    && pendingDateRange !== 'none'
    && (pendingCampusFilter !== 'main' || pendingBuildingFilter !== 'none');
  const filteredPendingFeedback = visiblePendingFeedback.filter((reservation) => {
    const matchesDateRange = isWithinPendingDateRange(reservation.date, pendingDateRange);
    const matchesCampus = pendingCampusFilter === 'none' || pendingCampusFilter === 'all' || reservation.campus === pendingCampusFilter;
    const matchesBuilding = pendingCampusFilter !== 'main' || pendingBuildingFilter === 'none' || pendingBuildingFilter === 'all' || getMainCampusBuildingCode(reservation.buildingId, reservation.buildingName) === pendingBuildingFilter;
    const matchesFloor = pendingFloorFilter === 'none' || pendingFloorFilter === 'all' || roomFloors[reservation.roomId] === pendingFloorFilter;
    const matchesSearch = !normalizedPendingRoomSearch || `${reservation.roomName} ${reservation.buildingName}`.toLocaleLowerCase().includes(normalizedPendingRoomSearch);
    return matchesDateRange && matchesCampus && matchesBuilding && matchesFloor && matchesSearch;
  });
  const usedRooms = useMemo(() => {
    const roomsById = new Map<string, UsedRoom>();

    completedReservations.forEach((reservation) => {
      roomsById.set(reservation.roomId, {
        campus: reservation.campus ?? inferCampusFromBuilding({ id: reservation.buildingId, name: reservation.buildingName }),
        buildingId: reservation.buildingId,
        buildingName: reservation.buildingName,
        feedbackCount: 0,
        floor: roomFloors[reservation.roomId] ?? null,
        roomId: reservation.roomId,
        roomName: reservation.roomName,
      });
    });

    feedbackList.forEach((feedback) => {
      const room = roomsById.get(feedback.roomId) ?? {
        campus: inferCampusFromBuilding({ id: feedback.buildingId, name: feedback.buildingName }),
        buildingId: feedback.buildingId,
        buildingName: feedback.buildingName,
        feedbackCount: 0,
        floor: roomFloors[feedback.roomId] ?? null,
        roomId: feedback.roomId,
        roomName: feedback.roomName,
      };
      room.feedbackCount += 1;
      roomsById.set(feedback.roomId, room);
    });

    return [...roomsById.values()].sort((left, right) =>
      left.roomName.localeCompare(right.roomName)
    );
  }, [completedReservations, feedbackList, roomFloors]);
  const normalizedRoomSearch = roomSearch.trim().toLocaleLowerCase();
  const reviewedRooms = usedRooms.filter((room) => room.feedbackCount > 0);
  const availableFloors = [...new Set(reviewedRooms.map((room) => room.floor).filter((floor): floor is string => Boolean(floor)))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const hasReviewedFilter = campusFilter !== 'none' || floorFilter !== 'none' || Boolean(normalizedRoomSearch);
  const filteredUsedRooms = reviewedRooms.filter((room) => {
    const matchesCampus = campusFilter === 'none' || campusFilter === 'all' || room.campus === campusFilter;
    const matchesBuilding = campusFilter !== 'main' || buildingFilter === 'all' || getMainCampusBuildingCode(room.buildingId, room.buildingName) === buildingFilter;
    const matchesFloor = floorFilter === 'none' || floorFilter === 'all' || room.floor === floorFilter;
    const matchesSearch = !normalizedRoomSearch || `${room.roomName} ${room.buildingName}`.toLocaleLowerCase().includes(normalizedRoomSearch);
    return matchesCampus && matchesBuilding && matchesFloor && matchesSearch;
  });
  const selectedRoomFeedback = selectedFeedbackRoomId
    ? feedbackList.filter((feedback) => feedback.roomId === selectedFeedbackRoomId)
    : [];
  const selectedFeedbackRoom = usedRooms.find(
    (room) => room.roomId === selectedFeedbackRoomId
  );

  useEffect(() => {
    if (!showForm || !selectedReservation) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      feedbackFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [showForm, selectedReservation]);

  const handleCloseFeedback = () => {
    setShowForm(false);
    setSelectedReservation(null);
    setCategoryRatings(EMPTY_CATEGORY_RATINGS);
    setHoverCategoryRatings(EMPTY_CATEGORY_RATINGS);
    setComment('');
    setPostAnonymously(true);
    setSubmitSuccess(false);
    setRoomAverageSentiment(null);
    setLoadingRoomAverage(false);
  };

  const handleOpenFeedback = (reservation: Reservation) => {
    setSelectedReservation(reservation);
    setShowForm(true);
    setCategoryRatings(EMPTY_CATEGORY_RATINGS);
    setHoverCategoryRatings(EMPTY_CATEGORY_RATINGS);
    setComment('');
    setPostAnonymously(true);
    setSubmitSuccess(false);
    setRoomAverageSentiment(null);
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!firebaseUser || !selectedReservation || !selectedCategoryRatings || !trimmedComment) {
      return;
    }

    setSubmitting(true);

    try {
      const displayName = firebaseUser.displayName || profile?.firstName || 'User';

      await createFeedback({
        roomId: selectedReservation.roomId,
        roomName: selectedReservation.roomName,
        buildingId: selectedReservation.buildingId,
        buildingName: selectedReservation.buildingName,
        reservationId: selectedReservation.id,
        userId: firebaseUser.uid,
        userName: displayName,
        showSubmitterName: !postAnonymously,
        message: trimmedComment,
        rating: overallRating,
        categoryRatings: selectedCategoryRatings,
      });

      const [nextFeedback, nextReservations, nextAverage] = await Promise.all([
        getFeedbackByUser(firebaseUser.uid),
        getReservationsByUser(firebaseUser.uid),
        getAverageSentiment(selectedReservation.roomId),
      ]);

      setFeedbackList(nextFeedback);
      setReservations(nextReservations);
      setRoomAverageSentiment(nextAverage);
      setSubmitSuccess(true);

      setTimeout(() => {
        handleCloseFeedback();
      }, 2000);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const renderStars = (count: number, size = 'w-4 h-4') => {
    return Array.from({ length: 5 }, (_, index) => (
      <svg
        key={index}
        className={`${size} ${index < count ? 'ui-text-yellow' : 'text-black'}`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ));
  };

  const renderInteractiveStars = (
    value: number,
    hoverValue: number,
    onChange: (nextRating: number) => void,
    onHoverChange: (nextRating: number) => void,
    size = 'w-8 h-8'
  ) => (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => onHoverChange(star)}
          onMouseLeave={() => onHoverChange(0)}
          className="rounded-md p-0.5 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
        >
          <svg
            className={`${size} ${
              star <= (hoverValue || value) ? 'ui-text-yellow' : 'text-black/20'
            } transition-colors`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  );

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10 pb-24 md:pb-8">
      {/* ── Unified page header ─────────────────────────────── */}
      <div className="mb-8">
        <div className="rounded-2xl border border-white/35 bg-white px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] ">
          <h1 className="text-2xl font-bold text-gray-800">Feedback</h1>
          <p className="text-gray-600 mt-1">Rate your experience and help us improve</p>
        </div>
      </div>

      {/* ── Feedback form overlay ────────────────────────────── */}
      {showForm && selectedReservation && (
        <div
          ref={feedbackFormRef}
          className="rounded-2xl border border-white/50 bg-white p-6 shadow-sm  mb-8"
        >
          {submitSuccess ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 ui-text-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-black mb-1">Feedback Submitted!</h3>
              <p className="text-sm text-black">Thank you for your feedback.</p>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-black">Rate Your Experience</h3>
                    <p className="text-xs text-black/60 mt-0.5">
                      {selectedReservation.roomName} | {selectedReservation.buildingName} |{' '}
                      {formatDate(selectedReservation.date)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseFeedback}
                    className="p-2 rounded-lg text-black hover:text-primary hover:bg-primary/10 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <section className="rounded-xl border border-dark/10 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <label className="block text-sm font-bold text-black">Overall Rating</label>
                      <p className="text-xs text-black/55">Automatically averaged from the category ratings.</p>
                    </div>
                    <span className="text-xs font-bold text-black/60">
                      {overallRating > 0 ? `${overallRating.toFixed(1)} / 5 · ${ratedCategoryCount}/5 rated` : 'Not rated'}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center gap-1.5" aria-label={`Overall rating: ${overallRating > 0 ? `${overallRating.toFixed(1)} out of 5` : 'not rated'}`}>
                      {renderStars(Math.round(overallRating), 'w-8 h-8')}
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-dark/10 bg-white p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-black">Category Ratings</h4>
                      <p className="text-xs text-black/55">Rate the room conditions admins can act on.</p>
                    </div>
                    <span className="rounded-full border border-dark/10 bg-dark/5 px-2.5 py-1 text-[10px] font-bold text-black/55">
                      {FEEDBACK_CATEGORY_KEYS.filter((key) => categoryRatings[key] > 0).length}/5 complete
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {FEEDBACK_CATEGORY_KEYS.map((key) => (
                      <div key={key} className="rounded-xl border border-dark/8 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-black">{FEEDBACK_CATEGORY_LABELS[key]}</span>
                          <span className="text-[10px] font-bold text-black/50">
                            {categoryRatings[key] > 0 ? `${categoryRatings[key]}/5` : 'Required'}
                          </span>
                        </div>
                        {renderInteractiveStars(
                          categoryRatings[key],
                          hoverCategoryRatings[key],
                          (nextRating) =>
                            setCategoryRatings((currentRatings) => ({
                              ...currentRatings,
                              [key]: nextRating,
                            })),
                          (nextRating) =>
                            setHoverCategoryRatings((currentRatings) => ({
                              ...currentRatings,
                              [key]: nextRating,
                            })),
                          'w-5 h-5'
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <div>
                  <label className="block text-sm font-bold text-black mb-1.5">Required Feedback</label>
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(limitFeedbackCharacters(event.target.value))}
                    className="glass-input w-full px-4 py-3 min-h-[132px] resize-none"
                    placeholder="Mention what worked, what failed, and which room areas need attention..."
                    maxLength={MAX_FEEDBACK_CHARACTERS}
                    aria-describedby="feedback-character-count"
                    required
                  />
                  <p
                    id="feedback-character-count"
                    className={`mt-1.5 text-right text-xs font-bold ${
                      feedbackCharacterCount >= MAX_FEEDBACK_CHARACTERS ? 'text-primary' : 'text-black/50'
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    {feedbackCharacterCount}/{MAX_FEEDBACK_CHARACTERS} characters
                  </p>
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-dark/10 bg-dark/5 p-4 text-sm text-black">
                  <input
                    type="checkbox"
                    checked={postAnonymously}
                    onChange={(event) => setPostAnonymously(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block font-bold">Post anonymously</span>
                    <span className="mt-1 block text-xs text-black/60">
                      Your name will be hidden from administrators unless you clear this option.
                    </span>
                  </span>
                </label>

                <div className="rounded-xl border border-dark/10 bg-dark/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-black">
                        VADER Sentiment Preview
                      </p>
                      <p className="text-sm text-black mt-1">
                        {hasSentimentPreview
                          ? `${formatSentimentLabel(sentimentPreviewLabel)} (${sentimentPreview.sentiment.compound.toFixed(2)})`
                          : 'Select ratings and start typing to preview sentiment analytics.'}
                      </p>
                    </div>
                    {hasSentimentPreview && (
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${getSentimentBadgeClasses(
                          sentimentPreviewLabel
                        )}`}
                      >
                        {formatSentimentLabel(sentimentPreviewLabel)}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-black sm:grid-cols-4">
                    <div>
                      <p className="font-bold">Compound</p>
                      <p>{sentimentPreview.sentiment.compound.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="font-bold">Positive</p>
                      <p>{Math.round(sentimentPreview.sentiment.positive * 100)}%</p>
                    </div>
                    <div>
                      <p className="font-bold">Neutral</p>
                      <p>{Math.round(sentimentPreview.sentiment.neutral * 100)}%</p>
                    </div>
                    <div>
                      <p className="font-bold">Negative</p>
                      <p>{Math.round(sentimentPreview.sentiment.negative * 100)}%</p>
                    </div>
                  </div>

                  {(previewPositiveAspects.length > 0 || previewNegativeAspects.length > 0) && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-green-700">
                          Positive Aspects
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {previewPositiveAspects.length > 0 ? (
                            previewPositiveAspects.map((aspect) => (
                              <span key={aspect} className="rounded-full border border-green-500/25 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-700">
                                {FEEDBACK_ASPECT_LABELS[aspect]}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-black/45">None detected yet</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-red-700">
                          Negative Aspects
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {previewNegativeAspects.length > 0 ? (
                            previewNegativeAspects.map((aspect) => (
                              <span key={aspect} className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                {FEEDBACK_ASPECT_LABELS[aspect]}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-black/45">None detected yet</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {sentimentPreview.extractedKeywords.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-black/45">
                        Extracted Keywords
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {sentimentPreview.extractedKeywords.map((keyword) => (
                          <span key={keyword} className="min-w-0 max-w-full break-all rounded-full border border-dark/10 bg-white px-2 py-0.5 text-[10px] font-bold text-black/60">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="mt-3 text-xs text-black">
                    {loadingRoomAverage
                      ? 'Loading the current room average sentiment...'
                      : roomAverageSentiment === null
                        ? 'Average room sentiment will appear when feedback is available.'
                        : `Current room average: ${formatSentimentLabel(
                            getSentimentLabel(roomAverageSentiment)
                          )} (${roomAverageSentiment.toFixed(2)})`}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !selectedCategoryRatings || !trimmedComment}
                  className="btn-primary w-full py-3 px-4 flex items-center justify-center"
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-black" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Submitting...
                    </>
                  ) : (
                    'Submit Feedback'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* ── Two-column grid: Rate Now (left) + Your Feedback (right) ── */}
      <div className="flex flex-col gap-6">
        {/* ── Left column: Rate Your Experience ──────────────── */}
        <div className="rounded-2xl border border-white/50 bg-white p-5 shadow-sm ">
          <div className="flex items-center gap-2 mb-4">
            {hasPendingFilter && filteredPendingFeedback.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            )}
            <h2 className="text-base font-bold text-gray-800">Rate Your Experience</h2>
            {hasPendingFilter && filteredPendingFeedback.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {filteredPendingFeedback.length}
              </span>
            )}
          </div>

          {visiblePendingFeedback.length === 0 && showForm ? null : visiblePendingFeedback.length === 0 ? (
            <div className="dashboard-empty-state rounded-2xl p-8 text-center">
              <svg className="w-10 h-10 text-black/25 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-bold text-black/50">All caught up!</p>
              <p className="text-xs text-black/40 mt-0.5">No completed reservations awaiting your feedback.</p>
            </div>
          ) : (
            <>
              <div className="mb-3 space-y-2">
                <input
                  type="search"
                  aria-label="Search pending feedback by room or building"
                  value={pendingRoomSearch}
                  onChange={(event) => setPendingRoomSearch(event.target.value)}
                  placeholder="Search rooms..."
                  className="glass-input w-full rounded-xl px-3 py-2 text-sm"
                />
                <div className={`grid grid-cols-2 gap-2 ${pendingCampusFilter === 'main' ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
                  <RoundedFilterSelect
                    label="Filter pending feedback by campus"
                    value={pendingCampusFilter}
                    onChange={(value) => {
                      const nextCampus = value as 'none' | 'all' | ReservationCampus;
                      setPendingCampusFilter(nextCampus);
                      if (nextCampus !== 'main') setPendingBuildingFilter('none');
                    }}
                    options={[
                      { value: 'none', label: 'Select campus' },
                      { value: 'all', label: 'All campuses' },
                      { value: 'digi', label: 'SDCA Digital Campus' },
                      { value: 'main', label: 'SDCA Main Campus' },
                    ]}
                  />
                  {pendingCampusFilter === 'main' && (
                    <RoundedFilterSelect
                      label="Filter pending feedback by Main Campus building"
                      value={pendingBuildingFilter}
                      onChange={(value) => setPendingBuildingFilter(value as 'none' | 'all' | 'gd1' | 'gd2' | 'gd3')}
                      options={[
                        { value: 'none', label: 'Select building' },
                        { value: 'all', label: 'All buildings' },
                        { value: 'gd1', label: 'GD1' },
                        { value: 'gd2', label: 'GD2' },
                        { value: 'gd3', label: 'GD3' },
                      ]}
                    />
                  )}
                  <RoundedFilterSelect
                    label="Filter pending feedback by floor"
                    value={pendingFloorFilter}
                    onChange={setPendingFloorFilter}
                    options={[
                      { value: 'none', label: 'Select floor' },
                      { value: 'all', label: 'All floors' },
                      ...pendingFloors.map((floor) => ({ value: floor, label: floor })),
                    ]}
                  />
                  <RoundedFilterSelect
                    label="Filter pending feedback by time period"
                    value={pendingDateRange}
                    onChange={(value) => setPendingDateRange(value as PendingDateRange)}
                    options={[
                      { value: 'none', label: 'Select time period' },
                      { value: 'recent', label: 'Recent' },
                      { value: 'week', label: 'Week' },
                      { value: 'month', label: 'Month' },
                      { value: 'year', label: 'Year' },
                      { value: 'all', label: 'All time' },
                    ]}
                  />
                </div>
              </div>
              {!hasPendingFilter ? (
                <div className="dashboard-empty-state rounded-2xl p-6 text-center">
                  <p className="text-sm font-bold text-black/50">Complete the filters to view reservations</p>
                  <p className="text-xs text-black/40 mt-0.5">Select a campus, floor, and time period. For Main Campus, also select a building. Search is optional.</p>
                </div>
              ) : filteredPendingFeedback.length === 0 ? (
                <div className="dashboard-empty-state rounded-2xl p-6 text-center">
                  <p className="text-sm font-bold text-black/50">No matching reservations found</p>
                  <p className="text-xs text-black/40 mt-0.5">Try changing your search or filters.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredPendingFeedback.map((reservation) => (
                    <div
                      key={reservation.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-dark/8 bg-white p-4 transition-shadow hover:shadow-sm"
                    >
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-black truncate">{reservation.roomName}</h4>
                        <p className="text-xs text-black/55 mt-0.5">
                          {reservation.buildingName} · {formatDate(reservation.date)} · {formatTimeRange(reservation.startTime, reservation.endTime)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleOpenFeedback(reservation)}
                        className="btn-primary shrink-0 px-4 py-2 text-xs"
                      >
                        Rate Now
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right column: Your Feedback ────────────────────── */}
        <div className="rounded-2xl border border-white/50 bg-white p-5 shadow-sm ">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-800">
                {selectedFeedbackRoomId ? selectedFeedbackRoom?.roomName || 'Room Feedback' : 'Your Previous Reviews'}
              </h2>
              {selectedFeedbackRoomId === null && hasReviewedFilter && filteredUsedRooms.length > 0 && (
                <span className="inline-flex items-center rounded-full border border-dark/10 bg-dark/5 px-2 py-0.5 text-[10px] font-bold text-black/55">
                  {filteredUsedRooms.length}
                </span>
              )}
              {selectedFeedbackRoomId !== null && selectedRoomFeedback.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-dark/10 bg-dark/5 px-2 py-0.5 text-[10px] font-bold text-black/55">
                  {selectedRoomFeedback.length}
              </span>
              )}
            </div>
            {selectedFeedbackRoomId !== null && (
              <button
                type="button"
                onClick={() => setSelectedFeedbackRoomId(null)}
                className="text-xs font-bold text-primary hover:text-primary-hover"
              >
                ← All rooms
              </button>
            )}
          </div>

          {selectedFeedbackRoomId === null ? (
            usedRooms.length === 0 ? (
              <div className="dashboard-empty-state rounded-2xl p-8 text-center">
                <svg className="w-10 h-10 text-black/25 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0018 0z" />
                </svg>
                <p className="text-sm font-bold text-black/50">No rooms used yet</p>
                <p className="text-xs text-black/40 mt-0.5">Rooms you have completed reservations for will appear here.</p>
              </div>
            ) : (
              <>
                <div className="mb-3 space-y-2">
                  <input
                    type="search"
                    aria-label="Search previous reviews by room or building"
                    value={roomSearch}
                    onChange={(event) => setRoomSearch(event.target.value)}
                    placeholder="Search rooms..."
                    className="glass-input w-full rounded-xl px-3 py-2 text-sm"
                  />
                  <div className={`grid grid-cols-2 gap-2 ${campusFilter === 'main' ? 'sm:grid-cols-3' : ''}`}>
                  <div>
                    <RoundedFilterSelect
                      label="Filter previous reviews by campus"
                      value={campusFilter}
                      onChange={(value) => {
                        const nextCampus = value as 'none' | 'all' | ReservationCampus;
                        setCampusFilter(nextCampus);
                        if (nextCampus !== 'main') setBuildingFilter('all');
                      }}
                      options={[
                        { value: 'none', label: 'Select campus' },
                        { value: 'all', label: 'All campuses' },
                        { value: 'digi', label: 'SDCA Digital Campus' },
                        { value: 'main', label: 'SDCA Main Campus' },
                      ]}
                    />
                  </div>
                  {campusFilter === 'main' && (
                    <div>
                      <RoundedFilterSelect
                        label="Filter previous reviews by Main Campus building"
                        value={buildingFilter}
                        onChange={(value) => setBuildingFilter(value as 'all' | 'gd1' | 'gd2' | 'gd3')}
                        options={[
                          { value: 'all', label: 'All buildings' },
                          { value: 'gd1', label: 'GD1' },
                          { value: 'gd2', label: 'GD2' },
                          { value: 'gd3', label: 'GD3' },
                        ]}
                      />
                    </div>
                  )}
                  <div>
                    <RoundedFilterSelect
                      label="Filter previous reviews by floor"
                      value={floorFilter}
                      onChange={setFloorFilter}
                      options={[
                        { value: 'none', label: 'Select floor' },
                        { value: 'all', label: 'All floors' },
                        ...availableFloors.map((floor) => ({ value: floor, label: floor })),
                      ]}
                    />
                  </div>
                  </div>
                </div>
                {!hasReviewedFilter ? (
                  <div className="dashboard-empty-state rounded-2xl p-6 text-center">
                    <p className="text-sm font-bold text-black/50">Choose a filter to view your reviews</p>
                    <p className="text-xs text-black/40 mt-0.5">Select a campus or floor, or search for a room or building.</p>
                  </div>
                ) : filteredUsedRooms.length === 0 ? (
                  <div className="dashboard-empty-state rounded-2xl p-6 text-center">
                    <p className="text-sm font-bold text-black/50">No matching reviews found</p>
                    <p className="text-xs text-black/40 mt-0.5">Only rooms with submitted reviews appear here. Try changing your search or filters.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredUsedRooms.map((room) => (
                      <button
                        key={room.roomId}
                        type="button"
                        onClick={() => setSelectedFeedbackRoomId(room.roomId)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-dark/8 bg-white p-4 text-left transition-shadow hover:shadow-sm"
                      >
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-black truncate">{room.roomName}</h4>
                          <p className="text-xs text-black/55 mt-0.5">{room.buildingName}</p>
                        </div>
                        <span className="shrink-0 rounded-full border border-dark/10 bg-dark/3 px-2.5 py-1 text-[10px] font-bold text-black/60">
                          {room.feedbackCount} review{room.feedbackCount === 1 ? '' : 's'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )
          ) : selectedRoomFeedback.length === 0 ? (
            <div className="dashboard-empty-state rounded-2xl p-8 text-center">
              <svg className="w-10 h-10 text-black/25 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              <p className="text-sm font-bold text-black/50">No feedback for this room yet</p>
              <p className="text-xs text-black/40 mt-0.5">Feedback you submit for this room will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedRoomFeedback.map((feedback) => {
                const storedSentimentLabel =
                  feedback.sentimentLabel ??
                  (typeof feedback.compoundScore === 'number'
                    ? getSentimentLabel(feedback.compoundScore)
                    : null);
                const positiveAspects = getAspectEntries(feedback.detectedAspects, 'positive');
                const negativeAspects = getAspectEntries(feedback.detectedAspects, 'negative');
                const categoryEntries = FEEDBACK_CATEGORY_KEYS.filter(
                  (key) => typeof feedback.categoryRatings[key] === 'number'
                );

                return (
                  <div
                    key={feedback.id}
                    className="rounded-xl border border-dark/8 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-black truncate">{feedback.roomName}</h4>
                        <p className="text-xs text-black/55 mt-0.5">
                          {feedback.buildingName}
                          {feedback.createdAt ? ` | ${formatDateTime(feedback.createdAt)}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0">{renderStars(feedback.rating)}</div>
                    </div>

                    {storedSentimentLabel && typeof feedback.compoundScore === 'number' && (
                      <span
                        className={`mb-2.5 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${getSentimentBadgeClasses(
                          storedSentimentLabel
                        )}`}
                      >
                        {formatSentimentLabel(storedSentimentLabel)} ({feedback.compoundScore.toFixed(2)})
                      </span>
                    )}

                    <p className="text-sm text-black/80 leading-relaxed">{feedback.message}</p>

                    {categoryEntries.length > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {categoryEntries.map((key) => (
                          <div key={key} className="flex items-center justify-between rounded-lg border border-dark/8 bg-dark/3 px-2.5 py-2">
                            <span className="text-[10px] font-bold text-black/55">
                              {FEEDBACK_CATEGORY_LABELS[key]}
                            </span>
                            <span className="text-[10px] font-bold text-black">
                              {feedback.categoryRatings[key]}/5
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {(positiveAspects.length > 0 || negativeAspects.length > 0) && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-green-700">
                            Positive Aspects
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {positiveAspects.length > 0 ? (
                              positiveAspects.map((aspect) => (
                                <span key={aspect} className="rounded-full border border-green-500/25 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-700">
                                  {FEEDBACK_ASPECT_LABELS[aspect]}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-black/40">None</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-red-700">
                            Negative Aspects
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {negativeAspects.length > 0 ? (
                              negativeAspects.map((aspect) => (
                                <span key={aspect} className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                  {FEEDBACK_ASPECT_LABELS[aspect]}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-black/40">None</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {feedback.extractedKeywords.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {feedback.extractedKeywords.slice(0, 8).map((keyword) => (
                          <span key={keyword} className="rounded-full border border-dark/10 bg-dark/3 px-2 py-0.5 text-[10px] font-bold text-black/55">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    )}

                    {feedback.adminResponse && (
                      <div className="mt-3 rounded-xl border border-dark/10 bg-dark/3 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Admin Response</p>
                        <p className="text-sm text-black">{feedback.adminResponse}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
