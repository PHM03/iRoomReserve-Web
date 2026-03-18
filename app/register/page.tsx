'use client';

import React, { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Toast from '@/components/Toast';
import { registerWithEmail, getAuthErrorMessage } from '@/lib/auth';
import { Suspense } from 'react';

function RegisterForm() {
  const searchParams = useSearchParams();
  const roleParam = searchParams.get('role') || 'student';

  const getRoleDisplayName = (tab: string) => {
    switch (tab) {
      case 'faculty': return 'Faculty';
      case 'utility_staff': return 'Utility Staff';
      case 'admin': return 'Administrator';
      default: return 'Student';
    }
  };

  const role = getRoleDisplayName(roleParam);
  const isFacultyFlow = roleParam === 'faculty' || roleParam === 'utility_staff';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [determinedRole, setDeterminedRole] = useState(role);
  const router = useRouter();

  const handleToastClose = useCallback(() => setShowToast(false), []);

  const validatePassword = (pw: string): string | null => {
    if (pw.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(pw)) return 'Password must include at least one uppercase letter';
    if (!/[0-9]/.test(pw)) return 'Password must include at least one number';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      setErrorMessage('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    const pwError = validatePassword(password);
    if (pwError) {
      setErrorMessage(pwError);
      return;
    }

    setLoading(true);

    try {
      const result = await registerWithEmail(email, password, firstName, lastName, role);
      const determinedRole = result.actualRole;
      setShowToast(true);
      // Store determined role for toast message
      setDeterminedRole(determinedRole);
      setTimeout(() => {
        router.push('/');
      }, determinedRole === 'Student' ? 1500 : 3000);
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      setErrorMessage(getAuthErrorMessage(firebaseError.code || ''));
    } finally {
      setLoading(false);
    }
  };

  const EyeIcon = ({ open }: { open: boolean }) => open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.72 11.72 0 013.168-4.477M6.343 6.343A9.97 9.97 0 0112 5c5 0 9.27 3.11 11 7.5a11.72 11.72 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.829 2.829m4.243 4.243L17.657 17.657M17.657 17.657L21 21m-3.343-3.343l-2.829-2.829a3 3 0 00-4.243-4.243" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <Toast
        message={
          determinedRole === 'Student'
            ? 'Account created! Please check your email to verify before signing in.'
            : determinedRole === 'Utility'
              ? 'Account created as Utility! Your registration is pending Super Admin approval.'
              : determinedRole === 'Faculty Professor'
                ? 'Account created as Faculty Professor! Your registration is pending Super Admin approval.'
                : 'Account created! Your registration is pending Super Admin approval.'
        }
        type="success"
        show={showToast}
        onClose={handleToastClose}
      />

      {/* Decorative background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-secondary/10 blur-3xl" />
      </div>

      {/* Header */}
      <div className="glass-nav py-4 px-4 relative z-10">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold text-white">iRoomReserve</h1>
          <p className="text-sm text-white/60">St. Dominic College of Asia</p>
        </div>
      </div>

      {/* Register card */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
        <div className="glass-card p-8 w-full max-w-md">
          <h2 className="text-2xl font-bold text-white mb-2 text-center">Create Account</h2>
          <p className="text-sm text-white/50 text-center mb-4">Fill in your details to get started</p>

          {/* Role badge */}
          <div className="flex justify-center mb-4">
            <span className="glass-badge inline-flex items-center px-4 py-1.5 rounded-full text-sm font-bold text-white/80">
              Registering as: {role}
            </span>
          </div>

          {errorMessage && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-sm font-bold text-white/70 mb-1.5">
                  First Name
                </label>
                <input
                  type="text"
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="glass-input w-full px-4 py-3"
                  placeholder="First name"
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-bold text-white/70 mb-1.5">
                  Last Name
                </label>
                <input
                  type="text"
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="glass-input w-full px-4 py-3"
                  placeholder="Last name"
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div>
              <label htmlFor="registerEmail" className="block text-sm font-bold text-white/70 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                id="registerEmail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="glass-input w-full px-4 py-3"
                placeholder="Enter your email"
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="registerPassword" className="block text-sm font-bold text-white/70 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="registerPassword"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input w-full px-4 py-3 pr-12"
                  placeholder="Create a password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-white/40 hover:text-primary transition-colors"
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
              <p className="mt-1.5 text-xs text-white/30">(Min 8 chars, 1 uppercase, 1 number)</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-bold text-white/70 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="glass-input w-full px-4 py-3 pr-12"
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-white/40 hover:text-primary transition-colors"
                >
                  <EyeIcon open={showConfirmPassword} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center py-3 px-4"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating account...
                </>
              ) : (
                'Register'
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-white/40">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => router.push('/')}
              className="font-bold text-primary hover:text-primary-hover transition-colors"
            >
              Sign In
            </button>
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="glass-nav py-4 relative z-10">
        <div className="max-w-md mx-auto text-center text-xs text-white/30 font-bold">
          iRoomReserve v1.0 — SDCA Capstone Project
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white/50">Loading...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
