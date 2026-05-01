'use client';

import { useDeferredValue, useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { Feedback, createFeedback, getAverageSentiment, getFeedbackByUser } from '@/lib/feedback';
import { Reservation, getReservationsByUser } from '@/lib/reservations';
import { analyzeSentiment, getSentimentLabel } from '@/lib/sentiment';

function formatSentimentLabel(label: string) {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getSentimentBadgeClasses(label: string) {
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
  const sentimentPreview = analyzeSentiment(deferredComment);
  const sentimentPreviewLabel = getSentimentLabel(sentimentPreview.compound);

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

  const handleSubmit = async () => {
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
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-[100px] py-8 relative z-10 pb-24 md:pb-8">
      <div className="mb-8">
        <div className="backdrop-blur-md bg-white/40 rounded-xl px-6 py-4 border border-white/30 inline-block">
          <h2 className="text-2xl font-bold text-gray-800">Feedback</h2>
          <p className="text-gray-600 mt-1">Rate your experience and help us improve</p>
        </div>
      </div>

      {pendingFeedback.length > 0 && !showForm && (
        <div className="mb-8">
          <div className="backdrop-blur-md bg-white/40 rounded-xl px-6 py-4 border border-white/30 inline-block mb-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              Rate Your Experience
            </h3>
          </div>
          <div className="space-y-3">
            {pendingFeedback.map((reservation) => (
              <div
                key={reservation.id}
                className="glass-card p-4 !rounded-xl flex items-center justify-between"
              >
                <div>
                  <h4 className="text-sm font-bold text-black">{reservation.roomName}</h4>
                  <p className="text-xs text-black">
                    {reservation.buildingName} | {reservation.date} | {reservation.startTime} -{' '}
                    {reservation.endTime}
                  </p>
                </div>
                <button
                  onClick={() => handleOpenFeedback(reservation)}
                  className="btn-primary px-4 py-2 text-xs"
                >
                  Rate Now
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && selectedReservation && (
        <div className="glass-card p-6 !rounded-2xl mb-8">
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
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-black">Rate Your Experience</h3>
                  <p className="text-xs text-black mt-0.5">
                    {selectedReservation.roomName} | {selectedReservation.buildingName} |{' '}
                    {selectedReservation.date}
                  </p>
                </div>
                <button
                  onClick={handleCloseFeedback}
                  className="p-2 rounded-lg text-black hover:text-primary hover:bg-primary/10 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-black mb-3">Rating</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
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
                        {trimmedComment
                          ? `${formatSentimentLabel(sentimentPreviewLabel)} (${sentimentPreview.compound.toFixed(2)})`
                          : 'Start typing to preview the tone of your feedback.'}
                      </p>
                    </div>
                    {trimmedComment && (
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
                      <p>{sentimentPreview.compound.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="font-bold">Positive</p>
                      <p>{Math.round(sentimentPreview.positive * 100)}%</p>
                    </div>
                    <div>
                      <p className="font-bold">Neutral</p>
                      <p>{Math.round(sentimentPreview.neutral * 100)}%</p>
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
                  onClick={handleSubmit}
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
              </div>
            </>
          )}
        </div>
      )}

      <div className="backdrop-blur-md bg-white/40 rounded-xl px-6 py-4 border border-white/30 inline-block mb-4">
        <h3 className="text-xl font-bold text-gray-800">Your Feedback</h3>
      </div>
      <div className="space-y-4">
        {feedbackList.length === 0 ? (
          <div className="glass-card p-12 !rounded-xl text-center">
            <svg className="w-14 h-14 text-black mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            <p className="text-sm text-black font-bold">No feedback yet</p>
            <p className="text-xs text-black mt-1">Your submitted feedback will appear here</p>
          </div>
        ) : (
          feedbackList.map((feedback) => {
            const storedSentimentLabel =
              feedback.sentimentLabel ??
              (typeof feedback.compoundScore === 'number'
                ? getSentimentLabel(feedback.compoundScore)
                : null);

            return (
              <div key={feedback.id} className="glass-card p-5 !rounded-xl">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-bold text-black">{feedback.roomName}</h4>
                    <p className="text-xs text-black">{feedback.buildingName}</p>
                    {storedSentimentLabel && typeof feedback.compoundScore === 'number' && (
                      <span
                        className={`mt-2 inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${getSentimentBadgeClasses(
                          storedSentimentLabel
                        )}`}
                      >
                        {formatSentimentLabel(storedSentimentLabel)} ({feedback.compoundScore.toFixed(2)})
                      </span>
                    )}
                  </div>
                  <div className="flex">{renderStars(feedback.rating)}</div>
                </div>
                <p className="text-sm text-black mb-3">{feedback.message}</p>
                {feedback.adminResponse && (
                  <div className="bg-dark/5 rounded-xl p-3 border border-dark/10">
                    <p className="text-xs font-bold text-primary mb-1">Admin Response</p>
                    <p className="text-sm text-black">{feedback.adminResponse}</p>
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
