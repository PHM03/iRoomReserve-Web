'use client';

import React, { useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthAlert from '@/components/AuthAlert';
import Toast from '@/components/Toast';
import { loginWithEmail, loginWithGoogle, saveUserProfile, getAuthErrorMessage, resendVerificationEmail, getUserProfile, logout } from '@/lib/auth';

function LoginForm() {
  const searchParams = useSearchParams();
  const isPending = searchParams.get('pending') === 'true';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('Login successful!');
  const [showResendButton, setShowResendButton] = useState(false);
  const router = useRouter();

  const handleToastClose = useCallback(() => setShowToast(false), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email || !password) {
      setErrorMessage('Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      const credential = await loginWithEmail(email, password);
      const userProfile = await getUserProfile(credential.user.uid);

      if (userProfile?.role !== 'Super Admin') {
        const existingRole = userProfile?.role;
        if (existingRole) {
          await saveUserProfile(credential.user.uid, {
            firstName: credential.user.displayName?.split(' ')[0] || '',
            lastName: credential.user.displayName?.split(' ').slice(1).join(' ') || '',
            email: credential.user.email || '',
            role: existingRole,
            status: userProfile?.status || (existingRole === 'Student' ? 'approved' : 'pending'),
          });
        }
      }
      setToastMessage('Login successful!');
      setShowToast(true);
      setTimeout(() => {
        if (userProfile?.role === 'Super Admin') {
          router.push('/superadmin/dashboard');
        } else {
          router.push('/dashboard');
        }
      }, 1500);
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      const code = firebaseError.code || '';
      setErrorMessage(getAuthErrorMessage(code));
      setShowResendButton(code === 'auth/email-not-verified');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    try {
      const result = await loginWithGoogle();
      const userProfile = await getUserProfile(result.user.uid);

      if (!userProfile?.role) {
        router.push('/role-selection');
        return;
      }

      if (userProfile.status === 'pending') {
        await logout();
        router.push('/?pending=true');
        return;
      }

      if (userProfile.status === 'rejected') {
        await logout();
        setErrorMessage(getAuthErrorMessage('auth/account-rejected'));
        return;
      }

      setToastMessage('Login successful!');
      setShowToast(true);
      setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };
      const code = firebaseError.code || '';
      if (code === 'auth/account-pending') {
        router.push('/?pending=true');
        return;
      }
      setErrorMessage(getAuthErrorMessage(code));
    }
  };

  const handleResendVerification = async () => {
    try {
      await resendVerificationEmail(email, password);
      setShowResendButton(false);
      setErrorMessage('');
      setToastMessage('Verification email resent! Check your inbox or spam folder.');
      setShowToast(true);
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      setErrorMessage(getAuthErrorMessage(firebaseError.code || ''));
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-[#343434]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-[#343434] via-[#625f5f] to-[#a12124]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_top_left,rgba(161,33,36,0.35),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(52,52,52,0.45),transparent_60%)]"
      />

      <Toast message={toastMessage} type="success" show={showToast} onClose={handleToastClose} />

      {/* Header */}
      <div className="glass-nav py-4 px-4 relative z-10">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold text-black">iRoomReserve</h1>
          <p className="text-sm text-black">St. Dominic College of Asia</p>
        </div>
      </div>

      {/* Login card */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
        <div className="glass-card p-8 w-full max-w-md">
          <h2 className="text-2xl font-bold text-black mb-6 text-center">Sign In</h2>

          {errorMessage ? (
            <AuthAlert
              message={
                <>
                  <p>{errorMessage}</p>
                  {showResendButton ? (
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      className="mt-2 inline-flex text-sm font-bold text-red-800 underline decoration-red-300 underline-offset-4 transition-colors hover:text-red-950"
                    >
                      Resend verification email
                    </button>
                  ) : null}
                </>
              }
            />
          ) : null}

          {isPending ? (
            <AuthAlert
              tone="warning"
              message="Your account is pending Super Admin approval. You will be notified once approved."
            />
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-bold text-black mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                suppressHydrationWarning
                className="glass-input w-full px-4 py-3"
                placeholder="Enter your email"
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-bold text-black mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  suppressHydrationWarning
                  className="glass-input w-full px-4 py-3 pr-12"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  suppressHydrationWarning
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-black hover:text-primary transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.72 11.72 0 013.168-4.477M6.343 6.343A9.97 9.97 0 0112 5c5 0 9.27 3.11 11 7.5a11.72 11.72 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.829 2.829m4.243 4.243L17.657 17.657M17.657 17.657L21 21m-3.343-3.343l-2.829-2.829a3 3 0 00-4.243-4.243" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => router.push('/forgot-password')}
                suppressHydrationWarning
                className="text-sm text-black hover:text-primary transition-colors font-bold"
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              suppressHydrationWarning
              className="btn-primary w-full flex items-center justify-center py-3 px-4"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center my-6">
            <div className="flex-1 border-t border-dark/10" />
            <span className="px-3 text-sm text-black">or</span>
            <div className="flex-1 border-t border-dark/10" />
          </div>

          {/* Google Sign-In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            suppressHydrationWarning
            className="glass-card w-full flex items-center justify-center gap-3 py-3 px-4 font-bold text-black hover:text-primary cursor-pointer !border-dark/15"
          >
            <svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Continue with Google
          </button>

          {/* Register link */}
          <p className="mt-5 text-center text-sm text-black">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => router.push(`/register`)}
              suppressHydrationWarning
              className="font-bold text-primary hover:text-primary-hover transition-colors"
            >
              Register
            </button>
          </p>
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-black">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
