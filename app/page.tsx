'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTab, setSelectedTab] = useState('student');
  const router = useRouter();

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
        return 'bg-red-100 text-red-800';
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
      router.push('/dashboard');
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header with logo */}
      <div className="bg-red-800 text-white p-4">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold">iRoomReserve</h1>
          <p className="text-sm opacity-90">St. Dominic College of Asia</p>
        </div>
      </div>

      {/* Login card */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4 text-center">Sign In</h2>

          {/* Role Tabs */}
          <div className="flex mb-6 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setSelectedTab('student')}
              className={`flex-1 py-2 px-4 text-center font-medium text-sm transition-colors ${
                selectedTab === 'student'
                  ? 'text-red-800 border-b-2 border-red-800'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Student
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('faculty')}
              className={`flex-1 py-2 px-4 text-center font-medium text-sm transition-colors ${
                selectedTab === 'faculty'
                  ? 'text-red-800 border-b-2 border-red-800'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Faculty
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('admin')}
              className={`flex-1 py-2 px-4 text-center font-medium text-sm transition-colors ${
                selectedTab === 'admin'
                  ? 'text-red-800 border-b-2 border-red-800'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Admin
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-black"
                placeholder="Enter your email"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(role)}`}>
                {role}
              </span>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-black"
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            <div className="flex justify-end">
              <a href="#" className="text-sm text-red-600 hover:text-red-800">
                Forgot Password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center py-2 px-4 bg-red-800 text-white font-medium rounded-md hover:bg-red-900 transition-colors disabled:opacity-50"
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
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 py-4">
        <div className="max-w-md mx-auto text-center text-xs text-gray-500">
          iRoomReserve v1.0 — SDCA Capstone Project
        </div>
      </div>
    </div>
  );
}
