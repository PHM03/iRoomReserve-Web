'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Toast from '@/components/Toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTab, setSelectedTab] = useState('student');
  const [showToast, setShowToast] = useState(false);
  const router = useRouter();

  const handleToastClose = useCallback(() => setShowToast(false), []);

  const getRoleFromTab = (tab: string) => {
    switch (tab) {
      case 'student':
        return 'Student';
      case 'faculty':
        return 'Faculty';
      case 'admin':
        return 'Administrator';
      default:
        return 'Student';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'Student':
        return 'bg-blue-100 text-blue-800';
      case 'Faculty':
        return 'bg-green-100 text-green-800';
      case 'Administrator':
        return 'bg-red-100 text-primary';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const role = getRoleFromTab(selectedTab);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);

    // Simulate login process
    setTimeout(() => {
      setLoading(false);
      setShowToast(true);
      // Redirect after toast is visible
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    }, 1000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Toast message="Login successful!" type="success" show={showToast} onClose={handleToastClose} />
      {/* Header with logo */}
      <div className="bg-primary text-white p-4">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold">iRoomReserve</h1>
          <p className="text-sm opacity-90">St. Dominic College of Asia</p>
        </div>
      </div>

      {/* Login card */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
          <h2 className="text-2xl font-semibold text-dark mb-4 text-center">Sign In</h2>

          {/* Role Tabs */}
          <div className="flex mb-6 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setSelectedTab('student')}
              className={`flex-1 py-2 px-4 text-center font-medium text-sm transition-colors ${selectedTab === 'student'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-secondary hover:text-dark'
                }`}
            >
              Student
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('faculty')}
              className={`flex-1 py-2 px-4 text-center font-medium text-sm transition-colors ${selectedTab === 'faculty'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-secondary hover:text-dark'
                }`}
            >
              Faculty
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('admin')}
              className={`flex-1 py-2 px-4 text-center font-medium text-sm transition-colors ${selectedTab === 'admin'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-secondary hover:text-dark'
                }`}
            >
              Admin
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-primary text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-dark mb-1">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-black"
                placeholder="Enter your email"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Role
              </label>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(role)}`}>
                {role}
              </span>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-dark mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-black"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-secondary hover:text-dark transition-colors"
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
              <a href="#" className="text-sm text-primary hover:text-primary-hover">
                Forgot Password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center py-2 px-4 bg-primary text-white font-medium rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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


          <div className="flex items-center my-5">
            <div className="flex-1 border-t border-gray-300"></div>
            <span className="px-3 text-sm text-secondary">or</span>
            <div className="flex-1 border-t border-gray-300"></div>
          </div>


          <button
            type="button"
            onClick={() => {

              console.log('Continue with Google clicked');
            }}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white border border-gray-300 rounded-md font-medium text-dark hover:bg-gray-50 hover:shadow-sm transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Continue with Google
          </button>


          <p className="mt-5 text-center text-sm text-secondary">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => {

                router.push('/register');
              }}
              className="font-semibold text-primary hover:text-primary-hover transition-colors"
            >
              Register
            </button>
          </p>
        </div>
      </div>


      <div className="bg-gray-50 py-4">
        <div className="max-w-md mx-auto text-center text-xs text-secondary">
          iRoomReserve v1.0 — SDCA Capstone Project
        </div>
      </div>
    </div>
  );
}
