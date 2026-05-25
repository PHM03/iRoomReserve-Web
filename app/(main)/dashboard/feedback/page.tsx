'use client';

import { type SubmitEvent, useDeferredValue, useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { Feedback, createFeedback, getAverageSentiment, getFeedbackByUser } from '@/lib/feedback/feedback';
import { Reservation, getReservationsByUser } from '@/lib/reservations/reservations';
import { analyzeFeedbackSentiment, getSentimentLabel } from '@/lib/ai/sentiment';
import { formatDate, formatTimeRange } from '@/lib/utils/dateTime';

function formatSentimentLabel(label: string) {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getSentimentBadgeClasses(label: string) {
  if (label === 'conflicted') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700';
  }

  if (label === 'positive') {
    return 'border-green-500/25 bg-green-500/10 text-green-700';
  }

  if (label === 'negative') {
    return 'border-red-500/25 bg-red-500/10 text-red-700';
  }

  return 'border-slate-500/25 bg-slate-500/10 text-slate-700';
}

export default function FeedbackPage() {
  const { firebaseUser, profile } = useAuth();

  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [roomAverageSentiment, setRoomAverageSentiment] = useState<number | null>(null);
  const [loadingRoomAverage, setLoadingRoomAverage] = useState(false);

  const deferredComment = useDeferredValue(comment);
  const trimmedComment = comment.trim();
  const sentimentPreview = analyzeFeedbackSentiment(deferredComment, rating);
  const sentimentPreviewLabel = sentimentPreview.sentimentLabel;
  const hasSentimentPreview = rating > 0 || Boolean(trimmedComment);

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

        if (!cancelled) {
          setFeedbackList(nextFeedback);
          setReservations(nextReservations);
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

  const handleCloseFeedback = () => {
    setShowForm(false);
    setSelectedReservation(null);
    setRating(0);
    setHoverRating(0);
    setComment('');
    setSubmitSuccess(false);
    setRoomAverageSentiment(null);
    setLoadingRoomAverage(false);
  };

  const handleOpenFeedback = (reservation: Reservation) => {
    setSelectedReservation(reservation);
    setShowForm(true);
    setRating(0);
    setHoverRating(0);
    setComment('');
    setSubmitSuccess(false);
    setRoomAverageSentiment(null);
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!firebaseUser || !selectedReservation || rating === 0 || !trimmedComment) {
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
        message: trimmedComment,
        rating,
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

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10 pb-24 md:pb-8">
      {/* ── Unified page header ─────────────────────────────── */}
      <div className="mb-8">
        <div className="rounded-2xl border border-white/35 bg-white/75 px-6 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.17)] backdrop-blur-xl">
          <h1 className="text-2xl font-bold text-gray-800">Feedback</h1>
          <p className="text-gray-600 mt-1">Rate your experience and help us improve</p>
        </div>
      </div>

      {/* ── Feedback form overlay ────────────────────────────── */}
      {showForm && selectedReservation && (
        <div className="rounded-2xl border border-white/50 bg-white/90 p-6 shadow-sm backdrop-blur mb-8">
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

                <div>
                  <label className="block text-sm font-bold text-black mb-3">Rating</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="transition-transform hover:scale-110"
                      >
                        <svg
                          className={`w-8 h-8 ${
                            star <= (hoverRating || rating) ? 'ui-text-yellow' : 'text-black'
                          } transition-colors`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                  {rating > 0 && (
                    <p className="text-xs text-black mt-1">
                      {rating === 1
                        ? 'Poor'
                        : rating === 2
                          ? 'Fair'
                          : rating === 3
                            ? 'Good'
                            : rating === 4
                              ? 'Very Good'
                              : 'Excellent'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-black mb-1.5">Comments</label>
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    className="glass-input w-full px-4 py-3 min-h-[120px] resize-none"
                    placeholder="Share your experience with this room..."
                  />
                </div>

                <div className="rounded-xl border border-dark/10 bg-dark/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-black">
                        Sentiment Preview
                      </p>
                      <p className="text-sm text-black mt-1">
                        {hasSentimentPreview
                          ? `${formatSentimentLabel(sentimentPreviewLabel)} (${sentimentPreview.compound.toFixed(2)})`
                          : 'Select a rating and start typing to preview the tone of your feedback.'}
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

                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-black sm:grid-cols-5">
                    <div>
                      <p className="font-bold">Hybrid</p>
                      <p>{sentimentPreview.compound.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="font-bold">Stars</p>
                      <p>{sentimentPreview.starScore.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="font-bold">VADER</p>
                      <p>{sentimentPreview.vaderCompound.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="font-bold">Positive</p>
                      <p>{Math.round(sentimentPreview.positive * 100)}%</p>
                    </div>
                    <div>
                      <p className="font-bold">Negative</p>
                      <p>{Math.round(sentimentPreview.negative * 100)}%</p>
                    </div>
                  </div>

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
                  disabled={submitting || rating === 0 || !trimmedComment}
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
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Left column: Rate Your Experience ──────────────── */}
        <div className="rounded-2xl border border-white/50 bg-white/90 p-5 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2 mb-4">
            {pendingFeedback.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            )}
            <h2 className="text-base font-bold text-gray-800">Rate Your Experience</h2>
            {pendingFeedback.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {pendingFeedback.length}
              </span>
            )}
          </div>

          {pendingFeedback.length === 0 ? (
            <div className="dashboard-empty-state rounded-2xl p-8 text-center">
              <svg className="w-10 h-10 text-black/25 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-bold text-black/50">All caught up!</p>
              <p className="text-xs text-black/40 mt-0.5">No completed reservations awaiting your feedback.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {pendingFeedback.map((reservation) => (
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
        </div>

        {/* ── Right column: Your Feedback ────────────────────── */}
        <div className="rounded-2xl border border-white/50 bg-white/90 p-5 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-bold text-gray-800">Your Feedback</h2>
            {feedbackList.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-dark/10 bg-dark/5 px-2 py-0.5 text-[10px] font-bold text-black/55">
                {feedbackList.length}
              </span>
            )}
          </div>

          {feedbackList.length === 0 ? (
            <div className="dashboard-empty-state rounded-2xl p-8 text-center">
              <svg className="w-10 h-10 text-black/25 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              <p className="text-sm font-bold text-black/50">No feedback yet</p>
              <p className="text-xs text-black/40 mt-0.5">Your submitted feedback will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {feedbackList.map((feedback) => {
                const storedSentimentLabel =
                  feedback.sentimentLabel ??
                  (typeof feedback.compoundScore === 'number'
                    ? getSentimentLabel(feedback.compoundScore)
                    : null);

                return (
                  <div
                    key={feedback.id}
                    className="rounded-xl border border-dark/8 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-black truncate">{feedback.roomName}</h4>
                        <p className="text-xs text-black/55 mt-0.5">{feedback.buildingName}</p>
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
