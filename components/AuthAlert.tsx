'use client';

import React from 'react';

type AuthAlertTone = 'error' | 'warning';

interface AuthAlertProps {
  message: React.ReactNode;
  tone?: AuthAlertTone;
  className?: string;
}

type AuthAlertToneStyle = {
  container: string;
  icon: string;
};

const alertToneStyles: Record<AuthAlertTone, AuthAlertToneStyle> = {
  error: {
    container:
      'border-red-300 bg-red-50/95 text-[#343434] shadow-[0_10px_25px_rgba(127,29,29,0.08)]',
    icon: 'text-red-700',
  },
  warning: {
    container:
      'border-amber-400 bg-amber-100/95 text-[#343434] shadow-[0_10px_25px_rgba(146,64,14,0.08)]',
    icon: 'text-amber-700',
  },
};

const alertToneIcons: Record<AuthAlertTone, React.ReactNode> = {
  error: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v4m0 4h.01M10.29 3.86l-7.5 13A1 1 0 003.66 18h16.68a1 1 0 00.87-1.5l-7.5-13a1 1 0 00-1.74 0z"
      />
    </svg>
  ),
  warning: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4m0 4h.01M10.29 3.86l-7.5 13A1 1 0 003.66 18h16.68a1 1 0 00.87-1.5l-7.5-13a1 1 0 00-1.74 0z"
      />
    </svg>
  ),
};

export default function AuthAlert({
  message,
  tone = 'error',
  className = '',
}: AuthAlertProps) {
  const toneStyle = alertToneStyles[tone];
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${toneStyle.container} ${className}`.trim()}
    >
      <span className={`mt-0.5 shrink-0 ${toneStyle.icon}`}>
        {alertToneIcons[tone]}
      </span>
      <div className="min-w-0">{message}</div>
    </div>
  );
}
