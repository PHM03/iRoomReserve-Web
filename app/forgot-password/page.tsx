'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { resetPassword, getAuthErrorMessage } from '@/lib/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event: React.SubmitEvent) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccess(false);

    if (!email) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setLoading(true);

    try {
      await resetPassword(email);
      setSuccess(true);
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };
      setErrorMessage(getAuthErrorMessage(firebaseError.code || ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Decorative background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-secondary/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      {/* Header */}
      <div className="glass-nav py-4 px-4 relative z-10">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold text-black">iRoomReserve</h1>
          <p className="text-sm text-black">St. Dominic College of Asia</p>
        </div>
      </div>

      {/* Forgot Password Card */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
        <div className="glass-card p-8 w-full max-w-md">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-black mb-2 text-center">
            Reset Password
          </h2>
          <p className="text-sm text-black text-center mb-6">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>

          {/* Success State */}
          {success ? (
            <div className="text-center">
              <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-300 text-sm">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 mx-auto mb-2 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="font-bold">Reset link sent!</p>
                <p className="mt-1 text-black">
                  Check your email inbox for a password reset link. If you don&apos;t see it, check your spam folder.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="btn-primary w-full py-3 px-4 mt-2"
              >
                Back to Login
              </button>
            </div>
          ) : (
            <>
              {/* Error */}
              {errorMessage && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="reset-email"
                    className="block text-sm font-bold text-black mb-1.5"
                  >
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="reset-email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="glass-input w-full px-4 py-3"
                    placeholder="Please enter your email"
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center py-3 px-4"
                >
                  {loading ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-black"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>

              {/* Back to Login */}
              <p className="mt-5 text-center text-sm text-black">
                Remember your password?{' '}
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="font-bold text-primary hover:text-primary-hover transition-colors"
                >
                  Back to Login
                </button>
              </p>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="glass-nav py-4 relative z-10">
        <div className="max-w-md mx-auto text-center text-xs text-black font-bold">
          iRoomReserve v1.0 — SDCA Capstone Project
        </div>
      </div>
    </div>
  );
}
